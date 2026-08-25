/// <reference path="../pb_data/types.d.ts" />
// Die beiden HTML-Seiten, die das Backend selbst ausliefert. Alles andere ist die SPA aus
// pb_public. Wie utils.js bewusst ohne `.pb.js`-Endung und innerhalb der Handler geholt.
//
// Warum hier kein Inline-<script> steht: Die CSP aus R9 setzt `default-src 'self'` und deckt
// damit auch script-src ab — ein Inline-Skript würde der Browser verwerfen. Der Auto-Absender
// liegt deshalb als eigene Datei /j.js in pb_public (Quelle: app/public/j.js). Ohne JavaScript
// bleibt der sichtbare Knopf.

const GRUNDGERUEST = (titel, inhalt) => `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${titel}</title>
<meta property="og:title" content="Mannschaftsplan — Termine">
<meta property="og:description" content="Termine und Fahrdienst der Mannschaft.">
<meta property="og:type" content="website">
<style>
  :root { color-scheme: light }
  body {
    margin: 0; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    background: #fbf8f0; color: #17150f;
    font: 16px/1.5 system-ui, sans-serif;
  }
  main { max-width: 26rem; padding: 2rem 1.5rem; text-align: center }
  h1 {
    margin: 0 0 1rem; padding: .5rem 1rem;
    background: #f5b800; border: 2px solid #17150f;
    font-size: 1.4rem; letter-spacing: .04em; text-transform: uppercase;
  }
  p { margin: 0 0 1.5rem; color: #6e6a5e }
  button {
    font: inherit; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    min-height: 44px; padding: .6rem 1.6rem;
    background: #17150f; color: #fbf8f0; border: 2px solid #17150f; border-radius: 0;
    cursor: pointer;
  }
  button:focus-visible { outline: 3px solid #17150f; outline-offset: 3px }
</style>
</head>
<body>
<main>
${inhalt}
</main>
</body>
</html>
`

module.exports = {
  /**
   * Die Seite hinter dem Einladungslink. Sie schlägt das Token NICHT nach und hat keinerlei
   * Nebenwirkung (R10) — sie reicht es nur an POST /api/session weiter. Der WhatsApp-Crawler
   * ruft diese URL beim Erzeugen der Linkvorschau serverseitig ab; würde hier schon eine Session
   * entstehen, wäre R10 verletzt.
   *
   * @param tokenEscaped bereits durch utils.escape() gelaufen
   */
  einloesen(tokenEscaped) {
    return GRUNDGERUEST(
      'Mannschaftsplan — Termine',
      `<h1>Mannschaftsplan</h1>
<p>Einen Moment, du wirst angemeldet.</p>
<form method="POST" action="/api/session">
  <input type="hidden" name="token" value="${tokenEscaped}">
  <button type="submit">Termine öffnen</button>
</form>
<script src="/j.js" defer></script>`,
    )
  },

  /**
   * R6 · Immer dieselbe Antwort, HTTP 200, kein Hinweis auf den Grund. „Gibt es nicht" und
   * „ist inaktiv" dürfen sich nicht unterscheiden lassen.
   */
  ungueltig() {
    return GRUNDGERUEST(
      'Mannschaftsplan — Termine',
      `<h1>Link ungültig</h1>
<p>Dieser Link funktioniert nicht mehr. Frag den Mannschaftsführer nach einem neuen.</p>`,
    )
  },
}
