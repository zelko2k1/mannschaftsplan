/// <reference path="../pb_data/types.d.ts" />
// Was der Spielplan-Import am Schema braucht — Schritt 8 („Echtdaten").
//
// Zwei Änderungen, beide unvermeidlich:
//
// **1 · `source_key`** — die Herkunft einer Begegnung im Verbands-Export. Ohne sie wäre ein
// zweiter Import nicht wiederholbar: nuLiga verlegt Begegnungen mitten in der Saison, und wer
// den Spieltag am Datum wiedererkennen will, legt ihn nach jeder Verlegung ein zweites Mal an.
// Der Schlüssel steht deshalb für die BEGEGNUNG, nicht für den Termin (Aufbau in
// `app/src/spielplan.ts`). Von Hand angelegte Spieltage lassen ihn leer und bleiben unberührt —
// der Import fasst nur an, was er selbst angelegt hat.
//
// Der Index ist ein TEILINDEX. Ein gewöhnlicher UNIQUE-Index würde beim zweiten von Hand
// angelegten Spieltag brechen, weil mehrere Leerstrings kollidieren.
//
// **2 · `opponent_town` ist nicht mehr Pflicht.** nuLiga liefert keinen Ort — die Datei kennt
// nur das Spiellokal („Vereinsheim", „Sportheim Muster"), und das ist ein Lokalname, kein
// Ortsname. Die Wahl stand zwischen „Lokalname in das Ortsfeld schreiben" (der Aushang zeigt
// dann etwas Falsches, und niemand findet hin) und „leer lassen, sichtbar nachtragen". Es ist
// die zweite geworden: Ort, Kilometer und Treffpunkt gehören ohnehin zusammen und kann nur
// jemand nachtragen, der die Fahrt kennt.
//
// Der Aushang zeigt bei fehlendem Ort schlicht nichts unter dem Vereinsnamen — das war auch
// vorher schon der Zustand jedes Spieltags, dessen Ort noch niemand ausgefüllt hatte; neu ist
// nur, dass die Datenbank es nicht mehr verhindert.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('fixtures')

    collection.fields.add(
      new TextField({
        name: 'source_key',
        max: 120,
        help: 'Herkunft aus einem Verbands-Export. Leer = von Hand angelegt, der Import fasst den Spieltag nicht an.',
      }),
    )

    const ort = collection.fields.getByName('opponent_town')
    ort.required = false

    collection.indexes = collection.indexes.concat([
      `CREATE UNIQUE INDEX idx_fixtures_source_key ON fixtures (source_key) WHERE source_key != ''`,
    ])

    app.save(collection)
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('fixtures')

      collection.indexes = collection.indexes.filter(
        (sql) => sql.indexOf('idx_fixtures_source_key') === -1,
      )
      if (collection.fields.getByName('source_key')) collection.fields.removeByName('source_key')

      // Zurück auf Pflicht geht nur, solange kein Spieltag ohne Ort dasteht — sonst wäre die
      // Collection nicht mehr speicherbar. Lieber die Lockerung stehen lassen als die Rückfahrt
      // scheitern zu sehen.
      const ohneOrt = app.findAllRecords('fixtures').filter((s) => !s.getString('opponent_town'))
      if (ohneOrt.length === 0) {
        const ort = collection.fields.getByName('opponent_town')
        ort.required = true
      }

      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
