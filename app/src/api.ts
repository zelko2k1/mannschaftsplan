// Zugriff auf die Routen aus Abschnitt 5. Same-Origin, deshalb keine Basis-URL und kein CORS:
// im Betrieb liegt das Frontend in PocketBases pb_public, im Entwicklungsbetrieb proxyt Vite.

export type Status = 'yes' | 'maybe' | 'no'

export type Fahrt = {
  id: string
  member: string
  seats: number
  /** Belegte Plätze DIESES Autos. */
  taken: number
}

export type Spieltag = {
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
  /** Vom Server gerechnet (Abschnitt 6.3). Bei Heimspielen null. */
  departure: string | null
  responses: Record<string, Status>
  rides: Fahrt[]
  /** Mitglieds-ID → ID des Autos, in dem es sitzt. */
  seat_claims: Record<string, string>
}

export type Board = {
  me: string
  members: { id: string; name: string }[]
  fixtures: Spieltag[]
}

/** Wird geworfen, wenn die Sitzung weg ist — die App zeigt dann die „Link ungültig"-Seite. */
export class KeineSitzung extends Error {
  constructor() {
    super('Keine gültige Sitzung.')
    this.name = 'KeineSitzung'
  }
}

/**
 * R11 · Double-Submit: den Wert aus dem lesbaren Cookie als Kopfzeile zurückschicken. Fremde
 * Seiten können das Cookie nicht lesen und die Kopfzeile deshalb nicht setzen.
 */
function csrfToken(): string {
  const treffer = document.cookie.match(/(?:^|;\s*)dz_csrf=([^;]*)/)
  return treffer ? decodeURIComponent(treffer[1]) : ''
}

async function ruf<T>(pfad: string, optionen: RequestInit = {}): Promise<T> {
  const antwort = await fetch(pfad, {
    ...optionen,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken(),
      ...optionen.headers,
    },
  })
  if (antwort.status === 401) throw new KeineSitzung()
  if (!antwort.ok) {
    // Der Server sagt bewusst wenig (R6). Was er sagt, ist für Menschen gedacht und wird
    // unverändert durchgereicht — erfundene Erklärungen wären hier schlimmer als gar keine.
    let meldung = 'Nicht gespeichert.'
    try {
      const koerper = await antwort.json()
      if (koerper?.message) meldung = String(koerper.message)
    } catch {
      /* kein JSON — dann bleibt es beim Standardsatz */
    }
    throw new Error(meldung)
  }
  return antwort.json() as Promise<T>
}

export const api = {
  board: () => ruf<Board>('/api/board'),

  antwort: (spieltag: string, status: Status | null) =>
    ruf<unknown>(`/api/response/${spieltag}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  fahren: (spieltag: string, faehrt: boolean, plaetze?: number) =>
    ruf<unknown>(`/api/ride/${spieltag}`, {
      method: 'PUT',
      body: JSON.stringify(faehrt ? { driving: true, seats: plaetze } : { driving: false }),
    }),

  mitfahren: (spieltag: string, fahrt: string | null) =>
    ruf<unknown>(`/api/seat/${spieltag}`, {
      method: 'PUT',
      body: JSON.stringify(fahrt ? { riding: true, ride: fahrt } : { riding: false }),
    }),

  abmelden: () => ruf<unknown>('/api/logout', { method: 'POST' }),
}
