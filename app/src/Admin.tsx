import { useCallback, useEffect, useState } from 'react'
import {
  adminApi,
  NichtAngemeldet,
  type AdminMitglied,
  type AdminSpieltag,
  type Einstellungen as EinstellungenDaten,
  type Protokollzeile,
  type Mannschaft,
  type Sicherung,
  type Verwalterkonto,
  type Wer,
  ZweiterFaktorNoetig,
} from './adminApi'
import { ausEingabe, fuerEingabe, systemDatum, systemDatumZeit } from './format'
import './admin.css'

type Reiter = 'spieltage' | 'mannschaften' | 'einstellungen' | 'protokoll' | 'konto'

/**
 * Welche Reiter sieht welche Rolle? — Abschnitt 12.
 *
 * Der Kapitän sieht die Arbeit seiner Mannschaft: Spieltage, die Mannschaft selbst, und das
 * Protokoll, mit dem sich eine strittige Zusage klären lässt. Die zentralen Einstellungen gehen
 * ihn nichts an, und der Server gäbe sie ihm auch nicht.
 *
 * `konto` steht in keiner Liste: Es gehört zur Person, nicht zur Mannschaft, und wird über den
 * eigenen Namen im Kopf geöffnet.
 */
const REITER: Record<'admin' | 'kapitaen', [Reiter, string][]> = {
  admin: [
    ['spieltage', 'Spieltage'],
    ['mannschaften', 'Mannschaften'],
    ['einstellungen', 'Einstellungen'],
    ['protokoll', 'Protokoll'],
  ],
  kapitaen: [
    ['spieltage', 'Spieltage'],
    ['mannschaften', 'Mannschaft'],
    ['protokoll', 'Protokoll'],
  ],
}

