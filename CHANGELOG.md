# Changelog

Alle nennenswerten Änderungen an Mannschaftsplan werden hier festgehalten.

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

### Hinzugefügt
- **Spielplan einlesen statt eintippen.** Der Vereinsspielplan aus nuLiga (CSV) wird unter
  **Verein → Spielplan einlesen** übernommen — eine Datei für alle Mannschaften, bei einem
  mittelgroßen Verein rund 130 Begegnungen. Gelesen wird sie im Browser: Vorschau und Zuordnung
  der Mannschaften stehen vor dem Übernehmen, und erst danach geht etwas zum Server. Nur der
  Admin, weil die Datei den ganzen Verein umfasst. Ein zweiter Import zieht Verlegungen nach,
  statt Spieltage zu verdoppeln; von Hand angelegte und gesperrte Spieltage bleiben unberührt.
  **Heim oder auswärts entscheidet das Spiellokal**, nicht die Heim-Spalte des Verbands — an
  Turniertagen ist die eigene Mannschaft nominell Heim, spielt aber im Lokal eines fremden
  Vereins, und der Fahrdienst wird dort gerade gebraucht.
- **Hinweis auf unvollständige Spieltage.** Ort, Kilometer und Treffpunkt stehen in keinem
  Verbands-Export. Die Spieltagsliste des Kapitäns sagt jetzt, wie viele Spieltage sie noch
  brauchen, und markiert sie einzeln — statt „Auswärts, 0 km" zu behaupten.
- **Wiederherstellungscodes für den zweiten Faktor.** Beim Einschalten erscheinen zehn Codes, jeder
  einmal verwendbar, jeder ein Ersatz für den Code aus der App. Bisher war ein verlorenes Handy ein
  Fall für den Admin — und beim Admin selbst einer für den SSH-Tunnel. Über **Neue Codes** gibt es
  zehn frische; die alten gelten dann nicht mehr.
- **„Angemeldet bleiben".** Wer den Haken setzt, bleibt 90 Tage auf diesem Gerät angemeldet statt
  zwölf Stunden. Es gibt ihn **nur mit zweitem Faktor**: Ein Gerät, das drei Monate angemeldet
  bleibt, ist ein Passwort, das drei Monate niemand mehr eingibt.
- **Der Kapitän kommt in seine eigene Spieleransicht** — im Kopf der Verwaltung steht „Als
  Spieler", auf dem Aushang steht „Verwaltung". Ein Konto, ein Spielereintrag, ein Lesezeichen.
  Für „wie steht es" und die eigene Zusage braucht er sich damit gar nicht mehr anzumelden.
- **Ein Hinweis für die Ersteinrichtung.** Wer als Admin noch keinen zweiten Faktor hat, sieht
  jetzt oben einen Balken samt Knopf dorthin — vorher erfuhr er von der Pflicht erst, wenn er auf
  „Konten" klickte und einen roten Kasten bekam. Eine Bedingung, die von Anfang an feststeht,
  gehört an den Anfang.
- **Sperren stehen unter „Konten"** — mit der Restzeit und einem Knopf zum Aufheben. Vorher war
  eine Anmeldesperre für den Admin unsichtbar, und der Kapitän am Telefon konnte nur warten.
- **`MANAGE_ALLOW` und `ADMIN_ALLOW`** schränken ein, aus welchen Netzen die beiden Eingänge
  überhaupt erreichbar sind. Ohne Eintrag ändert sich nichts; die README erklärt unter „Nur aus
  dem eigenen Netz erreichbar machen", wann sich das lohnt und wie man sich dabei nicht selbst
  aussperrt.

### Geändert
- **Die Kapitäne brauchen kein Tor-Passwort mehr.** Die Verwaltung hat jetzt zwei Eingänge:
  `/manage` für die Kapitäne, ohne vorgeschaltete Browser-Abfrage, und `/admin` für alles, was nur
  die Rolle `admin` darf — Konten, Mannschaften, Vereinseinstellungen, Sicherungen —, weiterhin
  hinter dem Tor. Ein Tor-Passwort, das sich acht Leute teilen, ist nicht pro Person widerrufbar,
  kennt kein Abmelden und landet im Zweifel in der Mannschaftsgruppe. An seine Stelle treten die
  erzeugten Passwörter, eine zusätzliche Sperre **pro Konto** und die ohnehin engen Rechte eines
  Kapitäns. Ausführlich in R13e des Umsetzungsplans.
