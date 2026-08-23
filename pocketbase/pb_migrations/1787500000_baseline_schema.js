/// <reference path="../pb_data/types.d.ts" />
// ═══ Baseline: das vollständige Schema aus Abschnitt 3 des Umsetzungsplans in EINER Migration ═══
//
// Spätere Schemaänderungen kommen als NEUE Dateien nach dieser Baseline — diese hier wird nicht
// mehr angefasst, sobald sie irgendwo angewendet wurde.
//
// `serve` läuft mit --automigrate=0. Ohne das schreibt PocketBase bei jeder Schema-Änderung im
// Dashboard eigene Migrationsdateien, die sich mit dieser Baseline beißen.
//
// ── Zwei Eigenheiten von PocketBase, die man hier kennen muss ────────────────────────────────
//
// 1. REGELN: `null` (bzw. nicht gesetzt) heißt „nur Superuser". Der Leerstring `""` heißt
//    „jeder, auch ohne Login". Abschnitt 3 verlangt „alle API-Rules bleiben leer" und meint
//    damit das ERSTE. Die Regeln werden hier deshalb bewusst gar nicht gesetzt. Wer sie je auf
//    `""` setzt, legt die gesamte Datenbank offen — der Zugriff läuft ausschließlich über die
//    Custom Routes aus Abschnitt 5.
//
// 2. KEINE DEFAULTWERTE: PocketBase-Felder kennen kein `default`. `active: true` und
//    `needed_players: 4` aus Abschnitt 3 sind deshalb nichts, was das Schema durchsetzt —
//    sie müssen beim Schreiben gesetzt werden (seed.mjs und die Admin-Routen tun das).
//    Bei `km: 0` und `locked: false` fällt das nicht auf, weil das ohnehin die Nullwerte sind.

