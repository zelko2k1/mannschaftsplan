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
  const einst = u.einstellungen(e.app)
  const name = u.escape(einst.anzeigename)
  return e.blob(200, 'text/html; charset=utf-8', seiten.einloesen(u.escape(token), name, einst))
})

// ── GET /impressum und /datenschutz ─────────────────────────────────────────────────────────
// Bewusst OHNE Sitzung erreichbar. Ein Impressum, das man erst nach der Anmeldung zu sehen
// bekommt, erfüllt seinen Zweck nicht — und der Datenschutzhinweis muss jemand lesen können,
// BEVOR er auf einen Link tippt und damit eine Sitzung anlegt.
//
// Ist nichts hinterlegt, gibt es die Seite auch nicht: 404 statt einer leeren Seite. Auf sie
// verlinkt dann ohnehin nichts.
//
// Zweimal ausgeschrieben statt in einer Schleife registriert: Jeder Handler läuft in einer
// eigenen, isolierten JS-Laufzeit, in der die Schleifenvariablen nicht existieren. Der Handler
// bräche mit einem ReferenceError ab, und PocketBase meldete nach außen ein nichtssagendes
// „400 Something went wrong" — siehe den Kopf von adminauth.js.
routerAdd('GET', '/impressum', (e) => {
  const u = require(`${__hooks}/utils.js`)
  const seiten = require(`${__hooks}/seiten.js`)

  const einst = u.einstellungen(e.app)
  if (!einst.impressum) return e.json(404, { message: 'Nicht gefunden.' })

  return e.blob(
    200,
    'text/html; charset=utf-8',
    seiten.rechtstext(u.escape(einst.anzeigename), 'Impressum', u.escape(einst.impressum), einst),
  )
})

routerAdd('GET', '/datenschutz', (e) => {
  const u = require(`${__hooks}/utils.js`)
  const seiten = require(`${__hooks}/seiten.js`)

  const einst = u.einstellungen(e.app)
  if (!einst.datenschutz) return e.json(404, { message: 'Nicht gefunden.' })

  return e.blob(
    200,
    'text/html; charset=utf-8',
    seiten.rechtstext(u.escape(einst.anzeigename), 'Datenschutz', u.escape(einst.datenschutz), einst),
  )
})

// ── POST /api/session — Token einlösen ──────────────────────────────────────────────────────
// Die einzige schreibende Route ohne CSRF-Prüfung: sie stellt die Session ja erst her, es kann
// also noch kein Double-Submit-Token geben. Unkritisch, weil ein Angreifer das Token bräuchte —
// und wer es hat, ist ohnehin drin (R14).
routerAdd('POST', '/api/session', (e) => {
  const u = require(`${__hooks}/utils.js`)
  const seiten = require(`${__hooks}/seiten.js`)
  const limit = require(`${__hooks}/ratelimit.js`)

  // R7 · Begrenzt werden FEHLVERSUCHE, nicht Einlösungen — 10 pro Minute und IP.
  //
  // Anfragen zu zählen wäre hier falsch, und zwar nicht nur ein bisschen: eine Mannschaft sitzt
  // im Vereinsheim hinter EINER öffentlichen IP. Verschickt der Kapitän die Links und tippen
  // acht Leute im selben WLAN darauf, wären die letzten ausgesperrt — an ihrem eigenen,
  // gültigen Link. Wer ein gültiges Token hat, rät nicht; gezählt gehört also nur, wer danebentippt.
  const sperre = limit.istGesperrt(e.app, `session:${e.realIP()}`)
  if (sperre.gesperrt) {
    // Auch hier keine Auskunft, die ein gültiges von einem ungültigen Token unterscheidbar
    // machen würde (R6) — nur der Hinweis, dass es zu schnell ging.
    return e.json(429, { message: `Zu viele Versuche. Warte ${sperre.wartenSekunden} Sekunden.` })
  }

  const koerper = e.requestInfo().body || {}
  const token = String(koerper.token || '')

  // R6 · Ab hier führt jeder Fehlschlag zur exakt gleichen Antwort: HTTP 200, generische Seite,
  // kein Cookie. Ob das Token unbekannt ist oder das Mitglied deaktiviert, bleibt ununterscheidbar.
  // Jeder Fehlschlag zählt gegen die Grenze oben.
  const abweisen = () => {
    limit.pruefen(e.app, `session:${e.realIP()}`, 10, 60)
    const einst = u.einstellungen(e.app)
    return e.blob(200, 'text/html; charset=utf-8', seiten.ungueltig(u.escape(einst.anzeigename), einst))
  }

  if (!token) return abweisen()

  let mitglied
  try {
    mitglied = e.app.findFirstRecordByData('members', 'token_hash', u.hash(token))
  } catch {
    return abweisen()
  }
  if (!mitglied || !mitglied.getBool('active')) return abweisen()

  // Treffer: der Zähler dieser IP wird zurückgesetzt. Ein Tippfehler von gestern soll niemanden
  // daran hindern, heute hereinzukommen.
  limit.zuruecksetzen(e.app, `session:${e.realIP()}`)

  u.sessionStarten(e, mitglied)
  // Kein Ziel: der Handelnde IST das Mitglied, sonst stünde derselbe Name zweimal in der
  // Protokollzeile — einmal als Handelnder, einmal als Ziel.
  u.protokollieren(e.app, `member:${mitglied.id}`, 'session.start', '', '', '')

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