- **Für Admin-Konten ist der zweite Faktor Pflicht.** Ohne ihn bleibt alles unter `/admin`
  verschlossen — die App sagt beim ersten Versuch, was fehlt, statt es zu verstecken. Für
  Kapitäne bleibt er freiwillig.
- **Ein selbst gewähltes Passwort braucht zwölf Zeichen** statt zehn und darf nicht den eigenen
  Anmeldenamen enthalten. Die Rechnung, mit der der zweite Faktor für Kapitäne freiwillig bleiben
  kann, lautet „Passwörter werden erzeugt, nicht ausgedacht" — und die gilt nur bis zur ersten
  Änderung.
- **Der Vereinsname steht ab Werk auf „Vereinsname"** statt auf „Mannschaftsplan". Er erscheint im
  Seitentitel, in der Linkvorschau des Messengers, über Impressum und Datenschutzhinweis und als
  Herausgeber in der Authenticator-App — dort stand also der Name der Software, wo der Verein
  hingehört. **Bestehende Installationen behalten ihren Wert**, auch wenn er nie geändert wurde:
  Ein vorhandener Eintrag wird nicht überschrieben.
- **Die erste Mannschaft einer frisch aufgesetzten Anwendung heißt „Erste Mannschaft"** statt
  „Mannschaftsplan". Sie wurde nach dem Vereinsnamen benannt, und der stand ab Werk auf dem Namen
  der Anwendung — im Kopf der Kapitänsansicht, in der Gruppierung unter „Konten" und auf der
  Einladungsseite, die der Messenger als Vorschau abruft, stand damit die Software statt einer
  Mannschaft. Ein Platzhalter, der aussieht wie eine Entscheidung, wird nicht umbenannt.
  **Für bestehende Installationen ändert sich nichts**: Wer seinen Vereinsnamen gesetzt hatte,
  behält ihn wie bisher, und wo die Migration schon gelaufen ist, wird nichts angefasst — es soll
  niemandem seine Mannschaft umbenannt werden.

### Behoben
- **Die servergelieferten Seiten laufen jetzt auch auf Barlow.** Einladungsseite, „Link ungültig",
  Impressum und Datenschutz standen in der Systemschrift — ausgerechnet das Erste, was ein neues
  Mitglied sieht, sah damit anders aus als die App dahinter. Die drei nötigen Schnitte liegen
  unter festen Namen in `/schrift` (rund 65 kB), weil die Kopien aus dem Bundle einen Hash im
  Namen tragen, der sich bei jedem Bau ändert. Mit `font-display: swap`: Die Seite steht sofort
  da, die Schrift kommt nach.
- **Hervorhebungen wurden vom Browser nachgeahmt statt gesetzt.** Von Barlow sind die Schnitte
  400, 500 und 600 geladen; ein `<strong>` verlangt aber 700, und den rechnete sich der Browser
  aus, indem er die 400 künstlich verdickte. Neben einem echten 600 im selben Absatz sah das
  unruhig aus. Hervorhebungen stehen jetzt auf 600 — dem Gewicht, mit dem in dieser App ohnehin
  betont wird.
- **Die Kopfbalken sind wieder gleich hoch.** Die Überschrift in der Verwaltung stand auf
  1,4 rem, die im Aushang auf 1,5 — bei gleichem Innenabstand war der Balken damit 1,6 px
  flacher, was beim Wechsel zwischen den Ansichten auffiel. Der Kopf im Aushang bricht jetzt
  außerdem um statt zu quetschen, wenn rechts neben dem Namen noch „Verwaltung" steht.
- **Der Kopfbalken im Aushang war nur so breit wie seine Beschriftung.** Zwei verschiedene Dinge
  hießen im Stylesheet `.balken`: der gelbe Kopfbalken und die Kästchen, die die Belegung eines
  Autos anzeigen. Gleiche Spezifität, und die Datei mit den Kästchen lädt später — deren
  `display: inline-flex` landete damit auf jedem Kopfbalken und ließ ihn schrumpfen. Die Kästchen
  heißen jetzt `.belegung`.
