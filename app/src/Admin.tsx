import { useCallback, useEffect, useState } from 'react'
import {
  adminApi,
  NichtAngemeldet,
  type AdminMitglied,
  type AdminSpieltag,
  type Einstellungen as EinstellungenDaten,
  type Protokollzeile,
  type ImportErgebnis,
  type Mannschaft,
  type Verwalterkonto,
  type Wer,
  ZweiterFaktorNoetig,
} from './adminApi'
import {
  ANTWORTEN,
  ausEingabe,
  fuerEingabe,
  plaetze,
  seit,
  SICHERUNG_ALT_TAGE,
  systemDatum,
  systemDatumZeit,
  tageSeit,
  ergebnis,
  wannUngefaehr,
} from './format'
import { dekodiere } from './csv'
import { leseSpielplan, vorlageCsv, type Spielplan } from './spielplan'
import { Fehler, Hinweis } from './Meldung'
import { Nachfragekasten, type Nachfrage } from './Nachfrage'
import './admin.css'

type Reiter = 'spieltage' | 'mannschaften' | 'konten' | 'verein' | 'protokoll' | 'konto'

/**
 * Welche Reiter sieht welche Rolle? — Abschnitt 12.
 *
 * Jeder Reiter hat GENAU EIN Thema, und die Auswahl im Kopf entscheidet, welche Mannschaft
 * gemeint ist. Vorher trug „Mannschaften" vier Themen auf einmal — die gewählte Mannschaft,
 * ihre Mitglieder, ihre Kapitäne und die Liste aller Mannschaften —, und das letzte ist eine
 * Aussage über den Verein, nicht über die eine Mannschaft oben in der Auswahl.
 *
 * `Mannschaft` heißt bei beiden Rollen gleich und zeigt dasselbe. Der Unterschied ist nicht der
 * Inhalt, sondern welche Mannschaften zur Auswahl stehen: beim Kapitän genau eine.
 *
 * `konto` steht in keiner Liste: Es gehört zur Person, nicht zur Mannschaft, und wird über den
 * eigenen Namen im Kopf geöffnet.
 */
