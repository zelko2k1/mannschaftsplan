// Zugriff auf /admin/api. Bewusst getrennt von api.ts — die beiden Bereiche teilen sich weder
// Cookie noch Prüflogik (R5), und das soll man auch im Frontend sehen.

export type AdminSpieltag = {
  id: string
  team: string
  date: string
  opponent_club: string
  opponent_town: string
  is_home: boolean
  venue: string
  km: number
  meeting_point: string
  /** Von Hand eingetragene Abfahrt. Leer = die Formel rechnet (6.3). */
  departure_manual: string
  /** Nur für diesen Spieltag. -1 = die zentrale Einstellung gilt. */
  tempo_kmh: number
  /** Nur für diesen Spieltag. -1 = der Wert der Mannschaft gilt. */
  puffer_minuten: number
  /** Was tatsächlich gilt — nur zur Anzeige, wird nicht zurückgeschickt. */
  tempo_effektiv: number
  puffer_effektiv: number
  /** Was die Formel ergäbe — nur zur Anzeige, wird nicht zurückgeschickt. */
  departure_berechnet: string | null
  needed_players: number
  locked: boolean
}

export type AdminMitglied = {
  id: string
  team: string
  name: string
  active: boolean
  sort: number
  note: string
  /** Nur ob überhaupt eins ausgestellt wurde — der Hash verlässt den Server nie (R1). */
  hat_token: boolean
  token_issued_at: string
  geraete: number
}

/**
 * Zentrale Einstellungen — sie gelten für alle Mannschaften und gehören dem Gesamt-Admin.
 * Was einer einzelnen Mannschaft gehört, steht in `Mannschaft`.
 */
export type Einstellungen = {
  /** Der VEREINSname. Steht auf der Einladungsseite, über den Rechtstexten und im zweiten Faktor. */
  anzeigename: string
  /** Angenommene Durchschnittsgeschwindigkeit für die Abfahrtszeit. */
  tempo_kmh: number
  /** Stunden nach dem Anwurf, nach denen ein Spieltag von selbst schließt. 0 = aus. */
  auto_sperre_stunden: number
  /** Freitext, kein HTML. Leer = die Seite gibt es nicht und nichts verlinkt darauf. */
  impressum: string
  datenschutz: string
}

export type Protokollzeile = {
  at: string
  /** Bereits vom Server aufgelöst — Name statt `member:<id>`. */
  actor: string
  actor_typ: 'admin' | 'member' | 'system'
  action: string
  target: string
  old_value: string
  new_value: string
}

export type Mannschaft = {
  id: string
  name: string
  sort: number
  /** Zeit vor dem Anwurf, die zusätzlich eingeplant wird — je Mannschaft. */
  puffer_minuten: number
  /**
   * Bleibt im Schema, erscheint aber nirgends mehr: Er war für eine Routenberechnung gedacht,
   * die zurückgestellt wurde. Ein leeres Feld ohne Wirkung verwirrt mehr, als die Spalte kostet.
   */
  startort: string
}

export type Verwalterkonto = {
  id: string
  email: string
  rolle: 'gesamt' | 'kapitaen'
  team: string
  /** Ob dieses Konto einen zweiten Faktor eingerichtet hat. Nie das Geheimnis selbst. */
  totp: boolean
}

/** Wer angemeldet ist und was er darf. Kommt aus `/admin/api/me`. */
export type Wer = {
  email: string
  rolle: 'gesamt' | 'kapitaen'
  team: string
  /** Zur Auswahl: alle Mannschaften, für einen Kapitän genau seine eine. */
  teams: { id: string; name: string }[]
}

export type Sicherung = {
  name: string
  groesse: number
  geaendert: string
}

/**
 * Passwort stimmte, aber es fehlt der Code aus der Authenticator-App. Kein Fehlschlag im
 * eigentlichen Sinn, sondern die halbe Anmeldung: Die Maske zeigt jetzt das Codefeld.
 */
export class ZweiterFaktorNoetig extends Error {
  constructor(meldung: string) {
    super(meldung)
    this.name = 'ZweiterFaktorNoetig'
  }
}

/** Wird geworfen, wenn keine Kapitänssitzung (mehr) besteht — der Server antwortet mit 404. */
export class NichtAngemeldet extends Error {
  constructor() {
    super('Nicht angemeldet.')
    this.name = 'NichtAngemeldet'
  }
}

function csrfToken(): string {
  const treffer = document.cookie.match(/(?:^|;\s*)dz_admin_csrf=([^;]*)/)
  return treffer ? decodeURIComponent(treffer[1]) : ''
}