migrate(
  (app) => {
    // ── Erst aufräumen: die mitgelieferte `users`-Collection löschen ─────────────────────
    // PocketBase legt beim ersten Start eine Beispiel-Auth-Collection `users` an, deren
    // createRule der LEERSTRING ist — offene Selbstregistrierung für jeden im Netz. Diese App
    // benutzt sie nirgends: Mitglieder haben eigene Sessions (R2), der Kapitän meldet sich
    // gegen `_superusers` an (R13). Also weg damit, statt sie ungenutzt offen stehen zu lassen.
    try {
      app.delete(app.findCollectionByNameOrId('users'))
    } catch {
      // Schon weg oder nie angelegt — beides in Ordnung.
    }

    // Sammelt die IDs der angelegten Collections für die Relationen weiter unten.
    const id = {}

    const anlegen = (definition) => {
      const collection = new Collection(definition)
      app.save(collection)
      id[definition.name] = collection.id
      return collection.id
    }

    // Zeitstempel, den PocketBase selbst pflegt. Ein handgeschriebenes date-Feld namens
    // `created` wäre verwirrend — hier ist es dasselbe Feld, nur automatisch befüllt.
    const angelegt = { name: 'created', type: 'autodate', onCreate: true, onUpdate: false }

    const bezug = (name, ziel, hinweis) => ({
      name,
      type: 'relation',
      required: true,
      collectionId: id[ziel],
      // Löscht man einen Spieltag oder ein Mitglied, verschwinden die abhängigen Zeilen mit.
      cascadeDelete: true,
      maxSelect: 1,
      help: hinweis || '',
    })

    // ── members ──────────────────────────────────────────────────────────────────────────
    anlegen({
      type: 'base',
      name: 'members',
      fields: [
        { name: 'name', type: 'text', required: true, max: 60, help: 'Anzeigename, z. B. „Marco"' },
        { name: 'active', type: 'bool', help: 'Inaktive Mitglieder erscheinen nicht mehr in Listen.' },
        { name: 'sort', type: 'number', onlyInt: true, help: 'Reihenfolge in Listen' },
        {
          name: 'token_hash',
          type: 'text',
          max: 64,
          help: 'SHA-256 hex des Einladungstokens. Der Klartext wird NIE gespeichert (R1).',
        },
        { name: 'token_issued_at', type: 'date' },
        { name: 'note', type: 'text', max: 500, help: 'Nur für den Kapitän sichtbar.' },
        angelegt,
      ],
      indexes: [
        // Teilindex: Mitglieder ohne ausgestelltes Token haben einen leeren token_hash, und
        // mehrere Leerstrings würden einen gewöhnlichen UNIQUE-Index sofort sprengen.
        `CREATE UNIQUE INDEX idx_members_token_hash ON members (token_hash) WHERE token_hash != ''`,
        `CREATE INDEX idx_members_sort ON members (sort)`,
      ],
    })

    // ── fixtures ─────────────────────────────────────────────────────────────────────────
    anlegen({
      type: 'base',
      name: 'fixtures',
      fields: [
        { name: 'date', type: 'date', required: true, help: 'Datum + Anwurfzeit' },
        { name: 'opponent_club', type: 'text', max: 80, help: '„Bulls Eye"' },
        {
          name: 'opponent_town',
          type: 'text',
          required: true,
          max: 80,
          help: '„Celle" — steht groß in der Zielspalte',
        },
        { name: 'is_home', type: 'bool' },
        { name: 'venue', type: 'text', max: 120, help: '„Sportsbar Celle"' },
        { name: 'km', type: 'number', onlyInt: true, min: 0, help: 'Einfache Strecke' },
        {
          name: 'meeting_point',
          type: 'text',
          max: 120,
          help: 'Treffpunkt für die Abfahrt — Freitext am Spieltag, KEINE Privatadresse (Abschnitt 8).',
        },
        { name: 'needed_players', type: 'number', onlyInt: true, min: 1, max: 16 },
        { name: 'locked', type: 'bool', help: 'Nach dem Spiel: keine Änderungen mehr.' },
        angelegt,
      ],
      indexes: [`CREATE INDEX idx_fixtures_date ON fixtures (date)`],
    })

    // ── sessions ─────────────────────────────────────────────────────────────────────────
    anlegen({
      type: 'base',
      name: 'sessions',
      fields: [
        bezug('member', 'members'),
        {
          name: 'sid_hash',
          type: 'text',
          required: true,
          max: 64,
          help: 'SHA-256 hex der Session-ID. Getrennt vom Token erzeugt, nicht davon abgeleitet (R2).',
        },
        { name: 'last_seen', type: 'date' },
        {
          name: 'ua_hash',
          type: 'text',
          max: 64,
          help: 'SHA-256 des User-Agent — nur zur Anzeige „Handy / Tablet" in der Geräteliste.',
        },
        angelegt,
      ],
      indexes: [
        `CREATE UNIQUE INDEX idx_sessions_sid_hash ON sessions (sid_hash)`,
        // R12: „Neues Token" löscht alle Sessions eines Mitglieds — das läuft über diesen Index.
        `CREATE INDEX idx_sessions_member ON sessions (member)`,
      ],
    })

    // ── responses ────────────────────────────────────────────────────────────────────────
    anlegen({
      type: 'base',
      name: 'responses',
      fields: [
        bezug('fixture', 'fixtures'),
        bezug('member', 'members'),
        { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['yes', 'maybe', 'no'] },
        angelegt,
      ],
      indexes: [`CREATE UNIQUE INDEX idx_responses_fixture_member ON responses (fixture, member)`],
    })

    // ── rides (Fahrer) ───────────────────────────────────────────────────────────────────
    anlegen({
      type: 'base',
      name: 'rides',
      fields: [
        bezug('fixture', 'fixtures'),
        bezug('member', 'members'),
        {
          name: 'seats',
          type: 'number',
          required: true,
          onlyInt: true,
          min: 1,
          max: 6,
          help: 'Plätze OHNE den Fahrer.',
        },
        angelegt,
      ],
      indexes: [`CREATE UNIQUE INDEX idx_rides_fixture_member ON rides (fixture, member)`],
    })

    // ── seat_claims (Mitfahrer) ──────────────────────────────────────────────────────────
    anlegen({
      type: 'base',
      name: 'seat_claims',
      fields: [
        bezug('fixture', 'fixtures'),
        bezug('member', 'members'),
        bezug('ride', 'rides', 'In welchem Auto — die Kapazität wird pro Fahrer geprüft.'),
        angelegt,
      ],
      // Ein Mitglied sitzt pro Spieltag in genau einem Auto.
      indexes: [
        `CREATE UNIQUE INDEX idx_seat_claims_fixture_member ON seat_claims (fixture, member)`,
        `CREATE INDEX idx_seat_claims_ride ON seat_claims (ride)`,
      ],
    })

    // ── audit_log ────────────────────────────────────────────────────────────────────────
    // Milderung für R14: wer den Link eines Mitglieds weitergibt, ist dieses Mitglied. Nachvollziehen
    // lässt sich das nur hier.
    anlegen({
      type: 'base',
      name: 'audit_log',
      fields: [
        { name: 'at', type: 'date', required: true },
        { name: 'actor', type: 'text', required: true, max: 120, help: '`member:<id>` oder `admin:<email>`' },
        { name: 'action', type: 'text', required: true, max: 60, help: '`response.set`, `ride.set`, `token.rotate`, …' },
        { name: 'target', type: 'text', max: 120 },
        { name: 'old_value', type: 'text', max: 500 },
        { name: 'new_value', type: 'text', max: 500 },
      ],
      // Abschnitt 8: nach 90 Tagen kürzen — der Löschjob liest über diesen Index.
      indexes: [`CREATE INDEX idx_audit_log_at ON audit_log (at)`],
    })
  },

  (app) => {
    // Rückwärts in umgekehrter Reihenfolge, sonst hängen noch Relationen an den Collections.
    for (const name of ['audit_log', 'seat_claims', 'rides', 'responses', 'sessions', 'fixtures', 'members']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch {
        // Gibt es nicht (mehr) — dann ist hier nichts zu tun.
      }
    }
  },
)
