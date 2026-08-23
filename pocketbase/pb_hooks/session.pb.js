/// <reference path="../pb_data/types.d.ts" />
// Token einlösen und Sessions verwalten — Abschnitt 5 des Umsetzungsplans, Mitgliederteil.
//
// Der Ablauf ist bewusst zweigeteilt:
//   GET  /j/:token    liefert nur ein Formular. Keine Datenbankschreibung, kein Cookie (R10).
//   POST /api/session löst das Token ein und legt die Session an.
//
// Grund: WhatsApp ruft die Link-URL beim Erzeugen der Vorschau serverseitig ab. Entstünde dabei
// schon eine Session, hätte der GET eine fachliche Nebenwirkung — genau das verbietet R10.
// Der Crawler führt kein JavaScript aus und schickt das Formular deshalb nie ab.

// ── GET /j/:token — Einladungsseite, ohne jede Nebenwirkung ─────────────────────────────────
routerAdd('GET', '/j/{token}', (e) => {
  const u = require(`${__hooks}/utils.js`)
  const seiten = require(`${__hooks}/seiten.js`)

  // R6 · Das Token wird hier NICHT nachgeschlagen. Die Antwort ist für jede Zeichenkette
  // identisch, es gibt also nichts, woran man ein gültiges Token erkennen könnte.
  const token = e.request.pathValue('token')
  return e.blob(200, 'text/html; charset=utf-8', seiten.einloesen(u.escape(token)))
})

// ── POST /api/session — Token einlösen ──────────────────────────────────────────────────────
// Die einzige schreibende Route ohne CSRF-Prüfung: sie stellt die Session ja erst her, es kann
// also noch kein Double-Submit-Token geben. Unkritisch, weil ein Angreifer das Token bräuchte —
// und wer es hat, ist ohnehin drin (R14).
routerAdd('POST', '/api/session', (e) => {
  const u = require(`${__hooks}/utils.js`)
  const seiten = require(`${__hooks}/seiten.js`)

  const koerper = e.requestInfo().body || {}
  const token = String(koerper.token || '')

  // R6 · Ab hier führt jeder Fehlschlag zur exakt gleichen Antwort: HTTP 200, generische Seite,
  // kein Cookie. Ob das Token unbekannt ist oder das Mitglied deaktiviert, bleibt ununterscheidbar.
  const abweisen = () => e.blob(200, 'text/html; charset=utf-8', seiten.ungueltig())

  if (!token) return abweisen()

  let mitglied
  try {
    mitglied = e.app.findFirstRecordByData('members', 'token_hash', u.hash(token))
  } catch {
    return abweisen()
  }
  if (!mitglied || !mitglied.getBool('active')) return abweisen()

  u.sessionStarten(e, mitglied)
  u.protokollieren(e.app, `member:${mitglied.id}`, 'session.start', mitglied.id, '', '')

  // 302 nach GET / — der Browser wechselt dabei auf GET, das Token verschwindet aus der Adresszeile.
  return e.redirect(302, '/')
})

// ── GET /api/me ─────────────────────────────────────────────────────────────────────────────
routerAdd('GET', '/api/me', (e) => {
  const u = require(`${__hooks}/utils.js`)
  const sitzung = u.mitgliedAusSession(e)
  if (!sitzung) return e.json(401, { message: 'Keine gültige Sitzung.' })

  return e.json(200, {
    id: sitzung.mitglied.id,
    name: sitzung.mitglied.getString('name'),
    // Kapitänsrechte gibt es in der Mitglieder-App nicht — der Kapitän arbeitet unter /admin
    // mit einem eigenen Router und eigenem Cookie (R5).
    captain: false,
  })
})

// ── POST /api/logout ────────────────────────────────────────────────────────────────────────
routerAdd('POST', '/api/logout', (e) => {
  const u = require(`${__hooks}/utils.js`)

  // Bewusst ohne CSRF-Prüfung: das Schlimmste, was ein erzwungener Logout anrichtet, ist ein
  // erneuter Klick auf den Einladungslink. Eine Prüfung würde nur dazu führen, dass man sich in
  // einem kaputten Zustand nicht mehr abmelden kann.
  const sitzung = u.mitgliedAusSession(e)
  if (sitzung) {
    try {
      e.app.delete(sitzung.session)
    } catch {
      /* schon weg */
    }
  }
  u.cookiesLoeschen(e)
  return e.json(200, { ok: true })
})
