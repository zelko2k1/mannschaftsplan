/// <reference path="../pb_data/types.d.ts" />
// Wann ein Spieltag zuletzt verlegt wurde.
//
// Ein Spieltag fällt in der Praxis nicht aus, er wird verschoben — anderer Tag, andere Uhrzeit
// oder beides. Bisher blieben dabei alle Rückmeldungen unverändert stehen: Wer für Samstag
// zugesagt hatte, stand nach der Verschiebung auf Mittwoch weiter als „Dabei" da, an einem
// Termin, den er nie gesehen hatte. Der Kapitän zählte zehn Zusagen und hatte keine einzige, die
// sich auf das neue Datum bezog.
//
// Die Zusagen bleiben — das ist die Entscheidung: Sie wegzuwerfen hieße, zehn Leute neu
// einzusammeln, auch wenn sich für neun nichts ändert. Stattdessen wird der Zeitpunkt der
// Verlegung festgehalten, und alles, was VORHER geantwortet wurde, gilt als noch nicht bestätigt.
//
// Dazu trägt jede Rückmeldung, wann sie zuletzt gegeben wurde. Der erste Entwurf wollte dafür den
// Änderungszeitpunkt nehmen, den PocketBase ohnehin mitführt — der bewegt sich aber nicht, wenn
// jemand dieselbe Antwort noch einmal gibt, und genau das IST der Normalfall: „gilt weiter". Die
// Bestätigung muss also ausdrücklich festgehalten werden. Aufgefallen ist das im Testfall V1.
//
// Älter als `verlegt_am` heißt „stammt vom alten Termin". Leer heißt dasselbe: Rückmeldungen von
// vor dieser Migration haben eine spätere Verlegung nie gesehen.
//
// `verlegt_am` leer heißt „nie verlegt" — für jeden bestehenden Spieltag also der Normalfall, und
// nichts an vorhandenen Daten muss angefasst werden.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('fixtures')
    collection.fields.add(
      new DateField({
        name: 'verlegt_am',
        help: 'Wann Datum oder Uhrzeit zuletzt nennenswert verschoben wurden. Leer = nie verlegt.',
      }),
    )
    app.save(collection)

    const antworten = app.findCollectionByNameOrId('responses')
    antworten.fields.add(
      new DateField({
        name: 'bestaetigt_am',
        help: 'Wann diese Rückmeldung zuletzt gegeben wurde. Älter als die Verlegung des Spieltags = noch nicht bestätigt.',
      }),
    )
    app.save(antworten)
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('fixtures')
      collection.fields.removeByName('verlegt_am')
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
    try {
      const antworten = app.findCollectionByNameOrId('responses')
      antworten.fields.removeByName('bestaetigt_am')
      app.save(antworten)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
