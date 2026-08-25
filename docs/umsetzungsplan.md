# Dartzentrale — Umsetzungsplan

Terminplanung und Fahrdienst für eine Dartmannschaft (8–10 Personen).
Design: **Abfahrtsplan** (Fahrplanaushang-Optik).
Mitglieder ohne Anmeldung über Token-Link, Admin mit Login.

Dieses Dokument ist die vollständige Vorgabe für die Umsetzung. Wo eine Entscheidung schon
gefallen ist, steht sie hier als Vorgabe, nicht als Vorschlag.

> **Stand 2026-08-23.** Gegenüber der Erstfassung korrigiert: `GET /j/:token` legt keine Session
> mehr an (R10, Abschnitt 5), `seat_claims` bekommt eine Relation auf `rides`, und der
> Caddy-Log-Filter für `/j/*` heißt `log_skip` statt eines Query-Filters (R8). Rate Limiting läuft
> primär über PocketBase statt über ein Caddy-Plugin. Beim Bau von Schritt 2 kamen die drei
> PocketBase-Eigenheiten in Abschnitt 3 dazu (Regeln, Defaultwerte, `users`-Collection).
> Betriebsziel bis auf Weiteres: lokal ohne Docker entwickeln und im Homelab unter dem dort
> vergebenen Namen testen — siehe `README.md`. Der Hetzner-Betrieb aus Abschnitt 7 bleibt das
> Fernziel.
>
> **Nachtrag 2026-08-25.** Abschnitt 7.1 beschrieb bis hierher zwei Services mit Bind-Mounts —
> das entspricht dem gebauten Stand nicht mehr und ist auf das tatsächliche Betriebsmodell
> umgeschrieben: ein Image, ein Service, kein Host-Port, zwei Compose-Varianten je nachdem, ob
> ein Reverse Proxy schon da ist. Die Auslieferung enthält außerdem keine Daten und keine Konten
> mehr; das Seed-Skript aus Schritt 2 ist ersatzlos entfallen. Neu als offener Punkt: R13 hat im
> öffentlichen Betrieb kein Netz, auf das es sich stützen kann (7.2.1).

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
| Reverse Proxy | Caddy als mitgelieferte Vorlage, aber austauschbar | automatisches TLS, Header, Log-Filter, Admin-Sperre — wer Traefik oder nginx betreibt, hängt sie stattdessen davor |
| Betrieb | Docker Compose, ein Container | überall gleich: Homelab zum Testen, Server für den echten Betrieb (Abschnitt 7) |
| Schriften | **selbst gehostet** via `@fontsource` | keine Google-Fonts-Einbindung — in Deutschland abmahnfähig |

**Keine** externen CDNs, keine Tracker, keine Analytics.

---

## 3. Datenmodell

PocketBase-Collections. **Alle API-Rules bleiben leer** (= nur Superuser) — der Zugriff läuft
ausschließlich über die Custom Routes aus Abschnitt 5.

Drei Eigenheiten von PocketBase, die beim Anlegen zu beachten sind:

- **„Leer" heißt `null`, nicht `""`.** Eine Regel, die auf den Leerstring gesetzt ist, bedeutet in
  PocketBase „jeder, auch ohne Login". Gemeint ist hier das Gegenteil: Regel gar nicht setzen.
  Wer das verwechselt, legt die gesamte Datenbank offen.
- **Es gibt keine Defaultwerte.** PocketBase-Felder kennen kein `default`. `active: true` und
  `needed_players: 4` sind deshalb nichts, was das Schema durchsetzt — sie müssen beim Schreiben
  gesetzt werden. Bei `km: 0` und `locked: false` fällt es nicht auf, weil das die Nullwerte sind.
  Ein Mitglied, das ohne `active` angelegt wird, ist sofort inaktiv und kommt nicht herein.
- **Die mitgelieferte `users`-Collection löschen.** PocketBase legt beim ersten Start eine
  Beispiel-Auth-Collection an, deren `createRule` der Leerstring ist — offene Selbstregistrierung.
  Diese App benutzt sie nirgends (Mitglieder haben eigene Sessions, der Kapitän meldet sich gegen
  `_superusers` an), also gehört sie in der Baseline-Migration entfernt.

### `members`
| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | auto | |
| `name` | text, required | Anzeigename des Mitglieds |
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
| `created` | autodate | als `autodate`-Feld anlegen, nicht als `date` — PocketBase befüllt es dann selbst |
| `last_seen` | date | wird bei jedem Zugriff des Mitglieds fortgeschrieben |
| `ua_hash` | text | SHA-256 des User-Agent, nur zur Anzeige „Handy / Tablet" |

