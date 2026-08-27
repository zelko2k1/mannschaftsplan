#!/usr/bin/env node
// Die Testfälle aus Abschnitt 11, soweit sie sich automatisieren lassen. Läuft gegen ein
// laufendes PocketBase — lokal gegen scripts/dev-pb.sh, in der CI gegen ein Wegwerf-PocketBase.
//
//   PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node scripts/api-tests.mjs
//
// Die Tests legen eigene Mitglieder und Spieltage an (Präfix „test-") und räumen sie hinterher
// wieder weg. Vorbereitet werden muss dafür nichts; eine leere Datenbank genügt.
//
// T8, T10, T11 und T12 (Admin-Sperre, Access-Log, WhatsApp-Vorschau, Backup-Restore) stehen
// bewusst nicht hier — die brauchen einen Proxy, einen echten Messenger oder ein Backup und
// bleiben Handprüfungen.

import { randomBytes, createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const BASIS = process.env.PB_URL || 'http://127.0.0.1:8090'
const EMAIL = process.env.PB_SUPERUSER_EMAIL
const PASSWORT = process.env.PB_SUPERUSER_PASSWORD

if (!EMAIL || !PASSWORT) {
  console.error('PB_SUPERUSER_EMAIL und PB_SUPERUSER_PASSWORD fehlen.')
  process.exit(1)
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const neuesToken = () => randomBytes(16).toString('base64url')
const jetzt = () => new Date().toISOString().replace('T', ' ').slice(0, 19)

let adminToken = ''
const aufraeumen = []

async function pb(pfad, optionen = {}) {
  const antwort = await fetch(`${BASIS}${pfad}`, {
    ...optionen,
    headers: {
      'Content-Type': 'application/json',
      ...(adminToken ? { Authorization: adminToken } : {}),
      ...optionen.headers,
    },
  })
  const text = await antwort.text()
  if (!antwort.ok) throw new Error(`${optionen.method || 'GET'} ${pfad} → ${antwort.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

/** Roher Aufruf ohne Admin-Rechte — so ruft ein Mitglied (oder ein Fremder) die App auf. */
function roh(pfad, optionen = {}) {
  return fetch(`${BASIS}${pfad}`, { redirect: 'manual', ...optionen })
}

/** Set-Cookie-Kopfzeilen zu einem Cookie-Objekt eindampfen. Node bringt keinen Cookie-Jar mit. */
function kekse(antwort) {
  const roh = antwort.headers.getSetCookie?.() || []
  const jar = {}
  for (const zeile of roh) {
    const [paar] = zeile.split(';')
    const index = paar.indexOf('=')
    jar[paar.slice(0, index).trim()] = paar.slice(index + 1).trim()
  }
  return { jar, anzahl: roh.length, roh }
}

const alsHeader = (jar) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

// ── Testgerüst ─────────────────────────────────────────────────────────────────────────────
let bestanden = 0
const durchgefallen = []

async function pruefe(nummer, was, fn) {
  try {
    await fn()
    bestanden++
    console.log(`  ✓ ${nummer}  ${was}`)
  } catch (fehler) {
    durchgefallen.push(`${nummer} ${was}: ${fehler.message}`)
    console.log(`  ✗ ${nummer}  ${was}\n      ${fehler.message}`)
  }
}

function gleich(ist, soll, wobei) {
  if (ist !== soll) throw new Error(`${wobei}: erwartet ${JSON.stringify(soll)}, war ${JSON.stringify(ist)}`)
}

/** Für Aussagen, die keinen Vergleichswert haben — „steht drin", „steht nicht drin". */
function stimmt(bedingung, wobei) {
  if (!bedingung) throw new Error(`${wobei}: trifft nicht zu`)
}

// ── Vorbereitung ───────────────────────────────────────────────────────────────────────────
adminToken = (
  await pb('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: EMAIL, password: PASSWORT }),
  })
).token

/**
 * Seit Abschnitt 12 hängt jedes Mitglied und jeder Spieltag an einer Mannschaft — das Schema
 * verlangt es. Die Migration legt aus den bisherigen Einstellungen genau eine an; die nehmen wir.
 * Einmal ermittelt und gemerkt, sonst fragte jeder Testfall neu.
 */
let testTeamId = null
async function testTeam() {
  if (testTeamId) return testTeamId
  const liste = await pb('/api/collections/teams/records?perPage=1&sort=created')
  if (!liste.items.length) throw new Error('Keine Mannschaft vorhanden — läuft die Migration?')
  testTeamId = liste.items[0].id
  return testTeamId
}

/** Eine zweite Mannschaft für die Abschottungstests. Wird am Ende mit aufgeräumt. */
async function zweiteMannschaft() {
  const satz = await pb('/api/collections/teams/records', {
    method: 'POST',
    body: JSON.stringify({ name: `test-Mannschaft-${randomBytes(3).toString('hex')}`, puffer_minuten: 25 }),
  })
  aufraeumen.push(['teams', satz.id])
  return satz
}

async function testMitglied(name, aktiv = true, team = null) {
  const klartext = neuesToken()
  const satz = await pb('/api/collections/members/records', {
    method: 'POST',
    body: JSON.stringify({
      team: team || (await testTeam()),
      name: `test-${name}-${randomBytes(3).toString('hex')}`,
      active: aktiv,
      sort: 99,
      token_hash: sha256(klartext),
      token_issued_at: jetzt(),
    }),
  })
  aufraeumen.push(['members', satz.id])
  return { satz, klartext }
}

async function testSpieltag(eigenschaften = {}) {
  const satz = await pb('/api/collections/fixtures/records', {
    method: 'POST',
    body: JSON.stringify({
      team: eigenschaften.team || (await testTeam()),
      date: jetzt(),
      opponent_club: 'test-Club',
      opponent_town: `test-Ort-${randomBytes(3).toString('hex')}`,
      is_home: false,
      venue: 'test-Halle',
      km: 80,
      meeting_point: 'test-Parkplatz',
      // -1 = erben. Die Route der Kapitänsansicht setzt das selbst; wer wie hier direkt in die
      // Collection schreibt, muss daran denken — 0 hieße „ohne Puffer", nicht „von der
      // Mannschaft".
      tempo_kmh: -1,
      puffer_minuten: -1,
      needed_players: 4,
      locked: false,
      ...eigenschaften,
    }),
  })
  aufraeumen.push(['fixtures', satz.id])
  return satz
}

/** Ruft als angemeldetes Mitglied auf — mit Cookies und der CSRF-Kopfzeile aus R11. */
function alsMitglied(jar) {
  return (pfad, optionen = {}) =>
    roh(pfad, {
      ...optionen,
      headers: {
        'Content-Type': 'application/json',
        Cookie: alsHeader(jar),
        'X-CSRF-Token': jar.dz_csrf,
        ...optionen.headers,
      },
    })
}

/** Meldet sich an und liefert den Cookie-Jar zurück. */
async function anmelden(klartext) {
  const antwort = await roh('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: klartext }),
  })
  return { antwort, ...kekse(antwort) }
}

console.log(`\nTestfälle gegen ${BASIS}\n`)

// ── T13 · GET /j/:token ohne Nebenwirkung (R10) ────────────────────────────────────────────
await pruefe('T13', 'GET /j/<gültig> legt keine Sitzung an und setzt kein Cookie', async () => {
  const { klartext } = await testMitglied('r10')
  const vorher = (await pb('/api/collections/sessions/records?perPage=1')).totalItems

  const antwort = await roh(`/j/${klartext}`)
  gleich(antwort.status, 200, 'Status')
  gleich(kekse(antwort).anzahl, 0, 'Anzahl Set-Cookie')

  const nachher = (await pb('/api/collections/sessions/records?perPage=1')).totalItems
  gleich(nachher, vorher, 'Anzahl Sitzungen')

  const html = await antwort.text()
  if (!html.includes('action="/api/session"')) throw new Error('Formular fehlt in der Seite')
})

await pruefe('T13b', 'GET /j/… antwortet für jedes Token gleich (R6)', async () => {
  const { klartext } = await testMitglied('r6')
  const a = (await (await roh(`/j/${klartext}`)).text()).replaceAll(klartext, 'X')
  const b = (await (await roh('/j/voellig-erfunden')).text()).replaceAll('voellig-erfunden', 'X')
  if (a !== b) throw new Error('Antworten unterscheiden sich — gültige Token wären erkennbar')
})

// ── T1 · Einlösen ──────────────────────────────────────────────────────────────────────────
await pruefe('T1', 'POST /api/session mit gültigem Token → 302, dz_sid gesetzt', async () => {
  const { klartext } = await testMitglied('t1')
  const { antwort, jar } = await anmelden(klartext)

  gleich(antwort.status, 302, 'Status')
  gleich(antwort.headers.get('location'), '/', 'Location')
  if (!jar.dz_sid) throw new Error('dz_sid fehlt')
  if (!jar.dz_csrf) throw new Error('dz_csrf fehlt')
  if (antwort.headers.get('location').includes(klartext)) throw new Error('Token steht in der Ziel-URL')
})

await pruefe('T1b', 'Cookie-Eigenschaften aus R2 stimmen', async () => {
  const { klartext } = await testMitglied('t1b')
  const { roh: zeilen } = await anmelden(klartext)
  const sid = zeilen.find((z) => z.startsWith('dz_sid='))
  const csrf = zeilen.find((z) => z.startsWith('dz_csrf='))

  for (const teil of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=15552000']) {
    if (!sid.includes(teil)) throw new Error(`dz_sid ohne ${teil}: ${sid}`)
  }
  // Das CSRF-Cookie MUSS lesbar sein — sonst kann der Client den Wert nicht zurückschicken (R11).
  if (csrf.includes('HttpOnly')) throw new Error('dz_csrf ist HttpOnly, Double-Submit unmöglich')
  if (!csrf.includes('Secure')) throw new Error('dz_csrf ohne Secure')
})

await pruefe('T1c', 'In der Datenbank steht nur der Hash der Sitzungs-ID (R2)', async () => {
  const { klartext, satz } = await testMitglied('t1c')
  const { jar } = await anmelden(klartext)

  const treffer = await pb(
    `/api/collections/sessions/records?filter=${encodeURIComponent(`member="${satz.id}"`)}`,
  )
  gleich(treffer.totalItems, 1, 'Anzahl Sitzungen')
  gleich(treffer.items[0].sid_hash, sha256(jar.dz_sid), 'sid_hash')
  if (JSON.stringify(treffer.items[0]).includes(jar.dz_sid)) {
    throw new Error('Die Sitzungs-ID steht im Klartext im Datensatz')
  }
})

// ── T2 · Ungültiges Token ──────────────────────────────────────────────────────────────────
await pruefe('T2', 'Ungültiges Token → 200, generische Seite, kein Cookie', async () => {
  const { antwort, anzahl } = await anmelden('gibt-es-nicht-xxxxxxxx')
  gleich(antwort.status, 200, 'Status')
  gleich(anzahl, 0, 'Anzahl Set-Cookie')

  const html = await antwort.text()
  if (/inaktiv|unbekannt|existiert nicht|nicht gefunden/i.test(html)) {
    throw new Error('Die Seite verrät den Grund')
  }
})

await pruefe('T2b', 'Inaktives Mitglied ist von „gibt es nicht" nicht zu unterscheiden (R6)', async () => {
  const { klartext } = await testMitglied('inaktiv', false)
  const inaktiv = await anmelden(klartext)
  const unbekannt = await anmelden('gibt-es-nicht-yyyyyyyy')

  gleich(inaktiv.antwort.status, unbekannt.antwort.status, 'Status')
  gleich(inaktiv.anzahl, 0, 'Anzahl Set-Cookie')
  gleich(await inaktiv.antwort.text(), await unbekannt.antwort.text(), 'Antwortkörper')
})

// ── T3 · Nichts ohne Sitzung ───────────────────────────────────────────────────────────────
await pruefe('T3', 'GET /api/me ohne Cookie → 401, kein Datenleck', async () => {
  const antwort = await roh('/api/me')
  gleich(antwort.status, 401, 'Status')
  const koerper = await antwort.text()
  if (/name|member|token/i.test(koerper)) throw new Error(`Körper verrät zu viel: ${koerper}`)
})

await pruefe('T3b', 'Die Collections selbst sind ohne Superuser dicht', async () => {
  for (const c of ['members', 'fixtures', 'sessions', 'responses', 'rides', 'seat_claims', 'audit_log']) {
    const antwort = await roh(`/api/collections/${c}/records`)
    if (antwort.status !== 403 && antwort.status !== 401) {
      throw new Error(`${c} antwortet mit ${antwort.status} statt 401/403`)
    }
  }
})

// ── T4 · Widerruf (R12) ────────────────────────────────────────────────────────────────────
await pruefe('T4', 'Neues Token tötet den alten Link UND bestehende Sitzungen', async () => {
  const { klartext, satz } = await testMitglied('t4')
  const { jar } = await anmelden(klartext)
  gleich((await roh('/api/me', { headers: { Cookie: alsHeader(jar) } })).status, 200, 'me vor Rotation')

  // Was rotate-token.mjs und später der Knopf „Neues Token" tun: neuer Hash, alle Sitzungen weg.
  const neu = neuesToken()
  await pb(`/api/collections/members/records/${satz.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ token_hash: sha256(neu), token_issued_at: jetzt() }),
  })
  const sitzungen = await pb(
    `/api/collections/sessions/records?filter=${encodeURIComponent(`member="${satz.id}"`)}`,
  )
  for (const s of sitzungen.items) {
    await pb(`/api/collections/sessions/records/${s.id}`, { method: 'DELETE' })
  }

  gleich((await anmelden(klartext)).antwort.status, 200, 'alter Link liefert die Ungültig-Seite')
  gleich((await roh('/api/me', { headers: { Cookie: alsHeader(jar) } })).status, 401, 'alte Sitzung')
  gleich((await anmelden(neu)).antwort.status, 302, 'neuer Link')
})

