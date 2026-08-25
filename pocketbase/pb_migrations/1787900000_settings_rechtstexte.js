/// <reference path="../pb_data/types.d.ts" />
// Impressum und Datenschutzhinweis.
//
// Beide sind **Freitext, kein HTML**. Zwei Gründe: Die CSP aus R9 verbietet Inline-Skripte, ein
// Rich-Text-Feld wäre also eine Einladung, daran zu rütteln — und der Text wird escaped
// ausgegeben, damit ein verirrtes spitzes Klammerpaar die Seite nicht zerlegt. Absätze entstehen
// durch Leerzeilen, mehr Auszeichnung gibt es nicht und braucht es nicht.
//
// Leer heißt: es gibt die Seite nicht. Die Links erscheinen dann gar nicht erst — ein leeres
// Impressum ist schlechter als keins, weil es Vollständigkeit vortäuscht.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('settings')

    // TextField, nicht EditorField: Letzteres ist PocketBases HTML-Editor und liefe der
    // Entscheidung oben genau zuwider.
    collection.fields.add(
      new TextField({
        name: 'impressum',
        max: 8000,
        help: 'Freitext, kein HTML. Wer die App betreibt, mit ladungsfähiger Anschrift und Kontakt. Leer = die Seite gibt es nicht.',
      }),
    )
    collection.fields.add(
      new TextField({
        name: 'datenschutz',
        max: 8000,
        help: 'Freitext, kein HTML. Welche Daten wozu gespeichert werden, wie lange, und an wen man sich wendet. Leer = die Seite gibt es nicht.',
      }),
    )
    app.save(collection)

    // PocketBase kennt keine Defaultwerte — ohne diesen Schritt stünde in den beiden Feldern
    // `null` statt einer leeren Zeichenkette, und getString() müsste das überall abfangen.
    for (const satz of app.findAllRecords('settings')) {
      satz.set('impressum', '')
      satz.set('datenschutz', '')
      app.save(satz)
    }
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('settings')
      for (const name of ['impressum', 'datenschutz']) {
        if (collection.fields.getByName(name)) collection.fields.removeByName(name)
      }
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
