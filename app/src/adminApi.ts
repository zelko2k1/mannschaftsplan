// Zugriff auf die Verwaltungs-API. Bewusst getrennt von api.ts — die beiden Bereiche teilen sich
// weder Cookie noch Prüflogik (R5), und das soll man auch im Frontend sehen.
//
// ZWEI PRÄFIXE (R13e). Was ein Kapitän braucht, liegt unter /manage/api und ist von außen
// erreichbar. Was nur die Rolle `admin` darf — Konten, Mannschaften anlegen und löschen,
// Einstellungen ändern, Sicherungen —, liegt unter /admin/api und damit hinter dem Gate aus R13b.
//
// Praktisch heißt das: `rufAdmin()` kann ein Browser-Anmeldefenster auslösen, `ruf()` nie. Wer
// eine Funktion von einem Präfix auf das andere schiebt, verschiebt sie im Backend mit — sonst
// antwortet der Server mit 404 und das Frontend meldet „bitte anmelden", obwohl man es ist.

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
  /** -1 = der eingebaute Standard gilt (80 km/h). */
  tempo_kmh: number
  /** -1 = der eingebaute Standard gilt (25 Minuten). 0 heißt ausdrücklich „ohne Puffer". */
  puffer_minuten: number
  /** Was tatsächlich gilt — nur zur Anzeige, wird nicht zurückgeschickt. */
  tempo_effektiv: number
  puffer_effektiv: number
  /** Was die Formel ergäbe — nur zur Anzeige, wird nicht zurückgeschickt. */
  departure_berechnet: string | null
  needed_players: number
  locked: boolean
  /**
   * Kommt dieser Spieltag aus einem eingelesenen Spielplan? Dann fehlen ihm die Angaben, die
   * kein Verbands-Export kennt — und die Kapitänsansicht sagt das, statt „Auswärts, 0 km" zu
   * behaupten.
   */
  aus_spielplan: boolean
  /**
   * Der Stand der Mannschaft — dieselbe Gestalt wie im Aushang, damit die Kapitänsansicht
   * denselben Satz rechnet und nicht eine zweite Wahrheit entsteht. Mitglieds-ID → Antwort.
   */
  responses: Record<string, 'yes' | 'maybe' | 'no'>
  rides: { id: string; member: string; seats: number; taken: number }[]
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
  /**
   * Bleibt im Schema, erscheint aber nirgends mehr: Er war für eine Routenberechnung gedacht,
   * die zurückgestellt wurde. Ein leeres Feld ohne Wirkung verwirrt mehr, als die Spalte kostet.
   */
  startort: string
}

/** Was der Spielplan-Import geschrieben hat — die Rückmeldung nach dem Übernehmen. */
export type ImportErgebnis = {
  neu: number
  geaendert: number
  unveraendert: number
  /** Gesperrte Spieltage bleiben unberührt — auch beim Nachimport. */
  gesperrt: number
}

export type Verwalterkonto = {
  id: string
  email: string
  rolle: 'admin' | 'kapitaen'
  team: string
  /** Der Spielereintrag, falls die Person mitspielt. Beim Admin immer leer. */
  mitglied: string
  /** Ob dieses Konto einen zweiten Faktor eingerichtet hat. Nie das Geheimnis selbst. */
  totp: boolean
  /** Sekunden, die eine laufende Anmelde-Sperre noch dauert. 0 = nicht gesperrt (R7). */
  gesperrt: number
}

