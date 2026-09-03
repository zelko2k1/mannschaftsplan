import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api, KeineSitzung, type Board, type Spieltag, type Status } from './api'
import Zeile from './Zeile'
import { ANTWORTEN, wannUngefaehr } from './format'
import './abfahrtsplan.css'
import { alsIcs } from './kalender'

/**
 * Die Kapitänsansicht wird erst geholt, wenn jemand sie aufruft.
 *
 * Sie ist der größere Teil der Anwendung — Spieltage, Mitglieder, Konten, Einstellungen,
 * Sicherungen, zweiter Faktor — und der Spieler sieht sie nie. Er bekommt einen Link geschickt,
 * tippt drei Knöpfe und ist wieder weg; ihm die ganze Verwaltung mitzuschicken, kostet ihn
 * Bandbreite in der Kneipe und Rechenzeit auf einem Telefon, das vielleicht nicht neu ist.
 *
 * `admin.css` hängt an diesem Bauteil und wandert mit — der Aushang lädt es nicht mehr mit.
 */
const Admin = lazy(() => import('./Admin'))

type Lage = 'laedt' | 'da' | 'ohne-sitzung' | 'kaputt'

/**
 * Erscheint, wenn keine gültige Sitzung vorliegt. Absichtlich dieselbe Aussage wie die
 * serverseitige Seite (R6): kein Hinweis darauf, woran es lag.
 */
function LinkUngueltig() {
  return (
    <div className="leer">
      <h1 className="balken leer__titel">Link ungültig</h1>
      <p>Öffne den Link aus deinem Chat noch einmal.</p>
      <p>Wenn er nicht mehr funktioniert, frag den Kapitän nach einem neuen.</p>
    </div>
  )
}

export default function App() {
  // Die Kapitänsansicht ist eine eigene Route mit eigenem Router, eigener Sitzungstabelle und
  // eigenem Cookie (R5). Ein Router wäre für zwei Seiten übertrieben — der Pfad genügt.
  //
  // Zwei Pfade führen hinein (R13e): `/manage` steht offen, `/admin` liegt hinter dem Gate aus
  // R13b. Dieselbe Oberfläche, derselbe Cookie — was jemand darf, entscheidet in beiden Fällen
  // der Server anhand der Rolle, nicht der Pfad, über den er gekommen ist.
  const pfad = window.location.pathname
  if (pfad.startsWith('/manage') || pfad.startsWith('/admin')) {
    return (
      // Derselbe Satz, den die Kapitänsansicht danach selbst zeigt, während sie prüft, wer da
      // ist — nur ohne ihren Rahmen: Deren Stilangaben stecken im nachgeladenen Teil und sind in
      // genau diesem Augenblick noch nicht da.
      <Suspense
        fallback={
          <main className="leer">
            <p>Einen Moment …</p>
          </main>
        }
      >
        <Admin />
      </Suspense>
    )
  }

  return <Abfahrtsplan />
}

