# Changelog

Alle nennenswerten Änderungen an Mannschaftsplan werden hier festgehalten.

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

### Entfernt
- **Das Seed-Skript mit den erfundenen Testdaten ist weg** (`pocketbase/seed.mjs`). Es legte
  acht Mitglieder und sechs Spieltage mit ausgedachten Namen an. Die Auslieferung enthält
  jetzt keine Daten und keine Konten mehr: Mannschaft und Spielplan entstehen ausschließlich
  in der Kapitänsansicht, die Einladungslinks kommen dort aus „Neues Token". Für die
  API-Tests war der Seed ohnehin nie nötig — sie legen ihre eigenen Datensätze an.

### Hinzugefügt
- **Ein Server, vier Werte, ein Befehl.** `docker-compose.caddy.yaml` stellt Caddy vor die App —
  für alle, auf deren Server noch kein Reverse Proxy läuft. Domain, ACME-Adresse und das Tor aus
  R13b kommen aus der `.env`; die Caddy-Vorlage wird nicht mehr editiert. Fehlt einer der Werte,
  fährt der Stack nicht an und nennt den fehlenden, statt falsch konfiguriert zu laufen. Wer
  bereits einen Proxy betreibt, nimmt weiterhin nur `docker-compose.yaml` — der App-Service ist
  in beiden Fällen derselbe und nur einmal definiert.
- **Die CI prüft die Caddy-Vorlagen.** Beide laufen gegen dieselbe Caddy-Version wie im Betrieb:
  `caddy validate` für die Overlay-Vorlage in beiden Ausbaustufen von R13b, ein Syntaxcheck für
  den Block für vorhandene Proxys, dazu die Formatierung. Vorlagen, die Betreiber unverändert
  übernehmen, waren bis hierher von nichts geprüft.

### Sicherheit
- **R13 ist aufgeteilt, und die Caddy-Vorlagen liefern nichts mehr aus, was ungeprüft
  durchgeht.** Bisher standen `/admin` und `/_/` im selben Block hinter einer IP-Allowlist mit
  einem Beispielbereich darin — eine Vorlage, die man übernimmt, ohne sie zu ändern, schützt
  niemanden. Jetzt gilt: `/_/` antwortet **immer** mit 404, ohne Schalter und ohne Ausnahme; es
  wird im Betrieb nie gebraucht, und für Einrichtung oder Restore führt der Weg über einen
  SSH-Tunnel auf einen an `127.0.0.1` gebundenen Port. Für `/admin` muss der Betreiber einen von
  zwei Wegen einrichten — IP-Allowlist oder eine dem Admin-Code vorgeschaltete Proxy-Anmeldung —
  und solange keiner eingerichtet ist, bleibt `/admin` zu. Beide Wege kommen ohne VPN aus, was
  vorher nicht galt.
- **Bekannte Lücke benannt:** Der Kapitäns-Login prüft das Passwort direkt und geht an
  PocketBases MFA vorbei. Der zweite Faktor schützt heute nur `/_/`, nicht `/admin`. Nachzurüsten
  in Schritt 9; bis dahin deckt das Tor aus R13b diese Stelle.

### Behoben
- **Der Deploy unter Arcane brach ab, bevor gebaut wurde** — „dockerfile not found:
  `<projekt>/Dockerfile`". Die Compose-Datei lag in `deploy/` und baute mit `context: ..`,
  also aus einem Verzeichnis oberhalb ihrer selbst. Arcane löst relative Pfade gegen das
  Projektverzeichnis auf statt gegen den Ort der Compose-Datei und suchte das Dockerfile
  dadurch eine Ebene zu hoch. `docker-compose.yaml` liegt jetzt in der Repo-Wurzel und baut
  mit `context: .` — damit gibt es kein Verzeichnis oberhalb mehr, auf das es ankäme.

### Geändert
- **`.env.example` gibt nichts mehr vor.** Statt einer vorgegebenen Adresse stehen dort leere
  Felder; eingetragen wird der Superuser, den man sich selbst angelegt hat. Gebraucht wird die
  Datei nur noch von den Skripten, nicht von der App.
- **Alle Beispiele im Repo tragen neutrale Namen.** Erfundene Personen, Vereine und Orte sind
  aus Feld-Hilfetexten, Kommentaren und dem Umsetzungsplan verschwunden; an ihre Stelle tritt
  die Beschreibung des Feldes. Die Homelab-Vorlage nennt keinen echten Hostnamen und keinen
  echten IP-Bereich mehr, sondern klar gekennzeichnete Platzhalter.
- **Groß steht der Gegner, nicht der Ort.** Im Aushang wie in der Kapitänsliste steht
  jetzt der Vereinsname in der großen Zeile, der Ort rückt zusammen mit der Spielstätte
  darunter. Fehlt der Vereinsname, tritt der Ort an seine Stelle.
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
