# Product

<!-- impeccable:product-schema 1 -->

Abgeleitet aus `docs/umsetzungsplan.md` — dort steht die verbindliche Vorgabe. Wo sich beide
widersprechen, gilt der Umsetzungsplan.

## Platform

web

## Users

Ein **Verein** mit mehreren Mannschaften auf einer selbst betriebenen Instanz. Drei Rollen:

- **Spieler** — meldet sich für Spieltage zurück (dabei / unsicher / kann nicht) und trägt sich
  in den Fahrdienst ein. Hat **kein Konto und kein Passwort**: Er kommt über einen persönlichen
  Token-Link herein, den sein Kapitän einmal per Einzelchat verschickt.
- **Kapitän** — betreut genau **eine** Mannschaft: Spieler anlegen und bearbeiten, Spieltage
  pflegen, Rückmeldungen korrigieren, Token neu ausstellen, das Protokoll seiner Mannschaft
  lesen. Meldet sich mit Anmeldename und Passwort an. Mehrere je Mannschaft sind vorgesehen; eine
  Vertretung ist schlicht ein zweites Konto. Sein Konto lässt sich mit seinem Spielereintrag
  verknüpfen, wenn er selbst mitspielt.
- **Admin** — sieht und darf alles: Mannschaften und Konten anlegen, Rechtstexte pflegen,
  Sicherungen ziehen und einspielen. Hat **weder Mannschaft noch Spielereintrag**; wer verwaltet,
  soll in seiner eigenen Verwaltung nicht Partei sein.

Einsatzsituation der Spieler: das Handy in der Kneipe oder auf dem Sofa, ein paar Tage vor dem
Spieltag. Kurzer Blick, ein bis zwei Antippen, wieder weg. Niemand sitzt „in der App".

## Product Purpose

Die Frage „Wer kommt mit, und wer fährt?" aus dem WhatsApp-Gruppenchat herausholen, wo sie
zwischen 40 Nachrichten verlorengeht. Erfolg heißt: Der Kapitän sieht auf einen Blick, ob seine
Mannschaft vollzählig ist und ob genug Autos da sind — ohne selbst nachzuzählen und ohne jemanden
einzeln anzuschreiben.

**Aus dem Ausrollen (01.–02.09.2026) ist das schärfer geworden**, und zwar von den Mitgliedern her:
*Alles, was zu einem Spieltag gehört, kompakt an einem Ort — für die kommenden wie für die
abgeschlossenen. Kein großes Gelaber mehr in WhatsApp.* Der Spieltag ist die Einheit, nicht der
Fahrdienst; was man über ihn wissen will, gehört an ihn, davor wie danach. Daran ist zu messen,
was dazukommt — und was nicht: **Es geht um Information zum Spieltag, nicht um Auswertung
darüber.**

## Positioning

Der Unterschied zu jeder Umfrage-App: **Für den Spieler kein Konto, keine Anmeldung, keine
Installation.** Link antippen, drei Knöpfe, fertig. Der Preis dafür steht offen im Plan (R14):
Wer den Link eines Spielers weitergibt, ist dieser Spieler. Für eine Mannschaft, die sich seit
Jahren kennt, ist das der richtige Tausch.

Der Unterschied zu sieben Einzelinstanzen: **ein Verein, eine Instanz.** Einmal sichern, einmal
aktualisieren, ein Satz Rechtstexte — und die Mannschaften sehen einander trotzdem nicht.

**Nicht zu verwechseln** mit DartsZentrale — der großen Vereins-App mit Darts-Counter,
Ligabetrieb und Statistik. Zwei getrennte Produkte. Dass der Mannschaftsplan seit dem 02.09.2026
das Ergebnis eines Spieltags anzeigt, ändert daran nichts: Es steht dort als Hinweis am Termin und
wird nirgends zusammengezählt. Das Rollenmodell (Spielerliste als einzige
Quelle sportlicher Personen, Konten davon getrennt und optional damit verknüpft) ist von dort
übernommen, weil es sich bewährt hat — nicht als Schritt zur Zusammenführung.

## Operating Context

- **Zielgruppe ist jeder Verein, der die App selbst hostet** — nicht ein bestimmter. Der
  Einrichtungsaufwand, die Mehr-Mannschaften-Fähigkeit und die hinterlegbaren Rechtstexte gehören
  deshalb zum Produkt und nicht zum Sonderfall eines Betreibers.
- **Handy zuerst.** Ab 320 px Breite bedienbar; Tastatur- und Desktopbedienung müssen möglich
  sein, sind aber nicht der Regelfall.
