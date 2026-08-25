/// <reference path="../pb_data/types.d.ts" />
// Kapitänsansicht — Abschnitt 5, Admin-Teil.
//
// R5 · GETRENNTE ROUTER. Diese Routen teilen sich mit dem Mitgliederteil keine einzige Zeile
// Prüflogik: eigener Cookie-Name (dz_admin statt dz_sid), eigene Sitzungstabelle
// (admin_sessions), eigene Vorprüfung, eigener Pfad. Kein gemeinsamer Handler mit
// `if (isAdmin)` — genau dort entstehen die Fehler, bei denen ein Mitglied versehentlich
// Adminrechte bekommt.
//
// R13 · Angemeldet wird gegen PocketBases eigene `_superusers`-Collection. Kein selbstgebautes
// Passwort-Handling, kein eigener Hash, kein eigener Vergleich. Vor diesen Code gehört zusätzlich
// ein Tor in der Reverse-Proxy-Konfiguration (R13b, deploy/Caddyfile): IP-Allowlist oder eine
// vorgeschaltete Proxy-Anmeldung. Das ist die wirksamste Einzelmaßnahme, weil ein Fehler hier
// dann von außen gar nicht erst ansprechbar ist.
//
// ACHTUNG: `validatePassword()` weiter unten prüft das Passwort direkt und geht an PocketBases
// MFA vorbei. Ein am Superuser eingeschalteter zweiter Faktor schützt `/_/`, aber NICHT diesen
// Login. Nachzurüsten in Schritt 9; bis dahin ist das Tor aus R13b die Stelle, die das deckt.
//
// Alle Hilfen kommen aus adminauth.js und werden INNERHALB der Handler geholt. Funktionen im
// Modul-Scope stehen den Handlern nicht zur Verfügung — sie laufen in isolierten Laufzeiten.

// ── POST /admin/api/login ───────────────────────────────────────────────────────────────────
routerAdd('POST', '/admin/api/login', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const limit = require(`${__hooks}/ratelimit.js`)

  // R7 · 5 Versuche pro Minute und IP, danach 15 Minuten Sperre.
  const takt = limit.pruefen(e.app, `login:${e.realIP()}`, 5, 60, 900)
  if (!takt.ok) {
    return e.json(429, { message: `Zu viele Versuche. Warte ${takt.wartenSekunden} Sekunden.` })
  }

  const koerper = e.requestInfo().body || {}
  const email = String(koerper.email || '')
  const passwort = String(koerper.password || '')

  let superuser = null
  try {
    superuser = e.app.findAuthRecordByEmail('_superusers', email)
  } catch {
    superuser = null
  }

  // R6 · Falsche Adresse und falsches Passwort liefern dieselbe Antwort — kein Hinweis darauf,
  // welche Adressen es gibt.
  //
  // Ehrlich gesagt: die ANTWORTZEIT unterscheidet sich trotzdem. Bei einer bekannten Adresse
  // läuft eine bcrypt-Prüfung, bei einer unbekannten nicht. Diese Lücke lässt sich ohne einen
  // künstlichen Vergleich mit exakt denselben Kosten nicht schließen. Was sie zumacht, ist die
  // Sperre oben: nach fünf Versuchen ist eine Viertelstunde Ruhe, also höchstens fünf prüfbare
  // Adressen pro Viertelstunde — allerdings pro IP und nur im Arbeitsspeicher. Zusammen mit dem
  // vorgeschalteten Tor aus R13b ist das der Punkt, an dem sich weiterer Aufwand nicht mehr
  // lohnt; ohne dieses Tor wäre es das nicht.
  if (!superuser || !superuser.validatePassword(passwort)) {
    return e.json(401, { message: 'Anmeldung fehlgeschlagen.' })
  }

  limit.zuruecksetzen(e.app, `login:${e.realIP()}`)

  // Eigene Sitzung, eigener Cookie-Name, eigener Pfad. Der PocketBase-Token landet NICHT im
  // Browser — weder im Cookie noch in localStorage (R13).
  const sid = $security.randomStringWithAlphabet(43, a.B64URL)
  const satz = new Record(e.app.findCollectionByNameOrId('admin_sessions'))
  satz.set('sid_hash', $security.sha256(sid))
  satz.set('email', email)
  satz.set('last_seen', new DateTime())
  e.app.save(satz)

  e.setCookie(
    new Cookie({
      name: a.ADMIN_COOKIE,
      // Path=/admin: dieser Cookie wird bei Mitglieder-Anfragen gar nicht erst mitgeschickt.
      value: sid,
      path: '/admin',
      maxAge: a.ADMIN_DAUER,
      secure: true,
      httpOnly: true,
      sameSite: 2, // Lax
    }),
  )
  // R11 · Muss lesbar sein, damit der Client den Wert als Kopfzeile zurückschicken kann.
  e.setCookie(
    new Cookie({
      name: a.ADMIN_CSRF_COOKIE,
      value: $security.randomStringWithAlphabet(43, a.B64URL),
      path: '/admin',
      maxAge: a.ADMIN_DAUER,
      secure: true,
      httpOnly: false,
      sameSite: 2,
    }),
  )

  u.protokollieren(e.app, `admin:${email}`, 'admin.login', '', '', '')
  return e.json(200, { ok: true, email })
})

