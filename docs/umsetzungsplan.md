# Mannschaftsplan — Umsetzungsplan

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
> Betriebsziel bis auf Weiteres: lokal ohne Docker entwickeln — siehe `README.md`. Der Betrieb auf
> einem eigenen Server aus Abschnitt 7 bleibt das Fernziel.
>
> **Nachtrag 2026-08-25.** Abschnitt 7.1 beschrieb bis hierher zwei Services mit Bind-Mounts —
> das entspricht dem gebauten Stand nicht mehr und ist auf das tatsächliche Betriebsmodell
> umgeschrieben: ein Image, ein Service, kein Host-Port, zwei Compose-Varianten je nachdem, ob
> ein Reverse Proxy schon da ist. Geprüft wird in zwei Umgebungen — lokal samt CI, und für alles
> Übrige direkt auf einem öffentlich erreichbaren Server. Ein Aufbau im eigenen Heimnetz ist als
> Prüfstufe **entfallen**: er deckt exklusiv nur T10 ab, kann T11 prinzipbedingt nicht und prüft
> die Proxy-Konfiguration, die im Betrieb gar nicht verwendet wird. Die Auslieferung enthält
> außerdem keine Daten und keine Konten mehr; das Seed-Skript aus Schritt 2 ist ersatzlos
> entfallen. Neu als offener Punkt: R13 hat im öffentlichen Betrieb kein Netz, auf das es sich
> stützen kann (7.2.1).

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
| Betrieb | Docker Compose, ein Container | überall gleich — Prüfserver wie Betrieb, siehe Abschnitt 7 |
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

### `settings`
Genau **ein** Datensatz, angelegt von der Migration. Benannte Felder statt Schlüssel-Wert: ein Feld
hat hier einen Typ, eine Längenbegrenzung und einen Hilfetext, und die Admin-Route schreibt gegen
eine Whitelist (R4).

| Feld | Typ | Anmerkung |
|---|---|---|
| `anzeigename` | text, required, max 60 | Überschrift der Einladungsseite und Titel der Linkvorschau. Standard `Mannschaftsplan` |
| `tempo_kmh` | number, 20–200 | Durchschnittsgeschwindigkeit für die Fahrzeit (6.3). Standard 80 |
| `puffer_minuten` | number, 0–180 | Zuschlag vor dem Anwurf (6.3). Standard 25 |
| `auto_sperre_stunden` | number, 0–168 | Frist, nach der ein Spieltag von selbst schließt. **0 = aus**, und das ist der Standard |
| `impressum` | text, max 8000 | Freitext, kein HTML. Leer = die Seite gibt es nicht |
| `datenschutz` | text, max 8000 | dito |
| `updated` | autodate | |

**Impressum und Datenschutz sind Freitext, ausdrücklich kein HTML.** Die CSP aus R9 verbietet
Inline-Skripte; ein Rich-Text-Feld wäre eine Einladung, daran zu rütteln. Der Text wird escaped
ausgegeben und über `white-space: pre-wrap` mit seinen Absätzen dargestellt. Aus demselben Grund
steht im Protokoll nur die Länge des Textes, nicht sein Inhalt.

Beide Seiten (`/impressum`, `/datenschutz`) sind **ohne Sitzung erreichbar**. Ein Impressum, das
man erst nach der Anmeldung sieht, erfüllt seinen Zweck nicht, und den Datenschutzhinweis muss
jemand lesen können, bevor er auf einen Link tippt und damit eine Sitzung anlegt. Ist nichts
hinterlegt, antwortet die Route mit 404 — und weder der Aushang noch die Einladungsseite verlinken
dann darauf.

Die Grenzen stehen zweimal: in der Migration und in der Admin-Route. Ohne die zweite lehnte erst
die Datenbank ab, mit einer Meldung, die dem Kapitän nichts sagt.

**Der Anzeigename ist öffentlich.** Er steht im OpenGraph-Titel und wird damit von jedem Messenger
abgerufen, dem ein Link weitergeleitet wird — noch bevor ein Mensch ihn antippt. Ein Mannschafts-
oder Vereinsname gehört dorthin, ein Personenname oder eine Adresse nicht. Die Kapitänsansicht
sagt das an der Eingabe.

Gelesen wird der Datensatz auch von der Einladungsseite, also außerhalb des Adminbereichs; das
Holen liegt deshalb in `utils.js`. Fehlt der Datensatz oder die Tabelle, kommt der Standard zurück
statt einer Ausnahme — die Einladungsseite ist der einzige Weg der Mannschaft herein und darf an
einer Einstellung nicht scheitern.

