# Sicherheit

Danke, dass du hilfst, Mannschaftsplan sicher zu halten. Die App verwaltet
**personenbezogene Daten (DSGVO)** — Namen, Zu- und Absagen, wer wen mitnimmt — und
wird von Mannschaften ohne IT-Abteilung selbst betrieben. Sicherheitshinweise sind
darum besonders wertvoll.

> **Ehrlich vorweg:** Mannschaftsplan wird von einem Vereins-Admin (kein ausgebildeter
> Entwickler) mit KI-Unterstützung gepflegt. Support und Reaktionszeit sind begrenzt,
> aber Sicherheitsmeldungen nehme ich ernst und bearbeite sie nach bestem Wissen.

## Der wunde Punkt: der Link ist der Zugang

Mitglieder melden sich nicht an — sie öffnen einen persönlichen Link. Wer den Link hat,
ist das Mitglied. Daraus folgt für alle Beteiligten:

- **Einladungslinks nicht weitergeben**, nicht in Gruppenchats posten, nicht auf
  Screenshots zeigen. Ein Link im Screenshot ist ein gültiger Zugang.
- **Verloren oder verteilt?** Der Kapitän stellt in der Kapitänsansicht ein neues Token
  aus (oder `node pocketbase/rotate-token.mjs "<Name>"`). Das macht den alten Link
  sofort tot und meldet alle Geräte des Mitglieds ab.
- In der Datenbank steht **nur `sha256(token)`** (R1). Wer eine Sicherung erbeutet,
  bekommt daraus keine funktionierenden Links.

Was das Modell ausdrücklich **nicht** leistet, steht in Abschnitt 4 (R14) des
[Umsetzungsplans](docs/umsetzungsplan.md) — zusammen mit allen Regeln R1–R14, gegen die
sich ein Fund prüfen lässt.

## Unterstützte Versionen

Sicherheitsfixes gibt es für den **jeweils neuesten Stand von `main`** bzw. die neueste
veröffentlichte Version (siehe [Releases](../../releases)). Ältere Stände werden nicht
rückwirkend gepatcht — bitte vor einer Meldung aktualisieren.

## Eine Schwachstelle melden

**Bitte melde Sicherheitslücken nicht über öffentliche Issues** — so bleibt anderen
Betreibern Zeit zum Aktualisieren, bevor Details öffentlich werden.

Nutze stattdessen GitHubs **private Sicherheitsmeldung**:

1. Reiter **„Security"** dieses Repos öffnen
2. **„Report a vulnerability"** wählen und das Formular ausfüllen

Ist der Knopf nicht sichtbar, öffne ersatzweise ein **minimales** öffentliches Issue mit
dem Betreff „Sicherheit – bitte privaten Kanal" **ohne technische Details**; ich melde
mich dann mit einem privaten Weg.

Hilfreich in der Meldung: betroffene Stelle (Datei, Route, Regel R…), was sich damit
erreichen lässt, und die Schritte dorthin. **Bitte keine echten Mitgliederdaten und
keine gültigen Einladungslinks** mitschicken — ein selbst angelegtes Testmitglied genügt.

## Was du als Betreiber selbst tun kannst

- **HTTPS ist Pflicht**, nicht Kür: Ohne es setzt der Browser das `Secure`-Cookie nicht,
  und die Anmeldung funktioniert schlicht nicht.
- **Vor `/admin` gehört ein Tor, das nicht das Kapitäns-Passwort ist** (R13b): eine
  IP-Allowlist im Reverse Proxy oder eine vorgeschaltete Proxy-Anmeldung. Eines von beiden
  genügt, keines ist zu wenig — ein Fehler im Admin-Code soll von außen nicht ansprechbar
  sein. Vorlagen liegen in [`deploy/`](deploy/).
- **`/_/` niemals öffentlich erreichbar machen** (R13a). Das PocketBase-Dashboard sieht die
  ganze Datenbank und wird im Betrieb nie gebraucht; für Einrichtung und Restore genügt ein
  SSH-Tunnel.
- **Sicherungen verschlüsseln und woanders ablegen** — `scripts/backup.sh` nimmt dafür
  einen GPG-Empfänger; ohne ihn liegt die Datei im Klartext.
- **Ausgeschiedene Mitglieder deaktivieren** statt den Link verfallen zu lassen; das
  wirft sie sofort von allen Geräten.
