/// <reference path="../pb_data/types.d.ts" />
// Der zweite Faktor für den Kapitäns-Login — Abschnitt 9, letzter offener Punkt.
//
// Eigene Tabelle statt eines Feldes an `_superusers`: Das ist eine Systemcollection, und Felder
// daran zu hängen bindet uns an ihr Schema über PocketBase-Versionen hinweg. Der Schlüssel ist
// die Adresse, weil die Kapitänssitzung ohnehin mit ihr arbeitet (`admin_sessions.email`).
//
// `secret` liegt im Klartext. Das ist eine bewusste Entscheidung und keine Nachlässigkeit:
// Verschlüsseln hieße, den Schlüssel woanders zu hinterlegen — als Umgebungsvariable, die der
// Vereinsadmin zusätzlich verwalten und beim Umzug mitnehmen müsste. Wer die Datenbank hat, hat
// ohnehin alle Daten; wogegen der zweite Faktor schützt, ist ein abhandengekommenes PASSWORT,
// und das leistet er auch so. Wer die Datei in die Hand bekommt, kommt an die Namen der
// Mannschaft — das ist der größere Schaden, und er hängt nicht an diesem Feld.

migrate(
  (app) => {
    const collection = new Collection({
      type: 'base',
      name: 'admin_totp',
      // Keine Regeln = nur Superuser. Der Zugriff läuft über pb_hooks/admin.pb.js.
      fields: [
        {
          name: 'email',
          type: 'text',
          required: true,
          max: 120,
          help: 'Superuser-Adresse, zu der dieser zweite Faktor gehört.',
        },
        {
          name: 'secret',
          type: 'text',
          required: true,
          max: 64,
          help: 'Base32, 32 Zeichen = 160 Bit (RFC 4226).',
        },
        {
          name: 'confirmed',
          type: 'bool',
          help: 'Erst wenn ein Code aus der App gestimmt hat. Unbestätigt wird beim Login ignoriert.',
        },
        {
          name: 'last_step',
          type: 'number',
          onlyInt: true,
          help: 'Zuletzt verbrauchter Zeitschritt. Verhindert, dass derselbe Code zweimal gilt.',
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [`CREATE UNIQUE INDEX idx_admin_totp_email ON admin_totp (email)`],
    })
    app.save(collection)
  },

  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('admin_totp'))
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
