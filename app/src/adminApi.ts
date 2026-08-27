// Zugriff auf /admin/api. Bewusst getrennt von api.ts — die beiden Bereiche teilen sich weder
// Cookie noch Prüflogik (R5), und das soll man auch im Frontend sehen.

export type AdminSpieltag = {
  id: string
  date: string
  opponent_club: string
  opponent_town: string
  is_home: boolean
  venue: string
  km: number
  meeting_point: string
  needed_players: number
  locked: boolean
}

export type AdminMitglied = {
  id: string
  name: string
  active: boolean
  sort: number
  note: string
  /** Nur ob überhaupt eins ausgestellt wurde — der Hash verlässt den Server nie (R1). */
  hat_token: boolean
  token_issued_at: string
  geraete: number
}

export type Einstellungen = {
  /** Steht auf der Einladungsseite und in der Linkvorschau — für jeden Empfänger sichtbar. */
  anzeigename: string
  /** Angenommene Durchschnittsgeschwindigkeit für die Abfahrtszeit. */
  tempo_kmh: number
  /** Zeit vor dem Anwurf, die zusätzlich eingeplant wird. */
  puffer_minuten: number
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

export type Sicherung = {
  name: string
  groesse: number
  geaendert: string
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
  werBinIch: () => ruf<{ email: string }>('/me'),

  anmelden: async (email: string, password: string) => {
    // Nicht über ruf(): der Login hat naturgemäß noch kein CSRF-Cookie, und ein 404 wäre hier
    // eine echte Fehlermeldung statt „bitte anmelden".
    const antwort = await fetch('/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!antwort.ok) {
      const koerper = await antwort.json().catch(() => null)
      throw new Error(koerper?.message || 'Anmeldung fehlgeschlagen.')
    }
    return antwort.json() as Promise<{ email: string }>
  },

  abmelden: () => ruf<unknown>('/logout', { method: 'POST' }),

  spieltage: () => ruf<{ items: AdminSpieltag[] }>('/fixtures'),
  spieltagAnlegen: (daten: Partial<AdminSpieltag>) =>
    ruf<{ id: string }>('/fixtures', { method: 'POST', body: JSON.stringify(daten) }),
  spieltagAendern: (id: string, daten: Partial<AdminSpieltag>) =>
    ruf<unknown>(`/fixtures/${id}`, { method: 'PATCH', body: JSON.stringify(daten) }),
  spieltagLoeschen: (id: string) => ruf<unknown>(`/fixtures/${id}`, { method: 'DELETE' }),

  mitglieder: () => ruf<{ items: AdminMitglied[] }>('/members'),
  mitgliedAnlegen: (name: string) =>
    ruf<{ id: string }>('/members', { method: 'POST', body: JSON.stringify({ name }) }),
  mitgliedAendern: (id: string, daten: Partial<AdminMitglied>) =>
    ruf<unknown>(`/members/${id}`, { method: 'PATCH', body: JSON.stringify(daten) }),
  tokenNeu: (id: string) =>
    ruf<{ token: string; sitzungen_beendet: number }>(`/members/${id}/rotate-token`, {
      method: 'POST',
    }),

  einstellungen: () => ruf<Einstellungen>('/settings'),
  einstellungenAendern: (daten: Partial<Einstellungen>) =>
    ruf<Einstellungen>('/settings', { method: 'PATCH', body: JSON.stringify(daten) }),

  protokoll: () => ruf<{ items: Protokollzeile[] }>('/audit?limit=100'),

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
   * Sonderfall, und ein unangenehmer: Gelingt das Zurückspielen, startet PocketBase noch im
   * Handler neu. Die Antwort erreicht den Browser dann nie — `fetch` wirft stattdessen einen
   * Netzwerkfehler. Ein Abriss der Verbindung ist hier also das *Erfolgszeichen*, nicht der
   * Fehlerfall. Wer das nicht abfängt, meldet dem Kapitän „hat nicht geklappt", während im
   * Hintergrund alles ersetzt wurde.
   *
   * Echte Ablehnungen (fehlende Bestätigung, unbekannte Datei) kommen weiterhin als richtige
   * HTTP-Antwort an und werden ganz normal gemeldet.
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
      return
    }
    if (antwort.ok) return
    if (antwort.status === 404) {
      throw new Error('Diese Sicherung gibt es nicht mehr, oder die Sitzung ist abgelaufen.')
    }
    const koerper = await antwort.json().catch(() => null)
    throw new Error(koerper?.message || 'Das Zurückspielen hat nicht geklappt.')
  },

  /** Gewöhnlicher Link — der Browser legt die Datei in den Download-Ordner. */
  sicherungUrl: (name: string) => `/admin/api/backup/${encodeURIComponent(name)}`,
}