- **Der Einstieg ist ein Link aus WhatsApp** — der Messenger ruft ihn zur Vorschau serverseitig
  ab, bevor ein Mensch ihn antippt.
- **Selbst gehostet:** PocketBase als ein Binary hinter einem Reverse Proxy; lokal ohne Docker
  entwickelt, betrieben als Container auf einem eigenen Server.
- **Deutsch, Du-Form.**

## Capabilities and Constraints

**Was die App kann:**

- Mehrere Mannschaften unter einem Dach, strikt voneinander getrennt.
- Spielplan je Mannschaft mit Heim/Auswärts, Gegner, Ort, Anwurf, Entfernung, Treffpunkt.
- **Berechnete Abfahrtszeit** für Auswärtsspiele — im Backend gerechnet, damit alle dieselbe Zeit
  sehen. Tempo und Rüstzeit lassen sich je Spieltag überschreiben, die Abfahrt selbst von Hand
  setzen; leer heißt jeweils: der eingebaute Standard rechnet.
- **Das Ergebnis eines gespielten Spieltags** — der Kapitän trägt zwei Zahlen ein, in der Zeile
  steht ein Stempel: `SIEG 6:2`, `NIEDERLAGE 2:6`, `UNENTSCHIEDEN 4:4`. Als Hinweis, nicht als
  Auswertung: Es hängt am Spieltag und verschwindet mit ihm nach 365 Tagen.
- Rückmeldung pro Spieler und Spieltag: dabei / unsicher / kann nicht. Wer zusagt und **selbst
  zum Spielort kommt**, sagt das am Fahrdienst — er sucht dann keinen Platz, und der Kapitän
  sieht, wer am Spieltag ohnehin dort steht.
- **Verlegte Spieltage behalten ihre Rückmeldungen und kennzeichnen sie.** Ein Spieltag fällt
  selten aus, er wird verschoben; wer vor der Verschiebung geantwortet hat, hat den neuen Termin
  nie gesehen. Die Zusage bleibt stehen und gilt als unbestätigt, bis derjenige sie noch einmal
  antippt. Als Verlegung zählt ein anderer Kalendertag oder mindestens eine Stunde.
- Fahrdienst: wer fährt mit wie vielen Plätzen, und wer sitzt in welchem Auto. **Ein
  Auswärtsspiel kann auch ohne auskommen** — wer mit Bus und Bahn anreist, schaltet den Fahrdienst
  am Spieltag ab; dann wird auch keine Abfahrtszeit gerechnet, denn die Formel gilt fürs Auto.
- Spieltage schließen sich nach einer einstellbaren Frist von selbst.
- Konten für Kapitäne und Admins, mit optionalem zweitem Faktor (TOTP). Der Admin sieht, wer
  einen hat, und kann ihn abschalten — einrichten kann ihn nur die Person selbst.
- Sicherungen aus der Oberfläche: erstellen, herunterladen, zurückgeben, einspielen.
- Impressum und Datenschutzhinweis hinterlegbar, ohne Anmeldung erreichbar.

**Verbindliche Grundsätze — hier ist nichts offen:**

- Keine externen CDNs, keine Tracker, keine Analytics; Schriften selbst gehostet.
- Von Spielern werden Name, Verfügbarkeit und Fahrbereitschaft gespeichert — **keine
  Telefonnummern, Adressen, Geburtsdaten oder E-Mail-Adressen.** Konten haben einen Anmeldenamen
  in E-Mail-Form; er ist kein Kontaktweg, und die App hat keinen Mailserver.
- Einladungslinks werden nur als Prüfsumme gespeichert und tauchen in keinem Protokoll auf.
- Das PocketBase-Dashboard ist nie öffentlich erreichbar; vor der Kapitänsansicht und der
  Superuser-Anmeldung steht ein Gate im Reverse Proxy (R13a–c).

**Heute nicht gebaut — als Stand, nicht als Schwur:**

Tabellen, Saisonbilanzen, Statistiken und Averages; Push-Nachrichten; WhatsApp-Anbindung;
Mehrsprachigkeit;
Konten für Spieler; eine Routenberechnung über einen Kartendienst (erwogen und zurückgestellt,
weil sie einen API-Schlüssel und eine Abhängigkeit einführte, die das Produkt bisher nicht hat).

