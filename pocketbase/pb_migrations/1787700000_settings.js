/// <reference path="../pb_data/types.d.ts" />
// Einstellungen des Betriebs — genau EIN Datensatz, keine Liste.
//
// Warum benannte Felder und kein Schlüssel-Wert-Speicher: Ein Feld hat hier einen Typ, eine
// Längenbegrenzung und einen Hilfetext, und die Admin-Route kann wie bei den Spieltagen gegen
// eine Whitelist schreiben (R4). Ein Schlüssel-Wert-Speicher spart eine Migration je Einstellung
// und kostet dafür genau diese drei Dinge.
//
// Der eine Datensatz wird hier gleich mit angelegt. PocketBase kennt keine Defaultwerte; ohne
// diesen Schritt stünde die App vor einer leeren Tabelle und müsste den Fall überall behandeln.

// **Nachträglich geändert am 28.08.2026** — vorher stand hier „Mannschaftsplan", der Name der
// Anwendung. Der Wert ist der VEREINSNAME: Er steht im Seitentitel, in der Linkvorschau des
// Messengers, über Impressum und Datenschutzhinweis und als Herausgeber in der
// Authenticator-App. Dort die Software zu nennen, wo der Verein stehen soll, sieht aus wie eine
// Entscheidung und wird deshalb nicht ersetzt. „Vereinsname" ist als Platzhalter erkennbar.
//
// Eine angewandte Migration nachträglich zu ändern ist normalerweise falsch; hier ist es richtig.
// PocketBase merkt sich Migrationen am Dateinamen — wo sie gelaufen ist, bleibt der Wert stehen,
// und das ist gewollt: Niemandem soll sein Vereinsname überschrieben werden. Die Änderung wirkt
// nur bei der nächsten frisch aufgesetzten Instanz.
const ANZEIGENAME_STANDARD = 'Vereinsname'

migrate(
  (app) => {
    const collection = new Collection({
      type: 'base',
      name: 'settings',
      // Keine Regeln: nur Superuser. Gelesen wird über die Hooks, geschrieben über
      // /admin/api/settings.
      fields: [
        {
          name: 'anzeigename',
          type: 'text',
          required: true,
          max: 60,
          help: 'Steht auf der Einladungsseite und in der Linkvorschau — für jeden sichtbar, der einen Link weitergeleitet bekommt.',
        },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(collection)

    const satz = new Record(collection)
    satz.set('anzeigename', ANZEIGENAME_STANDARD)
    app.save(satz)
  },

  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('settings'))
    } catch {
      // Gibt es nicht (mehr).
    }
  },
)
