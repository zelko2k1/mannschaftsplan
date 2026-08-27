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
// ZUM ZWEITEN FAKTOR: `validatePassword()` weiter unten prüft das Passwort direkt und geht damit
// weiterhin an PocketBases eigenem MFA vorbei — ein im Dashboard am Superuser eingeschalteter
// zweiter Faktor schützt `/_/`, aber NICHT diesen Login. Dieser Login bringt seinen eigenen mit
// (`admin_totp`, siehe pb_hooks/totp.js): zeitbasierte Codes aus einer Authenticator-App, geprüft
// direkt hinter der Passwortprüfung. PocketBases MFA kam nicht in Frage, weil es Einmalcodes per
// E-Mail verschickt und diese App bewusst keinen Mailserver hat.
//
// Das Tor aus R13b bleibt trotzdem die wirksamste Einzelmaßnahme und ersetzt nichts davon.
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

  // Abschnitt 12 · Zwei Quellen, in dieser Reihenfolge: die Verwalterkonten der Kapitäne, dann
  // der Superuser. Beide Male prüft PocketBase das Passwort selbst (R13) — nur die Tabelle ist
  // eine andere. Der Superuser bleibt immer anmeldefähig; er ist der Rettungsanker, wenn beim
  // Verteilen der Rollen etwas schiefgeht.
  let konto = null
  try {
    konto = e.app.findAuthRecordByEmail('verwalter', email)
  } catch {
    konto = null
  }
  if (!konto) {
    try {
      konto = e.app.findAuthRecordByEmail('_superusers', email)
    } catch {
      konto = null
    }
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
  if (!konto || !konto.validatePassword(passwort)) {
    return e.json(401, { message: 'Anmeldung fehlgeschlagen.' })
  }

  // ── Zweiter Faktor (Abschnitt 9) ──────────────────────────────────────────────────────────
  // Hier war die Lücke, die der Kopf dieser Datei jahrelang angekündigt hat: `validatePassword()`
  // geht an PocketBases MFA vorbei, ein am Superuser eingeschalteter zweiter Faktor schützte
  // deshalb nur `/_/`, nicht diesen Login. Jetzt prüft er hier selbst.
  //
  // Unbestätigte Einträge zählen nicht. Wer die Einrichtung abbricht, bevor ein Code gestimmt
  // hat, sperrt sich sonst selbst aus — und zwar aus einer Ansicht, die er braucht, um es
  // rückgängig zu machen.
  let totpSatz = null
  try {
    totpSatz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m} && confirmed = true', {
      m: email,
    })
  } catch {
    totpSatz = null
  }

  if (totpSatz) {
    const totp = require(`${__hooks}/totp.js`)
    const code = String(koerper.code || '')

    // Ohne Code ist das keine fehlgeschlagene Anmeldung, sondern eine halbe: Der Client soll
    // das Codefeld zeigen und es noch einmal versuchen. Preisgegeben wird damit nichts, was
    // nicht schon feststeht — wer bis hierher kommt, hat das richtige Passwort.
    if (!code) {
      return e.json(401, { mfa: true, message: 'Code aus der Authenticator-App nötig.' })
    }

    const schritt = totp.pruefen(
      totpSatz.getString('secret'),
      code,
      Math.floor(Date.now() / 1000),
      totpSatz.getInt('last_step'),
    )
    if (!schritt) {
      return e.json(401, { mfa: true, message: 'Der Code stimmt nicht.' })
    }

    // Verbrauchen, damit derselbe Code kein zweites Mal gilt.
    try {
      totpSatz.set('last_step', schritt)
      e.app.save(totpSatz)
    } catch {
      /* nicht schlimm genug, um die Anmeldung scheitern zu lassen */
    }
  }

  // Erst JETZT zurücksetzen. Stünde das oben hinter dem Passwort, könnte jemand mit dem
  // richtigen Passwort beliebig viele Codes durchprobieren, ohne je an die Sperre zu stoßen.
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
  const kontext = a.kontext(e)
  if (!kontext) return e.json(404, { message: 'Nicht gefunden.' })

  // Die Oberfläche braucht drei Dinge: wer man ist, was man darf, und welche Mannschaften zur
  // Auswahl stehen. Ein Kapitän bekommt genau eine — die Umschaltung erscheint bei ihm gar
  // nicht erst, und selbst wenn er sie sich herbeiredete, hielte der Server dagegen.
  let teams = []
  try {
    const filter = kontext.rolle === 'kapitaen' ? 'id = {:t}' : "id != ''"
    teams = e.app
      .findRecordsByFilter('teams', filter, 'sort,name', 50, 0, { t: kontext.team })
      .map((t) => ({ id: t.id, name: t.getString('name') }))
  } catch {
    teams = []
  }

  return e.json(200, {
    email: kontext.email,
    rolle: kontext.rolle,
    team: kontext.team,
    teams: teams,
  })
})

