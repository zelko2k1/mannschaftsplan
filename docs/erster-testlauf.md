# Erster Testlauf auf einem echten Server

Bis hierher ist die App lokal entwickelt und in der CI gebaut worden. Was **nie** stattgefunden
hat, ist ein `docker compose up -d` auf einer Maschine im Internet. Solange das so bleibt, ist
die Anleitung in der [README](../README.md) gut begründet, aber unbewiesen.

Dieser Lauf hat zwei Zwecke, und sie sind gleich wichtig:

1. **Die Anleitung prüfen.** Du gehst sie Schritt für Schritt durch wie jemand, der sie zum
   ersten Mal liest. Wo du stolperst, stolpert später ein Vereinsadmin.
2. **Die fünf Handprüfungen erledigen**, die lokal und in der CI prinzipbedingt nicht möglich
   sind: T8c, T8d, T10, T11 und A12 aus Abschnitt 11 des [Umsetzungsplans](umsetzungsplan.md).

Rechne mit zwei Stunden. Danach ist der Server entweder dein Betrieb oder wieder weg.

---

## Vorbereitung

| | |
|---|---|
| **Server** | Kleinster Tarif genügt. Nimm dieselbe Distribution, die du später betreiben willst. |
| **Name** | Eine Subdomain, deren A-Record auf die Server-IP zeigt. **Vor** dem Start einrichten — ohne sie bekommt Caddy kein Zertifikat. |
| **Firewall** | 80 und 443 offen, SSH möglichst nur von deiner Adresse. Achte darauf, ob dein Anbieter eine eigene Firewall-Ebene im Kundenkonto hat; sie greift zusätzlich zu der auf dem Server. |
| **Ein zweites Gerät** | Ein Handy im **Mobilnetz**, nicht im WLAN. Zwei der Prüfungen brauchen einen Zugriff, der nachweislich von außen kommt. |
| **Ein Messenger** | Für T11. |

> **Keine echten Mitgliedernamen.** Dieser Lauf erzeugt Testdaten auf einem Server, den du
> hinterher vielleicht löschst — und der Auftragsverarbeitungsvertrag mit deinem Anbieter ist
> womöglich noch nicht geschlossen. Nimm erfundene Namen.

---

## Teil 1 · Die Anleitung durchgehen