export default function Admin() {
  const [ich, setIch] = useState<Wer | null>(null)
  const [prueft, setPrueft] = useState(true)
  const [reiter, setReiter] = useState<Reiter>('spieltage')
  // Abschnitt 12 · Immer GENAU eine Mannschaft gewählt, nie „alle". Sonst müsste jede anlegende
  // Route entscheiden, für welche Mannschaft ein neuer Spieltag gilt — und die Antwort „für gar
  // keine" gibt es nicht, das Schema verlangt eine.
  const [gewaehlt, setGewaehlt] = useState('')

  const werBinIch = useCallback(async () => {
    try {
      const d = await adminApi.werBinIch()
      setIch(d)
      setGewaehlt((vorher) => (d.teams.some((t) => t.id === vorher) ? vorher : (d.teams[0]?.id ?? '')))
    } catch {
      setIch(null)
    } finally {
      setPrueft(false)
    }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void werBinIch()
  }, [werBinIch])

  if (prueft) {
    return (
      <div className="admin">
        <div className="leer">
          <p>Einen Moment …</p>
        </div>
      </div>
    )
  }

  if (!ich) return <Anmeldung fertig={() => void werBinIch()} />

  const abgemeldet = () => setIch(null)

  return (
    <div className="admin">
      <header className="admin__kopf">
        <h1>{ich.rolle === 'admin' ? 'Verwaltung' : 'Kapitän'}</h1>
        <span className="admin__wer">
          {/* Ein Kapitän hat genau eine Mannschaft — dann ist eine Auswahl mit einem Eintrag
              keine Auswahl, sondern eine Irreführung. Er sieht den Namen. */}
          {ich.teams.length > 1 ? (
            <select
              className="admin__mannschaft"
              value={gewaehlt}
              onChange={(x) => setGewaehlt(x.target.value)}
              aria-label="Mannschaft"
            >
              {ich.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <strong>{ich.teams[0]?.name ?? '—'}</strong>
          )}
          {' · '}
          {/* Das eigene Konto gehört zur Person, nicht zur Mannschaft — deshalb hier und nicht
              in einem Reiter. Der Kapitän erreicht darüber seinen zweiten Faktor. */}
          <button
            type="button"
            className="kopf__abmelden"
            aria-current={reiter === 'konto'}
            onClick={() => setReiter('konto')}
          >
            {ich.email}
          </button>
          {' · '}
          <button
            type="button"
            className="kopf__abmelden"
            onClick={async () => {
              await adminApi.abmelden().catch(() => {})
              setIch(null)
            }}
          >
            Abmelden
          </button>
        </span>
      </header>

      <nav className="reiter">
        {REITER[ich.rolle].map(([wert, text]) => (
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
        {reiter === 'spieltage' && <Spieltage abgemeldet={abgemeldet} team={gewaehlt} />}
        {/* Alles, was einer Mannschaft gehört, an einem Ort: ihre Werte, ihre Mitglieder und
            ihre Kapitäne. Vorher lag das über zwei Reiter und die Einstellungen verstreut. */}
        {reiter === 'mannschaften' && (
          <MannschaftenReiter
            abgemeldet={abgemeldet}
            team={gewaehlt}
            rolle={ich.rolle}
            neuLaden={() => void werBinIch()}
          />
        )}
        {reiter === 'einstellungen' && ich.rolle === 'admin' && (
          <Einstellungen abgemeldet={abgemeldet} />
        )}
        {reiter === 'konto' && <MeinKonto abgemeldet={abgemeldet} />}
        {/* Der Gesamt-Admin sieht das ganze Protokoll — die zentralen Ereignisse gehören zu
            keiner Mannschaft und fielen sonst durch jeden Filter. */}
        {reiter === 'protokoll' && (
          <Protokoll abgemeldet={abgemeldet} team={ich.rolle === 'admin' ? '' : gewaehlt} />
        )}
      </div>
    </div>
  )
}

// ── Anmeldung ───────────────────────────────────────────────────────────────────────────────
function Anmeldung({ fertig }: { fertig: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [code, setCode] = useState('')
  // Erscheint erst, wenn der Server ihn verlangt. Vorher weiß die Maske nicht einmal, ob es für
  // dieses Konto einen zweiten Faktor gibt — und soll es auch nicht (R6).
  const [brauchtCode, setBrauchtCode] = useState(false)
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
            const d = await adminApi.anmelden(email, passwort, code)
            fertig(d.email)
          } catch (problem) {
            if (problem instanceof ZweiterFaktorNoetig) {
              setBrauchtCode(true)
              setCode('')
            }
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
          {brauchtCode && (
            <label className="feld">
              <span>Code aus der Authenticator-App</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(x) => setCode(x.target.value.replace(/\D/g, ''))}
              />
            </label>
          )}
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
function useListe<T>(holen: () => Promise<{ items: T[] }>, abgemeldet: () => void, schluessel = '') {
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
    // Stattdessen `schluessel`: Wechselt die Mannschaft, wird neu geladen — sonst zeigte die
    // Ansicht nach dem Umschalten weiter die Daten der vorigen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abgemeldet, schluessel])

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
  // -1 heißt „nicht gesetzt": Puffer von der Mannschaft, Tempo aus den Einstellungen. Die Null
  // wäre hier ein Tempo von null und ein Spieltag ohne Abfahrtszeit.
  tempo_kmh: -1,
  puffer_minuten: -1,
  needed_players: 4,
}

function Spieltage({ abgemeldet, team }: { abgemeldet: () => void; team: string }) {
  const { items, fehler, setFehler, laden } = useListe(
    () => adminApi.spieltage(team),
    abgemeldet,
    team,
  )
  const [entwurf, setEntwurf] = useState<Partial<AdminSpieltag> | null>(null)

  const speichern = async () => {
    if (!entwurf) return
    try {
      // Die Felder liefern Ortszeit ("2026-08-29T19:30"), PocketBase speichert UTC.
      // Leere Abfahrt bleibt leer — das ist die Anweisung „rechne selbst" (6.3).
      const daten = {
        ...entwurf,
        team,
        date: ausEingabe(entwurf.date),
        departure_manual: ausEingabe(entwurf.departure_manual),
      }
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
            <span className="satz__name">{s.opponent_club || s.opponent_town}</span>
            <span className="satz__zusatz">
              {systemDatumZeit(s.date)} · {s.opponent_town} ·{' '}
              {s.is_home ? 'Heim' : `Auswärts, ${s.km} km`}
              {s.locked ? ' · abgeschlossen' : ''}
            </span>
          </div>
          <div className="satz__aktionen">
            <button
              type="button"
              className="knopf"
              onClick={() =>
                // Die Felder wollen Ortszeit im Format "YYYY-MM-DDTHH:MM".
                setEntwurf({
                  ...s,
                  date: fuerEingabe(s.date),
                  departure_manual: fuerEingabe(s.departure_manual),
                })
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
                    `„${s.opponent_club || s.opponent_town}" löschen? ` +
                      'Rückmeldungen und Fahrdienst verschwinden mit.',
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
        <label className="feld feld--datum">
          <span>Datum und Anwurf</span>
          <input
            type="datetime-local"
            required
            value={String(entwurf.date || '')}
            onChange={(x) => setze('date', x.target.value)}
          />
        </label>
        <label className="feld">
          <span>Gegner (groß in der Zeile)</span>
          <input
            value={entwurf.opponent_club || ''}
            onChange={(x) => setze('opponent_club', x.target.value)}
          />
        </label>
        <label className="feld">
          <span>Ort</span>
          <input
            required
            value={entwurf.opponent_town || ''}
            onChange={(x) => setze('opponent_town', x.target.value)}
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
        {/* Nur bei Auswärtsspielen — zu einem Heimspiel fährt niemand gemeinsam los (6.3). */}
        {!entwurf.is_home && (
          <label className="feld" style={{ flex: '0 1 9rem' }}>
            <span>Tempo (km/h)</span>
            <input
              type="number"
              inputMode="numeric"
              min={20}
              max={200}
              value={(entwurf.tempo_kmh ?? -1) < 0 ? '' : entwurf.tempo_kmh}
              onChange={(x) => setze('tempo_kmh', x.target.value === '' ? -1 : Number(x.target.value))}
            />
            <span className="feld__hinweis">
              {(entwurf.tempo_kmh ?? -1) >= 0 ? 'Gilt nur hier.' : 'Leer: 80 km/h'}
            </span>
          </label>
        )}
        {!entwurf.is_home && (
          <label className="feld" style={{ flex: '0 1 9rem' }}>
            <span>Puffer (Minuten)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={180}
              value={(entwurf.puffer_minuten ?? -1) < 0 ? '' : entwurf.puffer_minuten}
              onChange={(x) =>
                setze('puffer_minuten', x.target.value === '' ? -1 : Number(x.target.value))
              }
            />
            <span className="feld__hinweis">
              {(entwurf.puffer_minuten ?? -1) >= 0 ? 'Gilt nur hier.' : 'Leer: 25 Minuten'}
            </span>
          </label>
        )}
        {!entwurf.is_home && (
          <label className="feld feld--datum">
            <span>Abfahrt</span>
            <input
              type="datetime-local"
              value={entwurf.departure_manual || ''}
              onChange={(x) => setze('departure_manual', x.target.value)}
            />
            <span className="feld__hinweis">
              {entwurf.departure_manual
                ? 'Von Hand gesetzt — die Berechnung wird für diesen Spieltag übergangen.'
                : entwurf.departure_berechnet
                  ? `Leer: berechnet ${systemDatumZeit(entwurf.departure_berechnet)}`
                  : 'Leer: wird aus Entfernung, Tempo und Puffer berechnet.'}
            </span>
          </label>
        )}
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
function Mitglieder({ abgemeldet, team }: { abgemeldet: () => void; team: string }) {
  const { items, fehler, setFehler, laden } = useListe(
    () => adminApi.mitglieder(team),
    abgemeldet,
    team,
  )
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
            await adminApi.mitgliedAnlegen(neuerName.trim(), team)
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
              {m.hat_token ? `Link seit ${systemDatum(m.token_issued_at)}` : 'noch kein Link'} · {m.geraete}{' '}
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
// ── Einstellungen ───────────────────────────────────────────────────────────────────────────
// Ein Formular, ein Knopf. Geschickt wird nur, was sich geändert hat — der Server schreibt je
// geändertem Feld eine Protokollzeile, und eine Zeile „80 → 80" wäre Rauschen.
/**
 * Was für ALLE Mannschaften gilt — Sache des Admins. Was einer einzelnen Mannschaft gehört,
 * steht im Reiter „Mannschaften"; was zur angemeldeten Person gehört, unter „Mein Konto".
 */
function Einstellungen({ abgemeldet }: { abgemeldet: () => void }) {
  const [daten, setDaten] = useState<EinstellungenDaten | null>(null)
  const [entwurf, setEntwurf] = useState<EinstellungenDaten | null>(null)
  const [fehler, setFehler] = useState('')
  const [gespeichert, setGespeichert] = useState(false)
  const [laeuft, setLaeuft] = useState(false)

  useEffect(() => {
    adminApi
      .einstellungen()
      .then((d) => {
        setDaten(d)
        setEntwurf(d)
      })
      .catch((problem) => {
        if (problem instanceof NichtAngemeldet) return abgemeldet()
        setFehler(problem instanceof Error ? problem.message : 'Nicht geladen.')
      })
  }, [abgemeldet])

  if (!daten || !entwurf) {
    return fehler ? (
      <p className="fehler" role="status">
        {fehler}
      </p>
    ) : (
      <p>Einen Moment …</p>
    )
  }

  const setzen = (teil: Partial<EinstellungenDaten>) => {
    setEntwurf({ ...entwurf, ...teil })
    setGespeichert(false)
  }

  // Zahlenfelder dürfen beim Tippen kurz leer sein — NaN sperrt dann den Speichern-Knopf, statt
  // aus dem leeren Feld eine 0 zu machen.
  const zahl = (wert: string) => (wert === '' ? Number.NaN : Number(wert))

  const name = entwurf.anzeigename.trim()
  const zahlenOk = Number.isFinite(entwurf.auto_sperre_stunden)
  const veraendert =
    name !== daten.anzeigename ||
    entwurf.auto_sperre_stunden !== daten.auto_sperre_stunden ||
    entwurf.impressum.trim() !== daten.impressum ||
    entwurf.datenschutz.trim() !== daten.datenschutz

  const speichern = (ereignis: React.FormEvent) => {
    ereignis.preventDefault()
    if (!name || !zahlenOk || !veraendert) return

    const aenderung: Partial<EinstellungenDaten> = {}
    if (name !== daten.anzeigename) aenderung.anzeigename = name
    if (entwurf.auto_sperre_stunden !== daten.auto_sperre_stunden) {
      aenderung.auto_sperre_stunden = entwurf.auto_sperre_stunden
    }
    if (entwurf.impressum.trim() !== daten.impressum) aenderung.impressum = entwurf.impressum.trim()
    if (entwurf.datenschutz.trim() !== daten.datenschutz) aenderung.datenschutz = entwurf.datenschutz.trim()

    setLaeuft(true)
    setFehler('')
    setGespeichert(false)
    adminApi
      .einstellungenAendern(aenderung)
      .then((d) => {
        setDaten(d)
        setEntwurf(d)
        setGespeichert(true)
      })
      .catch((problem) => {
        if (problem instanceof NichtAngemeldet) return abgemeldet()
        setFehler(problem instanceof Error ? problem.message : 'Nicht gespeichert.')
      })
      .finally(() => setLaeuft(false))
  }

  return (
    <>
    <form onSubmit={speichern}>
      {fehler && (
        <p className="fehler" role="status">
          {fehler}
        </p>
      )}

      {/* ── Name ─────────────────────────────────────────────────────────────────────────── */}
      <div className="satz">
        <div className="satz__kopf">
          <span className="satz__name">Name des Vereins</span>
          <span className="satz__zusatz">
            Der Name eures Vereins — er steht dort, wo es um die Anwendung als Ganzes geht: über
            Impressum und Datenschutzhinweis, auf der Seite „Link ungültig", und als Herausgeber in
            der Authenticator-App. Auf der <strong>Einladungsseite</strong> steht dagegen der Name
            der Mannschaft, zu der der Link gehört.
          </span>
        </div>

        <div className="satz__aktionen">
          <label className="feld" style={{ flex: '1 1 14rem' }}>
            <span>Vereinsname</span>
            <input
              value={entwurf.anzeigename}
              maxLength={60}
              onChange={(x) => setzen({ anzeigename: x.target.value })}
            />
          </label>
        </div>

        {/* Derselbe Kasten wie beim frisch ausgestellten Token — hier steht etwas, das man
            gelesen haben muss, bevor man es tut. */}
        <div className="token">
          <p className="token__hinweis">Wer den Link weiterleitet, zeigt diesen Namen mit</p>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            Die Vorschau entsteht auf den Servern des Messengers, bevor ein Mensch den Link antippt.
            Alles, was hier steht, ist damit für jeden sichtbar, der einen weitergeleiteten Link
            bekommt. Der Mannschaftsname ist dafür in Ordnung — Namen einzelner Personen, Adressen
            oder Spielorte gehören nicht hierher.
          </p>
        </div>
      </div>

      {/* ── Automatisches Sperren ────────────────────────────────────────────────────────── */}
      <div className="satz">
        <div className="satz__kopf">
          <span className="satz__name">Spieltage von selbst schließen</span>
          <span className="satz__zusatz">
            Ein gespielter Spieltag nimmt keine Rückmeldungen mehr an. Mit einer Frist erledigt das
            die App, statt dass du nach jedem Spiel daran denken musst. <strong>0 = aus</strong> —
            dann sperrst du weiterhin von Hand.
          </span>
        </div>

        <div className="satz__aktionen">
          <label className="feld" style={{ flex: '0 1 12rem' }}>
            <span>Stunden nach Anwurf</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={168}
              value={Number.isFinite(entwurf.auto_sperre_stunden) ? entwurf.auto_sperre_stunden : ''}
              onChange={(x) =>
                setzen({ auto_sperre_stunden: zahl(x.target.value) })
              }
            />
          </label>
          <span className="satz__zusatz" style={{ alignSelf: 'end', paddingBottom: '0.5rem' }}>
            {entwurf.auto_sperre_stunden > 0
              ? `Gesperrt wird stündlich geprüft — ein Spieltag schließt also bis zu eine Stunde nach Ablauf der Frist.`
              : 'Ausgeschaltet.'}
          </span>
        </div>
      </div>

      {/* ── Impressum und Datenschutz ────────────────────────────────────────────────────── */}
      <div className="satz">
        <div className="satz__kopf">
          <span className="satz__name">Impressum und Datenschutz</span>
          <span className="satz__zusatz">
            Jeder Text bekommt eine eigene Seite, verlinkt im Fuß des Aushangs und auf der
            Einladungsseite. <strong>Leer heißt: es gibt die Seite nicht</strong> und es wird auch
            nicht darauf verlinkt. Beide Seiten sind ohne Anmeldung erreichbar — ein Hinweis, den
            man erst nach dem Anmelden zu sehen bekommt, erfüllt seinen Zweck nicht.
          </span>
        </div>

        <div className="satz__aktionen" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <label className="feld">
            <span>Impressum</span>
            <textarea
              rows={6}
              maxLength={8000}
              value={entwurf.impressum}
              onChange={(x) => setzen({ impressum: x.target.value })}
            />
          </label>
          <label className="feld">
            <span>Datenschutzhinweis</span>
            <textarea
              rows={10}
              maxLength={8000}
              value={entwurf.datenschutz}
              onChange={(x) => setzen({ datenschutz: x.target.value })}
            />
          </label>
        </div>

        <div className="token">
          <p className="token__hinweis">Reiner Text, keine Formatierung</p>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            Absätze entstehen durch Leerzeilen. HTML wird nicht ausgewertet, sondern angezeigt wie
            getippt — das ist Absicht und schließt eine ganze Klasse von Angriffen aus. Was
            hineingehört, ist eine Rechtsfrage: die App kann dir dabei nicht helfen, und dieser
            Hinweis ist keine Rechtsberatung.
          </p>
        </div>
      </div>

      {/* ── Speichern ────────────────────────────────────────────────────────────────────── */}
      <div className="satz">
        <div className="satz__aktionen">
          <button type="submit" className="knopf" disabled={laeuft || !veraendert || !name || !zahlenOk}>
            {laeuft ? 'Speichert …' : 'Speichern'}
          </button>
          {gespeichert && (
            <span className="satz__zusatz" style={{ alignSelf: 'center' }} role="status">
              Gespeichert. Schon verschickte Links behalten ihre alte Vorschau — die speichert der
              Messenger zwischen.
            </span>
          )}
        </div>
      </div>
    </form>
    <Sicherungen abgemeldet={abgemeldet} />
    </>
  )
}

/**
 * „Mein Konto" — was zur angemeldeten Person gehört und zu keiner Mannschaft: der zweite Faktor
 * und das eigene Passwort.
 *
 * Steht bewusst nicht in der Reiterleiste, sondern hinter dem eigenen Namen im Kopf. Ein Kapitän
 * sieht sonst nur Spieltage, Mannschaft und Protokoll — sein Konto ist keine vierte Aufgabe,
 * sondern eine Eigenschaft von ihm.
 */
function MeinKonto({ abgemeldet }: { abgemeldet: () => void }) {
  return (
    <>
      <ZweiterFaktor abgemeldet={abgemeldet} />
      <Passwort abgemeldet={abgemeldet} />
    </>
  )
}

/**
 * Das eigene Passwort ändern. Kapitäne bekommen ein erzeugtes und sollen es ersetzen können,
 * ohne dafür jemanden zu fragen.
 */
function Passwort({ abgemeldet }: { abgemeldet: () => void }) {
  const [alt, setAlt] = useState('')
  const [neu, setNeu] = useState('')
  const [wiederholt, setWiederholt] = useState('')
  const [fehler, setFehler] = useState('')
  const [fertig, setFertig] = useState('')
  const [laeuft, setLaeuft] = useState(false)

  const passt = neu.length >= 10 && neu === wiederholt && alt.length > 0

  return (
    <div className="satz">
      <div className="satz__kopf">
        <span className="satz__name">Passwort ändern</span>
        <span className="satz__zusatz">
          Mindestens zehn Zeichen. Das bisherige muss mit — sonst genügte eine übernommene
          Sitzung, um dich dauerhaft auszusperren. Deine anderen angemeldeten Geräte fliegen
          dabei heraus; das ist meist der Grund, warum man ein Passwort ändert.
        </span>
      </div>

      {fehler && (
        <p className="fehler" role="status">
          {fehler}
        </p>
      )}
      {fertig && (
        <p className="satz__zusatz" role="status">
          {fertig}
        </p>
      )}

      <div className="satz__aktionen" style={{ flexWrap: 'wrap' }}>
        <label className="feld" style={{ flex: '1 1 12rem' }}>
          <span>Bisheriges Passwort</span>
          <input
            type="password"
            autoComplete="current-password"
            value={alt}
            onChange={(x) => setAlt(x.target.value)}
          />
        </label>
        <label className="feld" style={{ flex: '1 1 12rem' }}>
          <span>Neues Passwort</span>
          <input
            type="password"
            autoComplete="new-password"
            value={neu}
            onChange={(x) => setNeu(x.target.value)}
          />
        </label>
        <label className="feld" style={{ flex: '1 1 12rem' }}>
          <span>Noch einmal</span>
          <input
            type="password"
            autoComplete="new-password"
            value={wiederholt}
            onChange={(x) => setWiederholt(x.target.value)}
          />
          {neu.length > 0 && neu.length < 10 && (
            <span className="feld__hinweis">Noch zu kurz.</span>
          )}
          {neu.length >= 10 && wiederholt.length > 0 && neu !== wiederholt && (
            <span className="feld__hinweis">Die beiden stimmen nicht überein.</span>
          )}
        </label>
      </div>

      <div className="satz__aktionen">
        <button
          type="button"
          className="knopf"
          disabled={!passt || laeuft}
          onClick={async () => {
            setLaeuft(true)
            setFehler('')
            setFertig('')
            try {
              const d = await adminApi.passwortAendern(alt, neu)
              setAlt('')
              setNeu('')
              setWiederholt('')
              setFertig(
                d.sitzungen_beendet
                  ? `Geändert. ${d.sitzungen_beendet} weitere Anmeldung(en) beendet.`
                  : 'Geändert.',
              )
            } catch (x) {
              if (x instanceof NichtAngemeldet) return abgemeldet()
              setFehler(x instanceof Error ? x.message : 'Das hat nicht geklappt.')
            } finally {
              setLaeuft(false)
            }
          }}
        >
          {laeuft ? 'Ändert …' : 'Passwort ändern'}
        </button>
      </div>
    </div>
  )
}

/**
 * Zweiter Faktor für den Kapitäns-Login — Abschnitt 9, der letzte offene Punkt aus dem
 * Umsetzungsplan.
 *
 * Zweistufig mit Absicht: Das Geheimnis entsteht beim ersten Klick, gilt aber erst, wenn ein
 * Code daraus gestimmt hat. Wer das Fenster zu früh schließt oder die App falsch einrichtet,
 * hätte sonst einen zweiten Faktor, den er nicht erzeugen kann — und käme an genau diese
 * Ansicht, die ihn abschalten würde, nicht mehr heran.
 */
function ZweiterFaktor({ abgemeldet }: { abgemeldet: () => void }) {
  const [stand, setStand] = useState<{ aktiv: boolean; ausstehend: boolean } | null>(null)
  const [start, setStart] = useState<{ geheimnis: string; uri: string } | null>(null)
  const [code, setCode] = useState('')
  const [abschalten, setAbschalten] = useState(false)
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)

  const laden = useCallback(async () => {
    try {
      setStand(await adminApi.zweiterFaktor())
    } catch (x) {
      if (x instanceof NichtAngemeldet) return abgemeldet()
      setFehler(x instanceof Error ? x.message : 'Konnte nicht geladen werden.')
    }
  }, [abgemeldet])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void laden()
  }, [laden])

  async function fuehreAus(tun: () => Promise<unknown>) {
    setFehler('')
    setLaeuft(true)
    try {
      await tun()
      await laden()
    } catch (x) {
      if (x instanceof NichtAngemeldet) return abgemeldet()
      setFehler(x instanceof Error ? x.message : 'Das hat nicht geklappt.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div className="satz">
      <div className="satz__kopf">
        <span className="satz__name">Zweiter Faktor</span>
        <span className="satz__zusatz">
          Zusätzlich zum Passwort ein sechsstelliger Code aus einer Authenticator-App auf deinem
          Handy. Wer dein Passwort erfährt, kommt damit trotzdem nicht in die Kapitänsansicht.
          Funktioniert mit jeder gängigen App — Aegis, 2FAS, Google Authenticator, Bitwarden,
          1Password.
        </span>
      </div>

      {fehler && (
        <p className="fehler" role="status">
          {fehler}
        </p>
      )}

      {stand === null ? (
        <p className="namen">Einen Moment …</p>
      ) : stand.aktiv && !abschalten ? (
        <div className="satz__aktionen">
          <span className="satz__zusatz" style={{ flex: '1 1 12rem' }}>
            <strong>Eingeschaltet.</strong> Beim Anmelden fragt die App nach dem Code.
          </span>
          <button
            type="button"
            className="knopf knopf--gefahr"
            disabled={laeuft}
            onClick={() => {
              setAbschalten(true)
              setCode('')
              setFehler('')
            }}
          >
            Abschalten
          </button>
        </div>
      ) : stand.aktiv && abschalten ? (
        <div className="token">
          <p className="token__hinweis">Zum Abschalten einen gültigen Code eintippen</p>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
            Auch das Abschalten braucht den zweiten Faktor. Sonst genügte eine übernommene
            Sitzung, um ihn mit einem Klick loszuwerden — und er schützte nur, bis jemand drin ist.
          </p>
          <label className="feld">
            <span>Code</span>
            <input
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(x) => setCode(x.target.value.replace(/\D/g, ''))}
            />
          </label>
          <div className="satz__aktionen">
            <button
              type="button"
              className="knopf knopf--gefahr"
              disabled={code.length !== 6 || laeuft}
              onClick={() =>
                fuehreAus(async () => {
                  await adminApi.zweiterFaktorAus(code)
                  setAbschalten(false)
                  setCode('')
                })
              }
            >
              Abschalten
            </button>
            <button type="button" className="knopf" disabled={laeuft} onClick={() => setAbschalten(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : start ? (
        <div className="token">
          <p className="token__hinweis">Jetzt in die App eintragen — danach mit einem Code bestätigen</p>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
            Auf dem Handy: den Link antippen, dann öffnet sich deine Authenticator-App von selbst.
            Am Rechner: das Geheimnis von Hand eintragen.
          </p>
          <p style={{ margin: '0 0 0.5rem' }}>
            <a href={start.uri}>In der Authenticator-App öffnen</a>
          </p>
          <p
            style={{
              margin: '0 0 0.75rem',
              fontFamily: 'var(--schrift-fest, monospace)',
              wordBreak: 'break-all',
              fontSize: '1.05rem',
            }}
          >
            {(start.geheimnis.match(/.{1,4}/g) || []).join(' ')}
          </p>
          <label className="feld">
            <span>Code aus der App</span>
            <input
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(x) => setCode(x.target.value.replace(/\D/g, ''))}
            />
          </label>
          <div className="satz__aktionen">
            <button
              type="button"
              className="knopf"
              disabled={code.length !== 6 || laeuft}
              onClick={() =>
                fuehreAus(async () => {
                  await adminApi.zweiterFaktorBestaetigen(code)
                  setStart(null)
                  setCode('')
                })
              }
            >
              {laeuft ? 'Prüft …' : 'Einschalten'}
            </button>
            <button
              type="button"
              className="knopf"
              disabled={laeuft}
              onClick={() =>
                fuehreAus(async () => {
                  await adminApi.zweiterFaktorAus('')
                  setStart(null)
                  setCode('')
                })
              }
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="satz__aktionen">
          <span className="satz__zusatz" style={{ flex: '1 1 12rem' }}>
            {stand.ausstehend
              ? 'Eine Einrichtung wurde begonnen, aber nie bestätigt. Sie gilt nicht.'
              : 'Ausgeschaltet. Es genügt das Passwort.'}
          </span>
          <button
            type="button"
            className="knopf"
            disabled={laeuft}
            onClick={() =>
              fuehreAus(async () => {
                if (stand.ausstehend) await adminApi.zweiterFaktorAus('')
                setStart(await adminApi.zweiterFaktorBeginnen())
                setCode('')
              })
            }
          >
            Einrichten
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Der Reiter „Mannschaften" — alles, was einer Mannschaft gehört, an einem Ort.
 *
 * Welche Mannschaft gemeint ist, steht in der Auswahl im Kopf. Ein Kapitän hat dort genau eine;
 * für ihn ist dieser Reiter schlicht „meine Mannschaft".
 */
function MannschaftenReiter({
  abgemeldet,
  team,
  rolle,
  neuLaden,
}: {
  abgemeldet: () => void
  team: string
  rolle: 'admin' | 'kapitaen'
  neuLaden: () => void
}) {
  return (
    <>
      <Mannschaftseinstellungen abgemeldet={abgemeldet} team={team} neuLaden={neuLaden} />
      <Mitglieder abgemeldet={abgemeldet} team={team} />
      {rolle === 'admin' && <Kapitaene abgemeldet={abgemeldet} team={team} />}
      {rolle === 'admin' && <Mannschaften abgemeldet={abgemeldet} neuLaden={neuLaden} />}
    </>
  )
}

/**
 * Was einer einzelnen Mannschaft gehört — Abschnitt 12. Das darf ihr Kapitän ändern, denn es ist
 * seine Mannschaft; die zentralen Einstellungen darüber sieht er gar nicht.
 */
function Mannschaftseinstellungen({
  abgemeldet,
  team,
  neuLaden,
}: {
  abgemeldet: () => void
  team: string
  neuLaden: () => void
}) {
  const [satz, setSatz] = useState<Mannschaft | null>(null)
  const [entwurf, setEntwurf] = useState<Mannschaft | null>(null)
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [gespeichert, setGespeichert] = useState(false)

  const laden = useCallback(async () => {
    try {
      const alle = (await adminApi.mannschaften()).items
      const meine = alle.find((x) => x.id === team) ?? null
      setSatz(meine)
      setEntwurf(meine)
    } catch (x) {
      if (x instanceof NichtAngemeldet) return abgemeldet()
      setFehler(x instanceof Error ? x.message : 'Nicht geladen.')
    }
  }, [abgemeldet, team])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void laden()
  }, [laden])

  if (!satz || !entwurf) return <p className="namen">Einen Moment …</p>

  const name = entwurf.name.trim()
  const veraendert = name !== satz.name

  return (
    <div className="satz">
      <div className="satz__kopf">
        <span className="satz__name">Diese Mannschaft</span>
        <span className="satz__zusatz">
          Der Name steht im Aushang und in dieser Ansicht. Tempo und Rüstzeit stehen am einzelnen
          Spieltag — sie unterscheiden sich von Fahrt zu Fahrt mehr als von Mannschaft zu
          Mannschaft.
        </span>
      </div>

      {fehler && (
        <p className="fehler" role="status">
          {fehler}
        </p>
      )}

      <div className="satz__aktionen">
        <label className="feld" style={{ flex: '1 1 14rem' }}>
          <span>Name</span>
          <input
            maxLength={60}
            value={entwurf.name}
            onChange={(x) => {
              setEntwurf({ ...entwurf, name: x.target.value })
              setGespeichert(false)
            }}
          />
        </label>
      </div>

      <div className="satz__aktionen">
        <button
          type="button"
          className="knopf"
          disabled={!name || !veraendert || laeuft}
          onClick={async () => {
            setLaeuft(true)
            setFehler('')
            try {
              await adminApi.mannschaftAendern(satz.id, { name })
              setGespeichert(true)
              await laden()
              // Der Kopf zeigt den Namen — er muss den neuen zeigen, nicht den alten.
              neuLaden()
            } catch (x) {
              if (x instanceof NichtAngemeldet) return abgemeldet()
              setFehler(x instanceof Error ? x.message : 'Nicht gespeichert.')
            } finally {
              setLaeuft(false)
            }
          }}
        >
          {laeuft ? 'Speichert …' : 'Speichern'}
        </button>
        {gespeichert && (
          <span className="satz__zusatz" style={{ alignSelf: 'center' }} role="status">
            Gespeichert.
          </span>
        )}
      </div>
    </div>
  )
}

/** Mannschaften anlegen und auflösen — Sache des Gesamt-Admins (Abschnitt 12). */
function Mannschaften({ abgemeldet, neuLaden }: { abgemeldet: () => void; neuLaden: () => void }) {
  const { items, fehler, setFehler, laden } = useListe<Mannschaft>(adminApi.mannschaften, abgemeldet)
  const [neu, setNeu] = useState('')
  const [laeuft, setLaeuft] = useState(false)

  return (
    <div className="satz">
      <div className="satz__kopf">
        <span className="satz__name">Alle Mannschaften</span>
        <span className="satz__zusatz">
          Jede Mannschaft hat eigene Mitglieder, eigene Spieltage und einen eigenen Kapitän. Was
          zentral steht — Rechtstexte, Sperrfrist, Sicherungen — gilt für alle gemeinsam.
        </span>
      </div>

      {fehler && (
        <p className="fehler" role="status">
          {fehler}
        </p>
      )}

      <div className="satz__aktionen">
        <label className="feld" style={{ flex: '1 1 14rem' }}>
          <span>Neue Mannschaft</span>
          <input maxLength={60} value={neu} onChange={(x) => setNeu(x.target.value)} />
        </label>
        <button
          type="button"
          className="knopf"
          disabled={!neu.trim() || laeuft}
          onClick={async () => {
            setLaeuft(true)
            setFehler('')
            try {
              await adminApi.mannschaftAnlegen(neu.trim())
              setNeu('')
              await laden()
              neuLaden()
            } catch (x) {
              if (x instanceof NichtAngemeldet) return abgemeldet()
              setFehler(x instanceof Error ? x.message : 'Nicht angelegt.')
            } finally {
              setLaeuft(false)
            }
          }}
        >
          Anlegen
        </button>
      </div>

      {items === null ? (
        <p className="namen">Einen Moment …</p>
      ) : (
        <ul className="namen" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((t) => (
            <li
              key={t.id}
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'baseline',
                padding: '0.35rem 0',
                borderTop: 'var(--linie)',
              }}
            >
              <span style={{ flex: '1 1 auto' }}>{t.name}</span>
              <button
                type="button"
                className="knopf knopf--gefahr"
                disabled={laeuft}
                onClick={async () => {
                  if (!window.confirm(`Mannschaft „${t.name}" auflösen?`)) return
                  setLaeuft(true)
                  setFehler('')
                  try {
                    await adminApi.mannschaftLoeschen(t.id)
                    await laden()
                    neuLaden()
                  } catch (x) {
                    if (x instanceof NichtAngemeldet) return abgemeldet()
                    // Der Server lässt eine Mannschaft mit Inhalt nicht löschen und sagt warum.
                    setFehler(x instanceof Error ? x.message : 'Nicht gelöscht.')
                  } finally {
                    setLaeuft(false)
                  }
                }}
              >
                Auflösen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
/**
 * Die Kapitäne EINER Mannschaft — Abschnitt 12.
 *
 * Mehrere sind ausdrücklich vorgesehen und brauchen keinen eigenen Begriff: Eine Vertretung ist
 * schlicht ein zweites Konto auf dieselbe Mannschaft, mit denselben Rechten. Wer was getan hat,
 * steht ohnehin im Protokoll.
 *
 * Das Passwort wird erzeugt und genau einmal angezeigt, wie der Einladungslink eines Mitglieds.
 * Gespeichert ist davon nur ein Hash; herausholen kann es niemand, auch der Gesamt-Admin nicht.
 */
function Kapitaene({ abgemeldet, team }: { abgemeldet: () => void; team: string }) {
  const { items, fehler, setFehler, laden } = useListe<Verwalterkonto>(adminApi.verwalter, abgemeldet)
  // Für die Verknüpfung zum Spielereintrag — das Vorbild ist `playerId` in der Dartszentrale.
  const { items: spieler } = useListe<AdminMitglied>(
    () => adminApi.mitglieder(team),
    abgemeldet,
    team,
  )
  const [email, setEmail] = useState('')
  const [mitglied, setMitglied] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [gezeigt, setGezeigt] = useState<{ email: string; passwort: string } | null>(null)

  // Nur die dieser Mannschaft. Der Gesamt-Admin selbst taucht hier nicht auf — er gehört zu
  // keiner, und ihn versehentlich zu löschen wäre der schnellste Weg, sich auszusperren.
  const meine = (items ?? []).filter((v) => v.rolle === 'kapitaen' && v.team === team)

  async function fuehreAus(tun: () => Promise<unknown>) {
    setLaeuft(true)
    setFehler('')
    try {
      await tun()
      await laden()
    } catch (x) {
      if (x instanceof NichtAngemeldet) return abgemeldet()
      setFehler(x instanceof Error ? x.message : 'Das hat nicht geklappt.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div className="satz">
      <div className="satz__kopf">
        <span className="satz__name">Kapitäne dieser Mannschaft</span>
        <span className="satz__zusatz">
          Ein Kapitän sieht ausschließlich diese Mannschaft: Mitglieder anlegen und bearbeiten,
          Spieltage pflegen, Rückmeldungen korrigieren. Von den zentralen Einstellungen und den
          Sicherungen bekommt er nichts zu sehen. <strong>Mehrere sind möglich</strong> — eine
          Vertretung ist einfach ein zweites Konto.
        </span>
      </div>

      {fehler && (
        <p className="fehler" role="status">
          {fehler}
        </p>
      )}

      {gezeigt && (
        <div className="token">
          <p className="token__hinweis">Dieses Passwort wird genau einmal angezeigt</p>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
            Gib es <strong>{gezeigt.email}</strong> weiter, am besten im Einzelchat. Wieder
            hervorholen lässt es sich nicht — gespeichert ist nur ein Hash. Ist es weg, erzeugst du
            ein neues.
          </p>
          <p
            style={{
              margin: '0 0 0.5rem',
              fontFamily: 'var(--schrift-mono, monospace)',
              fontSize: '1.1rem',
              wordBreak: 'break-all',
            }}
          >
            {gezeigt.passwort}
          </p>
          <button type="button" className="knopf" onClick={() => setGezeigt(null)}>
            Verstanden
          </button>
        </div>
      )}

      <div className="satz__aktionen">
        <label className="feld" style={{ flex: '1 1 16rem' }}>
          <span>E-Mail-Adresse</span>
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(x) => setEmail(x.target.value)}
          />
        </label>
        <label className="feld" style={{ flex: '0 1 12rem' }}>
          <span>Spielt als</span>
          <select value={mitglied} onChange={(x) => setMitglied(x.target.value)}>
            <option value="">— spielt nicht mit —</option>
            {(spieler ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="feld__hinweis">
            Sein Eintrag in dieser Mannschaft. Wer nur organisiert, bleibt unverknüpft.
          </span>
        </label>
        <button
          type="button"
          className="knopf"
          disabled={!email.trim() || !team || laeuft}
          onClick={() =>
            fuehreAus(async () => {
              const d = await adminApi.verwalterAnlegen(email.trim(), 'kapitaen', team, mitglied)
              setGezeigt({ email: d.email, passwort: d.passwort })
              setEmail('')
              setMitglied('')
            })
          }
        >
          {meine.length ? 'Weiteren Kapitän anlegen' : 'Kapitän anlegen'}
        </button>
      </div>

      {items === null ? (
        <p className="namen">Einen Moment …</p>
      ) : meine.length === 0 ? (
        <p className="namen">
          Noch kein Kapitän. Solange keiner da ist, betreust du diese Mannschaft selbst.
        </p>
      ) : (
        <ul className="namen" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {meine.map((v) => (
            <li
              key={v.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                alignItems: 'baseline',
                padding: '0.35rem 0',
                borderTop: 'var(--linie)',
              }}
            >
              <span style={{ flex: '1 1 14rem' }}>
                {v.email}
                {v.mitglied && (
                  <span className="satz__zusatz">
                    {' · spielt als '}
                    {(spieler ?? []).find((m) => m.id === v.mitglied)?.name ?? '—'}
                  </span>
                )}
              </span>
              <span className="satz__zusatz">
                {v.totp ? 'zweiter Faktor an' : 'nur Passwort'}
              </span>
              {v.totp && (
                <button
                  type="button"
                  className="knopf"
                  disabled={laeuft}
                  onClick={() => {
                    // Das ist eine Schwächung — sie gehört bestätigt und steht im Protokoll.
                    if (
                      !window.confirm(
                        `Zweiten Faktor von „${v.email}" abschalten? ` +
                          'Danach genügt sein Passwort. Er kann ihn selbst wieder einrichten.',
                      )
                    ) {
                      return
                    }
                    void fuehreAus(() => adminApi.verwalterZweiterFaktorAus(v.id))
                  }}
                >
                  Faktor abschalten
                </button>
              )}
              <button
                type="button"
                className="knopf"
                disabled={laeuft}
                onClick={() =>
                  fuehreAus(async () => {
                    const d = await adminApi.verwalterAendern(v.id, { neues_passwort: true })
                    if (d.passwort) setGezeigt({ email: v.email, passwort: d.passwort })
                  })
                }
              >
                Neues Passwort
              </button>
              <button
                type="button"
                className="knopf knopf--gefahr"
                disabled={laeuft}
                onClick={() => {
                  if (!window.confirm(`Konto „${v.email}" löschen? Offene Sitzungen enden sofort.`)) return
                  void fuehreAus(() => adminApi.verwalterLoeschen(v.id))
                }}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Sicherungen von Hand — Abschnitt 7.4.
 *
 * Der Rückhalt bleibt `scripts/backup.sh` als nächtlicher Cronjob auf einer anderen Maschine:
 * Was hier entsteht, entsteht nur, wenn jemand daran denkt. Der Zweck dieses Abschnitts ist ein
 * anderer — dass ein Kapitän ohne SSH, ohne SFTP und ohne Kenntnis irgendeines Pfades eine Kopie
 * in die Hand bekommt und sie im Ernstfall auch wieder einspielen kann.
 */
function Sicherungen({ abgemeldet }: { abgemeldet: () => void }) {
  // Derselbe Ladezustand wie bei Spieltagen, Mitgliedern und Protokoll.
  const { items: liste, fehler, setFehler, laden } = useListe<Sicherung>(adminApi.sicherungen, abgemeldet)
  const [laeuft, setLaeuft] = useState('')
  const [zurueck, setZurueck] = useState('')
  const [getippt, setGetippt] = useState('')
  const [neustart, setNeustart] = useState(false)

  async function fuehreAus(was: string, tun: () => Promise<unknown>) {
    setFehler('')
    setLaeuft(was)
    try {
      await tun()
      await laden()
    } catch (x) {
      if (x instanceof NichtAngemeldet) return abgemeldet()
      setFehler(x instanceof Error ? x.message : 'Das hat nicht geklappt.')
    } finally {
      setLaeuft('')
    }
  }

  async function zurueckspielen() {
    setFehler('')
    setLaeuft('restore')
    try {
      await adminApi.sicherungZurueckspielen(zurueck)
      // PocketBase startet sich danach selbst neu — bis dahin antwortet nichts.
      setNeustart(true)
      setZurueck('')
      setGetippt('')
      setTimeout(() => window.location.reload(), 8000)
    } catch (x) {
      if (x instanceof NichtAngemeldet) return abgemeldet()
      setFehler(x instanceof Error ? x.message : 'Das hat nicht geklappt.')
      setLaeuft('')
    }
  }

  if (neustart) {
    return (
      <div className="satz">
        <div className="satz__kopf">
          <span className="satz__name">Wird zurückgespielt …</span>
          <span className="satz__zusatz">
            Die App startet gerade neu und ist ein paar Sekunden lang nicht erreichbar. Diese Seite
            lädt sich gleich von selbst neu. Danach musst du dich wahrscheinlich neu anmelden — die
            Sitzungen stammen jetzt aus der zurückgespielten Sicherung.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="satz">
      <div className="satz__kopf">
        <span className="satz__name">Sicherungen</span>
        <span className="satz__zusatz">
          Eine Sicherung enthält <strong>alles</strong> — Mitglieder, Spieltage, Rückmeldungen. Die
          heruntergeladene Datei ist unverschlüsselt: Sie gehört auf deinen eigenen Rechner, nicht
          in eine Cloud und nicht in einen Gruppenchat. Und sie gehört{' '}
          <strong>weg vom Server</strong>, denn eine Kopie neben dem Original ist im Ernstfall
          genauso verloren wie das Original.
        </span>
      </div>

      {fehler && (
        <p className="fehler" role="status">
          {fehler}
        </p>
      )}

      <div className="satz__aktionen">
        <button
          type="button"
          className="knopf"
          disabled={laeuft !== ''}
          onClick={() => fuehreAus('create', adminApi.sicherungErstellen)}
        >
          {laeuft === 'create' ? 'Erstellt …' : 'Sicherung erstellen'}
        </button>
        <label className="feld" style={{ flex: '1 1 14rem' }}>
          <span>Datei zurückgeben</span>
          <input
            type="file"
            accept=".zip"
            disabled={laeuft !== ''}
            onChange={(x) => {
              const datei = x.target.files?.[0]
              x.target.value = ''
              if (datei) fuehreAus('upload', () => adminApi.sicherungHochladen(datei))
            }}
          />
        </label>
      </div>

      {liste === null ? (
        <p className="namen">Einen Moment …</p>
      ) : liste.length === 0 ? (
        <p className="namen">Noch keine Sicherung vorhanden.</p>
      ) : (
        <ul className="namen" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {liste.map((x) => (
            <li key={x.name} style={{ padding: '0.35rem 0', borderTop: 'var(--linie)' }}>
              <div
                style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'baseline' }}
              >
                <a href={adminApi.sicherungUrl(x.name)} style={{ flex: '1 1 16rem' }}>
                  {x.name}
                </a>
                <span className="satz__zusatz">
                  {Math.max(1, Math.round(x.groesse / 1024))} KB
                </span>
                <button
                  type="button"
                  className="knopf"
                  disabled={laeuft !== ''}
                  onClick={() => {
                    if (!window.confirm(`„${x.name}" vom Server löschen?`)) return
                    fuehreAus('delete', () => adminApi.sicherungLoeschen(x.name))
                  }}
                >
                  Löschen
                </button>
                <button
                  type="button"
                  className="knopf knopf--gefahr"
                  disabled={laeuft !== ''}
                  onClick={() => {
                    setZurueck(x.name)
                    setGetippt('')
                    setFehler('')
                  }}
                >
                  Zurückspielen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {zurueck && (
        <div className="token">
          <p className="token__hinweis">Das ersetzt den gesamten heutigen Stand</p>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
            Alles, was seit <strong>{zurueck}</strong> passiert ist, ist danach weg. Vom jetzigen
            Stand wird vorher automatisch eine Kopie angelegt — ein Fehlgriff lässt sich also
            zurücknehmen. Tipp zur Bestätigung den Dateinamen ab:
          </p>
          <label className="feld">
            <span>Dateiname</span>
            <input
              value={getippt}
              onChange={(x) => setGetippt(x.target.value)}
              placeholder={zurueck}
              autoComplete="off"
            />
          </label>
          <div className="satz__aktionen">
            <button
              type="button"
              className="knopf knopf--gefahr"
              disabled={getippt !== zurueck || laeuft !== ''}
              onClick={zurueckspielen}
            >
              {laeuft === 'restore' ? 'Spielt zurück …' : 'Jetzt zurückspielen'}
            </button>
            <button
              type="button"
              className="knopf"
              disabled={laeuft !== ''}
              onClick={() => {
                setZurueck('')
                setGetippt('')
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

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
  'settings.update': 'Einstellung geändert',
  'fixture.lock': 'Spieltag gesperrt',
  'admin.totp.on': 'Zweiter Faktor eingeschaltet',
  'admin.totp.off': 'Zweiter Faktor abgeschaltet',
  'backup.create': 'Sicherung erstellt',
  'backup.download': 'Sicherung heruntergeladen',
  'backup.upload': 'Sicherung hochgeladen',
  'backup.delete': 'Sicherung gelöscht',
  'backup.restore': 'Sicherung zurückgespielt',
}

function Protokoll({ abgemeldet, team }: { abgemeldet: () => void; team: string }) {
  const { items, fehler } = useListe(() => adminApi.protokoll(team), abgemeldet, team)

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
              {systemDatumZeit(z.at)}
            </td>
            <td>
              {z.actor}
              {/* Ohne den Präfix `admin:`/`member:`/`system:` sähe ein Mitglied aus wie der
                  Kapitän — und eine Zeile, die niemand ausgelöst hat, wie seine Tat. */}
              {z.actor_typ === 'admin' && ' (Kapitän)'}
              {z.actor_typ === 'system' && ' (automatisch)'}
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