**Nicht gespeichert:** Telefonnummern, Adressen, Geburtsdaten, E-Mail-Adressen der Spieler.
Der Treffpunkt ist ein Freitext am Spieltag, keine Privatadresse.

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
| `POST /manage/api/login` | 5 **Fehlversuche** / min / IP, danach 15 min Sperre | nur Misserfolge |
| `POST /manage/api/login` | 10 **Fehlversuche** / 15 min / Konto, danach 15 min Sperre | nur Misserfolge; ein Treffer setzt beide zurück |

**Beim Einlösen dürfen nicht Anfragen gezählt werden, sondern nur Fehlversuche.** Eine Mannschaft
sitzt im Vereinsheim hinter EINER öffentlichen IP. Verschickt der Kapitän die Links und tippen
acht Leute im selben WLAN darauf, wären die letzten sonst ausgesperrt — an ihrem eigenen,
gültigen Link. Wer ein gültiges Token hat, rät nicht; ein Treffer setzt den Zähler zurück.

**Warum der Login zusätzlich pro Konto zählt:** Seit R13e steht er ohne Tor im Netz. Eine reine
IP-Zählung ist dort wirkungslos, sobald jemand über mehrere Adressen anfragt — jede einzelne
bliebe unter der Grenze, das Konto bekäme trotzdem beliebig viele Versuche. Der Zähler pro Konto
schließt das; der Zähler pro IP bleibt daneben stehen, weil er auch die Adressen bremst, die es
gar nicht auf ein bestimmtes Konto abgesehen haben.

**Auch der Zähler pro IP zählt seit R13e nur Fehlversuche.** Vorher zählte er jede Anfrage — und
das ist derselbe Fehler, den der Absatz oben für das Einlösen der Einladungslinks beschreibt: Acht
Kapitäne im WLAN des Vereinsheims sind acht Anmeldungen von EINER öffentlichen Adresse. Solange
`/manage` hinter dem Tor lag, fiel das nicht auf, weil sich dort ohnehin kaum jemand anmeldete.

**Zehn Fehlversuche pro Viertelstunde beim Konto, nicht fünf pro Minute.** Dieser Zähler lässt
sich von außen füttern: Wer die Adresse eines Kapitäns kennt, könnte ihn sonst absichtlich
aussperren. Zehn Fehlgriffe schafft niemand versehentlich, ein bis zwei schon.

**Eine Sperre löst sich nach einer Viertelstunde von selbst.** Für den Fall, dass jemand nicht so
lange warten kann, hebt der Admin sie in der Kontenliste auf
(`POST /admin/api/verwalter/{id}/entsperren`). Die eigene Sperre des Admins kann er damit nicht
aufheben — dafür bleibt Warten oder ein Neustart, denn die Zähler liegen im Arbeitsspeicher.

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

**Nachtrag 2026-08-28: Es sind zwei Logs, nicht eines.** Der Satz „Die Anwendung loggt Tokens
niemals" stimmte für den selbst geschriebenen Code, aber nicht für PocketBase. Dessen
Request-Middleware füllt die Tabelle `_logs` mit Methode, **vollständiger URL**, Statuscode,
Browserkennung und — bei der Vorgabe `logIP: true` — der IP-Adresse; aufbewahrt fünf Tage. Ein
Aufruf von `/j/<token>` landete dort mitsamt Token. Der Caddy-Filter half nicht: Er betrifft
Caddys Log, nicht PocketBases.

Das wog schwerer als ein Logeintrag, weil `_logs` in `pb_data` liegt und damit **in jeder
Sicherung** — die ausdrücklich unverschlüsselt ist und auf den Rechner des Kapitäns wandern
soll. Eine Kopie der Datenbank war damit eine Kopie funktionierender Zugänge, also genau das,
was R1 verhindern soll.

Behoben durch die Migration `1788600000_kein_anfrageprotokoll.js`: `logs.maxDays = 0` schaltet
PocketBases Anfrageprotokoll ab. Eine Ausnahme für einzelne Routen bietet PocketBase nicht — die
Wahl steht zwischen allem und nichts. Für den Betrieb geht nichts verloren: Caddy protokolliert
weiter (ohne `/j/`, ohne Anhängsel), und was die Hooks über `console.log` melden, steht in der
Containerausgabe. **Testfall T22** hält es fest und wurde gegen den alten Zustand gegengeprüft.

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
ab). OpenGraph-Tags ohne personalisierte Daten: Titel ist der Anzeigename aus `settings` plus
„ — Termine", Standard also „Mannschaftsplan — Termine". Der Wert wird escaped, bevor er in den
Attributwert geht — er kommt aus einer Eingabe, auch wenn nur der Kapitän sie machen kann.

Deshalb legt der GET **keine Session an** — er liefert nur das Formular, das Einlösen passiert im
`POST /api/session` (siehe Abschnitt 5). Der Crawler führt kein JS aus, erzeugt also weder Session
noch Datenbankschreibvorgang. Ein GET, der eine Session anlegt, verstößt gegen diese Regel.

