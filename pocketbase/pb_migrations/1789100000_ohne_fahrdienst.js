/// <reference path="../pb_data/types.d.ts" />
// Auswärts heißt nicht immer Auto.
//
// Die App nahm bisher an: Auswärtsspiel = Fahrdienst. Sie zählte Plätze, warnte in Rot „kein
// Fahrer" und rechnete eine Abfahrtszeit aus Kilometern und Tempo. Für eine Mannschaft, die mit
// Bus und Bahn anreist, ist davon nichts richtig — sie bekam eine Aufforderung zum Handeln, wo
// nichts zu tun war, und eine Uhrzeit, die auf einer Autofahrt beruhte, die niemand macht.
//
// Deshalb ein Schalter **am einzelnen Spieltag** und nicht an der Mannschaft: Es hängt an der
// Entfernung und an der Verbindung, nicht an der Mannschaft. Dieselbe Herren-Mannschaft fährt
// zum Nachbarort mit der Bahn und ins übernächste Kreisgebiet mit dem Auto.
//
// Der Name ist eine Verneinung, und das ist Absicht: PocketBase kennt keine Defaultwerte, ein
// bool steht ohne Zutun auf `false` — und `ohne_fahrdienst = false` heißt „mit Fahrdienst", also
// genau das, was für jeden bestehenden Spieltag gilt. Ein positiv benanntes Feld müsste für alle
// vorhandenen Zeilen nachgetragen werden, und ein vergessener Nachtrag hieße: Fahrdienst weg.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('fixtures')
    collection.fields.add(
      new BoolField({
        name: 'ohne_fahrdienst',
        help: 'Anreise ohne Autos (Bus, Bahn, zu Fuß). Blendet den Fahrdienst aus und lässt die Abfahrtszeit ungerechnet — die Formel gilt für eine Autofahrt.',
      }),
    )
    app.save(collection)
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('fixtures')
      collection.fields.removeByName('ohne_fahrdienst')
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