function Abfahrtsplan() {
  const [lage, setLage] = useState<Lage>('laedt')
  const [board, setBoard] = useState<Board | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [fehler, setFehler] = useState<Record<string, string>>({})
  const [laeuft, setLaeuft] = useState<Set<string>>(new Set())
  const [zeigeVorbei, setZeigeVorbei] = useState(false)
  /** Was zuletzt gespeichert wurde — der Aushang sagte den Erfolg bisher nie an. */
  const [gemeldet, setGemeldet] = useState('')
  /**
   * Wo die Quittung erscheint — bei den Rückmeldeknöpfen oder beim Fahrdienst.
   *
   * Sie stand bisher ganz unten im aufgeklappten Bereich, hinter dem Fahrdienst und vier Absätzen
   * Namen. Auf einem Handy ist das mehrere hundert Pixel unter dem Knopf, den man gerade getippt
   * hat — die Rückmeldung gab es also, nur sah sie niemand. Aus der Mannschaft kam sie deshalb
   * als „ich kann gar nicht erkennen, ob meine Änderung gespeichert ist" zurück.
   */
  const [bereich, setBereich] = useState<'antwort' | 'fahrt' | ''>('')

  const laden = useCallback(async () => {
    try {
      setBoard(await api.board())
      setLage('da')
    } catch (problem) {
      setLage(problem instanceof KeineSitzung ? 'ohne-sitzung' : 'kaputt')
    }
  }, [])

  useEffect(() => {
    // Genau der Fall, für den Effekte gedacht sind: mit einem System außerhalb von React
    // abgleichen. Die Zustandsänderungen passieren erst, wenn die Antwort da ist, nicht
    // synchron im Effekt — die Regel kann das nicht sehen.
    // oxlint-disable-next-line react/set-state-in-effect
    void laden()
  }, [laden])

  /**
   * Optimistisch ändern, bei Fehler zurückrollen (6.5). Kein Modal, kein Toast, der wegfliegt —
   * eine Zeile Klartext an der betroffenen Zeile, die stehen bleibt.
   */
  const aendern = useCallback(
    async (
      spieltagId: string,
      sofort: (s: Spieltag) => Spieltag,
      senden: () => Promise<unknown>,
      /**
       * Was danach dasteht. Der Grundsatz „Ehrlich statt hübsch" (6.5) verlangt beim Fehler eine
       * Zeile Klartext — er verlangt beim Erfolg nicht Schweigen. Bisher füllte sich nur der
       * Knopf: Wer auf einer trägen Verbindung nicht sicher war, ob es angekommen ist, tippte
       * nochmal — und nahm damit seine Zusage zurück, ohne es zu erfahren.
       */
      meldung: string,
      /** Bei welchen Knöpfen die Quittung steht — dort, wo gerade getippt wurde. */
      wo: 'antwort' | 'fahrt',
    ) => {
      if (!board) return
      const vorher = board
      setGemeldet('')
      setBereich(wo)

      setBoard({
        ...board,
        fixtures: board.fixtures.map((f) => (f.id === spieltagId ? sofort(f) : f)),
      })
      setFehler((alt) => {
        const neu = { ...alt }
        delete neu[spieltagId]
        return neu
      })
      setLaeuft((alt) => new Set(alt).add(spieltagId))

      try {
        await senden()
        // Nachladen, weil der Server Dinge weiß, die der Client nicht raten kann: wen ein
        // zurückgezogenes Auto mitgerissen hat, wer in der Zwischenzeit eingestiegen ist.
        setBoard(await api.board())
        setGemeldet(meldung)
      } catch (problem) {
        if (problem instanceof KeineSitzung) {
          setLage('ohne-sitzung')
          return
        }
        setBoard(vorher)
        setFehler((alt) => ({
          ...alt,
          [spieltagId]:
            problem instanceof Error && problem.message
              ? `${problem.message} Nochmal antippen.`
              : 'Nicht gespeichert — nochmal antippen.',
        }))
      } finally {
        setLaeuft((alt) => {
          const neu = new Set(alt)
          neu.delete(spieltagId)
          return neu
        })
      }
    },
    [board],
  )

  // Auch die Zwischenstände sind Seiten und brauchen ihre Landmarke — sonst hat die Anwendung
  // sie in genau den Momenten nicht, in denen jemand sucht, woran er ist.
  if (lage === 'laedt') {
    return (
      <div className="plan">
        <main className="leer">
          <p>Einen Moment …</p>
        </main>
      </div>
    )
  }

  if (lage === 'ohne-sitzung') {
    return (
      <div className="plan">
        <main>
          <LinkUngueltig />
        </main>
      </div>
    )
  }

  if (lage === 'kaputt' || !board) {
    return (
      <div className="plan">
        <main className="leer">
          <p>Der Plan lässt sich gerade nicht laden.</p>
          <p>
            <button type="button" className="knopf" onClick={() => void laden()}>
              Nochmal versuchen
            </button>
          </p>
        </main>
      </div>
    )
  }

  const ich = board.members.find((m) => m.id === board.me)
  const vorbei = board.fixtures.filter((s) => wannUngefaehr(s.date) === 'vorbei')
  const kommend = board.fixtures.filter((s) => wannUngefaehr(s.date) !== 'vorbei')

  const setzeAntwort = (spieltag: Spieltag, status: Status | null) =>
    aendern(
      spieltag.id,
      (s) => {
        const responses = { ...s.responses }
        if (status === null) delete responses[board.me]
        else responses[board.me] = status
        return { ...s, responses }
      },
      () => api.antwort(spieltag.id, status),
      status === null
        ? 'Antwort zurückgenommen.'
        : `Gespeichert: ${ANTWORTEN.find((a) => a.wert === status)?.text ?? ''}.`,
      'antwort',
    )

  /**
   * „Ich komme selbst" — ein Schalter am Fahrdienst, keine vierte Antwort.
   *
   * Ob jemand kommt und wie er hinkommt, sind zwei Fragen; die zweite gibt es nur auswärts. Eine
   * vierte Antwort („dabei, komme direkt") hätte beide vermengt und in jeder Zählung, jeder
   * Korrekturmaske und jeder Namensliste einen Sonderfall hinterlassen.
   */
  const setzeSelbst = (spieltag: Spieltag, selbst: boolean) =>
    aendern(
      spieltag.id,
      (s) => {
        const liste = s.selbst_anreise.filter((id) => id !== board.me)
        if (selbst) liste.push(board.me)
        // Wer selbst kommt, gibt seinen Platz frei — der Server tut dasselbe.
        const seat_claims = { ...s.seat_claims }
        const vorher = seat_claims[board.me]
        if (selbst) delete seat_claims[board.me]
        return {
          ...s,
          selbst_anreise: liste,
          seat_claims,
          rides: s.rides.map((f) => ({
            ...f,
            taken: f.taken - (selbst && f.id === vorher ? 1 : 0),
          })),
        }
      },
      () => api.antwort(spieltag.id, 'yes', selbst),
      selbst ? 'Gespeichert: du kommst selbst.' : 'Gespeichert: du brauchst eine Mitfahrgelegenheit.',
      'fahrt',
    )

  const setzeFahrt = (spieltag: Spieltag, faehrt: boolean, plaetze?: number) =>
    aendern(
      spieltag.id,
      (s) => {
        const rides = s.rides.filter((f) => f.member !== board.me)
        if (faehrt) {
          const alt = s.rides.find((f) => f.member === board.me)
          rides.push({
            id: alt?.id ?? 'neu',
            member: board.me,
            seats: plaetze ?? 3,
            taken: alt?.taken ?? 0,
          })
        }
        return { ...s, rides }
      },
      () => api.fahren(spieltag.id, faehrt, plaetze),
      faehrt
        ? `Gespeichert: du fährst, ${plaetze ?? 3} Plätze.`
        : (() => {
            // Wer beim Zurückziehen Mitfahrer hatte, soll in der Quittung lesen, wen es trifft.
            const drin = Object.entries(spieltag.seat_claims)
              .filter(([, wo]) => spieltag.rides.some((f) => f.id === wo && f.member === board.me))
              .map(([wer]) => board.members.find((m) => m.id === wer)?.name ?? '—')
            return drin.length
              ? `Gespeichert: du fährst nicht. ${drin.join(' und ')} ${
                  drin.length === 1 ? 'muss' : 'müssen'
                } sich neu einteilen.`
              : 'Gespeichert: du fährst nicht.'
          })(),
      'fahrt',
    )

  const setzeMitfahrt = (spieltag: Spieltag, fahrt: string | null) =>
    aendern(
      spieltag.id,
      (s) => {
        const seat_claims = { ...s.seat_claims }
        const vorher = seat_claims[board.me]
        if (fahrt) seat_claims[board.me] = fahrt
        else delete seat_claims[board.me]
        return {
          ...s,
          seat_claims,
          rides: s.rides.map((f) => ({
            ...f,
            taken: f.taken + (f.id === fahrt ? 1 : 0) - (f.id === vorher ? 1 : 0),
          })),
        }
      },
      () => api.mitfahren(spieltag.id, fahrt),
      fahrt ? 'Gespeichert: du fährst mit.' : 'Gespeichert: du bist ausgestiegen.',
      'fahrt',
    )

  return (
    <div className="plan">
      <header className="balken kopf">
        {/* Die eine Überschrift der Seite. Vorher stand hier ein `span`, und damit hatte der
            Aushang gar keine — die Sprungnavigation einer Bildschirmleseanwendung setzt aber
            genau dort an. */}
        <h1 className="kopf__titel">Spieltage</h1>
        <span className="kopf__wer">
          {ich?.name ?? ''}
          {/* Abschnitt 12 · Für den Kapitän, der mitspielt: Er sieht hier denselben Aushang wie
              alle anderen und braucht dafür keine Anmeldung. Nur wenn er wirklich verwalten
              will, geht es hier hinüber. */}
          {board.verwalter && (
            <>
              {' · '}
              <a className="kopf__abmelden" href="/manage">
                Verwaltung
              </a>
            </>
          )}
          {' · '}
          <button
            type="button"
            className="kopf__abmelden"
            onClick={async () => {
              try {
                await api.abmelden()
              } catch {
                /* auch wenn das schiefgeht: die Sitzung ist für uns beendet */
              }
              setLage('ohne-sitzung')
            }}
          >
            Abmelden
          </button>
        </span>
      </header>

      {/* Der Aushang selbst — was zwischen Kopfbalken und Kleingedrucktem steht. Ohne diese
          Landmarke gibt es kein „zum Inhalt springen", und die Seite ist für eine
          Bildschirmleseanwendung eine einzige Fläche. */}
      <main>
      {board.fixtures.length === 0 ? (
        <div className="leer">
          <p>Noch keine Termine eingetragen.</p>
        </div>
      ) : (
        <ul className="liste">
          {/* Vergangenes liegt zusammengefaltet obenauf, statt den Blick zu verstellen. Der
              Spielplan kommt vom Server nach Datum sortiert, also standen mitten in der Saison
              zuerst zwölf graue Zeilen und der nächste Termin unterhalb des Bildschirms — bei
              einer App, deren Einsatzsituation „kurzer Blick, ein bis zwei Antippen" ist.
              Weggeworfen wird nichts: Wer nachsehen will, wer beim letzten Mal gefahren ist,
              klappt die Zeile auf. */}
          {vorbei.length > 0 && (
            <li className="zeile zeile--vorbei">
              <button
                type="button"
                className="rueckschau"
                aria-expanded={zeigeVorbei}
                onClick={() => setZeigeVorbei(!zeigeVorbei)}
              >
                {zeigeVorbei ? 'Vergangene ausblenden' : `Vorbei (${vorbei.length})`}
              </button>
            </li>
          )}
          {(zeigeVorbei ? vorbei : []).map((spieltag) => (
            <Zeile
              key={spieltag.id}
              spieltag={spieltag}
              board={board}
              offen={offen === spieltag.id}
              fehler={fehler[spieltag.id]}
              laeuft={laeuft.has(spieltag.id)}
              gemeldet={offen === spieltag.id ? gemeldet : ''}
              bereich={offen === spieltag.id ? bereich : ''}
              aufklappen={() => {
                setGemeldet('')
                setBereich('')
                setOffen(offen === spieltag.id ? null : spieltag.id)
              }}
              setzeAntwort={(status) => void setzeAntwort(spieltag, status)}
              setzeSelbst={(selbst) => void setzeSelbst(spieltag, selbst)}
              setzeFahrt={(faehrt, plaetze) => void setzeFahrt(spieltag, faehrt, plaetze)}
              setzeMitfahrt={(fahrt) => void setzeMitfahrt(spieltag, fahrt)}
            />
          ))}
          {kommend.map((spieltag) => (
            <Zeile
              key={spieltag.id}
              spieltag={spieltag}
              board={board}
              // Akkordeon: immer nur eine Zeile offen (6.4).
              offen={offen === spieltag.id}
              fehler={fehler[spieltag.id]}
              laeuft={laeuft.has(spieltag.id)}
              gemeldet={offen === spieltag.id ? gemeldet : ''}
              bereich={offen === spieltag.id ? bereich : ''}
              aufklappen={() => {
                setGemeldet('')
                setBereich('')
                setOffen(offen === spieltag.id ? null : spieltag.id)
              }}
              setzeAntwort={(status) => void setzeAntwort(spieltag, status)}
              setzeSelbst={(selbst) => void setzeSelbst(spieltag, selbst)}
              setzeFahrt={(faehrt, plaetze) => void setzeFahrt(spieltag, faehrt, plaetze)}
              setzeMitfahrt={(fahrt) => void setzeMitfahrt(spieltag, fahrt)}
            />
          ))}
          {/* Am Ende der Liste, nicht im Kopfbalken: Hier hat man den Plan gesehen, und hier ist
              der Gedanke „das hätte ich gern im Handy" fällig. Dieselbe Machart wie die
              „Vorbei"-Zeile ganz oben — eine Zeile ohne Inhalt, kein Bedienelement aus einer
              anderen Welt. Nur wenn überhaupt etwas bevorsteht: Ein Kalender aus lauter
              vergangenen Terminen hilft niemandem. */}
          {kommend.length > 0 && (
            <li className="zeile zeile--kalender">
              <KalenderKnopf spieltage={kommend} />
            </li>
          )}
        </ul>
      )}
      </main>

      <footer className="fuss">
        Gelb = auswärts · Weiß = heim
        <br />
        Änderungen sind sofort für alle sichtbar.
        {/* Nur verlinken, was hinterlegt ist — sonst führt der Fuß auf eine 404. */}
        {(board.impressum || board.datenschutz) && (
          <>
            <br />
            {board.impressum && <a href="/impressum">Impressum</a>}
            {board.impressum && board.datenschutz && ' · '}
            {board.datenschutz && <a href="/datenschutz">Datenschutz</a>}
          </>
        )}
      </footer>
    </div>
  )
}

