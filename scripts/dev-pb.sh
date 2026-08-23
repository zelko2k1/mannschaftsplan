#!/usr/bin/env bash
# PocketBase für den lokalen Entwicklungsbetrieb — holt das Binary beim ersten Mal und startet es.
#
# Auf diesem Rechner läuft kein Docker; der Homelab-Weg (deploy/) ist für den Betrieb da, nicht
# fürs Entwickeln. Deshalb hier das nackte Binary.
#
# Umgebungsvariablen:
#   PB_PORT=8090      Port
#   PB_DEV=1          PocketBases --dev: Logs und SQL auf die Konsole
set -euo pipefail

PB_VERSION="0.39.5"   # gepinnt wie in deploy/Dockerfile — beide Stellen zusammen erhöhen.
PB_PORT="${PB_PORT:-8090}"

wurzel="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$wurzel/pocketbase"

# ── Binary besorgen ──────────────────────────────────────────────────────────────────────────
if [ ! -x ./pocketbase ]; then
  case "$(uname -m)" in
    x86_64)          arch="amd64" ;;
    aarch64|arm64)   arch="arm64" ;;
    *) echo "Unbekannte Architektur $(uname -m) — Binary bitte von Hand nach pocketbase/ legen." >&2
       exit 1 ;;
  esac
  paket="pocketbase_${PB_VERSION}_linux_${arch}.zip"
  echo "Hole PocketBase ${PB_VERSION} (${arch}) …"
  curl -fsSL -o "$paket" \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${paket}"
  unzip -oq "$paket" pocketbase
  rm -f "$paket"
  chmod +x ./pocketbase
fi

echo "PocketBase $(./pocketbase --version | awk '{print $3}') auf http://127.0.0.1:${PB_PORT}"

# ── Starten ─────────────────────────────────────────────────────────────────────────────────
# --automigrate=0 ist Pflicht: sonst schreibt PocketBase bei jeder Schema-Änderung im Dashboard
# neue Migrationsdateien, die sich mit der Baseline in pb_migrations beißen.
argumente=(
  serve
  --dir=pb_data
  --migrationsDir=pb_migrations
  --hooksDir=pb_hooks
  --publicDir=pb_public
  --automigrate=0
  "--http=127.0.0.1:${PB_PORT}"
)
[ "${PB_DEV:-}" = "1" ] && argumente+=(--dev)

./pocketbase "${argumente[@]}" &
pb_pid=$!
trap 'kill "$pb_pid" 2>/dev/null || true' EXIT INT TERM

# PocketBase beendet sich bei manchen Startfehlern mit Exit-Code 0 — dem Exit-Code ist also nicht
# zu trauen. Stattdessen aktiv nachsehen, ob der Server wirklich antwortet.
for _ in $(seq 1 40); do
  if curl -fsS --max-time 1 "http://127.0.0.1:${PB_PORT}/api/health" >/dev/null 2>&1; then
    echo "Bereit. Oberfläche: http://127.0.0.1:${PB_PORT}/_/    (Frontend: npm run dev in app/)"
    wait "$pb_pid"
    exit $?
  fi
  kill -0 "$pb_pid" 2>/dev/null || { echo "PocketBase ist beim Start abgebrochen — Ausgabe oben." >&2; exit 1; }
  sleep 0.25
done

echo "PocketBase antwortet nach 10 s nicht auf /api/health." >&2
exit 1