// ── Abmelden ───────────────────────────────────────────────────────────────────────────────
await pruefe('L1', 'Logout beendet die Sitzung und löscht sie aus der Datenbank', async () => {
  const { klartext, satz } = await testMitglied('logout')
  const { jar } = await anmelden(klartext)

  const antwort = await roh('/api/logout', {
    method: 'POST',
    headers: { Cookie: alsHeader(jar), 'X-CSRF-Token': jar.dz_csrf },
  })
  gleich(antwort.status, 200, 'Status')
  gleich((await roh('/api/me', { headers: { Cookie: alsHeader(jar) } })).status, 401, 'me nach Logout')

  const rest = await pb(
    `/api/collections/sessions/records?filter=${encodeURIComponent(`member="${satz.id}"`)}`,
  )
  gleich(rest.totalItems, 0, 'übrige Sitzungen')
})

// ── GET /api/board ─────────────────────────────────────────────────────────────────────────
await pruefe('B1', 'GET /api/board ohne Cookie → 401', async () => {
  gleich((await roh('/api/board')).status, 401, 'Status')
})

await pruefe('B2', 'Die Abfahrtszeit rechnet das Backend (Abschnitt 6.3)', async () => {
  const { klartext } = await testMitglied('board')
  const { jar } = await anmelden(klartext)
  // 80 km → 80/80*60 + 25 = 85 min → auf 5 gerundet 85 min vor Anwurf.
  const spieltag = await testSpieltag({ km: 80, is_home: false, date: '2026-09-05 19:30:00' })
  const heimspiel = await testSpieltag({ km: 0, is_home: true, date: '2026-09-12 19:00:00' })

  const board = await (await alsMitglied(jar)('/api/board')).json()
  const auswaerts = board.fixtures.find((f) => f.id === spieltag.id)
  const heim = board.fixtures.find((f) => f.id === heimspiel.id)

  const anwurf = new Date(auswaerts.date.replace(' ', 'T'))
  const minuten = (anwurf - new Date(auswaerts.departure)) / 60000
  gleich(minuten, 85, 'Vorlauf in Minuten')
  gleich(heim.departure, null, 'Heimspiel hat keine Abfahrt')

  // Der Treffpunkt reiste lange bis in den Browser und wurde dort fallengelassen. Damit das
  // nicht unbemerkt wieder passiert, steht er jetzt hier.
  gleich(auswaerts.meeting_point, 'test-Parkplatz', 'Treffpunkt im Board')
})

await pruefe('B2b', 'Eine von Hand gesetzte Abfahrt schlägt die Berechnung', async () => {
  const { klartext } = await testMitglied('board-manuell')
  const { jar } = await anmelden(klartext)

  // Dieselben 80 km wie in B2 — die Formel ergäbe 18:05, von Hand steht dort 16:00.
  const spieltag = await testSpieltag({
    km: 80,
    is_home: false,
    date: '2026-09-05 19:30:00',
    departure_manual: '2026-09-05 16:00:00',
  })
  const gerechnet = await testSpieltag({ km: 80, is_home: false, date: '2026-09-05 19:30:00' })

  const board = await (await alsMitglied(jar)('/api/board')).json()
  const vonHand = board.fixtures.find((f) => f.id === spieltag.id)
  const ohne = board.fixtures.find((f) => f.id === gerechnet.id)

  gleich(new Date(vonHand.departure).toISOString(), '2026-09-05T16:00:00.000Z', 'Abfahrt von Hand')
  stimmt(
    new Date(ohne.departure).toISOString() !== '2026-09-05T16:00:00.000Z',
    'Der Spieltag ohne Eintrag übernimmt die Zeit des anderen',
  )

  // Ein Heimspiel hat auch dann keine Abfahrt, wenn jemand eine einträgt — dort fährt niemand
  // gemeinsam los, und eine Zeit ohne Fahrt wäre eine Falschaussage.
  const heimspiel = await testSpieltag({
    is_home: true,
    km: 0,
    date: '2026-09-12 19:00:00',
    departure_manual: '2026-09-12 17:00:00',
  })
  const board2 = await (await alsMitglied(jar)('/api/board')).json()
  gleich(board2.fixtures.find((f) => f.id === heimspiel.id).departure, null, 'Heimspiel bleibt ohne')
})

await pruefe('A8b', 'Der Kapitän kann die Abfahrt setzen und wieder freigeben', async () => {
  const { jar } = await adminAnmelden()
  const ruf = alsKapitaen(jar)
  const spieltag = await testSpieltag({ km: 80, is_home: false, date: '2026-09-05 19:30:00' })

  // Der berechnete Wert wird mitgeliefert, damit die Eingabemaske zeigen kann, was „leer" heißt.
  const vorher = (await (await ruf('/admin/api/fixtures')).json()).items.find((x) => x.id === spieltag.id)
  gleich(vorher.departure_manual, '', 'anfangs nichts von Hand')
  stimmt(!!vorher.departure_berechnet, 'der berechnete Wert fehlt in der Kapitänsansicht')

  gleich(
    (
      await ruf(`/admin/api/fixtures/${spieltag.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ departure_manual: '2026-09-05 16:00:00' }),
      })
    ).status,
    200,
    'setzen',
  )
  const gesetzt = (await (await ruf('/admin/api/fixtures')).json()).items.find((x) => x.id === spieltag.id)
  stimmt(gesetzt.departure_manual.startsWith('2026-09-05 16:00'), `steht: ${gesetzt.departure_manual}`)

  // Und wieder leeren — sonst gäbe es keinen Weg zurück zur Berechnung.
  await ruf(`/admin/api/fixtures/${spieltag.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ departure_manual: '' }),
  })
  const geleert = (await (await ruf('/admin/api/fixtures')).json()).items.find((x) => x.id === spieltag.id)
  gleich(geleert.departure_manual, '', 'wieder leer')
})

