/// <reference path="../pb_data/types.d.ts" />
// Wiederkehrende Aufgaben — Abschnitt 8 (Datenschutz) und Abschnitt 9 (Erinnerungen).

// ── Löschjob (Abschnitt 8) ──────────────────────────────────────────────────────────────────
// Was nicht gespeichert wird, kann nicht verlorengehen. Alte Spieltage und ihre Rückmeldungen
// haben keinen Zweck mehr — die App kennt bewusst keine Statistik, für die man sie bräuchte.
cronAdd('aufraeumen', '30 3 * * *', () => {
  const grenzeSpieltage = new Date(Date.now() - 365 * 86400000).toISOString().replace('T', ' ').slice(0, 19)
  const grenzeProtokoll = new Date(Date.now() - 90 * 86400000).toISOString().replace('T', ' ').slice(0, 19)

  let spieltage = 0
  try {
    // Rückmeldungen, Fahrten und Mitfahrer verschwinden über cascadeDelete mit.
    for (const s of $app.findRecordsByFilter('fixtures', 'date < {:g}', 'date', 500, 0, { g: grenzeSpieltage })) {
      $app.delete(s)
      spieltage += 1
    }
  } catch (fehler) {
    console.log('Löschjob Spieltage:', fehler)
  }

  let protokoll = 0
  try {
    for (const a of $app.findRecordsByFilter('audit_log', 'at < {:g}', 'at', 2000, 0, { g: grenzeProtokoll })) {
      $app.delete(a)
      protokoll += 1
    }
  } catch (fehler) {
    console.log('Löschjob Protokoll:', fehler)
  }

  // Abgelaufene Sitzungen mitnehmen — ohne das wächst die Tabelle mit jedem Gerätewechsel.
  let sitzungen = 0
  const halbesJahr = new Date(Date.now() - 180 * 86400000).toISOString().replace('T', ' ').slice(0, 19)
  try {
    for (const s of $app.findRecordsByFilter('sessions', 'last_seen < {:g}', '', 500, 0, { g: halbesJahr })) {
      $app.delete(s)
      sitzungen += 1
    }
    for (const s of $app.findRecordsByFilter('admin_sessions', 'created < {:g}', '', 500, 0, { g: grenzeProtokoll })) {
      $app.delete(s)
      sitzungen += 1
    }
  } catch (fehler) {
    console.log('Löschjob Sitzungen:', fehler)
  }

  if (spieltage || protokoll || sitzungen) {
    console.log(`Aufgeräumt: ${spieltage} Spieltage, ${protokoll} Protokolleinträge, ${sitzungen} Sitzungen.`)
  }
})

// ── Gespielte Spieltage von selbst schließen ────────────────────────────────────────────────
// Ein Spieltag, der vorbei ist, soll keine Rückmeldungen mehr annehmen (R-Sperre, T7). Bisher
// war das ein Handgriff des Kapitäns, den er nach dem Spiel — mit anderem im Kopf — machen
// musste. Vergisst er ihn, kann jemand seine Zusage nachträglich ändern.
//
// Die Frist steht in den Einstellungen. 0 heißt aus: Wer bisher von Hand gesperrt hat, soll
// nicht plötzlich Spieltage vorfinden, die sich selbst geschlossen haben.
//
// Stündlich, nicht minütlich: eine Stunde Ungenauigkeit ist bei einer Frist, die in Stunden
// gemessen wird, ohne Belang.
cronAdd('spieltage-sperren', '10 * * * *', () => {
  const u = require(`${__hooks}/utils.js`)

  const stunden = u.einstellungen($app).auto_sperre_stunden
  if (!stunden) return

  const grenze = new Date(Date.now() - stunden * 3600000).toISOString().replace('T', ' ').slice(0, 19)

  let gesperrt = 0
  try {
    for (const s of $app.findRecordsByFilter('fixtures', 'date < {:g} && locked = false', 'date', 200, 0, {
      g: grenze,
    })) {
      s.set('locked', true)
      $app.save(s)
      // Wer den Spieltag geschlossen hat, muss nachvollziehbar bleiben — sonst steht der Kapitän
      // vor einer Sperre, die er sich nicht erklären kann.
      u.protokollieren($app, 'system:auto-sperre', 'fixture.lock', s.id, '', `${stunden} h nach Anwurf`)
      gesperrt += 1
    }
  } catch (fehler) {
    console.log('Automatisches Sperren:', fehler)
  }

  if (gesperrt) console.log(`${gesperrt} Spieltag(e) automatisch gesperrt.`)
})