### `fixtures`
| Feld | Typ | Anmerkung |
|---|---|---|
| `date` | date, required | Datum + Anwurfzeit |
| `opponent_club` | text | Name des gegnerischen Vereins — steht groß in der Zeile; fehlt er, rückt der Ort nach |
| `opponent_town` | text, required | Ort des Gegners — steht klein unter dem Vereinsnamen |
| `is_home` | bool | |
| `venue` | text | Spielstätte vor Ort |
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

### `admin_sessions`
Eigene Tabelle, nicht `sessions` mit einem Sonderfall. R5 verlangt getrennte Router; getrennte
Router mit gemeinsamer Sitzungstabelle wären eine halbe Trennung. Dazu kommt ein handfester
Grund: `sessions.member` ist eine Pflicht-Relation — eine Sitzung ohne Mitglied passt dort nicht
hinein.

| Feld | Typ | Anmerkung |
|---|---|---|
| `sid_hash` | text, unique, indexed | SHA-256 hex der Sitzungs-ID |
| `email` | text, required | Superuser-Adresse, steht so auch im Protokoll |
| `created` | autodate | die 12 Stunden aus R13 werden dagegen geprüft |
| `last_seen` | date | |

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
| Route | Limit | gezählt wird |
|---|---|---|
| `POST /api/session` | 10 / min / IP | **nur Fehlversuche** |
| `PUT /api/*` | 60 / min / Session | jede Anfrage |
| `POST /admin/api/login` | 5 / min / IP, danach 15 min Sperre | jede Anfrage, Erfolg setzt zurück |

**Beim Einlösen dürfen nicht Anfragen gezählt werden, sondern nur Fehlversuche.** Eine Mannschaft
sitzt im Vereinsheim hinter EINER öffentlichen IP. Verschickt der Kapitän die Links und tippen
acht Leute im selben WLAN darauf, wären die letzten sonst ausgesperrt — an ihrem eigenen,
gültigen Link. Wer ein gültiges Token hat, rät nicht; ein Treffer setzt den Zähler zurück.

Umsetzung im Hook (`pb_hooks/ratelimit.js`), nicht in Caddy: das dortige Rate Limiting braucht
das `caddy-ratelimit`-Plugin, das in keinem Standard-Image steckt, und im Entwicklungsbetrieb
steht überhaupt kein Caddy davor. Der Zähler liegt im Arbeitsspeicher — nach einem Neustart sind
alle Sperren weg, und die Zahl der Einträge ist begrenzt, damit niemand den Prozess mit vielen
IP-Adressen vollschreibt.

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
  Der Hook legt eine eigene Sitzung in `admin_sessions` an und setzt ein HttpOnly-Cookie
  `dz_admin` (`Path=/admin`, Laufzeit 12 h) sowie das lesbare `dz_admin_csrf` für R11. Der
  PocketBase-Token landet **nirgends** im Browser, weder im Cookie noch in `localStorage`.
  Die 12 Stunden werden serverseitig gegen `admin_sessions.created` geprüft, nicht nur über die
  Cookie-Lebensdauer — ein abgegriffener Cookie-Wert wäre sonst unbegrenzt gültig.
- **Was das Modell hier nicht leistet:** die Antwortzeit verrät, ob eine Superuser-Adresse
  existiert (bei bekannter Adresse läuft eine bcrypt-Prüfung, bei unbekannter nicht). Das
  schließt erst die Sperre oben: fünf Versuche, dann eine Viertelstunde Ruhe. Zusammen mit der
  Netzsperre unten ist das der Punkt, an dem sich weiterer Aufwand nicht mehr lohnt.
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
         me: <memberId>,                  // wer gerade angemeldet ist
         members: [{id, name}],           // nur aktive, nach sort
         fixtures: [{
           id, date, opponent_club, opponent_town, is_home, venue, km,
           meeting_point, needed_players, locked,
           departure,                     // berechnet, s. 6.3 — null bei Heimspiel
           responses:   { <memberId>: "yes"|"maybe"|"no" },
           rides:       [{ id, member, seats, taken }],   // taken = belegte Plätze DIESES Autos
           seat_claims: { <memberId>: <rideId> }          // wer bei wem mitfährt
         }]
       }
     Ein Aufruf liefert alles — bei 8 Spielern und ~20 Spieltagen völlig unkritisch.

