# Mannschaftsplan

Terminplanung und Fahrdienst für **eine** Dartmannschaft (8–10 Personen). Spielplan, Zu- und Absage
pro Spieltag, Fahrdienst mit berechneter Abfahrtszeit — in der Optik eines Fahrplanaushangs.

Mitglieder kommen **ohne Anmeldung** über einen persönlichen Token-Link herein, der Kapitän über
einen Admin-Login. Selbst gehostet, keine externen CDNs, keine Tracker.

Die vollständige Vorgabe steht in [`docs/umsetzungsplan.md`](docs/umsetzungsplan.md) — Datenmodell,
die verbindlichen Sicherheitsregeln R1–R14, API, Design-Tokens und die Testfälle T1–T13.

**Nicht zu verwechseln** mit [DartsZentrale](https://github.com/zelko2k1/dartszentrale): das ist die
große Vereins-App mit Darts-Counter. Dieses Repo ist eine eigenständige kleine App für eine einzelne
Mannschaft und kennt weder Ergebnisse noch Statistiken.

## Lokal starten (ohne Docker)

Zwei Terminals:

```bash
./scripts/dev-pb.sh          # holt PocketBase 0.39.5 beim ersten Mal, serve auf 127.0.0.1:8090
cd app && npm install && npm run dev   # Vite auf 127.0.0.1:5173, proxyt nach 8090
```

Dann **`http://localhost:5173`** öffnen — nicht die LAN-IP. Das Session-Cookie ist laut R2 `Secure`;
Browser akzeptieren das auf `localhost` auch über HTTP, über eine LAN-IP dagegen nicht. Der
Login-Link funktioniert dort also schlicht nicht.

Produktionsnaher Schnelltest ohne Docker — alles same-origin auf `:8090`:

```bash
cd app && npm run build      # baut nach ../pocketbase/pb_public/
```

## Einrichten

Die App startet leer: keine Mitglieder, keine Spieltage, keine vorgegebenen Konten. Alles legst du
selbst an, und zwar in der Kapitänsansicht.

Einzige Ausnahme ist der Superuser — den braucht PocketBase für sich selbst, und dieselbe Anmeldung
öffnet auch seine Oberfläche unter `http://127.0.0.1:8090/_/`. Beim ersten Start schreibt
PocketBase einen Einrichtungslink auf die Konsole; wer lieber im Terminal bleibt:

```bash
cd pocketbase && ./pocketbase superuser upsert <deine-adresse> <dein-passwort> --dir=pb_data
```

Die Adresse muss eine gültige Form haben, `dev@localhost` lehnt PocketBase ab.

Danach `http://localhost:5173/admin` öffnen und die Mannschaft eintragen. Jedes Mitglied bekommt
dort über **„Neues Token"** seinen Einladungslink. Der Klartext erscheint **genau einmal** — in der
Datenbank steht nur `sha256(token)` (R1). Wer seinen Link verliert, bekommt am selben Knopf einen
neuen.

## Kapitänsansicht

`/admin`, Anmeldung mit dem PocketBase-Superuser (derselbe Zugang wie für `/_/`). Dort werden
Spieltage und Mitglieder gepflegt, Token neu ausgestellt und das Protokoll gelesen.

Getrennt vom Mitgliederteil: eigener Cookie, eigene Sitzungstabelle, eigene Prüflogik (R5). Ohne
Anmeldung antwortet `/admin/api` mit **404**, nicht mit 403 — kein Hinweis darauf, dass es hier
etwas gibt (R6). Im Betrieb gehört `/admin` zusätzlich im Reverse Proxy auf VPN bzw. LAN
beschränkt; das ist die wirksamste Einzelmaßnahme (R13).

## Backup

```bash
PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… BACKUP_DIR=/backup GPG_EMPFAENGER=… \
  ./scripts/backup.sh
```

Gehört in einen Cronjob auf einer **anderen** Maschine als dem Server. Ohne `GPG_EMPFAENGER`
bleibt die Datei unverschlüsselt liegen — das Skript sagt es dann auch. Wiederherstellen über
`POST /api/backups/<datei>/restore`; PocketBase startet dabei neu.

## Im Homelab

Läuft als ein einziger Container (PocketBase mit dem gebauten Frontend in `pb_public`, Migrationen
und Hooks fest im Image) hinter dem vorhandenen Caddy unter dem Namen, den du im Homelab vergibst.
HTTPS ist hier keine Kür: ohne es wird das `Secure`-Cookie nicht gesetzt.

Der Stack steht in [`docker-compose.yaml`](docker-compose.yaml) in der Repo-Wurzel — dort und
nicht in `deploy/`, weil der Build-Kontext die Wurzel ist und ein Kontext oberhalb der
Compose-Datei unter Arcane nicht auflöst. In [`deploy/`](deploy/) liegt der Rest:
`Caddyfile.homelab.example` als Vorlage für den Block im Homelab-Caddy. `deploy/Caddyfile` ist die
Hetzner-Variante mit echter Domain und ACME und wird im Homelab nicht benutzt.

## Tests

Die API-Tests melden sich als Superuser an; dafür braucht es eine `.env` mit deinem eigenen Zugang:

```bash
cp .env.example .env         # Adresse und Passwort deines Superusers eintragen
set -a && . ./.env && set +a
node scripts/api-tests.mjs   # Testfälle aus Abschnitt 11, gegen ein laufendes PocketBase
cd app && npm test           # Logik im Frontend
```

Die API-Tests legen eigene Datensätze an (Präfix `test-`) und räumen sie wieder weg — vorbereitet
werden muss dafür nichts. Dieselbe Suite läuft in der CI gegen ein Wegwerf-PocketBase.

T8, T10, T11 und T12 (Admin-Sperre, Access-Log, Linkvorschau, Backup-Restore) lassen sich nicht
sinnvoll automatisieren und stehen als Handprüfung in Abschnitt 11 des Umsetzungsplans.

## Token neu ausstellen

Wenn jemand seinen Link verloren hat oder er in falsche Hände geraten ist (R12):

```bash
node pocketbase/rotate-token.mjs "<Name des Mitglieds>"
```

Das macht in einem Rutsch den alten Link tot, meldet alle Geräte des Mitglieds ab und schreibt
einen Protokolleintrag. Ab Schritt 6 gibt es denselben Knopf in der Kapitänsansicht; das Skript
bleibt als Rettungsanker daneben bestehen.

## Was wo liegt

| Datei | Inhalt |
|---|---|
| [`docs/umsetzungsplan.md`](docs/umsetzungsplan.md) | Die verbindliche Vorgabe: Datenmodell, Sicherheitsregeln R1–R14, API, Design-Tokens, Testfälle T1–T13. |
| [`PRODUCT.md`](PRODUCT.md) | Was die App sein will, in Prosa — daraus abgeleitet. |
| [`CHANGELOG.md`](CHANGELOG.md) | Was sich von Version zu Version geändert hat. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | Mitmachen und Umgangston. |
| [`SECURITY.md`](SECURITY.md) | Sicherheitslücken vertraulich melden. |
| [`LICENSE`](LICENSE) | MIT — frei nutzbar. |
| [`docker-compose.yaml`](docker-compose.yaml) | Der Stack für Arcane bzw. den Server. |
| [`deploy/`](deploy/) | Dockerfile und die beiden Caddy-Vorlagen. |

## Mitmachen

Fehler, Ideen und Doku-Korrekturen sind willkommen — auch ohne eine Zeile Code. Am besten
über [Issues](../../issues/new/choose); Ablauf, Entwicklungsumgebung und Commit-Stil stehen in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

**Sicherheitslücken bitte nicht als öffentliches Issue**, sondern vertraulich — siehe
[`SECURITY.md`](SECURITY.md). Der Zugang der Mitglieder ist ein Link ohne Passwort; ein Fund
darin trifft sofort alle Betreiber.

## Veröffentlichen

Eine neue Version entsteht ohne Terminal: **Actions → „Release starten" → „Run workflow"**,
Versionsnummer eingeben. Der Workflow prüft den Stand, zählt die Version hoch, stempelt den
Abschnitt „Unveröffentlicht" im Changelog, setzt Commit und Tag und legt das GitHub-Release an.

Ausgeliefert wird kein Paket, sondern der Stand selbst: Der Betreiber baut daraus sein
Container-Image. Der Tag sagt, welcher Stand läuft.

## Lizenz

[MIT](LICENSE) — benutz es, ändere es, gib es weiter.
