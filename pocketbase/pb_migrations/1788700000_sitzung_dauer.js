/// <reference path="../pb_data/types.d.ts" />
// Wie lange eine Kapitänssitzung gilt — Abschnitt R13, zweite Fassung.
//
// Bisher galten für jede Sitzung dieselben 12 Stunden. Für den Admin ist das richtig; für einen
// Kapitän, der alle zwei Wochen einen Spieltag pflegt, bedeutet es jedes Mal eine neue
// Anmeldung. Wer „angemeldet bleiben" ankreuzt, bekommt deshalb 90 Tage auf diesem Gerät.
//
// Warum das Feld an der SITZUNG hängt und nicht am Konto: Die Entscheidung fällt pro Gerät. Am
// Handy angemeldet bleiben und am Vereins-PC nicht, ist genau der Fall, den man haben will.
//
// 0 heißt „nicht gesetzt" und wird im Hook als die kurzen 12 Stunden gelesen — bestehende
// Sitzungen laufen damit unverändert weiter und müssen nicht angefasst werden.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('admin_sessions')
    collection.fields.add(
      new NumberField({
        name: 'dauer',
        onlyInt: true,
        min: 0,
        help: 'Laufzeit dieser Sitzung in Sekunden. 0 = die kurze Voreinstellung (12 Stunden).',
      }),
    )
    app.save(collection)
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('admin_sessions')
      collection.fields.removeByName('dauer')
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
