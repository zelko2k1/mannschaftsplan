import { useCallback, useEffect, useState } from 'react'
import {
  adminApi,
  NichtAngemeldet,
  type AdminMitglied,
  type AdminSpieltag,
  type Einstellungen as EinstellungenDaten,
  type Protokollzeile,
  type Sicherung,
} from './adminApi'
import { ausEingabe, fuerEingabe, systemDatum, systemDatumZeit } from './format'
import './admin.css'

type Reiter = 'spieltage' | 'mitglieder' | 'einstellungen' | 'protokoll'

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
            ['einstellungen', 'Einstellungen'],
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
        {reiter === 'einstellungen' && <Einstellungen abgemeldet={() => setEmail(null)} />}
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
      // Das Feld liefert Ortszeit ("2026-08-29T19:30"), PocketBase speichert UTC.
      const daten = { ...entwurf, date: ausEingabe(entwurf.date) }
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
                // Das Feld will Ortszeit im Format "YYYY-MM-DDTHH:MM".
                setEntwurf({ ...s, date: fuerEingabe(s.date) })
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
  const zahlenOk =
    Number.isFinite(entwurf.tempo_kmh) &&
    Number.isFinite(entwurf.puffer_minuten) &&
    Number.isFinite(entwurf.auto_sperre_stunden)
  const veraendert =
    name !== daten.anzeigename ||
    entwurf.tempo_kmh !== daten.tempo_kmh ||
    entwurf.puffer_minuten !== daten.puffer_minuten ||
    entwurf.auto_sperre_stunden !== daten.auto_sperre_stunden ||
    entwurf.impressum.trim() !== daten.impressum ||
    entwurf.datenschutz.trim() !== daten.datenschutz

  const speichern = (ereignis: React.FormEvent) => {
    ereignis.preventDefault()
    if (!name || !zahlenOk || !veraendert) return

    const aenderung: Partial<EinstellungenDaten> = {}
    if (name !== daten.anzeigename) aenderung.anzeigename = name
    if (entwurf.tempo_kmh !== daten.tempo_kmh) aenderung.tempo_kmh = entwurf.tempo_kmh
    if (entwurf.puffer_minuten !== daten.puffer_minuten) aenderung.puffer_minuten = entwurf.puffer_minuten
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
          <span className="satz__name">Name der Mannschaft</span>
          <span className="satz__zusatz">
            Steht auf der Einladungsseite und in der Vorschau, die Messenger beim Verschicken eines
            Links erzeugen.
          </span>
        </div>

        <div className="satz__aktionen">
          <label className="feld" style={{ flex: '1 1 14rem' }}>
            <span>Anzeigename</span>
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

      {/* ── Fahrzeit ─────────────────────────────────────────────────────────────────────── */}
      <div className="satz">
        <div className="satz__kopf">
          <span className="satz__name">Abfahrtszeit</span>
          <span className="satz__zusatz">
            Die Abfahrt im Aushang wird gerechnet, nicht eingetragen: Strecke geteilt durch Tempo,
            plus Puffer, auf fünf Minuten gerundet und vom Anwurf abgezogen. Auf dem Land trägt ein
            höheres Tempo, in der Stadt ein niedrigeres.
          </span>
        </div>

        <div className="satz__aktionen">
          <label className="feld" style={{ flex: '0 1 10rem' }}>
            <span>Tempo (km/h)</span>
            <input
              type="number"
              inputMode="numeric"
              min={20}
              max={200}
              value={Number.isFinite(entwurf.tempo_kmh) ? entwurf.tempo_kmh : ''}
              onChange={(x) => setzen({ tempo_kmh: zahl(x.target.value) })}
            />
          </label>
          <label className="feld" style={{ flex: '0 1 10rem' }}>
            <span>Puffer (Minuten)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={180}
              value={Number.isFinite(entwurf.puffer_minuten) ? entwurf.puffer_minuten : ''}
              onChange={(x) => setzen({ puffer_minuten: zahl(x.target.value) })}
            />
          </label>
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
  'backup.create': 'Sicherung erstellt',
  'backup.download': 'Sicherung heruntergeladen',
  'backup.upload': 'Sicherung hochgeladen',
  'backup.delete': 'Sicherung gelöscht',
  'backup.restore': 'Sicherung zurückgespielt',
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