// ── T5 · Identität kommt aus der Sitzung, nie aus dem Request (R3) ─────────────────────────
await pruefe('T5', 'Fremdes `member` im Body ändert den EIGENEN Datensatz, nicht das fremde', async () => {
  const ich = await testMitglied('t5-ich')
  const andere = await testMitglied('t5-andere')
  const { jar } = await anmelden(ich.klartext)
  const spieltag = await testSpieltag()

  const antwort = await alsMitglied(jar)(`/api/response/${spieltag.id}`, {
    method: 'PUT',
    // Der Angriff: fremde Mitglieds-ID im Körper mitschicken.
    body: JSON.stringify({ status: 'no', member: andere.satz.id }),
  })
  gleich(antwort.status, 200, 'Status')

  const alle = await pb(
    `/api/collections/responses/records?filter=${encodeURIComponent(`fixture="${spieltag.id}"`)}`,
  )
  gleich(alle.totalItems, 1, 'Anzahl Rückmeldungen')
  gleich(alle.items[0].member, ich.satz.id, 'Betroffenes Mitglied')
  gleich(alle.items[0].status, 'no', 'Status')
})

// ── T6 · Whitelist (R4) ────────────────────────────────────────────────────────────────────
await pruefe('T6', 'Ungültige Werte → 400, und es wird nichts gespeichert', async () => {
  const { klartext } = await testMitglied('t6')
  const { jar } = await anmelden(klartext)
  const spieltag = await testSpieltag()
  const ruf = alsMitglied(jar)

  const faelle = [
    ['status "vielleicht"', `/api/response/${spieltag.id}`, { status: 'vielleicht' }],
    ['status als Zahl', `/api/response/${spieltag.id}`, { status: 1 }],
    ['seats 99', `/api/ride/${spieltag.id}`, { driving: true, seats: 99 }],
    ['seats 0', `/api/ride/${spieltag.id}`, { driving: true, seats: 0 }],
    ['seats 2.5', `/api/ride/${spieltag.id}`, { driving: true, seats: 2.5 }],
    ['seats fehlt', `/api/ride/${spieltag.id}`, { driving: true }],
    ['Auto ohne id', `/api/seat/${spieltag.id}`, { riding: true }],
  ]
  for (const [was, pfad, koerper] of faelle) {
    const antwort = await ruf(pfad, { method: 'PUT', body: JSON.stringify(koerper) })
    gleich(antwort.status, 400, `${was}: Status`)
  }

  for (const c of ['responses', 'rides', 'seat_claims']) {
    const treffer = await pb(
      `/api/collections/${c}/records?filter=${encodeURIComponent(`fixture="${spieltag.id}"`)}`,
    )
    gleich(treffer.totalItems, 0, `${c} ist leer geblieben`)
  }
})

await pruefe('T6b', 'Unbekannter Spieltag → 400, ohne Auskunft warum', async () => {
  const { klartext } = await testMitglied('t6b')
  const { jar } = await anmelden(klartext)
  const antwort = await alsMitglied(jar)('/api/response/gibtesnichtxxxx', {
    method: 'PUT',
    body: JSON.stringify({ status: 'yes' }),
  })
  gleich(antwort.status, 400, 'Status')
})

// ── T7 · Abgeschlossener Spieltag ──────────────────────────────────────────────────────────
await pruefe('T7', 'PUT auf einen gesperrten Spieltag → 403', async () => {
  const { klartext } = await testMitglied('t7')
  const { jar } = await anmelden(klartext)
  const spieltag = await testSpieltag({ locked: true })
  const ruf = alsMitglied(jar)

  for (const [pfad, koerper] of [
    [`/api/response/${spieltag.id}`, { status: 'yes' }],
    [`/api/ride/${spieltag.id}`, { driving: true, seats: 3 }],
    [`/api/seat/${spieltag.id}`, { riding: false }],
  ]) {
    gleich((await ruf(pfad, { method: 'PUT', body: JSON.stringify(koerper) })).status, 403, pfad)
  }
})

// ── R11 · CSRF ─────────────────────────────────────────────────────────────────────────────
await pruefe('C1', 'Schreiben ohne CSRF-Kopfzeile → 403', async () => {
  const { klartext } = await testMitglied('csrf')
  const { jar } = await anmelden(klartext)
  const spieltag = await testSpieltag()

  // Cookies ja, Kopfzeile nein — genau das, was eine fremde Seite zustande brächte.
  const ohne = await roh(`/api/response/${spieltag.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: alsHeader(jar) },
    body: JSON.stringify({ status: 'yes' }),
  })
  gleich(ohne.status, 403, 'ohne Kopfzeile')

  const falsch = await roh(`/api/response/${spieltag.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: alsHeader(jar),
      'X-CSRF-Token': 'ausgedacht',
    },
    body: JSON.stringify({ status: 'yes' }),
  })
  gleich(falsch.status, 403, 'mit falscher Kopfzeile')
})

// ── Fahrdienst ─────────────────────────────────────────────────────────────────────────────
await pruefe('F1', 'Fahren, mitfahren, und das volle Auto meldet 409', async () => {
  const fahrer = await testMitglied('fahrer')
  const eins = await testMitglied('mit1')
  const zwei = await testMitglied('mit2')
  const spieltag = await testSpieltag()

  const fahrerJar = (await anmelden(fahrer.klartext)).jar
  const einsJar = (await anmelden(eins.klartext)).jar
  const zweiJar = (await anmelden(zwei.klartext)).jar

  // Ein Platz, zwei Interessenten.
  gleich(
    (
      await alsMitglied(fahrerJar)(`/api/ride/${spieltag.id}`, {
        method: 'PUT',
        body: JSON.stringify({ driving: true, seats: 1 }),
      })
    ).status,
    200,
    'Fahrer trägt sich ein',
  )

  const board = await (await alsMitglied(einsJar)('/api/board')).json()
  const fahrt = board.fixtures.find((f) => f.id === spieltag.id).rides[0]
  gleich(fahrt.seats, 1, 'Plätze')
  gleich(fahrt.taken, 0, 'belegt')

  gleich(
    (
      await alsMitglied(einsJar)(`/api/seat/${spieltag.id}`, {
        method: 'PUT',
        body: JSON.stringify({ riding: true, ride: fahrt.id }),
      })
    ).status,
    200,
    'erster Mitfahrer',
  )
  gleich(
    (
      await alsMitglied(zweiJar)(`/api/seat/${spieltag.id}`, {
        method: 'PUT',
        body: JSON.stringify({ riding: true, ride: fahrt.id }),
      })
    ).status,
    409,
    'zweiter Mitfahrer stößt auf ein volles Auto',
  )
})

await pruefe('F2', 'Im eigenen Auto mitfahren geht nicht', async () => {
  const fahrer = await testMitglied('selbstfahrer')
  const spieltag = await testSpieltag()
  const jar = (await anmelden(fahrer.klartext)).jar

  await alsMitglied(jar)(`/api/ride/${spieltag.id}`, {
    method: 'PUT',
    body: JSON.stringify({ driving: true, seats: 3 }),
  })
  const board = await (await alsMitglied(jar)('/api/board')).json()
  const fahrt = board.fixtures.find((f) => f.id === spieltag.id).rides[0]

  gleich(
    (
      await alsMitglied(jar)(`/api/seat/${spieltag.id}`, {
        method: 'PUT',
        body: JSON.stringify({ riding: true, ride: fahrt.id }),
      })
    ).status,
    400,
    'Status',
  )
})

await pruefe('F3', 'Plätze unter die Belegung senken → 409 statt jemanden hinauszuwerfen', async () => {
  const fahrer = await testMitglied('schrumpf')
  const einer = await testMitglied('schrumpf-1')
  const zweiter = await testMitglied('schrumpf-2')
  const spieltag = await testSpieltag()
  const fahrerJar = (await anmelden(fahrer.klartext)).jar
  const einerJar = (await anmelden(einer.klartext)).jar
  const zweiterJar = (await anmelden(zweiter.klartext)).jar

  await alsMitglied(fahrerJar)(`/api/ride/${spieltag.id}`, {
    method: 'PUT',
    body: JSON.stringify({ driving: true, seats: 2 }),
  })
  const board = await (await alsMitglied(einerJar)('/api/board')).json()
  const fahrt = board.fixtures.find((f) => f.id === spieltag.id).rides[0]
  for (const jar of [einerJar, zweiterJar]) {
    await alsMitglied(jar)(`/api/seat/${spieltag.id}`, {
      method: 'PUT',
      body: JSON.stringify({ riding: true, ride: fahrt.id }),
    })
  }

  // Auf einen Platz herunter, obwohl zwei mitfahren. Das ginge nur, indem der Server jemanden
  // aus dem Auto wirft — das entscheidet der Fahrer, nicht der Server.
  const antwort = await alsMitglied(fahrerJar)(`/api/ride/${spieltag.id}`, {
    method: 'PUT',
    body: JSON.stringify({ driving: true, seats: 1 }),
  })
  gleich(antwort.status, 409, 'Status')

  // Auf genau die Belegung herunter ist dagegen in Ordnung.
  gleich(
    (
      await alsMitglied(fahrerJar)(`/api/ride/${spieltag.id}`, {
        method: 'PUT',
        body: JSON.stringify({ driving: true, seats: 2 }),
      })
    ).status,
    200,
    'auf die Belegung selbst',
  )
})

