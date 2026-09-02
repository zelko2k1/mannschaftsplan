/// <reference path="../pb_data/types.d.ts" />
// Wie es ausgegangen ist.
//
// Aus der Mannschaft, nach dem ersten Spieltag: Bei abgeschlossenen Terminen möchte man sehen,
// ob gewonnen wurde, mit dem Ergebnis. Der Kapitän trägt es ein, in der Übersicht steht ein
// Stempel wie „Komplett".
//
// DAS IST EINE ENTSCHEIDUNG UND KEIN VERSEHEN. PRODUCT.md führte „Ergebnisse" unter dem, was
// nicht gebaut ist, und die Abgrenzung zur DartsZentrale hing daran. Der Betreiber hat die Linie
// bewusst gezogen: **ein Ergebnis am einzelnen Spieltag, als Hinweis** — keine Tabelle, keine
// Saisonbilanz, keine Auswertung je Spieler. „Für den Rest gibt es die DartsZentrale."
//
// Deshalb auch kein eigener Datensatz und keine Historie: Die Zahlen hängen am Spieltag und
// verschwinden mit ihm, wenn der Löschjob ihn nach 365 Tagen wegräumt. Damit bleibt wahr, was
// in Abschnitt 8 steht — es gibt nichts, woraus sich eine Statistik bauen ließe.
//
// Zwei Zahlen statt eines Textes: „6:2" als Text müsste jemand auslegen, um Sieg von Niederlage
// zu unterscheiden, und jede Auslegung ginge irgendwann daneben („6 : 2", „6-2", „6zu2"). Aus
// zwei Zahlen ergibt sich beides von selbst, und das Unentschieden fällt nebenbei mit ab.
//
// `-1` heißt „nicht eingetragen" — dieselbe Bedeutung wie bei Tempo und Rüstzeit am Spieltag,
// und aus demselben Grund: Die Null ist hier ein gültiges Ergebnis. Ein 0:0 ist ein
// Unentschieden, kein fehlender Eintrag.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('fixtures')
    collection.fields.add(
      new NumberField({
        name: 'ergebnis_wir',
        onlyInt: true,
        min: -1,
        max: 99,
        help: 'Eigenes Ergebnis. -1 = nicht eingetragen; 0 ist ein gültiges Ergebnis.',
      }),
    )
    collection.fields.add(
      new NumberField({
        name: 'ergebnis_gegner',
        onlyInt: true,
        min: -1,
        max: 99,
        help: 'Ergebnis des Gegners. -1 = nicht eingetragen.',
      }),
    )
    app.save(collection)

    // Bestehende Spieltage haben 0 stehen, und 0 hieße „0:0 gespielt". Einmal auf -1 setzen,
    // sonst zeigte jeder alte Spieltag ein Unentschieden, das nie stattgefunden hat.
    for (const s of app.findRecordsByFilter('fixtures', "id != ''", '', 5000, 0)) {
      s.set('ergebnis_wir', -1)
      s.set('ergebnis_gegner', -1)
      app.save(s)
    }
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('fixtures')
      collection.fields.removeByName('ergebnis_wir')
      collection.fields.removeByName('ergebnis_gegner')
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
