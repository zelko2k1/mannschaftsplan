// Zugriff auf die Routen aus Abschnitt 5. Same-Origin, deshalb keine Basis-URL und kein CORS:
// im Betrieb liegt das Frontend in PocketBases pb_public, im Entwicklungsbetrieb proxyt Vite.

import { nachReihenfolge } from './format'

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
  /** Freitext des Kapitäns zu diesem Spieltag. Leer = kein Hinweis. */
  hinweis: string
  /** Anreise ohne Autos — Bus, Bahn, zu Fuß. Dann gibt es keinen Fahrdienst. */
  ohne_fahrdienst: boolean
  /** Eigenes Ergebnis, `-1` = nicht eingetragen. Die Null ist ein gültiges Ergebnis. */
  ergebnis_wir: number
  /** Ergebnis des Gegners, `-1` = nicht eingetragen. */
  ergebnis_gegner: number
  /** Wer zugesagt hat und selbst zum Spielort kommt — braucht keinen Platz und bietet keinen an. */
  selbst_anreise: string[]
  /** Wann zuletzt verlegt. Leer = nie. */
  verlegt_am: string
  /** Der Termin, der vor der letzten Verlegung galt. Leer = nie verlegt. */
  verlegt_von: string
  /** Wessen Rückmeldung noch vom alten Termin stammt — älter als die Verlegung. */
  responses_alt: string[]
  rides: Fahrt[]
  /** Mitglieds-ID → ID des Autos, in dem es sitzt. */
  seat_claims: Record<string, string>
}

export type Board = {
  me: string
  members: { id: string; name: string }[]
  fixtures: Spieltag[]
  /** Ob der Betreiber einen Text hinterlegt hat — nur dann wird im Fuß darauf verlinkt. */
  impressum: boolean
  datenschutz: boolean
  /**
   * Ob zu diesem Spieler ein Verwalterkonto gehört (Abschnitt 12). Nur dann erscheint im Kopf
   * der Weg in die Verwaltung — die übrigen Spieler sollen einen Knopf, den sie nie brauchen,
   * gar nicht erst sehen.
   */
  verwalter: boolean
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
  // Die Namensliste des Aushangs, deutsch sortiert — sie trägt „Dabei: …", „Keine Antwort: …"
  // und die Namen der Mitfahrer. Warum das nicht der Server tut, steht bei `nachReihenfolge`.
  board: () =>
    ruf<Board>('/api/board').then((antwort) => ({
      ...antwort,
      members: [...antwort.members].sort(nachReihenfolge),
    })),

  /**
   * `selbst` bleibt weg, wenn es nicht gemeint ist: Der Server lässt den bisherigen Wert dann
   * stehen. Sonst setzte jedes gewöhnliche Antippen von „Dabei" die Selbstanreise still zurück.
   */
  antwort: (spieltag: string, status: Status | null, selbst?: boolean) =>
    ruf<unknown>(`/api/response/${spieltag}`, {
      method: 'PUT',
      body: JSON.stringify(selbst === undefined ? { status } : { status, selbst }),
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