PUT  /api/response/:fixtureId   { status: "yes"|"maybe"|"no"|null }   null nimmt zurück
PUT  /api/ride/:fixtureId       { driving: bool, seats: 1..6 }
PUT  /api/seat/:fixtureId       { riding: bool, ride: <rideId> }
POST /api/logout                → Session löschen, Cookie leeren
```

Fehlerfälle: 401 ohne Session, 403 bei `locked` und bei fehlender CSRF-Kopfzeile, 400 bei
ungültigen Werten, 409 wenn das gewählte Auto voll ist.

Zwei Fälle, in denen der Server bewusst NICHT entscheidet:

- **Plätze unter die Belegung senken** → 409. Das ginge nur, indem der Server einen Mitfahrer
  hinauswirft; wer aussteigt, klärt der Fahrer.
- **Fahrt ganz zurückziehen** → die Mitfahrer dieses Autos verschwinden mit (cascadeDelete). Sie
  stehen dann wieder ohne Auto da, was der Wahrheit entspricht — alles andere wäre eine stille
  Lüge im Fahrplan.

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

**Auf gelbem Papier sind `grau` und `rot` zu schwach.** Gemessen: `grau` auf `gelb` erreicht nur
3,0:1, `rot` nur 3,5:1 — Fließtext braucht 4,5:1. Ausgerechnet Auswärtsspiele sind gelb, also
genau dort, wo „kein Fahrer" stehen muss. Für gelbes Papier gibt es deshalb zwei abgeleitete
Töne aus derselben Farbfamilie:

```
  grauAufGelb  #584400    5,2:1 auf gelb
  rotAufGelb   #8E0D17    5,3:1 auf gelb
```

Die Zeile bindet `--grau` und `--rot` auf diese Werte um; Komponenten müssen nichts davon wissen.

**Rot ist ausschließlich Warnfarbe.** „Heim" steht in `grau`, nicht in Rot — nur die Entfernung,
„kein Fahrer" und „du fehlst noch" bekommen Rot. Sonst gewöhnt sich das Auge daran.

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
│ SPIELTAGE            Bezirksliga 26/27 │  Kopfbalken, tinte auf gelb
├────────────────────────────────────────┤
│ 17:55 │ Sa 29.08.        52 km         │  ← Zeitspalte 96 px, 2 px Trennlinie
│ ABFAHR│ GEGNERVEREIN                   │  ← der Gegner, danach wird gesucht
│       │ Ort · Spielstätte              │
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

- Groß steht der **Gegner**; der Ort rückt in die Nebenzeile. Ohne Vereinsnamen tritt der Ort
  an seine Stelle, damit die Zeile nie ohne Kopf dasteht.
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

### 6.7 Datum und Uhrzeit
Zwei Ansichten, zwei Regeln:

- **Aushang** (`/`): feste Schreibweise „Sa 29.08." und „17:55", unabhängig von der
  Browsersprache — der Aushang sieht auf jedem Gerät gleich aus und passt in die 96 px schmale
  Zeitspalte.
- **Kapitänsansicht** (`/admin`): Datum und Uhrzeit folgen den Systemeinstellungen
  (`Intl.DateTimeFormat(undefined, …)`) — Reihenfolge, Trenner und 12-/24-Stunden-Zählung.

In der Datenbank steht **UTC**. Das Eingabefeld `datetime-local` arbeitet dagegen in Ortszeit;
zwischen beiden wird umgerechnet (`fuerEingabe` / `ausEingabe` in `format.ts`). Wer die
Zeichenkette stattdessen durchreicht, verschiebt den Anwurf bei jedem Speichern um den
Zonenversatz.

---

## 7. Deployment

### 7.1 Betriebsmodell

Die App ist nur über das Internet sinnvoll zu betreiben — Terminabsprache passiert unterwegs, nicht
im Vereins-WLAN. Betrieben wird deshalb ausschließlich in Docker, und zwar überall gleich: dieselbe
Datei, dasselbe Image, ob im Homelab oder auf einem Server.

**Ein Service.** PocketBase liefert das Frontend aus `pb_public` gleich mit — eine Origin, damit die
Cookies aus R2/R11 ohne CORS auskommen. Migrationen, Hooks und der Frontend-Build liegen **im Image**,
nicht in Bind-Mounts: relative Mounts greifen je nach Arbeitsverzeichnis nicht und liefern
stillschweigend leere Ordner. Persistent ist genau ein Volume, `pb_data` — SQLite, Uploads, Backups.

**Kein `ports:`, nur `expose: ["8090"]`.** Ein veröffentlichter Host-Port wäre Klartext-HTTP am
TLS-Proxy vorbei und legte `/admin` und `/_/` aus R13 offen. Der einzige Weg hinein führt über den
Reverse Proxy, der sich ans Netz `mannschaftsplan` hängt und den Dienst als
`http://mannschaftsplan:8090` erreicht. Nebenbei ist das die Bedingung dafür, dass der Stack neben
anderen Diensten auf demselben Host koexistiert, ohne sich um Ports zu streiten.