- **Schreibende Anfragen ohne CSRF-Kopfzeile wurden in der Verwaltung trotz „403" ausgeführt.**
  Die Vorprüfung meldete den Fehler korrekt, brach die Bearbeitung aber nicht ab: Sie gab die
  fertige Antwort zurück, und `e.json()` liefert in PocketBases JavaScript-Umgebung `undefined` —
  die Abbruchbedingung war damit immer falsch. Sichtbar war das nur an zwei JSON-Objekten im
  Rumpf; der Statuscode stimmte, weil ihn das erste Schreiben festlegt. Betroffen war
  ausschließlich der Verwaltungs-Router, nicht die Mitgliederseite. Alle Vorprüfungen geben dort
  jetzt Daten zurück statt einer Antwort, und der neue Testfall C2 prüft die Wirkung statt des
  Statuscodes.
- **Die zugeklappte Zeile sagt jetzt, was du selbst geantwortet hast.** Sie zeigte den Stand der
  Mannschaft und ob jemand fährt — nur die eigene Zusage fehlte. Solange nichts eingetragen war,
  stand dort „du fehlst noch"; sobald man antwortete, verschwand der Hinweis und nichts trat an
  seine Stelle. Wer wissen wollte, ob er zugesagt hatte, musste die Zeile aufklappen. Jetzt steht
  an derselben Stelle „du: dabei", „du: unsicher" oder „du: kann nicht" — die Zeile wird dadurch
  nicht länger, und der Aushang bleibt aus einem Blick lesbar.
- **Ohne Mannschaft führt kein Weg mehr ins Leere.** Wer die letzte Mannschaft auflöst, stand
  bisher vor drei Sackgassen: Der Reiter „Mannschaft" hing unbegrenzt in „Einen Moment …", weil
  er auf Daten wartete, die es nicht gab; „Spieltage" ließ ein Formular mit elf Feldern ausfüllen
  und der Server lehnte am Ende ab; und im Kopf stand das Wort „Mannschaft", das sich wie ein
  Name las. Jetzt steht überall derselbe Wegweiser, die Ansicht springt auf den Reiter „Verein",
  dort liegt das Anlegen ganz oben mit einem Satz dazu, was danach kommt, und der Kopf sagt
  „Noch keine Mannschaft".
- **„Ungültige Angabe." sagt jetzt, was fehlt, wenn es das sagen darf.** Beim Anlegen von
  Spieltagen und Mitgliedern teilten sich zwei Gründe eine Meldung. „Es ist keine Mannschaft
  gewählt" ist ein Zustand, den der Anfragende ändern kann — er heißt jetzt „Wähle zuerst eine
  Mannschaft aus.". „Diese Mannschaft darfst du nicht" bleibt wortkarg (R6).
- **Eine erfundene Mannschaftskennung fällt nicht mehr der Datenbank vor die Füße.** Für einen
  Admin lässt die Rechteprüfung jede Mannschaft zu, auch eine, die es nicht gibt — der Fehler
  fiel erst beim Speichern auf, und PocketBase antwortete mit „Failed to find all relation
  records with the provided ids.": englischer Rohtext, genau das, was der Code an dieser Stelle
  zu verhindern versprach.

### Behoben
- **Knöpfe neben Eingabefeldern sind so hoch wie die Felder.** Ein Knopf ist ein Flex-Kind und
  streckte sich von sich aus über die volle Zeilenhöhe: „Konto anlegen" stand mit gemessenen
  **119 px** neben Kästen von 44 px, weil unter dem ersten Feld noch zwei Zeilen Hinweistext
  stehen; „Sicherung erstellen" auf 64 px. Er sah aus wie eine Fläche, nicht wie ein Knopf. Jetzt
  ist er 44 px hoch und sitzt auf derselben Linie wie die Kästen — als Regel für alle gemischten
  Zeilen, statt wie bisher als Einzelfall an genau einer Stelle.