await pruefe('F4', 'Fahrt zurückziehen nimmt die Mitfahrer mit', async () => {
  const fahrer = await testMitglied('rueckzug')
  const mit = await testMitglied('rueckzug-mit')
  const spieltag = await testSpieltag()
  const fahrerJar = (await anmelden(fahrer.klartext)).jar
  const mitJar = (await anmelden(mit.klartext)).jar

  await alsMitglied(fahrerJar)(`/api/ride/${spieltag.id}`, {
    method: 'PUT',
    body: JSON.stringify({ driving: true, seats: 3 }),
  })
  const board = await (await alsMitglied(mitJar)('/api/board')).json()
  const fahrt = board.fixtures.find((f) => f.id === spieltag.id).rides[0]
  await alsMitglied(mitJar)(`/api/seat/${spieltag.id}`, {
    method: 'PUT',
    body: JSON.stringify({ riding: true, ride: fahrt.id }),
  })

  await alsMitglied(fahrerJar)(`/api/ride/${spieltag.id}`, {
    method: 'PUT',
    body: JSON.stringify({ driving: false }),
  })

  const uebrig = await pb(
    `/api/collections/seat_claims/records?filter=${encodeURIComponent(`fixture="${spieltag.id}"`)}`,
  )
  gleich(uebrig.totalItems, 0, 'übrige Mitfahrer')
})

// ── Kapitänsansicht ────────────────────────────────────────────────────────────────────────
// Anmerkung zu T8: „/admin von außerhalb des VPN → 404" ist eine Aussage über den Reverse Proxy
// und bleibt eine Handprüfung. Hier steht die Hälfte, die die Anwendung selbst verantwortet:
// ohne Kapitänssitzung antwortet /admin/api mit 404, nicht mit 401 oder 403 (R6).

const ADMIN_ROUTEN = [
  '/admin/api/me',
  '/admin/api/fixtures',
  '/admin/api/members',
  '/admin/api/settings',
  '/admin/api/audit',
  '/admin/api/backups',
  '/admin/api/totp',
]

async function adminAnmelden(passwort = PASSWORT, code = '') {
  const antwort = await roh('/admin/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: passwort, ...(code ? { code } : {}) }),
  })
  return { antwort, ...kekse(antwort) }
}

function alsKapitaen(jar) {
  return (pfad, optionen = {}) =>
    roh(pfad, {
      ...optionen,
      headers: {
        'Content-Type': 'application/json',
        Cookie: alsHeader(jar),
        'X-CSRF-Token': jar.dz_admin_csrf,
        ...optionen.headers,
      },
    })
}

await pruefe('T8a', '/admin/api ohne Kapitänssitzung → 404, nicht 401/403 (R6)', async () => {
  for (const pfad of ADMIN_ROUTEN) {
    gleich((await roh(pfad)).status, 404, pfad)
  }
  // Auch schreibend darf nichts durchkommen.
  gleich(
    (await roh('/admin/api/members', { method: 'POST', body: '{"name":"Eindringling"}' })).status,
    404,
    'POST /admin/api/members',
  )
})

await pruefe('T8b', 'Eine Mitgliedersitzung öffnet die Kapitänsansicht nicht (R5)', async () => {
  const { klartext } = await testMitglied('kein-kapitaen')
  const { jar } = await anmelden(klartext)
  for (const pfad of ADMIN_ROUTEN) {
    gleich((await roh(pfad, { headers: { Cookie: alsHeader(jar) } })).status, 404, pfad)
  }
})

await pruefe('A1', 'Anmelden setzt zwei Cookies mit Path=/admin', async () => {
  const { antwort, jar, roh: zeilen } = await adminAnmelden()
  gleich(antwort.status, 200, 'Status')
  if (!jar.dz_admin) throw new Error('dz_admin fehlt')
  if (!jar.dz_admin_csrf) throw new Error('dz_admin_csrf fehlt')

  const sid = zeilen.find((z) => z.startsWith('dz_admin='))
  for (const teil of ['Path=/admin', 'HttpOnly', 'Secure', 'SameSite=Lax']) {
    if (!sid.includes(teil)) throw new Error(`dz_admin ohne ${teil}: ${sid}`)
  }
  // Path=/admin heißt: der Browser schickt diesen Cookie bei /api/* gar nicht erst mit.
  if (zeilen.find((z) => z.startsWith('dz_admin_csrf=')).includes('HttpOnly')) {
    throw new Error('dz_admin_csrf ist HttpOnly, Double-Submit unmöglich')
  }
})

await pruefe('A2', 'Falsches Passwort und unbekannte Adresse sind ununterscheidbar (R6)', async () => {
  const falsch = await adminAnmelden('ganz-sicher-falsch')
  const unbekannt = await roh('/admin/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'gibtsnicht@example.com', password: 'ganz-sicher-falsch' }),
  })
  gleich(falsch.antwort.status, 401, 'Status falsches Passwort')
  gleich(unbekannt.status, 401, 'Status unbekannte Adresse')
  gleich(await falsch.antwort.text(), await unbekannt.text(), 'Antwortkörper')
  gleich(falsch.anzahl, 0, 'Anzahl Set-Cookie')
})

await pruefe('A3', 'Schreiben ohne CSRF-Kopfzeile → 403 (R11)', async () => {
  const { jar } = await adminAnmelden()
  const ohne = await roh('/admin/api/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: alsHeader(jar) },
    body: JSON.stringify({ name: 'test-ohne-csrf' }),
  })
  gleich(ohne.status, 403, 'Status')
  // Lesen darf weiterhin gehen — die Kopfzeile schützt Änderungen, nicht Abfragen.
  gleich((await roh('/admin/api/members', { headers: { Cookie: alsHeader(jar) } })).status, 200, 'GET')
})

await pruefe('A4', 'Der Token-Hash verlässt den Server nie (R1)', async () => {
  await testMitglied('hash-check')
  const { jar } = await adminAnmelden()
  const koerper = await (await alsKapitaen(jar)('/admin/api/members')).text()
  if (koerper.includes('token_hash')) throw new Error('token_hash steht in der Antwort')
  const liste = JSON.parse(koerper).items
  if (!liste.some((m) => 'hat_token' in m)) throw new Error('hat_token fehlt')
})

await pruefe('A5', '„Neues Token" tötet alten Link und alle Geräte (R12)', async () => {
  const { klartext, satz } = await testMitglied('rotate-admin')
  const mitglied = await anmelden(klartext)
  gleich((await roh('/api/me', { headers: { Cookie: alsHeader(mitglied.jar) } })).status, 200, 'vorher')

  const { jar } = await adminAnmelden()
  const antwort = await alsKapitaen(jar)(`/admin/api/members/${satz.id}/rotate-token`, { method: 'POST' })
  gleich(antwort.status, 200, 'Status')
  const { token: neu, sitzungen_beendet } = await antwort.json()
  if (!neu || neu.length !== 22) throw new Error(`Token hat ${neu?.length} Zeichen statt 22`)
  gleich(sitzungen_beendet, 1, 'beendete Sitzungen')

  gleich((await anmelden(klartext)).antwort.status, 200, 'alter Link liefert die Ungültig-Seite')
  gleich((await roh('/api/me', { headers: { Cookie: alsHeader(mitglied.jar) } })).status, 401, 'alte Sitzung')
  gleich((await anmelden(neu)).antwort.status, 302, 'neuer Link')
})

await pruefe('A6', 'Deaktivieren wirft das Mitglied sofort von allen Geräten', async () => {
  const { klartext, satz } = await testMitglied('deaktivieren')
  const mitglied = await anmelden(klartext)
  gleich((await roh('/api/me', { headers: { Cookie: alsHeader(mitglied.jar) } })).status, 200, 'vorher')

  const { jar } = await adminAnmelden()
  gleich(
    (
      await alsKapitaen(jar)(`/admin/api/members/${satz.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false }),
      })
    ).status,
    200,
    'PATCH',
  )
  gleich((await roh('/api/me', { headers: { Cookie: alsHeader(mitglied.jar) } })).status, 401, 'nachher')
  gleich((await anmelden(klartext)).antwort.status, 200, 'Link liefert die Ungültig-Seite')
})

await pruefe('A7', 'Der Kapitän darf auch abgeschlossene Spieltage korrigieren', async () => {
  const { satz } = await testMitglied('korrektur')
  const spieltag = await testSpieltag({ locked: true })
  const { jar } = await adminAnmelden()

  gleich(
    (
      await alsKapitaen(jar)(`/admin/api/response/${spieltag.id}/${satz.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'yes' }),
      })
    ).status,
    200,
    'Status',
  )
  const treffer = await pb(
    `/api/collections/responses/records?filter=${encodeURIComponent(`fixture="${spieltag.id}"`)}`,
  )
  gleich(treffer.totalItems, 1, 'Anzahl')
  gleich(treffer.items[0].status, 'yes', 'Status im Datensatz')
})