/**
 * „In den Kalender" — der Spielplan als Datei fürs eigene Handy.
 *
 * Erzeugt wird sie erst beim Antippen und nur im Speicher; nichts davon geht an einen Server,
 * und es gibt nichts, was man vorher laden müsste.
 *
 * **Warum ein `blob:`-Verweis und kein `data:`-Verweis:** Die CSP dieser App erlaubt nur
 * `default-src 'self'` (R9). Ein `data:`-URI wäre eine fremde Quelle; ein Objektverweis auf einen
 * Blob gilt als eigene. Der Verweis wird gleich danach wieder freigegeben — sonst hängt die
 * Datei bis zum Neuladen im Speicher.
 *
 * Die Rückmeldung steht UNTER dem Knopf und bleibt stehen, wie überall sonst in dieser App: Auf
 * einem Handy verschwindet die Datei in den Downloads, und ohne ein Wort weiß niemand, ob etwas
 * passiert ist.
 *
 * Der Knopf selbst behält seine Beschriftung. „Kalenderdatei erstellt" stand einmal darin und war
 * eine Sackgasse: Genau der Fall, für den es das Wiedereinlesen gibt — ein Spieltag wurde verlegt
 * —, verlangt ein zweites Antippen, und ein Knopf, der von etwas Geschehenem erzählt, lädt dazu
 * nicht ein.
 */
function KalenderKnopf({ spieltage }: { spieltage: Spieltag[] }) {
  const [fertig, setFertig] = useState(false)

  return (
    <>
      <button
        type="button"
        className="rueckschau"
        onClick={() => {
          const datei = new Blob([alsIcs(spieltage)], { type: 'text/calendar;charset=utf-8' })
          const verweis = URL.createObjectURL(datei)
          const a = document.createElement('a')
          a.href = verweis
          a.download = 'spieltage.ics'
          a.click()
          URL.revokeObjectURL(verweis)
          setFertig(true)
        }}
      >
        In den Kalender ({spieltage.length})
      </button>
      {fertig && (
        <p className="kalender__hinweis">
          Die Datei liegt in deinen Downloads — antippen, dann fragt dein Handy, ob es die Termine
          übernehmen soll. Verlegt sich später ein Spieltag, hol sie dir hier neu: Deine Termine
          werden dann aktualisiert, nicht verdoppelt.
        </p>
      )}
    </>
  )
}
