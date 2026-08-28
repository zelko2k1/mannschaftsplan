/**
 * Nachfragen vor Handlungen, die sich nicht zurücknehmen lassen.
 *
 * Vorher stand hier siebenmal `window.confirm`. Das ist ein Dialog des Betriebssystems: runde
 * Ecken, ein blauer Systemknopf, mitten in einer Anwendung, die „0 px Ecken, keine Schatten"
 * zur Markenfestlegung erklärt hat. Es war außerdem die einzige Stelle, an der ein beliebiges
 * anderes Produkt exakt dasselbe gehabt hätte. Und es ließ sich in jedem Browser für die
 * Sitzung abschalten — dann war die einzige Hürde weg.
 *
 * Der Kasten hier ist derselbe, den das Zurückspielen einer Sicherung schon benutzt: der
 * `.token`-Rahmen in Stempelblau, der im ganzen Produkt bedeutet „lies das, bevor du es tust".
 * Er erscheint an der Zeile, aus der er aufgerufen wurde, statt am Kopf des Bildschirms — bei
 * zwanzig Spieltagen ist der Kopf außerhalb des Bildes.
 *
 * Was er NICHT ist: eine Rückfrage vor allem und jedem. Er steht vor dem Unwiderruflichen.
 * Für das wirklich Schwere — eine Sicherung zurückspielen — bleibt die Stufe darüber, bei der
 * ein Dateiname abgetippt werden muss.
 */

import { useEffect, useId, useRef } from 'react'

export type Nachfrage = {
  /** Die Zeile, an der der Kasten erscheint. Bei einem Abschnitt ohne Liste beliebig. */
  id: string
  /** Was passieren soll, in einer Zeile. Steht in Stempelblau über dem Text. */
  titel: string
  /** Die Folgen. Ein bis zwei Sätze, die den Grund nennen — nicht die Regel. */
  text: string
  /** Beschriftung des ausführenden Knopfes. Benennt die Handlung, nicht „OK". */
  knopf: string
  tun: () => void
}

export function Nachfragekasten({
  frage,
  abbrechen,
  laeuft = false,
}: {
  frage: Nachfrage | null
  abbrechen: () => void
  laeuft?: boolean
}) {
  if (!frage) return null
  // Eigenes Bauteil, damit die Haken beim Erscheinen und Verschwinden greifen — der Kasten wird
  // ein- und ausgehängt, statt nur seinen Inhalt zu wechseln. `key` sorgt dafür, dass eine
  // zweite Nachfrage an einer anderen Zeile wirklich neu beginnt.
  return <Kasten key={frage.id} frage={frage} abbrechen={abbrechen} laeuft={laeuft} />
}

function Kasten({
  frage,
  abbrechen,
  laeuft,
}: {
  frage: Nachfrage
  abbrechen: () => void
  laeuft: boolean
}) {
  const titelId = useId()
  const textId = useId()
  const knopf = useRef<HTMLButtonElement>(null)

  /**
   * Das eine, was `window.confirm` gut konnte und beim Ersetzen verlorenging: Es nahm den Fokus
   * an sich und kündigte sich an. Ohne das blieb der Fokus auf „Löschen" stehen, während darunter
   * ein Kasten erschien, von dem eine Bildschirmleseanwendung gar nichts sagte — und der
   * naheliegende nächste Schritt eines Menschen, dem nichts gemeldet wird, ist: nochmal Enter.
   *
   * Beim Schließen geht der Fokus dorthin zurück, wo er herkam. Sonst landet er am Seitenanfang,
   * und wer eine Nachfrage abbricht, muss sich neu durch die Liste tabben.
   */
  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null
    knopf.current?.focus()
    const beiTaste = (ereignis: KeyboardEvent) => {
      if (ereignis.key === 'Escape') abbrechen()
    }
    document.addEventListener('keydown', beiTaste)
    return () => {
      document.removeEventListener('keydown', beiTaste)
      vorher?.focus?.()
    }
    // Absichtlich einmalig: Der Kasten wird je Nachfrage neu eingehängt (siehe `key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="token" role="alertdialog" aria-labelledby={titelId} aria-describedby={textId}>
      <p className="token__hinweis" id={titelId}>
        {frage.titel}
      </p>
      <p className="token__text" id={textId}>
        {frage.text}
      </p>
      <div className="satz__aktionen">
        <button
          type="button"
          ref={knopf}
          className="knopf knopf--gefahr"
          disabled={laeuft}
          onClick={frage.tun}
        >
          {frage.knopf}
        </button>
        <button type="button" className="knopf" disabled={laeuft} onClick={abbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