// ── POST /admin/api/logout ──────────────────────────────────────────────────────────────────
routerAdd('POST', '/admin/api/logout', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const satz = a.sitzung(e)
  if (satz) {
    try {
      e.app.delete(satz)
    } catch {
      /* schon weg */
    }
  }
  for (const name of [a.ADMIN_COOKIE, a.ADMIN_CSRF_COOKIE]) {
    e.setCookie(new Cookie({ name, value: '', path: '/admin', maxAge: -1, secure: true, sameSite: 2 }))
  }
  return e.json(200, { ok: true })
})

// ── GET /admin/api/me ───────────────────────────────────────────────────────────────────────
routerAdd('GET', '/admin/api/me', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const satz = a.sitzung(e)
  if (!satz) return e.json(404, { message: 'Nicht gefunden.' })
  return e.json(200, { email: satz.getString('email') })
})

// ── Spieltage ───────────────────────────────────────────────────────────────────────────────
routerAdd('GET', '/admin/api/fixtures', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  const alle = e.app.findRecordsByFilter('fixtures', "id != ''", 'date', 500, 0)
  return e.json(200, {
    items: alle.map((s) => ({
      id: s.id,
      date: s.getDateTime('date').string(),
      opponent_club: s.getString('opponent_club'),
      opponent_town: s.getString('opponent_town'),
      is_home: s.getBool('is_home'),
      venue: s.getString('venue'),
      km: s.getInt('km'),
      meeting_point: s.getString('meeting_point'),
      needed_players: s.getInt('needed_players'),
      locked: s.getBool('locked'),
    })),
  })
})

routerAdd('POST', '/admin/api/fixtures', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  const koerper = e.requestInfo().body || {}
  if (!String(koerper.opponent_town || '').trim() || !String(koerper.date || '').trim()) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const satz = new Record(e.app.findCollectionByNameOrId('fixtures'))
  // PocketBase kennt keine Defaultwerte — was Abschnitt 3 als „default" führt, muss hier stehen.
  satz.set('needed_players', 4)
  satz.set('km', 0)
  satz.set('locked', false)
  const fehler = a.spieltagUebernehmen(satz, koerper)
  if (fehler) return e.json(400, { message: fehler })

  e.app.save(satz)
  a.protokoll(e, 'fixture.create', satz.id, '', satz.getString('opponent_town'))
  return e.json(200, { id: satz.id })
})

routerAdd('PATCH', '/admin/api/fixtures/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  let satz
  try {
    satz = e.app.findRecordById('fixtures', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  const fehler = a.spieltagUebernehmen(satz, e.requestInfo().body || {})
  if (fehler) return e.json(400, { message: fehler })

  e.app.save(satz)
  a.protokoll(e, 'fixture.update', satz.id, '', satz.getString('opponent_town'))
  return e.json(200, { ok: true })
})

routerAdd('DELETE', '/admin/api/fixtures/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  let satz
  try {
    satz = e.app.findRecordById('fixtures', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  const wohin = satz.getString('opponent_town')
  // Rückmeldungen, Fahrten und Mitfahrer verschwinden über cascadeDelete mit.
  e.app.delete(satz)
  a.protokoll(e, 'fixture.delete', e.request.pathValue('id'), wohin, '')
  return e.json(200, { ok: true })
})

// ── Mitglieder ──────────────────────────────────────────────────────────────────────────────
routerAdd('GET', '/admin/api/members', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  const alle = e.app.findRecordsByFilter('members', "id != ''", 'sort,name', 200, 0)
  return e.json(200, {
    items: alle.map((m) => {
      const sitzungen = e.app.findRecordsByFilter('sessions', 'member = {:m}', '', 50, 0, { m: m.id })
      return {
        id: m.id,
        name: m.getString('name'),
        active: m.getBool('active'),
        sort: m.getInt('sort'),
        note: m.getString('note'),
        // R1 · Der Hash verlässt den Server nicht. Nur die Aussage, OB ein Token ausgestellt
        // wurde, und wann.
        hat_token: m.getString('token_hash') !== '',
        token_issued_at: m.get('token_issued_at') ? m.getDateTime('token_issued_at').string() : '',
        geraete: sitzungen.length,
      }
    }),
  })
})

routerAdd('POST', '/admin/api/members', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  const koerper = e.requestInfo().body || {}
  const name = String(koerper.name || '').trim()
  if (!name) return e.json(400, { message: 'Ungültige Angabe.' })

  const satz = new Record(e.app.findCollectionByNameOrId('members'))
  satz.set('name', name)
  // Ohne dieses Feld wäre das neue Mitglied sofort inaktiv und käme nicht herein — PocketBase
  // kennt keine Defaultwerte.
  satz.set('active', true)
  satz.set('sort', Number(koerper.sort) || 0)
  satz.set('note', String(koerper.note || ''))
  satz.set('token_hash', '')
  e.app.save(satz)

  a.protokoll(e, 'member.create', satz.id, '', name)
  return e.json(200, { id: satz.id })
})