await pruefe('A8', 'Spieltag anlegen, ändern und löschen', async () => {
  const { jar } = await adminAnmelden()
  const ruf = alsKapitaen(jar)

  const angelegt = await ruf('/admin/api/fixtures', {
    method: 'POST',
    body: JSON.stringify({
      // Seit Abschnitt 12 Pflicht. Ein Kapitän bekäme seine eigene zugewiesen; hier meldet sich
      // ein Superuser an, und der muss sagen, für welche Mannschaft.
      team: await testTeam(),
      date: '2026-11-14 19:30:00',
      opponent_town: 'test-Neustadt',
      opponent_club: 'test-Club',
      is_home: false,
      km: 40,
    }),
  })
  gleich(angelegt.status, 200, 'anlegen')
  const { id } = await angelegt.json()

  gleich(
    (await ruf(`/admin/api/fixtures/${id}`, { method: 'PATCH', body: JSON.stringify({ km: 55 }) })).status,
    200,
    'ändern',
  )
  const liste = await (await ruf('/admin/api/fixtures')).json()
  gleich(liste.items.find((s) => s.id === id).km, 55, 'km nach dem Ändern')

  // R4 · Unsinn wird abgewiesen.
  gleich(
    (await ruf(`/admin/api/fixtures/${id}`, { method: 'PATCH', body: JSON.stringify({ km: -5 }) })).status,
    400,
    'negative Entfernung',
  )

  gleich((await ruf(`/admin/api/fixtures/${id}`, { method: 'DELETE' })).status, 200, 'löschen')
})

await pruefe('A9', 'Anzeigename wirkt auf die Einladungsseite und wird escaped', async () => {
  const { jar } = await adminAnmelden()
  const ruf = alsKapitaen(jar)
  const seite = async () => (await roh('/j/beliebiges-token')).text()

  const vorher = (await (await ruf('/admin/api/settings')).json()).anzeigename

  try {
    gleich(
      (await ruf('/admin/api/settings', { method: 'PATCH', body: JSON.stringify({ anzeigename: 'test-DC' }) }))
        .status,
      200,
      'speichern',
    )
    const html = await seite()
    stimmt(
      html.includes('<meta property="og:title" content="test-DC — Termine">'),
      'Name steht in der Linkvorschau',
    )
    stimmt(html.includes('<h1>test-DC</h1>'), 'Name steht als Überschrift')

    // Leer und zu lang werden abgewiesen — sonst stünde die Einladungsseite ohne Überschrift da
    // bzw. die Datenbank lehnte mit einer Meldung ab, die dem Kapitän nichts sagt.
    gleich(
      (await ruf('/admin/api/settings', { method: 'PATCH', body: JSON.stringify({ anzeigename: '  ' }) })).status,
      400,
      'leerer Name',
    )
    gleich(
      (
        await ruf('/admin/api/settings', {
          method: 'PATCH',
          body: JSON.stringify({ anzeigename: 'x'.repeat(61) }),
        })
      ).status,
      400,
      '61 Zeichen',
    )

    // Der Name landet in einem Attributwert. Ein Anführungszeichen darin bräche ohne Escaping
    // aus `content="…"` aus — der Kapitän könnte sich selbst eine Lücke einbauen.
    await ruf('/admin/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ anzeigename: 'test-"><script>alert(1)</script>' }),
    })
    const boese = await seite()
    stimmt(!boese.includes('<script>alert(1)</script>'), 'kein eingeschleustes <script>')
    stimmt(/<meta property="og:title" content="[^"]*&quot;/.test(boese), 'Attribut bleibt heil')
  } finally {
    // Der Anzeigename ist ein einzelner Datensatz und wird nicht wie die übrigen Testdaten am
    // Ende gelöscht — er muss auf den vorgefundenen Wert zurück.
    await ruf('/admin/api/settings', { method: 'PATCH', body: JSON.stringify({ anzeigename: vorher }) })
  }
})

await pruefe('A10', 'Die Fahrzeit-Formel folgt den Einstellungen', async () => {
  const { jar: kapitaen } = await adminAnmelden()
  const ruf = alsKapitaen(kapitaen)
  const vorher = await (await ruf('/admin/api/settings')).json()

  const { klartext } = await testMitglied('formel')
  const { jar } = await anmelden(klartext)
  const spieltag = await testSpieltag({ km: 60, is_home: false, date: '2026-10-03 19:00:00' })

  const vorlauf = async () => {
    const board = await (await alsMitglied(jar)('/api/board')).json()
    const s = board.fixtures.find((f) => f.id === spieltag.id)
    return (new Date(s.date.replace(' ', 'T')) - new Date(s.departure)) / 60000
  }

  try {
    // 60 km bei 60 km/h sind 60 Minuten, plus 10 Minuten Puffer. Seit Abschnitt 12 kommen die
    // beiden Werte aus zwei Quellen: das Tempo gilt für alle, der Puffer hängt an der Mannschaft.
    gleich(
      (
        await ruf('/admin/api/settings', {
          method: 'PATCH',
          body: JSON.stringify({ tempo_kmh: 60 }),
        })
      ).status,
      200,
      'Tempo speichern',
    )
    gleich(
      (
        await ruf(`/admin/api/teams/${await testTeam()}`, {
          method: 'PATCH',
          body: JSON.stringify({ puffer_minuten: 10 }),
        })
      ).status,
      200,
      'Puffer speichern',
    )
    gleich(await vorlauf(), 70, 'Vorlauf bei 60 km/h und 10 min Puffer')

    // Dasselbe Spiel bei halbem Tempo: doppelte Fahrzeit, Puffer unverändert.
    await ruf('/admin/api/settings', { method: 'PATCH', body: JSON.stringify({ tempo_kmh: 30 }) })
    gleich(await vorlauf(), 130, 'Vorlauf bei 30 km/h')

    // Grenzen aus der Migration, hier gespiegelt: sonst lehnte erst die Datenbank ab.
    for (const [feld, wert] of [
      ['tempo_kmh', 19],
      ['tempo_kmh', 201],
      ['auto_sperre_stunden', -1],
      ['auto_sperre_stunden', 169],
      ['tempo_kmh', 80.5],
    ]) {
      gleich(
        (await ruf('/admin/api/settings', { method: 'PATCH', body: JSON.stringify({ [feld]: wert }) })).status,
        400,
        `${feld} = ${wert}`,
      )
    }

    // Dieselbe Grenze an der Mannschaft — sie wohnt jetzt dort.
    for (const wert of [-1, 181]) {
      gleich(
        (
          await ruf(`/admin/api/teams/${await testTeam()}`, {
            method: 'PATCH',
            body: JSON.stringify({ puffer_minuten: wert }),
          })
        ).status,
        400,
        `puffer_minuten = ${wert}`,
      )
    }
  } finally {
    await ruf('/admin/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        tempo_kmh: vorher.tempo_kmh,
        auto_sperre_stunden: vorher.auto_sperre_stunden,
      }),
    })
    await ruf(`/admin/api/teams/${await testTeam()}`, {
      method: 'PATCH',
      body: JSON.stringify({ puffer_minuten: 25 }),
    })
  }
})

await pruefe('A11', 'Impressum und Datenschutz: eigene Seiten, ohne Anmeldung, ohne HTML', async () => {
  const { jar } = await adminAnmelden()
  const ruf = alsKapitaen(jar)
  const vorher = await (await ruf('/admin/api/settings')).json()

  try {
    // Leer heißt: es gibt die Seite nicht. Ein leeres Impressum täuscht Vollständigkeit vor.
    await ruf('/admin/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ impressum: '', datenschutz: '' }),
    })
    gleich((await roh('/impressum')).status, 404, 'leeres Impressum → 404')
    gleich((await roh('/datenschutz')).status, 404, 'leerer Datenschutz → 404')
    stimmt(!(await (await roh('/j/beliebiges-token')).text()).includes('/impressum'), 'kein Link im Fuß')

    gleich(
      (
        await ruf('/admin/api/settings', {
          method: 'PATCH',
          body: JSON.stringify({
            impressum: 'test-Verein\nMusterweg 1\n\n<b>nicht fett</b>',
            datenschutz: 'test-Wir speichern Namen und Zusagen.',
          }),
        })
      ).status,
      200,
      'speichern',
    )

    // OHNE Sitzung erreichbar — ein Impressum hinter der Anmeldung erfüllt seinen Zweck nicht.
    const seite = await roh('/impressum')
    gleich(seite.status, 200, 'Impressum ohne Anmeldung')
    const html = await seite.text()
    stimmt(html.includes('test-Verein'), 'Text steht auf der Seite')
    stimmt(html.includes('&lt;b&gt;nicht fett&lt;/b&gt;'), 'HTML wird angezeigt, nicht ausgewertet')
    stimmt(!html.includes('<b>nicht fett</b>'), 'kein ausgewertetes HTML')

    gleich((await roh('/datenschutz')).status, 200, 'Datenschutz ohne Anmeldung')

    // Jetzt verlinkt der Fuß der Einladungsseite auf beide.
    const einladung = await (await roh('/j/beliebiges-token')).text()
    stimmt(einladung.includes('href="/impressum"'), 'Link auf das Impressum')
    stimmt(einladung.includes('href="/datenschutz"'), 'Link auf den Datenschutz')

    // Zu lang wird abgewiesen, statt dass die Datenbank es tut.
    gleich(
      (await ruf('/admin/api/settings', { method: 'PATCH', body: JSON.stringify({ impressum: 'x'.repeat(8001) }) }))
        .status,
      400,
      '8001 Zeichen',
    )

    // Im Protokoll steht die Länge, nicht der Text — sonst stünde er dort in voller Länge.
    const protokoll = await (await ruf('/admin/api/audit?limit=50')).json()
    const zeile = protokoll.items.find((z) => z.action === 'settings.update' && z.target === 'impressum')
    stimmt(!!zeile && !zeile.new_value.includes('Musterweg'), 'Protokoll ohne den Textinhalt')
  } finally {
    await ruf('/admin/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ impressum: vorher.impressum, datenschutz: vorher.datenschutz }),
    })
  }
})

