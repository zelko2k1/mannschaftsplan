/// <reference path="../pb_data/types.d.ts" />
// Ein Hinweis am Spieltag.
//
// Aus der Mannschaft, mit Beispielen: die Anschrift des Lokals, „vergesst das und das nicht",
// „Spieltagverschiebung in Klärung", „viel Glück beim Spiel", „der Ersatzkapitän ist heute der
// und der". Fünf Dinge ohne Gemeinsamkeit — genau das ist der Fall, für den Freitext richtig ist.
// Gäbe es ein Muster, gehörte es in ein eigenes Feld, das immer an derselben Stelle steht.
//
// Es SCHREIBT NUR DER KAPITÄN. Ein Feld, in das alle schreiben, wäre ein Diskussionsbereich, und
// dafür fehlt der Anwendung alles: keine Konten für Spieler, keine Benachrichtigungen, keine
// Moderation. Ein Hinweis ist eine Ansage, keine Unterhaltung — vom Betreiber ausdrücklich so
// entschieden.
//
// 500 Zeichen. Was länger ist, ist eine Diskussion und gehört nicht hierher. Die Grenze steht in
// der Datenbank UND in der Route, damit sie nicht davon abhängt, welchen Weg jemand nimmt.
//
// Und die Kehrseite, die dazugehört: In ein Freitextfeld kann jemand „Uwe kommt später, muss noch
// zum Arzt" schreiben. Bisher stand im Datenschutzhinweis genau, was gespeichert wird — Name,
// Verfügbarkeit, Fahrbereitschaft. Deshalb steht im Formular ein Hinweis daneben („Was für alle
// gilt — keine Angaben über einzelne Personen"), und der Datenschutztext der Installation gehört
// um einen Satz ergänzt. Der Text verschwindet mit dem Spieltag nach 365 Tagen wie alles andere.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('fixtures')
    collection.fields.add(
      new TextField({
        name: 'hinweis',
        max: 500,
        help: 'Freitext des Kapitäns zu diesem Spieltag — Anfahrt, Erinnerungen, Vertretung. Für alle sichtbar. Keine Angaben über einzelne Personen.',
      }),
    )
    app.save(collection)
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('fixtures')
      collection.fields.removeByName('hinweis')
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
