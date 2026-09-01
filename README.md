# Mannschaftsplan

[![Version](https://img.shields.io/github/v/release/zelko2k1/mannschaftsplan?label=Version&color=blue)](https://github.com/zelko2k1/mannschaftsplan/releases/latest)
[![Lizenz: MIT](https://img.shields.io/github/license/zelko2k1/mannschaftsplan?label=Lizenz&color=green)](LICENSE)
![React](https://img.shields.io/badge/React-19-61dafb)
![PocketBase](https://img.shields.io/badge/Backend-PocketBase-b8dbe4)
![Selbst gehostet](https://img.shields.io/badge/selbst-gehostet-success)

**Wer fährt, wer kommt mit, wer sagt ab?** Diese Frage geht im Gruppenchat zwischen vierzig
Nachrichten unter. Der Mannschaftsplan holt sie dort heraus.

Der Spielplan sieht aus wie ein **Fahrplanaushang am Bahnsteig**: eine Zeile pro Spieltag, mit
Abfahrtszeit, Gegner und der Frage, ob noch ein Platz im Auto frei ist.

Eine Installation trägt **alle Mannschaften des Vereins**. Jede sieht nur ihre eigenen Spieltage
und Rückmeldungen, jede hat ihren eigenen Kapitän — einmal einrichten, einmal sichern, einmal
aktualisieren.

> ### 🎯 Gebaut für Darts — brauchbar für jede Mannschaft, die auswärts spielt
>
> Die Beispiele hier kommen aus dem Dartsport: Spieltag, Anwurf, Liga, Spiellokal. **Festgelegt
> ist die App darauf nicht.** Wer kegelt, Tischtennis, Schach, Handball oder Fußball spielt und
> vor derselben Frage steht — wer kommt, und wer fährt wen —, kann sie genauso benutzen. Es gibt
> keine Ergebnisse, keine Tabelle, keine Sportart im Datenmodell; es gibt Termine, Zusagen und
> Autos.

**Die Mannschaft muss sich nirgends anmelden.** Jedes Mitglied bekommt einen persönlichen Link,
den es sich einmal aufs Handy legt. Kein Konto, kein Passwort, keine App aus dem Store. Nur der
Kapitän meldet sich an.

Die App läuft auf deinem eigenen Server. Keine Werbung, keine Statistik-Dienste, keine Daten bei
Dritten.

> ### 🔗 Spielt ihr Darts?
>
> Dann gibt es daneben das größere Werkzeug: **[DartsZentrale](https://github.com/zelko2k1/dartszentrale)**
> — Spielstände zählen am Board, Trainingsspiele, Ligen mit automatischer Tabelle, Statistik,
> Kiosk-Betrieb. Vom selben Autor, ebenfalls selbst gehostet.
>
> Die beiden sind **nicht dasselbe und brauchen einander nicht.** Der Mannschaftsplan kann genau
> eines: Termine und Fahrdienst. Er kennt keine Ergebnisse — und ist deshalb auch für Vereine
> brauchbar, die mit Darts nichts zu tun haben.

> ### Ehrlich gesagt: Wer steckt dahinter?
>
> Ich bin **Vereins-Admin, kein ausgebildeter Entwickler.** Der Mannschaftsplan ist aus einer
> konkreten Not entstanden — die Frage „wer fährt?" ging im Gruppenchat zwischen vierzig
> Nachrichten unter — und **mit KI-Unterstützung (Anthropic Claude) gebaut**, von der ersten
> Zeile bis zu dieser Anleitung. Das sage ich lieber offen, als so zu tun, als käme es aus
> jahrelanger Entwickler-Erfahrung.
>
> **Was das für dich heißt:** Ich betreibe die App selbst und teste sie im echten Spielbetrieb,
> kann aber nicht jeden Codepfad tief bewerten. **Code-Reviews, Hinweise und Pull Requests sind
> ausdrücklich willkommen.** Der Support ist begrenzt, die Nutzung erfolgt **auf eigenes Risiko
> und ohne Gewähr** (siehe [LICENSE](LICENSE)).
>
> Ernst nehmen solltest du dabei zwei Dinge: Die App verwaltet **personenbezogene Daten** deiner
> Mitglieder — Namen, Zusagen, wer bei wem mitfährt —, und der Einladungslink eines Mitglieds
> *ist* sein Zugang. Was die App dafür tut und was sie ausdrücklich nicht leisten kann, steht
> unter [Was die App für deine Sicherheit tut](#was-die-app-für-deine-sicherheit-tut).

---

## ✨ Was die App kann
### 📋 Für die Mannschaft — ohne Anmeldung

- **Ein Link, ein Blick.** Alle Spieltage untereinander, der nächste oben, mit Abfahrtszeit.
- **Drei Knöpfe je Spieltag:** dabei · unsicher · kann nicht.
- **Fahrdienst:** Wer fährt, sagt es und nennt die freien Plätze. Wer mitfährt, sucht sich ein
  Auto aus. Beides mit einem Antippen, beides jederzeit widerrufbar.
- **Die Abfahrtszeit rechnet die App** — Entfernung, Tempo, Rüstzeit, rückwärts vom Anwurf.

### 🗂️ Für den Kapitän

- **Spieltage pflegen**, Rückmeldungen auch telefonisch nachtragen, Spieltage nach dem Spiel
  schließen (auf Wunsch von selbst).
- **Spielplan einlesen** statt tippen: die CSV-Datei eines Verbands — oder eine mitgelieferte
  **Vorlage**, die man selbst ausfüllt.
- **Auf einen Blick:** wer noch fehlt, ob genug Autos da sind, wo Ort oder Kilometer fehlen.

### 🏛️ Für den Verein

- **Alle Mannschaften unter einem Dach**, sauber getrennt: Jeder Kapitän sieht nur seine.
- **Sicherungen** erstellen, herunterladen und zurückspielen — ohne SSH, in der Oberfläche.
- **Saison abschließen:** alte Spieltage, Spieler und Mannschaften geordnet loswerden.
- **Zweiter Faktor** für die Verwaltung, Wiederherstellungscodes inklusive.

### 🔒 Und was NICHT passiert

Keine Cloud, keine Werbung, keine Statistik-Dienste, keine App aus dem Store, keine
E-Mail-Adressen der Mitglieder. Die Daten liegen auf deinem Server und sonst nirgends.

---

## 🧭 Für Betreiber

Dieser Teil richtet sich an den, der die App aufsetzt und betreut — Kapitän, Schriftführer oder
wer im Verein sich damit befasst. Programmierkenntnisse braucht es nicht. Wer die App
weiterentwickeln will, findet alles Weitere unter [Für Entwickler](#für-entwickler).

### 📦 Was du brauchst
| | |
|---|---|
| **Einen kleinen Server** | Bei einem Anbieter deiner Wahl. Das kleinste Angebot reicht — die App ist für zehn Leute gedacht, nicht für zehntausend. Darauf muss **Docker** installiert sein, mit **Compose 2.24 oder neuer** (`docker compose version`). Jede halbwegs aktuelle Docker-Installation bringt das mit. |
| **Einen Namen im Internet** | Etwa `dart.mein-verein.de`. Eine Subdomain einer Domain, die du schon hast, genügt völlig. |
| **Eine E-Mail-Adresse** | Nur für die automatischen Hinweise, wenn das Sicherheitszertifikat abläuft. |
| **Eine halbe Stunde** | |

Warum ein Server im Internet und nicht der Rechner zu Hause: Die Mannschaft tippt ihre Links
unterwegs an, aus dem Mobilnetz. Was nur im heimischen WLAN erreichbar ist, hilft am Spieltag
niemandem.

### 🚀 Einrichten
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

**4 · Ein Passwort für dein Admin-Gebiet festlegen**

Vor `/admin` — deinem Bereich mit Konten, Mannschaften und Sicherungen — fragt der Webserver
nach einem Passwort, bevor die App überhaupt antwortet. Eine zusätzliche Tür vor der eigentlichen
Anmeldung.

> **Deine Kapitäne brauchen dieses Passwort nicht.** Sie kommen über `/manage` herein, und davor
> steht keine Tür — nur die Anmeldung in der App. Das ist Absicht: Ein Passwort, das sich acht
> Leute teilen, lässt sich weder widerrufen noch einer einzelnen Person entziehen. Mehr dazu
> unter [Zwei Wege hinein](#zwei-wege-hinein-manage-und-admin).

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
ADMIN_USER=gate
ADMIN_PASSWORD_HASH=$2a$14$…die Zeile von eben…
```

Mehr ist es nicht. In der Datei stehen keine Vorgaben, die du übernehmen könntest — jeder Wert ist
deiner.

> **`ADMIN_USER` ist kein Konto in der App.** Es ist nur der Benutzername, den der Browser beim
> Gate-Fenster abfragt, zusammen mit dem Passwort von eben. Du darfst dort hineinschreiben, was
> du willst — `gate`, `verwaltung`, dein Vorname. Mit den Kapitänen, ihren Anmeldenamen und
> überhaupt mit irgendetwas in der App hat dieser Name nichts zu tun.

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

**7 · Deinen Admin-Zugang anlegen**

```bash
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml exec mannschaftsplan \
  /usr/local/bin/pocketbase superuser upsert deine@adresse.de dein-passwort --dir=/pb_data
```

Das legt den **Superuser der Datenbank** an — und wer sich damit anmeldet, ist in der App
**Admin**: Er sieht alle Mannschaften, legt Konten und Mannschaften an, pflegt die Rechtstexte
und zieht die Sicherungen.

Drei Dinge, die hier gern verwechselt werden:

| | |
|---|---|
| **Das hier** | dein eigener Zugang zur Verwaltung, Rolle *Admin* |
| **Schritt 4** | nur das Gate des Webservers, ein anderes Passwort und kein Konto |
| **Deine Kapitäne** | bekommen später eigene Konten in der App, unter *Konten* — **nicht** über diesen Befehl |

Die Adresse muss wie eine echte E-Mail-Adresse aussehen, es wird aber nie etwas dorthin
geschickt. Das Passwort steht danach in der Befehls-Historie deiner Shell; wenn dich das stört,
lösche sie mit `history -c`.

**8 · Deinen zweiten Faktor einrichten**

`https://dart.mein-verein.de/admin` aufrufen. Es kommen **zwei** Abfragen nacheinander: erst das
Passwort aus Schritt 4 (der Browser fragt in einem kleinen Fenster), dann die Anmeldung aus
Schritt 7 auf der Seite selbst. Deine Kapitäne bekommen später eine andere Adresse — `/manage`,
ohne das Browser-Fenster; mehr dazu unter „Zwei Wege hinein".

Oben steht jetzt ein gelber Balken: **Der zweite Faktor fehlt noch.** Für Admin-Konten ist er
Pflicht — ohne ihn bleiben Konten, Vereinseinstellungen und Sicherungen verschlossen. Spieltage
und Spieler kannst du auch ohne ihn schon pflegen, aber es ist der kürzere Weg, ihn jetzt zu
erledigen: auf **Jetzt einrichten** klicken, den Link auf dem Handy antippen (dann öffnet sich
deine Authenticator-App von selbst) oder das Geheimnis am Rechner von Hand eintragen, dann einen
Code eintippen.

> **Die zehn Wiederherstellungscodes, die danach erscheinen, siehst du genau einmal.** Schreib
> sie ab, bevor du das Fenster schließt — ins Portemonnaie oder in den Passwortmanager. Sie sind
> dein Weg zurück, wenn das Handy weg ist. Ohne sie bliebe nur ein SSH-Tunnel in die Datenbank.

**9 · Die Mannschaft eintragen**

Dort legst du die Mitglieder an. Bei jedem gibt es den Knopf **„Neues Token"** — der erzeugt den
persönlichen Link für dieses Mitglied.

> **Wichtig:** Dieser Link wird **genau einmal** angezeigt. Danach ist er nicht wieder
> hervorzuholen, auch nicht von dir. Das ist kein Versehen, sondern Absicht: gespeichert wird nur
> ein Fingerabdruck des Links, nicht der Link selbst. Wer bei uns einbricht, findet keine gültigen
> Zugänge vor. Kopiere ihn also gleich in den Einzelchat des Mitglieds. Ist er weg, drückst du
> einfach noch einmal auf „Neues Token".

Danach die Spieltage eintragen — Datum, Anwurfzeit, Gegner, Ort, Entfernung. Bei einem ganzen
Spielplan musst du das nicht abtippen: siehe [Spielplan einlesen](#spielplan-einlesen).

**10 · Den Verein einrichten** *(freiwillig, aber lohnend)*

Im Reiter **Verein** steht, was für alle Mannschaften gilt. Vier Einstellungen sind es:

**Name des Vereins.** Er steht dort, wo es um die Anwendung als Ganzes geht: über Impressum und
Datenschutzhinweis, auf der Seite „Link ungültig", und als Herausgeber in der Authenticator-App.
Voreingestellt ist **„Vereinsname"** — ein Platzhalter, den man als solchen erkennt. Steht er
irgendwo noch da, hat ihn schlicht noch niemand gesetzt. Der Name der Software hatte an dieser
Stelle nichts verloren; er sah aus wie eine Entscheidung.

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

Darunter im selben Reiter, jeweils als eigener Abschnitt: die **Liste der Mannschaften**,
**Spielplan einlesen**, die **Sicherungen** und **Saison abschließen**.

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
> Jahr, das Protokoll nach 90 Tagen, Sitzungen nach einem halben Jahr — und wer nicht warten
> will, räumt unter *Verein → Saison abschließen* selbst auf. Im Zweifel jemanden fragen,
> der beraten darf — viele Landessportbünde tun das für ihre Vereine kostenlos.

**Damit läuft die App.** Zwei Dinge lohnt es sich gleich anzusehen: den
[Spielplan einlesen](#spielplan-einlesen), statt jeden Spieltag zu tippen — und
[Aktualisieren](#aktualisieren), damit du weißt, wie ein neuer Stand auf den Server kommt, bevor
du ihn das erste Mal brauchst.

### Spielplan einlesen

Zum Saisonstart musst du die Spieltage nicht einzeln eintippen. Die App liest sie aus einer
CSV-Datei ein — bei einem Verein mit neun Mannschaften sind das rund 130 Begegnungen auf einen
Schlag.

**Zwei Wege zu dieser Datei:**

- **Der Spielplan-Export deines Verbands.** Viele Verbände geben einen Vereinsspielplan als CSV
  aus, in dem alle Mannschaften des Vereins stehen. Dann ist gar nichts abzutippen.
- **Die Vorlage.** Unter *Verein → Spielplan einlesen* auf **Vorlage herunterladen**, in einem
  Tabellenprogramm ausfüllen, wieder hochladen. Für Verbände ohne brauchbaren Export, für
  Pokalrunden und für Freundschaftsspiele.

Welche Form es ist, erkennt die App an der Kopfzeile — du musst nichts angeben.

**So geht es:**

1. Datei besorgen (Export oder ausgefüllte Vorlage).
2. In der Verwaltung auf **Verein → Spielplan einlesen**, Datei wählen.
3. Es erscheint eine **Vorschau**: Anzahl der Begegnungen und je Mannschaft aus der Datei ein
   Auswahlfeld. Was eindeutig zu einer vorhandenen Mannschaft passt, ist schon darauf
   vorbelegt; alles andere steht auf **„neu anlegen"** — die Vorschau zählt auf, welche Namen
   das betrifft. „Nicht übernehmen" lässt eine Mannschaft aus.
4. **Übernehmen.** Erst jetzt verlässt irgendetwas den Browser.

**Du musst vorher keine Mannschaften anlegen.** Auf einer frischen Instanz legt der Import sie
aus der Datei an — die Namen lassen sich danach unter *Mannschaften* jederzeit ändern, ohne dass
die Spieltage etwas davon merken.

Das darf nur der **Admin** — so eine Datei umfasst den ganzen Verein, ein Kapitän würde damit in
fremde Mannschaften schreiben.

**Die Spalten der Vorlage:**

| Spalte | Pflicht | Was hineingehört |
|---|---|---|
| `Datum` | ja | `18.09.2026` oder `2026-09-18` |
| `Uhrzeit` | nein | `20:00`. Fehlt sie, steht der Anwurf auf Mitternacht |
| `Mannschaft` | ja | **eure** Mannschaft — dieser Name wird beim Einlesen zugeordnet |
| `Gegner` | ja | steht groß in der Zeile |
| `Heim` | ja | `ja` oder `nein` (auch `x`, `1`, `wahr` werden verstanden) |
| `Spielort` | nein | die Spielstätte, z. B. „Sportheim TSV Musterdorf" |
| `Ort` | nein | Ort des Gegners — steht klein unter dem Vereinsnamen |
| `Kilometer` | nein | einfache Strecke, für die Abfahrtszeit |
| `Kennung` | nein | frei wählbar, z. B. eine Spieltagsnummer. Siehe unten |

**Was danach noch zu tun ist:** Ein Verbands-Export kennt weder den **Ort des Gegners** noch die
**Entfernung** noch euren **Treffpunkt** — die bleiben dann leer, und ohne sie gibt es keine
Abfahrtszeit. In der Vorlage kannst du Ort und Kilometer gleich mit eintragen und sparst dir das.
Jeder Kapitän sieht in seiner Spieltagsliste oben, wie viele Spieltage noch etwas brauchen, und
an jedem einzelnen den Hinweis.

**Zwei Dinge, die zunächst wie ein Fehler aussehen:**

- **Ein Heimspiel steht als Auswärtsspiel da.** In Ligen mit Turniertagen führt der Verband eure
  Mannschaft als Heimmannschaft, gespielt wird aber im Lokal eines fremden Vereins — manchmal
  hundert Kilometer weit. Die App richtet sich nach dem **Spiellokal**, nicht nach der Spalte:
  Sonst fiele für diese Fahrten der ganze Fahrdienst aus. In der Vorschau steht, wie oft das
  vorkam.
- **Umlaute in den Mannschaftsnamen.** Die Datei kommt in einer alten Windows-Kodierung; die App
  erkennt das und stellt es gerade. Sollte trotzdem etwas seltsam aussehen, liegt es an der Datei
  selbst — dann beim Verband neu herunterladen.

**Ein zweiter Import derselben Saison** ist ungefährlich: Verlegte Begegnungen werden am
vorhandenen Spieltag nachgezogen, statt ein zweites Mal angelegt zu werden. Unberührt bleiben
dabei alles, was du von Hand angelegt hast, jeder bereits gesperrte Spieltag — und alles, was ihr
nachgetragen habt, solange die Datei dazu nichts sagt. **Ein leeres Feld löscht also nichts.**
Steht in der Datei ein Ort, gilt der aus der Datei.

Wiedererkannt wird eine Begegnung an Mannschaft, Gegner und Seite — nicht am Termin, sonst würde
jede Verlegung einen zweiten Spieltag anlegen. Spielt ihr dieselbe Paarung mehrfach mit derselben
Seite, trag in der Spalte **`Kennung`** etwas Eindeutiges ein (z. B. `hinrunde` und `rückrunde`);
sonst hängt die Wiedererkennung an der Reihenfolge in der Datei, und die Vorschau warnt davor.

### 📆 Der Alltag
**Ein Mitglied hat seinen Link verloren.** In der Kapitänsansicht auf „Neues Token". Der alte Link
ist damit sofort tot, und alle Geräte, auf denen dieses Mitglied angemeldet war, fliegen raus.

**Ein Link ist in falsche Hände geraten.** Dasselbe. Wer den Link eines Mitglieds hat, *ist* dieses
Mitglied — das ist der Preis dafür, dass sich niemand anmelden muss. Deshalb: Links immer im
Einzelchat verschicken, nie in der Mannschaftsgruppe, und keine Bildschirmfotos davon herumzeigen.

**Jemand verlässt die Mannschaft.** Das Mitglied auf **inaktiv** setzen. Es verschwindet aus
den Listen und ist sofort von allen Geräten abgemeldet — seine Rückmeldungen zu vergangenen
Spieltagen bleiben aber stimmig. Das ist der Normalfall. *Löschen* gibt es auch, es gehört aber
zum [Aufräumen nach der Saison](#nach-der-saison-aufräumen).

**Ein Spieltag ist gelaufen.** Auf „gesperrt" setzen — dann kann niemand mehr nachträglich seine
Zusage ändern. Wenn du unter *Verein* eine Frist hinterlegt hast, passiert das von selbst;
im Protokoll steht die Zeile dann mit dem Vermerk „(automatisch)".

### 👥 Wie groß darf eine Mannschaft sein?
Es gibt keine eingestellte Obergrenze — aber eine technische: **200 Spieler je Mannschaft**
zeigen Verwaltung und Aushang an. Wird sie überschritten, sagt die Spielerliste es dir; bis
dahin merkst du nichts davon. Für eine Dartmannschaft mit acht bis sechzehn Leuten ist das weit
weg.

Wer die App für etwas Größeres benutzt, sollte die zweite Schranke kennen: Der Aushang holt je
Mannschaft bis zu **2000 Rückmeldungen** — Spieler mal Spieltage. Bei einer vollen Saison mit
rund 25 Spieltagen ist das ab etwa 80 Spielern erreicht. Beide Zahlen stehen in
`pocketbase/pb_hooks/utils.js` bzw. `board.pb.js` und lassen sich erhöhen.

### Nach der Saison aufräumen

Von selbst passiert das auch: Spieltage älter als zwölf Monate verschwinden nachts, das Protokoll
nach 90 Tagen. Wer nicht so lange warten will — weil die Saison vorbei ist oder weil eine
Testmannschaft weg soll —, findet unter **Verein → Saison abschließen** den Griff dazu.

1. **Erst eine Sicherung erstellen.** Der Abschnitt darüber macht das in einem Klick. Was hier
   verschwindet, holt kein zweiter Klick zurück.
2. Mannschaft wählen (oder *alle*) und einen **Stichtag**. Vorgabe ist heute — dann bleibt alles
   Kommende stehen. Darüber steht, wie viele Spieltage betroffen sind.
3. **Spieltage löschen.** Rückmeldungen, Fahrten und Mitfahrer gehen mit.

Danach greift eine Kette: Ein **Spieler** lässt sich unter *Mannschaft* löschen, sobald keine
Rückmeldung und keine Fahrt mehr an ihm hängt — vorher sagt der Server, was im Weg ist. Und eine
**Mannschaft** lässt sich löschen, sobald sie leer ist: keine Spieler, keine Spieltage, kein
Kapitänskonto.

> **Löschen ist nicht dasselbe wie „Deaktivieren".** Wer den Verein verlässt, wird
> *deaktiviert* — er verschwindet aus allen Listen, ist von allen Geräten abgemeldet, und seine
> Rückmeldungen zu vergangenen Spieltagen bleiben stimmig. *Gelöscht* wird, was wirklich weg
> soll. Hängt an einem Spieler ein Kapitänskonto, musst du dort zuerst die Verknüpfung lösen.

### 🧩 Mehrere Mannschaften
Ein Verein mit sieben Mannschaften braucht keine sieben Instanzen. Eine reicht, und darin gibt es
zwei Rollen:

| Rolle | Reiter | Darf |
|---|---|---|
| **Admin** | Spieltage, Mannschaft, Konten, Verein, Protokoll | Alles. Legt Mannschaften und Konten an, pflegt Rechtstexte und Sicherungen. |
| **Kapitän** | Spieltage, Mannschaft, Protokoll | Nur seine eigene Mannschaft: Spieler anlegen und bearbeiten, Spieltage pflegen, Rückmeldungen korrigieren, seine Mannschaft benennen. |

Jeder Reiter hat genau ein Thema, und die **Auswahl oben** entscheidet, welche Mannschaft
gemeint ist. *Mannschaft* zeigt bei beiden Rollen dasselbe — ihren Namen und ihre Spieler; der
Unterschied liegt nur darin, wie viele Mannschaften zur Auswahl stehen. *Konten* trägt alle
Verwalterkonten in zwei Abschnitten — Admins und Kapitäne, letztere nach Mannschaft gruppiert —
und zeigt auch, welche Mannschaft noch keinen Kapitän hat.

> **Ein Konto zu löschen nimmt den Spieler nicht mit.** Weg sind das Konto, seine offenen
> Sitzungen und sein zweiter Faktor. Der Spielereintrag bleibt, mitsamt Einladungslink,
> Rückmeldungen und Mannschaft: Wer aufhört, Kapitän zu sein, spielt weiter.

*Verein* trägt, was für alle Mannschaften gilt: Vereinsname, Sperrfrist, Rechtstexte, die Liste
der Mannschaften, das Einlesen eines Spielplans, die Sicherungen und das Aufräumen nach der
Saison.

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

Steht er noch nicht in der Liste, wähle unter *Spielt als* die Zeile **„neu anlegen"** und gib
seinen Namen ein: Spielereintrag und Konto entstehen dann zusammen. Den Einladungslink stellst du
ihm anschließend wie jedem anderen unter *Mannschaft* aus.

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

**Das Gate aus Schritt 4 brauchen die Kapitäne nicht.** Sie arbeiten unter `/manage` und melden
sich dort nur in der App an — mit einem eigenen Passwort, das der Server erzeugt und das du
jederzeit für eine einzelne Person zurücksetzen kannst. Ein geteiltes Gate-Passwort könnte das
nicht: Es ist nicht widerrufbar, kennt kein Abmelden, und wer ausscheidet, nimmt es mit. Das Gate
steht deshalb nur noch vor dem, was alle Mannschaften betrifft — siehe „Zwei Wege hinein".

**Eine Mannschaft auflösen** geht erst, wenn sie leer ist — keine Mitglieder, keine Spieltage,
kein Kapitän. Ein Klick, der ein Jahr Spielbetrieb mitnähme, wäre zu scharf.

### Zwei Wege hinein: `/manage` und `/admin`

Die Verwaltung ist dieselbe Oberfläche, aber sie hat zwei Eingänge:

| Adresse | Für wen | Davor steht |
|---|---|---|
| `https://dart.mein-verein.de/manage` | die Kapitäne — Spieltage, Spieler, Rückmeldungen | nichts. Nur die Anmeldung in der App |
| `https://dart.mein-verein.de/admin` | dich — Konten, Mannschaften, Verein, Sicherungen | zusätzlich das Gate aus Einrichtungsschritt 4 |

**Den Kapitänen gibst du `/manage`.** Sie sehen dort nur ihre eigene Mannschaft und brauchen kein
Gate-Passwort — eines, das sich acht Leute teilen, ist ohnehin nicht widerrufbar und landet im
Zweifel in der Mannschaftsgruppe. Wer sein Passwort verliert, bekommt von dir ein neues; wer sich
vertippt hat, wartet eine Viertelstunde (siehe unten).

**Du selbst gehst über `/admin`.** Dort fragt der Browser zuerst nach dem Gate-Passwort und danach
die App nach deinem eigenen. Zweimal, ja — das ist gewollt: Hinter `/admin` hängt der Zugriff auf
*alle* Mannschaften und auf die Datenbankdatei.

**Der Kapitän, der selbst mitspielt,** braucht für „wie steht es" und die eigene Zu- oder Absage
gar keine Anmeldung: Er hat wie jeder andere seinen persönlichen Einladungslink. Verbinde dazu
sein Konto unter **Konten** mit seinem Spielereintrag — dann steht auf dem Aushang oben ein
„Verwaltung" und in der Verwaltung ein „Als Spieler", und er kommt mit einem Lesezeichen aus.

### ⏳ Wenn sich jemand vertippt hat
Nach fünf Fehlversuchen in einer Minute ist die Anmeldung von dieser Internetverbindung aus für
**15 Minuten** gesperrt, nach zehn Fehlversuchen in einer Viertelstunde zusätzlich für dieses
**Konto**. Beides löst sich von selbst wieder auf — meistens ist Warten die Antwort.

Muss es schneller gehen, steht unter **Konten** neben dem betroffenen Konto „gesperrt, noch x min"
und daneben **Sperre aufheben**.

> **Eine Ausnahme:** Deine eigene Sperre kannst du nicht aufheben — dafür müsstest du hinein.
> Da hilft nur Warten oder ein Neustart (`docker compose restart mannschaftsplan`); die Zähler
> liegen im Arbeitsspeicher und sind danach weg.

### 🔐 Zweiter Faktor
Unter **Mein Konto → Zweiter Faktor** lässt sich zusätzlich zum Passwort ein sechsstelliger
Code aus einer Authenticator-App verlangen. Wer dein Passwort erfährt, kommt damit trotzdem nicht
in die Verwaltung.

**Für Kapitäne ist er freiwillig, für Admin-Konten Pflicht.** Ohne ihn bleibt für ein
Admin-Konto alles unter `/admin` verschlossen — die App sagt das beim ersten Versuch und
verweist auf die Einrichtung. Warum der Unterschied: Die Passwörter erzeugt der Server (sechzehn
Zeichen), sie werden nicht ausgedacht — damit fällt der Angriff weg, gegen den ein zweiter Faktor
im Netz vor allem hilft. Was hinter `/admin` liegt, ist das trotzdem wert.

**Für Kapitäne lohnt er sich anders:** Nur mit zweitem Faktor gibt es beim Anmelden den Haken
**„angemeldet bleiben"**, und dann hält die Anmeldung 90 Tage statt zwölf Stunden. Wer alle zwei
Wochen einen Spieltag pflegt, meldet sich damit dreimal in der Saison an statt jedes Mal.

Einrichten: auf **Einrichten** klicken, den angezeigten Link auf dem Handy antippen (dann öffnet
sich die App von selbst) oder das Geheimnis am Rechner von Hand eintragen, dann einen Code
eintippen. Erst damit gilt er — eine abgebrochene Einrichtung sperrt dich nicht aus. Es
funktioniert mit jeder gängigen App: Aegis, 2FAS, Google Authenticator, Bitwarden, 1Password.

Jeder Code gilt genau einmal. Nach dem Anmelden musst du für die nächste Aktion, die einen Code
braucht, bis zum nächsten Wechsel warten — höchstens eine halbe Minute.

**Die zehn Wiederherstellungscodes**, die beim Einschalten erscheinen, sind der Zettel für den
Notfall. Sie erscheinen **genau einmal** — abschreiben, ins Portemonnaie oder in den
Passwortmanager. Beim Anmelden tippst du einen davon statt des Codes aus der App; jeder gilt
einmal. Wie viele noch übrig sind, steht unter *Mein Konto*, und über **Neue Codes** gibt es
zehn frische (die alten gelten dann nicht mehr).

> **Was er schützt.** Die Verwaltung unter `/manage` und `/admin`. Damit er nicht zu umgehen ist,
> liegt seit R13c auch die **Superuser-Anmeldung** der API hinter dem Gate aus
> Einrichtungsschritt 4 — sonst holte sich jemand mit Adresse und Passwort über
> `/api/collections/_superusers/auth-with-password` einen Token, käme an die ganze Datenbank,
> ohne `/admin` je zu berühren, und könnte dort auch den zweiten Faktor löschen.

**Handy verloren?** Dann nimm einen deiner Wiederherstellungscodes — dafür sind sie da. Melde
dich damit an und richte den zweiten Faktor auf dem neuen Gerät ein: erst **Abschalten** (auch
das geht mit einem Wiederherstellungscode nicht, sondern nur mit einem Code aus der App —
also zuerst neue Codes ziehen, falls nötig), dann neu einrichten.

Für einen **Kapitän** ist der kürzeste Weg ohnehin ein anderer: Du schaltest ihm unter **Konten**
den zweiten Faktor ab, er richtet ihn neu ein.

**Handy weg und Zettel weg, und zwar bei deinem eigenen Admin-Konto?** Dann führt der Ausweg über
die API — mit deinem Superuser-Passwort **und** den Zugangsdaten des Gates aus Schritt 4 (`-u`):

```bash
TOKEN=$(curl -s -u gate:dein-gate-passwort \
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

### Aktualisieren

Ein neuer Stand kommt aus dem Repo, gebaut wird er auf deinem Server. Drei Befehle:

```bash
cd mannschaftsplan
git pull
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml up -d --build
```

**Oder in einem Befehl:**

```bash
./scripts/update.sh
```

Das Skript macht genau das oben, startet anschließend den Proxy neu (warum, steht weiter unten)
und misst zum Schluss nach, ob die Schutzregeln danach greifen. Betreibst du einen eigenen
Reverse Proxy statt des Overlays, erkennt es das selbst.

**Vorher eine Sicherung ziehen** — in der App unter *Verein → Sicherungen*, ein Klick. Das ist
der einzige Rückweg, falls etwas nicht passt. Das Skript nimmt dir das absichtlich nicht ab: Eine
Sicherung, die auf dem Server liegen bleibt, ist im Ernstfall keine.

Der Bau dauert ein paar Minuten. Danach läuft die neue Fassung; **deine Daten bleiben**, sie
liegen in einem eigenen Docker-Volume und nicht im Container. Nötige Änderungen an der Datenbank
führt die App beim Start selbst aus.

> **`--build` ist nicht optional.** Ohne dieses Wort startet Docker denselben alten Stand wieder,
> ohne Fehlermeldung — du hättest den neuen Code geholt und trotzdem die alte App laufen. Und
> `docker compose restart` genügt hier nie: Es startet die vorhandenen Container neu, statt neue
> aus dem neuen Stand zu erzeugen.

**Was du dabei sehen solltest:** Am Ende steht eine Zeile mit `Started` oder `Running`. Bleibt
etwas hängen, hilft `docker compose logs -f mannschaftsplan` — die letzten Zeilen sagen, woran es
liegt. Melden sich deine Kapitäne mit „geht nicht", ist der häufigste Grund, dass der Bau noch
läuft; währenddessen antwortet die alte Fassung weiter.

**Zurück auf einen älteren Stand,** falls eine neue Fassung Ärger macht:

```bash
git log --oneline -5          # zeigt die letzten Stände
git checkout <version-oder-commit>
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml up -d --build
```

Danach die Sicherung von vorhin einspielen — unter *Verein → Sicherungen*, wenn du hineinkommst,
sonst über die Datei. Später wieder nach vorn: `git checkout main && git pull`.

**Aufräumen.** Jeder Bau lässt das alte Abbild liegen. Ein-, zweimal im Jahr:

```bash
docker image prune -f
```

Das löscht nur, was kein Container mehr benutzt — deine Daten sind davon nie betroffen.

> **Wenn du Werte in der `.env` geändert hast**, gilt dasselbe wie bei der Einrichtung: Erst
> `… up -d` (mit oder ohne `--build`) macht sie wirksam, ein `restart` nicht.

> **Und wenn sich `deploy/Caddyfile` geändert hat**, braucht der Proxy einen eigenen Anstoß. Die
> Datei ist in den Caddy-Container eingehängt und wird **nur beim Start gelesen** — `up -d --build`
> fasst diesen Container aber nicht an, weil sich an seiner Service-Definition nichts geändert hat.
> Der neue Stand liegt dann auf der Platte, während der Proxy weiter nach der alten Fassung
> arbeitet. Ohne Fehlermeldung, wie bei `--build` — nur trifft es hier die Schutzregeln vor
> `/admin` und der Superuser-Anmeldung, also ausgerechnet das, was man von außen nicht sieht.
>
> ```bash
> docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml up -d --force-recreate caddy
> ```
>
> Das dauert Sekunden, baut nichts und ist unschädlich, wenn sich nichts geändert hat — **lass es
> einfach bei jedem Aktualisieren mitlaufen**, statt nachzusehen, ob es diesmal nötig war.
> `./scripts/update.sh` tut genau das von selbst.
>
> **Nachmessen von außen**, ob die Regeln greifen — aus jedem Terminal, auch vom eigenen Rechner:
>
> ```bash
> curl -s -o /dev/null -w '%{http_code}\n' https://dart.mein-verein.de/api/collections/_superusers/auth-refresh
> ```
>
> Antwort **`401`**: Das Gate steht davor, alles in Ordnung. Antwort `200` oder `403`: Die Anfrage
> ist am Gate vorbei bis zur App durchgelaufen — dann läuft der Proxy noch auf einer alten
> Fassung, und der Befehl von oben fehlt.

### 💾 Sicherungen
Es gibt zwei Wege, und du brauchst beide.

**Von Hand, in der Kapitänsansicht.** Unter **Verein → Sicherungen** liegen vier Knöpfe:
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
  ADMIN_USER=gate ADMIN_PASSWORD=… \
  BACKUP_DIR=/backup GPG_EMPFAENGER=… \
  ./scripts/backup.sh
```

> **Zwei Angaben, die leicht fehlen.** Ohne **`PB_URL`** versucht das Skript
> `http://127.0.0.1:8090` — also den Rechner, auf dem es gerade läuft — und bricht mit „Could not
> connect to server" ab. Und **`ADMIN_USER`/`ADMIN_PASSWORD`** sind die Zugangsdaten des Gates aus
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

### 🏠 Nur aus dem eigenen Netz erreichbar machen
Standardmäßig sind `/manage` und `/admin` von überall erreichbar — vom Handy im Mobilnetz, aus
dem Urlaub, von unterwegs. Für die meisten Vereine ist das genau richtig.

Wer eine **feste Internetadresse**, ein **VPN** (WireGuard, Tailscale) oder ein Vereins-WLAN mit
fester Adresse hat, kann es enger machen: Dann beantwortet Caddy jede Anfrage von woanders mit
404 — die Anmeldung wird gar nicht erst erreicht. Dafür gibt es zwei Werte in der `.env`:

```bash
# Nur du selbst, aus dem VPN: das Admin-Gebiet
ADMIN_ALLOW=10.8.0.0/24

# Die Kapitäne, aus dem VPN und aus dem Vereinsheim
MANAGE_ALLOW=10.8.0.0/24 203.0.113.7/32
```

Mehrere Bereiche mit **Leerzeichen** trennen. Danach:

```bash
docker compose -f docker-compose.yaml -f docker-compose.caddy.yaml up -d
```

Deine aktuelle Adresse findest du mit `curl -s https://api.ipify.org`. Ein einzelner Rechner ist
`/32` (z. B. `203.0.113.7/32`), ein Heimnetz meist `192.168.0.0/16`, ein WireGuard-Netz oft
`10.8.0.0/24`.

> **Die Falle, und sie ist real:** Die meisten Privatanschlüsse bekommen alle paar Tage eine neue
> Adresse. Wer nur seine heutige einträgt, steht morgen vor einem 404 — und zwar auch dann, wenn
> das Passwort stimmt. Trag deshalb nur ein, was dauerhaft gleich bleibt: ein VPN-Netz oder eine
> feste Geschäftsadresse. **Bei `MANAGE_ALLOW` kommt dazu:** Die Kapitäne pflegen ihre Spieltage
> oft vom Handy aus, also aus dem Mobilnetz. Wer diesen Wert setzt, sperrt sie dort aus.

**Wieder herausgekommen**, wenn du dich ausgesperrt hast: per SSH auf den Server, die Zeile in
der `.env` auskommentieren, Stack neu starten. Einen anderen Weg gibt es nicht — deshalb steht
diese Einstellung nicht in der Oberfläche.

### 🔀 Wenn schon ein Reverse Proxy läuft
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

**„Ein Kapitän kommt nicht auf `/manage`."** Dort gibt es kein Browser-Fenster, nur die Anmeldung
auf der Seite. Kommt trotzdem ein 404, ist `MANAGE_ALLOW` gesetzt und er sitzt in einem Netz, das
nicht eingetragen ist — siehe „Nur aus dem eigenen Netz erreichbar machen". Steht dagegen
„Zu viele Versuche", hat er sich vertippt; unter **Konten** kannst du die Sperre aufheben.

**„Bei mir steht: Für Admin-Konten ist der zweite Faktor Pflicht."** Stimmt — richte ihn unter
**Mein Konto → Zweiter Faktor** ein, dann geht es weiter. Bis dahin kommst du an alles heran,
was deine Mannschaften betrifft, nur nicht an Konten, Sicherungen und Vereinseinstellungen.

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
- **Vor deinem Admin-Gebiet steht eine zusätzliche Tür** (`/admin`, die Datenbank-API und die
  Datenbankoberfläche), unabhängig von der Anmeldung in der App. Deshalb fragt dich der Browser
  dort nach einem zweiten Passwort. Vor `/manage`, wo die Kapitäne arbeiten, steht sie nicht —
  dafür ist dort der zweite Faktor der Weg zu längeren Sitzungen.
- **Falsche Zugangsdaten verraten nichts** — ob eine Adresse existiert oder nicht, sieht von außen
  gleich aus.

Was die App **nicht** leisten kann: Wer den Link eines Mitglieds bekommt, ist dieses Mitglied.
Diesen Preis zahlt sie dafür, dass sich niemand anmelden muss. Der Schutz liegt darin, wie du die
Links verteilst.

Findest du eine Sicherheitslücke, melde sie bitte **vertraulich** und nicht als öffentliches
Issue — siehe [`SECURITY.md`](SECURITY.md).

---

## Für Entwickler

### 💻 Lokal starten, ohne Docker
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

### 🧱 Aufbau
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

### ✅ Tests
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

### 🛡️ Sicherheitsregeln
Verbindlich, nicht verhandelbar, vollständig in Abschnitt 4 des Umsetzungsplans. Die beiden, die
den Betrieb am stärksten prägen:

- **R13a** — `/_/` ist nie öffentlich erreichbar. Keine Allowlist, kein Schalter. Zugang über einen
  SSH-Tunnel auf einen an `127.0.0.1` gebundenen Port, siehe die Kommentare in
  [`docker-compose.yaml`](docker-compose.yaml).
- **R13b** — vor `/admin` steht ein Gate, das nicht das Passwort aus der App ist: IP-Allowlist oder
  vorgeschaltete Proxy-Anmeldung. Ohne eines von beiden bleibt `/admin` zu.
- **R13e** — `/manage` steht dagegen offen: Ein Gate-Passwort, das sich alle Kapitäne teilen, ist
  nicht widerrufbar und kennt kein Abmelden. An seine Stelle treten erzeugte Passwörter, eine
  Sperre pro Konto und enge Rechte. Wer trotzdem einschränken will, setzt `MANAGE_ALLOW`.
- **R13c** — dasselbe Gate steht vor `/api/collections/_superusers/*`. Dort wird der
  Superuser-Token ausgegeben, und mit ihm steht die ganze Datenbank offen; auf den Collections
  liegen keine Regeln. Ein Gate nur vor der Kapitänsansicht wäre eines mit offener Hintertür.

Der Kapitäns-Login prüft in [`admin.pb.js`](pocketbase/pb_hooks/admin.pb.js) das Passwort direkt
und geht damit weiterhin an PocketBases eigenem MFA vorbei — er bringt seit Abschnitt 9 aber
seinen **eigenen** zweiten Faktor mit (TOTP, siehe oben). PocketBases MFA schied aus, weil es
Einmalcodes per E-Mail verschickt und diese App bewusst keinen Mailserver hat.

### 🔑 Token per Skript neu ausstellen
Denselben Knopf gibt es in der Kapitänsansicht — das Skript bleibt als Rettungsanker:

```bash
node pocketbase/rotate-token.mjs "<Name des Mitglieds>"
```

Macht den alten Link tot, meldet alle Geräte des Mitglieds ab und schreibt einen Protokolleintrag.

### 🗺️ Was wo liegt
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

### 🏷️ Veröffentlichen
Eine neue Version entsteht ohne Terminal: **Actions → „Release starten" → „Run workflow"**,
Versionsnummer eingeben. Der Workflow prüft den Stand, zählt die Version hoch, stempelt den
Abschnitt „Unveröffentlicht" im Changelog, setzt Commit und Tag und legt das GitHub-Release an.

Ausgeliefert wird kein Paket, sondern der Stand selbst: Der Betreiber baut daraus sein
Container-Image. Der Tag sagt, welcher Stand läuft.

---

## 🤝 Mitmachen
Fehler, Ideen und Doku-Korrekturen sind willkommen — auch ohne eine Zeile Code. Am besten über
[Issues](../../issues/new/choose); Ablauf, Entwicklungsumgebung und Commit-Stil stehen in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

**Ein kritischer Blick in den Code ist besonders willkommen**, gerade weil das Projekt aus einem
Verein kommt und nicht aus einem Entwicklerbüro. Hab bitte Verständnis, wenn ich bei sehr
tiefgehenden Themen nur begrenzt antworten kann.

Für Berichte aus dem Betrieb gilt: **keine echten Namen und keine gültigen Einladungslinks**
mitschicken. Ein Link auf einem Bildschirmfoto ist ein gültiger Zugang.

## 📄 Lizenz
[MIT](LICENSE) — benutz es, ändere es, gib es weiter.
