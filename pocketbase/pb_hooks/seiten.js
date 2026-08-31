/// <reference path="../pb_data/types.d.ts" />
// Die beiden HTML-Seiten, die das Backend selbst ausliefert. Alles andere ist die SPA aus
// pb_public. Wie utils.js bewusst ohne `.pb.js`-Endung und innerhalb der Handler geholt.
//
// Warum hier kein Inline-<script> steht: Die CSP aus R9 setzt `default-src 'self'` und deckt
// damit auch script-src ab — ein Inline-Skript würde der Browser verwerfen. Der Auto-Absender
// liegt deshalb als eigene Datei /j.js in pb_public (Quelle: app/public/j.js). Ohne JavaScript
// bleibt der sichtbare Knopf.

// `name` ist der eingestellte Anzeigename und muss BEREITS ESCAPED hereinkommen — er landet
// sowohl im Text als auch in einem Attributwert. Ein Anführungszeichen darin bräche sonst aus
// `content="…"` aus. Gesetzt wird er nur vom Kapitän; das ändert nichts daran, dass hier escaped
// gehört, was in HTML geschrieben wird.
const GRUNDGERUEST = (name, inhalt, fuss = '') => `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>${name} — Termine</title>
<meta property="og:title" content="${name} — Termine">
<meta property="og:description" content="Termine und Fahrdienst der Mannschaft.">
<meta property="og:type" content="website">
<style>
  /* Dieselbe Schrift wie in der App. Die Dateien liegen unter FESTEN Namen in /schrift — die
     Kopien aus dem Bundle tragen einen Hash im Namen, der sich bei jedem Bau ändert, und eine
     Zeile hier wäre nach dem nächsten Bau des Frontends tot. Quelle: app/public/schrift, von
     dort kopiert Vite sie unverändert.

     (Und keine Backticks in diesem Kommentar: Er steht in einem Template-String, ein einzelner
     würde ihn mitten im HTML beenden.)

     font-display: swap — erst der Systemersatz, dann die richtige Schrift. Diese Seiten haben
     einen einzigen Satz und einen Knopf — sie sollen sofort dastehen und nicht auf einen
     Download warten. Wer sie sieht, hat oft gerade auf einen Link im Messenger getippt und
     hängt am Mobilfunk.

     Nur der Latin-Ausschnitt, drei Dateien, zusammen rund 65 kB. Ein Vereinsname in kyrillischen
     oder griechischen Buchstaben fiele auf die Systemschrift zurück — dafür lädt hier niemand
     das Doppelte. */
  @font-face {
    font-family: 'Barlow'; src: url('/schrift/barlow-400.woff2') format('woff2');
    font-weight: 400; font-style: normal; font-display: swap;
  }
  @font-face {
    font-family: 'Barlow Condensed'; src: url('/schrift/barlow-condensed-600.woff2') format('woff2');
    font-weight: 600; font-style: normal; font-display: swap;
  }
  @font-face {
    font-family: 'Barlow Condensed'; src: url('/schrift/barlow-condensed-700.woff2') format('woff2');
    font-weight: 700; font-style: normal; font-display: swap;
  }

  :root { color-scheme: light }
  body {
    margin: 0; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    background: #fbf8f0; color: #17150f;
    font: 16px/1.5 'Barlow', system-ui, sans-serif;
  }
  main { max-width: 26rem; padding: 2rem 1.5rem; text-align: center }
  /* Wie .leer__titel in der App: derselbe Kasten, dieselbe schmale Schrift, dasselbe Gewicht. */
  h1 {
    margin: 0 0 1rem; padding: .5rem 1rem;
    background: #f5b800; border: 2px solid #17150f;
    font-family: 'Barlow Condensed', system-ui, sans-serif; font-weight: 700;
    font-size: 1.4rem; letter-spacing: .04em; text-transform: uppercase;
  }
  p { margin: 0 0 1.5rem; color: #6e6a5e }
  button {
    font: inherit; font-family: 'Barlow Condensed', system-ui, sans-serif;
    font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    min-height: 44px; padding: .6rem 1.6rem;
    background: #17150f; color: #fbf8f0; border: 2px solid #17150f; border-radius: 0;
    cursor: pointer;
  }
  button:focus-visible { outline: 3px solid #17150f; outline-offset: 3px }
  .rechtstext { text-align: left; white-space: pre-wrap; color: #17150f; margin: 0 0 1.5rem }
  .fuss { margin: 0; font-size: .85rem; color: #6e6a5e }
  .fuss a { color: inherit }
</style>
</head>
<body>
<main>
${inhalt}
${fuss}
</main>
</body>
</html>
`

/**
 * Die Zeile mit Impressum und Datenschutz. Verlinkt wird nur, was auch hinterlegt ist — ein Link
 * auf ein leeres Impressum täuscht Vollständigkeit vor, wo keine ist.
 */
const FUSS = (einst) => {
  const teile = []
  if (einst.impressum) teile.push('<a href="/impressum">Impressum</a>')
  if (einst.datenschutz) teile.push('<a href="/datenschutz">Datenschutz</a>')
  return teile.length ? `<p class="fuss">${teile.join(' · ')}</p>` : ''
}

module.exports = {
  FUSS,

  /**
   * Die Seite hinter dem Einladungslink. Sie schlägt das Token NICHT nach und hat keinerlei
   * Nebenwirkung (R10) — sie reicht es nur an POST /api/session weiter. Der WhatsApp-Crawler
   * ruft diese URL beim Erzeugen der Linkvorschau serverseitig ab; würde hier schon eine Session
   * entstehen, wäre R10 verletzt.
   *
   * @param tokenEscaped bereits durch utils.escape() gelaufen
   * @param nameEscaped  eingestellter Anzeigename, ebenfalls bereits escaped
   * @param einst        die Einstellungen, für die Fußzeile
   */
  einloesen(tokenEscaped, nameEscaped, einst) {
    return GRUNDGERUEST(
      nameEscaped,
      `<h1>${nameEscaped}</h1>
<p>Einen Moment, du wirst angemeldet.</p>
<form method="POST" action="/api/session">
  <input type="hidden" name="token" value="${tokenEscaped}">
  <button type="submit">Termine öffnen</button>
</form>
<script src="/j.js" defer></script>`,
      FUSS(einst || {}),
    )
  },

  /**
   * R6 · Immer dieselbe Antwort, HTTP 200, kein Hinweis auf den Grund. „Gibt es nicht" und
   * „ist inaktiv" dürfen sich nicht unterscheiden lassen.
   */
  ungueltig(nameEscaped, einst) {
    return GRUNDGERUEST(
      nameEscaped,
      `<h1>Link ungültig</h1>
<p>Dieser Link funktioniert nicht mehr. Frag den Kapitän nach einem neuen.</p>`,
      FUSS(einst || {}),
    )
  },

  /**
   * Impressum bzw. Datenschutzhinweis. Freitext des Betreibers, escaped ausgegeben und über
   * `white-space: pre-wrap` mit seinen Absätzen dargestellt — kein HTML, keine Auszeichnung.
   *
   * @param textEscaped bereits durch utils.escape() gelaufen
   */
  rechtstext(nameEscaped, ueberschrift, textEscaped, einst) {
    return GRUNDGERUEST(
      nameEscaped,
      `<h1>${ueberschrift}</h1>
<p class="rechtstext">${textEscaped}</p>`,
      FUSS(einst || {}),
    )
  },
}
