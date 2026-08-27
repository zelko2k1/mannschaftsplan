/// <reference path="../pb_data/types.d.ts" />
// Tempo und Puffer wohnen nur noch am Spieltag — Abschnitt 6.3, letzte Fassung.
//
// Es gab drei Stufen: zentral, Mannschaft, Spieltag. Gedacht war das als Bequemlichkeit — einmal
// einstellen, überall gültig. In der Bedienung war es das Gegenteil: Wer eine Abfahrtszeit
// erklären wollte, musste an drei Stellen nachsehen, und zwei davon lagen in verschiedenen
// Reitern.
//
// Jetzt gilt: **am Spieltag oder gar nicht.** Ein leeres Feld nimmt den eingebauten Standard —
// 80 km/h und 25 Minuten, die Werte, die auch bisher am Anfang standen. Die beiden Spalten, die
// sie sonst überschrieben, verschwinden; ein Wert, den niemand mehr sehen, aber jeder spüren
// kann, ist schlimmer als gar keiner.
//
// `fixtures.tempo_kmh` und `fixtures.puffer_minuten` bleiben unverändert, `-1` heißt weiterhin
// „nicht gesetzt". Es erbt nur nicht mehr von der Mannschaft, sondern vom Standard.

migrate(
  (app) => {
    const einstellungen = app.findCollectionByNameOrId('settings')
    if (einstellungen.fields.getByName('tempo_kmh')) {
      einstellungen.fields.removeByName('tempo_kmh')
      app.save(einstellungen)
    }

    const teams = app.findCollectionByNameOrId('teams')
    if (teams.fields.getByName('puffer_minuten')) {
      teams.fields.removeByName('puffer_minuten')
      app.save(teams)
    }
  },

  (app) => {
    try {
      const einstellungen = app.findCollectionByNameOrId('settings')
      if (!einstellungen.fields.getByName('tempo_kmh')) {
        einstellungen.fields.add(
          new NumberField({ name: 'tempo_kmh', onlyInt: true, min: 20, max: 200 }),
        )
        app.save(einstellungen)
        for (const satz of app.findAllRecords('settings')) {
          satz.set('tempo_kmh', 80)
          app.save(satz)
        }
      }
    } catch {
      /* nicht vorhanden */
    }

    try {
      const teams = app.findCollectionByNameOrId('teams')
      if (!teams.fields.getByName('puffer_minuten')) {
        teams.fields.add(
          new NumberField({ name: 'puffer_minuten', onlyInt: true, min: 0, max: 180 }),
        )
        app.save(teams)
        for (const satz of app.findAllRecords('teams')) {
          satz.set('puffer_minuten', 25)
          app.save(satz)
        }
      }
    } catch {
      /* nicht vorhanden */
    }
  },
)