### R11 · CSRF
`SameSite=Lax` plus Double-Submit-Token: Server setzt zusätzlich ein nicht-HttpOnly-Cookie
`dz_csrf`, der Client schickt den Wert als `X-CSRF-Token`-Header. Alle schreibenden Routen
prüfen die Übereinstimmung.

> **Und sie müssen dabei auch wirklich abbrechen.** Für den Verwaltungs-Router war diese Regel
> zwei Monate lang wirkungslos, ohne dass es jemandem auffiel: Die Vorprüfung gab `e.json(403, …)`
> zurück, der Aufrufer schrieb `if (raus) return { fehler: raus }` — und **`e.json()` liefert im
> JSVM `undefined`**. Es SCHREIBT die Antwort und gibt nichts zurück. Die Bedingung war damit
> falsch, der Handler lief weiter und arbeitete die Anfrage ab. Nach außen sah alles richtig aus:
> Der Statuscode stand mit dem ersten Schreiben fest, also 403 — nur dass im Rumpf zwei
> JSON-Objekte hintereinander standen und der Datensatz trotzdem angelegt wurde.
>
> Die Mitgliederseite war nie betroffen; sie gibt seit jeher Daten zurück (`{ fehler: { status,
> message } }`) und ruft `e.json()` in der Route auf. Genau so macht es der Verwaltungs-Router
> jetzt auch. **Regel für alle künftigen Vorprüfungen: Hilfsfunktionen geben Daten zurück, nie
> eine Antwort.** Testfall C2 prüft nicht mehr den Statuscode, sondern die Wirkung — ob der
> Datensatz danach da ist.

### R12 · Widerruf
Admin-Aktion „Neues Token" pro Mitglied:
1. neuen Hash schreiben (alter ist damit weg) → alle alten Links tot
2. alle `sessions` dieses Mitglieds löschen → alle Geräte ausgeloggt
3. Eintrag ins `audit_log`

### R13 · Admin-Zugang
- Login gegen PocketBase-Superuser (`_superusers`) — kein selbstgebautes Passwort-Handling.
  Der Hook legt eine eigene Sitzung in `admin_sessions` an und setzt ein HttpOnly-Cookie
  `dz_admin` sowie das lesbare `dz_admin_csrf` für R11. Der PocketBase-Token landet **nirgends**
  im Browser, weder im Cookie noch in `localStorage`.
- **Zwei Laufzeiten, und der Nutzer wählt — aber die lange gibt es nur mit zweitem Faktor.**
  Ohne Haken 12 Stunden, mit „angemeldet bleiben" **90 Tage** auf diesem Gerät; ohne TOTP bleibt
  es bei 12 Stunden, auch wenn der Haken gesetzt war. Ein Gerät, das drei Monate angemeldet
  bleibt, ist ein Passwort, das drei Monate niemand mehr eingibt — wer das Gerät findet, ist
  drin. Damit bleibt der zweite Faktor freiwillig, bringt aber etwas ein: Bequemlichkeit als
  Anreiz statt einer Vorschrift, die umgangen wird. Die Antwort auf den Login sagt, was der
  Nutzer bekommen hat, damit die Oberfläche erklären kann, warum er sonst wieder herausfliegt. Die gewählte Dauer steht an der Sitzung (`admin_sessions.dauer`)
  und wird serverseitig gegen `created` geprüft, nicht nur über die Cookie-Lebensdauer — ein
  abgegriffener Cookie-Wert wäre sonst unbegrenzt gültig.
  **Warum überhaupt so lang:** Ein Kapitän pflegt alle zwei Wochen einen Spieltag. Bei 12 Stunden
  ist das jedes Mal eine neue Anmeldung, und genau das kennt er von keiner App, die er sonst
  benutzt. Abmelden beendet die Sitzung sofort, eine Passwortänderung beendet alle anderen (R12).
- **Was das Modell hier nicht leistet:** die Antwortzeit verrät, ob eine Superuser-Adresse
  existiert (bei bekannter Adresse läuft eine bcrypt-Prüfung, bei unbekannter nicht). Das
  schließt erst die Sperre oben: fünf Versuche, dann eine Viertelstunde Ruhe. Sie zählt seit
  R13e **pro IP und pro Konto** und liegt im Arbeitsspeicher — nach einem Neustart ist sie weg.
  Für den Admin-Weg steht zusätzlich das Tor aus R13b davor; für den Kapitänsweg ist die Sperre
  das einzige Mittel, und deshalb zählt sie dort auch pro Konto.

Die beiden geschützten Pfade haben verschiedene Bedürfnisse und deshalb verschiedene Regeln.

#### R13a · `/_/` ist nie öffentlich erreichbar

Das PocketBase-Dashboard sieht die gesamte Datenbank, alle Collections und die Backups. Im
laufenden Betrieb wird es **nie** gebraucht: Mitglieder, Spieltage, Token und Protokoll pflegt der
Kapitän in `/admin`. Nötig ist es beim Einrichten, beim Restore und im Notfall.

