# Changelog

Alle nennenswerten Änderungen an Mannschaftsplan werden hier festgehalten.

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

### Geändert
- **Groß steht der Gegner, nicht der Ort.** Im Aushang wie in der Kapitänsliste steht
  jetzt der Vereinsname in der großen Zeile („BULLS EYE"), der Ort rückt darunter
  („Celle · Sportsbar Celle"). Fehlt der Vereinsname, tritt der Ort an seine Stelle.
- **Der Kopfbalken heißt „Spieltage"** statt „Abfahrt".
- **Datum und Uhrzeit folgen in der Kapitänsansicht den Systemeinstellungen** —
  Reihenfolge, Trenner und 12-/24-Stunden-Zählung. Der Aushang behält seine feste
  Schreibweise, damit er auf jedem Gerät gleich aussieht.
- **„Datum und Anwurf" hat im Formular eine eigene Zeile.** In einer schmalen Spalte
  wurde das Feld abgeschnitten, sobald das System 12-Stunden-Zeit schreibt.

### Behoben
- **Der Anwurf wurde um den Zeitzonen-Versatz verschoben.** Das Eingabefeld arbeitet in
  Ortszeit, PocketBase speichert UTC — dazwischen wurde nichts umgerechnet. Ein im
  Adminpanel eingetragener Anwurf um 19:30 stand im Aushang danach um 21:30, und beim
  erneuten Bearbeiten kamen zwei weitere Stunden dazu.

## [0.1.0] – 2026-08-23

Erste lauffähige Fassung: die Schritte 0–7 des
[Umsetzungsplans](docs/umsetzungsplan.md).

### Hinzugefügt
- **Aushang für die Mannschaft.** Spieltage in der Optik eines Fahrplanaushangs, Zu- und
  Absage je Spieltag, Fahrdienst mit Plätzen und berechneter Abfahrtszeit.
- **Zugang ohne Anmeldung.** Jedes Mitglied bekommt einen persönlichen Token-Link; in der
  Datenbank steht nur `sha256(token)`. Sitzungen sind davon getrennt (R1, R2).
- **Kapitänsansicht** unter `/admin`: Spieltage und Mitglieder pflegen, Token neu
  ausstellen, Protokoll lesen. Eigener Cookie, eigene Sitzungstabelle, eigene Prüflogik;
  ohne Anmeldung antwortet sie mit 404 statt 403 (R5, R6).
- **Härtung** nach den Regeln R1–R14: Rate Limits, die Fehlversuche zählen statt
  Anfragen, CSRF-Kopfzeile, Sicherheitskopfzeilen auch ohne Reverse Proxy, keine Token
  in Logs oder Linkvorschauen.
- **Ein einziges Container-Image** (PocketBase mit gebautem Frontend, Migrationen und
  Hooks) für den Betrieb hinter dem vorhandenen Reverse Proxy.
- **Sicherung** über `scripts/backup.sh`, verschlüsselt an einen GPG-Empfänger.
- **Prüfungen**: 33 API-Testfälle und Unit-Tests, in der CI zusätzlich gegen das gebaute
  Image.