// ── Erinnerung an den Kapitän (Abschnitt 9) ─────────────────────────────────────────────────
// KEIN WhatsApp — weder offiziell noch über inoffizielle Bibliotheken. Das Sperrrisiko für die
// private Nummer und der Verstoß gegen die Nutzungsbedingungen sind den Komfort nicht wert.
//
// Stattdessen: einmal täglich eine Nachricht an den Kapitän mit fertigem Text zum Kopieren in
// die Gruppe. Ziel ist ntfy (https://ntfy.sh oder selbst gehostet), weil das ohne Konto und
// ohne Bibliothek auskommt — eine HTTP-Anfrage genügt.
//
// Ohne NTFY_URL passiert nichts. Die App soll auch dann laufen, wenn niemand das eingerichtet hat.
cronAdd('erinnerung', '0 18 * * *', () => {
  const ziel = $os.getenv('NTFY_URL')
  if (!ziel) return

  const heute = new Date()
  const anTag = (n) => {
    const d = new Date(heute.getTime() + n * 86400000)
    return d.toISOString().slice(0, 10)
  }

  const zeilen = []
  for (const abstand of [7, 2]) {
    const tag = anTag(abstand)
    let spieltage = []
    try {
      spieltage = $app.findRecordsByFilter('fixtures', 'date >= {:a} && date < {:b} && locked = false', 'date', 20, 0, {
        a: `${tag} 00:00:00`,
        b: `${tag} 23:59:59`,
      })
    } catch (fehler) {
      console.log('Erinnerung:', fehler)
      continue
    }

    for (const s of spieltage) {
      // Abschnitt 12 · Nur die Mannschaft DIESES Spieltags. Ohne den Bezug stünden in der
      // Erinnerung an die Herren die fehlenden Antworten aller sieben Mannschaften — falsch und
      // nebenbei ein Datenleck über Mannschaftsgrenzen hinweg.
      const aktive = $app.findRecordsByFilter('members', 'active = true && team = {:t}', '', 200, 0, {
        t: s.getString('team'),
      })
      const antworten = $app.findRecordsByFilter('responses', 'fixture = {:f}', '', 200, 0, { f: s.id })
      const beantwortet = {}
      for (const a of antworten) beantwortet[a.getString('member')] = a.getString('status')

      const fehlen = aktive.filter((m) => !beantwortet[m.id]).map((m) => m.getString('name'))
      const fahrer = $app.findRecordsByFilter('rides', 'fixture = {:f}', '', 20, 0, { f: s.id })
      // „Es fährt noch niemand" gilt nur, wo jemand fahren soll. Bei einer Anreise mit Bus und
      // Bahn wäre es eine Aufforderung ins Leere.
      const ohneFahrer = !s.getBool('is_home') && !s.getBool('ohne_fahrdienst') && fahrer.length === 0

      // Nur melden, wenn wirklich etwas offen ist — eine Erinnerung, die jeden Tag kommt, liest
      // nach einer Woche niemand mehr.
      if (!fehlen.length && !ohneFahrer) continue

      // Der Mannschaftsname gehört in die Nachricht, sobald es mehr als eine gibt — sonst steht
      // der Kapitän vor „Düsseldorf in 2 Tagen" und weiß nicht, welche seiner Mannschaften.
      const wer = require(`${__hooks}/utils.js`).mannschaft($app, s.getString('team')).name
      const teile = [`${wer} · ${s.getString('opponent_town')} in ${abstand} Tagen:`]
      if (fehlen.length) teile.push(`keine Antwort von ${fehlen.join(', ')}.`)
      if (ohneFahrer) teile.push('Es fährt noch niemand.')
      zeilen.push(teile.join(' '))
    }
  }

  if (!zeilen.length) return

  try {
    $http.send({
      url: ziel,
      method: 'POST',
      body: zeilen.join('\n'),
      headers: { Title: 'Mannschaftsplan', Priority: 'default' },
      timeout: 10,
    })
  } catch (fehler) {
    // Eine gescheiterte Erinnerung ist ärgerlich, aber kein Grund, den Cron abstürzen zu lassen.
    console.log('Erinnerung konnte nicht zugestellt werden:', fehler)
  }
})
