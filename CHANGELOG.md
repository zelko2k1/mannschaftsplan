# Changelog

Alle nennenswerten Änderungen an Mannschaftsplan werden hier festgehalten.

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

### Entfernt
- **Das Seed-Skript mit den erfundenen Testdaten ist weg** (`pocketbase/seed.mjs`). Es legte
  acht Mitglieder und sechs Spieltage mit ausgedachten Namen an. Die Auslieferung enthält
  jetzt keine Daten und keine Konten mehr: Mannschaft und Spielplan entstehen ausschließlich
  in der Kapitänsansicht, die Einladungslinks kommen dort aus „Neues Token". Für die
  API-Tests war der Seed ohnehin nie nötig — sie legen ihre eigenen Datensätze an.

### Geändert
- **Die Superuser-Anmeldung der API liegt jetzt hinter demselben Tor wie `/admin`** (neue Regel
  R13c). Ohne das war der zweite Faktor zu umgehen: Wer Adresse und Passwort des Superusers
  kannte, holte sich über `/api/collections/_superusers/auth-with-password` einen Token und kam
  damit an die gesamte Datenbank, ohne `/admin` je zu berühren — und hätte dort auch den zweiten
  Faktor löschen können. Gesperrt ist der ganze Präfix, nicht nur `auth-with-password`:
  `auth-refresh`, `auth-with-otp`, `request-password-reset` und `impersonate` führten sonst am
  Tor vorbei zum selben Ziel.
  **Für Betreiber heißt das:** `scripts/backup.sh` braucht auf einer entfernten Maschine
  zusätzlich `ADMIN_USER` und `ADMIN_PASSWORD` — die Zugangsdaten des Tors aus
  Einrichtungsschritt 4. Fehlen sie, sagt das Skript das ausdrücklich, statt ein blankes 401
  weiterzureichen, das wie ein falsches Superuser-Passwort aussähe. Wer durch einen SSH-Tunnel
  direkt auf 8090 geht, ist nicht betroffen; dort steht kein Reverse Proxy. Die App selbst,
  die Einladungslinks und der Aushang sind unberührt.

### Geändert
- **Auf der Einladungsseite steht jetzt die Mannschaft, nicht der Verein.** Den Namen erwartet
  das Mitglied, und er landet in der Vorschau, die Messenger beim Weiterleiten erzeugen.
  Das ist eine bewusste Abweichung von R6: Bis hierher wurde das Token auf dieser Seite gar nicht
  nachgeschlagen, die Antwort war für jede Zeichenkette identisch. Vertretbar ist sie, weil ein
  Token aus 16 zufälligen Bytes besteht — raten ist ausgeschlossen, und wer eines hat, braucht
  kein Orakel, er kann es benutzen. Ein **totes Token und ein deaktiviertes Mitglied** zeigen
  weiterhin beide den Vereinsnamen und bleiben ununterscheidbar. R10 ist unberührt: gelesen,
  nicht geschrieben — es entsteht keine Sitzung, und der Abruf durch den Messenger verbraucht
  die Einladung nicht.
- **Das Feld „Name der Mannschaft" in den Einstellungen heißt jetzt „Name des Vereins".** Es war
  seit dem Mannschafts-Umbau falsch beschriftet und mit dem Mannschaftsnamen zu verwechseln.
- **Tempo und Rüstzeit stehen nur noch am Spieltag.** Es gab drei Stufen — zentral, Mannschaft,
  Spieltag —, gedacht als Bequemlichkeit: einmal einstellen, überall gültig. In der Bedienung war
  es das Gegenteil. Wer eine Abfahrtszeit erklären wollte, musste an drei Stellen nachsehen, und
  zwei davon lagen in verschiedenen Reitern. Ein leeres Feld nimmt jetzt den eingebauten Standard
  (80 km/h, 25 Minuten). Die beiden Spalten, die dazwischenstanden, sind weg: Ein Wert, den
  niemand mehr sehen, aber jeder spüren kann, ist schlimmer als gar keiner.
- **Alles zur Mannschaft steht jetzt im eigenen Reiter „Mannschaften"** — ihr Name, ihr Puffer,
  ihre Mitglieder und ihre Kapitäne. Vorher lag das über zwei Reiter und die Einstellungen
  verteilt, was schon bei zwei Mannschaften unübersichtlich wurde. Der Reiter *Mitglieder*
  entfällt dafür; die Einstellungen tragen nur noch, was für alle gilt.