- **Das Feld „Datei zurückgeben" passt wieder ins Bild.** Ein Dateifeld bringt seine eigene
  Mindestbreite mit (Knopf des Browsers plus Dateiname), und ein Flex-Kind schrumpft ohne
  `min-width: 0` nicht darunter: Bei 320 px war es 330 px breit. Zu sehen war es nicht, weil der
  Rahmen der Ansicht abschneidet — der rechte Teil des Feldes fehlte trotzdem.

### Sicherheit
- **Einladungslinks standen in PocketBases eigenem Anfrageprotokoll — mit vollständigem Token.**
  R8 verlangt, dass ein Token in keinem Protokoll landet; dafür überspringt Caddy die Route
  `/j/*`. Das deckt aber nur ein Protokoll ab. PocketBase führt daneben die Tabelle `_logs` mit
  Methode, **vollständiger URL**, Statuscode, Browserkennung und IP-Adresse, aufbewahrt fünf
  Tage — und ein Aufruf des Einladungslinks landete dort mitsamt Token. Weil `_logs` in `pb_data`
  liegt, war es außerdem **in jeder Sicherung**: Die Sicherungen sind ausdrücklich
  unverschlüsselt und sollen auf den eigenen Rechner wandern, eine Kopie der Datenbank war also
  eine Kopie funktionierender Zugänge. Genau das, was R1 verhindern soll.
  **Behoben** durch die Migration `1788600000_kein_anfrageprotokoll.js`: PocketBases
  Anfrageprotokoll ist abgeschaltet (`logs.maxDays = 0`). Eine Ausnahme für einzelne Routen bietet
  PocketBase nicht. Für den Betrieb geht nichts verloren — Caddy protokolliert weiter, und
  Meldungen der Hooks stehen in der Containerausgabe. Testfall **T22** hält es fest.
  **Für Betreiber:** Die Migration greift beim nächsten Start von selbst; es ist nichts von Hand
  einzustellen. Wer eine ältere Sicherung zurückspielt, sollte danach prüfen, dass unter
  Einstellungen → Logs die Aufbewahrung auf 0 steht.

### Behoben
- **Der Rückfragekasten meldet sich jetzt auch der Tastatur und der Bildschirmleseanwendung.**
  Beim Ersetzen der `window.confirm` ging die eine Sache verloren, die der Systemdialog gut
  konnte: Er nahm den Fokus an sich und kündigte sich an. Der Ersatz tat beides nicht — wer
  „Löschen" mit der Tastatur auslöste, blieb mit dem Fokus auf „Löschen" stehen, während darunter
  ein Kasten erschien, von dem eine Bildschirmleseanwendung gar nichts sagte. Jetzt
  `role="alertdialog"` mit Titel und Text als Bezug, Fokus beim Erscheinen auf den ausführenden
  Knopf, Escape bricht ab, und beim Schließen geht der Fokus dorthin zurück, wo er herkam.
  Betroffen waren ausschließlich zerstörende Wege.
- **Wer sein Auto zurückzieht, erfährt jetzt, wen es trifft.** „Ich fahre" ein zweites Mal
  anzutippen löscht die Fahrt, und der Server räumt die Mitfahrer per Cascade mit weg — bisher
  ohne jede Rückfrage, und die Quittung lautete lapidar „du fährst nicht". Zwei Menschen standen
  ohne Mitfahrgelegenheit da, und der Verursacher erfuhr nicht, dass er es getan hatte. Jetzt
  fragt derselbe Kasten nach, der in der Kapitänsansicht vor dem Löschen steht — er nennt die
  Namen —, und die Quittung sagt, wer sich neu einteilen muss. Ein **leeres** Auto zurückzuziehen
  betrifft niemanden und fragt weiterhin nichts.
- **Das Protokoll findet die Zeilen einer Mannschaft auch weiter hinten.** Der Server holte die
  neuesten hundert Zeilen und filterte **danach** auf die Mannschaft. In einem Verein mit mehreren
  Mannschaften hieß das: Wer die Damen betreut, sah sein Protokoll nur, wenn seine Zeilen zufällig
  unter den letzten hundert des ganzen Vereins lagen — sonst las er „Noch nichts passiert.", ein
  Protokoll, das genau in der Lage schweigt, für die es gebaut wurde. Jetzt wird stapelweise
  weitergelesen, bis genug eigene Zeilen zusammen sind.
