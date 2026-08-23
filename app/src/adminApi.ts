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

export type Protokollzeile = {
  at: string
  /** Bereits vom Server aufgelöst — Name statt `member:<id>`. */
  actor: string
  actor_typ: 'admin' | 'member'
  action: string
  target: string
  old_value: string
  new_value: string
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

  protokoll: () => ruf<{ items: Protokollzeile[] }>('/audit?limit=100'),
}