Der Proxy antwortet auf `/_/*` deshalb **immer** mit 404 (nicht 403, R6). Das ist keine
Voreinstellung, sondern eine Festlegung: keine Allowlist, kein Schalter, keine Ausnahme. Wer
hinein muss, tunnelt — in `docker-compose.yaml` den auf `127.0.0.1` gebundenen Port aktivieren und

```bash
ssh -L 8090:127.0.0.1:8090 <server>
```

Die Bindung an `127.0.0.1` ist der Unterschied zu einem veröffentlichten Port: erreichbar nur für
Prozesse auf dem Server selbst und für den, der sich per SSH dorthin verbinden darf.

#### R13b · Das Admin-Gebiet nie mit nur einem Passwort

Gemeint ist alles unter `/admin*`: die Routen, die **nur** die Rolle `admin` aufrufen darf —
Konten anlegen, Rollen vergeben, Mannschaften, Einstellungen, Sicherungen. Dort hängt der Zugriff
auf *alle* Mannschaften und auf die Datenbankdatei. **Eines von beiden, aber nie keines**:

| Weg | Wie | Für wen |
|---|---|---|
| Netz | IP-Allowlist im Proxy, alles andere 404 | feste Adresse oder VPN (WireGuard, Tailscale) |
| Tor | vorgeschaltete Proxy-Anmeldung vor `/admin*` | alle anderen — funktioniert aus jedem Netz |

Beide erreichen dasselbe: ein Fehler im Admin-Code ist von außen nicht ansprechbar, weil die
Anfrage den eigenen Code gar nicht erst erreicht. **Ist keiner der beiden Wege eingerichtet,
bleibt `/admin` zu (404).** Die Wahl soll bewusst fallen und nicht per Voreinstellung.

Dass hier eine zweite Anmeldung steht, ist Absicht und kein Versehen: Der Admin ist eine Person,
er macht das ein paar Mal im Jahr, und der Preis ist ein Browser-Fenster. Für die Kapitäne war
genau dieser Preis zu hoch — siehe R13e.

#### R13c · Dasselbe Tor vor der Superuser-Anmeldung

Ein Tor nur vor `/admin` ist eines mit offener Hintertür. Unter
`/api/collections/_superusers/auth-with-password` gibt PocketBase den Superuser-Token aus, und
mit ihm steht die gesamte Datenbank offen — auf den Collections liegen keine Regeln, der Token
ist also der einzige Schlüssel. Wer Adresse und Passwort hat, käme so an alle Daten, ohne
`/admin` je zu berühren, und könnte dort auch den zweiten Faktor aus Schritt 9 löschen.

Deshalb liegt **der ganze Präfix** `/api/collections/_superusers/*` hinter derselben Anmeldung
wie `/admin`. Nicht nur `auth-with-password`: `auth-refresh`, `auth-with-otp`,
`request-password-reset` und `impersonate` führten sonst am Tor vorbei zum selben Ziel.

Der Preis steht in der Anleitung: Wer von außen als Superuser spricht — `scripts/backup.sh` —,
braucht zusätzlich die Zugangsdaten des Tors. Durch einen SSH-Tunnel auf 8090 gilt das nicht,
dort steht kein Proxy.

#### Erledigt · Der zweite Faktor für `/admin`

R13 verlangte „MFA für den Superuser aktivieren". Das wirkt für PocketBases eigenen Login unter
`/_/`. Der Kapitäns-Login geht durch den eigenen Hook und prüft das Passwort direkt
(`validatePassword`), am MFA-Ablauf vorbei — für `/admin` war der zweite Faktor damit
wirkungslos. MFA am Superuser einzuschalten bleibt trotzdem richtig, weil es `/_/` schützt.

Gebaut ist inzwischen ein **eigener** zweiter Faktor in diesem Login: TOTP nach RFC 6238
(`pb_hooks/totp.js`, Ablage in `admin_totp`, Bedienung unter Einstellungen). PocketBases MFA
schied aus, weil es Einmalcodes per E-Mail verschickt und diese App bewusst keinen Mailserver
hat.

**Wer ihn haben muss:** Für die Rolle `admin` ist er **Pflicht** — dort liegt der Zugriff auf alle
Mannschaften und auf die Sicherungen. Für Kapitäne ist er **freiwillig**, aber „angemeldet
bleiben" gibt es nur mit ihm (R13). Das ist dieselbe
Abwägung, die jeder Online-Shop trifft, aber sie trägt hier aus einem Grund, den es dort nicht
gibt: Die Passwörter werden **erzeugt und nicht gewählt** (16 Zeichen, Abschnitt 12).
Wiederverwendete schwache Passwörter und damit Credential Stuffing — der Angriff, gegen den 2FA
im Netz vor allem hilft — fallen deshalb weg. Einen Reset per E-Mail, den man phishen könnte,
gibt es ebenfalls nicht: zurücksetzen kann nur der Admin.