// ── Spieltage ───────────────────────────────────────────────────────────────────────────────
routerAdd('GET', '/admin/api/fixtures', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  // Für den Hinweis am Eingabefeld: Was stünde dort, wenn nichts von Hand eingetragen ist?
  // Gerechnet wird im Backend, nicht im Browser — sonst zeigte die Kapitänsansicht am Ende
  // eine andere Abfahrt als der Aushang (6.3).
  const einst = u.einstellungen(e.app)

  // Abschnitt 12 · Ein Kapitän sieht nur seine Mannschaft, der Gesamt-Admin die gewählte oder
  // alle. `teamFuer` liest den Wunsch aus dem Request NUR für den Gesamt-Admin — bei einem
  // Kapitän steht dort immer die eigene, egal was er mitschickt.
  const team = a.teamFuer(kontext, (e.requestInfo().query || {}).team)
  const alle = team
    ? e.app.findRecordsByFilter('fixtures', 'team = {:t}', 'date', 500, 0, { t: team })
    : e.app.findRecordsByFilter('fixtures', "id != ''", 'date', 500, 0)
  return e.json(200, {
    items: alle.map((s) => ({
      id: s.id,
      date: s.getDateTime('date').string(),
      opponent_club: s.getString('opponent_club'),
      opponent_town: s.getString('opponent_town'),
      is_home: s.getBool('is_home'),
      venue: s.getString('venue'),
      km: s.getInt('km'),
      team: s.getString('team'),
      meeting_point: s.getString('meeting_point'),
      departure_manual: s.getDateTime('departure_manual').string(),
      departure_berechnet: u.abfahrt(
        s.getDateTime('date').string(),
        s.getInt('km'),
        s.getBool('is_home'),
        einst.tempo_kmh,
        einst.puffer_minuten,
      ),
      needed_players: s.getInt('needed_players'),
      locked: s.getBool('locked'),
    })),
  })
})

