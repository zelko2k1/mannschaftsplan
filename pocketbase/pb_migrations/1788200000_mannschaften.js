/// <reference path="../pb_data/types.d.ts" />
// Mehrere Mannschaften unter einem Dach — Abschnitt 12.
//
// Bis hierher war die App für GENAU eine Mannschaft gebaut: ein Satz Einstellungen, ein
// Kapitän, und der war ein PocketBase-Superuser. Ein Verein mit sieben Mannschaften bräuchte
// nach diesem Muster sieben Instanzen — siebenmal sichern, siebenmal aktualisieren, siebenmal
// dieselben Rechtstexte.
//
// Diese Migration legt die Grundlage. Drei Entscheidungen stecken darin:
//
// 1. **Kapitäne sind KEINE Superuser mehr.** Sie werden Datensätze in einer eigenen
//    Auth-Collection `verwalter`. PocketBase übernimmt darin weiterhin Hashing und
//    Passwortprüfung — R13 verbietet selbstgebautes Passwort-Handling, und daran ändert sich
//    nichts. Der Gewinn: Auf `verwalter` liegen keine Regeln, ein Kapitän kommt über die API
//    also an keine einzige Tabelle heran. Sein ganzer Zugriff läuft durch die Routen in
//    admin.pb.js, und genau dort wird der Mannschaftsbezug geprüft.
//
// 2. **Der Bezug ist Pflicht, nicht Beiwerk.** `members.team` und `fixtures.team` sind
//    `required`. Ein Mitglied ohne Mannschaft lässt sich damit gar nicht erst speichern —
//    dieselbe Bauart wie `sessions.member`, wo ein Pflichtfeld eine mitgliedslose Sitzung
//    strukturell unmöglich macht. Auf eine vergessene Prüfung will ich mich nicht verlassen.
//
// 3. **Was zentral bleibt und was mitwandert.** Impressum, Datenschutzhinweis, Sperrfrist und
//    Tempo gelten für alle — sie betreffen den Betreiber und die Straßen, nicht die Mannschaft.
//    Der Name und der Puffer wandern in `teams`: Die Damen starten womöglich aus einer anderen
//    Halle als die Herren, und „parken, umziehen, einwerfen" dauert nicht überall gleich lang.
//    `anzeigename` in den Einstellungen bleibt und wird zum VEREINSNAMEN — er steht künftig
//    dort, wo es um die Anwendung als Ganzes geht, etwa als Herausgeber im zweiten Faktor.
//
// `startort` ist mit Absicht schon da, obwohl ihn heute nichts liest. Für eine spätere
// Routenberechnung braucht es dann keine zweite Migration an denselben Tabellen.

