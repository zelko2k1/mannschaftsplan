# Mannschaftsplan

Wer fährt, wer kommt mit, wer sagt ab — für **eine** Dartmannschaft von acht bis zehn Leuten.
Der Spielplan sieht aus wie ein Fahrplanaushang am Bahnsteig: eine Zeile pro Spieltag, mit
Abfahrtszeit, Gegner und der Frage, ob noch ein Platz im Auto frei ist.

**Die Mannschaft muss sich nirgends anmelden.** Jedes Mitglied bekommt einen persönlichen Link,
den es sich einmal aufs Handy legt. Kein Konto, kein Passwort, keine App aus dem Store. Nur der
Kapitän meldet sich an.

Die App läuft auf deinem eigenen Server. Keine Werbung, keine Statistik-Dienste, keine Daten bei
Dritten.

> **Nicht zu verwechseln** mit [DartsZentrale](https://github.com/zelko2k1/dartszentrale) — das ist
> die große Vereins-App mit Counter, Ligen und Statistik. Diese hier kann nur eines: Termine und
> Fahrdienst für eine einzige Mannschaft. Sie kennt keine Ergebnisse.

---

## Für Betreiber

Dieser Teil richtet sich an den, der die App aufsetzt und betreut — Kapitän, Schriftführer oder
wer im Verein sich damit befasst. Programmierkenntnisse braucht es nicht. Wer die App
weiterentwickeln will, findet alles Weitere unter [Für Entwickler](#für-entwickler).

### Was du brauchst

| | |
|---|---|
| **Einen kleinen Server** | Bei einem Anbieter deiner Wahl. Das kleinste Angebot reicht — die App ist für zehn Leute gedacht, nicht für zehntausend. Darauf muss **Docker** installiert sein, mit **Compose 2.24 oder neuer** (`docker compose version`). Jede halbwegs aktuelle Docker-Installation bringt das mit. |
| **Einen Namen im Internet** | Etwa `dart.mein-verein.de`. Eine Subdomain einer Domain, die du schon hast, genügt völlig. |
| **Eine E-Mail-Adresse** | Nur für die automatischen Hinweise, wenn das Sicherheitszertifikat abläuft. |
| **Eine halbe Stunde** | |

Warum ein Server im Internet und nicht der Rechner zu Hause: Die Mannschaft tippt ihre Links
unterwegs an, aus dem Mobilnetz. Was nur im heimischen WLAN erreichbar ist, hilft am Spieltag
niemandem.

### Einrichten

**1 · Den Namen auf den Server zeigen lassen**

Bei deinem Domain-Anbieter einen sogenannten A-Record anlegen: `dart.mein-verein.de` → die
IP-Adresse deines Servers. Das dauert je nach Anbieter ein paar Minuten, bis es überall bekannt
ist. Ohne diesen Schritt bekommt die App im nächsten Schritt kein Sicherheitszertifikat.

**2 · Docker einrichten**

Manche Anbieter haben ein fertiges Serverabbild mit Docker — dann bist du hier schon fertig.
Sonst installierst du es nach der [offiziellen Anleitung von
Docker](https://docs.docker.com/engine/install/).

> **Nicht** `apt install docker.io docker-compose` nehmen. Die Paketquellen der Distributionen
> liefern je nach Alter eine zu alte Fassung, und daran scheitert später das Passwort aus
> Schritt 4 — siehe [Wenn etwas nicht klappt](#wenn-etwas-nicht-klappt).

<details>
<summary>Die Befehle für Ubuntu, zum Kopieren</summary>

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Bei Debian statt `.../linux/ubuntu` überall `.../linux/debian` einsetzen.

</details>

Danach nachsehen, ob es gereicht hat:

```bash
docker compose version
```

Steht dort eine Zahl **kleiner als 2.24**, geht es nicht weiter — dann ist Docker zu alt, und
später wird dein Passwort nicht angenommen, ohne dass irgendetwas nach einem Fehler aussieht.

**3 · Die App auf den Server holen**

Auf dem Server einloggen. Frische Serverabbilder bringen `git` oft nicht mit — dann fehlt der
nächste Befehl mit `command not found`, und du holst es nach:

```bash
sudo apt install -y git
```

Danach:

```bash
git clone https://github.com/zelko2k1/mannschaftsplan.git
cd mannschaftsplan
cp .env.example .env
```

**4 · Ein Passwort für die Kapitänsseite festlegen**

Bevor überhaupt jemand die Kapitänsseite zu sehen bekommt, fragt der Webserver nach einem
Passwort. Das ist eine zusätzliche Tür vor der eigentlichen Anmeldung — sie sorgt dafür, dass
Fremde die Verwaltung gar nicht erst zu Gesicht bekommen.

Dieses Passwort wird nicht im Klartext gespeichert, sondern als unlesbare Prüfsumme. Die lässt du
dir ausrechnen:

```bash
docker run --rm caddy:2.11.4-alpine caddy hash-password --plaintext 'dein-passwort'
```

Heraus kommt eine kryptische Zeile, die mit `$2a$` beginnt. Die brauchst du gleich.

**5 · Die vier Werte eintragen**

Die Datei `.env` öffnen (`nano .env`) und ausfüllen:

```
DOMAIN=dart.mein-verein.de
ACME_EMAIL=du@mein-verein.de
ADMIN_USER=kapitaen
ADMIN_PASSWORD_HASH=$2a$14$…die Zeile von eben…
```

Mehr ist es nicht. In der Datei stehen keine Vorgaben, die du übernehmen könntest — jeder Wert ist
deiner.

> Wenn du später einen dieser Werte korrigierst: Die Änderung wirkt erst, wenn die Container **neu
> erstellt** werden. `docker compose restart` genügt dafür **nicht** — es startet dieselben
> Container mit der alten Umgebung wieder. Nötig ist derselbe Befehl wie in Schritt 6, also
> `… up -d`.

**6 · Starten**

```bash
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml up -d
```

Der erste Start dauert ein paar Minuten, weil die App gebaut wird. Das Sicherheitszertifikat holt
sie sich danach selbst; du musst dich darum nie kümmern, auch nicht um die Verlängerung.

Fehlt einer der vier Werte, startet nichts und du bekommst gesagt, welcher fehlt. Das ist Absicht:
lieber gar nicht starten als halb eingerichtet im Internet stehen.

**7 · Deinen Kapitänszugang anlegen**

```bash
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml exec mannschaftsplan \
  /usr/local/bin/pocketbase superuser upsert deine@adresse.de dein-passwort --dir=/pb_data
```

Das ist die Anmeldung für die Kapitänsseite — eine andere als die aus Schritt 4. Die Adresse muss
wie eine echte E-Mail-Adresse aussehen. Das Passwort steht danach in der Befehls-Historie deiner
Shell; wenn dich das stört, lösche sie mit `history -c`.

**8 · Die Mannschaft eintragen**

`https://dart.mein-verein.de/admin` aufrufen. Es kommen **zwei** Abfragen nacheinander: erst das
Passwort aus Schritt 4 (der Browser fragt in einem kleinen Fenster), dann die Anmeldung aus
Schritt 7 auf der Seite selbst.

Dort legst du die Mitglieder an. Bei jedem gibt es den Knopf **„Neues Token"** — der erzeugt den
persönlichen Link für dieses Mitglied.

> **Wichtig:** Dieser Link wird **genau einmal** angezeigt. Danach ist er nicht wieder
> hervorzuholen, auch nicht von dir. Das ist kein Versehen, sondern Absicht: gespeichert wird nur
> ein Fingerabdruck des Links, nicht der Link selbst. Wer bei uns einbricht, findet keine gültigen
> Zugänge vor. Kopiere ihn also gleich in den Einzelchat des Mitglieds. Ist er weg, drückst du
> einfach noch einmal auf „Neues Token".

Danach die Spieltage eintragen — Datum, Anwurfzeit, Gegner, Ort, Entfernung. Fertig.

**9 · Einstellungen anpassen** *(freiwillig, aber lohnend)*

Der Reiter **Einstellungen** hat vier Dinge:

**Name des Vereins.** Er steht dort, wo es um die Anwendung als Ganzes geht: über Impressum und
Datenschutzhinweis, auf der Seite „Link ungültig", und als Herausgeber in der Authenticator-App.
Voreingestellt ist „Mannschaftsplan".

Auf der **Einladungsseite** steht dagegen der Name der Mannschaft, zu der der Link gehört — den
erwartet das Mitglied, und er landet in der Vorschau, die WhatsApp und andere Messenger erzeugen.
Ist der Link tot oder das Mitglied deaktiviert, erscheint dort der Vereinsname; die beiden Fälle
bleiben damit ununterscheidbar.

> Diese Vorschau entsteht auf den Servern des Messengers, **bevor** ein Mensch den Link antippt.
> Was dort steht, sieht also jeder, dem ein Link weitergeleitet wird. Der Mannschafts- oder
> Vereinsname ist dafür in Ordnung. Namen einzelner Personen, Adressen oder Spielorte gehören
> nicht hinein.

**Abfahrtszeit.** Die App trägt die Abfahrt nicht ein, sie rechnet sie: Strecke geteilt durch
Tempo, plus Puffer, auf fünf Minuten gerundet, vom Anwurf abgezogen. Voreingestellt sind 80 km/h
und 25 Minuten. Fahrt ihr über Land, stimmt ein höheres Tempo; in der Stadt ein niedrigeres.

Beide Werte stehen **am einzelnen Spieltag** — die Autobahn nach Köln und die Halle im
Nachbarort teilen sich weder Tempo noch Rüstzeit. Bleiben die Felder leer, gelten 80 km/h und
25 Minuten.

Und über allem steht die **von Hand eingetragene Abfahrt** am Spieltag: Die übergeht die Formel
ganz.

**Spieltage von selbst schließen.** Ein gespielter Spieltag soll keine Rückmeldungen mehr
annehmen, sonst ändert jemand hinterher seine Zusage. Trägst du hier eine Stundenzahl ein,
erledigt das die App; bei **0** bleibt es bei deinem Handgriff nach dem Spiel. Geprüft wird
stündlich, ein Spieltag schließt also bis zu eine Stunde nach Ablauf der Frist.

**Impressum und Datenschutzhinweis.** Zwei Textfelder, aus denen je eine eigene Seite wird —
verlinkt im Fuß des Aushangs und auf der Einladungsseite, erreichbar auch ohne Anmeldung. Bleibt
ein Feld leer, gibt es die Seite nicht und es wird auch nicht darauf verlinkt; ein leeres
Impressum ist schlechter als keins. Geschrieben wird reiner Text: Absätze durch Leerzeilen,
HTML wird angezeigt statt ausgewertet.

> Ob und was du dort hineinschreiben musst, ist eine Rechtsfrage, und dieser Text ist **keine
> Rechtsberatung.** Grobe Orientierung: Ein Impressum nach § 5 DDG trifft vor allem
> geschäftsmäßige Angebote — diese App ist nicht öffentlich auffindbar und richtet sich an einen
> geschlossenen Kreis, was dagegen spricht. Der **Datenschutzhinweis** ist der wichtigere Teil:
> Sobald du Namen und Rückmeldungen von Menschen speicherst, greift die DSGVO, unabhängig von der
> Größe. Dazu gehören ein Auftragsverarbeitungsvertrag mit deinem Server-Anbieter (Hetzner und
> IONOS stellen ihn fertig ins Kundenkonto) und die Information der Mitglieder darüber, was wozu
> und wie lange gespeichert wird. Beim Löschen hilft die App: Spieltage verschwinden nach einem
> Jahr, das Protokoll nach 90 Tagen, Sitzungen nach einem halben Jahr. Im Zweifel jemanden fragen,
> der beraten darf — viele Landessportbünde tun das für ihre Vereine kostenlos.

### Der Alltag

**Ein Mitglied hat seinen Link verloren.** In der Kapitänsansicht auf „Neues Token". Der alte Link
ist damit sofort tot, und alle Geräte, auf denen dieses Mitglied angemeldet war, fliegen raus.

**Ein Link ist in falsche Hände geraten.** Dasselbe. Wer den Link eines Mitglieds hat, *ist* dieses
Mitglied — das ist der Preis dafür, dass sich niemand anmelden muss. Deshalb: Links immer im
Einzelchat verschicken, nie in der Mannschaftsgruppe, und keine Bildschirmfotos davon herumzeigen.

**Jemand verlässt die Mannschaft.** Das Mitglied auf inaktiv setzen. Es verschwindet aus den
Listen und ist sofort von allen Geräten abgemeldet.

**Ein Spieltag ist gelaufen.** Auf „gesperrt" setzen — dann kann niemand mehr nachträglich seine
Zusage ändern. Wenn du unter Einstellungen eine Frist hinterlegt hast, passiert das von selbst;
im Protokoll steht die Zeile dann mit dem Vermerk „(automatisch)".

### Mehrere Mannschaften

Ein Verein mit sieben Mannschaften braucht keine sieben Instanzen. Eine reicht, und darin gibt es
zwei Rollen:

| Rolle | Reiter | Darf |
|---|---|---|
| **Admin** | Spieltage, Mannschaften, Einstellungen, Protokoll | Alles. Legt Mannschaften und Kapitäne an, pflegt Rechtstexte und Sicherungen. |
| **Kapitän** | Spieltage, Mannschaft, Protokoll | Nur seine eigene Mannschaft: Mitglieder anlegen und bearbeiten, Spieltage pflegen, Rückmeldungen korrigieren, seine Mannschaft benennen. |

Beide erreichen über ihren Namen im Kopf **Mein Konto** — zweiter Faktor und eigenes Passwort.
Das gehört zur Person und zu keiner Mannschaft, deshalb steht es nicht in der Reiterleiste.

**Der Admin ist kein Spieler und kein Kapitän.** Er hat weder eine Mannschaft noch einen
Spielereintrag; die Route lehnt beides ab. Wer verwaltet, soll in seiner eigenen Verwaltung nicht
Partei sein.

**Ein Kapitän dagegen spielt meistens mit.** Sein Konto lässt sich deshalb mit seinem
Spielereintrag verknüpfen — dieselbe Trennung wie in der Dartszentrale: Die Mitgliederliste ist
die einzige Quelle für sportliche Personen, Login-Konten sind davon getrennt und verweisen
*optional* auf einen Spieler. Wer nur organisiert, bleibt unverknüpft. Verknüpfen lässt sich nur
ein Spieler derselben Mannschaft.

Wer sich mit dem Zugang aus Einrichtungsschritt 7 anmeldet — dem Superuser —, ist immer *Admin*.
Das ist Absicht und der Rettungsanker: Wer sich beim Verteilen der Rollen vergreift, kommt darüber
wieder herein.

Alles, was einer Mannschaft gehört, steht im Reiter **Mannschaften**: ihr Name, ihre Mitglieder
und ihre Kapitäne. Welche Mannschaft gemeint ist, wählst du oben aus; ein Kapitän hat
dort genau eine.

**Kapitäne anlegen** geht ebenfalls dort. Der **Anmeldename** hat E-Mail-Form — das verlangt
PocketBase —, muss aber **keine echte Adresse sein**: `kapitaen@verein.intern` genügt. Es wird nie
etwas dorthin geschickt, die App hat keinen Mailserver. Das Passwort wird erzeugt und **genau
einmal angezeigt**, wie der Einladungslink eines Mitglieds; gespeichert ist davon nur ein Hash.
Ist es weg, erzeugst du ein neues.

**Mehrere Kapitäne je Mannschaft sind vorgesehen** — eine Vertretung ist schlicht ein zweites
Konto mit denselben Rechten. Einen eigenen Begriff dafür gibt es nicht: Wer was getan hat, steht
ohnehin im Protokoll.

**Zum zweiten Faktor der Kapitäne** siehst du in der Liste, wer einen eingerichtet hat, und
kannst ihn **abschalten** — der Ausweg, wenn jemand sein Handy verliert. *Einrichten* kannst du
ihn nicht für andere, und das ist Absicht: Ein Geheimnis, das über deinen Bildschirm liefe, wäre
keines mehr, denn du könntest dich danach als dieser Kapitän anmelden. Jedes Abschalten steht im
Protokoll.

> **Die Abschottung ist nicht nur eine Anzeigefrage.** Ein Kapitän ist kein Superuser: Auf keiner
> Tabelle liegen Regeln, die ihm etwas erlaubten, und jeder seiner Zugriffe läuft durch die Routen
> der Kapitänsansicht. Schickt er die Kennung einer fremden Mannschaft mit, wird sie nicht
> gelesen — er bekommt seine eigene, so wie ein Mitglied im Aushang immer sich selbst ändert und
> nie jemand anderen.

Alle sieben teilen sich weiterhin **ein** Passwort für das Tor aus Schritt 4. Dessen Rolle ändert
sich damit: Es ist die Vorfilterung, nicht die Anmeldung. Wird es doch einmal öffentlich, steht
nicht die Verwaltung offen, sondern nur der Anmeldebildschirm.

**Eine Mannschaft auflösen** geht erst, wenn sie leer ist — keine Mitglieder, keine Spieltage,
kein Kapitän. Ein Klick, der ein Jahr Spielbetrieb mitnähme, wäre zu scharf.

### Zweiter Faktor für die Kapitänsansicht

Unter **Einstellungen → Zweiter Faktor** lässt sich zusätzlich zum Passwort ein sechsstelliger
Code aus einer Authenticator-App verlangen. Wer dein Passwort erfährt, kommt damit trotzdem nicht
in die Kapitänsansicht.

Einrichten: auf **Einrichten** klicken, den angezeigten Link auf dem Handy antippen (dann öffnet
sich die App von selbst) oder das Geheimnis am Rechner von Hand eintragen, dann einen Code
eintippen. Erst damit gilt er — eine abgebrochene Einrichtung sperrt dich nicht aus. Es
funktioniert mit jeder gängigen App: Aegis, 2FAS, Google Authenticator, Bitwarden, 1Password.

Jeder Code gilt genau einmal. Nach dem Anmelden musst du für die nächste Aktion, die einen Code
braucht, bis zum nächsten Wechsel warten — höchstens eine halbe Minute.

> **Was er schützt.** Die **Kapitänsansicht** unter `/admin`. Damit er nicht zu umgehen ist,
> liegt seit R13c auch die **Superuser-Anmeldung** der API hinter dem Tor aus
> Einrichtungsschritt 4 — sonst holte sich jemand mit Adresse und Passwort über
> `/api/collections/_superusers/auth-with-password` einen Token, käme an die ganze Datenbank,
> ohne `/admin` je zu berühren, und könnte dort auch den zweiten Faktor löschen.

**Handy verloren?** Dann kommst du über die Oberfläche nicht mehr hinein; das Abschalten verlangt
selbst einen Code. Der Ausweg führt über die API — mit deinem Superuser-Passwort **und** den
Zugangsdaten des Tors aus Schritt 4 (`-u`):

```bash
TOKEN=$(curl -s -u kapitaen:tor-passwort \
  https://dart.mein-verein.de/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"deine@adresse.de","password":"dein-passwort"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
ID=$(curl -s https://dart.mein-verein.de/api/collections/admin_totp/records \
  -H "Authorization: $TOKEN" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["id"])')
curl -X DELETE "https://dart.mein-verein.de/api/collections/admin_totp/records/$ID" \
  -H "Authorization: $TOKEN"
```

Danach genügt wieder das Passwort, und du kannst neu einrichten.

### Sicherungen

Es gibt zwei Wege, und du brauchst beide.

**Von Hand, in der Kapitänsansicht.** Unter **Einstellungen → Sicherungen** liegen vier Knöpfe:
erstellen, herunterladen, zurückgeben, löschen. Dafür brauchst du weder SSH noch einen Dateipfad
— die Datei landet in deinem Download-Ordner wie jeder andere Download auch. Nimm sie **vom
Server weg**: Eine Kopie, die neben dem Original liegt, ist im Ernstfall genauso verloren wie das
Original.

> Die heruntergeladene Datei ist **unverschlüsselt** und enthält den gesamten Datenbestand, also
> alle Namen. Sie gehört auf deinen eigenen Rechner — nicht in eine Cloud und nicht in einen
> Gruppenchat.

**Automatisch, als nächtlicher Cronjob.** Der Knopf wird gedrückt, wenn jemand daran denkt;
dazwischen liegt der Datenverlust. Das Skript läuft auf **einer anderen Maschine** — deinem
Rechner zu Hause, einem kleinen Server, was du hast:

```bash
PB_URL=https://dart.mein-verein.de \
  PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… \
  ADMIN_USER=kapitaen ADMIN_PASSWORD=… \
  BACKUP_DIR=/backup GPG_EMPFAENGER=… \
  ./scripts/backup.sh
```

> **Zwei Angaben, die leicht fehlen.** Ohne **`PB_URL`** versucht das Skript
> `http://127.0.0.1:8090` — also den Rechner, auf dem es gerade läuft — und bricht mit „Could not
> connect to server" ab. Und **`ADMIN_USER`/`ADMIN_PASSWORD`** sind die Zugangsdaten des Tors aus
> Schritt 4 (das Passwort im Klartext, nicht der Hash): Seit R13c liegt die Superuser-Anmeldung
> dahinter. Fehlen sie, sagt dir das Skript genau das, statt dich ein falsches
> Superuser-Passwort suchen zu lassen.
>
> Ein SSH-Tunnel ist für all das nicht nötig. Wer trotzdem einen benutzt und direkt auf 8090
> geht, lässt `ADMIN_USER` und `ADMIN_PASSWORD` weg — hinter dem Tunnel steht kein Caddy.

Und **ohne `GPG_EMPFAENGER` liegt die Datei unverschlüsselt herum.** Das Skript sagt es dir, aber
es hindert dich nicht daran.

**Zurückspielen.** In der Kapitänsansicht: Datei über „Zurückgeben" hochladen, dann bei ihr auf
„Zurückspielen". Zur Bestätigung musst du den Dateinamen abtippen, und die App legt vorher
automatisch eine Kopie des jetzigen Standes an — ein Fehlgriff ist damit zurücknehmbar. Danach
startet die App neu und ist ein paar Sekunden nicht erreichbar.

> **Probier das einmal aus, bevor du es brauchst.** Eine ungetestete Sicherung ist keine. Leg dir
> dafür ein Wegwerf-Mitglied an, spiel eine ältere Sicherung ein und sieh nach, ob es verschwindet
> — sonst weißt du hinterher nicht, ob überhaupt etwas passiert ist.

### Wenn schon ein Reverse Proxy läuft

Läuft auf dem Server bereits ein Webserver, der andere Dienste ausliefert — Caddy, nginx,
Traefik —, dann lässt du den zweiten Teil des Startbefehls weg:

```bash
docker compose up -d
```

Die App belegt dann **keinen einzigen Port** auf dem Server; sie kann sich also mit nichts in die
Quere kommen, was dort schon läuft. Dein vorhandener Webserver muss sie nur finden können:

```bash
docker network connect mannschaftsplan <name-deines-proxy-containers>
```

Danach ist die App für ihn unter `http://mannschaftsplan:8090` erreichbar. Einen fertigen
Konfigurationsblock für Caddy findest du in
[`deploy/Caddyfile.homelab.example`](deploy/Caddyfile.homelab.example); für nginx oder Traefik
bildest du dieselben vier Punkte nach — Sicherheitskopfzeilen, die Tür vor `/admin`, Einladungs-
links nicht mitschreiben, und keine Adresszusätze im Protokoll.

### Wenn etwas nicht klappt

**„Der Browser sagt, die Verbindung sei nicht sicher."** Meist zeigt der Name noch nicht auf den
Server, oder er zeigt erst seit ein paar Minuten dorthin. Nachsehen, warum das Zertifikat nicht
kommt:

```bash
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml logs caddy
```

> Die beiden `-f`-Angaben gehören bei **jedem** `docker compose`-Befehl dazu, sonst kennt Docker
> nur die halbe Anlage. Wer das lästig findet, schreibt einmalig
> `COMPOSE_FILE=docker-compose.yaml:docker-compose.caddy.yaml` in die `.env` — dann genügt
> überall `docker compose …` ohne Angaben.

**„Der Einladungslink tut nichts."** Die Links funktionieren nur über `https://`. Über eine nackte
IP-Adresse oder über `http://` weigert sich der Browser, die nötige Sitzung zu speichern — das
lässt sich nicht abstellen, es ist eine Schutzmaßnahme des Browsers.

**„Ich komme nicht auf `/admin`."** Zwei Passwörter, zwei Schritte: erst das aus Einrichtungs-
schritt 4 im Browser-Fenster, dann das aus Schritt 7 auf der Seite. Nach fünf Fehlversuchen ist
die Anmeldung eine Viertelstunde gesperrt — auch für das richtige Passwort.

**„Ich habe mein Kapitäns-Passwort vergessen."** Schritt 7 noch einmal ausführen; `upsert`
überschreibt den vorhandenen Zugang.

**„Das Passwort aus Schritt 4 wird nicht angenommen."** Zwei Ursachen, beide sehen gleich aus: Das
Browser-Fenster fragt endlos neu, ohne dass irgendwo ein Fehler steht.

1. **Docker ist zu alt.** Prüfe `docker compose version`. Bei älteren Ausgaben als 2.24 verstümmelt
   Docker die Prüfsumme beim Einlesen — dann passt sie nicht mehr zu deinem Passwort. Abhilfe:
   Docker aktualisieren.
2. **Die Korrektur in der `.env` ist nie angekommen.** Hast du den Wert geändert und danach nur
   `docker compose … restart` gemacht, läuft der Webserver weiter mit der alten Umgebung. Der
   Container muss neu entstehen:

   ```bash
   docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml up -d
   ```

   Hilft das nicht, mit Nachdruck: dasselbe noch einmal mit `--force-recreate caddy` am Ende.

**Neue Version einspielen:**

```bash
git pull
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml up -d --build
```

Die Daten bleiben dabei erhalten — sie liegen außerhalb der App in einem eigenen Datenspeicher.

### Was die App für deine Sicherheit tut

Damit du weißt, worauf du dich verlässt — und worauf nicht:

- **Von den Einladungslinks wird nichts gespeichert**, nur ein Fingerabdruck. Ein Einbruch in die
  Datenbank liefert keine funktionierenden Zugänge.
- **Die Links stehen in keinem Protokoll.** Der Webserver schreibt genau diese Adressen nicht mit.
- **Die Verwaltungsoberfläche der Datenbank ist von außen gar nicht erreichbar** — nicht
  eingeschränkt, sondern abgeschaltet. Für den Alltag brauchst du sie nie.
- **Vor der Kapitänsseite steht eine zusätzliche Tür**, unabhängig von der Anmeldung in der App.
  Deshalb die zwei Passwörter.
- **Falsche Zugangsdaten verraten nichts** — ob eine Adresse existiert oder nicht, sieht von außen
  gleich aus.

Was die App **nicht** leisten kann: Wer den Link eines Mitglieds bekommt, ist dieses Mitglied.
Diesen Preis zahlt sie dafür, dass sich niemand anmelden muss. Der Schutz liegt darin, wie du die
Links verteilst.

Findest du eine Sicherheitslücke, melde sie bitte **vertraulich** und nicht als öffentliches
Issue — siehe [`SECURITY.md`](SECURITY.md).

---

## Für Entwickler

### Lokal starten, ohne Docker

Zwei Terminals:

```bash
./scripts/dev-pb.sh                    # holt PocketBase 0.39.5 beim ersten Mal, serve auf 127.0.0.1:8090
cd app && npm install && npm run dev   # Vite auf 127.0.0.1:5173, proxyt nach 8090
```

Dann **`http://localhost:5173`** öffnen — nicht die LAN-IP. Das Session-Cookie ist laut R2
`Secure`; Browser akzeptieren das auf `localhost` auch über HTTP, über eine LAN-IP dagegen nicht.
Der Login-Link funktioniert dort also schlicht nicht. Für ein echtes Handy hilft Port-Forwarding
über `chrome://inspect` — dann ist es auch dort `localhost`.

Superuser anlegen:

```bash
cd pocketbase && ./pocketbase superuser upsert <deine-adresse> <dein-passwort> --dir=pb_data
```

Produktionsnaher Schnelltest ohne Docker — alles same-origin auf `:8090`:

```bash
cd app && npm run build      # baut nach ../pocketbase/pb_public/
```

### Aufbau

Ein Container: PocketBase liefert das gebaute Frontend aus `pb_public` gleich mit, Migrationen und
Hooks liegen fest im Image. Eine Origin, damit die Cookies aus R2/R11 ohne CORS auskommen.
Persistent ist genau ein Volume, `pb_data`.

Der Stack veröffentlicht keinen Host-Port (`expose` statt `ports`) — der einzige Weg hinein führt
über den Reverse Proxy, der sich ans Netz `mannschaftsplan` hängt.
[`docker-compose.yaml`](docker-compose.yaml) liegt in der Repo-Wurzel und nicht in `deploy/`, weil
der Build-Kontext die Wurzel ist und ein Kontext oberhalb der Compose-Datei je nach Werkzeug nicht
auflöst. [`deploy/Caddyfile`](deploy/Caddyfile) wird schreibgeschützt eingehängt und **nicht
editiert**; alles Veränderliche kommt aus der `.env`.

Ausgeliefert wird in zwei Varianten, geschnitten danach, ob der Stack seinen eigenen Proxy
mitbringt — Einzelheiten in Abschnitt 7.1 des Umsetzungsplans.

### Tests

```bash
cp .env.example .env         # Adresse und Passwort des Superusers eintragen
set -a && . ./.env && set +a
node scripts/api-tests.mjs   # Testfälle aus Abschnitt 11, gegen ein laufendes PocketBase
cd app && npm test           # Logik im Frontend
```

Die API-Tests legen eigene Datensätze an (Präfix `test-`) und räumen sie wieder weg — vorbereitet
werden muss dafür nichts. Dieselbe Suite läuft in der CI gegen ein Wegwerf-PocketBase **und** gegen
das gebaute Container-Image. Die CI prüft außerdem beide Caddy-Vorlagen mit `caddy validate` gegen
dieselbe Version, die im Betrieb läuft.

T8c, T8d, T10, T11 und T12 (Tür vor `/admin`, Dashboard von außen, Access-Log, Linkvorschau,
Rücksicherung) lassen sich nicht sinnvoll automatisieren und stehen als Handprüfung in Abschnitt 11
des Umsetzungsplans. Sie brauchen einen öffentlich erreichbaren Server.

### Sicherheitsregeln

Verbindlich, nicht verhandelbar, vollständig in Abschnitt 4 des Umsetzungsplans. Die beiden, die
den Betrieb am stärksten prägen:

- **R13a** — `/_/` ist nie öffentlich erreichbar. Keine Allowlist, kein Schalter. Zugang über einen
  SSH-Tunnel auf einen an `127.0.0.1` gebundenen Port, siehe die Kommentare in
  [`docker-compose.yaml`](docker-compose.yaml).
- **R13b** — vor `/admin` steht ein Tor, das nicht das Kapitäns-Passwort ist: IP-Allowlist oder
  vorgeschaltete Proxy-Anmeldung. Ohne eines von beiden bleibt `/admin` zu.
- **R13c** — dasselbe Tor steht vor `/api/collections/_superusers/*`. Dort wird der
  Superuser-Token ausgegeben, und mit ihm steht die ganze Datenbank offen; auf den Collections
  liegen keine Regeln. Ein Tor nur vor der Kapitänsansicht wäre eines mit offener Hintertür.

Der Kapitäns-Login prüft in [`admin.pb.js`](pocketbase/pb_hooks/admin.pb.js) das Passwort direkt
und geht damit weiterhin an PocketBases eigenem MFA vorbei — er bringt seit Abschnitt 9 aber
seinen **eigenen** zweiten Faktor mit (TOTP, siehe oben). PocketBases MFA schied aus, weil es
Einmalcodes per E-Mail verschickt und diese App bewusst keinen Mailserver hat.

### Token per Skript neu ausstellen

Denselben Knopf gibt es in der Kapitänsansicht — das Skript bleibt als Rettungsanker:

```bash
node pocketbase/rotate-token.mjs "<Name des Mitglieds>"
```

Macht den alten Link tot, meldet alle Geräte des Mitglieds ab und schreibt einen Protokolleintrag.

### Was wo liegt

| Datei | Inhalt |
|---|---|
| [`docs/umsetzungsplan.md`](docs/umsetzungsplan.md) | Die verbindliche Vorgabe: Datenmodell, Sicherheitsregeln R1–R14, API, Design-Tokens, Testfälle. |
| [`docs/erster-testlauf.md`](docs/erster-testlauf.md) | Ablauf für den ersten Lauf auf einem echten Server — samt der Handprüfungen, die lokal nicht gehen. |
| [`PRODUCT.md`](PRODUCT.md) | Was die App sein will, in Prosa — daraus abgeleitet. |
| [`CHANGELOG.md`](CHANGELOG.md) | Was sich von Version zu Version geändert hat. |
| [`docker-compose.yaml`](docker-compose.yaml) | Der Stack. Ohne Overlay: App allein, hinter vorhandenem Proxy. |
| [`docker-compose.caddy.yaml`](docker-compose.caddy.yaml) | Overlay, das Caddy danebenstellt. |
| [`deploy/`](deploy/) | Dockerfile und die beiden Caddy-Vorlagen. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | Mitmachen und Umgangston. |
| [`SECURITY.md`](SECURITY.md) | Sicherheitslücken vertraulich melden. |
| [`LICENSE`](LICENSE) | MIT — frei nutzbar. |

### Veröffentlichen

Eine neue Version entsteht ohne Terminal: **Actions → „Release starten" → „Run workflow"**,
Versionsnummer eingeben. Der Workflow prüft den Stand, zählt die Version hoch, stempelt den
Abschnitt „Unveröffentlicht" im Changelog, setzt Commit und Tag und legt das GitHub-Release an.

Ausgeliefert wird kein Paket, sondern der Stand selbst: Der Betreiber baut daraus sein
Container-Image. Der Tag sagt, welcher Stand läuft.

---

## Mitmachen

Fehler, Ideen und Doku-Korrekturen sind willkommen — auch ohne eine Zeile Code. Am besten über
[Issues](../../issues/new/choose); Ablauf, Entwicklungsumgebung und Commit-Stil stehen in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

Für Berichte aus dem Betrieb gilt: **keine echten Namen und keine gültigen Einladungslinks**
mitschicken. Ein Link auf einem Bildschirmfoto ist ein gültiger Zugang.

## Lizenz

[MIT](LICENSE) — benutz es, ändere es, gib es weiter.