// ── T9 · MUSS ALS LETZTES LAUFEN ───────────────────────────────────────────────────────────
// Die Sperre gilt 15 Minuten für diese IP und würde jede weitere Anmeldung blockieren. Der
// Zähler liegt im Arbeitsspeicher: ein Neustart von PocketBase räumt ihn weg.
// ── Sicherungen (Abschnitt 7.4) ────────────────────────────────────────────────────────────
// Der Weg, den ein Kapitän ohne SSH geht: erstellen, herunterladen, zurückgeben, wegräumen.
// Das Zurückspielen selbst steht NICHT hier — es ersetzt die Datenbank und startet den Prozess
// neu. Geprüft wird stattdessen, dass die Absicherungen davor halten.

await pruefe('T14', 'Sicherung erstellen, auflisten, herunterladen', async () => {
  const { jar } = await adminAnmelden()
  const ruf = alsKapitaen(jar)

  const erzeugt = await ruf('/admin/api/backup', { method: 'POST' })
  gleich(erzeugt.status, 200, 'POST /admin/api/backup')
  const name = (await erzeugt.json()).name
  stimmt(/^pb_backup_manuell_\d{8}_\d{6}\.zip$/.test(name), `Dateiname unerwartet: ${name}`)

  const liste = await (await ruf('/admin/api/backups')).json()
  stimmt(liste.items.some((x) => x.name === name), 'Die neue Sicherung fehlt in der Liste')
  stimmt(
    liste.items.every((x) => x.name.endsWith('.zip')),
    'In der Liste stehen Dateien, die keine Sicherung sind',
  )

  const datei = await ruf(`/admin/api/backup/${name}`)
  gleich(datei.status, 200, 'GET Download')
  const bytes = new Uint8Array(await datei.arrayBuffer())
  stimmt(bytes.length > 1000, `Datei ist nur ${bytes.length} Bytes groß`)
  stimmt(bytes[0] === 0x50 && bytes[1] === 0x4b, 'Die Datei beginnt nicht mit der ZIP-Signatur')

  gleich((await ruf(`/admin/api/backup/${name}`, { method: 'DELETE' })).status, 200, 'DELETE')
  const danach = await (await ruf('/admin/api/backups')).json()
  stimmt(!danach.items.some((x) => x.name === name), 'Die Sicherung ist nach dem Löschen noch da')
})

await pruefe('T14b', 'Zurückgegebene Datei landet wieder im Bestand', async () => {
  const { jar } = await adminAnmelden()
  const ruf = alsKapitaen(jar)

  const name = (await (await ruf('/admin/api/backup', { method: 'POST' })).json()).name
  const bytes = new Uint8Array(await (await ruf(`/admin/api/backup/${name}`)).arrayBuffer())
  await ruf(`/admin/api/backup/${name}`, { method: 'DELETE' })

  // Multipart: KEIN Content-Type von Hand setzen, sonst fehlt die Formulargrenze.
  const formular = new FormData()
  formular.append('datei', new Blob([bytes]), name)
  const hoch = await roh('/admin/api/backup/upload', {
    method: 'POST',
    headers: { Cookie: alsHeader(jar), 'X-CSRF-Token': jar.dz_admin_csrf },
    body: formular,
  })
  gleich(hoch.status, 200, 'POST /admin/api/backup/upload')

  const liste = await (await ruf('/admin/api/backups')).json()
  stimmt(liste.items.some((x) => x.name === name), 'Die zurückgegebene Datei fehlt im Bestand')

  await ruf(`/admin/api/backup/${name}`, { method: 'DELETE' })
})

await pruefe('T14c', 'Nur Sicherungsdateien werden angenommen', async () => {
  const { jar } = await adminAnmelden()

  const formular = new FormData()
  formular.append('datei', new Blob([new Uint8Array([1, 2, 3])]), 'schad.sh')
  const antwort = await roh('/admin/api/backup/upload', {
    method: 'POST',
    headers: { Cookie: alsHeader(jar), 'X-CSRF-Token': jar.dz_admin_csrf },
    body: formular,
  })
  gleich(antwort.status, 400, 'Status für eine Datei ohne .zip')

  const liste = await (await alsKapitaen(jar)('/admin/api/backups')).json()
  stimmt(!liste.items.some((x) => x.name.includes('schad')), 'Die abgelehnte Datei liegt trotzdem da')
})

await pruefe('T14d', 'Zurückspielen ohne abgetippten Namen passiert nicht', async () => {
  const { jar } = await adminAnmelden()
  const ruf = alsKapitaen(jar)

  const name = (await (await ruf('/admin/api/backup', { method: 'POST' })).json()).name
  try {
    gleich(
      (await ruf(`/admin/api/backup/${name}/restore`, { method: 'POST', body: '{}' })).status,
      400,
      'ohne Bestätigung',
    )
    gleich(
      (
        await ruf(`/admin/api/backup/${name}/restore`, {
          method: 'POST',
          body: JSON.stringify({ bestaetigung: 'etwas-anderes.zip' }),
        })
      ).status,
      400,
      'mit falscher Bestätigung',
    )
    gleich(
      (
        await ruf('/admin/api/backup/gibtsnicht.zip/restore', {
          method: 'POST',
          body: JSON.stringify({ bestaetigung: 'gibtsnicht.zip' }),
        })
      ).status,
      404,
      'auf eine Datei, die es nicht gibt',
    )
  } finally {
    await ruf(`/admin/api/backup/${name}`, { method: 'DELETE' })
  }
})

// ── Zweiter Faktor (Abschnitt 9) ───────────────────────────────────────────────────────────
// `totp.js` rechnet SHA1 und HMAC-SHA1 selbst, weil $security beides nicht anbietet und RFC 6238
// es verlangt. Deshalb steht hier zuerst der Nachweis gegen die veröffentlichten Testvektoren:
// Stimmt einer davon nicht, ist jede weitere Aussage über den Login wertlos.