Wer ihn einschaltet, bekommt **Wiederherstellungscodes** — zehn Stück, einmal anzeigen, jeder
einmal verwendbar. Ohne sie ist ein verlorenes Handy ein verlorener Zugang, und der Ausweg wäre
jedes Mal der Admin.

#### R13e · Der Kapitänsweg steht ohne Tor

`/manage*` liegt **nicht** hinter der Proxy-Anmeldung aus R13b. Das ist eine bewusste Abkehr
von der ersten Fassung dieser Regel, und sie hat einen Grund, der nichts mit Bequemlichkeit zu
tun hat, sondern mit dem, was das Tor in der Praxis war:

- Es ist **ein** Passwort für alle sieben Kapitäne. Nicht pro Person widerrufbar, kein Abmelden,
  und wer ausscheidet, nimmt es mit.
- Es ist ein Browser-Fenster ohne Wiedererkennungswert, vor einer App, die Leute bedienen, die
  mit IT nichts zu tun haben. Ein geteiltes Passwort, das acht Leuten unangenehm ist, landet im
  Zweifel im Mannschafts-Chat — und dann schützt es nichts mehr.
- Es stand vor einer Ansicht, deren Rechte ohnehin eng sind: Ein Kapitän sieht genau seine
  Mannschaft (R13d), er kommt an keine fremden Daten und an keine Sicherung.

Was an seine Stelle tritt, ist kein einzelnes Mittel, sondern die Summe:

| | |
|---|---|
| Passwort | wird **erzeugt**, nicht gewählt: 16 Zeichen, der Admin gibt es weiter (Abschnitt 12) |
| Sperre | 5 Versuche pro Minute je IP **und je Konto**, dann 15 Minuten (R7) |
| Enumeration | falsche Adresse und falsches Passwort antworten gleich (R6) |
| Sitzung | eigene Tabelle, eigener Cookie-Name, eigener Pfad (R5) |
| Blast Radius | eine Mannschaft, keine Sicherungen, keine fremden Konten |
| Zweiter Faktor | freiwillig verfügbar, für die Rolle `admin` Pflicht |

**Der Preis, offen benannt:** `POST /manage/api/login` ist von außen ansprechbar, ein Fehler in
diesem einen Handler also auch. Das ist der Unterschied zu vorher, und er ist der Grund, warum
dieser Handler so wenig tut wie möglich: Grenze prüfen, Konto suchen, Passwort von PocketBase
prüfen lassen, Sitzung anlegen. Kein eigener Hash, kein eigener Vergleich, keine Auskunft.

#### R13d · Mehrere Mannschaften, getrennte Kapitäne

Ein Verein hat mehr als eine Mannschaft, und jede hat ihren eigenen Kapitän. Sieben Instanzen
wären die naheliegende, aber falsche Antwort: siebenmal Sicherungen, siebenmal Aktualisierungen,
siebenmal dieselben Rechtstexte.

Der Kapitän kann dafür kein Superuser mehr sein — sieben Superuser hieße sieben Zugänge zur
gesamten Datenbank. Stattdessen eine eigene **Auth-Collection** `verwalter`: PocketBase hält
weiterhin Hash und Prüfung (R13 bleibt gewahrt), aber auf keiner Tabelle liegt eine Regel, die
einem Verwalter etwas erlaubte. Sein ganzer Zugriff läuft über `/admin/api`.

Die Abschottung steht an drei Stellen, und zwar bewusst nicht nur in Prüfungen:

1. **Im Schema.** `members.team` und `fixtures.team` sind Pflichtfelder. Ein Mitglied ohne
   Mannschaft ist nicht speicherbar — wie `sessions.member` eine mitgliedslose Sitzung unmöglich
   macht.
2. **An einem Engpass.** `utils.zugangPruefen()` steht vor jeder schreibenden Mitglieder-Route
   und gleicht die Mannschaft mit ab. Eine vierte Route käme dort ebenfalls vorbei.
3. **In der Herkunft.** `adminauth.teamFuer()` liest den Wunsch aus dem Request nur für die Rolle
   *Gesamt*. Ein Kapitän bekommt immer seine eigene Mannschaft — dieselbe Regel wie R3.

Der Superuser bleibt ohne Verwalterkonto immer *Gesamt*. Das ist der Rettungsanker gegen das
versehentliche Aussperren.

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
     → sonst: HTML-Seite „Link ungültig — frag den Kapitän", HTTP 200
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
GET    /admin/api/settings   → { anzeigename, tempo_kmh, puffer_minuten, auto_sperre_stunden,
                                 impressum, datenschutz }
