/**
 * Meldungen, die auch ankommen, wenn niemand hinsieht.
 *
 * Der Grundsatz „Ehrlich statt hübsch" (6.5) verlangt eine Zeile Klartext, die stehen bleibt,
 * statt einer Animation, die den Fehler verdeckt. Für eine Bildschirmleseanwendung reicht das
 * allein aber nicht: Sie beobachtet eine Live-Region und meldet, was sich DARIN ändert. Eine
 * Region, die erst zusammen mit ihrem Inhalt ins Dokument kommt, hat sie nie beobachtet — die
 * Meldung bleibt dann stumm, und genau die Menschen, die auf die Ansage angewiesen sind,
 * erfahren als Einzige nichts.
 *
 * Deshalb steht hier der Behälter dauerhaft und bleibt leer, solange nichts zu melden ist. Er
 * trägt keine eigene Auszeichnung und nimmt leer keinen Platz ein; sichtbar wird erst das Kind.
 *
 * `alert` für Fehler, `status` für Gelungenes: Das erste unterbricht, was gerade vorgelesen
 * wird, das zweite wartet höflich ab. „Nicht gespeichert" darf warten müssen, „Gespeichert"
 * darf nicht dazwischenreden.
 */

/** Ein Fehler. Unterbricht, weil er den Menschen von seinem Vorhaben abbringt. */
export function Fehler({ text }: { text?: string }) {
  return <div role="alert">{text ? <p className="fehler">{text}</p> : null}</div>
}

/**
 * Eine Rückmeldung über etwas Gelungenes. Steht als Zeile für sich.
 *
 * Für die Fälle, in denen die Meldung mitten in einer Knopfreihe steht, ist dieser Behälter der
 * falsche — dort trägt das `span` selbst die Rolle und bleibt einfach leer. Zwei Bauweisen für
 * dieselbe Sache, aber ein `<div>` in einer Flex-Zeile verschöbe die Knöpfe.
 */
export function Hinweis({ text }: { text?: string }) {
  return <div role="status">{text ? <p className="satz__zusatz">{text}</p> : null}</div>
}