const totp = (() => {
  // Die Hook-Laufzeit stellt $security bereit, node nicht. Für die reinen Rechenfunktionen
  // genügt eine Attrappe.
  globalThis.$security ??= { randomStringWithAlphabet: () => '', equal: (a, b) => a === b }
  return createRequire(import.meta.url)(
    new URL('../pocketbase/pb_hooks/totp.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  )
})()

const alsBytes = (s) => Array.from(s, (c) => c.charCodeAt(0))
const alsHex = (b) => b.map((x) => x.toString(16).padStart(2, '0')).join('')

await pruefe('T15', 'SHA1, HMAC-SHA1 und TOTP stimmen mit den RFC-Vektoren überein', async () => {
  // RFC 3174
  gleich(alsHex(totp.sha1([])), 'da39a3ee5e6b4b0d3255bfef95601890afd80709', 'SHA1("")')
  gleich(alsHex(totp.sha1(alsBytes('abc'))), 'a9993e364706816aba3e25717850c26c9cd0d89d', 'SHA1("abc")')
  gleich(
    alsHex(totp.sha1(alsBytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
    '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    'SHA1(56 Zeichen)',
  )

  // RFC 2202
  gleich(
    alsHex(totp.hmacSha1(new Array(20).fill(0x0b), alsBytes('Hi There'))),
    'b617318655057264e28bc0b6fb378c8ef146be00',
    'HMAC Fall 1',
  )
  gleich(
    alsHex(totp.hmacSha1(alsBytes('Jefe'), alsBytes('what do ya want for nothing?'))),
    'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79',
    'HMAC Fall 2',
  )
  gleich(
    alsHex(totp.hmacSha1(new Array(80).fill(0xaa), alsBytes('Test Using Larger Than Block-Size Key - Hash Key First'))),
    'aa4ae5e15272d00e95705637ce8a3b55ed402112',
    'HMAC mit überlangem Schlüssel',
  )

  // RFC 6238 — das Geheimnis des RFC in Base32, und damit zugleich die Base32-Prüfung.
  const g = totp.base32Kodieren(alsBytes('12345678901234567890'))
  gleich(g, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'Base32 des RFC-Geheimnisses')
  for (const [zeit, acht] of [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ]) {
    gleich(totp.codeFuer(g, Math.floor(zeit / 30)), acht.slice(2), `TOTP bei T=${zeit}`)
  }
})

/** Merkt den Datensatz fürs Aufräumen vor, damit ein zweiter Testlauf nicht am Code scheitert. */
async function totpAufraeumenVormerken() {
  const liste = await pb('/api/collections/admin_totp/records?perPage=200')
  for (const satz of liste.items) {
    if (!aufraeumen.some(([c, id]) => c === 'admin_totp' && id === satz.id)) {
      aufraeumen.push(['admin_totp', satz.id])
    }
  }
}

/** Entfernt einen vorhandenen zweiten Faktor an der Oberfläche vorbei — für saubere Startlagen. */
async function totpWegraeumen() {
  const liste = await pb('/api/collections/admin_totp/records?perPage=200')
  for (const satz of liste.items) {
    await pb(`/api/collections/admin_totp/records/${satz.id}`, { method: 'DELETE' })
  }
}

const totpSchritt = () => Math.floor(Date.now() / 30000)

await pruefe('T15b', 'Einrichten gilt erst, wenn ein Code gestimmt hat', async () => {
  await totpWegraeumen()
  const { jar } = await adminAnmelden()
  const ruf = alsKapitaen(jar)

  gleich(JSON.stringify(await (await ruf('/admin/api/totp')).json()), '{"aktiv":false,"ausstehend":false}', 'Anfangslage')

  const start = await (await ruf('/admin/api/totp', { method: 'POST' })).json()
  await totpAufraeumenVormerken()
  gleich(start.geheimnis.length, 32, 'Länge des Geheimnisses')
  stimmt(start.uri.includes('algorithm=SHA1'), 'Die URI nennt SHA1 nicht')

  // Solange nicht bestätigt, darf der Login nichts verlangen — sonst sperrt sich aus, wer die
  // Einrichtung abbricht.
  gleich(
    JSON.stringify(await (await ruf('/admin/api/totp')).json()),
    '{"aktiv":false,"ausstehend":true}',
    'Zwischenstand',
  )
  gleich((await adminAnmelden()).antwort.status, 200, 'Login bei unbestätigter Einrichtung')

  gleich(
    (await ruf('/admin/api/totp/confirm', { method: 'POST', body: JSON.stringify({ code: '000000' }) })).status,
    400,
    'Bestätigen mit falschem Code',
  )
  gleich(
    (
      await ruf('/admin/api/totp/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: totp.codeFuer(start.geheimnis, totpSchritt()) }),
      })
    ).status,
    200,
    'Bestätigen mit richtigem Code',
  )
  gleich(JSON.stringify(await (await ruf('/admin/api/totp')).json()), '{"aktiv":true,"ausstehend":false}', 'Endstand')

  // Das Bestätigen hat den aktuellen Schritt verbraucht; der nächste liegt noch in der Toleranz.
  gleich(
    (await ruf('/admin/api/totp', { method: 'DELETE', body: '{}' })).status,
    400,
    'Abschalten ohne Code',
  )
  gleich(
    (
      await ruf('/admin/api/totp', {
        method: 'DELETE',
        body: JSON.stringify({ code: totp.codeFuer(start.geheimnis, totpSchritt() + 1) }),
      })
    ).status,
    200,
    'Abschalten mit Code',
  )
})

await pruefe('T15c', 'Der Login verlangt den Code und nimmt ihn nur einmal', async () => {
  await totpWegraeumen()
  const { jar } = await adminAnmelden()
  const ruf = alsKapitaen(jar)

  const start = await (await ruf('/admin/api/totp', { method: 'POST' })).json()
  await totpAufraeumenVormerken()
  await ruf('/admin/api/totp/confirm', {
    method: 'POST',
    body: JSON.stringify({ code: totp.codeFuer(start.geheimnis, totpSchritt()) }),
  })

  const ohne = await adminAnmelden()
  gleich(ohne.antwort.status, 401, 'Login ohne Code')
  gleich(ohne.anzahl, 0, 'Set-Cookie ohne Code')
  const koerperOhne = await ohne.antwort.json()
  stimmt(koerperOhne.mfa === true, 'Die Antwort sagt dem Client nicht, dass ein Code fehlt')

  const falsch = await adminAnmelden(PASSWORT, '000000')
  gleich(falsch.antwort.status, 401, 'Login mit falschem Code')
  gleich(falsch.anzahl, 0, 'Set-Cookie bei falschem Code')

  // Der Schritt von der Bestätigung ist verbraucht — der nächste gilt.
  const gut = totp.codeFuer(start.geheimnis, totpSchritt() + 1)
  const mit = await adminAnmelden(PASSWORT, gut)
  gleich(mit.antwort.status, 200, 'Login mit gültigem Code')

  // Wiedervorlage desselben Codes: Wer beim Eintippen zusieht, soll ihn nicht nachnutzen können.
  gleich((await adminAnmelden(PASSWORT, gut)).antwort.status, 401, 'derselbe Code ein zweites Mal')

  await totpWegraeumen()
  gleich((await adminAnmelden()).antwort.status, 200, 'Login wieder ohne Code')
})

// ── Abschottung zwischen Mannschaften (Abschnitt 12) ───────────────────────────────────────
// Der teuerste Fehler dieses Umbaus wäre, dass eine Mannschaft die andere sieht. Er passiert
// nicht durch böse Absicht, sondern durch eine vergessene Einschränkung in einer von 41
// Abfragen. Deshalb steht er hier — auf beiden Seiten, Mitglied wie Kapitän.

await pruefe('B3', 'Ein Mitglied sieht ausschließlich seine eigene Mannschaft', async () => {
  const fremde = await zweiteMannschaft()

  const meins = await testMitglied('b3-eigen')
  const fremd = await testMitglied('b3-fremd', true, fremde.id)
  const eigenerSpieltag = await testSpieltag({ opponent_town: 'test-Eigen' })
  const fremderSpieltag = await testSpieltag({ team: fremde.id, opponent_town: 'test-Fremd' })

  const { jar } = await anmelden(meins.klartext)
  const board = await (await alsMitglied(jar)('/api/board')).json()

  stimmt(
    board.fixtures.some((f) => f.id === eigenerSpieltag.id),
    'Der eigene Spieltag fehlt im Aushang',
  )
  stimmt(
    !board.fixtures.some((f) => f.id === fremderSpieltag.id),
    'Der Spieltag der anderen Mannschaft steht im Aushang',
  )
  // `members` ist eine Liste, kein Objekt — die Namensliste des Aushangs.
  stimmt(
    board.members.some((m) => m.id === meins.satz.id),
    'Das eigene Mitglied fehlt in der Namensliste',
  )
  stimmt(
    !board.members.some((m) => m.id === fremd.satz.id),
    'Ein Mitglied der anderen Mannschaft steht in der Namensliste',
  )

  // Und schreiben erst recht nicht. Dieselbe Antwort wie „gibt es nicht" (R6) — sonst ließe sich
  // durch Ausprobieren herausfinden, welche IDs zu anderen Mannschaften gehören.
  for (const [pfad, koerper] of [
    [`/api/response/${fremderSpieltag.id}`, { status: 'yes' }],
    [`/api/ride/${fremderSpieltag.id}`, { seats: 3 }],
  ]) {
    const antwort = await alsMitglied(jar)(pfad, { method: 'PUT', body: JSON.stringify(koerper) })
    gleich(antwort.status, 400, `PUT ${pfad}`)
  }

  // Gegenprobe: Auf dem EIGENEN Spieltag geht dasselbe.
  gleich(
    (
      await alsMitglied(jar)(`/api/response/${eigenerSpieltag.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'yes' }),
      })
    ).status,
    200,
    'eigener Spieltag',
  )
})

await pruefe('T16', 'Ein Kapitän sieht und ändert nur seine eigene Mannschaft', async () => {
  const fremde = await zweiteMannschaft()
  const eigenes = await testTeam()

  const meinMitglied = await testMitglied('t16-eigen')
  const fremdesMitglied = await testMitglied('t16-fremd', true, fremde.id)
  const meinSpieltag = await testSpieltag({ opponent_town: 'test-t16-eigen' })
  const fremderSpieltag = await testSpieltag({ team: fremde.id, opponent_town: 'test-t16-fremd' })

  // Konto anlegen — das darf nur der Gesamt-Admin, hier also der Superuser.
  const { jar: chef } = await adminAnmelden()
  const alsChef = alsKapitaen(chef)
  const neu = await (
    await alsChef('/admin/api/verwalter', {
      method: 'POST',
      body: JSON.stringify({
        email: `test-kapitaen-${randomBytes(4).toString('hex')}@example.org`,
        rolle: 'kapitaen',
        team: eigenes,
      }),
    })
  ).json()
  aufraeumen.push(['verwalter', neu.id])
  gleich(neu.passwort.length, 16, 'Das Passwort kommt genau einmal zurück')

  // Anmelden als Kapitän.
  const antwort = await roh('/admin/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: neu.email, password: neu.passwort }),
  })
  gleich(antwort.status, 200, 'Kapitän meldet sich an')
  const ruf = alsKapitaen(kekse(antwort).jar)

  const ich = await (await ruf('/admin/api/me')).json()
  gleich(ich.rolle, 'kapitaen', 'Rolle')
  gleich(ich.teams.length, 1, 'sichtbare Mannschaften')

  // Lesen: nur die eigene — auch wenn er ausdrücklich nach der fremden fragt. Der Wunsch aus dem
  // Request wird für einen Kapitän gar nicht erst gelesen (dieselbe Regel wie R3).
  for (const abfrage of ['', `?team=${fremde.id}`]) {
    const s = await (await ruf(`/admin/api/fixtures${abfrage}`)).json()
    stimmt(
      s.items.some((x) => x.id === meinSpieltag.id) && !s.items.some((x) => x.id === fremderSpieltag.id),
      `Spieltagliste bei "${abfrage}"`,
    )
    const m = await (await ruf(`/admin/api/members${abfrage}`)).json()
    stimmt(
      m.items.some((x) => x.id === meinMitglied.satz.id) &&
        !m.items.some((x) => x.id === fremdesMitglied.satz.id),
      `Mitgliederliste bei "${abfrage}"`,
    )
  }

  // Schreiben: nichts Fremdes.
  for (const [was, pfad, optionen] of [
    ['fremden Spieltag ändern', `/admin/api/fixtures/${fremderSpieltag.id}`, { method: 'PATCH', body: '{"km":5}' }],
    ['fremden Spieltag löschen', `/admin/api/fixtures/${fremderSpieltag.id}`, { method: 'DELETE' }],
    ['fremdes Mitglied ändern', `/admin/api/members/${fremdesMitglied.satz.id}`, { method: 'PATCH', body: '{"name":"X"}' }],
    ['fremdes Token neu', `/admin/api/members/${fremdesMitglied.satz.id}/rotate-token`, { method: 'POST' }],
    ['fremde Rückmeldung', `/admin/api/response/${meinSpieltag.id}/${fremdesMitglied.satz.id}`, { method: 'PUT', body: '{"status":"yes"}' }],
    ['fremde Mannschaft umbenennen', `/admin/api/teams/${fremde.id}`, { method: 'PATCH', body: '{"name":"Weg"}' }],
  ]) {
    gleich((await ruf(pfad, optionen)).status, 400, was)
  }

  // Und ein Mitglied, das er in die fremde Mannschaft schmuggeln will, landet in seiner eigenen.
  const geschmuggelt = await (
    await ruf('/admin/api/members', {
      method: 'POST',
      body: JSON.stringify({ name: `test-schmuggel-${randomBytes(3).toString('hex')}`, team: fremde.id }),
    })
  ).json()
  aufraeumen.push(['members', geschmuggelt.id])
  const geprueft = await pb(`/api/collections/members/records/${geschmuggelt.id}`)
  gleich(geprueft.team, eigenes, 'Die fremde Mannschaft im Rumpf wird nicht gelesen')

  // Zentrales bleibt zu — und zwar mit 404, nicht 403: Er soll nicht einmal erfahren, dass es
  // hier etwas gibt (R6).
  for (const [was, pfad, optionen] of [
    ['Einstellungen ändern', '/admin/api/settings', { method: 'PATCH', body: '{"tempo_kmh":90}' }],
    ['Sicherungen auflisten', '/admin/api/backups', {}],
    ['Sicherung erstellen', '/admin/api/backup', { method: 'POST' }],
    ['Verwalter auflisten', '/admin/api/verwalter', {}],
    ['Mannschaft anlegen', '/admin/api/teams', { method: 'POST', body: '{"name":"test-Neu"}' }],
  ]) {
    gleich((await ruf(pfad, optionen)).status, 404, was)
  }

  // Was er darf: seine eigene Mannschaft benennen — das ist „die Einstellung der Mannschaft".
  gleich(
    (await ruf(`/admin/api/teams/${eigenes}`, { method: 'PATCH', body: '{"puffer_minuten":30}' })).status,
    200,
    'eigene Mannschaft ändern',
  )
  await ruf(`/admin/api/teams/${eigenes}`, { method: 'PATCH', body: '{"puffer_minuten":25}' })

  // Einstellungen LESEN darf er — Impressum und Datenschutz sind keine Geheimnisse.
  gleich((await ruf('/admin/api/settings')).status, 200, 'Einstellungen lesen')
})

await pruefe('T16b', 'Eine Mannschaft mit Inhalt lässt sich nicht auflösen', async () => {
  const { jar } = await adminAnmelden()
  const ruf = alsKapitaen(jar)

  const leere = await zweiteMannschaft()
  gleich((await ruf(`/admin/api/teams/${leere.id}`, { method: 'DELETE' })).status, 200, 'leere Mannschaft')

  const voll = await zweiteMannschaft()
  await testMitglied('t16b', true, voll.id)
  gleich(
    (await ruf(`/admin/api/teams/${voll.id}`, { method: 'DELETE' })).status,
    409,
    'Mannschaft mit Mitgliedern',
  )
})

await pruefe('A10b', 'Tempo und Puffer lassen sich am einzelnen Spieltag übergehen', async () => {
  const { jar: kapitaen } = await adminAnmelden()
  const ruf = alsKapitaen(kapitaen)
  const { klartext } = await testMitglied('a10b')
  const { jar } = await anmelden(klartext)

  // Mannschaft auf 20 Minuten Puffer, zentral 80 km/h. 80 km → 60 min + 20 = 80.
  await ruf('/admin/api/settings', { method: 'PATCH', body: JSON.stringify({ tempo_kmh: 80 }) })
  await ruf(`/admin/api/teams/${await testTeam()}`, {
    method: 'PATCH',
    body: JSON.stringify({ puffer_minuten: 20 }),
  })

  const spieltag = await testSpieltag({ km: 80, is_home: false, date: '2026-10-10 19:00:00' })
  const vorlauf = async () => {
    const board = await (await alsMitglied(jar)('/api/board')).json()
    const s = board.fixtures.find((f) => f.id === spieltag.id)
    return (new Date(s.date.replace(' ', 'T')) - new Date(s.departure)) / 60000
  }

  try {
    gleich(await vorlauf(), 80, 'geerbt: 80 km/h und 20 min')

    // Nur für diesen Spieltag: halbes Tempo. 80 km bei 40 km/h sind 120 min, plus 20 = 140.
    gleich(
      (await ruf(`/admin/api/fixtures/${spieltag.id}`, { method: 'PATCH', body: '{"tempo_kmh":40}' })).status,
      200,
      'Tempo setzen',
    )
    gleich(await vorlauf(), 140, 'eigenes Tempo')

    // Und ein eigener Puffer von 0 — die Null muss hier „keine Rüstzeit" heißen und nicht
    // „erben", sonst wäre der Wunsch nicht ausdrückbar.
    gleich(
      (await ruf(`/admin/api/fixtures/${spieltag.id}`, { method: 'PATCH', body: '{"puffer_minuten":0}' })).status,
      200,
      'Puffer 0 setzen',
    )
    gleich(await vorlauf(), 120, 'eigener Puffer von 0')

    // Zurück auf erben.
    await ruf(`/admin/api/fixtures/${spieltag.id}`, {
      method: 'PATCH',
      body: '{"tempo_kmh":-1,"puffer_minuten":-1}',
    })
    gleich(await vorlauf(), 80, 'wieder geerbt')

    // Grenzen — und -1 muss ausdrücklich durchkommen.
    for (const [koerper, soll] of [
      ['{"tempo_kmh":19}', 400],
      ['{"tempo_kmh":201}', 400],
      ['{"puffer_minuten":-2}', 400],
      ['{"puffer_minuten":181}', 400],
      ['{"tempo_kmh":-1}', 200],
    ]) {
      gleich(
        (await ruf(`/admin/api/fixtures/${spieltag.id}`, { method: 'PATCH', body: koerper })).status,
        soll,
        koerper,
      )
    }

    // Die Kapitänsansicht liefert mit, was tatsächlich gilt — sonst müsste der Browser rechnen.
    const liste = await (await ruf('/admin/api/fixtures')).json()
    const x = liste.items.find((f) => f.id === spieltag.id)
    gleich(x.tempo_effektiv, 80, 'tempo_effektiv')
    gleich(x.puffer_effektiv, 20, 'puffer_effektiv')
  } finally {
    await ruf(`/admin/api/teams/${await testTeam()}`, {
      method: 'PATCH',
      body: JSON.stringify({ puffer_minuten: 25 }),
    })
  }
})

await pruefe('T17', 'Der Gesamt-Admin sieht den zweiten Faktor der Kapitäne und kann ihn abschalten', async () => {
  const { jar } = await adminAnmelden()
  const ruf = alsKapitaen(jar)

  const konto = await (
    await ruf('/admin/api/verwalter', {
      method: 'POST',
      body: JSON.stringify({
        email: `test-t17-${randomBytes(4).toString('hex')}@example.org`,
        rolle: 'kapitaen',
        team: await testTeam(),
      }),
    })
  ).json()
  aufraeumen.push(['verwalter', konto.id])

  const finde = async () =>
    (await (await ruf('/admin/api/verwalter')).json()).items.find((v) => v.id === konto.id)

  gleich((await finde()).totp, false, 'anfangs kein zweiter Faktor')

  // Der Kapitän richtet ihn selbst ein — der Gesamt-Admin kann das nicht für ihn tun, sonst
  // liefe das Geheimnis über dessen Bildschirm.
  const anmeldung = await roh('/admin/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: konto.email, password: konto.passwort }),
  })
  const alsKapitaenSelbst = alsKapitaen(kekse(anmeldung).jar)
  const start = await (await alsKapitaenSelbst('/admin/api/totp', { method: 'POST' })).json()
  await alsKapitaenSelbst('/admin/api/totp/confirm', {
    method: 'POST',
    body: JSON.stringify({ code: totp.codeFuer(start.geheimnis, Math.floor(Date.now() / 30000)) }),
  })

  gleich((await finde()).totp, true, 'nach der Einrichtung sichtbar')

  // Und der Ausweg bei verlorenem Handy.
  gleich(
    (await ruf(`/admin/api/verwalter/${konto.id}/totp`, { method: 'DELETE' })).status,
    200,
    'abschalten',
  )
  gleich((await finde()).totp, false, 'danach wieder aus')

  // Es steht im Protokoll — eine Schwächung, die nachvollziehbar sein muss.
  const protokoll = await (await ruf('/admin/api/audit?limit=200')).json()
  stimmt(
    protokoll.items.some((z) => z.action === 'verwalter.totp.off'),
    'Das Abschalten steht nicht im Protokoll',
  )
})

await pruefe('T9', '6× falsches Passwort → gesperrt, auch für das richtige', async () => {
  let letzter = null
  for (let i = 0; i < 6; i++) letzter = (await adminAnmelden('immer-falsch')).antwort
  gleich(letzter.status, 429, 'Status nach dem sechsten Versuch')

  // Der entscheidende Teil: mit dem RICHTIGEN Passwort kommt man jetzt auch nicht mehr rein.
  // Eine Sperre, die sich durch einen Treffer aufheben ließe, wäre keine.
  const mitRichtigem = await adminAnmelden()
  gleich(mitRichtigem.antwort.status, 429, 'Status mit richtigem Passwort')
  gleich(mitRichtigem.anzahl, 0, 'Anzahl Set-Cookie')
})

// ── Aufräumen ──────────────────────────────────────────────────────────────────────────────
// Rückwärts, damit abhängige Datensätze vor ihren Bezugspunkten verschwinden.
for (const [collection, id] of aufraeumen.reverse()) {
  try {
    await pb(`/api/collections/${collection}/records/${id}`, { method: 'DELETE' })
  } catch {
    /* schon weg */
  }
}

console.log(`\n${bestanden} bestanden, ${durchgefallen.length} durchgefallen`)
console.log(
  'Hinweis: T9 hat den Login für diese IP 15 Minuten gesperrt. Vor dem nächsten Lauf\n' +
    '         PocketBase neu starten — der Zähler liegt nur im Arbeitsspeicher.\n',
)
if (durchgefallen.length) process.exit(1)