Arbeite die Schritte 1 bis 9 aus [README → Einrichten](../README.md#einrichten) ab. **Nicht aus
dem Kopf** — lies sie, als kenntest du sie nicht.

Führe dabei einen Zettel mit zwei Spalten: *war unklar* und *hat nicht funktioniert*. Alles, was
dort landet, ist ein Fehler in der Anleitung, nicht in dir.

Drei Stellen, an denen erfahrungsgemäß etwas hängt:

- **Nach Schritt 2:** `docker compose version` muss **2.24 oder neuer** zeigen. Tut es das nicht,
  hör hier auf und richte Docker aus der offiziellen Quelle ein. Weitermachen führt zu einem
  Fehlerbild, das nach einem falschen Passwort aussieht und keines ist.
- **Nach Schritt 6:** Der erste Bau dauert Minuten. `docker compose -f docker-compose.yaml -f
  docker-compose.caddy.yaml logs -f` zeigt, ob er läuft oder steht.
- **Vor Schritt 8:** Kommt der Browser mit einer Zertifikatswarnung, zeigt der Name meist noch
  nicht auf den Server. `logs caddy` sagt, woran ACME scheitert.

Am Ende von Teil 1 hast du: eine erreichbare App unter deinem Namen, einen Kapitänszugang, ein
Testmitglied mit Einladungslink und **einen Spieltag, dessen Anwurf in der Vergangenheit liegt**
(den brauchst du für A12 — trag ihn gleich mit ein, etwa auf gestern).

---

## Teil 2 · Die fünf Handprüfungen

In dieser Reihenfolge: Die ersten beiden gehen sofort, die anderen brauchen, was in Teil 1
entstanden ist.

> **Von Windows aus** geht alles außer T10 (läuft auf dem Server) und T11 (braucht Handy und
> Messenger). Zwei Eigenheiten: In PowerShell musst du **`curl.exe`** schreiben — `curl` allein ist
> dort ein Alias für `Invoke-WebRequest` und versteht diese Schalter nicht — und statt
> `/dev/null` nimmst du `NUL`. Die Token-Zeile in A12 braucht `grep` und `cut`; die läuft in Git
> Bash, nicht in PowerShell.

### T8d · Das Dashboard ist von außen nicht erreichbar

R13a kennt keine Ausnahme. Vom eigenen Rechner:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://dart.mein-verein.de/_/
```

**Erwartet: `404`.** Nicht 401, nicht 403 — es soll nicht einmal erkennbar sein, dass es dort
etwas gibt (R6). Kommt eine Anmeldemaske, ist der Block im Caddyfile nicht aktiv, und du hast
PocketBases Verwaltungsoberfläche im Internet stehen. Dann sofort abschalten.

### T8c · Vor `/admin` steht ein Tor

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://dart.mein-verein.de/admin
```

**Erwartet: `401`** — der Webserver fragt nach dem Passwort aus Schritt 4, *bevor* die Anfrage den
Admin-Code überhaupt erreicht. Das ist der Sinn von R13b: Ein Fehler in diesem Code soll von außen
nicht ansprechbar sein.

Kommt `200` und du siehst die Anmeldemaske der App, fehlt das Tor.

> Hast du statt der Proxy-Anmeldung die IP-Allowlist gewählt, lautet die Erwartung `404` — und du
> musst von einer Adresse außerhalb deines Bereichs prüfen. Dafür ist das Handy im Mobilnetz da.

### T11 · Die Linkvorschau verrät nichts

Schick dir den Einladungslink des Testmitglieds **im Einzelchat an dich selbst**.

**Erwartet:** Der Messenger zeigt eine Vorschau mit dem Anzeigenamen aus den Einstellungen und
einem allgemeinen Untertitel. **Nicht** erwartet: der Name des Mitglieds, Termine, Orte oder
sonst etwas Persönliches.

Und der wichtigere Teil: **Der Link muss danach noch funktionieren.** Der Messenger ruft ihn zum
Erzeugen der Vorschau serverseitig ab; würde dabei schon eine Sitzung entstehen, wäre die
Einladung verbraucht, bevor ein Mensch sie antippt (R10). Tipp den Link also anschließend an — er
muss dich anmelden.

### T10 · Kein Token im Protokoll

Nach dem Antippen aus T11 liegt mindestens ein Aufruf von `/j/<token>` hinter dir. Auf dem Server,
und zwar **im Verzeichnis des Klons** — sonst findet `docker compose` seine Dateien nicht und
bricht mit `no such file or directory` ab:

```bash
cd ~/mannschaftsplan
```

```bash
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml \
  exec caddy grep -c '/j/' /var/log/caddy/mannschaftsplan.log
```

**Erwartet: `0`** — die Route wird gar nicht erst protokolliert (`log_skip`, R8). Ein Treffer
bedeutet, dass ein gültiger Zugang in einer Logdatei liegt; jeder mit Serverzugriff wäre dann
dieses Mitglied.

> `grep -c` beendet sich bei null Treffern mit Exit-Code 1. Die Zeile sieht dadurch aus, als sei
> sie fehlgeschlagen, obwohl `0` genau das gewünschte Ergebnis ist. Zählt die Ausgabe, nicht der
> Exit-Code.

Zur Gegenprobe, dass überhaupt protokolliert wird:

```bash
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml \
  exec caddy wc -l /var/log/caddy/mannschaftsplan.log
```

Steht dort 0, wird gar nichts geschrieben — dann prüft die Zeile darüber nichts.

### A12 · Spieltage schließen sich von selbst

Diese Prüfung braucht die Superuser-API, und die liegt hinter R13a. Genau deshalb steht sie hier:
Sie prüft den Sperr-Cron **und** den Tunnelweg, den du im Notfall ohnehin brauchst.

**1. Tunnel öffnen.** Auf dem Server im Verzeichnis des Klons (`cd ~/mannschaftsplan`) in
`docker-compose.yaml` die auskommentierte `ports`-Zeile aktivieren (`"127.0.0.1:8090:8090"`) und
den Stack mit `up -d` neu starten — `restart` genügt nicht, der Container muss neu entstehen. Dann
vom eigenen Rechner:

```bash
ssh -L 8090:127.0.0.1:8090 <benutzer>@<server>
```

**2. Frist setzen.** In der Kapitänsansicht unter Einstellungen `auto_sperre_stunden` auf **1**.

**3. Cron auslösen**, statt eine Stunde zu warten — über den Tunnel, in einem zweiten Terminal:

```bash
TOKEN=$(curl -s http://127.0.0.1:8090/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"deine@adresse.de","password":"dein-passwort"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H "Authorization: $TOKEN" http://127.0.0.1:8090/api/crons/spieltage-sperren
```

**Erwartet: `204`.**

> Der Cron läuft ohnehin stündlich zur zehnten Minute. Hat er vor deinem Handstart schon
> zugeschlagen, antwortet der Aufruf zwar mit `204`, findet aber nichts mehr zu tun — der
> Protokolleintrag stammt dann vom regulären Lauf, erkennbar am Zeitstempel. Willst du den
> Handstart selbst wirken sehen, brauchst du einen zweiten, noch offenen Spieltag in der
> Vergangenheit.

**4. Nachsehen.** Der Spieltag von gestern steht jetzt auf gesperrt, ein künftiger nicht. Im
Protokoll der Kapitänsansicht steht eine Zeile **„Spieltag gesperrt"** mit dem Vermerk
*(automatisch)* statt unter einem Namen. Der Zusatz „N h nach Anwurf" gibt die **eingestellte**
Frist wieder, nicht die verstrichene Zeit.

**5. Aufräumen:** Frist zurück auf **0**, die `ports`-Zeile wieder auskommentieren, neu starten.
Der Tunnel ist für den Notfall gedacht, nicht für den Betrieb.

---

## Teil 3 · Bevor echte Daten darauf liegen

Drei Dinge, die nicht zu den Testfällen gehören, aber vor dem ersten echten Mitglied erledigt sein
sollten:

- **T12 · Eine Sicherung zurückspielen.** `scripts/backup.sh` laufen lassen, die Datei auf einen
  anderen Rechner holen, dann über `POST /api/backups/<datei>/restore` (durch den Tunnel)
  einspielen. Danach prüfen, ob der Datenstand **und** die App wieder da sind — Hooks, Migrationen
  und die Auslieferung aus `pb_public` müssen den Neustart überstehen. Eine ungetestete Sicherung
  ist keine.
- **Auftragsverarbeitungsvertrag** mit dem Anbieter abschließen.
- **Impressum und Datenschutzhinweis** unter Einstellungen eintragen und beide Seiten einmal ohne
  Anmeldung aufrufen.

---

## Was mit den Ergebnissen passiert

- **Zettelspalte *war unklar*** → Änderungen an der README. Das ist der eigentliche Ertrag dieses
  Laufs.
- **Zettelspalte *hat nicht funktioniert*** → Fehler, mit Vorrang vor allem anderen.
- **Eine durchgefallene Handprüfung** ist ein Grund, nicht produktiv zu gehen. T8c, T8d und T10
  hängen unmittelbar an den Sicherheitsregeln; T11 daran, ob die Mannschaft überhaupt hereinkommt.
