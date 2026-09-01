#!/usr/bin/env bash
# Einen neuen Stand auf den Server holen — der Ablauf aus dem README-Abschnitt „Aktualisieren“
# in einem Befehl:
#
#   cd mannschaftsplan
#   ./scripts/update.sh
#
# ZIEH VORHER EINE SICHERUNG — in der App unter Verein → Sicherungen, herunterladen, vom Server
# wegnehmen. Das Skript tut das absichtlich nicht: Eine Sicherung, die auf demselben Rechner
# liegen bleibt, ist im Ernstfall keine, und ein Skript, das sie anlegt und liegen lässt,
# verkauft ein Sicherheitsgefühl, das nicht trägt.
#
# Umgebungsvariablen:
#   MIT_CADDY   1 oder 0 — ob das Caddy-Overlay dazugehört. Ohne Angabe erkennt das Skript es am
#               Container `mannschaftsplan-caddy`. Wer einen eigenen Reverse Proxy betreibt
#               (deploy/Caddyfile.homelab.example), setzt 0 und startet ihn selbst neu, wenn sich
#               deploy/Caddyfile geändert hat.
#
# Warum der Proxy einen eigenen Neustart bekommt: `deploy/Caddyfile` ist in den Caddy-Container
# eingehängt und wird NUR BEIM START gelesen. `up -d --build` fasst diesen Container aber nicht
# an, weil sich an seiner Service-Definition nichts ändert — der neue Stand läge auf der Platte,
# während der Proxy weiter nach der alten Fassung arbeitet. Ohne Fehlermeldung, und betroffen
# sind ausgerechnet die Regeln, die man von außen nicht sieht: das Gate vor /admin (R13b) und der
# Präfix aus R13c.
#
# `--no-deps` gehört dazu: `caddy` hängt per depends_on an der App, und ohne dieses Wort zieht
# Compose sie mit in die Neuerstellung — ein Aussetzer, den niemand bestellt hat.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Keine .env in $(pwd) gefunden — gehört dieses Skript zu deiner Installation?" >&2
  exit 1
fi

# Ohne Vorgabe: Es gibt ein Overlay, wenn es dessen Container gibt. `container_name` steht in
# docker-compose.caddy.yaml fest, deshalb ist der Name eine verlässliche Auskunft.
if [ -z "${MIT_CADDY:-}" ]; then
  if docker ps -a --format '{{.Names}}' | grep -qx mannschaftsplan-caddy; then
    MIT_CADDY=1
  else
    MIT_CADDY=0
    echo "Kein Container mannschaftsplan-caddy — es wird ohne das Caddy-Overlay gearbeitet."
  fi
fi

compose=(docker compose -f docker-compose.yaml)
if [ "$MIT_CADDY" = 1 ]; then
  compose+=(-f docker-compose.caddy.yaml)
fi

echo "── Neuen Stand holen ────────────────────────────────────────────────"
vorher="$(git rev-parse HEAD)"
git pull
if [ "$(git rev-parse HEAD)" = "$vorher" ]; then
  echo "Nichts Neues im Repo — gebaut und neu gestartet wird trotzdem."
else
  git log --oneline "$vorher..HEAD"
fi

echo "── Anwendung bauen und starten ──────────────────────────────────────"
"${compose[@]}" up -d --build

if [ "$MIT_CADDY" = 1 ]; then
  echo "── Proxy auf die aktuelle deploy/Caddyfile bringen ──────────────────"
  "${compose[@]}" up -d --no-deps --force-recreate caddy
fi

# Nachmessen statt glauben: Der Präfix aus R13c ist die Stelle, an der ein stehengebliebener
# Proxy auffällt — die Anfrage käme sonst unbeantwortet bis zur App durch.
#
# `--resolve` schickt die Anfrage an 127.0.0.1, behält aber Name und SNI: Dieses Skript läuft auf
# dem Server, und dort ist der Umweg über die öffentliche Adresse unnötig und je nach Netz sogar
# unmöglich — nicht jede Maschine erreicht ihre eigene öffentliche IP von innen. Das Zertifikat
# passt weiterhin, weil der Name unverändert bleibt.
#
# Und ein Anlauf genügt nicht: Der Proxy ist gerade neu erstellt worden und braucht einen Moment,
# bis er auf 443 hört. Vorher antwortet nichts, und curl schreibt 000.
gate_messen() {
  curl -s -o /dev/null -m 5 --resolve "$domain:443:127.0.0.1" -w '%{http_code}' \
    "https://$domain/api/collections/_superusers/auth-refresh" || true
}

domain="$(sed -n 's/^DOMAIN=//p' .env | tail -n1 | tr -d "\"'\r ")"
if [ "$MIT_CADDY" = 1 ] && [ -n "$domain" ]; then
  echo "── Nachmessen ───────────────────────────────────────────────────────"
  code=000
  for versuch in 1 2 3 4 5 6; do
    code="$(gate_messen)"
    if [ "$code" != 000 ]; then
      break
    fi
    sleep 2
  done
  case "$code" in
    401)
      echo "Gate vor der Superuser-Anmeldung: 401 — steht."
      ;;
    000)
      # 000 ist kein Status, sondern das Ausbleiben einer Antwort. Daraus lässt sich über R13c
      # nichts folgern, und genau das soll hier auch nicht behauptet werden.
      echo "Keine Antwort von https://$domain nach $versuch Versuchen — der Proxy ist noch nicht" >&2
      echo "bereit, oder er ist von diesem Rechner aus nicht erreichbar. Das sagt NICHTS darüber," >&2
      echo "ob das Gate steht; dann von einem anderen Rechner aus nachmessen." >&2
      ;;
    *)
      echo "Gate: $code statt 401 — der Proxy arbeitet nicht nach deploy/Caddyfile (R13c)." >&2
      ;;
  esac
fi

echo
echo "Fertig. Im Browser einmal hart neu laden (Strg+Umschalt+R), sonst hängt der alte Stand"
echo "der Oberfläche noch im Zwischenspeicher."
