/// <reference path="../pb_data/types.d.ts" />
// Eine von Hand eingetragene Abfahrtszeit.
//
// Die Formel aus Abschnitt 6.3 — Strecke durch Tempo, plus Puffer, auf fünf Minuten gerundet —
// ist eine Schätzung. Sie stimmt für die meisten Fahrten und für manche nicht: eine Fähre, eine
// Dauerbaustelle, ein Umweg über den Kollegen ohne Auto. Bislang blieb dem Kapitän dafür nur,
// an der Entfernung zu drehen, bis die Zahl passte — was die Entfernung falsch machte, damit die
// Abfahrt stimmte.
//
// **Leer heißt weiterhin rechnen.** Nur ein gefülltes Feld schlägt die Formel. Das ist die
// wichtigere Hälfte der Entscheidung: Wäre der berechnete Wert beim Anlegen fest eingetragen
// worden, hinge er danach still fest — eine spätere Änderung an Tempo oder Puffer erreichte
// diesen Spieltag nie mehr, und niemand wüsste warum.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('fixtures')

    collection.fields.add(
      new DateField({
        name: 'departure_manual',
        help: 'Abfahrt von Hand. Leer = aus Entfernung, Tempo und Puffer berechnet (6.3).',
      }),
    )

    app.save(collection)
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('fixtures')
      if (collection.fields.getByName('departure_manual')) {
        collection.fields.removeByName('departure_manual')
      }
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
