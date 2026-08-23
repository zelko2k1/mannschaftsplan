/// <reference path="../pb_data/types.d.ts" />
// Eigene Tabelle für die Sitzungen des Kapitäns.
//
// R5 verlangt getrennte Router für /api und /admin/api. Getrennte Router mit gemeinsamer
// Sitzungstabelle wären eine halbe Trennung: eine Abfrage, die das Feld `member` zu prüfen
// vergisst, würde eine Mitgliedersitzung als Adminsitzung durchgehen lassen. Zwei Tabellen
// machen diesen Fehler unmöglich.
//
// Dazu kommt ein handfester Grund: `sessions.member` ist eine Pflicht-Relation. Eine Sitzung
// ohne Mitglied lässt sich dort gar nicht speichern.

migrate(
  (app) => {
    const collection = new Collection({
      type: 'base',
      name: 'admin_sessions',
      // Wie überall: keine Regeln setzen heißt „nur Superuser". Der Zugriff läuft ausschließlich
      // über die Routen in pb_hooks/admin.pb.js.
      fields: [
        {
          name: 'sid_hash',
          type: 'text',
          required: true,
          max: 64,
          help: 'SHA-256 hex der Sitzungs-ID. Der Klartext steht nur im Cookie.',
        },
        {
          name: 'email',
          type: 'text',
          required: true,
          max: 120,
          help: 'Superuser-Adresse — steht so auch im Protokoll.',
        },
        { name: 'last_seen', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [`CREATE UNIQUE INDEX idx_admin_sessions_sid_hash ON admin_sessions (sid_hash)`],
    })
    app.save(collection)
  },

  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('admin_sessions'))
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