/** Wer angemeldet ist und was er darf. Kommt aus `/manage/api/me`. */
export type Wer = {
  email: string
  rolle: 'admin' | 'kapitaen'
  team: string
  /** Der eigene Spielereintrag, falls verknüpft. */
  mitglied: string
  /** Zur Auswahl: alle Mannschaften, für einen Kapitän genau seine eine. */
  teams: { id: string; name: string }[]
  /**
   * Ob dieses Konto einen zweiten Faktor eingerichtet hat. Für Admin-Konten ist er Pflicht —
   * ohne ihn antwortet alles unter /admin/api mit 403, und die Oberfläche sagt das vorher.
   */
  totp: boolean
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

const MANAGE = '/manage/api'
const ADMIN = '/admin/api'

async function rufen<T>(basis: string, pfad: string, optionen: RequestInit = {}): Promise<T> {
  const antwort = await fetch(`${basis}${pfad}`, {
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

/** Alles, was auch ein Kapitän darf. */
const ruf = <T>(pfad: string, optionen: RequestInit = {}) => rufen<T>(MANAGE, pfad, optionen)
/** Nur für die Rolle `admin` — liegt hinter dem Gate aus R13b. */
const rufAdmin = <T>(pfad: string, optionen: RequestInit = {}) => rufen<T>(ADMIN, pfad, optionen)

export const adminApi = {
  werBinIch: () => ruf<Wer>('/me'),

  /**
   * `bleiben` ist ein Wunsch, keine Zusage: Die langen 90 Tage gibt es nur mit zweitem Faktor.
   * Was daraus geworden ist, steht in der Antwort — ohne TOTP kommt `bleiben: false` zurück,
   * und die Maske sagt, woran es lag.
   */
  anmelden: async (email: string, password: string, code?: string, bleiben = false) => {
    // Nicht über ruf(): der Login hat naturgemäß noch kein CSRF-Cookie, und ein 404 wäre hier
    // eine echte Fehlermeldung statt „bitte anmelden".
    const antwort = await fetch(`${MANAGE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, bleiben, ...(code ? { code } : {}) }),
    })
    if (!antwort.ok) {
      const koerper = await antwort.json().catch(() => null)
      const meldung = koerper?.message || 'Anmeldung fehlgeschlagen.'
      if (koerper?.mfa) throw new ZweiterFaktorNoetig(meldung)
      throw new Error(meldung)
    }
    return antwort.json() as Promise<{ email: string; bleiben: boolean }>
  },

  /** Das eigene Passwort ändern. Das bisherige muss mit — sonst genügte eine übernommene Sitzung. */
  passwortAendern: (alt: string, neu: string) =>
    ruf<{ sitzungen_beendet: number }>('/passwort', {
      method: 'PATCH',
      body: JSON.stringify({ alt, neu }),
    }),

  zweiterFaktor: () =>
    ruf<{ aktiv: boolean; ausstehend: boolean; codes_uebrig: number }>('/totp'),
  /** Legt ein noch nicht geltendes Geheimnis an. Es verlässt den Server genau hier, ein Mal. */
  zweiterFaktorBeginnen: () => ruf<{ geheimnis: string; uri: string }>('/totp', { method: 'POST' }),
  /**
   * Schaltet scharf — und gibt dabei die zehn Wiederherstellungscodes aus. Sie kommen genau
   * einmal, hier, im Klartext; danach steht in der Datenbank nur noch ihr Hash (R1).
   */
  zweiterFaktorBestaetigen: (code: string) =>
    ruf<{ aktiv: boolean; codes: string[] }>('/totp/confirm', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  /** Zehn neue Codes; die alten gelten danach nicht mehr. Braucht einen gültigen Code aus der App. */
  wiederherstellungscodesNeu: (code: string) =>
    ruf<{ codes: string[] }>('/totp/codes', { method: 'POST', body: JSON.stringify({ code }) }),
  zweiterFaktorAus: (code: string) =>
    ruf<{ aktiv: boolean }>('/totp', { method: 'DELETE', body: JSON.stringify({ code }) }),

  abmelden: () => ruf<unknown>('/logout', { method: 'POST' }),

  /**
   * Stellt eine Mitgliedersitzung für den eigenen Spielereintrag aus (Abschnitt 12). Danach
   * führt der Weg auf den Aushang, so wie ihn jeder andere Spieler auch sieht. Die
   * Kapitänssitzung bleibt bestehen — zurück geht es über „Verwaltung" im Kopf.
   */
  spieleransicht: () => ruf<{ ok: true }>('/spieleransicht', { method: 'POST' }),

  // Die Mannschaft hängt an jeder Liste. Für einen Kapitän ist sie am Server ohnehin gesetzt —
  // der Wert hier ändert daran nichts, er spart nur eine Antwort, die er wegwerfen müsste.
  spieltage: (team: string) => ruf<{ items: AdminSpieltag[] }>(`/fixtures?team=${encodeURIComponent(team)}`),
  spieltagAnlegen: (daten: Partial<AdminSpieltag>) =>
    ruf<{ id: string }>('/fixtures', { method: 'POST', body: JSON.stringify(daten) }),
  spieltagAendern: (id: string, daten: Partial<AdminSpieltag>) =>
    ruf<unknown>(`/fixtures/${id}`, { method: 'PATCH', body: JSON.stringify(daten) }),
  spieltagLoeschen: (id: string) => ruf<unknown>(`/fixtures/${id}`, { method: 'DELETE' }),
  /**
   * Spielplan übernehmen — NUR Admin, deshalb `rufAdmin`. Gelesen und zugeordnet wird die Datei
   * im Browser (`spielplan.ts`); hier gehen fertige Zeilen mit Mannschafts-Kennung hinaus.
   *
   * `opponent_town` und `km` sind freiwillig: Ein Verbands-Export kennt sie nicht, die selbst
   * ausgefüllte Vorlage schon. Leer heißt „nicht angerührt" — ein Nachimport löscht damit nicht,
   * was jemand von Hand nachgetragen hat.
   */
  spielplanImportieren: (
    zeilen: {
      quelle: string
      team: string
      date: string
      opponent_club: string
      is_home: boolean
      venue: string
      opponent_town: string
      km: number
    }[],
  ) =>
    rufAdmin<ImportErgebnis>('/fixtures/import', {
      method: 'POST',
      body: JSON.stringify({ zeilen }),
    }),

  /**
   * Eine Rückmeldung für ein Mitglied setzen oder zurücknehmen (`null`).
   *
   * Die Route gibt es im Backend seit dem Bau der Kapitänsansicht — sie prüft, dass Spieltag
   * und Mitglied zur selben Mannschaft gehören, protokolliert `response.correct` und lässt
   * ausdrücklich auch abgeschlossene Spieltage zu. Nur angebunden war sie nie: Wer jemandem
   * telefonisch zusagt, konnte bisher nirgends eingetragen werden.
   */
  rueckmeldungSetzen: (spieltag: string, mitglied: string, status: 'yes' | 'maybe' | 'no' | null) =>
    ruf<unknown>(`/response/${spieltag}/${mitglied}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  /**
   * Die Spieler einer Mannschaft.
   *
   * `gesamt` ist die WIRKLICHE Anzahl, `grenze` die Seitengröße der Abfrage. Beide stehen dabei,
   * weil die Liste allein den Unterschied nicht zeigt: Bei 200 und bei 250 Spielern kommen
   * genau 200 Zeilen zurück.
   */
  mitglieder: (team: string) =>
    ruf<{ items: AdminMitglied[]; gesamt: number; grenze: number }>(
      `/members?team=${encodeURIComponent(team)}`,
    ),
  mitgliedAnlegen: (name: string, team: string) =>
    ruf<{ id: string }>('/members', { method: 'POST', body: JSON.stringify({ name, team }) }),
  mitgliedAendern: (id: string, daten: Partial<AdminMitglied>) =>
    ruf<unknown>(`/members/${id}`, { method: 'PATCH', body: JSON.stringify(daten) }),
  /**
   * Einen Spieler wirklich entfernen — nicht bloß auf inaktiv setzen.
   *
   * Der Server lässt es nur zu, solange nichts mehr an ihm hängt: keine Rückmeldung, keine
   * Fahrt, kein Kapitänskonto. Was im Weg ist, steht in der Fehlermeldung.
   */
  mitgliedLoeschen: (id: string) => ruf<unknown>(`/members/${id}`, { method: 'DELETE' }),
  tokenNeu: (id: string) =>
    ruf<{ token: string; sitzungen_beendet: number }>(`/members/${id}/rotate-token`, {
      method: 'POST',
    }),

  einstellungen: () => ruf<Einstellungen>('/settings'),
  einstellungenAendern: (daten: Partial<Einstellungen>) =>
    rufAdmin<Einstellungen>('/settings', { method: 'PATCH', body: JSON.stringify(daten) }),

  /**
   * Ohne Mannschaft sieht der Gesamt-Admin alles — auch die zentralen Ereignisse wie Anmeldungen
   * und Sicherungen, die zu gar keiner Mannschaft gehören. Ein Kapitän bekommt seine eigene
   * ohnehin vom Server aufgezwungen.
   */
  protokoll: (team = '') =>
    ruf<{ items: Protokollzeile[] }>(`/audit?limit=100&team=${encodeURIComponent(team)}`),

  mannschaften: () => ruf<{ items: Mannschaft[] }>('/teams'),
  mannschaftAnlegen: (name: string) =>
    rufAdmin<{ id: string }>('/teams', { method: 'POST', body: JSON.stringify({ name }) }),
  mannschaftAendern: (id: string, daten: Partial<Mannschaft>) =>
    ruf<{ id: string }>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(daten) }),
  mannschaftLoeschen: (id: string) => rufAdmin<unknown>(`/teams/${id}`, { method: 'DELETE' }),
  /**
   * Saisonende: Spieltage bis einschließlich `bis` (YYYY-MM-DD) löschen, wahlweise nur die einer
   * Mannschaft. Rückmeldungen und Fahrten gehen mit — deshalb NUR Admin.
   */
  spieltageAufraeumen: (bis: string, team = '') =>
    rufAdmin<{ spieltage: number }>('/spieltage/aufraeumen', {
      method: 'POST',
      body: JSON.stringify({ bis, team }),
    }),

  verwalter: () => rufAdmin<{ items: Verwalterkonto[] }>('/verwalter'),
  /** Das Passwort kommt genau einmal zurück — wie der Einladungslink eines Mitglieds (R1). */
  verwalterAnlegen: (
    email: string,
    rolle: 'admin' | 'kapitaen',
    team: string,
    mitglied = '',
  ) =>
    rufAdmin<{ id: string; email: string; passwort: string }>('/verwalter', {
      method: 'POST',
      body: JSON.stringify({ email, rolle, team, mitglied }),
    }),
  verwalterAendern: (
    id: string,
    daten: { rolle?: string; team?: string; mitglied?: string; neues_passwort?: boolean },
  ) =>
    rufAdmin<{ id: string; passwort: string | null }>(`/verwalter/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(daten),
    }),
  verwalterLoeschen: (id: string) => rufAdmin<unknown>(`/verwalter/${id}`, { method: 'DELETE' }),
  /**
   * Den zweiten Faktor eines Kapitäns abschalten — der Ausweg bei verlorenem Handy. Einrichten
   * kann ihn nur der Kapitän selbst: Ein Geheimnis, das über einen fremden Bildschirm liefe,
   * wäre keines mehr.
   */
  verwalterZweiterFaktorAus: (id: string) =>
    rufAdmin<{ totp: boolean }>(`/verwalter/${id}/totp`, { method: 'DELETE' }),

  /**
   * Eine Anmelde-Sperre vorzeitig aufheben. Sie löst sich nach einer Viertelstunde ohnehin —
   * das hier ist für den Kapitän, der vor dem Spieltag steht und nicht warten kann.
   */
  verwalterEntsperren: (id: string) =>
    rufAdmin<{ ok: true }>(`/verwalter/${id}/entsperren`, { method: 'POST' }),

  sicherungen: () => rufAdmin<{ items: Sicherung[] }>('/backups'),
  sicherungErstellen: () => rufAdmin<{ name: string }>('/backup', { method: 'POST' }),

  /**
   * Nicht über ruf(): Der Rumpf ist multipart, und ein gesetztes `Content-Type:
   * application/json` würde die Formulargrenze überschreiben — der Server fände dann keine
   * Datei. Den CSRF-Kopf braucht es trotzdem.
   */
  sicherungHochladen: async (datei: File) => {
    const formular = new FormData()
    formular.append('datei', datei)
    const antwort = await fetch(`${ADMIN}/backup/upload`, {
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
    rufAdmin<unknown>(`/backup/${encodeURIComponent(name)}`, { method: 'DELETE' }),

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
      antwort = await fetch(`${ADMIN}/backup/${encodeURIComponent(name)}/restore`, {
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
  sicherungUrl: (name: string) => `${ADMIN}/backup/${encodeURIComponent(name)}`,
}
