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
  return (
    <div className="token">
      <p className="token__hinweis">{frage.titel}</p>
      <p className="token__text">{frage.text}</p>
      <div className="satz__aktionen">
        <button type="button" className="knopf knopf--gefahr" disabled={laeuft} onClick={frage.tun}>
          {frage.knopf}
        </button>
        <button type="button" className="knopf" disabled={laeuft} onClick={abbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