routerAdd('POST', '/admin/api/fixtures', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  const koerper = e.requestInfo().body || {}
  if (!String(koerper.opponent_town || '').trim() || !String(koerper.date || '').trim()) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  // Abschnitt 12 · Ohne Mannschaft kein Spieltag. Der Kapitän bekommt seine eigene zugewiesen,
  // der Gesamt-Admin muss sagen, für welche. Das Schema lehnte es ohnehin ab — hier steht es,
  // damit die Meldung verständlich ist statt einer Datenbankfehlermeldung.
  const team = a.teamFuer(kontext, koerper.team)
  if (!team || !a.darfTeam(kontext, team)) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const satz = new Record(e.app.findCollectionByNameOrId('fixtures'))
  satz.set('team', team)
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
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  let satz
  try {
    satz = e.app.findRecordById('fixtures', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  // Dieselbe Antwort wie „gibt es nicht" (R6) — ein Kapitän soll nicht durchprobieren können,
  // welche IDs zu anderen Mannschaften gehören.
  if (!a.darfTeam(kontext, satz.getString('team'))) {
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
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  let satz
  try {
    satz = e.app.findRecordById('fixtures', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (!a.darfTeam(kontext, satz.getString('team'))) {
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
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  const team = a.teamFuer(kontext, (e.requestInfo().query || {}).team)
  const alle = team
    ? e.app.findRecordsByFilter('members', 'team = {:t}', 'sort,name', 200, 0, { t: team })
    : e.app.findRecordsByFilter('members', "id != ''", 'sort,name', 200, 0)
  return e.json(200, {
    items: alle.map((m) => {
      const sitzungen = e.app.findRecordsByFilter('sessions', 'member = {:m}', '', 50, 0, { m: m.id })
      return {
        id: m.id,
        team: m.getString('team'),
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
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  const koerper = e.requestInfo().body || {}
  const name = String(koerper.name || '').trim()
  if (!name) return e.json(400, { message: 'Ungültige Angabe.' })

  const team = a.teamFuer(kontext, koerper.team)
  if (!team || !a.darfTeam(kontext, team)) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const satz = new Record(e.app.findCollectionByNameOrId('members'))
  satz.set('team', team)
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
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  let satz
  try {
    satz = e.app.findRecordById('members', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (!a.darfTeam(kontext, satz.getString('team'))) {
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
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  let satz
  try {
    satz = e.app.findRecordById('members', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (!a.darfTeam(kontext, satz.getString('team'))) {
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
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  const spieltagId = e.request.pathValue('fixtureId')
  const mitgliedId = e.request.pathValue('memberId')

  // Beide müssen zur Mannschaft des Verwalters gehören — und zueinander. Sonst könnte ein
  // Kapitän die Rückmeldung eines fremden Mitglieds zu seinem eigenen Spieltag setzen.
  let spieltagSatz = null
  let mitgliedSatz = null
  try {
    spieltagSatz = e.app.findRecordById('fixtures', spieltagId)
    mitgliedSatz = e.app.findRecordById('members', mitgliedId)
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (
    !spieltagSatz ||
    !mitgliedSatz ||
    spieltagSatz.getString('team') !== mitgliedSatz.getString('team') ||
    !a.darfTeam(kontext, spieltagSatz.getString('team'))
  ) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

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
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  return e.json(200, u.einstellungen(e.app))
})

routerAdd('PATCH', '/admin/api/settings', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  const koerper = e.requestInfo().body || {}

  // R4 · Whitelist mit Grenzen. Die Grenzen spiegeln die Migration — ohne sie lehnte erst die
  // Datenbank ab, mit einer Meldung, die dem Kapitän nichts sagt.
  const ZAHLEN = {
    tempo_kmh: { min: 20, max: 200 },
    puffer_minuten: { min: 0, max: 180 },
    auto_sperre_stunden: { min: 0, max: 168 },
  }

  let satz
  try {
    const alle = e.app.findAllRecords('settings')
    satz = alle && alle.length ? alle[0] : new Record(e.app.findCollectionByNameOrId('settings'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const vorher = u.einstellungen(e.app)
  const geaendert = []

  if ('anzeigename' in koerper) {
    const name = String(koerper.anzeigename || '').trim()
    // Leer ginge nicht: die Einladungsseite hätte dann eine leere Überschrift.
    if (!name || name.length > 60) return e.json(400, { message: 'Ungültige Angabe.' })
    if (name !== vorher.anzeigename) geaendert.push(['anzeigename', vorher.anzeigename, name])
    satz.set('anzeigename', name)
  }

  // Impressum und Datenschutz dürfen leer sein — dann gibt es die Seite nicht und nichts
  // verlinkt darauf. Im Protokoll steht nur, DASS sich etwas geändert hat: der Text selbst
  // gehörte sonst in voller Länge in jede Zeile.
  for (const feld of ['impressum', 'datenschutz']) {
    if (!(feld in koerper)) continue
    const text = String(koerper[feld] === null || koerper[feld] === undefined ? '' : koerper[feld]).trim()
    if (text.length > 8000) return e.json(400, { message: 'Der Text ist zu lang.' })
    if (text !== vorher[feld]) {
      geaendert.push([feld, vorher[feld] ? `${vorher[feld].length} Zeichen` : 'leer', text ? `${text.length} Zeichen` : 'leer'])
    }
    satz.set(feld, text)
  }

  for (const feld in ZAHLEN) {
    if (!(feld in koerper)) continue
    const wert = Number(koerper[feld])
    if (!isFinite(wert) || wert !== Math.round(wert)) return e.json(400, { message: 'Ungültige Angabe.' })
    if (wert < ZAHLEN[feld].min || wert > ZAHLEN[feld].max) return e.json(400, { message: 'Ungültige Angabe.' })
    if (wert !== vorher[feld]) geaendert.push([feld, String(vorher[feld]), String(wert)])
    satz.set(feld, wert)
  }

  if (!geaendert.length) return e.json(200, u.einstellungen(e.app))

  e.app.save(satz)

  // Je Feld eine Zeile. Der Anzeigename steht anschließend in jeder Linkvorschau, die Frist
  // schließt Spieltage ohne Zutun — beides gehört nachvollziehbar ins Protokoll.
  for (const [feld, alt, neu] of geaendert) a.protokoll(e, 'settings.update', feld, alt, neu)

  return e.json(200, u.einstellungen(e.app))
})

// ── Protokoll ───────────────────────────────────────────────────────────────────────────────
routerAdd('GET', '/admin/api/audit', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  const gewuenscht = Number((e.requestInfo().query || {}).limit) || 100
  const grenze = Math.min(gewuenscht, 500)
  const team = a.teamFuer(kontext, (e.requestInfo().query || {}).team)

  // Im Protokoll stehen IDs — `member:n5xck1yyp6pk0a3` sagt dem Kapitän nichts. Einmal alle
  // Namen holen und im Speicher auflösen, statt pro Zeile nachzuschlagen.
  //
  // Abschnitt 12 · Dieselbe Liste entscheidet, WELCHE Zeilen er überhaupt sieht: Ist eine
  // Mannschaft gewählt, bleiben nur Zeilen übrig, deren Ziel zu ihr gehört. Zentrale Ereignisse
  // — Anmeldungen, Einstellungen, Sicherungen — haben gar kein Ziel und fallen damit heraus.
  // Für einen Kapitän ist das richtig so: Sie gehen ihn nichts an.
  const namen = {}
  const eigene = {}
  const mFilter = team ? 'team = {:t}' : "id != ''"
  for (const m of e.app.findRecordsByFilter('members', mFilter, '', 500, 0, { t: team })) {
    namen[m.id] = m.getString('name')
    eigene[m.id] = true
  }
  for (const s of e.app.findRecordsByFilter('fixtures', mFilter, '', 500, 0, { t: team })) {
    namen[s.id] = s.getString('opponent_town')
    eigene[s.id] = true
  }

  // Gelöschte Spieltage und Mitglieder stehen weiterhin als ID da — das ist richtig so, die
  // Zeile soll nicht verschwinden, nur weil ihr Bezug weg ist.
  const lesbar = (wert) => {
    if (!wert) return ''
    if (wert.indexOf('admin:') === 0) return wert.slice(6)
    // Der Cron, der gespielte Spieltage schließt. Ohne eigenen Zweig stünde hier die rohe
    // Zeichenkette `system:auto-sperre`.
    if (wert.indexOf('system:') === 0) return wert.slice(7)
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

  let alle = e.app.findRecordsByFilter('audit_log', "id != ''", '-at', grenze, 0)
  if (team) {
    alle = alle.filter((x) => {
      const ziel = x.getString('target')
      if (ziel && eigene[ziel]) return true
      const wer = x.getString('actor')
      return wer.indexOf('member:') === 0 && eigene[wer.slice(7)]
    })
  }

  return e.json(200, {
    items: alle.map((x) => ({
      at: x.getDateTime('at').string(),
      actor: lesbar(x.getString('actor')),
      // Ob es der Kapitän, ein Mitglied oder die Automatik war, geht sonst verloren, sobald der
      // Präfix weg ist.
      actor_typ:
        x.getString('actor').indexOf('admin:') === 0
          ? 'admin'
          : x.getString('actor').indexOf('system:') === 0
            ? 'system'
            : 'member',
      action: x.getString('action'),
      target: lesbar(x.getString('target')),
      old_value: x.getString('old_value'),
      new_value: x.getString('new_value'),
    })),
  })
})

// ── Sicherungen (Abschnitt 7.4) ─────────────────────────────────────────────────────────────
// Warum das hier liegt und nicht nur im Skript: `scripts/backup.sh` ist für einen Cronjob auf
// einer ANDEREN Maschine gedacht und bleibt der Rückhalt — eine Sicherung, die jemand von Hand
// anstößt, entsteht nur, wenn er daran denkt. Aber ein Vereinsadmin, der einmal im Monat eine
// Kopie in die Hand nehmen will, soll dafür weder SSH noch SFTP noch einen Pfad kennen müssen.
//
// Alles läuft über `newBackupsFilesystem()` statt über direkte Dateizugriffe: Damit funktioniert
// es unverändert weiter, wenn jemand PocketBases S3-Ablage einschaltet.
//
// Der Kontext kommt aus `$app.rootCmd.context()`, NICHT aus dem Request. Ein Request-Kontext
// wird abgebrochen, sobald die Antwort draußen ist — beim Wiederherstellen liefe die Operation
// dann mitten hinein.

// ── POST /admin/api/backup · Sicherung erzeugen ─────────────────────────────────────────────
routerAdd('POST', '/admin/api/backup', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  const name = `pb_backup_manuell_${a.backupZeitstempel()}.zip`

  try {
    e.app.createBackup($app.rootCmd.context(), name)
  } catch (fehler) {
    console.log('Sicherung erzeugen:', fehler)
    return e.json(500, { message: 'Die Sicherung konnte nicht erzeugt werden.' })
  }

  a.protokoll(e, 'backup.create', name, '', 'von Hand')
  return e.json(200, { name: name })
})

// ── GET /admin/api/backups · Was liegt da ───────────────────────────────────────────────────
routerAdd('GET', '/admin/api/backups', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  let eintraege = []
  try {
    eintraege = e.app.newBackupsFilesystem().list('')
  } catch (fehler) {
    console.log('Sicherungen auflisten:', fehler)
    return e.json(500, { message: 'Die Sicherungen konnten nicht gelesen werden.' })
  }

  const items = eintraege
    .filter((x) => x && a.backupNameOk(x.key))
    .map((x) => ({ name: x.key, groesse: x.size, geaendert: String(x.modTime) }))
    .sort((x, y) => (x.geaendert < y.geaendert ? 1 : -1))

  return e.json(200, { items: items })
})

// ── GET /admin/api/backup/{name} · Herunterladen ────────────────────────────────────────────
// Kein CSRF-Token nötig (GET) — der Knopf ist damit ein gewöhnlicher Link, und der Browser legt
// die Datei in den Download-Ordner. Genau das ist der Punkt der Übung.
routerAdd('GET', '/admin/api/backup/{name}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  const name = e.request.pathValue('name')
  if (!a.backupNameOk(name)) return e.json(404, { message: 'Nicht gefunden.' })

  try {
    e.app.newBackupsFilesystem().serve(e.response, e.request, name, name)
  } catch (fehler) {
    console.log('Sicherung ausliefern:', fehler)
    return e.json(404, { message: 'Nicht gefunden.' })
  }

  a.protokoll(e, 'backup.download', name, '', '')
  return null
})

// ── POST /admin/api/backup/upload · Zurückgeben ─────────────────────────────────────────────
// Ohne diesen Weg kennt PocketBase eine heruntergeladene Datei nicht mehr, und das
// Wiederherstellen läuft ins Leere — die Stelle, über die der erste Testlauf gestolpert ist.
routerAdd('POST', '/admin/api/backup/upload', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  let datei
  try {
    datei = e.findUploadedFiles('datei')[0]
  } catch {
    datei = null
  }
  if (!datei) return e.json(400, { message: 'Keine Datei erhalten.' })

  const name = String(datei.originalName || '')
  if (!a.backupNameOk(name)) {
    return e.json(400, { message: 'Nur Sicherungsdateien mit der Endung .zip.' })
  }

  try {
    e.app.newBackupsFilesystem().uploadFile(datei, name)
  } catch (fehler) {
    console.log('Sicherung hochladen:', fehler)
    return e.json(500, { message: 'Die Datei konnte nicht abgelegt werden.' })
  }

  a.protokoll(e, 'backup.upload', name, '', '')
  return e.json(200, { name: name })
})

// ── DELETE /admin/api/backup/{name} · Wegräumen ─────────────────────────────────────────────
// Ohne diesen Weg sammeln sich die Sicherungen in `pb_data` für immer an — jede so groß wie die
// ganze Datenbank. Der Kapitän soll aufräumen können, ohne dafür auf den Server zu müssen.
routerAdd('DELETE', '/admin/api/backup/{name}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  const name = e.request.pathValue('name')
  if (!a.backupNameOk(name)) return e.json(404, { message: 'Nicht gefunden.' })

  try {
    e.app.newBackupsFilesystem().delete(name)
  } catch (fehler) {
    console.log('Sicherung löschen:', fehler)
    return e.json(404, { message: 'Nicht gefunden.' })
  }

  a.protokoll(e, 'backup.delete', name, '', '')
  return e.json(200, { name: name })
})

// ── POST /admin/api/backup/{name}/restore · Zurückspielen ───────────────────────────────────
// Der scharfe Knopf, deshalb zwei Sicherungen davor:
//   1. Der Name muss im Rumpf noch einmal stehen. Ein Fehlklick allein reicht nicht.
//   2. Vorher entsteht automatisch eine Kopie des AKTUELLEN Standes. Wer sich vergreift, kann
//      zurück — sonst wäre der Fehlgriff endgültig.
//
// PocketBase nennt `restoreBackup` ausdrücklich experimentell und UNIX-only und will doppelt so
// viel freien Plattenplatz wie die Sicherung.
//
// ZWEI EIGENHEITEN, die man kennen muss:
//
// 1. Der Prozess startet NOCH IM AUFRUF neu. Das `return` unten wird im Erfolgsfall nie
//    erreicht, die Verbindung reißt vorher ab. Der Client wertet genau diesen Abriss als
//    Erfolg — siehe `sicherungZurueckspielen` in adminApi.ts. Es hilft nicht, die Antwort
//    vorher rauszuschreiben: Ob sie den Browser noch erreicht, bevor execve zuschlägt, ist
//    nicht zugesichert.
// 2. Der Protokolleintrag unten liegt in der Datenbank, die gleich ersetzt wird — er überlebt
//    den Vorgang also NICHT. Ein Zurückspielen bleibt im Protokoll unsichtbar. Das lässt sich
//    nicht beheben, solange die Datenbank die Datenbank ersetzt; er wird trotzdem geschrieben,
//    weil er bei einem FEHLGESCHLAGENEN Versuch stehen bleibt und dann das Einzige ist, was
//    davon zeugt.
routerAdd('POST', '/admin/api/backup/{name}/restore', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  const name = e.request.pathValue('name')
  if (!a.backupNameOk(name)) return e.json(404, { message: 'Nicht gefunden.' })

  const koerper = e.requestInfo().body || {}
  if (koerper.bestaetigung !== name) {
    return e.json(400, { message: 'Zur Bestätigung den Dateinamen eintragen.' })
  }

  // Gibt es die Datei überhaupt? Sonst stünde am Ende ein Neustart ohne Grund.
  let vorhanden = false
  try {
    vorhanden = e.app.newBackupsFilesystem().list('').some((x) => x && x.key === name)
  } catch {
    vorhanden = false
  }
  if (!vorhanden) return e.json(404, { message: 'Nicht gefunden.' })

  const rettung = `pb_backup_vor_wiederherstellung_${a.backupZeitstempel()}.zip`
  try {
    e.app.createBackup($app.rootCmd.context(), rettung)
  } catch (fehler) {
    // Ohne Netz wird nicht gesprungen.
    console.log('Sicherheitskopie vor Wiederherstellung:', fehler)
    return e.json(500, { message: 'Die Sicherheitskopie schlug fehl — es wurde nichts verändert.' })
  }

  a.protokoll(e, 'backup.restore', name, rettung, 'Neustart folgt')

  try {
    e.app.restoreBackup($app.rootCmd.context(), name)
  } catch (fehler) {
    console.log('Wiederherstellen:', fehler)
    return e.json(500, { message: 'Das Zurückspielen schlug fehl. Der bisherige Stand ist unverändert.' })
  }

  return e.json(200, { name: name, sicherheitskopie: rettung })
})


// ── Zweiter Faktor verwalten (Abschnitt 9) ──────────────────────────────────────────────────
// Der Ablauf ist bewusst zweistufig: `POST` legt ein Geheimnis an, das noch NICHT gilt, und
// `POST /confirm` schaltet es scharf, nachdem ein Code daraus gestimmt hat. Wer sonst die App
// falsch einrichtet oder das Fenster zu früh schließt, hätte einen zweiten Faktor, den er nicht
// erzeugen kann — und käme an die Ansicht, die ihn abschalten würde, nicht mehr heran.

// ── GET /admin/api/totp · Was ist eingerichtet ──────────────────────────────────────────────
routerAdd('GET', '/admin/api/totp', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  const email = a.sitzung(e).getString('email')
  let satz = null
  try {
    satz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m}', { m: email })
  } catch {
    satz = null
  }

  // Das Geheimnis selbst geht hier NIE mit. Es verlässt den Server genau einmal, beim Anlegen.
  return e.json(200, {
    aktiv: !!satz && satz.getBool('confirmed'),
    ausstehend: !!satz && !satz.getBool('confirmed'),
  })
})

// ── POST /admin/api/totp · Einrichtung beginnen ─────────────────────────────────────────────
routerAdd('POST', '/admin/api/totp', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  const totp = require(`${__hooks}/totp.js`)
  const u = require(`${__hooks}/utils.js`)
  const email = a.sitzung(e).getString('email')

  let satz = null
  try {
    satz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m}', { m: email })
  } catch {
    satz = null
  }

  // Einen bereits scharfen zweiten Faktor überschreibt das hier nicht. Sonst genügte ein
  // Klick, um ihn durch einen neuen zu ersetzen — und der Schutz wäre keiner.
  if (satz && satz.getBool('confirmed')) {
    return e.json(409, { message: 'Es ist bereits ein zweiter Faktor eingerichtet.' })
  }

  const geheimnis = totp.neuesGeheimnis()
  if (!satz) satz = new Record(e.app.findCollectionByNameOrId('admin_totp'))
  satz.set('email', email)
  satz.set('secret', geheimnis)
  satz.set('confirmed', false)
  satz.set('last_step', 0)
  e.app.save(satz)

  const einst = u.einstellungen(e.app)
  return e.json(200, {
    geheimnis: geheimnis,
    uri: totp.otpauthUri(geheimnis, email, einst.anzeigename || 'Mannschaftsplan'),
  })
})

// ── POST /admin/api/totp/confirm · Scharf schalten ──────────────────────────────────────────
routerAdd('POST', '/admin/api/totp/confirm', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  const totp = require(`${__hooks}/totp.js`)
  const email = a.sitzung(e).getString('email')

  let satz = null
  try {
    satz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m}', { m: email })
  } catch {
    satz = null
  }
  if (!satz) return e.json(400, { message: 'Es läuft keine Einrichtung.' })
  if (satz.getBool('confirmed')) return e.json(409, { message: 'Bereits eingerichtet.' })

  const koerper = e.requestInfo().body || {}
  const schritt = totp.pruefen(
    satz.getString('secret'),
    String(koerper.code || ''),
    Math.floor(Date.now() / 1000),
    satz.getInt('last_step'),
  )
  if (!schritt) return e.json(400, { message: 'Der Code stimmt nicht.' })

  satz.set('confirmed', true)
  satz.set('last_step', schritt)
  e.app.save(satz)

  a.protokoll(e, 'admin.totp.on', '', '', '')
  return e.json(200, { aktiv: true })
})

// ── DELETE /admin/api/totp · Wieder abschalten ──────────────────────────────────────────────
// Auch dafür ein gültiger Code. Eine übernommene Sitzung soll den zweiten Faktor nicht mit
// einem Klick loswerden können — sonst schützte er nur, bis jemand drin ist.
//
// Wer sein Gerät verloren hat, kommt hier nicht weiter. Für diesen Fall gibt es den Weg über
// die Kommandozeile auf dem Server, und er steht in der README.
routerAdd('DELETE', '/admin/api/totp', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  const totp = require(`${__hooks}/totp.js`)
  const email = a.sitzung(e).getString('email')

  let satz = null
  try {
    satz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m}', { m: email })
  } catch {
    satz = null
  }
  if (!satz) return e.json(200, { aktiv: false })

  // Eine noch unbestätigte Einrichtung darf ohne Code weg — sie schützt ja noch nichts, und
  // wer sie nicht loswird, kann auch keine neue beginnen.
  if (satz.getBool('confirmed')) {
    const koerper = e.requestInfo().body || {}
    const schritt = totp.pruefen(
      satz.getString('secret'),
      String(koerper.code || ''),
      Math.floor(Date.now() / 1000),
      satz.getInt('last_step'),
    )
    if (!schritt) return e.json(400, { message: 'Der Code stimmt nicht.' })
  }

  e.app.delete(satz)
  a.protokoll(e, 'admin.totp.off', '', '', '')
  return e.json(200, { aktiv: false })
})


// ── Mannschaften (Abschnitt 12) ─────────────────────────────────────────────────────────────
// Anlegen und Löschen macht der Gesamt-Admin. Den Namen und den Puffer darf jeder Kapitän an
// SEINER Mannschaft ändern — das ist die „Einstellung der Mannschaft", von der sonst überall
// die Rede ist.

routerAdd('GET', '/admin/api/teams', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  const filter = kontext.rolle === 'kapitaen' ? 'id = {:t}' : "id != ''"
  const alle = e.app.findRecordsByFilter('teams', filter, 'sort,name', 50, 0, { t: kontext.team })

  return e.json(200, {
    items: alle.map((t) => ({
      id: t.id,
      name: t.getString('name'),
      sort: t.getInt('sort'),
      puffer_minuten: t.getInt('puffer_minuten'),
      startort: t.getString('startort'),
    })),
  })
})

routerAdd('POST', '/admin/api/teams', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext
  if (kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  const koerper = e.requestInfo().body || {}
  const name = String(koerper.name || '').trim()
  if (!name || name.length > 60) return e.json(400, { message: 'Ungültige Angabe.' })

  const satz = new Record(e.app.findCollectionByNameOrId('teams'))
  satz.set('name', name)
  satz.set('sort', Number(koerper.sort) || 0)
  satz.set('puffer_minuten', 25)
  satz.set('startort', '')
  try {
    e.app.save(satz)
  } catch {
    // Der eindeutige Index über den Namen. Zwei „Herren I" wären für jeden verwirrend.
    return e.json(400, { message: 'Diesen Namen gibt es schon.' })
  }

  a.protokoll(e, 'team.create', satz.id, '', name)
  return e.json(200, { id: satz.id })
})

routerAdd('PATCH', '/admin/api/teams/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext

  let satz
  try {
    satz = e.app.findRecordById('teams', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (!a.darfTeam(kontext, satz.id)) return e.json(400, { message: 'Ungültige Angabe.' })

  const koerper = e.requestInfo().body || {}
  const geaendert = []

  if ('name' in koerper) {
    const name = String(koerper.name || '').trim()
    if (!name || name.length > 60) return e.json(400, { message: 'Ungültige Angabe.' })
    if (name !== satz.getString('name')) geaendert.push(['name', satz.getString('name'), name])
    satz.set('name', name)
  }
  if ('puffer_minuten' in koerper) {
    const zahl = Number(koerper.puffer_minuten)
    if (!isFinite(zahl) || zahl < 0 || zahl > 180) return e.json(400, { message: 'Ungültige Angabe.' })
    const alt = satz.getInt('puffer_minuten')
    if (Math.round(zahl) !== alt) geaendert.push(['puffer_minuten', String(alt), String(Math.round(zahl))])
    satz.set('puffer_minuten', Math.round(zahl))
  }
  if ('startort' in koerper) satz.set('startort', String(koerper.startort || '').slice(0, 120))
  // Die Reihenfolge ordnet nur der Gesamt-Admin — sie betrifft die Liste aller Mannschaften.
  if ('sort' in koerper && kontext.rolle === 'gesamt') satz.set('sort', Number(koerper.sort) || 0)

  try {
    e.app.save(satz)
  } catch {
    return e.json(400, { message: 'Diesen Namen gibt es schon.' })
  }

  for (const [feld, alt, neu] of geaendert) a.protokoll(e, 'team.update', satz.id, `${feld}: ${alt}`, neu)
  return e.json(200, { id: satz.id })
})

routerAdd('DELETE', '/admin/api/teams/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext
  if (kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  const id = e.request.pathValue('id')
  let satz
  try {
    satz = e.app.findRecordById('teams', id)
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  // Kein Kaskadenlöschen: Eine Mannschaft mit Mitgliedern zu löschen, nähme Rückmeldungen und
  // Fahrten gleich mit — ein Klick, und ein Jahr Spielbetrieb ist weg. Wer sie wirklich
  // auflösen will, räumt sie vorher leer und sieht dabei, was er tut.
  for (const [was, feld] of [['members', 'team'], ['fixtures', 'team']]) {
    const rest = e.app.findRecordsByFilter(was, `${feld} = {:t}`, '', 1, 0, { t: id })
    if (rest.length) {
      return e.json(409, {
        message: 'In dieser Mannschaft stehen noch Mitglieder oder Spieltage.',
      })
    }
  }
  const rest = e.app.findRecordsByFilter('verwalter', 'team = {:t}', '', 1, 0, { t: id })
  if (rest.length) return e.json(409, { message: 'Dieser Mannschaft ist noch ein Kapitän zugeordnet.' })

  const name = satz.getString('name')
  e.app.delete(satz)
  a.protokoll(e, 'team.delete', id, name, '')
  return e.json(200, { ok: true })
})

// ── Verwalter (Abschnitt 12) ────────────────────────────────────────────────────────────────
// Konten für Kapitäne. Ausschließlich Sache des Gesamt-Admins — wer Konten anlegen darf, darf
// alles.
//
// Das Passwort wird erzeugt und GENAU EINMAL angezeigt, wie der Einladungslink eines Mitglieds
// (R1). PocketBase speichert davon nur den Hash; herausholen kann es niemand, auch der
// Gesamt-Admin nicht. Wer es verliert, bekommt ein neues.

routerAdd('GET', '/admin/api/verwalter', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  if (vor.kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  const alle = e.app.findRecordsByFilter('verwalter', "id != ''", 'email', 100, 0)
  return e.json(200, {
    items: alle.map((v) => ({
      id: v.id,
      email: v.getString('email'),
      rolle: v.getString('rolle'),
      team: v.getString('team'),
    })),
  })
})

routerAdd('POST', '/admin/api/verwalter', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  if (vor.kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  const koerper = e.requestInfo().body || {}
  const email = String(koerper.email || '').trim().toLowerCase()
  const rolle = koerper.rolle === 'gesamt' ? 'gesamt' : 'kapitaen'
  const team = String(koerper.team || '')

  if (!email || email.indexOf('@') < 1) return e.json(400, { message: 'Ungültige Angabe.' })
  // Ein Kapitän ohne Mannschaft könnte nichts sehen und nichts tun — das ist kein Konto,
  // sondern ein Missverständnis.
  if (rolle === 'kapitaen') {
    try {
      if (!team || !e.app.findRecordById('teams', team)) throw new Error('kein Team')
    } catch {
      return e.json(400, { message: 'Ein Kapitän braucht eine Mannschaft.' })
    }
  }

  // Lesbar, aber nicht zu erraten: 16 Zeichen ohne die Verwechslungspaare 0/O und 1/l/I.
  const passwort = $security.randomStringWithAlphabet(16, 'abcdefghijkmnopqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789')

  const satz = new Record(e.app.findCollectionByNameOrId('verwalter'))
  satz.set('email', email)
  satz.set('password', passwort)
  satz.set('rolle', rolle)
  satz.set('team', rolle === 'kapitaen' ? team : '')
  // Ohne das gilt das Konto als unbestätigt. Eine Bestätigung per E-Mail gibt es hier nicht —
  // die App hat bewusst keinen Mailserver.
  satz.set('verified', true)
  try {
    e.app.save(satz)
  } catch {
    return e.json(400, { message: 'Diese Adresse gibt es schon.' })
  }

  a.protokoll(e, 'verwalter.create', satz.id, '', `${email} (${rolle})`)
  // Das einzige Mal, dass das Passwort den Server verlässt.
  return e.json(200, { id: satz.id, email: email, passwort: passwort })
})

routerAdd('PATCH', '/admin/api/verwalter/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext
  if (kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  let satz
  try {
    satz = e.app.findRecordById('verwalter', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const koerper = e.requestInfo().body || {}

  // Sich selbst die Rolle zu nehmen ist der schnellste Weg, sich auszusperren. Der Superuser
  // käme zwar noch herein, aber das muss man erst einmal wissen.
  if (satz.getString('email') === kontext.email && 'rolle' in koerper && koerper.rolle !== 'gesamt') {
    return e.json(400, { message: 'Die eigene Rolle lässt sich nicht herabstufen.' })
  }

  if ('rolle' in koerper) satz.set('rolle', koerper.rolle === 'gesamt' ? 'gesamt' : 'kapitaen')
  if ('team' in koerper) satz.set('team', String(koerper.team || ''))
  if (satz.getString('rolle') === 'kapitaen' && !satz.getString('team')) {
    return e.json(400, { message: 'Ein Kapitän braucht eine Mannschaft.' })
  }
  if (satz.getString('rolle') === 'gesamt') satz.set('team', '')

  // Neues Passwort erzeugen — der Weg zurück, wenn jemand seines verloren hat.
  let passwort = null
  if (koerper.neues_passwort === true) {
    passwort = $security.randomStringWithAlphabet(16, 'abcdefghijkmnopqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789')
    satz.set('password', passwort)
  }

  e.app.save(satz)
  a.protokoll(e, 'verwalter.update', satz.id, '', satz.getString('email'))
  return e.json(200, { id: satz.id, passwort: passwort })
})

routerAdd('DELETE', '/admin/api/verwalter/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return vor.fehler
  const kontext = vor.kontext
  if (kontext.rolle !== 'gesamt') return e.json(404, { message: 'Nicht gefunden.' })

  let satz
  try {
    satz = e.app.findRecordById('verwalter', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (satz.getString('email') === kontext.email) {
    return e.json(400, { message: 'Das eigene Konto lässt sich nicht löschen.' })
  }

  const email = satz.getString('email')

  // Offene Sitzungen dieses Verwalters beenden — sonst arbeitet ein gelöschtes Konto noch bis
  // zu zwölf Stunden weiter. Dieselbe Überlegung wie bei „Neues Token" für ein Mitglied (R12).
  let beendet = 0
  try {
    for (const sitz of e.app.findRecordsByFilter('admin_sessions', 'email = {:m}', '', 100, 0, { m: email })) {
      e.app.delete(sitz)
      beendet += 1
    }
  } catch {
    /* keine offenen Sitzungen */
  }
  // Und ein etwaiger zweiter Faktor gehört zu einem Konto, das es nicht mehr gibt.
  try {
    for (const t of e.app.findRecordsByFilter('admin_totp', 'email = {:m}', '', 10, 0, { m: email })) {
      e.app.delete(t)
    }
  } catch {
    /* keiner eingerichtet */
  }

  e.app.delete(satz)
  a.protokoll(e, 'verwalter.delete', e.request.pathValue('id'), email, `${beendet} Sitzungen beendet`)
  return e.json(200, { ok: true })
})
