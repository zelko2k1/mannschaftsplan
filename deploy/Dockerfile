# Ein einziges Image: PocketBase mit dem gebauten Frontend in pb_public, Migrationen und Hooks
# fest im Image. Dadurch läuft alles auf EINER Origin — die Cookies aus R2/R11 brauchen weder
# CORS noch eine Backend-URL im Bundle.
#
# Build-Kontext ist die REPO-WURZEL (siehe docker-compose.yaml), weil sowohl app/ als auch
# pocketbase/ gebraucht werden:  docker build -f deploy/Dockerfile .

# ── Frontend bauen ───────────────────────────────────────────────────────────────────────────
# Die Verzeichnisstruktur spiegelt das Repo, weil vite.config.ts nach ../pocketbase/pb_public baut.
FROM node:24-alpine AS frontend
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

# ── Laufzeit ─────────────────────────────────────────────────────────────────────────────────
# Version GEPINNT (nicht :latest) — reproduzierbare Deploys. Beim Upgrade auch scripts/dev-pb.sh
# erhöhen und die Hooks gegen die neue JSVM-API prüfen.
FROM ghcr.io/muchobien/pocketbase:0.39.5

# Bewusst NICHT nach /pb_migrations bzw. /pb_hooks kopiert: das Basis-Image deklariert dort
# unter Umständen Volumes, anonyme Volumes würden Updates dann verschlucken. Auch kein
# Bind-Mount aus dem Compose — relative Mounts greifen unter Arcane je nach Arbeitsverzeichnis
# nicht und liefern stillschweigend leere Ordner.
COPY pocketbase/pb_migrations /pb/migrations
COPY pocketbase/pb_hooks /pb/hooks
COPY --from=frontend /src/pocketbase/pb_public /pb/pb_public
