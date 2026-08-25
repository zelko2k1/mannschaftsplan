# Product

<!-- impeccable:product-schema 1 -->

Abgeleitet aus `docs/umsetzungsplan.md` — dort steht die verbindliche Vorgabe. Wo sich beide
widersprechen, gilt der Umsetzungsplan.

## Platform

web

## Users

**Eine** Dartmannschaft, 8–10 Personen. Zwei Rollen, sonst nichts:

- **Mitglied** — meldet sich für Spieltage zurück (dabei / unsicher / kann nicht) und trägt sich
  in den Fahrdienst ein. Hat **kein Konto und kein Passwort**: es kommt über einen persönlichen
  Token-Link herein, den der Kapitän einmal per Einzelchat verschickt.
- **Kapitän / Mannschaftsführer** — pflegt Spieltage und Mitglieder, korrigiert Rückmeldungen,
  stellt Token neu aus, liest das Protokoll. Meldet sich mit Passwort an.

Einsatzsituation: das Handy in der Kneipe oder auf dem Sofa, ein paar Tage vor dem Spieltag.
Kurzer Blick, ein bis zwei Antippen, wieder weg. Niemand sitzt „in der App".

## Product Purpose

Die Frage „Wer kommt mit, und wer fährt?" aus dem WhatsApp-Gruppenchat herausholen, wo sie
zwischen 40 Nachrichten verlorengeht. Erfolg heißt: Der Kapitän sieht auf einen Blick, ob die
Mannschaft vollzählig ist und ob genug Autos da sind — ohne selbst nachzuzählen und ohne jemanden
einzeln anzuschreiben.

## Positioning

Der Unterschied zu jeder Umfrage-App: **kein Konto, keine Anmeldung, keine Installation.** Link
antippen, drei Knöpfe, fertig. Der Preis dafür steht offen im Plan (R14): wer den Link eines
Mitglieds weitergibt, ist dieses Mitglied. Für eine Mannschaft, die sich seit Jahren kennt, ist
das der richtige Tausch.

**Nicht zu verwechseln** mit DartsZentrale — der großen Vereins-App mit Darts-Counter,
Ligabetrieb und Statistik. Dieses Produkt kennt weder Ergebnisse noch Averages und will sie auch
nicht kennen.

## Operating Context

- **Handy zuerst.** Ab 320 px Breite bedienbar; Tastatur- und Desktopbedienung müssen möglich
  sein, sind aber nicht der Regelfall.
- **Der Einstieg ist ein Link aus WhatsApp** — der Messenger ruft ihn zur Vorschau serverseitig
  ab, bevor ein Mensch ihn antippt.
- **Selbst gehostet:** PocketBase als ein Binary hinter Caddy; lokal ohne Docker entwickelt, im
  Homelab unter HTTPS getestet, später auf einem eigenen Server.
- **Deutsch, Du-Form.** Keine Mehrsprachigkeit vorgesehen.

## Capabilities and Constraints

- Spielplan mit Heim/Auswärts, Gegner, Ort, Anwurf, Entfernung.
- **Berechnete Abfahrtszeit** für Auswärtsspiele — im Backend gerechnet, damit alle dieselbe Zeit
  sehen.
- Rückmeldung pro Spieler und Spieltag: dabei / unsicher / kann nicht.
- Fahrdienst: wer fährt mit wie vielen Plätzen, und wer sitzt in welchem Auto.
- Kapitänsansicht: Spieltage und Mitglieder pflegen, Token neu ausstellen, Protokoll.
- **Bewusst nicht:** WhatsApp-Anbindung, Ergebnisse, Statistiken, Averages, Push-Nachrichten.
- **Constraint:** keine externen CDNs, keine Tracker, keine Analytics; Schriften selbst gehostet.
  Gespeichert werden Name, Verfügbarkeit, Fahrbereitschaft — sonst nichts. Keine Telefonnummern,
  Adressen, Geburtsdaten oder E-Mail-Adressen der Spieler.

## Brand Commitments

- **Optik: Abfahrtsplan.** Fahrplanaushang, nicht App-Look. Die Papierfarbe codiert Heim (weiß)
  und Auswärts (gelb) und ist die Hauptorientierung beim Scrollen — sie darf nicht durch weitere
  Farbflächen verwässert werden.
- **0 px Ecken, keine Schatten, keine Verläufe.** Linien in Tinte: 2 px zwischen Zeilen,
  1,5 px gestrichelt innerhalb einer Zeile.
- Farben und Schriften sind in Abschnitt 6.2 des Umsetzungsplans festgelegt und nicht Gegenstand
  weiterer Gestaltung.
- **Sprache:** kurze Sätze, Du-Form. Knöpfe benennen die Handlung („Dabei", nicht „Absenden").
- (Kein Logo, keine erfundenen Claims oder Referenzen.)

## Evidence on Hand

- Lauffähiges Backend mit 22 automatisierten Prüfungen aus Abschnitt 11 des Umsetzungsplans.
- Die Auslieferung enthält keine Daten und keine Konten: keine Beispielmannschaft, kein
  Demo-Spielplan, kein vorgegebener Zugang. Wer die App aufsetzt, legt alles selbst an.
- **Bewusste Absenz:** keine Marketing-Seite, keine Nutzerzahlen, keine Referenzen. Das Produkt
  hat genau eine Mannschaft als Zielgruppe — künftige Arbeit darf hier nichts erfinden.

## Product Principles

1. **Kein Konto, keine Hürde** — der Weg vom Link zur Rückmeldung ist ein Antippen.
2. **Auf einen Blick lesbar** — der Zustand eines Spieltags (vollzählig? Auto da?) muss sichtbar
   sein, ohne aufzuklappen.
3. **Der Server entscheidet nichts, was Menschen entscheiden** — wer aus einem vollen Auto
   aussteigt, klärt der Fahrer, nicht die Software.
4. **Sparsam mit Daten** — was nicht gespeichert wird, kann nicht verlorengehen.
5. **Ehrlich statt hübsch** — lieber eine Zeile Klartext („Nicht gespeichert — nochmal antippen.")
   als eine Animation, die einen Fehler verdeckt.

## Accessibility & Inclusion

- Ab **320 px** Breite bedienbar, Tap-Ziele mindestens **44 px** hoch.
- Sichtbarer Fokusrahmen für Tastaturbedienung.
- `prefers-reduced-motion` wird respektiert — Bewegung ist hier immer Zutat, nie Information.
- Der Zustand darf nie allein über Farbe transportiert werden: Heim/Auswärts steht zusätzlich im
  Text, Rückmeldungen tragen Beschriftungen.
- (Kein formaler A11y-Standard verbindlich festgelegt; hier stehen die bekannten
  produktspezifischen Bedürfnisse.)