- **Der Startort einer Mannschaft ist aus der Oberfläche verschwunden.** Er war für eine
  Routenberechnung gedacht, die zurückgestellt wurde — ein Feld, das man ausfüllen kann und das
  nichts bewirkt, verwirrt mehr, als die Spalte kostet. Im Schema bleibt sie stehen.

### Hinzugefügt
- **Tempo und Puffer lassen sich am einzelnen Spieltag übergehen.** Bisher galt eine Formel für
  alle Fahrten einer Mannschaft; die Autobahn nach Köln und die Halle im Nachbarort teilen sich
  aber weder Tempo noch Rüstzeit. Leer heißt weiterhin erben — Puffer von der Mannschaft, Tempo
  aus den zentralen Einstellungen. Die Eingabemaske zeigt daneben, was ein leeres Feld bedeutet.
- **Der Gesamt-Admin sieht den zweiten Faktor seiner Kapitäne und kann ihn abschalten.** Bisher
  konnte ein Kapitän ihn zwar selbst einrichten, aber niemand sah, wer einen hatte, und bei einem
  verlorenen Handy führte der einzige Weg über die Kommandozeile. **Einrichten** kann er ihn
  weiterhin nicht für andere: Ein Geheimnis, das über einen fremden Bildschirm liefe, wäre keines
  mehr. Jedes Abschalten steht im Protokoll.
- **Mehrere Kapitäne je Mannschaft.** Eine Vertretung ist ein zweites Konto mit denselben
  Rechten — technisch ging das schon, es fehlte nur die Ansicht dafür. Ein eigener Rollenbegriff
  wäre eine Stufe mehr, die in jeder Abfrage richtig geprüft werden müsste, ohne dass sie etwas
  könnte.
- **Eine Instanz trägt jetzt mehrere Mannschaften.** Bis hierher war die App für genau eine
  gebaut; ein Verein mit sieben hätte sieben Instanzen gebraucht — siebenmal sichern, siebenmal
  aktualisieren, siebenmal dieselben Rechtstexte. Es gibt nun eine Rolle *Gesamt*, die alles
  sieht und zwischen den Mannschaften umschaltet, und eine Rolle *Kapitän*, die ausschließlich
  die eigene betreut.
  Kapitäne sind dafür **keine Superuser** mehr, sondern Datensätze in einer eigenen
  Auth-Collection — PocketBase hält weiterhin das Passwort (R13), aber auf keiner Tabelle liegt
  eine Regel, die einem Kapitän etwas erlaubte. Sein gesamter Zugriff läuft durch die Routen der
  Kapitänsansicht, und dort wird die Mannschaft nicht aus dem Request gelesen, sondern aus seinem
  Konto — dieselbe Regel wie R3 auf der Mitgliederseite.
  **Was zentral bleibt:** Rechtstexte, Sperrfrist, Tempo und die Sicherungen. **Was der Mannschaft
  gehört:** ihr Name, ihr Puffer und ein Startort für später. Für bestehende Installationen ändert
  sich nichts: Die Migration macht aus den bisherigen Einstellungen die erste Mannschaft und hängt
  alle vorhandenen Mitglieder und Spieltage daran.
- **Der Treffpunkt steht jetzt im Aushang.** Er ließ sich seit jeher am Spieltag eintragen, wurde
  vom Board mitgeliefert — und im Browser fallengelassen. Wer gemeinsam losfährt, musste woanders
  nachfragen, wohin. Er steht nun zusammen mit der Abfahrtszeit oben im aufgeklappten Bereich, wo
  auch der Fahrdienst liegt; bei Heimspielen bleibt die Zeile weg, dort fährt niemand los.
- **Die Abfahrtszeit lässt sich von Hand setzen.** Die Formel aus Abschnitt 6.3 ist eine
  Schätzung, und sie stimmt nicht für jede Fahrt — eine Fähre, eine Dauerbaustelle, ein Umweg
  über den Kollegen ohne Auto. Bisher blieb nur, an der Entfernung zu drehen, bis die Zahl
  passte; das machte die Entfernung falsch, damit die Abfahrt stimmte. **Leer heißt weiterhin
  rechnen** — nur ein gefülltes Feld übergeht die Formel, und die Eingabemaske zeigt daneben, was
  die Berechnung ergäbe. Wäre der berechnete Wert stattdessen beim Anlegen fest eingetragen
  worden, hinge er danach still fest: Eine spätere Änderung an Tempo oder Puffer erreichte diesen
  Spieltag nie mehr, und niemand wüsste warum.