- **„du fehlst noch" steht nicht mehr an abgeschlossenen Spieltagen.** Die Bedingung schloss
  gesperrte Spieltage nicht aus, also forderte die Zeile zu etwas auf, das im aufgeklappten
  Bereich mit „Änderungen sind nicht mehr möglich." beantwortet wurde.

### Hinzugefügt
- **Der Kapitän sieht endlich, ob seine Mannschaft vollzählig ist.** In seiner Spieltagsliste
  steht jetzt derselbe Satz wie im Aushang — `4/4 zugesagt · 2 Plätze frei · kein Fahrer` —, und
  ein aufklappbarer Bereich je Spieltag lässt ihn **Rückmeldungen korrigieren**: wer telefonisch
  zusagt, wird dort eingetragen. Auch an abgeschlossenen Spieltagen; genau dafür war die Route
  gebaut. Sie existierte seit dem Bau der Kapitänsansicht samt Protokolleintrag und Prüfung auf
  die eigene Mannschaft — nur hatte sie nie eine Oberfläche bekommen, und die Spieltagsroute
  lieferte die Rückmeldungen gar nicht erst mit. Damit wird die Aussage aus PRODUCT.md erstmals
  eingelöst: „ohne selbst nachzuzählen und ohne jemanden einzeln anzuschreiben."
- **Der Einladungslink lässt sich kopieren und weitergeben.** Vorher stand er als markierbarer
  Text da — am Handy hieß das langes Antippen und hoffen — und ein Reiterwechsel vernichtete ihn
  endgültig; wiederherstellen ging nur, indem man den gerade verschickten ungültig machte. Jetzt:
  „Link kopieren" mit Rückmeldung, „Weitergeben" über die Teilen-Funktion des Geräts, und der
  Kasten bleibt stehen, bis man „Verschickt" antippt. Er sagt außerdem, was der Kapitän beim
  Verschicken dazusagen muss: **dass der Link persönlich ist und ein Passwort ersetzt** (R14).

### Geändert
- **Der Aushang beginnt bei dem, was kommt.** Der Spielplan kommt nach Datum sortiert, also
  standen mitten in der Saison zuerst zwölf vergangene Spieltage und der nächste Termin unterhalb
  des Bildschirms. Vergangenes liegt jetzt zusammengefaltet obenauf hinter „Vorbei (12)".
- **Nachfragen vor Unwiderruflichem sprechen die Sprache der Anwendung.** Die sieben
  `window.confirm` sind weg — ein Dialog des Betriebssystems mit runden Ecken in einer App, die
  „0 px Ecken, keine Schatten" zur Markenfestlegung erklärt hat, und in jedem Browser für die
  Sitzung abschaltbar. An ihrer Stelle steht der Kasten, den das Zurückspielen einer Sicherung
  schon benutzt, an der Zeile, aus der er aufgerufen wurde. **„Neues Passwort" fragt überhaupt
  zum ersten Mal**: Es sperrt eine Person aus und stand bisher ohne jede Rückfrage zwischen zwei
  bestätigten Handlungen.

### Behoben
- **Der Erfolg ist nicht mehr stumm.** Wer „Dabei" antippte, sah nur einen sich füllenden Knopf.
  Auf einer trägen Verbindung tippte man deshalb nochmal — und nahm damit die eigene Zusage
  zurück, ohne es zu erfahren. Jetzt steht dort eine Zeile Klartext, die auch angesagt wird:
  „Gespeichert: Dabei." Der Grundsatz „Ehrlich statt hübsch" verlangt beim Fehler eine Zeile
  Klartext; er verlangt beim Erfolg nicht Schweigen.
- **Die Anmeldung mit zweitem Faktor meldet den Erfolg nicht mehr als Fehler.** Sobald der Server
  den Code verlangte, erschien das Codefeld zusammen mit einem rot umrandeten Fehlerkasten,
  obwohl das Passwort gestimmt hatte. Jetzt steht dort: „Passwort stimmt. Jetzt der Code aus
  deiner Authenticator-App."
