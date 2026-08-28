/// <reference path="../pb_data/types.d.ts" />
// PocketBases eigenes Anfrageprotokoll abschalten — R8.
//
// R8 sagt: Einladungslinks dürfen in keinem Protokoll landen. Dafür steht in `deploy/Caddyfile`
// ein `log_skip` auf `/j/*`, und Testfall T10 hat auf dem Server nachgewiesen, dass die Route
// dort tatsächlich fehlt. Das deckt aber nur EIN Protokoll ab.
//
// PocketBase führt daneben ein eigenes: die Tabelle `_logs`, gefüllt von seiner
// Request-Middleware, mit `method`, `url`, `status`, `userAgent`, `referer` und — bei der
// Vorgabe `logIP: true` — der IP-Adresse. Aufbewahrung nach Vorgabe fünf Tage. Nachgemessen an
// einer Wegwerf-Instanz: Ein Aufruf von `/j/<token>` landet dort mit dem **vollständigen Token
// in der URL**. Das Token ist der Zugang; wer diese Tabelle lesen kann, ist jedes Mitglied,
// dessen Link in den letzten fünf Tagen benutzt wurde.
//
// Das wiegt schwerer, als es klingt, weil `_logs` in `pb_data` liegt und damit **in jeder
// Sicherung**. Die Sicherungen sind ausdrücklich unverschlüsselt und sollen laut Oberfläche auf
// den eigenen Rechner des Kapitäns wandern. Eine Kopie der Datenbank wäre also eine Kopie
// funktionierender Zugänge gewesen — genau das, was R1 („nur die Prüfsumme speichern")
// verhindern soll.
//
// Warum abschalten statt filtern: PocketBase bietet keine Möglichkeit, einzelne Routen vom
// eigenen Protokoll auszunehmen. Die Wahl steht zwischen „alles" und „nichts", und für den
// Betrieb ist nichts verloren — Caddy protokolliert weiter (ohne `/j/` und ohne Anhängsel), und
// was die Hooks über `console.log` melden, steht weiterhin in der Ausgabe des Containers.
//
// Der Grundsatz des Projekts sagt dasselbe: Was nicht gespeichert wird, kann nicht
// verlorengehen.

migrate(
  (app) => {
    const einstellungen = app.settings()
    // 0 heißt: gar nicht erst schreiben.
    einstellungen.logs.maxDays = 0
    // Greift nur, falls jemand das Protokoll später wieder einschaltet — dann wenigstens ohne
    // IP-Adresse.
    einstellungen.logs.logIP = false
    app.save(einstellungen)
  },
  (app) => {
    const einstellungen = app.settings()
    einstellungen.logs.maxDays = 5
    einstellungen.logs.logIP = true
    app.save(einstellungen)
  },
)
