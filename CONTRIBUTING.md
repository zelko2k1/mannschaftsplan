# Mitmachen bei Mannschaftsplan

Schön, dass du helfen willst! Mannschaftsplan wird von einem Vereins-Admin (kein
ausgebildeter Entwickler) mit KI-Unterstützung gepflegt — **Hinweise, Fehlermeldungen,
Doku-Verbesserungen und Code-Reviews sind darum ausdrücklich willkommen** und genauso
wertvoll wie Code.

Bitte hab etwas Geduld: Das Projekt wird nebenbei von einer Einzelperson betreut.

## Was das hier ist — und was nicht

Mannschaftsplan ist eine kleine App für **eine** Dartmannschaft: Spielplan, Zu- und
Absage, Fahrdienst. Kein Counter, keine Ergebnisse, keine Statistik — das ist
[DartsZentrale](https://github.com/zelko2k1/dartszentrale). Vorschläge, die aus dieser
App eine Vereinsverwaltung machen würden, passen deshalb eher dorthin.

Die verbindliche Vorgabe steht in [`docs/umsetzungsplan.md`](docs/umsetzungsplan.md):
Datenmodell, die Sicherheitsregeln **R1–R14** und die Testfälle **T1–T13**. Wer Code
ändert, sieht bitte vorher dort nach; findet sich etwas als undurchführbar heraus, wird
das Dokument mitgepflegt statt umgangen.

## Du musst nicht programmieren können

Auch ohne eine Zeile Code hilfst du weiter:

- **Fehler melden** — etwas funktioniert nicht wie erwartet? → [Neues Issue](../../issues/new/choose)
- **Idee oder Wunsch** — dir fehlt etwas im Mannschaftsalltag? → ebenfalls über [Issues](../../issues/new/choose)
- **Doku verbessern** — Anleitung unklar oder veraltet? Kleine Korrekturen gehen direkt als Pull Request.
- **Im echten Betrieb testen** und berichten, was am Spieltag hakt.

> **Sicherheitslücken bitte nicht über öffentliche Issues melden**, sondern vertraulich —
> siehe [SECURITY.md](SECURITY.md). Das ist hier besonders wichtig: Der Zugang der
> Mitglieder ist ein Link ohne Passwort.

## Fehler melden — was hilft mir

Damit ich ein Problem nachstellen kann:

- **Wer warst du** — Mitglied (Token-Link) oder Kapitän (`/admin`)?
- **Wo lief es** — lokal, im Homelab hinter dem Reverse Proxy, oder auf einem eigenen Server?
- **Was passiert**, was hättest du **erwartet**, und die **Schritte** dorthin
- Wenn möglich ein Screenshot — aber **keine echten Namen und keinen Einladungslink**
  mitschicken. Ein Link im Screenshot ist ein gültiger Zugang.

## Code beisteuern

```bash
./scripts/dev-pb.sh                    # PocketBase auf 127.0.0.1:8090
cd app && npm install && npm run dev   # Vite auf localhost:5173
```

Danach **`http://localhost:5173`** öffnen — nicht die LAN-IP; das Session-Cookie ist
`Secure` (R2) und wird über nacktes HTTP nur auf `localhost` gesetzt. Testdaten und
Einladungslinks kommen aus `pocketbase/seed.mjs`, Einzelheiten stehen im
[README](README.md).

Vor einem Pull Request:

```bash
cd app && npm run lint && npm test && npm run build
node scripts/api-tests.mjs             # gegen ein laufendes PocketBase
```

Dieselben Prüfungen laufen in der CI, zusätzlich gegen das gebaute Container-Image.

- **Feature-Branch und Pull Request**, nicht direkt auf `main`.
- **Ein Thema pro PR.** Lieber zwei kleine als einer, der alles anfasst.
- **Commit-Nachrichten sagen, warum.** Der Zeitzonen-Fehler in `d2b4963` ist das Muster:
  was war falsch, was hat es im Betrieb bedeutet, was ist jetzt anders.
- **`CHANGELOG.md` pflegen**, wenn sich für die Mannschaft etwas ändert. Die CI besteht
  darauf, sobald ausgelieferter Code betroffen ist — für reine Doku- oder Testarbeit
  genügt das Label `no-changelog`.
- **Sprache: Deutsch**, in Code-Kommentaren wie in der Oberfläche. Bezeichner sind
  deutsch, wo sie fachlich sind (`spieltag`, `abfahrt`), englisch, wo sie technisch sind.

## Was ich wahrscheinlich ablehne

- Externe CDNs, Tracker, Analytics — die App lädt nichts von fremden Servern.
- Ein zweiter Container oder ein veröffentlichter Host-Port; das Deployment ist bewusst
  **ein** Image hinter dem vorhandenen Reverse Proxy.
- Änderungen, die eine der Regeln R1–R14 aufweichen, ohne dass der Umsetzungsplan
  mitgeändert wird.