**Ergebnisse gab es hier bis zum 02.09.2026 auch** — und zwar mit der Begründung, die App kenne
keine Ergebnisse und sei deshalb für jeden Verein brauchbar. Auf Wunsch aus der Mannschaft ist die
Linie neu gezogen: **Ein Ergebnis am einzelnen Spieltag ja, alles Aufsummierende nein.** In den
Worten des Betreibers: „Hier geht es nicht um eine Statistik, sondern einfach nur als Hinweis.
Keine Auswertung, keine Statistik, einfach nur Info. Für den Rest gibt es die DartsZentrale."
Die Abgrenzung hält damit weiterhin, sie verläuft nur an einer anderen Stelle — und weil die
Zahlen mit dem Spieltag verschwinden, gibt es nichts, woraus sich eine Tabelle bauen ließe.

**Auch keine Zählung, wer wie oft gefahren ist** — vorgeschlagen und ausdrücklich abgelehnt. Eine
solche Zahl beantwortet keine Frage, die jemand hat, sondern eröffnet eine, die niemand stellen
wollte: „Ich bin siebenmal gefahren, du dreimal." Der Fahrdienst funktioniert, weil man sich
kennt; eine App, die mitzählt, macht daraus eine Abrechnung. Wer sehen will, wie es um einen
Spieltag steht, findet das am Spieltag.
Diese Liste beschreibt den Umfang von heute und darf sich ändern — sie steht hier, damit eine
Erweiterung eine Entscheidung ist und kein Versehen.

## Brand Commitments

- **Optik: Abfahrtsplan.** Fahrplanaushang, nicht App-Look. Die Papierfarbe codiert Heim (weiß)
  und Auswärts (gelb) und ist die Hauptorientierung beim Scrollen — sie darf nicht durch weitere
  Farbflächen verwässert werden.
- **0 px Ecken, keine Schatten, keine Verläufe.** Linien in Tinte: 2 px zwischen Zeilen,
  1,5 px gestrichelt innerhalb einer Zeile.
- Farben und Schriften sind in Abschnitt 6.2 des Umsetzungsplans festgelegt und nicht Gegenstand
  weiterer Gestaltung.
- **Sprache:** kurze Sätze, Du-Form. Knöpfe benennen die Handlung („Dabei", nicht „Absenden").
  Die Person, die eine Mannschaft betreut, heißt durchgehend **Kapitän**.
- (Kein Logo, keine erfundenen Claims oder Referenzen.)

## Evidence on Hand

- Lauffähiges Backend mit **52 automatisierten Prüfungen**; dazu fünf Handprüfungen aus
  Abschnitt 11 des Umsetzungsplans, die auf einem echten Server durchgeführt wurden.
- Die Auslieferung enthält keine Daten und keine Konten: keine Beispielmannschaft, kein
  Demo-Spielplan, kein vorgegebener Zugang. Wer die App aufsetzt, legt alles selbst an.
- **Bewusste Absenz:** keine Marketing-Seite, keine Nutzerzahlen, keine Referenzen, keine
  Kundenstimmen. Künftige Arbeit darf hier nichts erfinden.

## Product Principles

1. **Für den Spieler kein Konto, keine Hürde** — der Weg vom Link zur Rückmeldung ist ein
   Antippen. Konten gibt es nur für die, die verwalten.
2. **Auf einen Blick lesbar** — der Zustand eines Spieltags (vollzählig? Auto da? abgeschlossen?)
   muss sichtbar sein, ohne aufzuklappen.
3. **Trennung ist Bauweise, nicht Sorgfalt** — dass eine Mannschaft die andere nicht sieht, steht
   im Schema und an einem Engpass, nicht in Prüfungen, die man vergessen kann.
4. **Der Server entscheidet nichts, was Menschen entscheiden** — wer aus einem vollen Auto
   aussteigt, klärt der Fahrer, nicht die Software.
5. **Sparsam mit Daten** — was nicht gespeichert wird, kann nicht verlorengehen.
6. **Ehrlich statt hübsch** — lieber eine Zeile Klartext („Nicht gespeichert — nochmal antippen.")
   als eine Animation, die einen Fehler verdeckt.

## Accessibility & Inclusion

- Ab **320 px** Breite bedienbar, Tap-Ziele mindestens **44 px** hoch.
- Sichtbarer Fokusrahmen für Tastaturbedienung.
- `prefers-reduced-motion` wird respektiert — Bewegung ist hier immer Zutat, nie Information.
- Der Zustand darf nie allein über Farbe transportiert werden: Heim/Auswärts steht zusätzlich im
  Text, Rückmeldungen tragen Beschriftungen, ein abgeschlossener Spieltag ist nicht nur blasser,
  sondern auch beschriftet und mit einer Kante versehen.
- (Kein formaler A11y-Standard verbindlich festgelegt; hier stehen die bekannten
  produktspezifischen Bedürfnisse.)
