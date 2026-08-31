# Der erste Testlauf auf einem echten Server

Dieses Dokument hat zwei Leser:

- **Wer die App für seinen Verein neu aufsetzt.** Für dich gilt es unverändert und von vorn: Du
  hast einen frischen Server, und darauf ist alles ungeprüft, bis du es geprüft hast.
- **Wer diese Installation betreibt.** Für die ist der Lauf in Teilen passiert — was genau,
  steht im nächsten Abschnitt.

Der Lauf hat zwei Zwecke, und sie sind gleich wichtig:

1. **Die Anleitung prüfen.** Du gehst sie Schritt für Schritt durch wie jemand, der sie zum
   ersten Mal liest. Wo du stolperst, stolpert später ein Vereinsadmin.
2. **Die fünf Handprüfungen erledigen**, die lokal und in der CI prinzipbedingt nicht möglich
   sind: T8c, T8d, T10, T11 und A12 aus Abschnitt 11 des [Umsetzungsplans](umsetzungsplan.md).

Rechne mit zwei Stunden. Danach ist der Server entweder dein Betrieb oder wieder weg.

---

## Woran diese Installation steht

**Der Server läuft.** Seit Ende August 2026 ist die App auf einem gemieteten Server im Internet
eingerichtet und in Betrieb: eigene Domain, Zertifikat über Let's Encrypt, Caddy nach
[`deploy/Caddyfile`](../deploy/Caddyfile). An dieser Stelle stand früher, es habe „nie" ein
`docker compose up -d` auf einer Maschine im Internet gegeben und die README sei deshalb
„unbewiesen". Beides ist überholt.

Von den Prüfungen sind zwei erledigt und vier offen:

| Prüfung | Was sie zeigt | Stand |
|---|---|---|
| **T11** | Die Linkvorschau verrät nichts, und der Link bleibt gültig | erledigt |
| **T10** | Kein Token im Protokoll des Webservers | erledigt |
| **T8d** | `/_/` ist von außen nicht erreichbar | **offen** |
| **T8c** | Vor `/admin` steht das Gate | **offen** |
| **A12** | Spieltage schließen sich von selbst | **offen** |
| **T12** | Eine Sicherung lässt sich zurückspielen | **offen** |

Zwei Anmerkungen dazu, die niemandem gefallen, aber hierher gehören:

**Die beiden offenen Sicherheitsprüfungen sind die schnellsten von allen.** T8c und T8d sind zwei
`curl`-Aufrufe, zusammen keine halbe Minute. Sie stehen aus, während auf der Installation bereits
echte Namen und Termine liegen. Geprüft wird damit genau das, was eine Proxy-Konfiguration still
falsch machen kann: ob PocketBases Verwaltungsoberfläche und das Admin-Gebiet von außen wirklich
verschlossen sind. Bis dahin sind R13a und R13b eine **Absicht** und kein **Befund** — die
Konfiguration sieht richtig aus, aber niemand hat von außen dagegen geklopft.

**T12 ist die zweite Lücke mit Folgen.** Eine Sicherung, die nie zurückgespielt wurde, ist keine
Sicherung, sondern eine Datei, von der man annimmt, dass sie eine wäre. Sie kostet mehr Zeit als
die beiden anderen, aber sie ist der einzige Punkt auf dieser Liste, an dem im Ernstfall Daten
hängen.

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

> **Auf dieser Installation ist dieser Teil gelaufen** — der Server steht, mit Domain, Zertifikat
> und Caddy. Ein Zettel im obigen Sinn ist dabei nicht geführt worden; die Anleitung ist seither
> aus anderen Anlässen mehrfach überarbeitet worden. Wer die App neu aufsetzt, führt ihn also
> für sich selbst und nicht für jemanden, der es schon aufgeschrieben hätte.

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

> **Auf dieser Installation offen.** Zwei Sekunden Arbeit, und sie steht seit dem Produktivgang
> aus. Wer sie nachholt, trägt hier „erledigt" ein und streicht die Zeile in der Übersicht oben.

R13a kennt keine Ausnahme. Vom eigenen Rechner:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://dart.mein-verein.de/_/
```

**Erwartet: `404`.** Nicht 401, nicht 403 — es soll nicht einmal erkennbar sein, dass es dort
etwas gibt (R6). Kommt eine Anmeldemaske, ist der Block im Caddyfile nicht aktiv, und du hast
PocketBases Verwaltungsoberfläche im Internet stehen. Dann sofort abschalten.

### T8c · Vor `/admin` steht ein Gate

> **Auf dieser Installation offen** — dasselbe gilt wie bei T8d: ein Aufruf, sofort erledigt.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://dart.mein-verein.de/admin
```

**Erwartet: `401`** — der Webserver fragt nach dem Passwort aus Schritt 4, *bevor* die Anfrage den
Admin-Code überhaupt erreicht. Das ist der Sinn von R13b: Ein Fehler in diesem Code soll von außen
nicht ansprechbar sein.

