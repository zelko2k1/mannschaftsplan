/// <reference path="../pb_data/types.d.ts" />
// „Ich bin dabei — aber ich komme selbst."
//
// Aus der Kapitänsecke: Manche fahren mit dem eigenen Auto zum Spiellokal oder kommen direkt von
// der Arbeit. Für den Fahrdienst ist das dieselbe Auskunft — die Person braucht keinen Platz und
// bietet keinen an —, und für den Kapitän ist es die Antwort auf „wer steht am Samstag dort?".
//
// Bisher war das nicht ausdrückbar. Wer zusagte und selbst hinfuhr, sah aus wie jemand, der noch
// eine Mitfahrgelegenheit sucht: Er zählte in „N ohne Platz" mit und stand im Fahrdienst als
// offener Fall. Die Zahl war damit zu hoch, und zwar ausgerechnet bei der Warnung, die zum
// Handeln auffordert.
//
// Das Feld hängt an der RÜCKMELDUNG und nicht an einer eigenen Tabelle: Es ist eine Eigenschaft
// genau dieser Zusage zu genau diesem Spieltag, es entsteht und verschwindet mit ihr, und die
// Löschung über `cascadeDelete` gilt damit unverändert. Eine vierte Antwort daraus zu machen
// („dabei, komme direkt") wäre der falsche Schnitt: Ob jemand kommt und wie er hinkommt, sind
// zwei Fragen, und die zweite gibt es nur beim Auswärtsspiel.
//
// `false` ist der Wert jedes bestehenden Datensatzes und heißt „nichts gesagt" — also der
// Normalfall, in dem der Fahrdienst wie bisher zuständig ist.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('responses')
    collection.fields.add(
      new BoolField({
        name: 'selbst_anreise',
        help: 'Kommt selbst zum Spielort — eigenes Auto, Mitfahrt von woanders, direkt von der Arbeit. Braucht keinen Platz im Fahrdienst.',
      }),
    )
    app.save(collection)
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('responses')
      collection.fields.removeByName('selbst_anreise')
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