- **Der Fokusrahmen auf der Reiterleiste war unsichtbar.** Er liegt zwei Pixel außerhalb des
  Knopfes — also auf der Tafel, und die ist seit dem Umbau der Reiter in Tinte. Tinte auf Tinte,
  gemessene 1,0:1: Wer mit der Tastatur durch die Kapitänsansicht ging, sah nicht mehr, wo er
  war. Der Rahmen liegt jetzt innen auf der Kachel und wird auf der gewählten Kachel zu Papier —
  beide Male 17,2:1. Nachgemessen über alle zwölf Bedienelemente: der schwächste Rahmen steht
  bei 10,2:1.

### Geändert
- **Der Spieler lädt die Kapitänsansicht nicht mehr mit.** Sie wird erst geholt, wenn jemand
  `/admin` aufruft. Für den Spieler sind das **8,9 kB weniger über die Leitung** (63,8 statt
  72,6 kB gzip) und **41 kB weniger JavaScript zu übersetzen** (204 statt 245 kB) — Letzteres
  zählt auf einem Telefon, das nicht neu ist. Dazu 0,8 kB CSS, denn `admin.css` wandert mit.
  Nachgemessen: Auf dem Aushang wird der Verwaltungsteil nachweislich nicht angefordert, und
  `/admin` lädt ihn nach und zeigt die Anmeldemaske wie zuvor.

### Behoben
- **Die Kapitänsansicht scrollte auf dem Handy zur Seite.** Fünf Reiter brauchten bei 320 px
  Breite 372 px — die ganze Seite ließ sich 54 px nach rechts schieben, und „Protokoll" lag halb
  außerhalb. Der Streifen bricht jetzt um: drei Reiter, dann zwei, jeder weiterhin 44 px hoch.
  Ab etwa 500 px stehen wieder alle fünf nebeneinander. Die Trennlinien sind dabei von Rahmen zu
  Lücken geworden — ein Rahmen müsste beim Umbruch wissen, ob er am Zeilenende steht, eine Lücke
  weiß das von selbst.
- **Der Stempel „Komplett" schob den Aushang 8 px aus dem Bild.** Seine Drehung um 7 Grad macht
  den Malbereich breiter als den Platz im Layout; bei 320 px ragte die obere rechte Ecke hinaus.
  Er rückt jetzt weit genug herein, und der Rahmen des Aushangs schneidet zusätzlich ab, was über
  ihn hinausragt.
- **Berührungsziele halten die eigene 44-px-Zusage aus PRODUCT.md.** „Abmelden" im Kopfbalken war
  26 px hoch, die Verweise auf Impressum und Datenschutz im Fuß 15 px, die Mannschaftsauswahl
  26 px. Alle drei sind auf 44 px gewachsen — aber **nur bei Bedienung mit dem Finger**
  (`pointer: coarse`) und nur in der Fläche zum Antippen: Innenabstand hinaus, negativer
  Außenabstand zurück, das Bild bleibt gleich. An der Maus ändert sich nichts.
- **Angetippte Knöpfe bleiben nicht mehr „gedrückt".** Auf einem Handy hängt ein `:hover` nach
  dem Antippen fest, bis irgendwo anders getippt wird. Die Schwebezustände gelten jetzt nur noch,
  wo es ein Zeigegerät gibt, das schweben kann.
- **Safari zoomt beim Antippen der Mannschaftsauswahl nicht mehr hinein.** Sie war 13,6 px groß;
  unter 16 px vergrößert iOS die ganze Seite, sobald ein Bedienelement den Fokus bekommt — der
  Kopfbalken sprang dabei aus dem Bild.
- **Die Seitenhöhe rechnet die Browserleiste mit** (`100dvh` mit `100vh` als Rückfall).

