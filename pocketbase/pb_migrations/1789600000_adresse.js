/// <reference path="../pb_data/types.d.ts" />
// Die Anschrift des Spielorts — zum Antippen.
//
// Aus der Mannschaft: eine Box, auf die man tippt, und die Navigations-App geht auf. Der Kapitän
// trägt die Adresse ein; steht keine da, gibt es die Box nicht.
//
// Warum ein eigenes Feld und nicht der Hinweistext von gestern: Es war die einzige Angabe auf der
// Beispielliste, die WIEDERKEHRT. Ein eigenes Feld steht immer an derselben Stelle, lässt sich
// antippen und könnte später aus einem Spielplan-Export kommen; im Freitext wäre es jedes Mal
// woanders und für nichts zu gebrauchen außer zum Lesen.
//
// `venue` bleibt daneben und heißt weiterhin, WIE der Ort heißt („Gasthaus Musterkrug"). Die
// Adresse sagt, WO er ist. Beides zusammenzulegen hieße, eines von beiden zu verlieren: Der Name
// steht in der Zeile, die Anschrift gehört in die Karte.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('fixtures')
    collection.fields.add(
      new TextField({
        name: 'adresse',
        max: 200,
        help: 'Anschrift des Spielorts, z. B. „Musterstraße 5, 12345 Beispielstadt". Leer = keine Karten-Box im Spieltag.',
      }),
    )
    app.save(collection)
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('fixtures')
      collection.fields.removeByName('adresse')
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
