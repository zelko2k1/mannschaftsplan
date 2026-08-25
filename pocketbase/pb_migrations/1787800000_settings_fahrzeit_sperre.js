/// <reference path="../pb_data/types.d.ts" />
// Drei Werte, die bisher fest im Code standen: die beiden Größen der Fahrzeit-Formel und die
// Frist, nach der ein gespielter Spieltag von selbst zumacht.
//
// Eigene Migration statt einer Änderung an 1787700000: die ist bei bestehenden Installationen
// längst gelaufen und wird nicht erneut angewandt. Wer sie nachträglich bearbeitet, ändert nur
// noch, was frische Installationen sehen — die vorhandenen bekämen die Felder nie.
//
// PocketBase kennt keine Defaultwerte. Der vorhandene Datensatz muss deshalb hier mit befüllt
// werden, sonst stünden die drei Werte bei allen, die schon laufen, auf 0 — und eine
// Durchschnittsgeschwindigkeit von 0 km/h ist keine Fahrzeit, sondern eine Division durch null.

const TEMPO_STANDARD = 80
const PUFFER_STANDARD = 25
// 0 heißt aus. Wer bereits läuft, soll nicht plötzlich gesperrte Spieltage vorfinden, weil eine
// Aktualisierung eine Frist mitbrachte, die er nie gewählt hat.
const AUTO_SPERRE_STANDARD = 0

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('settings')

    collection.fields.add(
      new NumberField({
        name: 'tempo_kmh',
        onlyInt: true,
        min: 20,
        max: 200,
        help: 'Angenommene Durchschnittsgeschwindigkeit für die Fahrzeit. Auf dem Land eher hoch, in der Stadt eher niedrig.',
      }),
    )
    collection.fields.add(
      new NumberField({
        name: 'puffer_minuten',
        onlyInt: true,
        min: 0,
        max: 180,
        help: 'Zeit vor dem Anwurf, die zusätzlich eingeplant wird — Parken, Umziehen, Einwerfen.',
      }),
    )
    collection.fields.add(
      new NumberField({
        name: 'auto_sperre_stunden',
        onlyInt: true,
        min: 0,
        max: 168,
        help: '0 = aus. Sonst wird ein Spieltag so viele Stunden nach dem Anwurf von selbst gesperrt.',
      }),
    )
    app.save(collection)

    for (const satz of app.findAllRecords('settings')) {
      satz.set('tempo_kmh', TEMPO_STANDARD)
      satz.set('puffer_minuten', PUFFER_STANDARD)
      satz.set('auto_sperre_stunden', AUTO_SPERRE_STANDARD)
      app.save(satz)
    }
  },

  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('settings')
      for (const name of ['tempo_kmh', 'puffer_minuten', 'auto_sperre_stunden']) {
        const feld = collection.fields.getByName(name)
        if (feld) collection.fields.removeByName(name)
      }
      app.save(collection)
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