### Geändert
- **Wiederkehrende Stilangaben sind jetzt Teil des Entwurfs statt Beiwerk im Bauteil.** In
  `Admin.tsx` standen 48 Stilangaben direkt am Element; 31 davon waren Wiederholungen derselben
  Aussage. Neu benannt: `--blank` (das unbedruckte Weiß von Eingabefeldern und Hinweiskästen,
  vorher dreimal `#fff`), `.balken` (der gelbe Balken — Kopf des Aushangs, Kopf der
  Kapitänsansicht, Überschrift auf „Link ungültig"), `.liste`, `.eintrag` (eine Zeile in einer
  Aufzählung mit Trennlinie), `.feld--zeile` und `.feld--kurz` (die zwei Arten, wie ein Feld in
  einer Aktionszeile steht) sowie `.token__text`. Sichtbar ändert sich nichts — mit einer
  Ausnahme: Die neun Felder, die sich den Rest der Zeile nehmen, hatten zwei verschiedene
  Grundbreiten (12 und 14 rem), die nie eine Entscheidung waren, sondern an verschiedenen Tagen
  entstanden. Jetzt haben sie eine.
- **Die Farben der servergerenderten Seiten sind gegen das Auseinanderlaufen gesichert.** Die
  Palette steht zwangsläufig an zwei Orten: in `app/src/index.css` als Token und in
  `pocketbase/pb_hooks/seiten.js` als rohe Hex-Werte, weil die Hook-Laufzeit kein Stylesheet
  einlesen kann. Zusammenlegen ginge nur über einen Bauschritt, den dieses Projekt nicht hat —
  also prüft `app/src/farben.test.ts` jetzt, dass jede Farbe der Einladungs- und
  Rechtstextseiten eine Farbe aus der Palette ist. Wer ein Token ändert und diese Seiten
  vergisst, sieht es in der CI und nicht erst am fremden Weiß im Messenger.

### Behoben
- **Die Anwendung lässt sich mit einer Bildschirmleseanwendung ansteuern.** Bisher hatte der
  Aushang gar keine Überschrift und sprang direkt auf die dritte Ebene; die Kapitänsansicht
  hatte unterhalb ihrer einen Überschrift ebenfalls keine, denn ihre Abschnittsnamen waren
  `span`. Damit fiel der übliche Weg aus, sich auf einer Seite zurechtzufinden. Jetzt trägt
  jede Ansicht eine `h1`, die Abschnitte stehen auf der zweiten Ebene, und **der aufklappende
  Knopf eines Spieltags steckt in einer Überschrift** — das übliche Muster für ein Akkordeon,
  mit dem sich von Spieltag zu Spieltag springen lässt. Dazu hat jede Ansicht eine
  `main`-Landmarke, auch die Zwischenstände „lädt", „Link ungültig" und „lässt sich nicht
  laden". Sichtbar ändert sich dabei nichts.
- **Fehlermeldungen werden jetzt auch angesagt.** Sie standen in einer Live-Region, die erst
  zusammen mit ihrem Inhalt ins Dokument kam — eine Region, die vorher nicht da war, wird von
  etlichen Bildschirmleseanwendungen nie beobachtet und bleibt deshalb stumm. Der Behälter steht
  jetzt dauerhaft und bleibt leer, solange nichts zu melden ist (`Meldung.tsx`, an 16 Stellen im
  Einsatz). Fehler unterbrechen (`alert`), Gelungenes wartet ab (`status`).
- **Die Eingabetaste sendet ab.** In sieben Formularen tat sie nichts, weil dort ein Knopf mit
  `onClick` stand statt eines `form`: Passwort ändern, Mannschaftsname, neue Mannschaft, neues
  Konto, Sicherung zurückspielen und beide Code-Eingaben des zweiten Faktors. Gerade beim
  sechsstelligen Code ist Enter die natürlichste Bewegung, die es gibt. Nebenbei finden
  Passwortverwaltungen ein Formular auch daran, dass es eines ist.
- **Ein zweiter Klick auf „Abschließen" macht den ersten nicht mehr rückgängig.** „Abschließen"
  und „Deaktivieren" sind Umschalter — auf einer trägen Verbindung klickt man zweimal, und dann
  sperrte der erste Ruf und entsperrte der zweite. Es sah aus, als sei nichts passiert, dabei
  standen zwei Zeilen im Protokoll. Beim Ausstellen eines Tokens wog es schwerer: Zwei Rufe
  stellten zwei Token aus, und welches davon angezeigt wurde, entschied die Reihenfolge der
  Antworten — der Kapitän verschickte womöglich einen Link, der schon wieder ungültig war.
  Gesperrt wird jeweils nur die Zeile, an der gearbeitet wird.