PATCH  /admin/api/settings     dieselben Felder, alle einzeln   // R4-Whitelist, je Feld eine
                                                                // Protokollzeile
```

Öffentlich, ohne Sitzung — beide nur, wenn hinterlegt, sonst 404:

```
GET    /impressum
GET    /datenschutz
GET    /admin/api/audit?limit=100
```

---

## 6. Frontend

### 6.1 Routen
| Pfad | Inhalt |
|---|---|
| `/` | Abfahrtsplan. Ohne Session: „Link ungültig"-Seite |
| `/manage` | Login, danach Spieltage / Mitglieder / Protokoll — der Weg für den Kapitän |
| `/admin` | dasselbe Frontend, aber der Einstieg für den Admin: hinter dem Tor aus R13b |

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
fahrzeit_min = km / tempo_kmh * 60 + puffer_minuten
abfahrt      = anwurf − round(fahrzeit_min auf 5 min)
```
`tempo_kmh` und `puffer_minuten` stehen in `settings` (Standard 80 und 25) und werden in der
Kapitänsansicht gepflegt — auf dem Land trägt ein höheres Tempo, in der Stadt ein niedrigeres.

Bei Heimspielen entfällt die Abfahrt; die linke Spalte zeigt dann den Anwurf mit dem Label
„ANWURF" statt „ABFAHRT". Die Formel gehört ins Backend, damit alle dasselbe sehen — auch das
Frontend rechnet sie nicht nach, sonst liefe sie irgendwann auseinander.

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
Datei, dasselbe Image auf dem Prüfserver wie im Betrieb.

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
| `+ docker-compose.caddy.yaml` | nackter Server, auf dem noch nichts läuft | zusätzlich Caddy mit ACME auf 80/443 | da |

Was sich von Betrieb zu Betrieb unterscheidet, steht in der `.env` und **nicht** in einer
Konfigurationsdatei: Domain, ACME-Adresse und das Tor aus R13b. Fehlt einer dieser Werte, fährt das
Overlay nicht an und nennt den fehlenden — besser ein Stack, der nicht startet, als einer, der
falsch konfiguriert läuft. Im Repo liegt kein Zugang, auch kein erfundener: den bcrypt-Hash für das
Tor erzeugt der Betreiber selbst mit `caddy hash-password`.

```bash
docker compose up -d                                                       # eigener Proxy
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml up -d   # mit Caddy
```

Der App-Service ist dabei **einmal** definiert; das Overlay stellt nur den Proxy daneben. Zwei
vollständige Compose-Dateien wären zwei Wahrheiten, die auseinanderlaufen.

#### Wo geprüft wird

Zwei Umgebungen, nicht drei. **Lokal** läuft die schnelle Schleife: Logik, Aussehen und die
Testfälle T1–T9 und T13. Das Aussehen ist dort sogar genauer zu beurteilen als anderswo, weil
`npm run build` nach `pb_public/` baut und PocketBase danach same-origin genau das ausliefert, was
auch im Container steht — und weil die Schriften selbst gehostet sind, gibt es nichts, das
anderswo anders aussähe. Den Containerpfad deckt die **CI** ab: sie baut das Image, startet es und
lässt die vollständige API-Suite dagegen laufen.

Was beides nicht kann, braucht einen **öffentlich erreichbaren Server** — kein Heimnetz, sondern
denselben Anbieter, auf dem später der Betrieb läuft. Dort und nur dort sind prüfbar: T11 (der
Messenger ruft die URL serverseitig ab, ein Name aus dem Heimnetz ist für ihn nicht auflösbar),
T8c von einer wirklich fremden Adresse, ein echtes Zertifikat samt ACME und HSTS, das Verhalten
auf einem Handy im Mobilnetz — und R13 ohne LAN, siehe 7.2.1.