const REITER: Record<'admin' | 'kapitaen', [Reiter, string][]> = {
  admin: [
    ['spieltage', 'Spieltage'],
    ['mannschaften', 'Mannschaft'],
    ['konten', 'Konten'],
    ['verein', 'Verein'],
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
      // Eine frisch aufgesetzte Anwendung enthält bewusst keine Daten (PRODUCT.md) — der erste
      // Admin steht also vor einer leeren Instanz. „Spieltage" ist dann der einzige Reiter, auf
      // dem er nichts tun kann: Ohne Mannschaft gibt es keinen Spieltag. Er landet deshalb dort,
      // wo der erste Schritt liegt. Sobald eine Mannschaft existiert, greift das nie wieder.
      if (d.rolle === 'admin' && d.teams.length === 0) setReiter('verein')
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
      <header className="balken admin__kopf">
        {/* Die Überschrift ist die Mannschaft, um die es gerade geht — nicht die Rolle des
            Anmeldenden. „Kapitän" sagte ihm nichts, was er nicht wüsste.
            Gibt es keine, stand hier das Wort „Mannschaft" — das las sich wie ein Name und
            behauptete etwas, das nicht stimmte. */}
        <h1>
          {ich.teams.find((t) => t.id === gewaehlt)?.name ??
            (ich.teams.length === 0 ? 'Noch keine Mannschaft' : 'Mannschaft')}
        </h1>
        <span className="admin__wer">
          {/* Ein Kapitän hat genau eine Mannschaft — für ihn wäre eine Auswahl mit einem Eintrag
              keine Auswahl. Ihr Name steht ohnehin schon in der Überschrift. */}
          {ich.teams.length > 1 && (
            <>
              <select
                className="admin__mannschaft"
                value={gewaehlt}
                onChange={(x) => setGewaehlt(x.target.value)}
                aria-label="Mannschaft wechseln"
              >
                {ich.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {' · '}
            </>
          )}
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
          {/* Abschnitt 12 · Nur für den, der auch mitspielt. Wer bloß organisiert, hat keinen
              Spielereintrag — und für ihn gäbe es auf dem Aushang nichts zu tun. */}
          {ich.mitglied && (
            <>
              {' · '}
              <button
                type="button"
                className="kopf__abmelden"
                onClick={async () => {
                  try {
                    await adminApi.spieleransicht()
                    window.location.href = '/'
                  } catch {
                    /* Klappt das nicht, bleibt man einfach hier — nichts geht dabei verloren. */
                  }
                }}
              >
                Als Spieler
              </button>
            </>
          )}
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

      {/* Ersteinrichtung · Ein Admin ohne zweiten Faktor kommt an Konten, Verein und Sicherungen
          nicht heran (R13). Das steht hier, bevor er dagegenläuft — eine Bedingung, die von
          Anfang an feststeht, gehört an den Anfang und nicht in einen roten Kasten hinter dem
          dritten Klick. Für Kapitäne erscheint der Balken nie: Für sie ist der Faktor freiwillig. */}
      {ich.rolle === 'admin' && !ich.totp && reiter !== 'konto' && (
        <div className="aufforderung" role="status">
          <p>
            <strong>Der zweite Faktor fehlt noch.</strong> Für Admin-Konten ist er Pflicht. Bis er
            steht, bleiben Konten, Vereinseinstellungen und Sicherungen verschlossen — Spieltage
            und Spieler kannst du schon pflegen.
          </p>
          <button type="button" className="knopf" onClick={() => setReiter('konto')}>
            Jetzt einrichten
          </button>
        </div>
      )}

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

      <main className="admin__inhalt">
        {reiter === 'spieltage' && <Spieltage abgemeldet={abgemeldet} team={gewaehlt} />}
        {/* Alles, was einer Mannschaft gehört, an einem Ort: ihre Werte, ihre Mitglieder und
            ihre Kapitäne. Vorher lag das über zwei Reiter und die Einstellungen verstreut. */}
        {reiter === 'mannschaften' && (
          <MannschaftenReiter
            abgemeldet={abgemeldet}
            team={gewaehlt}
            neuLaden={() => void werBinIch()}
            mannschaften={
              // Leer für einen Kapitän, und das ist die ganze Rechteprüfung im Frontend: ohne
              // Ziel zur Auswahl gibt es den Umzug nicht. Der Server weist ihn ohnehin ab.
              ich.rolle === 'admin' ? ich.teams : []
            }
          />
        )}
        {reiter === 'konten' && ich.rolle === 'admin' && <Konten abgemeldet={abgemeldet} />}
        {reiter === 'verein' && ich.rolle === 'admin' && (
          <Verein
            abgemeldet={abgemeldet}
            neuLaden={() => void werBinIch()}
            ohneMannschaft={ich.teams.length === 0}
          />
        )}
        {reiter === 'konto' && <MeinKonto abgemeldet={abgemeldet} />}
        {/* Der Gesamt-Admin sieht das ganze Protokoll — die zentralen Ereignisse gehören zu
            keiner Mannschaft und fielen sonst durch jeden Filter. */}
        {reiter === 'protokoll' && (
          <Protokoll abgemeldet={abgemeldet} team={ich.rolle === 'admin' ? '' : gewaehlt} />
        )}
      </main>
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
  // „Angemeldet bleiben" erscheint erst zusammen mit dem Codefeld — also nur für Konten, die
  // einen zweiten Faktor haben. Nur die bekommen die 90 Tage (R13), und ein Haken, der bei den
  // anderen wirkungslos abgehakt würde, wäre ein Versprechen, das die App nicht hält.
  const [bleiben, setBleiben] = useState(false)
  const [fehler, setFehler] = useState('')
  const [hinweis, setHinweis] = useState('')
  const [laeuft, setLaeuft] = useState(false)

  return (
    <div className="admin">
      {/* Ein Wort, und zwar dasselbe für jeden: „Anmeldung". Der Balken war hier lange leer und
          sah damit aus wie ein Darstellungsfehler; kurzzeitig stand der Vereinsname darin, aber
          der gehört nicht vor die Tür — wer noch nicht angemeldet ist, hat auch nichts davon,
          zu erfahren, wessen Verwaltung das ist. */}
      <header className="balken admin__kopf">
        <h1>Anmeldung</h1>
      </header>
      <main>
      <form
        className="anmeldung"
        onSubmit={async (ereignis) => {
          ereignis.preventDefault()
          setLaeuft(true)
          setFehler('')
          setHinweis('')
          try {
            const d = await adminApi.anmelden(email, passwort, code, bleiben)
            fertig(d.email)
          } catch (problem) {
            if (problem instanceof ZweiterFaktorNoetig) {
              // Kein Fehler: Das Passwort hat gestimmt, es fehlt nur noch der zweite Schritt.
              // Vorher lief das in denselben roten Kasten wie ein falsches Passwort — wer den
              // zweiten Faktor gerade eingerichtet hatte, las „hat nicht geklappt".
              setBrauchtCode(true)
              setCode('')
              setFehler('')
              setHinweis('Passwort stimmt. Jetzt der Code aus deiner Authenticator-App.')
              return
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
          {brauchtCode && (
            <label className="feld">
              <span>Angemeldet bleiben</span>
              <input type="checkbox" checked={bleiben} onChange={(x) => setBleiben(x.target.checked)} />
            </label>
          )}
        </div>
        <button type="submit" className="knopf" disabled={laeuft} style={{ width: '100%' }}>
          {laeuft ? 'Einen Moment …' : 'Anmelden'}
        </button>
        {/* R6 · Der Server sagt nicht, was falsch war. Diese Seite erfindet nichts dazu. */}
        <Fehler text={fehler} />
        <Hinweis text={hinweis} />
      </form>
      </main>
    </div>
  )
}

/** Ein Ladezustand mit Fehlerzeile — dreimal gebraucht, deshalb hier einmal. */
function useListe<A extends { items: unknown[] }>(
  holen: () => Promise<A>,
  abgemeldet: () => void,
  schluessel = '',
) {
  const [items, setItems] = useState<A['items'] | null>(null)
  // Die ganze Antwort, nicht nur die Liste: Manche Routen sagen mehr, als in den Zeilen steht —
  // etwa, wie viele Datensätze es insgesamt gibt, wenn die Liste gekappt wurde.
  const [antwort, setAntwort] = useState<A | null>(null)
  const [fehler, setFehler] = useState('')

  const laden = useCallback(async () => {
    try {
      const d = await holen()
      setAntwort(d)
      setItems(d.items)
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

  return { items, antwort, fehler, setFehler, laden }
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
  hinweis: '',
  adresse: '',
  ohne_fahrdienst: false,
  // -1 = noch nicht gespielt. Die Null wäre ein 0:0.
  ergebnis_wir: -1,
  ergebnis_gegner: -1,
  // -1 heißt „nicht gesetzt": Es gilt der eingebaute Standard, 80 km/h und 25 Minuten. Die Null
  // wäre hier ein Tempo von null und ein Spieltag ohne Abfahrtszeit.
  tempo_kmh: -1,
  puffer_minuten: -1,
  needed_players: 4,
}

// Dieselbe Rechnung wie im Aushang (`Zeile.tsx`). Sie steht hier ein zweites Mal, weil die
// Kapitänsansicht in einem eigenen Bündelteil liegt und ein Import den ganzen Aushang mit
// hinüberzöge. Was zusammenbleiben MUSS, ist die Gestalt der Daten — die liefert der Server
// für beide Ansichten aus derselben Quelle.
const zugesagt = (s: AdminSpieltag) =>
  Object.values(s.responses ?? {}).filter((x) => x === 'yes').length
/** Ob dieser Spieltag überhaupt einen Fahrdienst hat — auswärts und nicht mit Bus und Bahn. */
const mitFahrdienst = (s: AdminSpieltag) => !s.is_home && !s.ohne_fahrdienst
/** Autos, deren Fahrer nicht abgesagt hat — wie im Aushang. Ein abgesagtes Auto ist keines. */
const fahrten = (s: AdminSpieltag) =>
  (s.rides ?? []).filter((f) => (s.responses ?? {})[f.member] !== 'no')
const freiePlaetze = (s: AdminSpieltag) =>
  fahrten(s).reduce((summe, f) => summe + (f.seats - f.taken), 0)
const ohneFahrer = (s: AdminSpieltag) => mitFahrdienst(s) && fahrten(s).length === 0
/**
 * Wie viele Zusagen ohne Mitfahrgelegenheit dastehen — wörtlich dieselbe Rechnung wie in
 * `Zeile.tsx`. „Keine Plätze frei" beantwortet die Frage nicht: Es sagt, dass die Autos voll
 * sind, nicht, ob sie gereicht haben.
 */
const ohnePlatz = (s: AdminSpieltag) => {
  if (!mitFahrdienst(s)) return 0
  const braucht = Object.entries(s.responses ?? {}).filter(
    ([wer, status]) =>
      status === 'yes' &&
      !(s.rides ?? []).some((f) => f.member === wer) &&
      !(s.seat_claims ?? {})[wer] &&
      // Wer selbst kommt, sucht nichts — wie im Aushang.
      !(s.selbst_anreise ?? []).includes(wer),
  ).length
  return Math.max(0, braucht - freiePlaetze(s))
}

/**
 * Ein eingelesener Auswärtsspieltag, dem noch die Reiseangaben fehlen.
 *
 * Ein Verbands-Export kennt Datum, Gegner und Spiellokal — nicht aber den Ort des Gegners, die
 * Entfernung und den Treffpunkt. Die kann nur jemand nachtragen, der die Fahrt kennt, und ohne
 * sie rechnet die Abfahrtszeit ins Leere. Deshalb steht es dran, statt still zu bleiben. Wer die
 * Vorlage ausfüllt, kann Ort und Kilometer gleich mitgeben — dann kommt dieser Hinweis nicht.
 */
/**
 * Ob an diesem Spieltag noch etwas zu planen ist.
 *
 * Nach dem Spiel beantworten freie Plätze, fehlende Fahrer und die Zahl der nötigen Spieler eine
 * Frage, die niemand mehr stellt. Wörtlich dieselbe Regel wie im Aushang.
 */
const planungGilt = (s: AdminSpieltag) => wannUngefaehr(s.date) !== 'vorbei'

const nachzutragen = (s: AdminSpieltag) =>
  s.aus_spielplan && !s.is_home && (!s.opponent_town.trim() || s.km <= 0)

/**
 * Der Text, den der Kapitän in die Mannschaftsgruppe stellt.
 *
 * Bewusst OHNE Link: Einladungslinks sind persönlich (R14) — einer in der Gruppe wäre der Zugang
 * eines Einzelnen für alle. Und bewusst mit Namen: „Es fehlen noch drei Rückmeldungen" liest
 * jeder als „nicht ich".
 */
const erinnerungstext = (s: AdminSpieltag, fehlende: string[]) => {
  const gegner = s.opponent_club || s.opponent_town
  const wann = systemDatum(s.date)
  const wer =
    fehlende.length === 1
      ? fehlende[0]
      : `${fehlende.slice(0, -1).join(', ')} und ${fehlende[fehlende.length - 1]}`
  const was = fehlende.length === 1 ? 'fehlt noch die Rückmeldung' : 'fehlen noch Rückmeldungen'
  return `Für ${wann}${gegner ? ` gegen ${gegner}` : ''} ${was} von ${wer}. Bitte kurz im Plan antworten.`
}

function Spieltage({ abgemeldet, team }: { abgemeldet: () => void; team: string }) {
  const { items, fehler, setFehler, laden } = useListe(
    () => adminApi.spieltage(team),
    abgemeldet,
    team,
  )
  // Die Namen für die Rückmeldungen. Über dieselbe Route wie der Reiter „Mannschaft" — der
  // Spieltag kennt nur Mitglieds-IDs, und ein zweites Feld in der Antwort wäre eine zweite
  // Stelle, an der dieselbe Liste gepflegt werden müsste.
  const { items: spieler } = useListe(() => adminApi.mitglieder(team), abgemeldet, team)
  const [entwurf, setEntwurf] = useState<Partial<AdminSpieltag> | null>(null)
  /** Welcher Spieltag aufgeklappt ist. Immer höchstens einer, wie im Aushang. */
  const [offen, setOffen] = useState('')
  /** Für welchen Spieltag zuletzt eine Erinnerung in die Zwischenablage ging. */
  const [kopiert, setKopiert] = useState('')
  /**
   * Welche Rückmeldung gerade gespeichert wurde — Spieltag und Spieler.
   *
   * Bisher gab es hier nur den Fehlerfall. Wer eine Zusage für jemanden eintrug, sah für die
   * Dauer der Anfrage alle Knöpfe der Zeile abgeblendet und danach einen gefüllten Knopf; ob das
   * die eigene Eingabe war oder der Stand von vorher, stand nirgends. Aus der Mannschaft kam
   * genau das als „ich kann gar nicht erkennen, ob meine Änderung gespeichert ist" zurück.
   */
  const [quittung, setQuittung] = useState({ spieltag: '', mitglied: '' })
  const [frage, setFrage] = useState<Nachfrage | null>(null)
  // Welcher Spieltag gerade bearbeitet wird. „Abschließen" ist ein Umschalter: Zweimal geklickt
  // — und auf einer trägen Verbindung klickt man zweimal — sperrt der erste Ruf und entsperrt
  // der zweite. Es sieht dann aus, als sei nichts passiert, dabei sind zwei Zeilen im Protokoll
  // gelandet. Gesperrt wird nur die Zeile, an der gearbeitet wird, nicht die ganze Liste.
  const [laeuft, setLaeuft] = useState('')

  /** Eine Rückmeldung für ein Mitglied setzen oder zurücknehmen. */
  const korrigieren = async (
    spieltagId: string,
    mitgliedId: string,
    status: 'yes' | 'maybe' | 'no' | null,
  ) => {
    if (laeuft) return
    setLaeuft(spieltagId)
    setQuittung({ spieltag: spieltagId, mitglied: mitgliedId })
    setFehler('')
    try {
      await adminApi.rueckmeldungSetzen(spieltagId, mitgliedId, status)
      await laden()
    } catch (problem) {
      if (problem instanceof NichtAngemeldet) return abgemeldet()
      setFehler(problem instanceof Error ? problem.message : 'Nicht gespeichert.')
    } finally {
      setLaeuft('')
    }
  }

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

  // Ohne Mannschaft gibt es keinen Spieltag — das Schema verlangt eine. Vorher stand hier
  // „Neuer Spieltag", das Formular ließ sich ausfüllen, und der Server lehnte am Ende ab. Elf
  // Felder umsonst, mit einer Meldung, die den Grund nicht nannte.
  if (!team) {
    return (
      <p className="namen">
        Für einen Spieltag braucht es zuerst eine Mannschaft. Angelegt wird sie im Reiter
        „Verein" — das kann der Admin.
      </p>
    )
  }

  return (
    <>
      <Fehler text={fehler} />

      {/* Hier oben steht nur der NEUE Spieltag. Ein vorhandener wird dort bearbeitet, wo er in
          der Liste steht — das Formular sprang sonst bei jedem „Bearbeiten" an den Anfang, und wer
          den letzten von dreißig Terminen ändern wollte, scrollte erst hoch und danach wieder
          zurück, um zu sehen, ob es gestimmt hat. Beide Fälle bleiben ausschließlich: Wer gerade
          einen Spieltag bearbeitet, bekommt „Neuer Spieltag" nicht angeboten — ein Klick darauf
          würde die ungesicherte Eingabe verwerfen. */}
      {!entwurf && (
        <button type="button" className="knopf" onClick={() => setEntwurf({ ...LEER })}>
          Neuer Spieltag
        </button>
      )}
      {entwurf && !entwurf.id && (
        <Spieltagformular
          entwurf={entwurf}
          setEntwurf={setEntwurf}
          speichern={speichern}
          abbrechen={() => setEntwurf(null)}
        />
      )}

      {items.length === 0 && !entwurf && <p className="namen">Noch keine Termine eingetragen.</p>}

      {/* Der Admin liest den Spielplan ein, die Arbeit danach liegt beim Kapitän — also erfährt
          er hier davon und nicht erst, wenn jemand nach der Abfahrtszeit fragt. */}
      {items.filter(nachzutragen).length > 0 && (
        <p className="satz__warnung">
          {items.filter(nachzutragen).length} Spieltage kommen aus dem Spielplan und brauchen noch
          Ort, Kilometer und Treffpunkt — ohne sie gibt es keine Abfahrtszeit.
        </p>
      )}

      {items.map((s) => (
        <div key={s.id} className={`satz${s.locked ? ' satz--abgeschlossen' : ''}`}>
          <div className="satz__kopf">
            <h2 className="satz__name">{s.opponent_club || s.opponent_town}</h2>
            <span className="satz__zusatz">
              {systemDatumZeit(s.date)}
              {s.opponent_town ? ` · ${s.opponent_town}` : ''} ·{' '}
              {s.is_home ? 'Heim' : nachzutragen(s) ? 'Auswärts' : `Auswärts, ${s.km} km`}
              {s.locked ? ' · abgeschlossen' : ''}
            </span>
          </div>

          {/* Der Satz, um dessentwillen es das Produkt gibt: „Der Kapitän sieht auf einen Blick,
              ob seine Mannschaft vollzählig ist und ob genug Autos da sind" (PRODUCT.md). Wörtlich
              derselbe wie im Aushang — eine zweite, abweichende Zählweise wäre schlimmer als gar
              keine. Ohne Aufklappen, weil das Grundsatz 2 verlangt. */}
          <p className="satz__stand">
            <span className="satz__zusagen">
              {zugesagt(s)} zugesagt
              {zugesagt(s) < s.needed_players && planungGilt(s) && `, ${s.needed_players} nötig`}
            </span>
            {s.hinweis && planungGilt(s) && ' · Hinweis'}
            {!s.is_home && s.ohne_fahrdienst && planungGilt(s) && ' · ohne Fahrdienst'}
            {mitFahrdienst(s) && planungGilt(s) && (
              <>
                {' · '}
                <span className={ohneFahrer(s) ? 'satz__warnung' : undefined}>
                  {ohneFahrer(s) ? 'kein Fahrer' : plaetze(freiePlaetze(s))}
                </span>
                {!ohneFahrer(s) && ohnePlatz(s) > 0 && (
                  <>
                    {' · '}
                    <span className="satz__warnung">{ohnePlatz(s)} ohne Platz</span>
                  </>
                )}
              </>
            )}
            {(s.responses_alt ?? []).length > 0 && !s.locked && (
              <>
                {' · '}
                <span className="satz__warnung">
                  {(s.responses_alt ?? []).length} vom alten Termin
                </span>
              </>
            )}
            {/* Wie im Aushang: Ist das Ergebnis da, tritt „vollzählig" zurück. Dass genug Leute
                zugesagt hatten, ist am Montag keine Nachricht mehr. */}
            {(() => {
              const stand = ergebnis(s.ergebnis_wir, s.ergebnis_gegner)
              if (stand) return <span className="satz__voll">{stand.text}</span>
              return zugesagt(s) >= s.needed_players && planungGilt(s) ? (
                <span className="satz__voll">vollzählig</span>
              ) : null
            })()}
          </p>

          {/* Der Kapitän hat es selbst eingetragen — aber nicht unbedingt er selbst, und nicht
              unbedingt heute. Was vorher galt, gehört an den Spieltag, damit er es weitersagen
              kann, ohne nachzusehen. */}
          {s.verlegt_von && (s.responses_alt ?? []).length > 0 && !s.locked && (
            <p className="satz__warnung">
              Verlegt — vorher {systemDatumZeit(s.verlegt_von)}
            </p>
          )}

          {nachzutragen(s) && (
            <p className="satz__warnung">
              Aus dem Spielplan übernommen — Ort, Kilometer und Treffpunkt fehlen noch.
            </p>
          )}

          <div className="satz__aktionen">
            <button
              type="button"
              className="knopf"
              aria-expanded={offen === s.id}
              onClick={() => setOffen(offen === s.id ? '' : s.id)}
            >
              {offen === s.id ? 'Rückmeldungen zu' : 'Rückmeldungen'}
            </button>
            <button
              type="button"
              className="knopf"
              aria-expanded={entwurf?.id === s.id}
              onClick={() =>
                setEntwurf(
                  entwurf?.id === s.id
                    ? null
                    : // Die Felder wollen Ortszeit im Format "YYYY-MM-DDTHH:MM".
                      {
                        ...s,
                        date: fuerEingabe(s.date),
                        departure_manual: fuerEingabe(s.departure_manual),
                      },
                )
              }
            >
              {entwurf?.id === s.id ? 'Bearbeiten zu' : 'Bearbeiten'}
            </button>
            <button
              type="button"
              className="knopf"
              disabled={laeuft === s.id}
              onClick={async () => {
                if (laeuft) return
                setLaeuft(s.id)
                try {
                  await adminApi.spieltagAendern(s.id, { locked: !s.locked })
                  await laden()
                } catch (problem) {
                  setFehler(problem instanceof Error ? problem.message : 'Nicht gespeichert.')
                } finally {
                  setLaeuft('')
                }
              }}
            >
              {s.locked ? 'Wieder öffnen' : 'Abschließen'}
            </button>
            <button
              type="button"
              className="knopf knopf--gefahr"
              disabled={laeuft === s.id}
              onClick={() =>
                // Löschen nimmt Rückmeldungen und Fahrdienst mit — das muss dastehen.
                setFrage({
                  id: s.id,
                  titel: `„${s.opponent_club || s.opponent_town}" löschen`,
                  text: 'Die Rückmeldungen und der Fahrdienst zu diesem Spieltag verschwinden mit. Das lässt sich nicht zurücknehmen.',
                  knopf: 'Spieltag löschen',
                  tun: async () => {
                    setFrage(null)
                    setLaeuft(s.id)
                    try {
                      await adminApi.spieltagLoeschen(s.id)
                      await laden()
                    } catch (problem) {
                      setFehler(problem instanceof Error ? problem.message : 'Nicht gelöscht.')
                    } finally {
                      setLaeuft('')
                    }
                  },
                })
              }
            >
              Löschen
            </button>
          </div>

          <Nachfragekasten
            frage={frage?.id === s.id ? frage : null}
            abbrechen={() => setFrage(null)}
            laeuft={laeuft === s.id}
          />

          {/* Unter dem Spieltag, den es ändert — in Sichtweite der Angaben, die daneben in der
              Kopfzeile stehen. Nur einer ist offen, weil `entwurf` nur einen fasst. */}
          {entwurf?.id === s.id && (
            <div className="satz__formular">
              <Spieltagformular
                entwurf={entwurf}
                setEntwurf={setEntwurf}
                speichern={speichern}
                abbrechen={() => setEntwurf(null)}
              />
            </div>
          )}

          {offen === s.id && (
            <div className="rueckmeldungen">
              {/* Korrigieren sieht aus wie Antworten: dieselben drei Wörter, dieselbe Bauform,
                  dieselbe Rücknahme durch nochmaliges Antippen. Wer telefonisch zusagt, wird
                  hier eingetragen — dafür ist die Route gebaut, und sie lässt das ausdrücklich
                  auch an abgeschlossenen Spieltagen zu. */}
              {/* Wer noch nicht geantwortet hat, steht hier ohnehin — nur musste der Kapitän die
                  Namen bisher selbst abschreiben, um in der Gruppe nachzufragen. Der Knopf legt
                  den fertigen Satz in die Zwischenablage; verschickt wird er von Hand, im
                  Messenger, den die Mannschaft ohnehin benutzt. Keine Benachrichtigung, kein
                  Mailserver, keine Anbindung an irgendetwas. */}
              {(() => {
                const fehlende = (spieler ?? []).filter((m) => !s.responses?.[m.id])
                if (!fehlende.length || s.locked) return null
                return (
                  <div className="satz__aktionen">
                    <button
                      type="button"
                      className="knopf"
                      onClick={async () => {
                        const text = erinnerungstext(
                          s,
                          fehlende.map((m) => m.name),
                        )
                        try {
                          await navigator.clipboard.writeText(text)
                          setKopiert(s.id)
                        } catch {
                          // Die Zwischenablage verlangt einen sicheren Kontext und kann trotzdem
                          // abgelehnt werden. Dann bekommt er wenigstens den Text zu sehen.
                          setKopiert('')
                          setFehler(`Kopieren hat nicht geklappt. Der Text lautet: ${text}`)
                        }
                      }}
                    >
                      Erinnerung kopieren
                    </button>
                    <span className="satz__zusatz" style={{ alignSelf: 'center' }} role="status">
                      {kopiert === s.id
                        ? 'In der Zwischenablage — in die Mannschaftsgruppe einfügen.'
                        : `${fehlende.length} ohne Rückmeldung`}
                    </span>
                  </div>
                )
              })()}

              {(spieler ?? []).length === 0 ? (
                <p className="namen">
                  Noch keine Spieler in dieser Mannschaft — anzulegen im Reiter „Mannschaft".
                </p>
              ) : (
                (spieler ?? []).map((m) => (
                  <div key={m.id} className="rueckmeldung">
                    <span className="rueckmeldung__wer">
                      {m.name}
                      {(s.responses_alt ?? []).includes(m.id) && (
                        <span className="satz__warnung"> · alter Termin</span>
                      )}
                      {/* Wer selbst zum Spielort kommt — die Angabe, um derentwillen es das Feld
                          gibt. Grau: eine Auskunft, keine Aufforderung. */}
                      {(s.selbst_anreise ?? []).includes(m.id) && (
                        <span className="satz__zusatz"> · kommt selbst</span>
                      )}
                      {/* Die Quittung steht an der Zeile, an der getippt wurde. Der Kasten ist
                          immer da, auch leer — sonst meldet eine Bildschirmleseanwendung die
                          Änderung nicht zuverlässig. */}
                      <span role="status" className="satz__zusatz">
                        {quittung.spieltag === s.id && quittung.mitglied === m.id
                          ? laeuft === s.id
                            ? ' · speichert …'
                            : ' · gespeichert'
                          : ''}
                      </span>
                    </span>
                    <div className="knopfreihe">
                      {ANTWORTEN.map(({ wert, text, klasse }) => (
                        <button
                          key={wert}
                          type="button"
                          className={`knopf ${klasse}`}
                          aria-pressed={s.responses?.[m.id] === wert}
                          aria-label={`${m.name}: ${text}`}
                          disabled={laeuft === s.id}
                          onClick={() =>
                            void korrigieren(s.id, m.id, s.responses?.[m.id] === wert ? null : wert)
                          }
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
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
        {/* Nur auswärts: Zu einem Heimspiel fährt ohnehin niemand gemeinsam los. */}
        {!entwurf.is_home && (
          <label className="feld">
            <span>Ohne Fahrdienst</span>
            <input
              type="checkbox"
              checked={!!entwurf.ohne_fahrdienst}
              onChange={(x) => setze('ohne_fahrdienst', x.target.checked)}
            />
            <span className="feld__hinweis">Anreise mit Bus, Bahn oder zu Fuß</span>
          </label>
        )}
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
          <span>Anschrift des Spielorts</span>
          <input
            maxLength={200}
            value={entwurf.adresse || ''}
            placeholder="Musterstraße 5, 12345 Beispielstadt"
            onChange={(x) => setze('adresse', x.target.value)}
          />
          <span className="feld__hinweis">Leer: keine Karten-Box im Spieltag</span>
        </label>
        <label className="feld">
          <span>Treffpunkt</span>
          <input
            value={entwurf.meeting_point || ''}
            onChange={(x) => setze('meeting_point', x.target.value)}
          />
        </label>
        {/* Ein Freitext für alles, was zu diesem Spieltag gehört und kein eigenes Feld hat:
            Anfahrt, „vergesst die Trikots nicht", wer heute vertritt. Über die ganze Breite, weil
            hier Sätze stehen und keine Werte — `.feldreihe` ist ein Grid, `grid-column: 1 / -1`
            nimmt die ganze Zeile. */}
        <label className="feld" style={{ gridColumn: '1 / -1' }}>
          <span>Hinweis für die Mannschaft</span>
          <textarea
            rows={3}
            maxLength={500}
            value={entwurf.hinweis || ''}
            onChange={(x) => setze('hinweis', x.target.value)}
          />
          <span className="feld__hinweis">
            Steht bei allen im Spieltag. Was für alle gilt — keine Angaben über einzelne Personen.
          </span>
        </label>
        {/* Erst wenn gespielt wurde. Vorher wären es zwei Felder, die niemand ausfüllen kann —
            und ein Formular, das nach Dingen fragt, die es noch nicht gibt, wird nicht
            vollständiger, sondern länger. Leer heißt „kein Ergebnis"; ein 0:0 trägt man als 0
            und 0 ein, deshalb taugt die Null nicht als Leerwert. */}
        {wannUngefaehr(entwurf.date) === 'vorbei' && (
          <label className="feld">
            <span>Ergebnis (wir : Gegner)</span>
            <span className="ergebnisfelder">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                aria-label="Eigenes Ergebnis"
                value={(entwurf.ergebnis_wir ?? -1) < 0 ? '' : entwurf.ergebnis_wir}
                onChange={(x) =>
                  setze('ergebnis_wir', x.target.value === '' ? -1 : Number(x.target.value))
                }
              />
              <span aria-hidden="true">:</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                aria-label="Ergebnis des Gegners"
                value={(entwurf.ergebnis_gegner ?? -1) < 0 ? '' : entwurf.ergebnis_gegner}
                onChange={(x) =>
                  setze('ergebnis_gegner', x.target.value === '' ? -1 : Number(x.target.value))
                }
              />
            </span>
            <span className="feld__hinweis">Beide leer: kein Ergebnis</span>
          </label>
        )}
        {/* Nur bei Auswärtsspielen — zu einem Heimspiel fährt niemand gemeinsam los (6.3).
            Kein `flex` an diesen Feldern: `.feldreihe` ist ein Grid, dort verpufft es. Die
            Spaltenbreite gibt `auto-fit` vor. */}
        {!entwurf.is_home && (
          <label className="feld">
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
          <label className="feld">
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
function Mitglieder({
  abgemeldet,
  team,
  mannschaften,
}: {
  abgemeldet: () => void
  team: string
  mannschaften: { id: string; name: string }[]
}) {
  const { items, antwort, fehler, setFehler, laden } = useListe(
    () => adminApi.mitglieder(team),
    abgemeldet,
    team,
  )
  const [neuerName, setNeuerName] = useState('')
  // Frisch ausgestellte Token, nur für diese Sitzung im Speicher — nach dem Neuladen weg (R1).
  const [tokens, setTokens] = useState<Record<string, string>>({})
  // Woran gerade gearbeitet wird: die Mitglieds-ID, oder `neu` für das Anlegen-Feld.
  // „Deaktivieren" ist ein Umschalter und macht sich beim zweiten Klick selbst rückgängig; beim
  // Token wiegt es schwerer: Zwei Rufe stellen zwei Token aus, und welches davon am Ende
  // angezeigt wird, entscheidet die Reihenfolge der Antworten. Der Kapitän verschickte dann
  // womöglich einen Link, der schon wieder ungültig ist.
  const [laeuft, setLaeuft] = useState('')
  const [frage, setFrage] = useState<Nachfrage | null>(null)
  /** Welcher Link gerade in die Zwischenablage gegangen ist — für die Rückmeldung am Knopf. */
  const [kopiert, setKopiert] = useState('')
  /**
   * Was ein Umzug hinterlassen hat. Er steht oben und nicht an der Zeile: Der Spieler ist danach
   * aus dieser Liste verschwunden, seine Zeile gibt es nicht mehr.
   *
   * `von` merkt sich, zu welcher Mannschaft die Meldung gehoert — sonst stuende sie nach einem
   * Wechsel der Auswahl oben weiter da und spraeche ueber eine Liste, die man gar nicht ansieht.
   */
  const [umzug, setUmzug] = useState<{ von: string; text: string } | null>(null)

  if (!items) return <p>Einen Moment …</p>

  const andere = mannschaften.filter((t) => t.id !== team)
  const dieseMannschaft = mannschaften.find((t) => t.id === team)?.name ?? 'dieser Mannschaft'

  const fangen = async (
    was: string,
    arbeit: () => Promise<unknown>,
    sonst = 'Nicht gespeichert.',
  ) => {
    if (laeuft) return
    setLaeuft(was)
    try {
      await arbeit()
      await laden()
    } catch (problem) {
      if (problem instanceof NichtAngemeldet) return abgemeldet()
      setFehler(problem instanceof Error ? problem.message : sonst)
    } finally {
      setLaeuft('')
    }
  }

  return (
    <>
      <Fehler text={fehler} />

      <form
        className="satz__aktionen"
        onSubmit={(ereignis) => {
          ereignis.preventDefault()
          if (!neuerName.trim()) return
          void fangen('neu', async () => {
            await adminApi.mitgliedAnlegen(neuerName.trim(), team)
            setNeuerName('')
          })
        }}
      >
        <label className="feld feld--zeile">
          <span>Neues Mitglied</span>
          <input value={neuerName} onChange={(x) => setNeuerName(x.target.value)} />
        </label>
        {/* Die Ausrichtung kommt jetzt aus `.satz__aktionen:has(.feld) .knopf` — sie war hier
            als Einzelfall gelöst und an den anderen Stellen gar nicht. */}
        <button type="submit" className="knopf" disabled={!neuerName.trim() || laeuft === 'neu'}>
          Anlegen
        </button>
      </form>

      {/* Die einzige Grenze, die es für eine Mannschaft überhaupt gibt — und bis hierher war sie
          stumm: Ab dem 201. Spieler kamen weiterhin 200 Zeilen zurück, in der Verwaltung wie im
          Aushang, ohne Meldung. Wer ihn angelegt hatte, hätte gedacht, er habe sich nicht
          zurückgemeldet. Für eine Dartmannschaft ist das unerreichbar; für einen Verein, der die
          App für eine große Trainingsgruppe benutzt, nicht. */}
      {antwort && antwort.gesamt > antwort.grenze && (
        <p className="satz__warnung">
          Diese Mannschaft hat {antwort.gesamt} Spieler. Angezeigt werden hier und im Aushang nur
          die ersten {antwort.grenze} — die übrigen fehlen, auch für die Rückmeldungen. Teile die
          Mannschaft auf, oder melde dich, damit die Grenze steigt.
        </p>
      )}
      {antwort && antwort.gesamt <= antwort.grenze && antwort.gesamt >= antwort.grenze * 0.9 && (
        <p className="satz__warnung">
          {antwort.gesamt} von {antwort.grenze} Spielern — mehr zeigen Verwaltung und Aushang je
          Mannschaft nicht an.
        </p>
      )}

      {umzug && umzug.von === team && <p className="satz__warnung">{umzug.text}</p>}

      {items.map((m: AdminMitglied) => (
        <div key={m.id} className="satz">
          <div className="satz__kopf">
            <h2 className="satz__name">{m.name}</h2>
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
              disabled={laeuft === m.id}
              onClick={() =>
                void fangen(m.id, () => adminApi.mitgliedAendern(m.id, { active: !m.active }))
              }
            >
              {m.active ? 'Deaktivieren' : 'Aktivieren'}
            </button>
            <button
              type="button"
              className="knopf"
              disabled={laeuft === m.id}
              onClick={() => {
                const ausstellen = () =>
                  void fangen(
                    m.id,
                    async () => {
                      const d = await adminApi.tokenNeu(m.id)
                      setTokens((alt) => ({ ...alt, [m.id]: d.token }))
                    },
                    'Nicht ausgestellt.',
                  )
                // Beim ersten Link gibt es nichts zu verlieren — da wäre eine Rückfrage nur im
                // Weg. Beim zweiten schon: Der verschickte wird damit ungültig.
                if (!m.hat_token) return ausstellen()
                setFrage({
                  id: m.id,
                  titel: `Neues Token für ${m.name}`,
                  text: 'Der Link, den du ihm geschickt hast, funktioniert danach nicht mehr, und alle seine Geräte werden abgemeldet. Du musst ihm den neuen Link schicken.',
                  knopf: 'Neues Token ausstellen',
                  tun: () => {
                    setFrage(null)
                    ausstellen()
                  },
                })
              }}
            >
              {m.hat_token ? 'Neues Token' : 'Link erstellen'}
            </button>
            {/* Erst seit dem Saisonende gibt es das. „Deaktivieren" bleibt der Normalfall: Wer
                aufhört, hat trotzdem letzten Monat mitgespielt. Gelöscht wird, was wirklich weg
                soll — und der Server lässt es nur zu, solange nichts mehr daran hängt. */}
            <button
              type="button"
              className="knopf knopf--gefahr"
              disabled={laeuft === m.id}
              onClick={() =>
                setFrage({
                  id: m.id,
                  titel: `${m.name} löschen`,
                  text: 'Der Spielereintrag verschwindet endgültig, samt seinem Einladungslink. Hängen noch Rückmeldungen oder Fahrten daran, sagt der Server es und nichts passiert — dann zuerst unter „Verein" die alte Saison aufräumen.',
                  knopf: 'Endgültig löschen',
                  tun: () => {
                    setFrage(null)
                    void fangen(m.id, () => adminApi.mitgliedLoeschen(m.id), 'Nicht gelöscht.')
                  },
                })
              }
            >
              Löschen
            </button>
          </div>

          {/* Der Mannschaftswechsel — nur beim Admin, weil nur er Ziele zur Auswahl bekommt.
              Bis hierher gab es ihn gar nicht: Wer von der Zweiten in die Erste rückte, wurde neu
              angelegt, bekam einen neuen Einladungslink, und der alte Eintrag ließ sich nicht
              einmal löschen, sobald eine Rückmeldung an ihm hing. Die Person stand zweimal da.

              Die Auswahl löst nichts aus, sie stellt die Frage — bestätigt wird im Kasten
              darunter, wie beim Löschen und beim neuen Token. */}
          {andere.length > 0 && (
            <div className="satz__aktionen">
              <label className="feld feld--zeile">
                <span>Wechselt zu</span>
                <select
                  value=""
                  disabled={laeuft === m.id}
                  onChange={(x) => {
                    const ziel = andere.find((t) => t.id === x.target.value)
                    if (!ziel) return
                    setFrage({
                      id: m.id,
                      titel: `${m.name} wechselt zu ${ziel.name}`,
                      text: `Was an künftigen Spieltagen von ${dieseMannschaft} an ihm hängt — Rückmeldung, Fahrt, Mitfahrt —, wird gelöscht; an bereits gespielten bleibt alles stehen. Sein Einladungslink gilt weiter, seine Geräte bleiben angemeldet.`,
                      knopf: `Zu ${ziel.name} umziehen`,
                      tun: () => {
                        setFrage(null)
                        void fangen(
                          m.id,
                          async () => {
                            const d = await adminApi.mitgliedUmziehen(m.id, ziel.id)
                            const weg: string[] = []
                            if (d.rueckmeldungen) weg.push(`${d.rueckmeldungen} Rückmeldung(en)`)
                            if (d.fahrten) weg.push(`${d.fahrten} Fahrt(en)`)
                            if (d.mitfahrten) weg.push(`${d.mitfahrten} Mitfahrt(en)`)
                            setUmzug({
                              von: team,
                              text:
                                `${m.name} steht jetzt bei ${ziel.name}. ` +
                                (weg.length
                                  ? `Bei ${dieseMannschaft} gelöscht: ${weg.join(', ')} an künftigen Spieltagen.`
                                  : `Bei ${dieseMannschaft} hing an künftigen Spieltagen nichts an ihm.`) +
                                // Der Satz, der sonst erst am Spieltag auffiele: Sein Auto ist
                                // mitgegangen, und die Mitfahrer stehen ohne Platz da.
                                (d.plaetze
                                  ? ` ${d.plaetze} Mitfahrer haben dabei ihren Platz verloren — sag ihnen Bescheid.`
                                  : ''),
                            })
                          },
                          'Nicht umgezogen.',
                        )
                      },
                    })
                  }}
                >
                  <option value="">Mannschaft wählen …</option>
                  {andere.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <Nachfragekasten
            frage={frage?.id === m.id ? frage : null}
            abbrechen={() => setFrage(null)}
            laeuft={laeuft === m.id}
          />

          {tokens[m.id] && (
            <div className="token">
              <p className="token__hinweis">
                Diesen Link an {m.name} schicken — er wird nur jetzt angezeigt.
              </p>
              {/* Was der Kapitän beim Verschicken dazusagen muss. PRODUCT.md nennt diesen Tausch
                  offen (R14: „Wer den Link eines Spielers weitergibt, ist dieser Spieler") — bis
                  hierher stand es nur im Plan und nirgends dort, wo jemand danach handelt. */}
              <p className="token__text">
                Der Link ist persönlich und ersetzt ein Passwort: Wer ihn hat, ist{' '}
                {m.name}. Schick ihn im Einzelchat, nicht in die Gruppe.
              </p>
              <code className="token__wert">
                {window.location.origin}/j/{tokens[m.id]}
              </code>
              {/* Der Kasten blieb bisher nur bis zum nächsten Reiterwechsel stehen und ließ sich
                  nur durch langes Antippen kopieren. Er ist die einzige Tür des Produkts. */}
              <div className="satz__aktionen">
                <button
                  type="button"
                  className="knopf"
                  onClick={async () => {
                    const url = `${window.location.origin}/j/${tokens[m.id]}`
                    try {
                      await navigator.clipboard.writeText(url)
                      setKopiert(m.id)
                    } catch {
                      // Ohne Zwischenablage-Recht bleibt der Link darüber zum Markieren stehen.
                      setKopiert('')
                    }
                  }}
                >
                  {kopiert === m.id ? 'Kopiert' : 'Link kopieren'}
                </button>
                {typeof navigator.share === 'function' && (
                  <button
                    type="button"
                    className="knopf"
                    onClick={() =>
                      void navigator
                        .share({
                          text:
                            `Hallo ${m.name}, hier sind unsere Termine: ` +
                            `${window.location.origin}/j/${tokens[m.id]}\n` +
                            'Der Link gehört dir allein — bitte nicht weitergeben.',
                        })
                        .catch(() => {
                          /* abgebrochen ist kein Fehler */
                        })
                    }
                  >
                    Weitergeben
                  </button>
                )}
                <button
                  type="button"
                  className="knopf"
                  onClick={() =>
                    setTokens((alt) => {
                      const neu = { ...alt }
                      delete neu[m.id]
                      return neu
                    })
                  }
                >
                  Verschickt
                </button>
              </div>
              <p className="token__text" role="status">
                {kopiert === m.id ? 'Der Link liegt in der Zwischenablage.' : ''}
              </p>
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
 * Der Reiter „Verein" — was für ALLE Mannschaften gilt: der Vereinsname, die Sperrfrist, die
 * Rechtstexte, die Liste der Mannschaften und die Sicherungen.
 *
 * „Einstellungen" hieß er früher, und das war ein Sammelbegriff, unter dem niemand eine
 * Mannschaftsliste vermutet. Was einer einzelnen Mannschaft gehört, steht im Reiter
 * „Mannschaft"; was zur angemeldeten Person gehört, unter „Mein Konto".
 */
function Verein({
  abgemeldet,
  neuLaden,
  ohneMannschaft,
}: {
  abgemeldet: () => void
  neuLaden: () => void
  /** Es gibt noch gar keine Mannschaft — dann ist ihr Anlegen der erste Schritt. */
  ohneMannschaft: boolean
}) {
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
    return fehler ? <Fehler text={fehler} /> : <p>Einen Moment …</p>
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
    {ohneMannschaft && (
      <>
        <Mannschaften abgemeldet={abgemeldet} neuLaden={neuLaden} />
        <SpielplanImport abgemeldet={abgemeldet} neuLaden={neuLaden} />
      </>
    )}
    <form onSubmit={speichern}>
      <Fehler text={fehler} />

      {/* ── Name ─────────────────────────────────────────────────────────────────────────── */}
      <div className="satz">
        <div className="satz__kopf">
          <h2 className="satz__name">Name des Vereins</h2>
          <span className="satz__zusatz">
            Der Name eures Vereins — er steht dort, wo es um die Anwendung als Ganzes geht: über
            Impressum und Datenschutzhinweis, auf der Seite „Link ungültig", und als Herausgeber in
            der Authenticator-App. Auf der <strong>Einladungsseite</strong> steht dagegen der Name
            der Mannschaft, zu der der Link gehört.
          </span>
        </div>

        <div className="satz__aktionen">
          <label className="feld feld--zeile">
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
          <p className="token__text">
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
          <h2 className="satz__name">Spieltage von selbst schließen</h2>
          <span className="satz__zusatz">
            Ein gespielter Spieltag nimmt keine Rückmeldungen mehr an. Mit einer Frist erledigt das
            die App, statt dass du nach jedem Spiel daran denken musst. <strong>0 = aus</strong> —
            dann sperrst du weiterhin von Hand.
          </span>
        </div>

        <div className="satz__aktionen">
          <label className="feld feld--kurz">
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
          <h2 className="satz__name">Impressum und Datenschutz</h2>
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
          <p className="token__text">
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
          {/* Steht dauerhaft und bleibt leer — mitten in einer Knopfreihe wäre der Behälter
              aus `Meldung.tsx` ein `<div>` und schöbe die Knöpfe auseinander. Hier trägt das
              `span` die Rolle selbst; leer nimmt es keinen Platz ein. */}
          <span className="satz__zusatz" style={{ alignSelf: 'center' }} role="status">
            {gespeichert
              ? 'Gespeichert. Schon verschickte Links behalten ihre alte Vorschau — die speichert der Messenger zwischen.'
              : ''}
          </span>
        </div>
      </div>
    </form>
    {/* Sonst steht der eine Schritt, der jetzt zählt, unter Vereinsname, Sperrfrist und zwei
        Rechtstexten — und der erste Admin scrollt an ihm vorbei. */}
    {!ohneMannschaft && (
      <>
        <Mannschaften abgemeldet={abgemeldet} neuLaden={neuLaden} />
        <SpielplanImport abgemeldet={abgemeldet} neuLaden={neuLaden} />
      </>
    )}
    <Sicherungen abgemeldet={abgemeldet} />
    {/* Ganz unten und hinter den Sicherungen: Wer hierher scrollt, sucht das Aufräumen — und
        findet direkt darüber den Knopf, der vorher zu drücken ist. */}
    <Saisonende abgemeldet={abgemeldet} />
    </>
  )
}

/**
 * Spielplan aus einer CSV-Datei übernehmen — Schritt 8.
 *
 * Zwei Wege führen hier herein: der Export des eigenen Verbands (eine Datei für alle
 * Mannschaften) und die Vorlage, die man selbst ausfüllt. Welche es ist, erkennt `spielplan.ts`
 * an der Kopfzeile — die Oberfläche muss nicht danach fragen.
 *
 * Steht im Reiter „Verein“, weil so eine Datei den ganzen Verein umfasst. Deshalb auch nur der
 * Admin — ein Kapitän würde damit in fremde Mannschaften schreiben.
 *
 * Gelesen wird die Datei HIER im Browser, nicht auf dem Server. Zwei Gründe: die Zuordnung der
 * Mannschaftsnamen ist eine Frage an einen Menschen, und was nie hochgeladen wird, kann auch
 * nicht liegenbleiben. Zum Server geht erst die bestätigte Liste.
 */
/**
 * Der Wert im Auswahlfeld, der „diese Mannschaft gibt es noch nicht" bedeutet.
 *
 * Kein leerer String und keine echte Kennung — er muss sich von beidem unterscheiden lassen und
 * darf mit keiner Datenbankkennung kollidieren. Der Doppelpunkt genügt dafür: PocketBase-Kennungen
 * bestehen aus fünfzehn Buchstaben und Ziffern. Ein Steuerzeichen wäre die naheliegende Wahl
 * gewesen, aber im Wert eines option-Elements ist darauf kein Verlass.
 */
const NEUE_MANNSCHAFT = 'neu:anlegen'

function SpielplanImport({
  abgemeldet,
  neuLaden,
}: {
  abgemeldet: () => void
  /** Nach dem Anlegen neuer Mannschaften: Die Auswahl im Kopf muss sie kennen. */
  neuLaden: () => void
}) {
  const [mannschaften, setMannschaften] = useState<Mannschaft[] | null>(null)
  const [plan, setPlan] = useState<Spielplan | null>(null)
  const [dateiname, setDateiname] = useState('')
  const [zuordnung, setZuordnung] = useState<Record<string, string>>({})
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null)

  useEffect(() => {
    adminApi
      .mannschaften()
      .then((d) => setMannschaften(d.items))
      .catch((problem) => {
        if (problem instanceof NichtAngemeldet) return abgemeldet()
        setFehler(problem instanceof Error ? problem.message : 'Nicht geladen.')
      })
  }, [abgemeldet])

  async function dateiLesen(datei: File) {
    setFehler('')
    setErgebnis(null)
    try {
      const gelesen = leseSpielplan(dekodiere(await datei.arrayBuffer()))
      setPlan(gelesen)
      setDateiname(datei.name)
      setZuordnung(vorschlagen(gelesen.mannschaften, mannschaften ?? []))
    } catch (problem) {
      setPlan(null)
      setFehler(problem instanceof Error ? problem.message : 'Die Datei war nicht lesbar.')
    }
  }

  async function uebernehmen() {
    if (!plan) return

    setLaeuft(true)
    setFehler('')
    try {
      // Zuerst die Mannschaften, die es noch nicht gibt. Vorher musste man sie von Hand anlegen,
      // bevor überhaupt etwas zuzuordnen war — für den ersten Import einer leeren Instanz war
      // das eine Tür, die man erst bauen musste, um durchzugehen. Der Name kommt aus der Datei
      // und ist danach jederzeit über „Mannschaften" zu ändern; der Spielplan hängt an der
      // Kennung, nicht am Namen.
      const angelegt: Record<string, string> = {}
      for (const name of neueNamen) {
        const { id } = await adminApi.mannschaftAnlegen(name.slice(0, 60))
        angelegt[name] = id
      }

      const zeilen = plan.zeilen
        .filter((z) => zuordnung[z.mannschaft])
        .map((z) => ({
          quelle: z.quelle,
          team: zuordnung[z.mannschaft] === NEUE_MANNSCHAFT ? angelegt[z.mannschaft] : zuordnung[z.mannschaft],
          date: z.date,
          opponent_club: z.opponent_club,
          is_home: z.is_home,
          venue: z.venue,
          opponent_town: z.opponent_town,
          km: z.km,
        }))
      if (zeilen.length === 0) return

      setErgebnis(await adminApi.spielplanImportieren(zeilen))
      setPlan(null)
      setDateiname('')
      if (neueNamen.length > 0) {
        // Die Mannschaftsauswahl im Kopf und die Liste hier kennen die neuen sonst nicht.
        setMannschaften((await adminApi.mannschaften()).items)
        neuLaden()
      }
    } catch (problem) {
      if (problem instanceof NichtAngemeldet) return abgemeldet()
      setFehler(problem instanceof Error ? problem.message : 'Nicht übernommen.')
    } finally {
      setLaeuft(false)
    }
  }

  const ausgewaehlt = plan ? plan.zeilen.filter((z) => zuordnung[z.mannschaft]).length : 0
  const neueNamen = plan
    ? plan.mannschaften.filter((name) => zuordnung[name] === NEUE_MANNSCHAFT)
    : []

  return (
    <section className="satz">
      <div className="satz__kopf">
        <h2 className="satz__name">Spielplan einlesen</h2>
      </div>

      {fehler && <Fehler text={fehler} />}

      {ergebnis && (
        <div className="token" role="status">
          <p className="token__hinweis">Übernommen</p>
          <p className="token__text">
            {ergebnis.neu} neu, {ergebnis.geaendert} geändert
            {ergebnis.verlegt > 0 && ` (davon ${ergebnis.verlegt} verlegt)`},{' '}
            {ergebnis.unveraendert} unverändert
            {ergebnis.gesperrt > 0 && `, ${ergebnis.gesperrt} gesperrt und deshalb unberührt`}.{' '}
            {ergebnis.neu > 0 &&
              'Ort, Kilometer und Treffpunkt stehen nicht im Export — die trägt jeder Kapitän bei seinen Auswärtsspielen nach.'}
          </p>
        </div>
      )}

      {!plan && (
        <>
          <div className="satz__aktionen">
            <label className="feld feld--zeile">
              <span>Datei wählen</span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={laeuft || mannschaften === null}
                onChange={(x) => {
                  const datei = x.target.files?.[0]
                  x.target.value = ''
                  if (datei) void dateiLesen(datei)
                }}
              />
            </label>
            <button type="button" className="knopf" onClick={vorlageHerunterladen}>
              Vorlage herunterladen
            </button>
          </div>
          <div className="token">
            <p className="token__hinweis">Zwei Wege zu einer Datei</p>
            <p className="token__text">
              Entweder der <strong>Spielplan-Export deines Verbands</strong> als CSV — eine Datei
              für alle Mannschaften, nichts abzutippen. Oder die <strong>Vorlage</strong>: Du
              lädst sie hier herunter, füllst sie in einem Tabellenprogramm aus und lädst sie
              wieder hoch. In der Vorlage darfst du Ort und Kilometer gleich mit eintragen; ein
              Verbands-Export kennt beides nicht.
            </p>
            <p className="token__text">
              Welche Form es ist, erkennt die App an der Kopfzeile. Nichts wird hochgeladen, bevor
              du die Vorschau bestätigt hast. Ein zweiter Import aktualisiert verlegte
              Begegnungen, statt sie ein zweites Mal anzulegen; von Hand angelegte und bereits
              gesperrte Spieltage bleiben unberührt.
            </p>
          </div>
        </>
      )}

      {plan && (
        <>
          <p className="namen">
            <strong>{dateiname}</strong> — Saison {plan.saison}, {plan.zeilen.length} Begegnungen
            {plan.uebersprungen > 0 && `, ${plan.uebersprungen} übersprungen`}
          </p>

          {plan.warnungen.map((w) => (
            <p className="satz__warnung" key={w}>
              {w}
            </p>
          ))}

          {/* Anlegen ist die Voreinstellung für alles, was hier noch nicht existiert — aber
              lautlos soll es nicht geschehen. Wer eine Mannschaft in der App anders nennt als
              der Verband, stellt das Auswahlfeld um. */}
          {neueNamen.length > 0 && (
            <p className="token__text">
              <strong>{neueNamen.length} Mannschaft(en) werden neu angelegt:</strong>{' '}
              {neueNamen.join(', ')}. Die Namen kommen aus der Datei und lassen sich danach unter
              „Mannschaften" ändern.
            </p>
          )}

          {/* Die Zuordnung ist der einzige Schritt, den kein Programm entscheiden kann: die Datei
              kennt „SV Beispiel III“, die App kennt die Mannschaft, die IHR so nennt. Der
              Vorschlag trifft den Normalfall, das letzte Wort hat der Mensch. */}
          <ul className="namen liste">
            {plan.mannschaften.map((name) => {
              const anzahl = plan.zeilen.filter((z) => z.mannschaft === name).length
              return (
                <li className="eintrag" key={name}>
                  <label className="feld feld--zeile">
                    <span>
                      {name} <span className="feld__hinweis">({anzahl})</span>
                    </span>
                    <select
                      value={zuordnung[name] ?? ''}
                      onChange={(x) => setZuordnung({ ...zuordnung, [name]: x.target.value })}
                    >
                      <option value={NEUE_MANNSCHAFT}>neu anlegen</option>
                      <option value="">nicht übernehmen</option>
                      {(mannschaften ?? []).map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              )
            })}
          </ul>

          <div className="satz__aktionen">
            <button type="button" className="knopf" disabled={laeuft || ausgewaehlt === 0} onClick={uebernehmen}>
              {laeuft ? 'Übernimmt …' : `${ausgewaehlt} Begegnungen übernehmen`}
            </button>
            <button
              type="button"
              className="knopf knopf--gefahr"
              disabled={laeuft}
              onClick={() => {
                setPlan(null)
                setDateiname('')
              }}
            >
              Verwerfen
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * Legt die leere Vorlage im Download-Ordner ab.
 *
 * Der Inhalt entsteht in `spielplan.ts` aus derselben Spaltenliste, nach der die Datei später
 * gelesen wird — deshalb kann die Vorlage nicht veralten, und was hier heruntergeladen wird,
 * nimmt der Import garantiert wieder an. Geprüft wird genau das im Test „lässt sich unverändert
 * wieder einlesen".
 */
function vorlageHerunterladen() {
  const adresse = URL.createObjectURL(new Blob([vorlageCsv()], { type: 'text/csv;charset=utf-8' }))
  const verweis = document.createElement('a')
  verweis.href = adresse
  verweis.download = 'spielplan-vorlage.csv'
  verweis.click()
  URL.revokeObjectURL(adresse)
}

/**
 * Ordnet die Namen aus der Datei den vorhandenen Mannschaften zu, so weit es eindeutig geht.
 *
 * Verglichen wird ohne Groß-/Kleinschreibung, ohne mehrfache Leerzeichen und ohne Punkte —
 * „SV Beispiel III“ und „SV Beispiel III.“ sind dieselbe Mannschaft, und niemand möchte
 * neun Auswahlfelder von Hand stellen, weil irgendwo ein Punkt steht.
 *
 * **Was nicht eindeutig passt, wird zum Anlegen vorgeschlagen.** Vorher blieb es leer, aus der
 * Überlegung, ein falscher Vorschlag sei schlimmer als gar keiner. Beim ersten Import einer
 * leeren Instanz stand damit aber jedes Feld auf „nicht übernehmen", und der Import tat nichts,
 * bis jemand alle Mannschaften von Hand angelegt hatte. Anlegen ist die richtige Vorgabe: Es ist
 * sichtbar (die Vorschau zählt sie auf), es ist umstellbar, und ein zu viel angelegter Name ist
 * schnell geändert — eine Mannschaft zu wenig kostet einen zweiten Anlauf.
 */
function vorschlagen(ausDatei: string[], vorhanden: Mannschaft[]): Record<string, string> {
  const schluessel = (s: string) =>
    s
      .toLowerCase()
      .replace(/[.]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const nachName = new Map<string, string[]>()
  for (const m of vorhanden) {
    const k = schluessel(m.name)
    nachName.set(k, [...(nachName.get(k) ?? []), m.id])
  }

  const ergebnis: Record<string, string> = {}
  for (const name of ausDatei) {
    const treffer = nachName.get(schluessel(name)) ?? []
    ergebnis[name] = treffer.length === 1 ? treffer[0] : NEUE_MANNSCHAFT
  }
  return ergebnis
}

/**
 * Saisonende — alte Spieltage wegräumen, damit danach auch Spieler und Mannschaften gehen.
 *
 * Der Löschjob räumt Spieltage nach zwölf Monaten von selbst weg (Abschnitt 8). Das ist die
 * Untergrenze für den Datenschutz, aber kein Werkzeug: Wer nach der Saison Ordnung machen oder
 * eine Testmannschaft loswerden will, wartet nicht ein Jahr.
 *
 * Und es hängt zusammen: Ein Spieler lässt sich nur löschen, solange keine Rückmeldung und keine
 * Fahrt mehr an ihm hängt, eine Mannschaft nur, wenn sie leer ist. Dieser Abschnitt ist damit
 * der erste Schritt einer Kette — deshalb steht er hier und nicht in der Mannschaftsansicht.
 */
function Saisonende({ abgemeldet }: { abgemeldet: () => void }) {
  const { items: teams } = useListe(adminApi.mannschaften, abgemeldet)
  const [team, setTeam] = useState('')
  const {
    items: spieltage,
    fehler,
    setFehler,
    laden,
  } = useListe(() => adminApi.spieltage(team), abgemeldet, team)
  const [bis, setBis] = useState(alsDatumsfeld(new Date()))
  const [laeuft, setLaeuft] = useState(false)
  const [frage, setFrage] = useState<Nachfrage | null>(null)
  const [ergebnis, setErgebnis] = useState('')

  // Dieselbe Rechnung wie im Server: verglichen wird der Tag, nicht die Uhrzeit. Sonst zählte
  // die Vorschau etwas anderes, als anschließend verschwindet.
  const betroffen = (spieltage ?? []).filter((s) => s.date.slice(0, 10) <= bis)
  const name = teams?.find((t) => t.id === team)?.name

  async function aufraeumen() {
    setLaeuft(true)
    setFehler('')
    setErgebnis('')
    try {
      const d = await adminApi.spieltageAufraeumen(bis, team)
      setErgebnis(
        d.spieltage === 0
          ? 'Es war nichts zu löschen.'
          : `${d.spieltage} Spieltage gelöscht, mitsamt allen Rückmeldungen und Fahrten daran.`,
      )
      await laden()
    } catch (problem) {
      if (problem instanceof NichtAngemeldet) return abgemeldet()
      setFehler(problem instanceof Error ? problem.message : 'Nicht gelöscht.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <section className="satz">
      <div className="satz__kopf">
        <h2 className="satz__name">Saison abschließen</h2>
      </div>

      <Fehler text={fehler} />

      <p className="namen">
        Spieltage bis zu einem Stichtag löschen — mitsamt allen Rückmeldungen, Fahrten und
        Mitfahrern daran. Danach lassen sich auch die Spieler löschen, die nur zu dieser Saison
        gehörten, und leere Mannschaften verschwinden.
      </p>

      <div className="feldreihe">
        <label className="feld feld--kurz">
          <span>Mannschaft</span>
          <select
            value={team}
            onChange={(x) => {
              setTeam(x.target.value)
              setErgebnis('')
            }}
          >
            <option value="">alle Mannschaften</option>
            {(teams ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="feld feld--kurz">
          <span>Bis einschließlich</span>
          <input
            type="date"
            value={bis}
            onChange={(x) => {
              setBis(x.target.value)
              setErgebnis('')
            }}
          />
          <span className="feld__hinweis">
            Vorgabe ist heute — dann bleibt alles Kommende stehen.
          </span>
        </label>
      </div>

      {spieltage === null ? (
        <p className="namen">Einen Moment …</p>
      ) : (
        <p className="namen">
          <strong>
            {betroffen.length} von {spieltage.length} Spieltagen
          </strong>{' '}
          {name ? `der Mannschaft ${name} ` : ''}
          {betroffen.length === 1 ? 'wird' : 'werden'} gelöscht.
        </p>
      )}

      {/* Der Griff zur Sicherung gehört daneben, nicht in eine Fußnote: Was hier verschwindet,
          holt kein zweiter Klick zurück. */}
      <p className="namen">
        Vorher eine <strong>Sicherung</strong> erstellen — der Abschnitt darüber macht das in
        einem Klick.
      </p>

      <div className="satz__aktionen">
        <button
          type="button"
          className="knopf knopf--gefahr"
          disabled={laeuft || betroffen.length === 0}
          onClick={() =>
            setFrage({
              id: 'saisonende',
              titel: `${betroffen.length} Spieltage löschen`,
              text: `Gelöscht werden alle Spieltage ${name ? `der Mannschaft ${name} ` : ''}bis einschließlich ${bis}, mit allem, was daran hängt: Rückmeldungen, Fahrten, Mitfahrer. Das lässt sich nur über eine Sicherung rückgängig machen.`,
              knopf: 'Endgültig löschen',
              tun: () => {
                setFrage(null)
                void aufraeumen()
              },
            })
          }
        >
          {laeuft ? 'Löscht …' : 'Spieltage löschen'}
        </button>
        <span className="satz__zusatz" role="status">
          {ergebnis}
        </span>
      </div>

      <Nachfragekasten frage={frage} abbrechen={() => setFrage(null)} laeuft={laeuft} />
    </section>
  )
}

/** „2026-08-31" — die Schreibweise, die ein `input type="date"` erwartet, in Ortszeit. */
function alsDatumsfeld(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

  // Ein echtes Formular statt eines Knopfes mit `onClick`: Wer drei Passwortfelder ausgefüllt
  // hat, drückt Enter. Vorher passierte dann nichts. Nebenbei findet eine Passwortverwaltung
  // ein Formular auch daran, dass es eines ist.
  const aendern = async (ereignis: React.FormEvent) => {
    ereignis.preventDefault()
    if (!passt || laeuft) return
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
  }

  return (
    <form className="satz" onSubmit={aendern}>
      <div className="satz__kopf">
        <h2 className="satz__name">Passwort ändern</h2>
        <span className="satz__zusatz">
          Mindestens zehn Zeichen. Das bisherige muss mit — sonst genügte eine übernommene
          Sitzung, um dich dauerhaft auszusperren. Deine anderen angemeldeten Geräte fliegen
          dabei heraus; das ist meist der Grund, warum man ein Passwort ändert.
        </span>
      </div>

      <Fehler text={fehler} />
      <Hinweis text={fertig} />

      <div className="satz__aktionen" style={{ flexWrap: 'wrap' }}>
        <label className="feld feld--zeile">
          <span>Bisheriges Passwort</span>
          <input
            type="password"
            autoComplete="current-password"
            value={alt}
            onChange={(x) => setAlt(x.target.value)}
          />
        </label>
        <label className="feld feld--zeile">
          <span>Neues Passwort</span>
          <input
            type="password"
            autoComplete="new-password"
            value={neu}
            onChange={(x) => setNeu(x.target.value)}
          />
        </label>
        <label className="feld feld--zeile">
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
        <button type="submit" className="knopf" disabled={!passt || laeuft}>
          {laeuft ? 'Ändert …' : 'Passwort ändern'}
        </button>
      </div>
    </form>
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
  const [stand, setStand] = useState<{
    aktiv: boolean
    ausstehend: boolean
    codes_uebrig: number
  } | null>(null)
  const [start, setStart] = useState<{ geheimnis: string; uri: string } | null>(null)
  // Die Wiederherstellungscodes im Klartext — nur in diesem einen Augenblick, danach nie wieder.
  // Deshalb bleiben sie stehen, bis der Nutzer selbst wegklickt: Ein Kasten, der von allein
  // verschwindet, nimmt den Zettel mit, den noch niemand abgeschrieben hat.
  const [codes, setCodes] = useState<string[] | null>(null)
  const [neueCodes, setNeueCodes] = useState(false)
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
        <h2 className="satz__name">Zweiter Faktor</h2>
        <span className="satz__zusatz">
          Zusätzlich zum Passwort ein sechsstelliger Code aus einer Authenticator-App auf deinem
          Handy. Wer dein Passwort erfährt, kommt damit trotzdem nicht in die Kapitänsansicht.
          Funktioniert mit jeder gängigen App — Aegis, 2FAS, Google Authenticator, Bitwarden,
          1Password. Nebenbei ersparst du dir Tipperei: Nur mit zweitem Faktor gibt es beim
          Anmelden den Haken „angemeldet bleiben", und dann hält die Anmeldung 90 Tage statt
          zwölf Stunden.
        </span>
      </div>

      <Fehler text={fehler} />

      {/* Das einzige Mal, dass die Codes lesbar sind (R1). Wer sie jetzt nicht mitnimmt, braucht
          später neue — verloren ist deswegen nichts, aber der Weg dahin führt über die App. */}
      {codes && (
        <div className="token">
          <p className="token__hinweis">Deine zehn Wiederherstellungscodes — jetzt aufschreiben</p>
          <p className="token__text">
            Jeder gilt einmal und ersetzt beim Anmelden den Code aus der App. Sie sind der Ausweg,
            wenn das Handy weg ist. Diese Liste erscheint kein zweites Mal.
          </p>
          <ul className="codeliste">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button type="button" className="knopf" onClick={() => setCodes(null)}>
            Habe ich notiert
          </button>
        </div>
      )}

      {stand === null ? (
        <p className="namen">Einen Moment …</p>
      ) : stand.aktiv && !abschalten && neueCodes ? (
        <form
          className="token"
          onSubmit={(ereignis) => {
            ereignis.preventDefault()
            if (code.length !== 6 || laeuft) return
            void fuehreAus(async () => {
              const d = await adminApi.wiederherstellungscodesNeu(code)
              setCodes(d.codes)
              setNeueCodes(false)
              setCode('')
            })
          }}
        >
          <p className="token__hinweis">Zehn neue Codes — die alten gelten danach nicht mehr</p>
          <p className="token__text">
            Auch dafür braucht es einen Code aus der App. Sonst genügte eine übernommene Sitzung,
            um sich einen Dauerzugang auszustellen.
          </p>
          <label className="feld">
            <span>Code</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(x) => setCode(x.target.value.replace(/\D/g, ''))}
            />
          </label>
          <div className="satz__aktionen">
            <button type="submit" className="knopf" disabled={laeuft || code.length !== 6}>
              Neue Codes erzeugen
            </button>
            <button
              type="button"
              className="knopf"
              onClick={() => {
                setNeueCodes(false)
                setCode('')
              }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : stand.aktiv && !abschalten ? (
        <div className="satz__aktionen">
          <span className="satz__zusatz" style={{ flex: '1 1 12rem' }}>
            <strong>Eingeschaltet.</strong> Beim Anmelden fragt die App nach dem Code — und du
            kannst dort „angemeldet bleiben" ankreuzen. Wiederherstellungscodes übrig:{' '}
            <strong>{stand.codes_uebrig}</strong>.
          </span>
          <button
            type="button"
            className="knopf"
            disabled={laeuft}
            onClick={() => {
              setNeueCodes(true)
              setCode('')
              setFehler('')
            }}
          >
            Neue Codes
          </button>
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
        /* Ein sechsstelliger Code und dann Enter — das ist die natürlichste Bewegung, die es
           an dieser Stelle gibt. Vorher passierte dabei nichts. */
        <form
          className="token"
          onSubmit={(ereignis) => {
            ereignis.preventDefault()
            if (code.length !== 6 || laeuft) return
            void fuehreAus(async () => {
              await adminApi.zweiterFaktorAus(code)
              setAbschalten(false)
              setCode('')
            })
          }}
        >
          <p className="token__hinweis">Zum Abschalten einen gültigen Code eintippen</p>
          <p className="token__text">
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
              type="submit"
              className="knopf knopf--gefahr"
              disabled={code.length !== 6 || laeuft}
            >
              Abschalten
            </button>
            <button type="button" className="knopf" disabled={laeuft} onClick={() => setAbschalten(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      ) : start ? (
        <form
          className="token"
          onSubmit={(ereignis) => {
            ereignis.preventDefault()
            if (code.length !== 6 || laeuft) return
            void fuehreAus(async () => {
              const d = await adminApi.zweiterFaktorBestaetigen(code)
              setCodes(d.codes)
              setStart(null)
              setCode('')
            })
          }}
        >
          <p className="token__hinweis">Jetzt in die App eintragen — danach mit einem Code bestätigen</p>
          <p className="token__text">
            Auf dem Handy: den Link antippen, dann öffnet sich deine Authenticator-App von selbst.
            Am Rechner: das Geheimnis von Hand eintragen.
          </p>
          <p style={{ margin: '0 0 0.5rem' }}>
            <a href={start.uri}>In der Authenticator-App öffnen</a>
          </p>
          <p
            style={{
              margin: '0 0 0.75rem',
              fontFamily: 'var(--schrift-mono)',
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
            <button type="submit" className="knopf" disabled={code.length !== 6 || laeuft}>
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
        </form>
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
 * Der Reiter „Mannschaft" — die eine, die oben gewählt ist: ihr Name und ihre Spieler.
 *
 * Für beide Rollen derselbe Inhalt. Der Unterschied liegt in der Auswahl darüber: Ein Kapitän
 * hat dort genau eine Mannschaft. Die Konten seiner Kapitäne stehen NICHT hier, sondern im
 * Reiter „Konten" — sie sind eine Sache des Admins und gehören nicht in die Mannschaftsarbeit.
 */
function MannschaftenReiter({
  abgemeldet,
  team,
  neuLaden,
  mannschaften,
}: {
  abgemeldet: () => void
  team: string
  neuLaden: () => void
  /** Alle Mannschaften des Vereins — fuer den Wechsel eines Spielers. Beim Kapitaen leer. */
  mannschaften: { id: string; name: string }[]
}) {
  // Ein Reiter, eine Aussage: Ohne Mannschaft haben weder ihre Werte noch ihre Spieler einen
  // Gegenstand. Das steht hier und nicht in den beiden Bauteilen darunter, sonst stünde derselbe
  // Satz zweimal untereinander.
  if (!team) {
    return (
      <p className="namen">
        Es gibt noch keine Mannschaft. Angelegt wird sie im Reiter „Verein" — das kann der Admin.
        Danach stehen hier ihr Name und ihre Spieler.
      </p>
    )
  }

  return (
    <>
      <Mannschaftseinstellungen abgemeldet={abgemeldet} team={team} neuLaden={neuLaden} />
      <Mitglieder abgemeldet={abgemeldet} team={team} mannschaften={mannschaften} />
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

  // Ohne gewählte Mannschaft fände `laden()` nichts und `satz` bliebe null — die Ladeanzeige
  // stünde dann unbegrenzt. Erreichbar ist das nicht mehr, `MannschaftenReiter` fängt den Fall
  // eine Ebene höher ab; der Hinweis bleibt, damit niemand die Bedingung dort für Zierrat hält.
  if (!satz || !entwurf) return <p className="namen">Einen Moment …</p>

  const name = entwurf.name.trim()
  const startort = entwurf.startort.trim()
  const veraendert = name !== satz.name || startort !== satz.startort

  const speichern = async (ereignis: React.FormEvent) => {
    ereignis.preventDefault()
    if (!name || !veraendert || laeuft) return
    setLaeuft(true)
    setFehler('')
    try {
      await adminApi.mannschaftAendern(satz.id, { name, startort })
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
  }

  return (
    <form className="satz" onSubmit={speichern}>
      <div className="satz__kopf">
        <h2 className="satz__name">Mannschaft</h2>
        <span className="satz__zusatz">
          Der Name steht im Aushang und in dieser Ansicht. Tempo und Rüstzeit stehen am einzelnen
          Spieltag — sie unterscheiden sich von Fahrt zu Fahrt mehr als von Mannschaft zu
          Mannschaft.
        </span>
      </div>

      <Fehler text={fehler} />

      <div className="satz__aktionen">
        <label className="feld feld--zeile">
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

      {/* Der Treffpunkt ist bei fast jeder Mannschaft immer derselbe, stand aber an jedem
          Spieltag einzeln — und ein eingelesener Spielplan bringt dreißig auf einmal. Was hier
          steht, ist die Vorbelegung für NEUE Auswärtsspiele; am Spieltag selbst lässt er sich
          weiterhin überschreiben, und vorhandene Spieltage rührt es nicht an. */}
      <div className="satz__aktionen">
        <label className="feld feld--zeile">
          <span>Treffpunkt</span>
          <input
            maxLength={120}
            value={entwurf.startort}
            placeholder="z. B. Parkplatz am Vereinsheim"
            onChange={(x) => {
              setEntwurf({ ...entwurf, startort: x.target.value })
              setGespeichert(false)
            }}
          />
        </label>
      </div>

      <div className="satz__aktionen">
        <button type="submit" className="knopf" disabled={!name || !veraendert || laeuft}>
          {laeuft ? 'Speichert …' : 'Speichern'}
        </button>
        <span className="satz__zusatz" style={{ alignSelf: 'center' }} role="status">
          {gespeichert ? 'Gespeichert.' : ''}
        </span>
      </div>
    </form>
  )
}

/** Mannschaften anlegen und auflösen — Sache des Gesamt-Admins (Abschnitt 12). */
function Mannschaften({ abgemeldet, neuLaden }: { abgemeldet: () => void; neuLaden: () => void }) {
  const { items, fehler, setFehler, laden } = useListe(adminApi.mannschaften, abgemeldet)
  const [neu, setNeu] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [frage, setFrage] = useState<Nachfrage | null>(null)

  return (
    <div className="satz">
      <div className="satz__kopf">
        <h2 className="satz__name">Alle Mannschaften</h2>
        <span className="satz__zusatz">
          Jede Mannschaft hat eigene Mitglieder, eigene Spieltage und einen eigenen Kapitän. Was
          zentral steht — Rechtstexte, Sperrfrist, Sicherungen — gilt für alle gemeinsam.
        </span>
      </div>

      <Fehler text={fehler} />

      {/* Ein Formular, kein Knopf mit `onClick`: Wer einen Namen eintippt, drückt Enter. Nur
          diese Zeile, nicht der ganze Abschnitt — die Liste darunter enthält „Auflösen", und
          das gehört in kein Formular, das man versehentlich absenden kann. */}
      <form
        className="satz__aktionen"
        onSubmit={async (ereignis) => {
          ereignis.preventDefault()
          if (!neu.trim() || laeuft) return
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
        <label className="feld feld--zeile">
          <span>Neue Mannschaft</span>
          <input maxLength={60} value={neu} onChange={(x) => setNeu(x.target.value)} />
        </label>
        <button type="submit" className="knopf" disabled={!neu.trim() || laeuft}>
          Anlegen
        </button>
      </form>

      {items === null ? (
        <p className="namen">Einen Moment …</p>
      ) : items.length === 0 ? (
        /* Der erste Bildschirm einer frisch aufgesetzten Anwendung. Kein Willkommensrundgang —
           nur der eine Schritt, an dem alles andere hängt, und wozu er führt. */
        <div className="token">
          <p className="token__hinweis">Fang hier an</p>
          <p className="token__text">
            Lege eure erste Mannschaft an. Danach kannst du im Reiter „Mannschaft" die Spieler
            eintragen und ihnen ihren persönlichen Link schicken, und unter „Spieltage" den
            Spielplan.
          </p>
        </div>
      ) : (
        <ul className="namen liste">
          {items.map((t) => (
            <li key={t.id} className="eintrag">
              <span style={{ flex: '1 1 auto' }}>{t.name}</span>
              <button
                type="button"
                className="knopf knopf--gefahr"
                disabled={laeuft}
                onClick={() =>
                  setFrage({
                    id: t.id,
                    titel: `Mannschaft „${t.name}" auflösen`,
                    text: 'Das geht nur, solange sie leer ist — der Server lehnt es ab, wenn noch Spieler, Spieltage oder Konten an ihr hängen, und sagt dann, woran es lag.',
                    knopf: 'Auflösen',
                    tun: async () => {
                      setFrage(null)
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
                    },
                  })
                }
              >
                Auflösen
              </button>
            </li>
          ))}
        </ul>
      )}
      <Nachfragekasten frage={frage} abbrechen={() => setFrage(null)} laeuft={laeuft} />
    </div>
  )
}
/**
 * Der Reiter „Konten" — alle Verwalterkonten über alle Mannschaften hinweg.
 *
 * Steht bewusst nicht im Reiter der einzelnen Mannschaft: Wer Konten anlegen darf, darf alles,
 * und diese Arbeit gehört dem Admin, nicht in die Mannschaftsarbeit. Gruppiert nach Mannschaft,
 * weil das die Frage ist, die man hier stellt — „wer betreut die Damen?" und nicht „was macht
 * Konto Nummer sieben?".
 *
 * Mehrere Kapitäne je Mannschaft sind ausdrücklich vorgesehen und brauchen keinen eigenen
 * Begriff: Eine Vertretung ist ein zweites Konto mit denselben Rechten. Wer was getan hat, steht
 * ohnehin im Protokoll.
 *
 * Das Passwort wird erzeugt und genau einmal angezeigt, wie der Einladungslink eines Mitglieds.
 * Gespeichert ist davon nur ein Hash; herausholen kann es niemand, auch der Admin nicht.
 */
/**
 * Der Wert im Feld „Spielt als", der „diesen Spieler gibt es noch nicht" bedeutet — dasselbe
 * Muster wie beim Spielplan-Import.
 */
const NEUER_SPIELER = 'neu:spieler'

function Konten({ abgemeldet }: { abgemeldet: () => void }) {
  const { items, fehler, setFehler, laden } = useListe(adminApi.verwalter, abgemeldet)
  const { items: teams } = useListe(adminApi.mannschaften, abgemeldet)

  const [email, setEmail] = useState('')
  const [rolle, setRolle] = useState<'admin' | 'kapitaen'>('kapitaen')
  const [team, setTeam] = useState('')
  const [mitglied, setMitglied] = useState('')
  // Der Name für einen Spielereintrag, der zusammen mit dem Konto entstehen soll.
  const [spielername, setSpielername] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [gezeigt, setGezeigt] = useState<{ email: string; passwort: string } | null>(null)
  const [frage, setFrage] = useState<Nachfrage | null>(null)

  // Für die Verknüpfung zum Spielereintrag — nur die Spieler der gewählten Mannschaft.
  const { items: spieler, laden: spielerLaden } = useListe(
    () => adminApi.mitglieder(team),
    abgemeldet,
    team,
  )

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

  const zeile = (v: Verwalterkonto) => (
    <li key={v.id} className="eintrag">
      <span style={{ flex: '1 1 14rem' }}>{v.email}</span>
      <span className="satz__zusatz">{v.totp ? 'zweiter Faktor an' : 'nur Passwort'}</span>
      {/* R7 · Nach zehn Fehlversuchen ist eine Viertelstunde Ruhe. Das steht hier, weil der
          Betroffene es selbst nicht sehen kann — er kommt ja gerade nicht herein. */}
      {v.gesperrt > 0 && (
        <>
          <span className="satz__zusatz">
            <strong>gesperrt</strong>, noch {Math.ceil(v.gesperrt / 60)} min
          </span>
          <button
            type="button"
            className="knopf"
            disabled={laeuft}
            onClick={() => void fuehreAus(() => adminApi.verwalterEntsperren(v.id))}
          >
            Sperre aufheben
          </button>
        </>
      )}
      {v.totp && (
        <button
          type="button"
          className="knopf"
          disabled={laeuft}
          onClick={() =>
            // Eine Schwächung — sie gehört bestätigt und steht im Protokoll.
            setFrage({
              id: v.id,
              titel: `Zweiten Faktor von „${v.email}" abschalten`,
              text: 'Danach genügt sein Passwort, um in die Kapitänsansicht zu kommen. Er kann den zweiten Faktor selbst wieder einrichten.',
              knopf: 'Faktor abschalten',
              tun: () => {
                setFrage(null)
                void fuehreAus(() => adminApi.verwalterZweiterFaktorAus(v.id))
              },
            })
          }
        >
          Faktor abschalten
        </button>
      )}
      <button
        type="button"
        className="knopf"
        disabled={laeuft}
        onClick={() =>
          // Sperrt eine Person aus, ohne dass sie es kommen sieht — und stand bis hierher als
          // einziger dieser Knöpfe ganz ohne Rückfrage zwischen zwei bestätigten Handlungen.
          setFrage({
            id: v.id,
            titel: `Neues Passwort für „${v.email}"`,
            text: 'Sein bisheriges gilt sofort nicht mehr. Das neue wird genau einmal angezeigt — du musst es ihm weitergeben, sonst kommt er nicht mehr herein.',
            knopf: 'Neues Passwort erzeugen',
            tun: () => {
              setFrage(null)
              void fuehreAus(async () => {
                const d = await adminApi.verwalterAendern(v.id, { neues_passwort: true })
                if (d.passwort) setGezeigt({ email: v.email, passwort: d.passwort })
              })
            },
          })
        }
      >
        Neues Passwort
      </button>
      <button
        type="button"
        className="knopf knopf--gefahr"
        disabled={laeuft}
        onClick={() =>
          setFrage({
            id: v.id,
            titel: `Konto „${v.email}" löschen`,
            text: 'Seine offenen Sitzungen enden sofort. Der Spielereintrag bleibt — gelöscht wird der Zugang, nicht die Person.',
            knopf: 'Konto löschen',
            tun: () => {
              setFrage(null)
              void fuehreAus(() => adminApi.verwalterLoeschen(v.id))
            },
          })
        }
      >
        Löschen
      </button>
      <Nachfragekasten
        frage={frage?.id === v.id ? frage : null}
        abbrechen={() => setFrage(null)}
        laeuft={laeuft}
      />
    </li>
  )

  // Gruppen: erst die Admins, dann jede Mannschaft. Auch die ohne Kapitän — gerade die, denn
  // eine Mannschaft ohne Betreuer ist das, was man hier sehen will.
  const admins = (items ?? []).filter((v) => v.rolle === 'admin')

  return (
    <div className="satz">
      <div className="satz__kopf">
        <h2 className="satz__name">Konten</h2>
        <span className="satz__zusatz">
          Ein Kapitän sieht ausschließlich seine Mannschaft: Spieler anlegen und bearbeiten,
          Spieltage pflegen, Rückmeldungen korrigieren. Ein Admin sieht alles, hat aber selbst
          weder Mannschaft noch Spielereintrag — wer verwaltet, soll in seiner eigenen Verwaltung
          nicht Partei sein.
        </span>
      </div>

      <Fehler text={fehler} />

      {gezeigt && (
        <div className="token">
          <p className="token__hinweis">Dieses Passwort wird genau einmal angezeigt</p>
          <p className="token__text">
            Gib es <strong>{gezeigt.email}</strong> weiter, am besten im Einzelchat. Wieder
            hervorholen lässt es sich nicht — gespeichert ist nur ein Hash. Ist es weg, erzeugst du
            ein neues.
          </p>
          <p
            style={{
              margin: '0 0 0.5rem',
              fontFamily: 'var(--schrift-mono)',
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

      {/* ── Neues Konto ──────────────────────────────────────────────────────────────────── */}
      <form
        className="satz__aktionen"
        style={{ flexWrap: 'wrap' }}
        onSubmit={(ereignis) => {
          ereignis.preventDefault()
          if (!email.trim() || (rolle === 'kapitaen' && !team) || laeuft) return
          void fuehreAus(async () => {
            // Ein Kapitän, der selbst mitspielt, brauchte bisher zwei Wege: erst unter
            // „Mannschaft" den Spieler anlegen, dann hierher zurück und ihn auswählen. Wer das
            // nicht wusste, legte das Konto ohne Verknüpfung an — und damit ohne den
            // Einladungslink, über den er als Spieler zu- und absagt.
            //
            // Der Spielereintrag entsteht deshalb ZUERST und die Auswahl merkt ihn sich sofort:
            // Scheitert das Konto danach am Anmeldenamen, legt der zweite Versuch keinen
            // zweiten Spieler an.
            let bezug = mitglied
            if (bezug === NEUER_SPIELER) {
              const neuer = await adminApi.mitgliedAnlegen(spielername.trim(), team)
              bezug = neuer.id
              setMitglied(neuer.id)
              setSpielername('')
              await spielerLaden()
            }
            const d = await adminApi.verwalterAnlegen(email.trim(), rolle, team, bezug)
            setGezeigt({ email: d.email, passwort: d.passwort })
            setEmail('')
            setMitglied('')
          })
        }}
      >
        <label className="feld feld--zeile">
          <span>Anmeldename</span>
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(x) => setEmail(x.target.value)}
          />
          <span className="feld__hinweis">
            In E-Mail-Form, muss aber keine echte Adresse sein — etwa
            <code> kapitaen@verein.intern</code>. Es wird nie etwas dorthin geschickt.
          </span>
        </label>
        <label className="feld feld--kurz">
          <span>Rolle</span>
          <select
            value={rolle}
            onChange={(x) => {
              const r = x.target.value === 'admin' ? 'admin' : 'kapitaen'
              setRolle(r)
              // Ein Admin hat weder Mannschaft noch Spielereintrag — die Felder daneben würden
              // sonst Werte tragen, die der Server ohnehin ablehnt.
              if (r === 'admin') {
                setTeam('')
                setMitglied('')
                setSpielername('')
              }
            }}
          >
            <option value="kapitaen">Kapitän</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {rolle === 'kapitaen' && (
          <label className="feld feld--kurz">
            <span>Mannschaft</span>
            <select
              value={team}
              onChange={(x) => {
                setTeam(x.target.value)
                setMitglied('')
                setSpielername('')
              }}
            >
              <option value="">— wählen —</option>
              {(teams ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {rolle === 'kapitaen' && team && (
          <label className="feld feld--kurz">
            <span>Spielt als</span>
            <select value={mitglied} onChange={(x) => setMitglied(x.target.value)}>
              <option value="">— spielt nicht mit —</option>
              <option value={NEUER_SPIELER}>— neu anlegen —</option>
              {(spieler ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <span className="feld__hinweis">Wer nur organisiert, bleibt unverknüpft.</span>
          </label>
        )}
        {rolle === 'kapitaen' && team && mitglied === NEUER_SPIELER && (
          <label className="feld feld--kurz">
            <span>Name des Spielers</span>
            <input
              type="text"
              value={spielername}
              onChange={(x) => setSpielername(x.target.value)}
            />
            <span className="feld__hinweis">
              Wird zusammen mit dem Konto in dieser Mannschaft angelegt — mitsamt eigenem
              Einladungslink, den du danach unter „Mannschaft" ausstellst.
            </span>
          </label>
        )}
        <button
          type="submit"
          className="knopf"
          disabled={
            !email.trim() ||
            (rolle === 'kapitaen' && !team) ||
            (mitglied === NEUER_SPIELER && !spielername.trim()) ||
            laeuft
          }
        >
          Konto anlegen
        </button>
      </form>

      {/* ── Vorhandene Konten, nach Mannschaft ───────────────────────────────────────────── */}
      {items === null ? (
        <p className="namen">Einen Moment …</p>
      ) : (
        <>
          <h3 className="satz__gruppe">Admins</h3>
          {admins.length === 0 ? (
            <p className="namen">
              Keins. Du selbst bist als Superuser angemeldet — der ist immer Admin.
            </p>
          ) : (
            <ul className="namen liste">
              {admins.map(zeile)}
            </ul>
          )}

          <h3 className="satz__gruppe">Kapitäne</h3>
          {(teams ?? []).length === 0 ? (
            <p className="namen">Noch keine Mannschaft angelegt — siehe Reiter „Verein".</p>
          ) : (
            (teams ?? []).map((t) => {
              const ihre = items.filter((v) => v.rolle === 'kapitaen' && v.team === t.id)
              return (
                <div key={t.id}>
                  <h4 className="satz__untergruppe">{t.name}</h4>
                  {ihre.length === 0 ? (
                    <p className="namen">Noch kein Kapitän — du betreust sie selbst.</p>
                  ) : (
                    <ul className="namen liste">
                      {ihre.map(zeile)}
                    </ul>
                  )}
                </div>
              )
            })
          )}
        </>
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
  const { items: liste, fehler, setFehler, laden } = useListe(adminApi.sicherungen, abgemeldet)
  const [laeuft, setLaeuft] = useState('')
  const [zurueck, setZurueck] = useState('')
  const [frage, setFrage] = useState<Nachfrage | null>(null)
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
          <h2 className="satz__name">Wird zurückgespielt …</h2>
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
        <h2 className="satz__name">Sicherungen</h2>
        <span className="satz__zusatz">
          Eine Sicherung enthält <strong>alles</strong> — Mitglieder, Spieltage, Rückmeldungen. Die
          heruntergeladene Datei ist unverschlüsselt: Sie gehört auf deinen eigenen Rechner, nicht
          in eine Cloud und nicht in einen Gruppenchat. Und sie gehört{' '}
          <strong>weg vom Server</strong>, denn eine Kopie neben dem Original ist im Ernstfall
          genauso verloren wie das Original.
        </span>
      </div>

      <Fehler text={fehler} />

      <div className="satz__aktionen">
        <button
          type="button"
          className="knopf"
          disabled={laeuft !== ''}
          onClick={() => fuehreAus('create', adminApi.sicherungErstellen)}
        >
          {laeuft === 'create' ? 'Erstellt …' : 'Sicherung erstellen'}
        </button>
        <label className="feld feld--zeile">
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

      {/* Eine Sicherung altert still. Bis hierher stand in der Liste nur, wie eine Datei heißt und
          wie groß sie ist — wie alt sie ist, war die eine Angabe, die niemand ablesen konnte, und
          der Moment, in dem das auffällt, ist immer der falsche. Gerechnet wird auf dem jüngsten
          Eintrag; die Liste kommt bereits nach Datum sortiert vom Server. */}
      {liste !== null &&
        liste.length > 0 &&
        (() => {
          const tage = tageSeit(liste[0].geaendert)
          const alt = tage !== null && tage >= SICHERUNG_ALT_TAGE
          const wann = seit(liste[0].geaendert)
          if (!wann) return null
          return (
            <p className={alt ? 'satz__warnung' : 'namen'}>
              Zuletzt gesichert <strong>{wann}</strong>
              {alt && ' — das ist eine Weile her. Erstelle eine neue und lade sie herunter.'}
            </p>
          )
        })()}

      {liste === null ? (
        <p className="namen">Einen Moment …</p>
      ) : liste.length === 0 ? (
        <p className="satz__warnung">
          Noch keine Sicherung vorhanden. Die erste ist die wichtigste — sie ist der einzige
          Rückweg, wenn etwas schiefgeht.
        </p>
      ) : (
        <ul className="namen liste">
          {liste.map((x) => (
            <li key={x.name} className="eintrag">
                <a href={adminApi.sicherungUrl(x.name)} style={{ flex: '1 1 16rem' }}>
                  {x.name}
                </a>
                <span className="satz__zusatz">
                  {systemDatum(x.geaendert) || '—'} · {Math.max(1, Math.round(x.groesse / 1024))} KB
                </span>
                <button
                  type="button"
                  className="knopf"
                  disabled={laeuft !== ''}
                  onClick={() =>
                    setFrage({
                      id: x.name,
                      titel: `„${x.name}" vom Server löschen`,
                      text: 'Nur die Kopie auf dem Server verschwindet. Eine bereits heruntergeladene Datei bleibt, wo sie ist — und dorthin gehört sie ohnehin.',
                      knopf: 'Sicherung löschen',
                      tun: () => {
                        setFrage(null)
                        void fuehreAus('delete', () => adminApi.sicherungLoeschen(x.name))
                      },
                    })
                  }
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
              <Nachfragekasten
                frage={frage?.id === x.name ? frage : null}
                abbrechen={() => setFrage(null)}
                laeuft={laeuft !== ''}
              />
            </li>
          ))}
        </ul>
      )}

      {zurueck && (
        /* Auch hier ein Formular — wer einen Dateinamen abtippt, schließt mit Enter ab. Der
           Knopf bleibt trotzdem die Hürde: Er gibt erst nach, wenn der Name genau stimmt. */
        <form
          className="token"
          onSubmit={(ereignis) => {
            ereignis.preventDefault()
            if (getippt !== zurueck || laeuft !== '') return
            void zurueckspielen()
          }}
        >
          <p className="token__hinweis">Das ersetzt den gesamten heutigen Stand</p>
          <p className="token__text">
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
              type="submit"
              className="knopf knopf--gefahr"
              disabled={getippt !== zurueck || laeuft !== ''}
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
        </form>
      )}
    </div>
  )
}

const WAS: Record<string, string> = {
  'session.start': 'Link geöffnet',
  'response.set': 'Rückmeldung',
  'response.correct': 'Rückmeldung korrigiert',
  'ride.correct': 'Fahrdienst nach Absage zurückgezogen',
  'ride.set': 'Fahrdienst',
  'seat.set': 'Mitfahrt',
  'token.rotate': 'Neues Token',
  'admin.login': 'Kapitän angemeldet',
  'member.create': 'Mitglied angelegt',
  'member.update': 'Mitglied geändert',
  'fixture.create': 'Spieltag angelegt',
  'fixture.move': 'Spieltag verlegt',
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
  if (fehler) return <Fehler text={fehler} />
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
