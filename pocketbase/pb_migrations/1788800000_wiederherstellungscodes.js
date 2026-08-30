/// <reference path="../pb_data/types.d.ts" />
// Wiederherstellungscodes für den zweiten Faktor — der Ausweg beim verlorenen Handy.
//
// Ohne sie ist ein neues Telefon ein Fall für den Admin, und beim Admin selbst ein Fall für den
// SSH-Tunnel ins PocketBase-Dashboard. Seit der zweite Faktor für Admin-Konten Pflicht ist, ist
// das keine theoretische Sorge mehr.
//
// Gespeichert werden nur HASHES, wie bei den Einladungstoken (R1): Wer die Datenbank liest, soll
// damit nicht anmelden können. Verbraucht wird jeder Code genau einmal — der Hash verschwindet
// dabei aus der Liste, und die Zahl der übrigen steht in der Kontenansicht.
//
// Ein TEXTfeld, kein JSON-Feld, obwohl eine Liste darin steht: PocketBase gibt ein JSON-Feld im
// JSVM als `types.JSONRaw` zurück, und das ist ein Byte-Puffer. `Array.isArray()` sagt darauf
// `true` — wer damit zählt, bekommt die Zahl der Bytes. Zehn durch Leerzeichen getrennte Hashes
// sind an dieser Stelle die ehrlichere Ablage.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('admin_totp')
    collection.fields.add(
      new TextField({
        name: 'codes',
        max: 1024,
        help: 'SHA-256 der noch nicht verbrauchten Wiederherstellungscodes, durch Leerzeichen getrennt. Klartext gibt es nur einmal, bei der Ausgabe.',
      }),
    )
    app.save(collection)
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('admin_totp')
      collection.fields.removeByName('codes')
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