- **Der Kapitäns-Login kennt einen zweiten Faktor.** Unter Einstellungen lässt sich ein
  zeitbasierter Code aus einer Authenticator-App verlangen (TOTP nach RFC 6238). Das war der
  letzte offene Punkt aus Abschnitt 9 des Umsetzungsplans: `admin.pb.js` prüft das Passwort
  direkt über `validatePassword()` und geht damit an PocketBases eigenem MFA vorbei — ein im
  Dashboard eingeschalteter zweiter Faktor schützte deshalb nur `/_/`, nicht `/admin`. Dieser
  Login bringt nun seinen eigenen mit. PocketBases MFA kam nicht in Frage, weil es Einmalcodes
  per E-Mail verschickt und diese App bewusst keinen Mailserver hat.
  Die Einrichtung ist zweistufig: Das Geheimnis gilt erst, wenn ein Code daraus gestimmt hat —
  wer die Einrichtung abbricht, sperrt sich nicht aus. Jeder Code gilt genau einmal, und auch
  das Abschalten verlangt einen, damit eine übernommene Sitzung ihn nicht einfach loswird.
  **Er schützt `/admin`, nicht die darunterliegende API** — wer Superuser-Adresse und Passwort
  hat, kommt weiterhin über `/api/…` an die Daten. Das war vorher genauso; die README sagt es
  jetzt ausdrücklich.
- **Sicherungen gehen jetzt ohne SSH.** Unter Einstellungen steht ein Abschnitt „Sicherungen":
  erstellen, herunterladen, zurückgeben, löschen — und im Ernstfall zurückspielen. Bisher führte
  der einzige Weg über `scripts/backup.sh`, einen SSH-Zugang und die Kenntnis mehrerer Pfade;
  ein Vereinsadmin, der einmal im Monat eine Kopie in die Hand nehmen will, scheiterte daran.
  Das Skript bleibt der Rückhalt für den nächtlichen Lauf auf einer anderen Maschine: Was von
  Hand entsteht, entsteht nur, wenn jemand daran denkt. Der Rückspiel-Knopf ist bewusst schwer
  zu bedienen — der Dateiname muss zur Bestätigung abgetippt werden, und **vorher legt die App
  automatisch eine Sicherung des aktuellen Standes an**, damit ein Fehlgriff zurücknehmbar
  bleibt. Die heruntergeladene Datei ist unverschlüsselt und enthält den gesamten Datenbestand;
  das steht auch in der Oberfläche.
- **Impressum und Datenschutzhinweis lassen sich hinterlegen.** Zwei Textfelder unter
  Einstellungen, aus denen je eine eigene Seite wird — verlinkt im Fuß des Aushangs und auf der
  Einladungsseite, und **ohne Anmeldung erreichbar**: Ein Impressum, das man erst nach dem
  Anmelden sieht, erfüllt seinen Zweck nicht, und den Datenschutzhinweis muss jemand lesen
  können, bevor er auf einen Link tippt. Bleibt ein Feld leer, gibt es die Seite nicht und nichts
  verlinkt darauf. Geschrieben wird reiner Text — HTML wird angezeigt statt ausgewertet, was eine
  ganze Klasse von Angriffen ausschließt. Im Protokoll steht nur, dass sich etwas geändert hat,
  und wie lang der Text jetzt ist; sein Inhalt gehört dort nicht hinein.
- **Die Abfahrtszeit rechnet nicht mehr mit fest verdrahteten Zahlen.** Tempo und Puffer standen
  bei 80 km/h und 25 Minuten im Code — für eine Mannschaft, die über Land fährt, zu niedrig, für
  eine in der Stadt zu hoch. Beide stehen jetzt unter Einstellungen. Die Formel selbst bleibt im
  Backend, damit alle dieselbe Abfahrt sehen.
- **Spieltage können sich selbst schließen.** Wer eine Frist in Stunden hinterlegt, muss nach dem
  Spiel nicht mehr daran denken, den Spieltag zu sperren — sonst ändert jemand hinterher seine
  Zusage. Voreingestellt ist **0, also aus**: Wer bisher von Hand gesperrt hat, findet nach der
  Aktualisierung nichts vor, das er nicht selbst gewählt hat. Geprüft wird stündlich, und im
  Protokoll steht die Zeile mit dem Vermerk „automatisch" statt unter einem Namen.
