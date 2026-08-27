/// <reference path="../pb_data/types.d.ts" />
// Tempo und Puffer am einzelnen Spieltag — Abschnitt 6.3, dritte Stufe.
//
// Bisher galt eine Formel für alle Fahrten einer Mannschaft. Das trifft die meisten und manche
// nicht: die Fahrt über die Autobahn nach Köln und die zur Halle im Nachbarort teilen sich weder
// Tempo noch Rüstzeit. Wer es korrigieren wollte, hatte seit heute Morgen die Abfahrt von Hand —
// nur verliert man damit den Bezug zur Rechnung, und eine spätere Änderung an der Mannschaft
// erreicht diesen Spieltag nie mehr.
//
// Jetzt gibt es die Zwischenstufe: dieselbe Formel, aber mit eigenen Werten.
//
// **`-1` heißt „nicht gesetzt".** Das ist der unschöne, aber ehrliche Teil. Naheliegend wäre die
// Null gewesen — nur ist sie beim Puffer ein gültiger Wunsch („ohne Rüstzeit"), und ein Feld, in
// dem 0 einmal „keine" und einmal „erben" bedeutet, ist eine Falle. Beim Tempo wäre 0 zusätzlich
// eine Division durch null. Also für beide dasselbe Zeichen, statt zweier verschiedener Regeln,
// die man verwechseln kann.
//
// Die Reihenfolge, in der gerechnet wird, steht damit fest:
//   Spieltag → Mannschaft (Puffer) bzw. zentrale Einstellung (Tempo) → eingebauter Standard.
// Und darüber steht weiterhin die von Hand eingetragene Abfahrt, die alles übergeht.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('fixtures')

    collection.fields.add(
      new NumberField({
        name: 'tempo_kmh',
        onlyInt: true,
        min: -1,
        max: 200,
        help: 'Nur für diesen Spieltag. -1 = die zentrale Einstellung gilt.',
      }),
    )
    collection.fields.add(
      new NumberField({
        name: 'puffer_minuten',
        onlyInt: true,
        min: -1,
        max: 180,
        help: 'Nur für diesen Spieltag. -1 = der Wert der Mannschaft gilt.',
      }),
    )
    app.save(collection)

    // Ohne diesen Schritt stünde in beiden Feldern 0 — also „ohne Rüstzeit" und ein Tempo von
    // null. Jeder bestehende Spieltag verlöre seine Abfahrtszeit.
    for (const satz of app.findAllRecords('fixtures')) {
      satz.set('tempo_kmh', -1)
      satz.set('puffer_minuten', -1)
      app.save(satz)
    }
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('fixtures')
      for (const name of ['tempo_kmh', 'puffer_minuten']) {
        if (collection.fields.getByName(name)) collection.fields.removeByName(name)
      }
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
