# Dartzentrale — Umsetzungsplan

Terminplanung und Fahrdienst für eine Dartmannschaft (8–10 Personen).
Design: **Abfahrtsplan** (Fahrplanaushang-Optik).
Mitglieder ohne Anmeldung über Token-Link, Admin mit Login.

Dieses Dokument ist die vollständige Vorgabe für die Umsetzung. Wo eine Entscheidung schon
gefallen ist, steht sie hier als Vorgabe, nicht als Vorschlag.

> **Stand 2026-08-23.** Gegenüber der Erstfassung korrigiert: `GET /j/:token` legt keine Session
> mehr an (R10, Abschnitt 5), `sessions.started_at` statt `created`, `seat_claims` bekommt eine
> Relation auf `rides`, und der Caddy-Log-Filter für `/j/*` heißt `log_skip` statt eines
> Query-Filters (R8). Rate Limiting läuft primär über PocketBase statt über ein Caddy-Plugin.
> Betriebsziel bis auf Weiteres: lokal ohne Docker entwickeln, im Homelab unter
> `https://dart.example.home` testen — siehe `README.md`. Der Hetzner-Betrieb aus Abschnitt 7
> bleibt das Fernziel.

---

## 0. Hinweise für die Umsetzung

- **PocketBase-API vor Gebrauch prüfen.** Die JS-Hook-API (`pb_hooks`) hat sich zwischen
  PocketBase-Versionen mehrfach geändert. Alle Code-Fragmente hier sind als *Absicht* zu lesen.
  Vor der Implementierung `pb_data/types.d.ts` (generiert PocketBase selbst) und die Doku der
  tatsächlich installierten Version heranziehen und die Signaturen daran anpassen.
- **Nicht raten, sondern nachsehen.** Wenn eine Funktion nicht existiert wie beschrieben,
  die vorhandene Entsprechung suchen — keine eigene Krypto, keine eigene Session-Logik
  erfinden, die über das hier beschriebene hinausgeht.
- **Sicherheitsregeln in Abschnitt 4 sind nicht verhandelbar.** Wenn eine davon im Weg steht,
  nachfragen statt umgehen.

---

## 1. Umfang

**Die App kann:**
- Spielplan anzeigen (Heim/Auswärts, Gegner, Ort, Anwurf, Entfernung)
- Berechnete Abfahrtszeit für Auswärtsspiele
- Pro Spieler und Spieltag: dabei / unsicher / kann nicht
- Fahrdienst: wer fährt, wie viele Plätze, wer fährt mit
- Kapitänsansicht: alles bearbeiten, Spieltage pflegen, Token neu ausstellen

**Die App kann bewusst nicht:**
- WhatsApp-Nachrichten senden oder lesen (siehe Abschnitt 9)
- Ergebnisse, Statistiken, Averages
- Push-Benachrichtigungen (Erinnerung läuft über einen Cronjob an den Kapitän)

---

## 2. Stack

| Ebene | Wahl | Begründung |
|---|---|---|
| Backend | PocketBase (aktuelle Version), Custom Routes in `pb_hooks/` | ein Binary, SQLite, Admin-UI für Datenpflege inklusive |
| Frontend | React + Vite, TypeScript | vorhandene Erfahrung |
| Auslieferung | Frontend-Build nach `pb_public/` | gleiche Origin → Cookies ohne CORS-Gefummel, keine `VITE_PB_URL` nötig |
| Reverse Proxy | Caddy | automatisches TLS, Header, Log-Filter, Admin-Sperre |
| Betrieb | Docker Compose auf dem Hetzner-Server | |
| Schriften | **selbst gehostet** via `@fontsource` | keine Google-Fonts-Einbindung — in Deutschland abmahnfähig |

**Keine** externen CDNs, keine Tracker, keine Analytics.

---

## 3. Datenmodell

PocketBase-Collections. **Alle API-Rules bleiben leer** (= nur Superuser) — der Zugriff läuft
ausschließlich über die Custom Routes aus Abschnitt 5.

### `members`
| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | auto | |
| `name` | text, required | Anzeigename, z. B. „Marco" |
| `active` | bool, default true | inaktive Mitglieder erscheinen nicht mehr |
| `sort` | number | Reihenfolge in Listen |
| `token_hash` | text, unique, **indexed** | SHA-256 hex des Einladungstokens |
| `token_issued_at` | date | |
| `note` | text | nur für Admin sichtbar |