Ein Aufbau im eigenen Heimnetz liegt zwischen beidem und trägt deshalb nicht: er kostet
Einrichtung, deckt exklusiv nur T10 ab und prüft ausgerechnet die Proxy-Konfiguration, die im
Betrieb nicht verwendet wird. Der Weg „hinter vorhandenem Proxy" bleibt als **Nutzer**-Variante
unterstützt und dokumentiert; er ist nur keine Stufe der eigenen Prüfkette.

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

  # R13a · Dashboard ist nie öffentlich. Fest, ohne Schalter. Zugang per SSH-Tunnel.
  @dashboard path /_/*
  handle @dashboard {
    respond 404
  }

  # R13b · Kapitänsansicht: GENAU EINEN Weg einrichten — Allowlist ODER Proxy-Anmeldung.
  # Solange keiner eingerichtet ist, bleibt /admin zu.
  @admin path /admin*
  handle @admin {
    # Weg 1 — Netz:  @fremd not remote_ip <dein-bereich>
    #                respond @fremd 404
    # Weg 2 — Tor:   basic_auth { <benutzer> <bcrypt-hash aus `caddy hash-password`> }
    respond 404
    # reverse_proxy mannschaftsplan:8090
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

#### 7.2.1 R13 ohne LAN — entschieden

R13 stützte sich darauf, dass `/admin` und `/_/` nur aus einem vertrauenswürdigen Netz erreichbar
sind. Auf einem öffentlichen Server gibt es weder LAN noch VPN, und ein beliebiger Betreiber hat
auch keins. Statt die Regel abzuschwächen, ist sie **aufgeteilt** — die Begründung steht bei R13 in
Abschnitt 4:

- **R13a**: `/_/` bleibt immer zu, ohne Schalter. Zugang per SSH-Tunnel auf einen an `127.0.0.1`
  gebundenen Port.
- **R13b**: `/admin` ist erreichbar, aber nie mit nur einem Passwort. Entweder IP-Allowlist oder
  eine dem Admin-Code vorgeschaltete Proxy-Anmeldung; ist keines eingerichtet, bleibt `/admin` zu.

Beide Wege aus R13b kommen ohne VPN aus. Für die Vorlagen folgt daraus: der Block für `/_/` ist
fest, der für `/admin` verlangt eine Entscheidung, und nirgends steht ein Beispielbereich, den man
versehentlich übernimmt.

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
Overlay, `.env`-Konfiguration und die Prüfung der Vorlagen in der CI stehen. Offen bleibt der
zweite Faktor im Kapitäns-Login: der eigene Hook geht an PocketBases MFA vorbei, siehe R13.
Auf einem echten Server laufen dann die Handprüfungen, die lokal und in der CI nicht möglich sind:
T8c, T8d, T10, T11 und T12.
*Fertig, wenn:* ein nackter Server allein mit den Werten aus einer `.env` zum laufenden HTTPS-Dienst
wird — und der Weg mit vorhandenem Proxy unverändert weiter funktioniert.

---

## 11. Testfälle

Vor „fertig" alle durchlaufen. Die Handprüfungen brauchen einen öffentlich erreichbaren Server;
der Ablauf dafür steht in [`erster-testlauf.md`](erster-testlauf.md).

Was mit **automatisiert** markiert ist, steckt in
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
| T8c | `/admin` ohne den Weg aus R13b (fremde Adresse bzw. ohne Proxy-Anmeldung) | 404 bzw. Abweisung vor dem Admin-Code — Aussage über den Proxy, **Handprüfung** |
| T8e | `/manage` ohne Proxy-Anmeldung | erreichbar (R13e), aber ohne Sitzung nur das Login-Formular — **Handprüfung** |
| T8f | `/admin/api/*` mit gültiger Kapitänssitzung | 404 (R6) — **automatisiert** (in T16 und T9b) |
| T8d | `/_/` von außen, in jeder Lage | 404 — R13a kennt keine Ausnahme, **Handprüfung** |
| T9 | 6× falsches Admin-Passwort | gesperrt, auch für das richtige Passwort; kein Hinweis auf Existenz |
| T9b | Zehn Fehlversuche für dasselbe Konto von wechselnden IP-Adressen | gesperrt, obwohl keine einzelne Adresse ihre Grenze reißt (R7) — **Handprüfung**, ein Rechner allein läuft vorher in die IP-Sperre. Automatisiert ist die Hälfte, die von hier aus geht: die Auskunft `gesperrt` und das Aufheben durch den Admin |
| T14 | „Angemeldet bleiben" mit und ohne zweiten Faktor | mit Faktor 90 Tage, ohne Faktor 12 Stunden — und die Antwort sagt, was es geworden ist — **automatisiert** |
| A13 | Admin-Konto ohne zweiten Faktor ruft `/admin/api` auf | 403 mit `totp_pflicht`, danach mit eingerichtetem Faktor 200 — **automatisiert** |
| A14 | Anmeldung mit einem Wiederherstellungscode | gilt genau einmal, die übrigen bleiben gültig — **automatisiert** |
| A15 | Kapitän mit Spielerbezug wechselt in die Spieleransicht | Mitgliedersitzung für den eigenen Eintrag, der Aushang zeigt den Weg zurück; für den Admin 404 — **automatisiert** |
| C2 | Schreiben in der Verwaltung ohne `X-CSRF-Token` | 403 **und der Datensatz ist danach nicht da** — geprüft wird die Wirkung, nicht der Statuscode (R11) — **automatisiert** |
| T10 | Access-Log nach `/j/`-Aufruf durchsuchen | kein Token im Klartext |
| T11 | Link in WhatsApp einfügen | Vorschau zeigt den Anzeigename aus `settings`, nichts Personalisiertes |
| A9 | Anzeigename ändern, Einladungsseite abrufen | Name steht in Überschrift und OpenGraph-Titel; HTML darin wird escaped — **automatisiert** |
| A10 | Tempo und Puffer ändern, `/api/board` abrufen | Abfahrtszeit folgt der Formel aus 6.3; Werte außerhalb der Grenzen → 400 — **automatisiert** |
| A11 | Impressum und Datenschutz hinterlegen, Seiten ohne Anmeldung abrufen | 200 mit dem Text, HTML darin wird angezeigt statt ausgewertet; leer → 404 und keine Links im Fuß — **automatisiert** |
| A12 | Frist setzen, Cron `spieltage-sperren` auslösen | vergangener Spieltag wird gesperrt, künftiger nicht, Protokollzeile mit `system:auto-sperre`; bei 0 passiert nichts. Auslösen über `POST /api/crons/spieltage-sperren` als Superuser — **Handprüfung** |
| T12 | Backup einspielen | Datenstand vollständig wiederhergestellt |
| T13 | `GET /j/<gültig>` allein aufrufen (wie der Crawler, ohne JS) | keine neue Zeile in `sessions`, kein Cookie — Beleg für R10 |

## 12. Rollen, Konto und Spieler

Auf diesen Abschnitt verweisen die Hooks an rund einem Dutzend Stellen („Abschnitt 12"), er war
aber nie geschrieben. Hier steht er nach.

### Zwei Rollen

| Rolle | Sieht | Darf zusätzlich |
|---|---|---|
| `kapitaen` | genau **seine** Mannschaft | Spieltage, Spieler und Rückmeldungen dieser Mannschaft |
| `admin` | alle Mannschaften | Konten und Rollen, Mannschaften, Einstellungen, Sicherungen |

Die Mannschaft eines Kapitäns kommt **immer aus der Sitzung**, nie aus dem Request — dieselbe
Regel wie R3 auf der Mitgliederseite. Ein Kapitän ohne Mannschaft darf nichts; das ist ein halb
angelegtes Konto, und im Zweifel ist zu wenig Recht besser als zu viel.

**Der Admin verwaltet, er spielt nicht.** Er hat weder Mannschaft noch Spielereintrag. Das ist
keine Anzeigefrage: Wer beides hätte, wäre in seiner eigenen Verwaltung Partei.

Ein **Superuser ohne Verwalterkonto gilt immer als Admin**. Das ist der Rettungsanker — wer sich
beim Verteilen der Rollen vergreift, kommt darüber wieder herein.

### Der Kapitän ist auch Spieler — ein Konto, nicht zwei

`verwalter.mitglied` verweist optional auf einen Eintrag in `members`. Für den Kapitän, der
mitspielt; wer nur organisiert, bleibt unverknüpft. Ein verknüpfter Spieler muss zur selben
Mannschaft gehören wie das Konto — sonst stünde ein Kapitän der Herren in der Damenmannschaft.

Daraus folgt die Bedienung, und sie ist der eigentliche Punkt: **Ein Kapitän, der mitspielt, hat
seinen persönlichen Einladungslink wie jeder andere Spieler auch.** Für den häufigsten Fall —
mal nachsehen, wie es steht, und selbst zu- oder absagen — meldet er sich **gar nicht an**.
Angemeldet wird nur zum Verwalten.

Verbunden wird das durch zwei Wege in der Oberfläche, und nur durch die:

| Von | Nach | Sichtbar für |
|---|---|---|
| Spielerseite (Token-Link) | `/manage` | nur wenn zu diesem Spieler ein Konto gehört |
| Kapitänsansicht | eigener Token-Link | den angemeldeten Kapitän mit Spielerbezug |

Dass der Einstieg auf der Spielerseite nur mit Konto erscheint, ist keine Sicherheitsmaßnahme —
`/manage` ist ohnehin öffentlich (R13e) — sondern eine Frage der Ruhe: Die anderen sieben
Spieler sollen einen Knopf, den sie nie brauchen, gar nicht erst sehen.

### Passwörter

Angelegt wird ein Konto vom Admin, das Passwort **erzeugt der Server**: 16 Zeichen aus einem
Alphabet ohne die Verwechslungspaare `0/O` und `1/l/I`. Es verlässt den Server **genau einmal**,
nämlich in der Antwort auf das Anlegen; danach steht nur noch der Hash da. Zurücksetzen kann nur
der Admin — einen Reset per E-Mail gibt es nicht, die App hat bewusst keinen Mailserver.

Wer sein Passwort selbst ändert, braucht das bisherige und mindestens **zwölf Zeichen**, und es
darf nicht der eigene Adressteil vor dem `@` sein. Das ist der Preis dafür, dass der zweite
Faktor für Kapitäne freiwillig bleibt: Die Rechnung „erzeugt, nicht gewählt" gilt sonst nur bis
zur ersten Änderung. Eine Passwortänderung beendet alle anderen Sitzungen desselben Kontos (R12).

