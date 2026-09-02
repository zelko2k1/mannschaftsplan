/// <reference path="../pb_data/types.d.ts" />
// Woher der Termin verlegt wurde.
//
// Seit `1789000000` merkt sich ein Spieltag, WANN er zuletzt verschoben wurde, und die Zeile sagt
// „verlegt". Was sich geändert hat, stand nirgends: In der Zeile steht der neue Termin, der alte
// ist weg. Wer nicht auswendig weiß, dass es Samstag um 19:30 war, erfährt nur, DASS etwas anders
// ist — und genau darauf zielte die Rückmeldung aus der Kapitänsecke („die Leute sollen den
// Spieltag öffnen und die Änderung sehen").
//
// Deshalb der alte Zeitpunkt daneben. Nur der letzte: Wer zweimal verschiebt, hat den Stand von
// vorletzter Woche nicht mehr im Kopf, und eine Kette von Terminen wäre eine Historie — die
// braucht hier niemand und der Löschjob räumte sie ohnehin weg.
//
// Leer heißt „nie verlegt", wie bei `verlegt_am`. Beide Felder werden zusammen gesetzt und sind
// zusammen leer; getrennt zu prüfen wäre eine Fallunterscheidung ohne Fall.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('fixtures')
    collection.fields.add(
      new DateField({
        name: 'verlegt_von',
        help: 'Der Termin, der vor der letzten Verlegung galt. Leer = nie verlegt.',
      }),
    )
    app.save(collection)
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('fixtures')
      collection.fields.removeByName('verlegt_von')
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
