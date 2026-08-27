/// <reference path="../pb_data/types.d.ts" />
// Rollen und der Bezug zwischen Konto und Spieler — Abschnitt 12, zweite Fassung.
//
// Vorbild ist die Dartszentrale, die dasselbe Problem schon einmal gelöst hat. Ihr Kernsatz:
// Die Spielerliste ist die einzige Quelle für sportliche Personen, und Login-Konten sind davon
// getrennt und verweisen OPTIONAL auf einen Spieler.
//
// Hier gab es beide Hälften bereits — `members` sind die Spieler, `verwalter` die Konten —, aber
// sie kannten einander nicht. Ein Kapitän, der selbst spielt, hatte deshalb zwei Identitäten
// ohne Verbindung: ein Konto und einen Mitgliedseintrag mit eigenem Einladungslink. Und weil die
// Verbindung fehlte, ließ sich die Regel „der Admin ist kein Spieler" gar nicht ausdrücken — sie
// ist eine Aussage über eine Verknüpfung, die es nicht gab.
//
// Zwei Änderungen:
//
// 1. **Die Rolle `gesamt` heißt `admin`.** Reine Umbenennung. „Gesamt" war ein Wort aus dem
//    Bauch dieses Projekts, das niemand von außen versteht; „admin" versteht jeder.
//
// 2. **`verwalter.mitglied`** verweist optional auf einen Spieler. Für den Kapitän, der
//    mitspielt. Wer nur organisiert, bleibt unverknüpft — wie der Schriftführer in der
//    Dartszentrale, der ein Konto hat, aber kein Spielerprofil.
//
// Erzwungen wird in den Routen, nicht im Schema: Ein Admin darf weder Mannschaft noch Mitglied
// haben, ein Kapitän braucht eine Mannschaft, und ein verknüpftes Mitglied muss zu ihr gehören.
// Im Schema stünde davon nur die Hälfte, und ein Rollenwechsel scheiterte an der falschen Stelle.

migrate(
  (app) => {
    const verwalter = app.findCollectionByNameOrId('verwalter')

    // In drei Schritten, weil PocketBase Datensätze gegen die erlaubten Werte prüft: erst beide
    // Werte zulassen, dann umschreiben, dann den alten entfernen. Andersherum wären bestehende
    // Konten für einen Moment ungültig.
    const rolle = verwalter.fields.getByName('rolle')
    rolle.values = ['gesamt', 'admin', 'kapitaen']
    app.save(verwalter)

    for (const satz of app.findAllRecords('verwalter')) {
      if (satz.getString('rolle') === 'gesamt') {
        satz.set('rolle', 'admin')
        app.save(satz)
      }
    }

    rolle.values = ['admin', 'kapitaen']
    rolle.help = '`admin` sieht und darf alles. `kapitaen` betreut genau eine Mannschaft.'
    app.save(verwalter)

    verwalter.fields.add(
      new RelationField({
        name: 'mitglied',
        collectionId: app.findCollectionByNameOrId('members').id,
        maxSelect: 1,
        cascadeDelete: false,
        help: 'Der Spielereintrag zu diesem Konto, falls die Person mitspielt. Beim Admin immer leer.',
      }),
    )
    app.save(verwalter)
  },

  (app) => {
    try {
      const verwalter = app.findCollectionByNameOrId('verwalter')

      if (verwalter.fields.getByName('mitglied')) {
        verwalter.fields.removeByName('mitglied')
        app.save(verwalter)
      }

      const rolle = verwalter.fields.getByName('rolle')
      rolle.values = ['gesamt', 'admin', 'kapitaen']
      app.save(verwalter)

      for (const satz of app.findAllRecords('verwalter')) {
        if (satz.getString('rolle') === 'admin') {
          satz.set('rolle', 'gesamt')
          app.save(satz)
        }
      }

      rolle.values = ['gesamt', 'kapitaen']
      app.save(verwalter)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