### `sessions`
| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | auto | |
| `member` | relation → members, cascade delete | |
| `sid_hash` | text, unique, indexed | SHA-256 hex der Session-ID |
| `started_at` | date | **nicht** `created` — so heißt bereits ein System-Feld von PocketBase |
| `last_seen` | date | |
| `ua_hash` | text | SHA-256 des User-Agent, nur zur Anzeige „Handy / Tablet" |

### `fixtures`
| Feld | Typ | Anmerkung |
|---|---|---|
| `date` | date, required | Datum + Anwurfzeit |
| `opponent_club` | text | „Bulls Eye" |
| `opponent_town` | text, required | „Celle" — steht groß in der Zielspalte |
| `is_home` | bool | |
| `venue` | text | „Sportsbar Celle" |
| `km` | number, default 0 | einfache Strecke |
| `meeting_point` | text | Treffpunkt für die Abfahrt |
| `needed_players` | number, default 4 | |
| `locked` | bool, default false | nach dem Spiel: keine Änderungen mehr |

### `responses`
| Feld | Typ | Anmerkung |
|---|---|---|
| `fixture` | relation → fixtures, cascade | |
| `member` | relation → members, cascade | |
| `status` | select: `yes` / `maybe` / `no` | |
| **Index** | UNIQUE(`fixture`, `member`) | |

### `rides` (Fahrer)
| Feld | Typ | Anmerkung |
|---|---|---|
| `fixture` | relation → fixtures, cascade | |
| `member` | relation → members, cascade | |
| `seats` | number, 1–6 | Plätze **ohne** Fahrer |
| **Index** | UNIQUE(`fixture`, `member`) | |

### `seat_claims` (Mitfahrer)
| Feld | Typ | Anmerkung |
|---|---|---|
| `fixture` | relation → fixtures, cascade | |
| `member` | relation → members, cascade | |
| `ride` | relation → rides, cascade | in welchem Auto — die Kapazität wird **pro Fahrer** geprüft, nicht gegen einen gemeinsamen Topf |
| **Index** | UNIQUE(`fixture`, `member`) | ein Mitglied sitzt pro Spieltag in genau einem Auto |

### `audit_log`
| Feld | Typ |
|---|---|
| `at` | date |
| `actor` | text — `member:<id>` oder `admin:<email>` |
| `action` | text — `response.set`, `ride.set`, `token.rotate`, … |
| `target` | text |
| `old_value` | text |
| `new_value` | text |

