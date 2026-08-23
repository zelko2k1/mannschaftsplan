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

Testdaten und Einladungs-Links. Dafür braucht es einmalig einen Superuser — dieselbe Anmeldung
öffnet auch PocketBases eigene Oberfläche unter `http://127.0.0.1:8090/_/`:

```bash
cd pocketbase && ./pocketbase superuser upsert dev@example.com <passwort> --dir=pb_data
cd .. && cp .env.example .env      # Passwort dort eintragen
set -a && . ./.env && set +a
node pocketbase/seed.mjs           # 8 Mitglieder, 6 Spieltage; gibt die Tokens EINMALIG aus
```

Die Adresse muss eine gültige Form haben, `dev@localhost` lehnt PocketBase ab. Die ausgegebenen
Links sind der einzige Weg zu den Tokens — in der Datenbank steht nur `sha256(token)` (R1).

Produktionsnaher Schnelltest ohne Docker — alles same-origin auf `:8090`:

```bash
cd app && npm run build      # baut nach ../pocketbase/pb_public/
```

## Im Homelab

Läuft als ein einziger Container (PocketBase mit dem gebauten Frontend in `pb_public`, Migrationen
und Hooks fest im Image) hinter dem vorhandenen Caddy unter **`https://dart.example.home`**.
HTTPS ist hier keine Kür: ohne es wird das `Secure`-Cookie nicht gesetzt.

Siehe [`deploy/`](deploy/) — `docker-compose.yaml` für den Arcane-Stack,
`Caddyfile.homelab.example` als Vorlage für den Block im Homelab-Caddy. `deploy/Caddyfile` ist die
Hetzner-Variante mit echter Domain und ACME und wird im Homelab nicht benutzt.

## Tests

```bash
node scripts/api-tests.mjs   # T1–T7, T9, T13 gegen ein laufendes PocketBase
cd app && npm test           # Logik im Frontend
```

T8, T10, T11 und T12 (Admin-Sperre, Access-Log, Linkvorschau, Backup-Restore) lassen sich nicht
sinnvoll automatisieren und stehen als Handprüfung in Abschnitt 11 des Umsetzungsplans.