Kommt `200` und du siehst die Anmeldemaske der App, fehlt das Gate.

> Hast du statt der Proxy-Anmeldung die IP-Allowlist gewählt, lautet die Erwartung `404` — und du
> musst von einer Adresse außerhalb deines Bereichs prüfen. Dafür ist das Handy im Mobilnetz da.

### T11 · Die Linkvorschau verrät nichts

> **Auf dieser Installation erledigt.** Die Vorschau zeigte nichts Persönliches, und der Link hat
> danach noch angemeldet — die Vorschau hatte ihn also nicht verbraucht (R10).

Schick dir den Einladungslink des Testmitglieds **im Einzelchat an dich selbst**.

**Erwartet:** Der Messenger zeigt eine Vorschau mit dem Anzeigenamen aus den Einstellungen und
einem allgemeinen Untertitel. **Nicht** erwartet: der Name des Mitglieds, Termine, Orte oder
sonst etwas Persönliches.

Und der wichtigere Teil: **Der Link muss danach noch funktionieren.** Der Messenger ruft ihn zum
Erzeugen der Vorschau serverseitig ab; würde dabei schon eine Sitzung entstehen, wäre die
Einladung verbraucht, bevor ein Mensch sie antippt (R10). Tipp den Link also anschließend an — er
muss dich anmelden.

### T10 · Kein Token im Protokoll

> **Auf dieser Installation erledigt.** Die Route wird nicht protokolliert, und die Gegenprobe
> zeigte, dass überhaupt geschrieben wird — die Zeile prüft also etwas (R8).

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

> **Auf dieser Installation offen.** Die aufwendigste der fünf: Sie braucht den SSH-Tunnel und
> einen abgelaufenen Spieltag. Anders als T8c und T8d hängt an ihr keine Sicherheitsregel — geht
> sie schief, sperren sich alte Spieltage eben nicht von selbst, und der Kapitän tut es von Hand.

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

- **T12 · Eine Sicherung zurückspielen.** *Auf dieser Installation offen — und der Punkt dieser
  Liste, an dem im Ernstfall Daten hängen.* Eine ungetestete Sicherung ist keine. Der Ablauf hat
  eine Stelle, die man beim ersten Mal nicht errät:

  1. **Port öffnen** wie in A12 Schritt 1 — auch wenn du auf dem Server selbst arbeitest.
     `backup.sh` spricht `http://127.0.0.1:8090` an, und ohne die `ports`-Zeile lauscht dort
     nichts.
  2. **`scripts/backup.sh` laufen lassen.** Es erzeugt die Sicherung, lädt sie herunter — und
     **löscht den Serverstand danach wieder**. Das ist Absicht, damit `pb_data` nicht wächst.
  3. **Die Datei auf einen anderen Rechner holen** (`scp`) und den Stand auf dem Server löschen.
     Solange sie die Maschine nicht verlassen hat, prüfst du nichts.
  4. **Etwas anlegen, das verschwinden muss** — etwa ein Mitglied namens `RESTORE-TEST`. Ohne das
     siehst du hinterher denselben Datenstand wie vorher und weißt nicht, ob überhaupt etwas
     passiert ist.
  5. **Datei zurückschieben und hochladen.** Weil Schritt 2 den Serverstand gelöscht hat, kennt
     PocketBase die Datei nicht mehr — sie muss erst wieder hinein:

     ```bash
     curl -s -o /dev/null -w '%{http_code}
' -X POST http://127.0.0.1:8090/api/backups/upload        -H "Authorization: $TOKEN" -F "file=@$HOME/backup/<datei>"
     ```

     Erst danach greift `POST /api/backups/<datei>/restore`. Beide antworten mit `204`.
  6. **Nachsehen, und zwar zweimal.** Sind Mitglieder und Spieltage zurück und `RESTORE-TEST` weg?
     Und läuft die **App** noch — Aushang, Einladungslink, Datenschutzseite? Hooks, Migrationen
     und die Auslieferung aus `pb_public` müssen den Neustart überstehen. Das ist der Teil, den
     man übersieht.

  Danach die `ports`-Zeile wieder schließen und die Sicherungsdatei vom Server nehmen — sie liegt
  dort unverschlüsselt und enthält alles.
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
- **Eine nicht durchgeführte Handprüfung ist etwas anderes als eine bestandene**, und der
  Unterschied verwischt schnell, wenn der Betrieb erst einmal läuft und nichts auffällt. Genau
  deshalb steht oben eine Tabelle mit vier offenen Zeilen und nicht ein Satz, dass alles in
  Ordnung sei. Wer eine davon nachholt, trägt das Ergebnis dort und beim jeweiligen Abschnitt ein
  — auch ein *nicht bestanden*.