- **Die Kapitänsansicht hat einen Punkt „Einstellungen", und der Anzeigename ist das erste, was
  dort steht.** Bisher hieß die App auf der Einladungsseite und in jeder Linkvorschau fest
  „Mannschaftsplan"; jetzt trägt der Kapitän dort den Namen seiner Mannschaft ein. Die Eingabe
  sagt gleich daneben, warum das keine reine Geschmacksfrage ist: Die Vorschau entsteht auf den
  Servern des Messengers, bevor ein Mensch den Link antippt, und ist damit für jeden sichtbar,
  dem ein Link weitergeleitet wird. Namen einzelner Personen oder Adressen gehören nicht hinein.
  Änderungen stehen mit altem und neuem Wert im Protokoll.
- **Ein Server, vier Werte, ein Befehl.** `docker-compose.caddy.yaml` stellt Caddy vor die App —
  für alle, auf deren Server noch kein Reverse Proxy läuft. Domain, ACME-Adresse und das Tor aus
  R13b kommen aus der `.env`; die Caddy-Vorlage wird nicht mehr editiert. Fehlt einer der Werte,
  fährt der Stack nicht an und nennt den fehlenden, statt falsch konfiguriert zu laufen. Wer
  bereits einen Proxy betreibt, nimmt weiterhin nur `docker-compose.yaml` — der App-Service ist
  in beiden Fällen derselbe und nur einmal definiert.
- **Die README ist für Betreiber geschrieben, nicht für Entwickler.** Vorn stehen sieben
  nummerierte Schritte vom DNS-Eintrag bis zum ersten verteilten Einladungslink, dazu der Alltag,
  Sicherungen und die häufigen Fehlerbilder. Alles Technische steht gesammelt unter „Für
  Entwickler". Vorausgesetzt wird Docker Compose **2.24 oder neuer**.
- **Die CI prüft die Caddy-Vorlagen.** Beide laufen gegen dieselbe Caddy-Version wie im Betrieb:
  `caddy validate` für die Overlay-Vorlage in beiden Ausbaustufen von R13b, ein Syntaxcheck für
  den Block für vorhandene Proxys, dazu die Formatierung. Vorlagen, die Betreiber unverändert
  übernehmen, waren bis hierher von nichts geprüft.

### Sicherheit
- **R13 ist aufgeteilt, und die Caddy-Vorlagen liefern nichts mehr aus, was ungeprüft
  durchgeht.** Bisher standen `/admin` und `/_/` im selben Block hinter einer IP-Allowlist mit
  einem Beispielbereich darin — eine Vorlage, die man übernimmt, ohne sie zu ändern, schützt
  niemanden. Jetzt gilt: `/_/` antwortet **immer** mit 404, ohne Schalter und ohne Ausnahme; es
  wird im Betrieb nie gebraucht, und für Einrichtung oder Restore führt der Weg über einen
  SSH-Tunnel auf einen an `127.0.0.1` gebundenen Port. Für `/admin` muss der Betreiber einen von
  zwei Wegen einrichten — IP-Allowlist oder eine dem Admin-Code vorgeschaltete Proxy-Anmeldung —
  und solange keiner eingerichtet ist, bleibt `/admin` zu. Beide Wege kommen ohne VPN aus, was
  vorher nicht galt.
- **Bekannte Lücke benannt:** Der Kapitäns-Login prüft das Passwort direkt und geht an
  PocketBases MFA vorbei. Der zweite Faktor schützt heute nur `/_/`, nicht `/admin`. Nachzurüsten
  in Schritt 9; bis dahin deckt das Tor aus R13b diese Stelle.

