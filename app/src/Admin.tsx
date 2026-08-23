import { useCallback, useEffect, useState } from 'react'
import {
  adminApi,
  NichtAngemeldet,
  type AdminMitglied,
  type AdminSpieltag,
  type Protokollzeile,
} from './adminApi'
import { tag, uhrzeit } from './format'
import './admin.css'

type Reiter = 'spieltage' | 'mitglieder' | 'protokoll'

export default function Admin() {
  const [email, setEmail] = useState<string | null>(null)
  const [prueft, setPrueft] = useState(true)
  const [reiter, setReiter] = useState<Reiter>('spieltage')

  useEffect(() => {
    adminApi
      .werBinIch()
      .then((d) => setEmail(d.email))
      .catch(() => setEmail(null))
      .finally(() => setPrueft(false))
  }, [])

  if (prueft) {
    return (
      <div className="admin">
        <div className="leer">
          <p>Einen Moment …</p>
        </div>
      </div>
    )
  }

  if (!email) return <Anmeldung fertig={setEmail} />

  return (
    <div className="admin">
      <header className="admin__kopf">
        <h1>Kapitän</h1>
        <span className="admin__wer">
          {email}
          {' · '}
          <button
            type="button"
            className="kopf__abmelden"
            onClick={async () => {
              await adminApi.abmelden().catch(() => {})
              setEmail(null)
            }}
          >
            Abmelden
          </button>
        </span>
      </header>

      <nav className="reiter">
        {(
          [
            ['spieltage', 'Spieltage'],
            ['mitglieder', 'Mitglieder'],
            ['protokoll', 'Protokoll'],
          ] as [Reiter, string][]
        ).map(([wert, text]) => (
          <button
            key={wert}
            type="button"
            className="reiter__knopf"
            aria-current={reiter === wert}
            onClick={() => setReiter(wert)}
          >
            {text}
          </button>
        ))}
      </nav>

      <div className="admin__inhalt">
        {reiter === 'spieltage' && <Spieltage abgemeldet={() => setEmail(null)} />}
        {reiter === 'mitglieder' && <Mitglieder abgemeldet={() => setEmail(null)} />}
        {reiter === 'protokoll' && <Protokoll abgemeldet={() => setEmail(null)} />}
      </div>
    </div>
  )
}

// ── Anmeldung ───────────────────────────────────────────────────────────────────────────────
function Anmeldung({ fertig }: { fertig: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)

  return (
    <div className="admin">
      <header className="admin__kopf">
        <h1>Kapitän</h1>
      </header>
      <form
        className="anmeldung"
        onSubmit={async (ereignis) => {
          ereignis.preventDefault()
          setLaeuft(true)
          setFehler('')
          try {
            const d = await adminApi.anmelden(email, passwort)
            fertig(d.email)
          } catch (problem) {
            setFehler(problem instanceof Error ? problem.message : 'Anmeldung fehlgeschlagen.')
          } finally {
            setLaeuft(false)
          }
        }}
      >
        <div className="feldreihe" style={{ gridTemplateColumns: '1fr' }}>
          <label className="feld">
            <span>E-Mail</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(x) => setEmail(x.target.value)}
            />
          </label>
          <label className="feld">
            <span>Passwort</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={passwort}
              onChange={(x) => setPasswort(x.target.value)}
            />
          </label>
        </div>
        <button type="submit" className="knopf" disabled={laeuft} style={{ width: '100%' }}>
          {laeuft ? 'Einen Moment …' : 'Anmelden'}
        </button>
        {/* R6 · Der Server sagt nicht, was falsch war. Diese Seite erfindet nichts dazu. */}
        {fehler && (
          <p className="fehler" role="status">
            {fehler}
          </p>
        )}
      </form>
    </div>
  )
}