- **Vergangene und abgeschlossene Spieltage sind wieder lesbar.** Sie traten bisher über
  `opacity` zurück, und Deckkraft erfasst die ganze Rendergruppe: Der Sekundärtext einer solchen
  Zeile kam auf 2,2:1, verlangt sind 4,5:1 — auf einem Handy bei Tageslicht war er weg. Betroffen
  war nicht der Randfall, sondern der Normalfall, denn nach Ablauf der Sperrfrist wird jeder
  Spieltag abgeschlossen. Statt der Deckkraft gibt es jetzt eine **stille Tinte**
  (`--tinte-still`, auf Gelb ein eigener Ton wie bei `grau` und `rot` auch). Der Abstand zur
  vollen Tinte ist Faktor 3, die Zeile tritt also weiterhin sichtbar zurück; das schwächste Wort
  darin steht bei 5,5:1.
- **Die Kennzeichnung eines abgeschlossenen Spieltags wirkt jetzt tatsächlich.** Die Kante links
  und das Wort „abgeschlossen" sollten laut Kommentar und laut den Zusagen in `PRODUCT.md`
  gerade *nicht* mit abblenden — sie tragen den Zustand unabhängig von der Farbe. Sie lagen aber
  innerhalb derselben Opazitätsgruppe und blassten Punkt für Punkt mit ab; die Kante landete bei
  2,2:1 statt der für Nicht-Text verlangten 3:1. Beide stehen jetzt in voller Tinte: Was die
  Zeile einmal war, steht in Grau, was sie jetzt ist, in Schwarz.
- **Warnungen an vergangenen Spieltagen sind nicht mehr rot.** „Kein Fahrer" an einem Spieltag,
  der vorbei ist, forderte zu einer Handlung auf, die niemand mehr ausführen kann. Rot bleibt
  den Dingen vorbehalten, an denen sich noch etwas ändern lässt — Fehlermeldungen im
  aufgeklappten Bereich und „Löschen" in der Kapitänsansicht sind unberührt.
- **Das TOTP-Geheimnis wird wieder in der vorgesehenen Schrift gesetzt.** Es verwies auf
  `--schrift-fest`; diese Variable gibt es nicht, richtig ist `--schrift-mono`. Ausgerechnet die
  Stelle, an der jemand 32 Zeichen fehlerfrei abtippt, bekam die generische Systemschrift.

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
- **Die Rollen heißen jetzt `admin` und `kapitaen`, und sie sind sauber getrennt.** Aus `gesamt`
  wurde `admin` — ein Wort, das auch versteht, wer dieses Projekt nicht kennt.
  **Der Admin ist kein Spieler und kein Kapitän:** Er hat weder Mannschaft noch Spielereintrag,
  und die Route lehnt beides ab. Wer verwaltet, soll in seiner eigenen Verwaltung nicht Partei
  sein.
  **Ein Kapitänskonto lässt sich mit einem Spielereintrag verknüpfen** — Vorbild ist die
  Dartszentrale, wo die Spielerliste die einzige Quelle für sportliche Personen ist und
  Login-Konten davon getrennt sind und *optional* auf einen Spieler verweisen. Bisher hatte ein
  mitspielender Kapitän zwei Identitäten, die nichts voneinander wussten. Verknüpft werden kann
  nur ein Spieler derselben Mannschaft.
  **Der Kapitän sieht drei Reiter** — Spieltage, Mannschaft, Protokoll. Die zentralen
  Einstellungen bekommt er nicht mehr zu Gesicht; sie gingen ihn ohnehin nichts an.
- **„Mein Konto" hinter dem eigenen Namen im Kopf.** Zweiter Faktor und Passwort ändern. Das
  gehört zur Person und zu keiner Mannschaft — in einem Reiter stünde es falsch.
- **Jeder kann sein eigenes Passwort ändern.** Kapitäne bekommen ein erzeugtes und mussten
  bisher damit leben. Das bisherige muss mit, sonst genügte eine übernommene Sitzung, um jemanden
  auszusperren; andere angemeldete Geräte fliegen dabei heraus.
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