### Behoben
- **Die Einladungsseite trug den Namen der falschen App.** Wer seinen Link antippte, sah
  „Dartzentrale" als Überschrift, und die Vorschau in WhatsApp meldete „Dartzentrale — Termine"
  — übernommen aus [DartsZentrale](https://github.com/zelko2k1/dartszentrale), aus der die
  Seitenvorlage stammt, und dort auch noch falsch geschrieben. Überschrift, Seitentitel und
  OpenGraph-Titel nennen jetzt diese App. Derselbe Name stand im Titel des Umsetzungsplans und in
  der Erwartung zu Testfall T11; die CI prüft die Vorschau ab sofort mit.
- **Der Deploy unter Arcane brach ab, bevor gebaut wurde** — „dockerfile not found:
  `<projekt>/Dockerfile`". Die Compose-Datei lag in `deploy/` und baute mit `context: ..`,
  also aus einem Verzeichnis oberhalb ihrer selbst. Arcane löst relative Pfade gegen das
  Projektverzeichnis auf statt gegen den Ort der Compose-Datei und suchte das Dockerfile
  dadurch eine Ebene zu hoch. `docker-compose.yaml` liegt jetzt in der Repo-Wurzel und baut
  mit `context: .` — damit gibt es kein Verzeichnis oberhalb mehr, auf das es ankäme.

### Geändert
- **`.env.example` gibt nichts mehr vor.** Statt einer vorgegebenen Adresse stehen dort leere
  Felder; eingetragen wird der Superuser, den man sich selbst angelegt hat. Gebraucht wird die
  Datei nur noch von den Skripten, nicht von der App.
- **Alle Beispiele im Repo tragen neutrale Namen.** Erfundene Personen, Vereine und Orte sind
  aus Feld-Hilfetexten, Kommentaren und dem Umsetzungsplan verschwunden; an ihre Stelle tritt
  die Beschreibung des Feldes. Die Homelab-Vorlage nennt keinen echten Hostnamen und keinen
  echten IP-Bereich mehr, sondern klar gekennzeichnete Platzhalter.
- **Groß steht der Gegner, nicht der Ort.** Im Aushang wie in der Kapitänsliste steht
  jetzt der Vereinsname in der großen Zeile, der Ort rückt zusammen mit der Spielstätte
  darunter. Fehlt der Vereinsname, tritt der Ort an seine Stelle.
- **Der Kopfbalken heißt „Spieltage"** statt „Abfahrt".
- **Datum und Uhrzeit folgen in der Kapitänsansicht den Systemeinstellungen** —
  Reihenfolge, Trenner und 12-/24-Stunden-Zählung. Der Aushang behält seine feste
  Schreibweise, damit er auf jedem Gerät gleich aussieht.
- **„Datum und Anwurf" hat im Formular eine eigene Zeile.** In einer schmalen Spalte
  wurde das Feld abgeschnitten, sobald das System 12-Stunden-Zeit schreibt.

### Behoben
- **Der Anwurf wurde um den Zeitzonen-Versatz verschoben.** Das Eingabefeld arbeitet in
  Ortszeit, PocketBase speichert UTC — dazwischen wurde nichts umgerechnet. Ein im
  Adminpanel eingetragener Anwurf um 19:30 stand im Aushang danach um 21:30, und beim
  erneuten Bearbeiten kamen zwei weitere Stunden dazu.

## [0.1.0] – 2026-08-23

Erste lauffähige Fassung: die Schritte 0–7 des
[Umsetzungsplans](docs/umsetzungsplan.md).

### Hinzugefügt
- **Aushang für die Mannschaft.** Spieltage in der Optik eines Fahrplanaushangs, Zu- und
  Absage je Spieltag, Fahrdienst mit Plätzen und berechneter Abfahrtszeit.
- **Zugang ohne Anmeldung.** Jedes Mitglied bekommt einen persönlichen Token-Link; in der
  Datenbank steht nur `sha256(token)`. Sitzungen sind davon getrennt (R1, R2).
- **Kapitänsansicht** unter `/admin`: Spieltage und Mitglieder pflegen, Token neu
  ausstellen, Protokoll lesen. Eigener Cookie, eigene Sitzungstabelle, eigene Prüflogik;
  ohne Anmeldung antwortet sie mit 404 statt 403 (R5, R6).
- **Härtung** nach den Regeln R1–R14: Rate Limits, die Fehlversuche zählen statt
  Anfragen, CSRF-Kopfzeile, Sicherheitskopfzeilen auch ohne Reverse Proxy, keine Token
  in Logs oder Linkvorschauen.
- **Ein einziges Container-Image** (PocketBase mit gebautem Frontend, Migrationen und
  Hooks) für den Betrieb hinter dem vorhandenen Reverse Proxy.
- **Sicherung** über `scripts/backup.sh`, verschlüsselt an einen GPG-Empfänger.
- **Prüfungen**: 33 API-Testfälle und Unit-Tests, in der CI zusätzlich gegen das gebaute
  Image.