/** Ein Ladezustand mit Fehlerzeile — dreimal gebraucht, deshalb hier einmal. */
function useListe<T>(holen: () => Promise<{ items: T[] }>, abgemeldet: () => void) {
  const [items, setItems] = useState<T[] | null>(null)
  const [fehler, setFehler] = useState('')

  const laden = useCallback(async () => {
    try {
      setItems((await holen()).items)
      setFehler('')
    } catch (problem) {
      if (problem instanceof NichtAngemeldet) return abgemeldet()
      setFehler(problem instanceof Error ? problem.message : 'Konnte nicht geladen werden.')
    }
    // holen ist bei jedem Rendern neu, würde als Abhängigkeit also eine Endlosschleife bauen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abgemeldet])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void laden()
  }, [laden])

  return { items, fehler, setFehler, laden }
}

// ── Spieltage ───────────────────────────────────────────────────────────────────────────────
const LEER: Partial<AdminSpieltag> = {
  date: '',
  opponent_club: '',
  opponent_town: '',
  is_home: false,
  venue: '',
  km: 0,
  meeting_point: '',
  needed_players: 4,
}

function Spieltage({ abgemeldet }: { abgemeldet: () => void }) {
  const { items, fehler, setFehler, laden } = useListe(adminApi.spieltage, abgemeldet)
  const [entwurf, setEntwurf] = useState<Partial<AdminSpieltag> | null>(null)

  const speichern = async () => {
    if (!entwurf) return
    try {
      // Das Datum-Feld liefert "2026-08-29T19:30"; PocketBase will "YYYY-MM-DD HH:MM:SS".
      const daten = { ...entwurf, date: String(entwurf.date || '').replace('T', ' ') + ':00' }
      if (entwurf.id) await adminApi.spieltagAendern(entwurf.id, daten)
      else await adminApi.spieltagAnlegen(daten)
      setEntwurf(null)
      await laden()
    } catch (problem) {
      if (problem instanceof NichtAngemeldet) return abgemeldet()
      setFehler(problem instanceof Error ? problem.message : 'Nicht gespeichert.')
    }
  }

  if (!items) return <p>Einen Moment …</p>

  return (
    <>
      {fehler && (
        <p className="fehler" role="status">
          {fehler}
        </p>
      )}

      {entwurf ? (
        <Spieltagformular
          entwurf={entwurf}
          setEntwurf={setEntwurf}
          speichern={speichern}
          abbrechen={() => setEntwurf(null)}
        />
      ) : (
        <button type="button" className="knopf" onClick={() => setEntwurf({ ...LEER })}>
          Neuer Spieltag
        </button>
      )}

      {items.length === 0 && !entwurf && <p className="namen">Noch keine Termine eingetragen.</p>}

      {items.map((s) => (
        <div key={s.id} className="satz">
          <div className="satz__kopf">
            <span className="satz__name">{s.opponent_town}</span>
            <span className="satz__zusatz">
              {tag(s.date)} {uhrzeit(s.date)} · {s.is_home ? 'Heim' : `Auswärts, ${s.km} km`}
              {s.locked ? ' · abgeschlossen' : ''}
            </span>
          </div>
          <div className="satz__aktionen">
            <button
              type="button"
              className="knopf"
              onClick={() =>
                // Für das datetime-local-Feld zurück ins "YYYY-MM-DDTHH:MM"-Format.
                setEntwurf({ ...s, date: s.date.replace(' ', 'T').slice(0, 16) })
              }
            >
              Bearbeiten
            </button>
            <button
              type="button"
              className="knopf"
              onClick={async () => {
                try {
                  await adminApi.spieltagAendern(s.id, { locked: !s.locked })
                  await laden()
                } catch (problem) {
                  setFehler(problem instanceof Error ? problem.message : 'Nicht gespeichert.')
                }
              }}
            >
              {s.locked ? 'Wieder öffnen' : 'Abschließen'}
            </button>
            <button
              type="button"
              className="knopf knopf--gefahr"
              onClick={async () => {
                // Löschen nimmt Rückmeldungen und Fahrdienst mit — das muss dastehen.
                if (
                  !window.confirm(
                    `„${s.opponent_town}" löschen? Rückmeldungen und Fahrdienst verschwinden mit.`,
                  )
                ) {
                  return
                }
                try {
                  await adminApi.spieltagLoeschen(s.id)
                  await laden()
                } catch (problem) {
                  setFehler(problem instanceof Error ? problem.message : 'Nicht gelöscht.')
                }
              }}
            >
              Löschen
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

function Spieltagformular({
  entwurf,
  setEntwurf,
  speichern,
  abbrechen,
}: {
  entwurf: Partial<AdminSpieltag>
  setEntwurf: (e: Partial<AdminSpieltag>) => void
  speichern: () => void
  abbrechen: () => void
}) {
  const setze = (feld: keyof AdminSpieltag, wert: unknown) => setEntwurf({ ...entwurf, [feld]: wert })

  return (
    <form
      onSubmit={(ereignis) => {
        ereignis.preventDefault()
        speichern()
      }}
    >
      <div className="feldreihe">
        <label className="feld">
          <span>Datum und Anwurf</span>
          <input
            type="datetime-local"
            required
            value={String(entwurf.date || '')}
            onChange={(x) => setze('date', x.target.value)}
          />
        </label>
        <label className="feld">
          <span>Ort (groß in der Zeile)</span>
          <input
            required
            value={entwurf.opponent_town || ''}
            onChange={(x) => setze('opponent_town', x.target.value)}
          />
        </label>
        <label className="feld">
          <span>Gegner</span>
          <input
            value={entwurf.opponent_club || ''}
            onChange={(x) => setze('opponent_club', x.target.value)}
          />
        </label>
        <label className="feld">
          <span>Lokal</span>
          <input value={entwurf.venue || ''} onChange={(x) => setze('venue', x.target.value)} />
        </label>
        <label className="feld">
          <span>Heimspiel</span>
          <input
            type="checkbox"
            checked={!!entwurf.is_home}
            onChange={(x) => setze('is_home', x.target.checked)}
          />
        </label>
        <label className="feld">
          <span>Entfernung (km)</span>
          <input
            type="number"
            min={0}
            value={entwurf.km ?? 0}
            onChange={(x) => setze('km', Number(x.target.value))}
          />
        </label>
        <label className="feld">
          <span>Treffpunkt</span>
          <input
            value={entwurf.meeting_point || ''}
            onChange={(x) => setze('meeting_point', x.target.value)}
          />
        </label>
        <label className="feld">
          <span>Spieler nötig</span>
          <input
            type="number"
            min={1}
            max={16}
            value={entwurf.needed_players ?? 4}
            onChange={(x) => setze('needed_players', Number(x.target.value))}
          />
        </label>
      </div>
      <div className="satz__aktionen">
        <button type="submit" className="knopf">
          Speichern
        </button>
        <button type="button" className="knopf" onClick={abbrechen}>
          Abbrechen
        </button>
      </div>
    </form>
  )
}

// ── Mitglieder ──────────────────────────────────────────────────────────────────────────────
function Mitglieder({ abgemeldet }: { abgemeldet: () => void }) {
  const { items, fehler, setFehler, laden } = useListe(adminApi.mitglieder, abgemeldet)
  const [neuerName, setNeuerName] = useState('')
  // Frisch ausgestellte Token, nur für diese Sitzung im Speicher — nach dem Neuladen weg (R1).
  const [tokens, setTokens] = useState<Record<string, string>>({})

  if (!items) return <p>Einen Moment …</p>

  const fangen = async (arbeit: () => Promise<unknown>) => {
    try {
      await arbeit()
      await laden()
    } catch (problem) {
      if (problem instanceof NichtAngemeldet) return abgemeldet()
      setFehler(problem instanceof Error ? problem.message : 'Nicht gespeichert.')
    }
  }

  return (
    <>
      {fehler && (
        <p className="fehler" role="status">
          {fehler}
        </p>
      )}

      <form
        className="satz__aktionen"
        onSubmit={(ereignis) => {
          ereignis.preventDefault()
          if (!neuerName.trim()) return
          void fangen(async () => {
            await adminApi.mitgliedAnlegen(neuerName.trim())
            setNeuerName('')
          })
        }}
      >
        <label className="feld" style={{ flex: '1 1 12rem' }}>
          <span>Neues Mitglied</span>
          <input value={neuerName} onChange={(x) => setNeuerName(x.target.value)} />
        </label>
        <button type="submit" className="knopf" style={{ alignSelf: 'end' }}>
          Anlegen
        </button>
      </form>

      {items.map((m: AdminMitglied) => (
        <div key={m.id} className="satz">
          <div className="satz__kopf">
            <span className="satz__name">{m.name}</span>
            <span className="satz__zusatz">
              {m.active ? 'aktiv' : 'inaktiv'} ·{' '}
              {m.hat_token ? `Link seit ${tag(m.token_issued_at)}` : 'noch kein Link'} · {m.geraete}{' '}
              {m.geraete === 1 ? 'Gerät' : 'Geräte'}
            </span>
          </div>

          <div className="satz__aktionen">
            <button
              type="button"
              className="knopf"
              onClick={() => void fangen(() => adminApi.mitgliedAendern(m.id, { active: !m.active }))}
            >
              {m.active ? 'Deaktivieren' : 'Aktivieren'}
            </button>
            <button
              type="button"
              className="knopf"
              onClick={async () => {
                if (
                  m.hat_token &&
                  !window.confirm(
                    `Neues Token für ${m.name}? Der alte Link wird ungültig und alle Geräte werden abgemeldet.`,
                  )
                ) {
                  return
                }
                try {
                  const d = await adminApi.tokenNeu(m.id)
                  setTokens((alt) => ({ ...alt, [m.id]: d.token }))
                  await laden()
                } catch (problem) {
                  if (problem instanceof NichtAngemeldet) return abgemeldet()
                  setFehler(problem instanceof Error ? problem.message : 'Nicht ausgestellt.')
                }
              }}
            >
              {m.hat_token ? 'Neues Token' : 'Link erstellen'}
            </button>
          </div>

          {tokens[m.id] && (
            <div className="token">
              <p className="token__hinweis">
                Diesen Link an {m.name} schicken — er wird nur jetzt angezeigt.
              </p>
              <code className="token__wert">
                {window.location.origin}/j/{tokens[m.id]}
              </code>
            </div>
          )}
        </div>
      ))}
    </>
  )
}

// ── Protokoll ───────────────────────────────────────────────────────────────────────────────
// Die technischen Namen sind im Protokoll gespeichert (Abschnitt 3), gelesen wird hier aber von
// einem Menschen. Unbekannte Aktionen bleiben stehen wie sie sind, statt zu verschwinden.
const WAS: Record<string, string> = {
  'session.start': 'Link geöffnet',
  'response.set': 'Rückmeldung',
  'response.correct': 'Rückmeldung korrigiert',
  'ride.set': 'Fahrdienst',
  'seat.set': 'Mitfahrt',
  'token.rotate': 'Neues Token',
  'admin.login': 'Kapitän angemeldet',
  'member.create': 'Mitglied angelegt',
  'member.update': 'Mitglied geändert',
  'fixture.create': 'Spieltag angelegt',
  'fixture.update': 'Spieltag geändert',
  'fixture.delete': 'Spieltag gelöscht',
}

function Protokoll({ abgemeldet }: { abgemeldet: () => void }) {
  const { items, fehler } = useListe(adminApi.protokoll, abgemeldet)

  if (!items) return <p>Einen Moment …</p>
  if (fehler) {
    return (
      <p className="fehler" role="status">
        {fehler}
      </p>
    )
  }
  if (!items.length) return <p className="namen">Noch nichts passiert.</p>

  return (
    <table className="protokoll">
      <thead>
        <tr>
          <th>Wann</th>
          <th>Wer</th>
          <th>Was</th>
          <th>Änderung</th>
        </tr>
      </thead>
      <tbody>
        {items.map((z: Protokollzeile, i: number) => (
          <tr key={i}>
            <td>
              {tag(z.at)} {uhrzeit(z.at)}
            </td>
            <td>
              {z.actor}
              {/* Ohne den Präfix `admin:`/`member:` sähe „Marco" aus wie der Kapitän. */}
              {z.actor_typ === 'admin' && ' (Kapitän)'}
            </td>
            <td>
              {WAS[z.action] || z.action}
              {z.target ? ` · ${z.target}` : ''}
            </td>
            <td>{[z.old_value, z.new_value].filter(Boolean).join(' → ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