async function ruf<T>(pfad: string, optionen: RequestInit = {}): Promise<T> {
  const antwort = await fetch(`/admin/api${pfad}`, {
    ...optionen,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken(),
      ...optionen.headers,
    },
  })
  // R6 · Der Server antwortet ohne Sitzung mit 404, nicht mit 401 — kein Hinweis darauf, dass es
  // hier überhaupt etwas gibt. Für den Client heißt das trotzdem „bitte anmelden".
  if (antwort.status === 404) throw new NichtAngemeldet()
  if (!antwort.ok) {
    let meldung = 'Das hat nicht geklappt.'
    try {
      const koerper = await antwort.json()
      if (koerper?.message) meldung = String(koerper.message)
    } catch {
      /* kein JSON */
    }
    throw new Error(meldung)
  }
  return antwort.json() as Promise<T>
}

export const adminApi = {
  werBinIch: () => ruf<Wer>('/me'),

  anmelden: async (email: string, password: string, code?: string) => {
    // Nicht über ruf(): der Login hat naturgemäß noch kein CSRF-Cookie, und ein 404 wäre hier
    // eine echte Fehlermeldung statt „bitte anmelden".
    const antwort = await fetch('/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...(code ? { code } : {}) }),
    })
    if (!antwort.ok) {
      const koerper = await antwort.json().catch(() => null)
      const meldung = koerper?.message || 'Anmeldung fehlgeschlagen.'
      if (koerper?.mfa) throw new ZweiterFaktorNoetig(meldung)
      throw new Error(meldung)
    }
    return antwort.json() as Promise<{ email: string }>
  },

  zweiterFaktor: () => ruf<{ aktiv: boolean; ausstehend: boolean }>('/totp'),
  /** Legt ein noch nicht geltendes Geheimnis an. Es verlässt den Server genau hier, ein Mal. */
  zweiterFaktorBeginnen: () => ruf<{ geheimnis: string; uri: string }>('/totp', { method: 'POST' }),
  zweiterFaktorBestaetigen: (code: string) =>
    ruf<{ aktiv: boolean }>('/totp/confirm', { method: 'POST', body: JSON.stringify({ code }) }),
  zweiterFaktorAus: (code: string) =>
    ruf<{ aktiv: boolean }>('/totp', { method: 'DELETE', body: JSON.stringify({ code }) }),

  abmelden: () => ruf<unknown>('/logout', { method: 'POST' }),

  // Die Mannschaft hängt an jeder Liste. Für einen Kapitän ist sie am Server ohnehin gesetzt —
  // der Wert hier ändert daran nichts, er spart nur eine Antwort, die er wegwerfen müsste.
  spieltage: (team: string) => ruf<{ items: AdminSpieltag[] }>(`/fixtures?team=${encodeURIComponent(team)}`),
  spieltagAnlegen: (daten: Partial<AdminSpieltag>) =>
    ruf<{ id: string }>('/fixtures', { method: 'POST', body: JSON.stringify(daten) }),
  spieltagAendern: (id: string, daten: Partial<AdminSpieltag>) =>
    ruf<unknown>(`/fixtures/${id}`, { method: 'PATCH', body: JSON.stringify(daten) }),
  spieltagLoeschen: (id: string) => ruf<unknown>(`/fixtures/${id}`, { method: 'DELETE' }),

  mitglieder: (team: string) => ruf<{ items: AdminMitglied[] }>(`/members?team=${encodeURIComponent(team)}`),
  mitgliedAnlegen: (name: string, team: string) =>
    ruf<{ id: string }>('/members', { method: 'POST', body: JSON.stringify({ name, team }) }),
  mitgliedAendern: (id: string, daten: Partial<AdminMitglied>) =>
    ruf<unknown>(`/members/${id}`, { method: 'PATCH', body: JSON.stringify(daten) }),
  tokenNeu: (id: string) =>
    ruf<{ token: string; sitzungen_beendet: number }>(`/members/${id}/rotate-token`, {
      method: 'POST',
    }),

  einstellungen: () => ruf<Einstellungen>('/settings'),
  einstellungenAendern: (daten: Partial<Einstellungen>) =>
    ruf<Einstellungen>('/settings', { method: 'PATCH', body: JSON.stringify(daten) }),

  /**
   * Ohne Mannschaft sieht der Gesamt-Admin alles — auch die zentralen Ereignisse wie Anmeldungen
   * und Sicherungen, die zu gar keiner Mannschaft gehören. Ein Kapitän bekommt seine eigene
   * ohnehin vom Server aufgezwungen.
   */
  protokoll: (team = '') =>
    ruf<{ items: Protokollzeile[] }>(`/audit?limit=100&team=${encodeURIComponent(team)}`),

  mannschaften: () => ruf<{ items: Mannschaft[] }>('/teams'),
  mannschaftAnlegen: (name: string) =>
    ruf<{ id: string }>('/teams', { method: 'POST', body: JSON.stringify({ name }) }),
  mannschaftAendern: (id: string, daten: Partial<Mannschaft>) =>
    ruf<{ id: string }>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(daten) }),
  mannschaftLoeschen: (id: string) => ruf<unknown>(`/teams/${id}`, { method: 'DELETE' }),

  verwalter: () => ruf<{ items: Verwalterkonto[] }>('/verwalter'),
  /** Das Passwort kommt genau einmal zurück — wie der Einladungslink eines Mitglieds (R1). */
  verwalterAnlegen: (email: string, rolle: 'gesamt' | 'kapitaen', team: string) =>
    ruf<{ id: string; email: string; passwort: string }>('/verwalter', {
      method: 'POST',
      body: JSON.stringify({ email, rolle, team }),
    }),
  verwalterAendern: (id: string, daten: { rolle?: string; team?: string; neues_passwort?: boolean }) =>
    ruf<{ id: string; passwort: string | null }>(`/verwalter/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(daten),
    }),
  verwalterLoeschen: (id: string) => ruf<unknown>(`/verwalter/${id}`, { method: 'DELETE' }),
  /**
   * Den zweiten Faktor eines Kapitäns abschalten — der Ausweg bei verlorenem Handy. Einrichten
   * kann ihn nur der Kapitän selbst: Ein Geheimnis, das über einen fremden Bildschirm liefe,
   * wäre keines mehr.
   */
  verwalterZweiterFaktorAus: (id: string) =>
    ruf<{ totp: boolean }>(`/verwalter/${id}/totp`, { method: 'DELETE' }),

  sicherungen: () => ruf<{ items: Sicherung[] }>('/backups'),
  sicherungErstellen: () => ruf<{ name: string }>('/backup', { method: 'POST' }),

  /**
   * Nicht über ruf(): Der Rumpf ist multipart, und ein gesetztes `Content-Type:
   * application/json` würde die Formulargrenze überschreiben — der Server fände dann keine
   * Datei. Den CSRF-Kopf braucht es trotzdem.
   */
  sicherungHochladen: async (datei: File) => {
    const formular = new FormData()
    formular.append('datei', datei)
    const antwort = await fetch('/admin/api/backup/upload', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken() },
      body: formular,
    })
    if (antwort.status === 404) throw new NichtAngemeldet()
    if (!antwort.ok) {
      const koerper = await antwort.json().catch(() => null)
      throw new Error(koerper?.message || 'Das Hochladen hat nicht geklappt.')
    }
    return antwort.json() as Promise<{ name: string }>
  },

  sicherungLoeschen: (name: string) =>
    ruf<unknown>(`/backup/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  /**
   * Sonderfall, und ein unangenehmer: Gelingt das Zurückspielen, verschwindet PocketBase noch im
   * Aufruf — es startet sich selbst neu. Was davon im Browser ankommt, hängt daran, wer
   * dazwischensteht:
   *
   *   - ohne Proxy: gar nichts, `fetch` wirft einen Netzwerkfehler
   *   - mit Caddy davor: ein 502 mit leerem Rumpf, weil der Upstream wegbrach
   *
   * Beides bedeutet dasselbe — der Prozess ist weg, also hat es funktioniert. Nur eines von
   * beidem abzufangen reicht nicht; genau daran ist die erste Fassung gescheitert.
   *
   * Die tragfähige Unterscheidung ist nicht der Statuscode, sondern die Herkunft der Antwort:
   * Eigene Ablehnungen kommen IMMER als JSON mit `message` — fehlende Bestätigung, unbekannte
   * Datei, gescheiterte Sicherheitskopie. Alles ohne diesen Rumpf stammt nicht von uns, sondern
   * von einem Proxy, der einen verschwundenen Dienst meldet.
   */
  sicherungZurueckspielen: async (name: string) => {
    let antwort: Response
    try {
      antwort = await fetch(`/admin/api/backup/${encodeURIComponent(name)}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
        body: JSON.stringify({ bestaetigung: name }),
      })
    } catch {
      return // Verbindung abgerissen: PocketBase ist weg, also gestartet neu.
    }
    if (antwort.ok) return

    const koerper = await antwort.json().catch(() => null)
    if (koerper?.message) throw new Error(String(koerper.message))

    // Kein Rumpf von uns — der Dienst ist mitten in der Anfrage verschwunden. Erfolgsfall.
    return
  },

  /** Gewöhnlicher Link — der Browser legt die Datei in den Download-Ordner. */
  sicherungUrl: (name: string) => `/admin/api/backup/${encodeURIComponent(name)}`,
}