migrate(
  (app) => {
    // ── 1 · Mannschaften ────────────────────────────────────────────────────────────────────
    const teams = new Collection({
      type: 'base',
      name: 'teams',
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          max: 60,
          help: 'Steht im Aushang und in der Kapitänsansicht. NICHT auf der Einladungsseite: Die schlägt das Token bewusst nicht nach und wäre sonst ein Orakel dafür, ob eines gültig ist (R6/R10). Dort steht der Vereinsname.',
        },
        { name: 'sort', type: 'number', onlyInt: true, help: 'Reihenfolge in Listen' },
        {
          name: 'puffer_minuten',
          type: 'number',
          onlyInt: true,
          min: 0,
          max: 180,
          help: 'Zeit vor dem Anwurf zusätzlich zur Fahrzeit (6.3).',
        },
        {
          name: 'startort',
          type: 'text',
          max: 120,
          help: 'Von wo diese Mannschaft losfährt. Heute nur Notiz; später Ausgangspunkt einer Routenberechnung. KEINE Privatadresse.',
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_teams_name ON teams (name)'],
    })
    app.save(teams)

    // ── 2 · Verwalter ───────────────────────────────────────────────────────────────────────
    // Auth-Collection, damit PocketBase das Passwort hält. Keine Regeln: Ein Verwalter kann sich
    // anmelden, sonst nichts — jeder Zugriff läuft über /admin/api.
    const verwalter = new Collection({
      type: 'auth',
      name: 'verwalter',
      fields: [
        {
          name: 'rolle',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['gesamt', 'kapitaen'],
          help: '`gesamt` sieht alle Mannschaften und die zentralen Einstellungen. `kapitaen` nur die eigene.',
        },
        {
          name: 'team',
          type: 'relation',
          collectionId: teams.id,
          maxSelect: 1,
          cascadeDelete: false,
          help: 'Pflicht für `kapitaen`, leer bei `gesamt`. Geprüft wird das im Hook, nicht im Schema — ein Rollenwechsel soll nicht am Schema scheitern.',
        },
      ],
    })
    app.save(verwalter)

    // ── 3 · Der Bezug an Mitgliedern und Spieltagen ─────────────────────────────────────────
    // Zunächst OHNE `required`, sonst schlüge das Nachtragen unten fehl: Bestehende Datensätze
    // haben noch keinen Wert, und PocketBase prüft beim Speichern.
    const members = app.findCollectionByNameOrId('members')
    members.fields.add(
      new RelationField({
        name: 'team',
        collectionId: teams.id,
        maxSelect: 1,
        cascadeDelete: false,
        help: 'Zu welcher Mannschaft dieses Mitglied gehört.',
      }),
    )
    app.save(members)

    const fixtures = app.findCollectionByNameOrId('fixtures')
    fixtures.fields.add(
      new RelationField({
        name: 'team',
        collectionId: teams.id,
        maxSelect: 1,
        cascadeDelete: false,
        help: 'Welche Mannschaft an diesem Spieltag spielt.',
      }),
    )
    app.save(fixtures)

    // ── 4 · Die vorhandenen Daten übernehmen ────────────────────────────────────────────────
    // Aus dem bisherigen einen Satz Einstellungen wird die erste Mannschaft. Für den Betreiber
    // sieht danach alles aus wie vorher, nur steht oben eine Auswahl mit einem Eintrag.
    let name = 'Mannschaft'
    let puffer = 25
    try {
      const einst = app.findAllRecords('settings')[0]
      if (einst) {
        name = einst.getString('anzeigename') || name
        const p = einst.getInt('puffer_minuten')
        if (p >= 0) puffer = p
      }
    } catch {
      // Keine Einstellungen vorhanden — dann bleibt es bei den Vorgaben.
    }

    const erste = new Record(teams)
    erste.set('name', name)
    erste.set('sort', 0)
    erste.set('puffer_minuten', puffer)
    erste.set('startort', '')
    app.save(erste)

    for (const satz of app.findAllRecords('members')) {
      satz.set('team', erste.id)
      app.save(satz)
    }
    for (const satz of app.findAllRecords('fixtures')) {
      satz.set('team', erste.id)
      app.save(satz)
    }

    // ── 5 · Erst jetzt zur Pflicht machen ───────────────────────────────────────────────────
    // Ab hier ist ein Mitglied ohne Mannschaft nicht mehr speicherbar. Das ist der eigentliche
    // Schutz gegen ein Datenleck zwischen den Mannschaften: keine Sorgfaltsfrage, sondern eine
    // Frage des Schemas.
    for (const [collectionName, feld] of [
      ['members', 'team'],
      ['fixtures', 'team'],
    ]) {
      const collection = app.findCollectionByNameOrId(collectionName)
      const f = collection.fields.getByName(feld)
      f.required = true
      app.save(collection)
    }

    // ── 6 · Der Puffer steht jetzt an der Mannschaft ────────────────────────────────────────
    // Zwei Quellen für denselben Wert wären eine Einladung, die falsche zu lesen.
    const einstellungen = app.findCollectionByNameOrId('settings')
    if (einstellungen.fields.getByName('puffer_minuten')) {
      einstellungen.fields.removeByName('puffer_minuten')
      app.save(einstellungen)
    }
  },

  (app) => {
    // Zurück: Puffer wieder in die Einstellungen, Bezüge weg, beide Collections löschen.
    try {
      const einstellungen = app.findCollectionByNameOrId('settings')
      if (!einstellungen.fields.getByName('puffer_minuten')) {
        einstellungen.fields.add(
          new NumberField({ name: 'puffer_minuten', onlyInt: true, min: 0, max: 180 }),
        )
        app.save(einstellungen)
        for (const satz of app.findAllRecords('settings')) {
          satz.set('puffer_minuten', 25)
          app.save(satz)
        }
      }
    } catch {
      /* nicht vorhanden */
    }

    for (const name of ['members', 'fixtures']) {
      try {
        const collection = app.findCollectionByNameOrId(name)
        if (collection.fields.getByName('team')) {
          collection.fields.removeByName('team')
          app.save(collection)
        }
      } catch {
        /* nicht vorhanden */
      }
    }

    for (const name of ['verwalter', 'teams']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch {
        /* nicht vorhanden */
      }
    }
  },
)
