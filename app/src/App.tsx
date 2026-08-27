import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api, KeineSitzung, type Board, type Spieltag, type Status } from './api'
import Zeile from './Zeile'
import './abfahrtsplan.css'

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
  if (window.location.pathname.startsWith('/admin')) {
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
    async (spieltagId: string, sofort: (s: Spieltag) => Spieltag, senden: () => Promise<unknown>) => {
      if (!board) return
      const vorher = board

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
          {board.fixtures.map((spieltag) => (
            <Zeile
              key={spieltag.id}
              spieltag={spieltag}
              board={board}
              // Akkordeon: immer nur eine Zeile offen (6.4).
              offen={offen === spieltag.id}
              fehler={fehler[spieltag.id]}
              laeuft={laeuft.has(spieltag.id)}
              aufklappen={() => setOffen(offen === spieltag.id ? null : spieltag.id)}
              setzeAntwort={(status) => void setzeAntwort(spieltag, status)}
              setzeFahrt={(faehrt, plaetze) => void setzeFahrt(spieltag, faehrt, plaetze)}
              setzeMitfahrt={(fahrt) => void setzeMitfahrt(spieltag, fahrt)}
            />
          ))}
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
