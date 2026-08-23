/// <reference path="../pb_data/types.d.ts" />
// R9 · Sicherheitskopfzeilen — hier statt nur im Reverse Proxy.
//
// Caddy setzt dieselben Kopfzeilen (deploy/Caddyfile). Doppelt, weil die App auch ohne Proxy
// betrieben werden kann: im Entwicklungsbetrieb, beim Ausprobieren im LAN, und falls jemand das
// Image mal ohne Caddy startet. Eine Sicherheitsmaßnahme, die nur greift wenn die Umgebung
// mitspielt, ist keine.
//
// Setzt Caddy dieselbe Kopfzeile noch einmal, gewinnt Caddy — die Werte sind identisch.

routerUse((e) => {
  const kopf = e.response.header()

  // Diese Anwendung gehört in keinen Suchindex. robots.txt (pb_public) sagt dasselbe noch
  // einmal für Crawler, die Kopfzeilen ignorieren.
  kopf.set('X-Robots-Tag', 'noindex, nofollow')

  // Beim Klick auf einen fremden Link darf die eigene URL nicht mitwandern — sie enthält bei
  // /j/<token> das Einladungstoken.
  kopf.set('Referrer-Policy', 'no-referrer')

  // 'unsafe-inline' nur für Styles: React setzt Styles inline. Skripte bleiben auf 'self'
  // beschränkt — deshalb liegt der Auto-Absender der Einladungsseite als eigene Datei /j.js
  // in pb_public und nicht als <script> im HTML.
  kopf.set(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
      "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  )

  kopf.set('X-Content-Type-Options', 'nosniff')

  // Strict-Transport-Security wird BEWUSST nicht hier gesetzt, sondern nur in der
  // Hetzner-Caddy-Konfiguration. Im Homelab und lokal würde HSTS den Browser für ein Jahr auf
  // HTTPS für diesen Namen festnageln — auch wenn dort später etwas anderes läuft.

  e.next()
})
