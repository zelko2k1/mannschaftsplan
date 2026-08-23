#!/usr/bin/env bash
# Nächtliches Backup — Abschnitt 7.4 des Umsetzungsplans.
#
# Lässt PocketBase ein Backup erzeugen, holt es vom Server, verschlüsselt es und räumt alte
# Stände weg. Gedacht für einen Cronjob auf einer ANDEREN Maschine als dem Server:
#
#   0 3 * * *  PB_URL=https://dart.example.de \
#              PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… \
#              BACKUP_DIR=/backup/mannschaftsplan GPG_EMPFAENGER=… \
#              /pfad/zu/backup.sh >> /var/log/mannschaftsplan-backup.log 2>&1
#
# Ein Backup, das auf demselben Server liegt, ist kein Backup: Festplatte weg, Backup weg.
#
# Umgebungsvariablen:
#   PB_URL                  Standard http://127.0.0.1:8090
#   PB_SUPERUSER_EMAIL      Pflicht
#   PB_SUPERUSER_PASSWORD   Pflicht
#   BACKUP_DIR              Pflicht — wohin die Datei kommt
#   GPG_EMPFAENGER          optional; ohne bleibt das Backup UNVERSCHLÜSSELT liegen
#   AUFBEWAHRUNG_TAGE       Standard 30
set -euo pipefail

PB_URL="${PB_URL:-http://127.0.0.1:8090}"
AUFBEWAHRUNG_TAGE="${AUFBEWAHRUNG_TAGE:-30}"

: "${PB_SUPERUSER_EMAIL:?PB_SUPERUSER_EMAIL fehlt}"
: "${PB_SUPERUSER_PASSWORD:?PB_SUPERUSER_PASSWORD fehlt}"
: "${BACKUP_DIR:?BACKUP_DIR fehlt}"

mkdir -p "$BACKUP_DIR"

json_feld() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

# ── Anmelden ────────────────────────────────────────────────────────────────────────────────
token="$(curl -fsS -X POST "$PB_URL/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$PB_SUPERUSER_EMAIL\",\"password\":\"$PB_SUPERUSER_PASSWORD\"}" |
  json_feld "['token']")"

# ── Backup erzeugen ─────────────────────────────────────────────────────────────────────────
# PocketBase antwortet mit 204 und legt die Datei unter pb_data/backups ab.
curl -fsS -X POST "$PB_URL/api/backups" -H "Authorization: $token" \
  -H 'Content-Type: application/json' -d '{}' > /dev/null

# Neuesten Stand herausfinden — der Name enthält den Zeitstempel des Servers.
schluessel="$(curl -fsS "$PB_URL/api/backups" -H "Authorization: $token" |
  python3 -c "
import sys, json
liste = json.load(sys.stdin)
if not liste:
    raise SystemExit('Keine Backups vorhanden')
print(sorted(liste, key=lambda b: b['modified'])[-1]['key'])
")"

# ── Herunterladen ───────────────────────────────────────────────────────────────────────────
# Der Download braucht einen eigenen, kurzlebigen Datei-Token — der Anmeldetoken reicht nicht.
dateitoken="$(curl -fsS -X POST "$PB_URL/api/files/token" -H "Authorization: $token" | json_feld "['token']")"

ziel="$BACKUP_DIR/$schluessel"
curl -fsS -o "$ziel" "$PB_URL/api/backups/$schluessel?token=$dateitoken"

if [ ! -s "$ziel" ]; then
  echo "Heruntergeladene Datei ist leer — Abbruch." >&2
  rm -f "$ziel"
  exit 1
fi

# Grobe Plausibilität: ein PocketBase-Backup ist eine ZIP-Datei.
if ! head -c 2 "$ziel" | grep -q 'PK'; then
  echo "Heruntergeladene Datei ist kein ZIP — Abbruch." >&2
  rm -f "$ziel"
  exit 1
fi

# ── Verschlüsseln ───────────────────────────────────────────────────────────────────────────
if [ -n "${GPG_EMPFAENGER:-}" ]; then
  gpg --batch --yes --encrypt --recipient "$GPG_EMPFAENGER" --output "$ziel.gpg" "$ziel"
  rm -f "$ziel"
  ziel="$ziel.gpg"
else
  echo "WARNUNG: GPG_EMPFAENGER nicht gesetzt — das Backup liegt unverschlüsselt in $BACKUP_DIR." >&2
fi

# ── Aufräumen ───────────────────────────────────────────────────────────────────────────────
# Lokal: alles älter als AUFBEWAHRUNG_TAGE.
find "$BACKUP_DIR" -maxdepth 1 -name 'pb_backup_*' -type f -mtime "+$AUFBEWAHRUNG_TAGE" -delete

# Auf dem Server: nur den frisch erzeugten Stand wieder entfernen, damit pb_data nicht wächst.
# Ältere Serverstände bleiben unangetastet — falls jemand PocketBases eigene Aufbewahrung nutzt.
curl -fsS -X DELETE "$PB_URL/api/backups/$schluessel" -H "Authorization: $token" > /dev/null || true

echo "$(date '+%Y-%m-%d %H:%M') · $ziel ($(du -h "$ziel" | cut -f1))"
echo "Erinnerung: Ein Restore, den niemand je durchgespielt hat, ist kein Backup."
echo "  Wiederherstellen:  curl -X POST $PB_URL/api/backups/<datei>/restore -H \"Authorization: <token>\""