routerAdd('PATCH', '/admin/api/members/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  let satz
  try {
    satz = e.app.findRecordById('members', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  const koerper = e.requestInfo().body || {}
  const vorher = satz.getBool('active')

  if ('name' in koerper) {
    const name = String(koerper.name || '').trim()
    if (!name) return e.json(400, { message: 'Ungültige Angabe.' })
    satz.set('name', name)
  }
  if ('active' in koerper) satz.set('active', !!koerper.active)
  if ('sort' in koerper) satz.set('sort', Number(koerper.sort) || 0)
  if ('note' in koerper) satz.set('note', String(koerper.note || ''))
  e.app.save(satz)

  // Wer deaktiviert wird, fliegt sofort von allen Geräten. Ohne das bliebe die Sitzung bestehen
  // und der Zugang faktisch offen — die Prüfung in mitgliedAusSession fängt es zwar ab, aber
  // die Sitzung soll gar nicht erst liegen bleiben.
  if (vorher && !satz.getBool('active')) {
    for (const s of e.app.findRecordsByFilter('sessions', 'member = {:m}', '', 100, 0, { m: satz.id })) {
      try {
        e.app.delete(s)
      } catch {
        /* schon weg */
      }
    }
  }

  a.protokoll(e, 'member.update', satz.id, String(vorher), String(satz.getBool('active')))
  return e.json(200, { ok: true })
})

// ── R12 · Neues Token ───────────────────────────────────────────────────────────────────────
routerAdd('POST', '/admin/api/members/{id}/rotate-token', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  let satz
  try {
    satz = e.app.findRecordById('members', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  // 1. Neuer Hash — der alte ist damit weg, jeder verteilte Link läuft ins Leere.
  const klartext = u.neuesToken()
  satz.set('token_hash', u.hash(klartext))
  satz.set('token_issued_at', new DateTime())
  e.app.save(satz)

  // 2. Alle Geräte ausloggen. Ohne diesen Schritt bliebe ein angemeldetes Handy drin, obwohl
  //    der Link tot ist — genau der Fall, den T4 prüft.
  let beendet = 0
  for (const s of e.app.findRecordsByFilter('sessions', 'member = {:m}', '', 100, 0, { m: satz.id })) {
    try {
      e.app.delete(s)
      beendet += 1
    } catch {
      /* schon weg */
    }
  }

  // 3. Protokoll.
  a.protokoll(e, 'token.rotate', satz.id, '', `${beendet} Sitzungen beendet`)

  // R1 · Das einzige Mal, dass der Klartext den Server verlässt.
  return e.json(200, { token: klartext, sitzungen_beendet: beendet })
})

// ── Korrektur einer Rückmeldung durch den Kapitän ───────────────────────────────────────────
routerAdd('PUT', '/admin/api/response/{fixtureId}/{memberId}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  const spieltagId = e.request.pathValue('fixtureId')
  const mitgliedId = e.request.pathValue('memberId')
  const koerper = e.requestInfo().body || {}
  const status =
    koerper.status === null || koerper.status === undefined ? null : String(koerper.status)
  if (status !== null && ['yes', 'maybe', 'no'].indexOf(status) === -1) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  // Anders als beim Mitglied darf der Kapitän auch abgeschlossene Spieltage korrigieren —
  // genau dafür ist diese Route da.
  try {
    e.app.findRecordById('fixtures', spieltagId)
    e.app.findRecordById('members', mitgliedId)
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const vorhanden = u.eigenerSatz(e, 'responses', spieltagId, mitgliedId)
  const alt = vorhanden ? vorhanden.getString('status') : ''
  if (status === null) {
    if (vorhanden) e.app.delete(vorhanden)
  } else {
    const satz = vorhanden || new Record(e.app.findCollectionByNameOrId('responses'))
    satz.set('fixture', spieltagId)
    satz.set('member', mitgliedId)
    satz.set('status', status)
    e.app.save(satz)
  }

  a.protokoll(e, 'response.correct', `${spieltagId}/${mitgliedId}`, alt, status || '')
  return e.json(200, { ok: true })
})

// ── Einstellungen ───────────────────────────────────────────────────────────────────────────
// Genau ein Datensatz, angelegt von der Migration. Gelesen wird er auch von der
// Einladungsseite — deshalb liegt das Holen in utils.js und nicht hier.
routerAdd('GET', '/admin/api/settings', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  return e.json(200, u.einstellungen(e.app))
})

routerAdd('PATCH', '/admin/api/settings', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  const koerper = e.requestInfo().body || {}

  // R4 · Whitelist: geschrieben wird nur, was hier steht. Was sonst im Körper ankommt, wird
  // ignoriert, nicht abgelehnt.
  if (!('anzeigename' in koerper)) return e.json(400, { message: 'Ungültige Angabe.' })

  const name = String(koerper.anzeigename || '').trim()
  // Leer ginge nicht: die Einladungsseite hätte dann eine leere Überschrift. Die Obergrenze
  // spiegelt `max: 60` aus der Migration — sonst lehnte erst die Datenbank ab, mit einer
  // Meldung, die dem Kapitän nichts sagt.
  if (!name || name.length > 60) return e.json(400, { message: 'Ungültige Angabe.' })

  let satz
  try {
    const alle = e.app.findAllRecords('settings')
    satz = alle && alle.length ? alle[0] : new Record(e.app.findCollectionByNameOrId('settings'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const vorher = satz.getString('anzeigename')
  if (vorher === name) return e.json(200, u.einstellungen(e.app))

  satz.set('anzeigename', name)
  e.app.save(satz)

  // Der Name steht anschließend in jeder Linkvorschau. Wer ihn wann geändert hat, gehört
  // deshalb ins Protokoll — mit altem und neuem Wert.
  a.protokoll(e, 'settings.update', 'anzeigename', vorher, name)

  return e.json(200, u.einstellungen(e.app))
})

// ── Protokoll ───────────────────────────────────────────────────────────────────────────────
routerAdd('GET', '/admin/api/audit', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const raus = a.abweisen(e)
  if (raus) return raus

  const gewuenscht = Number((e.requestInfo().query || {}).limit) || 100
  const grenze = Math.min(gewuenscht, 500)
  const alle = e.app.findRecordsByFilter('audit_log', "id != ''", '-at', grenze, 0)

  // Im Protokoll stehen IDs — `member:n5xck1yyp6pk0a3` sagt dem Kapitän nichts. Einmal alle
  // Namen holen und im Speicher auflösen, statt pro Zeile nachzuschlagen.
  const namen = {}
  for (const m of e.app.findRecordsByFilter('members', "id != ''", '', 500, 0)) {
    namen[m.id] = m.getString('name')
  }
  for (const s of e.app.findRecordsByFilter('fixtures', "id != ''", '', 500, 0)) {
    namen[s.id] = s.getString('opponent_town')
  }

  // Gelöschte Spieltage und Mitglieder stehen weiterhin als ID da — das ist richtig so, die
  // Zeile soll nicht verschwinden, nur weil ihr Bezug weg ist.
  const lesbar = (wert) => {
    if (!wert) return ''
    if (wert.indexOf('admin:') === 0) return wert.slice(6)
    if (wert.indexOf('member:') === 0) {
      const id = wert.slice(7)
      return namen[id] || `Mitglied ${id}`
    }
    // Ziele wie `<fixtureId>` oder `<fixtureId>/<memberId>`.
    return wert
      .split('/')
      .map((teil) => namen[teil] || teil)
      .join(' · ')
  }

  return e.json(200, {
    items: alle.map((x) => ({
      at: x.getDateTime('at').string(),
      actor: lesbar(x.getString('actor')),
      // Ob es der Kapitän oder ein Mitglied war, geht sonst verloren, sobald der Präfix weg ist.
      actor_typ: x.getString('actor').indexOf('admin:') === 0 ? 'admin' : 'member',
      action: x.getString('action'),
      target: lesbar(x.getString('target')),
      old_value: x.getString('old_value'),
      new_value: x.getString('new_value'),
    })),
  })
})