**Zwei Varianten**, geschnitten danach, ob der Stack seinen eigenen Proxy mitbringt — nicht danach,
wer ihn betreibt:

| Datei | Für wen | Was drin ist | Stand |
|---|---|---|---|
| `docker-compose.yaml` | Betreiber mit vorhandenem Proxy (Traefik, nginx, Caddy) | nur die App, kein Host-Port | da |
| `+ docker-compose.caddy.yaml` | nackter Server, auf dem noch nichts läuft | zusätzlich Caddy mit ACME auf 80/443 | **offen, Schritt 9** |

```bash
docker compose up -d                                                       # eigener Proxy
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml up -d   # mit Caddy
```

Der App-Service ist dabei **einmal** definiert; das Overlay stellt nur den Proxy daneben. Zwei
vollständige Compose-Dateien wären zwei Wahrheiten, die auseinanderlaufen.

Das **Homelab ist Testumgebung, kein Betrieb.** Es fährt die Basisdatei hinter dem dort bereits
vorhandenen Caddy — also genau die Konfiguration, die auch ein Betreiber mit eigenem Proxy fährt.
Damit testet das Homelab einen echten Auslieferungsweg und keinen Sonderfall. Was es
prinzipbedingt nicht abdeckt: die Absicherung aus R13, die sich dort aufs LAN stützt.

`docker-compose.yaml` liegt in der **Repo-Wurzel**, nicht in `deploy/`: der Build-Kontext ist die
Wurzel, und ein Kontext oberhalb der Compose-Datei (`context: ..`) bricht, sobald das Werkzeug
relative Pfade gegen das Projektverzeichnis auflöst statt gegen den Ort der Datei — Arcane tut das.

### 7.2 Caddyfile (Gerüst)

Zwei Vorlagen liegen in `deploy/`: `Caddyfile` für den öffentlichen Betrieb mit eigener Domain und
ACME, `Caddyfile.homelab.example` als Block für einen bereits vorhandenen Caddy. Wer nginx oder
Traefik betreibt, bildet dieselben vier Punkte dort nach — Kopfzeilen (R9), Admin-Sperre (R13),
`/j/*` nicht protokollieren (R8), Query-Filter im Log.

```
<deine-domain> {
  encode zstd gzip

  header {
    X-Robots-Tag "noindex, nofollow"
    Referrer-Policy "no-referrer"
    Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    -Server
  }

  # Admin nur aus dem VPN bzw. LAN. Der Bereich ist ein PLATZHALTER — siehe die offene
  # Frage unter 7.2.1.
  @admin path /admin* /_/*
  handle @admin {
    @notvpn not remote_ip <dein-vpn-bereich>
    respond @notvpn 404
    reverse_proxy mannschaftsplan:8090
  }

  # Token-Route: gar nicht protokollieren. Das Token steht im PFAD — ein Query-Filter
  # (wie unten) würde es NICHT entfernen.
  @join path /j/*
  handle @join {
    log_skip
    reverse_proxy mannschaftsplan:8090
  }

  handle { reverse_proxy mannschaftsplan:8090 }

  log {
    output file /var/log/caddy/mannschaftsplan.log
    format filter { request>uri query { delete * } }
  }
}
```

#### 7.2.1 Offen: R13 ohne LAN

R13 stützt sich darauf, dass `/admin` und `/_/` nur aus einem vertrauenswürdigen Netz erreichbar
sind. Im Homelab ist das das LAN. Auf einem öffentlichen Server gibt es beides nicht, und ein
beliebiger Betreiber hat kein VPN. Damit steht die wirksamste Einzelmaßnahme der App im
öffentlichen Betrieb ohne Fundament da.