**Nicht gespeichert:** Telefonnummern, Adressen, Geburtsdaten, E-Mail-Adressen der Spieler.
Der Treffpunkt ist ein Freitext am Spieltag („Netto-Parkplatz"), keine Privatadresse.

---

## 4. Sicherheit — verbindliche Regeln

### R1 · Token nur gehasht speichern
Erzeugen: 16 Byte aus einem kryptografischen Zufallsgenerator, base64url-kodiert (22 Zeichen).
In der DB liegt ausschließlich `sha256(token)` als Hex. Der Klartext wird **einmal** in der
Admin-UI angezeigt und danach nie wieder ausgegeben — auch nicht in Logs oder Fehlermeldungen.

### R2 · Session-ID getrennt vom Token
Beim Einlösen wird eine **neue** 32-Byte-Zufalls-ID erzeugt (nicht vom Token abgeleitet) und
ebenfalls nur als Hash gespeichert. Cookie:

```
Set-Cookie: dz_sid=<klartext-sid>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000
```

### R3 · Identität kommt aus der Session, nie aus dem Request
Jede Schreiboperation ermittelt das Mitglied ausschließlich aus dem Cookie. Ein `member`-Feld
im Request-Body wird **verworfen**, nicht validiert.

```js
// verbindlich
const member = await memberFromSession(e)      // einzige Quelle
if (!member || !member.active) return 401
// alles aus dem Body außer den erlaubten Feldern wird ignoriert
```

### R4 · Whitelist statt Blacklist
`status` ∈ {`yes`,`maybe`,`no`}; `seats` ∈ 1…6; `fixture` muss existieren und `locked == false`.
Alles andere → 400 ohne Detailauskunft.

### R5 · Getrennte Router
`/api/*` (Mitglied) und `/admin/api/*` (Admin) sind **separate Handler-Gruppen** mit eigener
Middleware und eigenem Cookie-Namen. Kein gemeinsamer Handler mit `if (isAdmin)`.

### R6 · Keine Enumeration
Ungültiges Token → immer dieselbe Seite, HTTP 200, keine Unterscheidung zwischen „gibt es
nicht" und „ist inaktiv". Kein Endpunkt listet Mitglieder oder Spieltage ohne gültige Session.

### R7 · Rate Limits
| Route | Limit |
|---|---|
| `GET /j/:token` | 10 / min / IP |
| `PUT /api/*` | 60 / min / Session |
| `POST /admin/api/login` | 5 / min / IP, danach 15 min Sperre |

Umsetzung primär in Caddy, zusätzlich ein einfacher In-Memory-Zähler im Hook als zweite Linie.

### R8 · Token nicht in Logs
Caddy: für den Matcher `path /j/*` das URI-Feld aus dem Log entfernen. Die Anwendung loggt
Tokens niemals — auch nicht bei Fehlern.

**Achtung:** Das Token steht im **Pfad**, nicht in der Query. Ein Filter, der nur
Query-Parameter löscht (`request>uri query { delete * }`), lässt es unverändert im Log stehen.
Für `/j/*` deshalb `log_skip` setzen und diese Route gar nicht protokollieren.

### R9 · Header
```
X-Robots-Tag: noindex, nofollow
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
```
Dazu `robots.txt` mit `Disallow: /`.

### R10 · Linkvorschau
`GET /j/:token` darf keine fachliche Nebenwirkung haben (WhatsApp ruft die URL serverseitig
ab). Statische OpenGraph-Tags: Titel „Dartzentrale — Termine", keine personalisierten Daten.

Deshalb legt der GET **keine Session an** — er liefert nur das Formular, das Einlösen passiert im
`POST /api/session` (siehe Abschnitt 5). Der Crawler führt kein JS aus, erzeugt also weder Session
noch Datenbankschreibvorgang. Ein GET, der eine Session anlegt, verstößt gegen diese Regel.

### R11 · CSRF
`SameSite=Lax` plus Double-Submit-Token: Server setzt zusätzlich ein nicht-HttpOnly-Cookie
`dz_csrf`, der Client schickt den Wert als `X-CSRF-Token`-Header. Alle schreibenden Routen
prüfen die Übereinstimmung.

### R12 · Widerruf
Admin-Aktion „Neues Token" pro Mitglied:
1. neuen Hash schreiben (alter ist damit weg) → alle alten Links tot
2. alle `sessions` dieses Mitglieds löschen → alle Geräte ausgeloggt
3. Eintrag ins `audit_log`

### R13 · Admin-Zugang
- Login gegen PocketBase-Superuser (`_superusers`) — kein selbstgebautes Passwort-Handling.
  Der Hook nimmt das Ergebnis entgegen und legt es in ein HttpOnly-Cookie `dz_admin`
  (`Path=/admin`, Laufzeit 12 h). Der Token landet **nicht** in `localStorage`.
- **MFA für den Superuser aktivieren.**
- `/admin` und `/_/` sind im Reverse Proxy **nicht öffentlich erreichbar** — nur über
  WireGuard/Tailscale oder eine IP-Allowlist. Das ist die wirksamste Einzelmaßnahme:
  ein Fehler im Admin-Code ist dann von außen nicht ausnutzbar.

### R14 · Was das Modell nicht leistet
Wer den Link eines Mitglieds weitergibt, ist dieses Mitglied. Das ist der bewusste Preis für
„keiner meldet sich an". Abgemildert durch `audit_log` und R12. **Optional später:**
vierstellige PIN pro Mitglied als zweiter Faktor.

---

## 5. API

Alle Antworten JSON, außer `/j/:token`.

### Mitglied

```
GET  /j/:token
     → KEINE fachliche Nebenwirkung (R10). Liefert nur eine kleine HTML-Seite mit
       <form method="POST" action="/api/session">, Token im Hidden-Feld, per JS sofort
       abgeschickt; sichtbarer „Öffnen"-Knopf als Fallback ohne JS.
     → Das Token wird hier NICHT nachgeschlagen — die Antwort ist für jedes Token gleich.

POST /api/session          { token }
     → sha256 bilden, in members.token_hash suchen
     → Treffer & active: Session anlegen, dz_sid + dz_csrf setzen, 302 auf /
     → sonst: HTML-Seite „Link ungültig — frag den Mannschaftsführer", HTTP 200
     → einzige schreibende Route ohne CSRF-Prüfung (sie stellt die Session ja erst her)

GET  /api/me
     → { id, name, captain:false }  |  401

GET  /api/board
     → {
         members: [{id, name}],
         fixtures: [{
           id, date, time, opponent_club, opponent_town, is_home, venue, km,
           meeting_point, needed_players, locked,
           departure,                     // berechnet, s. Abschnitt 6.3
           responses: { <memberId>: "yes"|"maybe"|"no" },
           rides:     { <memberId>: seats },
           seats_taken: [ <memberId> ]
         }]
       }
     Ein Aufruf liefert alles — bei 8 Spielern und ~20 Spieltagen völlig unkritisch.

PUT  /api/response/:fixtureId   { status: "yes"|"maybe"|"no"|null }
PUT  /api/ride/:fixtureId       { driving: bool, seats: 1..6 }
PUT  /api/seat/:fixtureId       { riding: bool }
POST /api/logout                → Session löschen, Cookie leeren
```

Fehlerfälle: 401 ohne Session, 403 bei `locked`, 400 bei ungültigen Werten, 409 wenn ein
Mitfahrplatz belegt ist.

### Admin

```
POST   /admin/api/login          { email, password, otp? }  → dz_admin Cookie
POST   /admin/api/logout
GET    /admin/api/fixtures
POST   /admin/api/fixtures
PATCH  /admin/api/fixtures/:id
DELETE /admin/api/fixtures/:id
GET    /admin/api/members
POST   /admin/api/members
PATCH  /admin/api/members/:id
POST   /admin/api/members/:id/rotate-token   → { token: "<Klartext, einmalig>" }
PUT    /admin/api/response/:fixtureId/:memberId    // Korrektur durch den Kapitän
GET    /admin/api/audit?limit=100
```

---

## 6. Frontend

### 6.1 Routen
| Pfad | Inhalt |
|---|---|
| `/` | Abfahrtsplan. Ohne Session: „Link ungültig"-Seite |
| `/admin` | Login, danach Spieltage / Mitglieder / Protokoll |

### 6.2 Design-Tokens — Abfahrtsplan

```
Farben
  gelb        #F5B800    Papier für Auswärtsspiele
  gelbTief    #DCA400
  papier      #FBF8F0    Papier für Heimspiele
  tinte       #17150F    Schrift, Linien, Kopfbalken
  grau        #6E6A5E    Sekundärtext
  rot         #C1121F    Warnung: kein Fahrer, keine Antwort, km-Angabe
  stempel     #1F4E8C    Stempel „KOMPLETT"

Schriften (selbst gehostet via @fontsource)
  Barlow Condensed 600/700   Kopfbalken, Zeiten, Zielorte, Buttons
  Barlow 400/500/600         Fließtext
  IBM Plex Mono 400/500      Kleingedrucktes, Datum, Zahlen, Legende

Regeln
  · Ecken: 0 px. Keine Schatten, keine Verläufe.
  · Linien: 2 px durchgezogen in `tinte`; innerhalb einer Zeile 1,5 px gestrichelt.
  · Papierlogik: Auswärts = gelb, Heim = weiß. Diese Codierung ist die Hauptorientierung
    beim Scrollen und darf nicht durch andere Farbflächen verwässert werden.
  · Zielorte und Buttons in Versalien, `letter-spacing` 0.02–0.04em.
```

### 6.3 Abfahrtszeit
```
fahrzeit_min = km / 80 * 60 + 25          // 25 min Puffer
abfahrt      = anwurf − round(fahrzeit_min auf 5 min)
```
Bei Heimspielen entfällt die Abfahrt; die linke Spalte zeigt dann den Anwurf mit dem Label
„ANWURF" statt „ABFAHRT". Die Formel gehört ins Backend, damit alle dasselbe sehen.

### 6.4 Aufbau

```
┌────────────────────────────────────────┐
│ ABFAHRT              Bezirksliga 26/27 │  Kopfbalken, tinte auf gelb
├────────────────────────────────────────┤
│ 17:55 │ Sa 29.08.        52 km         │  ← Zeitspalte 96 px, 2 px Trennlinie
│ ABFAHR│ CELLE                          │
│       │ Bulls Eye · Sportsbar Celle    │
│       │ 4/4 zugesagt · 2 Plätze frei   │
│       │                    [KOMPLETT]  │  ← Stempel, −7°, nur wenn vollzählig
├───────┴────────────────────────────────┤
│ (aufgeklappt)                          │
│ DEINE RÜCKMELDUNG                      │
│ [ DABEI ][ UNSICHER ][ KANN NICHT ]    │
│ FAHRDIENST                             │
│ [ICH FAHRE] [− 4 P +]   [MITFAHREN]    │
│ ▮▮▯▯ 2/4 belegt                        │
│ Dabei / Unsicher / Keine Antwort       │
└────────────────────────────────────────┘
```

- Zeile antippen klappt auf, immer nur eine offen (Akkordeon).
- Der Stempel setzt sich mit einer kurzen Skalier-Animation auf; `prefers-reduced-motion`
  respektieren.
- Alles ab 320 px Breite bedienbar, Tap-Ziele mindestens 44 px hoch.
- Sichtbarer Fokusrahmen für Tastaturbedienung.

### 6.5 Zustand & Fehlerverhalten
- Optimistisches Update beim Tippen, bei Fehler zurückrollen und eine Zeile Klartext zeigen:
  „Nicht gespeichert — nochmal antippen." Keine Modals, keine Toasts, die wegfliegen.
- Bei 401 auf die „Link ungültig"-Seite mit dem Hinweis, den Link erneut zu öffnen.
- Leerer Spielplan: „Noch keine Termine eingetragen." — kein leeres Gerüst.

### 6.6 Sprache
Deutsch, Satzbau kurz, Du-Form. Buttons benennen die Handlung: „Dabei", nicht „Absenden".

---

## 7. Deployment

### 7.1 Compose

```yaml
services:
  pocketbase:
    image: <pocketbase-image>            # oder eigenes Dockerfile mit dem Release-Binary
    restart: unless-stopped
    volumes:
      - ./pb_data:/pb/pb_data
      - ./pb_hooks:/pb/pb_hooks
      - ./pb_public:/pb/pb_public
    expose: ["8090"]                     # KEIN ports: — nur intern erreichbar
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
volumes: { caddy_data: {} }
```

### 7.2 Caddyfile (Gerüst)

```
dart.example.de {
  encode zstd gzip

  header {
    X-Robots-Tag "noindex, nofollow"
    Referrer-Policy "no-referrer"
    Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    -Server
  }

  # Admin nur aus dem VPN
  @admin path /admin* /_/*
  handle @admin {
    @notvpn not remote_ip 10.0.0.0/24
    respond @notvpn 404
    reverse_proxy pocketbase:8090
  }

  # Token-Route: gar nicht protokollieren. Das Token steht im PFAD — ein Query-Filter
  # (wie unten) würde es NICHT entfernen.
  @join path /j/*
  handle @join {
    log_skip
    reverse_proxy pocketbase:8090
  }

  handle { reverse_proxy pocketbase:8090 }

  log {
    output file /var/log/caddy/dz.log
    format filter { request>uri query { delete * } }
  }
}
```
**Rate Limiting** läuft primär über den in PocketBase eingebauten Rate-Limiter (Einstellungen →
Rate limiting) — ein bewegliches Teil weniger als das `caddy-ratelimit`-Plugin, und es greift auch
lokal ohne Caddy. Reichen die Regeln pro Route nicht, kommt der In-Memory-Zähler im Hook als zweite
Linie dazu. Beim Bau gegen die tatsächlich installierte PocketBase-Version prüfen und dokumentieren.

### 7.3 Server-Härtung
- `ufw`: nur 22 (besser: nur über VPN), 80, 443
- SSH ausschließlich mit Key, `PermitRootLogin no`, `PasswordAuthentication no`
- `fail2ban` für SSH
- `unattended-upgrades` für Systempakete; PocketBase-Releases manuell verfolgen

### 7.4 Backup
- Nächtlich: PocketBase-Backup erzeugen, verschlüsseln, **außerhalb des Servers** ablegen
  (Hetzner Storage Box oder ins Homelab)
- Aufbewahrung 30 Tage
- **Restore einmal vollständig testen.** Ein ungetestetes Backup ist kein Backup.

---

## 8. Datenschutz

- Gespeichert werden Name, Verfügbarkeit, Fahrbereitschaft. Sonst nichts.
- Löschjob: `fixtures` und abhängige Datensätze älter als 12 Monate automatisch entfernen.
- `audit_log` nach 90 Tagen kürzen.
- Der Mannschaft einmal mitteilen, was gespeichert wird und wo der Server steht.
- Gehört die Mannschaft zu einem eingetragenen Verein, gehört die Anwendung ins
  Verarbeitungsverzeichnis.
- Schriften und alle Assets selbst hosten — keine Requests an Dritte.

---

## 9. Erinnerungen

Kein WhatsApp-Zugriff, weder offiziell noch über inoffizielle Bibliotheken (Sperrrisiko für
die private Nummer, Verstoß gegen die Nutzungsbedingungen).

Stattdessen: Cronjob prüft täglich, welche Spieltage in 7 bzw. 2 Tagen anstehen und noch
offene Rückmeldungen oder keinen Fahrer haben, und schickt eine Nachricht **an den Kapitän**
(ntfy oder Telegram-Bot) mit fertig formuliertem Text zum Kopieren in die Gruppe.

---

## 10. Umsetzung in Schritten

Nach jedem Schritt lauffähig und prüfbar.

**Schritt 1 — Gerüst**
Repo, Docker Compose, PocketBase startet, Caddy davor, TLS steht, `/` liefert eine leere Seite.
*Fertig, wenn:* HTTPS erreichbar, `/_/` von außen 404.

**Schritt 2 — Datenmodell**
Collections aus Abschnitt 3 als Migration anlegen, alle Rules leer. Seed-Skript mit 8 Mitgliedern
und 6 Spieltagen.
*Fertig, wenn:* `curl https://.../api/collections/fixtures/records` liefert 401/403.

**Schritt 3 — Token & Session**
`GET /j/:token` (nur Formular), `POST /api/session`, Session-Middleware, `/api/me`, `/api/logout`.
Admin-CLI oder -Route zum Erzeugen eines Tokens.
*Fertig, wenn:* Testfälle T1–T4 und T13 aus Abschnitt 11 bestehen.

**Schritt 4 — Mitglieder-API**
`/api/board` und die drei `PUT`-Routen, inklusive R3, R4, CSRF.
*Fertig, wenn:* T5–T7 bestehen.

**Schritt 5 — Frontend Abfahrtsplan**
Design nach 6.2–6.5, gegen die echten Endpunkte. Schriften selbst gehostet.
*Fertig, wenn:* auf 320 px bedienbar, Tastaturfokus sichtbar, reduzierte Bewegung respektiert.

**Schritt 6 — Admin**
Login mit MFA, Spieltage und Mitglieder pflegen, „Neues Token", Protokollansicht.
*Fertig, wenn:* T8–T9 bestehen.

**Schritt 7 — Härtung und Betrieb**
Header, Rate Limits, Log-Filter, Backup mit getestetem Restore, Löschjob, Erinnerungs-Cron.

**Schritt 8 — Echtdaten**
Spielplan-PDF importieren, Tokens erzeugen, per Einzelchat verteilen.

---

## 11. Testfälle

Vor „fertig" alle durchlaufen.

| # | Prüfung | Erwartung |
|---|---|---|
| T1 | `POST /api/session` mit gültigem Token | 302 auf `/`, `dz_sid` gesetzt, Token nicht in der Ziel-URL |
| T2 | `POST /api/session` mit ungültigem Token | HTTP 200, generische Seite, kein Cookie, kein Hinweis auf den Grund |
| T3 | `GET /api/board` ohne Cookie | 401, kein Datenleck im Body |
| T4 | Token rotieren, alten Link öffnen | ungültig; auch bestehende Session des Mitglieds ist tot |
| T5 | `PUT /api/response/:id` mit fremdem `member` im Body | eigener Datensatz geändert, fremder unverändert |
| T6 | `PUT` mit `status: "vielleicht"` oder `seats: 99` | 400, nichts gespeichert |
| T7 | `PUT` auf `locked`-Spieltag | 403 |
| T8 | `/admin` von außerhalb des VPN | 404 |
| T9 | 6× falsches Admin-Passwort | gesperrt, konstante Antwortzeit, kein Hinweis auf Existenz |
| T10 | Access-Log nach `/j/`-Aufruf durchsuchen | kein Token im Klartext |
| T11 | Link in WhatsApp einfügen | Vorschau „Dartzentrale — Termine", nichts Personalisiertes |
| T12 | Backup einspielen | Datenstand vollständig wiederhergestellt |
| T13 | `GET /j/<gültig>` allein aufrufen (wie der Crawler, ohne JS) | keine neue Zeile in `sessions`, kein Cookie — Beleg für R10 |