Zur Wahl stehen: Standard geschlossen (ohne gesetzten Bereich antwortet `/admin` für alle mit 404,
Öffnen ist ein bewusster Eintrag) oder Standard offen (es schützen nur das Superuser-Passwort und
die Sperre nach sechs Fehlversuchen, T9). **Bis zur Entscheidung bleibt der Bereich in beiden
Vorlagen ein Platzhalter, den der Betreiber ausfüllen muss.** Zu entscheiden, bevor die App
öffentlich angeboten wird.
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
`scripts/backup.sh` erledigt das: lässt PocketBase ein Backup erzeugen, holt es, prüft dass es
wirklich ein ZIP ist, verschlüsselt es mit GPG und räumt Stände älter als 30 Tage weg. Gehört in
einen Cronjob auf einer **anderen** Maschine als dem Server — ein Backup neben der Datenbank ist
keins.

```
0 3 * * *  PB_URL=https://dart.example.de PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… \
           BACKUP_DIR=/backup/mannschaftsplan GPG_EMPFAENGER=… /pfad/zu/backup.sh
```

**Restore einmal vollständig testen.** Ein ungetestetes Backup ist kein Backup. Der Weg:

```
POST /api/backups/<datei>/restore    (Superuser-Token)
```

PocketBase startet dabei neu. Danach prüfen, ob der erwartete Datenstand da ist **und** ob die
Anwendung weiterläuft — Hooks, Migrationen und die Auslieferung aus `pb_public` müssen den
Neustart überstehen.

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
Collections aus Abschnitt 3 als Migration anlegen, alle Rules leer. Keine Testdaten im Repo — die
Auslieferung bringt weder Mitglieder noch Spieltage noch Konten mit.
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

**Schritt 9 — Auslieferbar für Fremde**
Das Caddy-Overlay aus 7.1 bauen (`docker-compose.caddy.yaml`), Domain und Allowlist über
Umgebungsvariablen konfigurierbar machen, damit niemand eine Konfigurationsdatei editieren muss,
und die offene Frage aus 7.2.1 entscheiden.
*Fertig, wenn:* ein nackter Server allein mit den Werten aus einer `.env` zum laufenden HTTPS-Dienst
wird — und der Weg mit vorhandenem Proxy unverändert weiter funktioniert.

---

## 11. Testfälle

Vor „fertig" alle durchlaufen. Was mit **automatisiert** markiert ist, steckt in
`scripts/api-tests.mjs` und läuft in der CI — sowohl gegen ein nacktes PocketBase als auch gegen
das gebaute Container-Image. Der Rest bleibt Handarbeit, weil er einen Proxy, einen echten
Messenger oder ein Auge braucht.

**Reihenfolge beachten:** T9 sperrt den Login für diese IP eine Viertelstunde. Der Testlauf legt
ihn deshalb ans Ende, und ein zweiter Lauf braucht einen PocketBase-Neustart — der Zähler liegt
nur im Arbeitsspeicher.

| # | Prüfung | Erwartung |
|---|---|---|
| T1 | `POST /api/session` mit gültigem Token | 302 auf `/`, `dz_sid` gesetzt, Token nicht in der Ziel-URL |
| T2 | `POST /api/session` mit ungültigem Token | HTTP 200, generische Seite, kein Cookie, kein Hinweis auf den Grund |
| T3 | `GET /api/board` ohne Cookie | 401, kein Datenleck im Body |
| T4 | Token rotieren, alten Link öffnen | ungültig; auch bestehende Session des Mitglieds ist tot |
| T5 | `PUT /api/response/:id` mit fremdem `member` im Body | eigener Datensatz geändert, fremder unverändert |
| T6 | `PUT` mit `status: "vielleicht"` oder `seats: 99` | 400, nichts gespeichert |
| T7 | `PUT` auf `locked`-Spieltag | 403 |
| T8a | `/admin/api` ohne Kapitänssitzung | 404, nicht 401 oder 403 (R6) — **automatisiert** |
| T8b | `/admin/api` mit einer MITGLIEDER-Sitzung | 404 (R5) — **automatisiert** |
| T8c | `/admin` von außerhalb des VPN bzw. LAN | 404 — Aussage über den Proxy, **Handprüfung** |
| T9 | 6× falsches Admin-Passwort | gesperrt, auch für das richtige Passwort; kein Hinweis auf Existenz |
| T10 | Access-Log nach `/j/`-Aufruf durchsuchen | kein Token im Klartext |
| T11 | Link in WhatsApp einfügen | Vorschau „Dartzentrale — Termine", nichts Personalisiertes |
| T12 | Backup einspielen | Datenstand vollständig wiederhergestellt |
| T13 | `GET /j/<gültig>` allein aufrufen (wie der Crawler, ohne JS) | keine neue Zeile in `sessions`, kein Cookie — Beleg für R10 |
