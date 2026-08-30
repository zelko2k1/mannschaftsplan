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

import { randomBytes, createHash, createHmac } from 'node:crypto'
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
// Das Geheimnis des zweiten Faktors für den Superuser. Steht hier oben, weil `adminAnmelden()`
// weiter unten es liest und schon der erste Test sich anmeldet.
let totpGeheimnis = ''
// Eine Sitzung, die alle Prüfungen teilen — siehe adminSitzung() weiter unten.
let adminJar = null
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
    body: JSON.stringify({ name: `test-Mannschaft-${randomBytes(3).toString('hex')}` }),
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

await pruefe('T13b', 'GET /j/… nennt die Mannschaft, verrät aber nichts über tote Token', async () => {
  // Seit Abschnitt 12 steht auf der Einladungsseite der Name der Mannschaft — das Mitglied
  // erwartet ihn, und er landet in der Vorschau des Messengers. Damit unterscheidet sich die
  // Seite für ein gültiges Token, und das ist eine bewusste Abweichung von R6: Ein Token besteht
  // aus 16 zufälligen Bytes, es zu raten ist ausgeschlossen, und wer eines hat, kann es
  // ohnehin benutzen.
  const mannschaft = await zweiteMannschaft()
  await pb(`/api/collections/teams/records/${mannschaft.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: 'test-Sichtbare-Mannschaft' }),
  })
  const aktiv = await testMitglied('r6-aktiv', true, mannschaft.id)
  const inaktiv = await testMitglied('r6-inaktiv', false, mannschaft.id)

  const seite = async (token) => (await (await roh(`/j/${token}`)).text()).replaceAll(token, 'X')

  const gueltig = await seite(aktiv.klartext)
  stimmt(gueltig.includes('test-Sichtbare-Mannschaft'), 'Der Mannschaftsname fehlt auf der Seite')

  // Was NICHT unterscheidbar sein darf: ein unbekanntes Token und das eines deaktivierten
  // Mitglieds. Beide zeigen den Vereinsnamen (T2b).
  const unbekannt = await seite('voellig-erfunden')
  const deaktiviert = await seite(inaktiv.klartext)
  if (unbekannt !== deaktiviert) {
    throw new Error('Unbekannt und deaktiviert unterscheiden sich — inaktive Mitglieder wären erkennbar')
  }
  stimmt(
    !unbekannt.includes('test-Sichtbare-Mannschaft'),
    'Ein totes Token verrät trotzdem die Mannschaft',
  )
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
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)
  const spieltag = await testSpieltag({ km: 80, is_home: false, date: '2026-09-05 19:30:00' })

  // Der berechnete Wert wird mitgeliefert, damit die Eingabemaske zeigen kann, was „leer" heißt.
  const vorher = (await (await ruf('/manage/api/fixtures')).json()).items.find((x) => x.id === spieltag.id)
  gleich(vorher.departure_manual, '', 'anfangs nichts von Hand')
  stimmt(!!vorher.departure_berechnet, 'der berechnete Wert fehlt in der Kapitänsansicht')

  gleich(
    (
      await ruf(`/manage/api/fixtures/${spieltag.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ departure_manual: '2026-09-05 16:00:00' }),
      })
    ).status,
    200,
    'setzen',
  )
  const gesetzt = (await (await ruf('/manage/api/fixtures')).json()).items.find((x) => x.id === spieltag.id)
  stimmt(gesetzt.departure_manual.startsWith('2026-09-05 16:00'), `steht: ${gesetzt.departure_manual}`)

  // Und wieder leeren — sonst gäbe es keinen Weg zurück zur Berechnung.
  await ruf(`/manage/api/fixtures/${spieltag.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ departure_manual: '' }),
  })
  const geleert = (await (await ruf('/manage/api/fixtures')).json()).items.find((x) => x.id === spieltag.id)
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
// ohne Kapitänssitzung antwortet /manage/api mit 404, nicht mit 401 oder 403 (R6).

// Beide Präfixe, denn beide müssen ohne Sitzung mit 404 antworten (R6). Der Unterschied ist der
// Proxy davor, nicht die Anwendung: /manage steht offen (R13e), /admin liegt hinter dem Tor.
const ADMIN_ROUTEN = [
  '/manage/api/me',
  '/manage/api/fixtures',
  '/manage/api/members',
  '/manage/api/settings',
  '/manage/api/audit',
  '/manage/api/totp',
  '/admin/api/backups',
  '/admin/api/verwalter',
]

// ── Zweiter Faktor, nachgerechnet ──────────────────────────────────────────────────────────
// Seit der Faktor für Admin-Konten Pflicht ist (R13), kommt kein Test mehr an /admin/api vorbei,
// ohne einen zu haben. Also rechnet die Suite die Codes selbst — RFC 6238, dieselben sechs
// Ziffern, die sonst die Authenticator-App anzeigt.

function base32Entschluesseln(text) {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const zeichen of text.toUpperCase().replace(/=+$/, '')) {
    const wert = ALPHABET.indexOf(zeichen)
    if (wert === -1) continue
    bits += wert.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

let letzterSchritt = 0

function totpCode(geheimnis, jetztSekunden = Math.floor(Date.now() / 1000)) {
  const schritt = Math.floor(jetztSekunden / 30)
  if (schritt > letzterSchritt) letzterSchritt = schritt
  const zaehler = Buffer.alloc(8)
  zaehler.writeUInt32BE(Math.floor(schritt / 2 ** 32), 0)
  zaehler.writeUInt32BE(schritt >>> 0, 4)
  const hmac = createHmac('sha1', base32Entschluesseln(geheimnis)).update(zaehler).digest()
  const versatz = hmac[hmac.length - 1] & 0x0f
  const zahl = hmac.readUInt32BE(versatz) & 0x7fffffff
  return String(zahl % 1000000).padStart(6, '0')
}

// Eine Sitzung, die alle Prüfungen teilen. Der Grund ist der zweite Faktor: Ein Zeitcode gilt
// genau einmal, und der nächste kommt erst mit dem nächsten 30-Sekunden-Schritt. Meldete sich
// jede Prüfung neu an, wartete der Lauf minutenlang auf Codes — oder scheiterte daran, dass der
// Schritt schon verbraucht war. Angemeldet wird deshalb einmal; wer die Anmeldung SELBST prüft,
// ruft weiterhin adminAnmelden() auf.

/**
 * Warten, bis eine neue 30-Sekunden-Scheibe beginnt. Ein Zeitcode gilt einmal; wer kurz nach
 * einer Anmeldung eine zweite braucht, muss den nächsten Schritt abwarten. Einmal im ganzen
 * Lauf ist das zu verschmerzen.
 */
async function naechsteZeitscheibe() {
  // Nicht bis zur nächsten Scheibe, sondern bis hinter die zuletzt BENUTZTE: Ein Code kann aus
  // der Zukunft geholt worden sein, dann ist die nächste Scheibe schon verbraucht.
  while (Math.floor(Date.now() / 30000) <= letzterSchritt) {
    await new Promise((weiter) => setTimeout(weiter, 30000 - (Date.now() % 30000) + 500))
  }
}

async function adminSitzung() {
  if (adminJar) return adminJar
  const { antwort, jar } = await adminAnmelden()
  if (antwort.status !== 200) {
    throw new Error(`Anmeldung als Superuser fehlgeschlagen: ${antwort.status}`)
  }
  adminJar = jar
  return jar
}

async function adminAnmelden(passwort = PASSWORT, code = '', bleiben = false) {
  // Ist der Faktor eingerichtet, gehört der Code dazu — sonst käme nur `mfa: true` zurück.
  const mit = code || (totpGeheimnis && passwort === PASSWORT ? totpCode(totpGeheimnis) : '')
  const antwort = await roh('/manage/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: passwort, bleiben, ...(mit ? { code: mit } : {}) }),
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

await pruefe('T8a', '/manage/api ohne Kapitänssitzung → 404, nicht 401/403 (R6)', async () => {
  for (const pfad of ADMIN_ROUTEN) {
    gleich((await roh(pfad)).status, 404, pfad)
  }
  // Auch schreibend darf nichts durchkommen.
  gleich(
    (await roh('/manage/api/members', { method: 'POST', body: '{"name":"Eindringling"}' })).status,
    404,
    'POST /manage/api/members',
  )
})

await pruefe('T8b', 'Eine Mitgliedersitzung öffnet die Kapitänsansicht nicht (R5)', async () => {
  const { klartext } = await testMitglied('kein-kapitaen')
  const { jar } = await anmelden(klartext)
  for (const pfad of ADMIN_ROUTEN) {
    gleich((await roh(pfad, { headers: { Cookie: alsHeader(jar) } })).status, 404, pfad)
  }
})

await pruefe('A1', 'Anmelden setzt beide Cookies auf beiden Pfaden', async () => {
  const { antwort, jar, roh: zeilen } = await adminAnmelden()
  gleich(antwort.status, 200, 'Status')
  if (!jar.dz_admin) throw new Error('dz_admin fehlt')
  if (!jar.dz_admin_csrf) throw new Error('dz_admin_csrf fehlt')

  // R13e · Zwei Wege, ein Cookie kennt aber nur EINEN Pfad. Also wird jeder zweimal gesetzt.
  // Fehlte einer, liefe die Kapitänsansicht auf dem einen Pfad und wäre auf dem anderen
  // abgemeldet — und zwar ohne Fehlermeldung, nur mit 404 auf jede Anfrage.
  for (const name of ['dz_admin', 'dz_admin_csrf']) {
    const gesetzt = zeilen.filter((z) => z.startsWith(`${name}=`))
    gleich(gesetzt.length, 2, `${name}: Anzahl Set-Cookie`)
    for (const pfad of ['Path=/manage', 'Path=/admin']) {
      if (!gesetzt.some((z) => z.includes(pfad))) throw new Error(`${name} ohne ${pfad}`)
    }
  }

  const sid = zeilen.find((z) => z.startsWith('dz_admin='))
  for (const teil of ['HttpOnly', 'Secure', 'SameSite=Lax']) {
    if (!sid.includes(teil)) throw new Error(`dz_admin ohne ${teil}: ${sid}`)
  }
  // Kein Path=/ heißt: der Browser schickt diesen Cookie bei /api/* gar nicht erst mit.
  if (zeilen.find((z) => z.startsWith('dz_admin_csrf=')).includes('HttpOnly')) {
    throw new Error('dz_admin_csrf ist HttpOnly, Double-Submit unmöglich')
  }
})

// ── Der zweite Faktor, ab hier für alles unter /admin/api nötig ─────────────────────────────
// Diese Prüfung ist zugleich die Vorbereitung: Sie richtet den Faktor für den Superuser ein und
// legt das Geheimnis in `totpGeheimnis` ab. Alles Folgende meldet sich damit an.
await pruefe('C2', 'Ohne CSRF-Kopfzeile wird in der Verwaltung nichts geschrieben (R11)', async () => {
  // Diese Prüfung gab es nur für die Mitgliederseite (C1). Für die Verwaltung fehlte sie — und
  // genau dort war die Absicherung wirkungslos: Der Statuscode war 403, geschrieben wurde
  // trotzdem. Ursache war `e.json()`, das im JSVM nichts zurückgibt; die Vorprüfung meldete
  // ihren Fehler, der Handler lief weiter. Geprüft wird deshalb nicht der Statuscode, sondern
  // die WIRKUNG.
  const jar = await adminSitzung()
  const team = await testTeam()
  const name = `test-csrf-${randomBytes(4).toString('hex')}`

  const ohneKopf = await roh('/manage/api/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: alsHeader(jar) },
    body: JSON.stringify({ name, team }),
  })
  gleich(ohneKopf.status, 403, 'Status')

  const liste = await (await alsKapitaen(jar)(`/manage/api/members?team=${team}`)).json()
  if (liste.items.some((m) => m.name === name)) {
    throw new Error('Der Datensatz wurde trotz 403 angelegt — R11 wirkt nicht')
  }

  // Und der Rumpf enthält genau EINE Antwort, nicht zwei hintereinander.
  const text = await (
    await roh('/manage/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alsHeader(jar) },
      body: JSON.stringify({ name, team }),
    })
  ).text()
  JSON.parse(text)
})

await pruefe('A13', 'Admin-Konto ohne zweiten Faktor kommt nicht an /admin/api (R13)', async () => {
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)

  // Die Oberfläche erfährt es, bevor jemand dagegenläuft: /manage/api/me sagt, ob ein Faktor da
  // ist. Daran hängt der Hinweisbalken der Ersteinrichtung.
  gleich((await (await ruf('/manage/api/me')).json()).totp, false, 'me.totp vor der Einrichtung')

  // Vorher: die Rolle stimmt, der Faktor fehlt. 403 mit Klartext, nicht 404 — wer angemeldet
  // ist, soll erfahren, was ihm fehlt.
  const gesperrt = await ruf('/admin/api/verwalter')
  gleich(gesperrt.status, 403, 'ohne Faktor')
  const grund = await gesperrt.json()
  if (!grund.totp_pflicht) throw new Error('kein Hinweis auf die Pflicht')

  // Einrichten — genau so, wie es die Oberfläche tut.
  const begonnen = await (await ruf('/manage/api/totp', { method: 'POST' })).json()
  if (!begonnen.geheimnis) throw new Error('kein Geheimnis')

  const bestaetigt = await ruf('/manage/api/totp/confirm', {
    method: 'POST',
    body: JSON.stringify({ code: totpCode(begonnen.geheimnis) }),
  })
  gleich(bestaetigt.status, 200, 'bestätigen')
  const codes = (await bestaetigt.json()).codes
  gleich(codes.length, 10, 'Wiederherstellungscodes')
  for (const c of codes) {
    if (!/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(c)) throw new Error(`unbrauchbarer Code: ${c}`)
  }

  totpGeheimnis = begonnen.geheimnis

  // Nachher: dieselbe Sitzung, dieselbe Rolle — und jetzt geht es.
  gleich((await ruf('/admin/api/verwalter')).status, 200, 'mit Faktor')
  gleich((await (await ruf('/manage/api/me')).json()).totp, true, 'me.totp nach der Einrichtung')
})

await pruefe('A14', 'Ein Wiederherstellungscode ersetzt den Code aus der App — genau einmal', async () => {
  // Neue Codes ziehen, damit dieser Test nicht von denen aus A13 abhängt.
  const jar = await adminSitzung()
  const frisch = await (
    await alsKapitaen(jar)('/manage/api/totp/codes', {
      method: 'POST',
      // Eine Zeitscheibe weiter: Der aktuelle Schritt ist von der Einrichtung in A13 verbraucht.
      body: JSON.stringify({ code: totpCode(totpGeheimnis, Math.floor(Date.now() / 1000) + 30) }),
    })
  ).json()
  gleich(frisch.codes.length, 10, 'neue Codes')

  const einer = frisch.codes[0]
  const erste = await adminAnmelden(PASSWORT, einer)
  gleich(erste.antwort.status, 200, 'erste Anmeldung mit Zettel')

  // Verbraucht ist verbraucht.
  const zweite = await adminAnmelden(PASSWORT, einer)
  gleich(zweite.antwort.status, 401, 'zweite Anmeldung mit demselben Code')

  // Und der Rest des Zettels gilt weiter.
  const anderer = await adminAnmelden(PASSWORT, frisch.codes[1])
  gleich(anderer.antwort.status, 200, 'anderer Code vom selben Zettel')
})

await pruefe('T14', '„Angemeldet bleiben" gibt es nur mit zweitem Faktor (R13)', async () => {
  // A13 und A14 haben die laufende Zeitscheibe verbraucht.
  await naechsteZeitscheibe()
  const mitFaktor = await adminAnmelden(PASSWORT, '', true)
  gleich(mitFaktor.antwort.status, 200, 'Status')
  gleich((await mitFaktor.antwort.json()).bleiben, true, 'mit Faktor')

  // Ein Konto ohne Faktor: derselbe Wunsch, aber die kurze Sitzung. Der Server sagt das auch.
  const jar = await adminSitzung()
  const konto = await (
    await alsKapitaen(jar)('/admin/api/verwalter', {
      method: 'POST',
      body: JSON.stringify({ email: `test-ohne-faktor-${Date.now()}@example.com`, rolle: 'admin' }),
    })
  ).json()
  aufraeumen.push(['verwalter', konto.id])

  const ohne = await roh('/manage/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: konto.email, password: konto.passwort, bleiben: true }),
  })
  gleich(ohne.status, 200, 'Anmeldung ohne Faktor')
  gleich((await ohne.json()).bleiben, false, 'ohne Faktor keine 90 Tage')
})

await pruefe('A2', 'Falsches Passwort und unbekannte Adresse sind ununterscheidbar (R6)', async () => {
  const falsch = await adminAnmelden('ganz-sicher-falsch')
  const unbekannt = await roh('/manage/api/login', {
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
  const jar = await adminSitzung()
  const ohne = await roh('/manage/api/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: alsHeader(jar) },
    body: JSON.stringify({ name: 'test-ohne-csrf' }),
  })
  gleich(ohne.status, 403, 'Status')
  // Lesen darf weiterhin gehen — die Kopfzeile schützt Änderungen, nicht Abfragen.
  gleich((await roh('/manage/api/members', { headers: { Cookie: alsHeader(jar) } })).status, 200, 'GET')
})

await pruefe('A4', 'Der Token-Hash verlässt den Server nie (R1)', async () => {
  await testMitglied('hash-check')
  const jar = await adminSitzung()
  const koerper = await (await alsKapitaen(jar)('/manage/api/members')).text()
  if (koerper.includes('token_hash')) throw new Error('token_hash steht in der Antwort')
  const liste = JSON.parse(koerper).items
  if (!liste.some((m) => 'hat_token' in m)) throw new Error('hat_token fehlt')
})

await pruefe('A5', '„Neues Token" tötet alten Link und alle Geräte (R12)', async () => {
  const { klartext, satz } = await testMitglied('rotate-admin')
  const mitglied = await anmelden(klartext)
  gleich((await roh('/api/me', { headers: { Cookie: alsHeader(mitglied.jar) } })).status, 200, 'vorher')

  const jar = await adminSitzung()
  const antwort = await alsKapitaen(jar)(`/manage/api/members/${satz.id}/rotate-token`, { method: 'POST' })
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

  const jar = await adminSitzung()
  gleich(
    (
      await alsKapitaen(jar)(`/manage/api/members/${satz.id}`, {
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
  const jar = await adminSitzung()

  gleich(
    (
      await alsKapitaen(jar)(`/manage/api/response/${spieltag.id}/${satz.id}`, {
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
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)

  const angelegt = await ruf('/manage/api/fixtures', {
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
    (await ruf(`/manage/api/fixtures/${id}`, { method: 'PATCH', body: JSON.stringify({ km: 55 }) })).status,
    200,
    'ändern',
  )
  const liste = await (await ruf('/manage/api/fixtures')).json()
  gleich(liste.items.find((s) => s.id === id).km, 55, 'km nach dem Ändern')

  // R4 · Unsinn wird abgewiesen.
  gleich(
    (await ruf(`/manage/api/fixtures/${id}`, { method: 'PATCH', body: JSON.stringify({ km: -5 }) })).status,
    400,
    'negative Entfernung',
  )

  gleich((await ruf(`/manage/api/fixtures/${id}`, { method: 'DELETE' })).status, 200, 'löschen')
})

await pruefe('A9', 'Anzeigename wirkt auf die Einladungsseite und wird escaped', async () => {
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)
  const seite = async () => (await roh('/j/beliebiges-token')).text()

  const vorher = (await (await ruf('/manage/api/settings')).json()).anzeigename

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

await pruefe('A10', 'Die zentralen Einstellungen nehmen keine unsinnigen Werte an', async () => {
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)
  const vorher = await (await ruf('/manage/api/settings')).json()

  try {
    // Grenzen aus der Migration, hier gespiegelt: sonst lehnte erst die Datenbank ab, mit einer
    // Meldung, die dem Kapitän nichts sagt.
    for (const [feld, wert] of [
      ['auto_sperre_stunden', -1],
      ['auto_sperre_stunden', 169],
    ]) {
      gleich(
        (await ruf('/admin/api/settings', { method: 'PATCH', body: JSON.stringify({ [feld]: wert }) })).status,
        400,
        `${feld} = ${wert}`,
      )
    }

    // Ein leerer Vereinsname ginge auf der Einladungsseite als Überschrift durch — dort steht
    // dann nichts, und die Linkvorschau zeigt eine leere Zeile.
    gleich(
      (await ruf('/admin/api/settings', { method: 'PATCH', body: '{"anzeigename":"  "}' })).status,
      400,
      'leerer Vereinsname',
    )
  } finally {
    await ruf('/admin/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ auto_sperre_stunden: vorher.auto_sperre_stunden }),
    })
  }
})

await pruefe('A11', 'Impressum und Datenschutz: eigene Seiten, ohne Anmeldung, ohne HTML', async () => {
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)
  const vorher = await (await ruf('/manage/api/settings')).json()

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
    const protokoll = await (await ruf('/manage/api/audit?limit=50')).json()
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
  const jar = await adminSitzung()
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
  const jar = await adminSitzung()
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
  const jar = await adminSitzung()

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
  const jar = await adminSitzung()
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
  totpGeheimnis = ''
}

/**
 * Den zweiten Faktor des Superusers wiederherstellen. Ohne ihn bleibt seit R13 jede Route unter
 * /admin/api verschlossen — die Prüfungen danach scheiterten sonst reihenweise an 403, und die
 * Ursache stünde am ganz anderen Ende der Datei.
 */
async function faktorNeuSetzen() {
  await totpWegraeumen()
  const ruf = alsKapitaen(await adminSitzung())
  const start = await (await ruf('/manage/api/totp', { method: 'POST' })).json()
  await totpAufraeumenVormerken()
  await ruf('/manage/api/totp/confirm', {
    method: 'POST',
    body: JSON.stringify({ code: totp.codeFuer(start.geheimnis, totpSchritt()) }),
  })
  totpGeheimnis = start.geheimnis
}

const totpSchritt = () => Math.floor(Date.now() / 30000)

await pruefe('T15b', 'Einrichten gilt erst, wenn ein Code gestimmt hat', async () => {
  await totpWegraeumen()
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)

  gleich(JSON.stringify(await (await ruf('/manage/api/totp')).json()), '{"aktiv":false,"ausstehend":false,"codes_uebrig":0}', 'Anfangslage')

  const start = await (await ruf('/manage/api/totp', { method: 'POST' })).json()
  await totpAufraeumenVormerken()
  gleich(start.geheimnis.length, 32, 'Länge des Geheimnisses')
  stimmt(start.uri.includes('algorithm=SHA1'), 'Die URI nennt SHA1 nicht')

  // Solange nicht bestätigt, darf der Login nichts verlangen — sonst sperrt sich aus, wer die
  // Einrichtung abbricht.
  gleich(
    JSON.stringify(await (await ruf('/manage/api/totp')).json()),
    '{"aktiv":false,"ausstehend":true,"codes_uebrig":0}',
    'Zwischenstand',
  )
  gleich((await adminAnmelden()).antwort.status, 200, 'Login bei unbestätigter Einrichtung')

  gleich(
    (await ruf('/manage/api/totp/confirm', { method: 'POST', body: JSON.stringify({ code: '000000' }) })).status,
    400,
    'Bestätigen mit falschem Code',
  )
  gleich(
    (
      await ruf('/manage/api/totp/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: totp.codeFuer(start.geheimnis, totpSchritt()) }),
      })
    ).status,
    200,
    'Bestätigen mit richtigem Code',
  )
  gleich(JSON.stringify(await (await ruf('/manage/api/totp')).json()), '{"aktiv":true,"ausstehend":false,"codes_uebrig":10}', 'Endstand')

  // Das Bestätigen hat den aktuellen Schritt verbraucht; der nächste liegt noch in der Toleranz.
  gleich(
    (await ruf('/manage/api/totp', { method: 'DELETE', body: '{}' })).status,
    400,
    'Abschalten ohne Code',
  )
  gleich(
    (
      await ruf('/manage/api/totp', {
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
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)

  const start = await (await ruf('/manage/api/totp', { method: 'POST' })).json()
  await totpAufraeumenVormerken()
  await ruf('/manage/api/totp/confirm', {
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

// Die beiden Prüfungen davor haben den Faktor abgeschaltet. Alles Weitere braucht ihn wieder.
await faktorNeuSetzen()

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
  const chef = await adminSitzung()
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
  const antwort = await roh('/manage/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: neu.email, password: neu.passwort }),
  })
  gleich(antwort.status, 200, 'Kapitän meldet sich an')
  const ruf = alsKapitaen(kekse(antwort).jar)

  const ich = await (await ruf('/manage/api/me')).json()
  gleich(ich.rolle, 'kapitaen', 'Rolle')
  gleich(ich.teams.length, 1, 'sichtbare Mannschaften')

  // Lesen: nur die eigene — auch wenn er ausdrücklich nach der fremden fragt. Der Wunsch aus dem
  // Request wird für einen Kapitän gar nicht erst gelesen (dieselbe Regel wie R3).
  for (const abfrage of ['', `?team=${fremde.id}`]) {
    const s = await (await ruf(`/manage/api/fixtures${abfrage}`)).json()
    stimmt(
      s.items.some((x) => x.id === meinSpieltag.id) && !s.items.some((x) => x.id === fremderSpieltag.id),
      `Spieltagliste bei "${abfrage}"`,
    )
    const m = await (await ruf(`/manage/api/members${abfrage}`)).json()
    stimmt(
      m.items.some((x) => x.id === meinMitglied.satz.id) &&
        !m.items.some((x) => x.id === fremdesMitglied.satz.id),
      `Mitgliederliste bei "${abfrage}"`,
    )
  }

  // Schreiben: nichts Fremdes.
  for (const [was, pfad, optionen] of [
    ['fremden Spieltag ändern', `/manage/api/fixtures/${fremderSpieltag.id}`, { method: 'PATCH', body: '{"km":5}' }],
    ['fremden Spieltag löschen', `/manage/api/fixtures/${fremderSpieltag.id}`, { method: 'DELETE' }],
    ['fremdes Mitglied ändern', `/manage/api/members/${fremdesMitglied.satz.id}`, { method: 'PATCH', body: '{"name":"X"}' }],
    ['fremdes Token neu', `/manage/api/members/${fremdesMitglied.satz.id}/rotate-token`, { method: 'POST' }],
    ['fremde Rückmeldung', `/manage/api/response/${meinSpieltag.id}/${fremdesMitglied.satz.id}`, { method: 'PUT', body: '{"status":"yes"}' }],
    ['fremde Mannschaft umbenennen', `/manage/api/teams/${fremde.id}`, { method: 'PATCH', body: '{"name":"Weg"}' }],
  ]) {
    gleich((await ruf(pfad, optionen)).status, 400, was)
  }

  // Und ein Mitglied, das er in die fremde Mannschaft schmuggeln will, landet in seiner eigenen.
  const geschmuggelt = await (
    await ruf('/manage/api/members', {
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
    ['Einstellungen ändern', '/admin/api/settings', { method: 'PATCH', body: '{"auto_sperre_stunden":3}' }],
    ['Sicherungen auflisten', '/admin/api/backups', {}],
    ['Sicherung erstellen', '/admin/api/backup', { method: 'POST' }],
    ['Verwalter auflisten', '/admin/api/verwalter', {}],
    ['Mannschaft anlegen', '/admin/api/teams', { method: 'POST', body: '{"name":"test-Neu"}' }],
  ]) {
    gleich((await ruf(pfad, optionen)).status, 404, was)
  }

  // Was er darf: seine eigene Mannschaft benennen — das ist „die Einstellung der Mannschaft".
  const alterName = (await (await ruf('/manage/api/teams')).json()).items[0].name
  gleich(
    (await ruf(`/manage/api/teams/${eigenes}`, { method: 'PATCH', body: '{"name":"test-Umbenannt"}' })).status,
    200,
    'eigene Mannschaft ändern',
  )
  await ruf(`/manage/api/teams/${eigenes}`, { method: 'PATCH', body: JSON.stringify({ name: alterName }) })

  // Einstellungen LESEN darf er — Impressum und Datenschutz sind keine Geheimnisse.
  gleich((await ruf('/manage/api/settings')).status, 200, 'Einstellungen lesen')
})

await pruefe('T16b', 'Eine Mannschaft mit Inhalt lässt sich nicht auflösen', async () => {
  const jar = await adminSitzung()
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

await pruefe('T20', 'Die Spieltagsliste des Kapitäns trägt den Stand der Mannschaft', async () => {
  // Bis hierher lieferte die Route nur Gegner, Datum und Entfernung. Der Kapitän konnte damit
  // nicht sehen, ob seine Mannschaft vollzählig ist — genau das, wofür es das Produkt gibt.
  const { satz: mitglied, klartext } = await testMitglied('t17')
  const spieltag = await testSpieltag({ opponent_town: 'test-t17', is_home: false, km: 30 })
  const { jar } = await anmelden(klartext)
  const alsIch = alsMitglied(jar)

  await alsIch(`/api/response/${spieltag.id}`, { method: 'PUT', body: JSON.stringify({ status: 'yes' }) })
  await alsIch(`/api/ride/${spieltag.id}`, { method: 'PUT', body: JSON.stringify({ driving: true, seats: 4 }) })

  const chef = await adminSitzung()
  const liste = await (await alsKapitaen(chef)('/manage/api/fixtures')).json()
  const meiner = liste.items.find((s) => s.id === spieltag.id)
  gleich(meiner.responses[mitglied.id], 'yes', 'die Zusage steht in der Antwort')
  gleich(meiner.rides.length, 1, 'die Fahrt steht in der Antwort')
  gleich(meiner.rides[0].seats, 4, 'die Plätze stehen in der Antwort')
  gleich(meiner.rides[0].taken, 0, 'belegte Plätze werden mitgezählt')
})

await pruefe('T20b', 'Der Kapitän korrigiert eine Rückmeldung, auch an einem gesperrten Spieltag', async () => {
  const { satz: mitglied } = await testMitglied('t17b')
  const spieltag = await testSpieltag({ opponent_town: 'test-t17b' })
  const chef = await adminSitzung()
  const alsChef = alsKapitaen(chef)

  const stand = async () => {
    const liste = await (await alsChef('/manage/api/fixtures')).json()
    return liste.items.find((s) => s.id === spieltag.id).responses[mitglied.id]
  }
  const setzen = (status) =>
    alsChef(`/manage/api/response/${spieltag.id}/${mitglied.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })

  gleich((await setzen('yes')).status, 200, 'setzen')
  gleich(await stand(), 'yes', 'die Korrektur steht in der Liste')

  // Genau dafür ist die Route da: Wer telefonisch absagt, wird auch nach dem Abschließen noch
  // eingetragen. Die Route des Mitglieds lehnt das ab, diese nicht.
  await alsChef(`/manage/api/fixtures/${spieltag.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ locked: true }),
  })
  gleich((await setzen('no')).status, 200, 'auch gesperrt')
  gleich(await stand(), 'no', 'die Korrektur greift trotz Sperre')

  gleich((await setzen(null)).status, 200, 'zurücknehmen')
  gleich(await stand(), undefined, 'zurückgenommen')
})

await pruefe('T21', 'Das Protokoll findet die Zeilen einer Mannschaft auch weiter hinten', async () => {
  // Die Zugehörigkeit einer Protokollzeile zu einer Mannschaft steht nicht in der Zeile, sie
  // ergibt sich erst aus der Auflösung von Ziel und Urheber. Gefiltert wurde deshalb im
  // Speicher — aber ERST NACH dem Begrenzen. In einem Verein mit mehreren Mannschaften hieß
  // das: Wer die Damen betreut, sah sein Protokoll nur, wenn seine Zeilen zufällig unter den
  // letzten hundert des ganzen Vereins lagen. Sonst las er „Noch nichts passiert.".
  //
  // Der Testfall ahmt das mit `limit=1` nach: Die neueste Zeile gehört einer anderen
  // Mannschaft, die gesuchte liegt dahinter.
  const chef = await adminSitzung()
  const alsChef = alsKapitaen(chef)

  const meine = await testTeam()
  const fremde = await zweiteMannschaft()
  const { satz: meins } = await testMitglied('t21-eigen', true, meine)
  const { satz: fremdes } = await testMitglied('t21-fremd', true, fremde.id)

  // Erst eine Zeile für die eigene Mannschaft, dann eine neuere für die fremde.
  await alsChef(`/manage/api/members/${meins.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })
  await alsChef(`/manage/api/members/${fremdes.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })

  const antwort = await alsChef(`/manage/api/audit?limit=1&team=${meine}`)
  gleich(antwort.status, 200, 'Status')
  const daten = await antwort.json()
  gleich(daten.items.length, 1, 'die eigene Zeile wird gefunden, obwohl eine fremdere neuer ist')
  gleich(daten.items[0].action, 'member.update', 'und es ist die richtige')
})

await pruefe('T22', 'Der Einladungslink steht in keinem Protokoll — auch nicht in PocketBases eigenem', async () => {
  // R8 deckt zwei Protokolle ab, nicht eines. Caddy überspringt /j/* per `log_skip` (T10 auf dem
  // Server). PocketBase führt daneben die Tabelle `_logs` mit Methode, voller URL, Statuscode,
  // Browserkennung und IP — dort stand das Token vollständig drin, fünf Tage lang und damit in
  // jeder Sicherung. Die Migration 1788600000 schaltet dieses Protokoll ab.
  const { klartext } = await testMitglied('t22')

  const vorher = await pb('/api/logs?perPage=1')
  await roh(`/j/${klartext}`)
  // Das Protokoll wird gepuffert geschrieben; PocketBase leert den Puffer im Sekundentakt.
  await new Promise((fertig) => setTimeout(fertig, 4000))

  const nachher = await pb('/api/logs?perPage=200')
  gleich(nachher.totalItems, 0, 'PocketBase schreibt gar kein Anfrageprotokoll mehr')
  gleich(vorher.totalItems, 0, 'und zwar von Anfang an, nicht erst nach dem Aufräumen')

  const treffer = (nachher.items || []).filter((z) => JSON.stringify(z).includes(klartext))
  gleich(treffer.length, 0, 'kein Protokolleintrag enthält das Token')
})

await pruefe('T23', 'Ohne gewählte Mannschaft sagt der Server, was fehlt', async () => {
  // Zwei Gründe teilten sich eine Meldung: „keine Mannschaft gewählt" und „diese darfst du
  // nicht". Der erste ist ein Zustand, den der Anfragende ändern kann — und er hat gerade ein
  // Formular ausgefüllt. Der zweite bleibt wortkarg (R6).
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)

  const ohne = await ruf('/manage/api/fixtures', {
    method: 'POST',
    body: JSON.stringify({ opponent_town: 'test-t23', date: '2026-09-12 17:30:00.000Z' }),
  })
  gleich(ohne.status, 400, 'abgelehnt')
  gleich((await ohne.json()).message, 'Wähle zuerst eine Mannschaft aus.', 'und sagt warum')

  const fremd = await ruf('/manage/api/fixtures', {
    method: 'POST',
    body: JSON.stringify({ opponent_town: 'test-t23b', date: '2026-09-12 17:30:00.000Z', team: 'gibtesnicht123' }),
  })
  gleich(fremd.status, 400, 'unbekannte Mannschaft abgelehnt')
  gleich((await fremd.json()).message, 'Ungültige Angabe.', 'ohne zu verraten, ob es sie gibt')
})

await pruefe('A10b', 'Tempo und Puffer stehen am Spieltag, sonst gilt der Standard', async () => {
  const kapitaen = await adminSitzung()
  const ruf = alsKapitaen(kapitaen)
  const { klartext } = await testMitglied('a10b')
  const { jar } = await anmelden(klartext)

  // Standard ist 80 km/h und 25 Minuten. 80 km → 60 min + 25 = 85.
  const spieltag = await testSpieltag({ km: 80, is_home: false, date: '2026-10-10 19:00:00' })
  const vorlauf = async () => {
    const board = await (await alsMitglied(jar)('/api/board')).json()
    const s = board.fixtures.find((f) => f.id === spieltag.id)
    return (new Date(s.date.replace(' ', 'T')) - new Date(s.departure)) / 60000
  }

  gleich(await vorlauf(), 85, 'Standard')

  // Nur für diesen Spieltag: halbes Tempo. 80 km bei 40 km/h sind 120 min, plus 25 = 145.
  gleich(
    (await ruf(`/manage/api/fixtures/${spieltag.id}`, { method: 'PATCH', body: '{"tempo_kmh":40}' })).status,
    200,
    'Tempo setzen',
  )
  gleich(await vorlauf(), 145, 'eigenes Tempo')

  // Ein eigener Puffer von 0 — die Null muss „keine Rüstzeit" heißen und nicht „Standard",
  // sonst wäre der Wunsch nicht ausdrückbar.
  gleich(
    (await ruf(`/manage/api/fixtures/${spieltag.id}`, { method: 'PATCH', body: '{"puffer_minuten":0}' })).status,
    200,
    'Puffer 0 setzen',
  )
  gleich(await vorlauf(), 120, 'eigener Puffer von 0')

  // Zurück auf Standard.
  await ruf(`/manage/api/fixtures/${spieltag.id}`, {
    method: 'PATCH',
    body: '{"tempo_kmh":-1,"puffer_minuten":-1}',
  })
  gleich(await vorlauf(), 85, 'wieder Standard')

  // Grenzen — und -1 muss ausdrücklich durchkommen.
  for (const [koerper, soll] of [
    ['{"tempo_kmh":19}', 400],
    ['{"tempo_kmh":201}', 400],
    ['{"puffer_minuten":-2}', 400],
    ['{"puffer_minuten":181}', 400],
    ['{"tempo_kmh":-1}', 200],
  ]) {
    gleich(
      (await ruf(`/manage/api/fixtures/${spieltag.id}`, { method: 'PATCH', body: koerper })).status,
      soll,
      koerper,
    )
  }

  // Die Kapitänsansicht liefert mit, was tatsächlich gilt — sonst müsste der Browser rechnen.
  const liste = await (await ruf('/manage/api/fixtures')).json()
  const x = liste.items.find((f) => f.id === spieltag.id)
  gleich(x.tempo_effektiv, 80, 'tempo_effektiv')
  gleich(x.puffer_effektiv, 25, 'puffer_effektiv')
})

await pruefe('T17', 'Der Gesamt-Admin sieht den zweiten Faktor der Kapitäne und kann ihn abschalten', async () => {
  const jar = await adminSitzung()
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
  const anmeldung = await roh('/manage/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: konto.email, password: konto.passwort }),
  })
  const alsKapitaenSelbst = alsKapitaen(kekse(anmeldung).jar)
  const start = await (await alsKapitaenSelbst('/manage/api/totp', { method: 'POST' })).json()
  await alsKapitaenSelbst('/manage/api/totp/confirm', {
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
  const protokoll = await (await ruf('/manage/api/audit?limit=200')).json()
  stimmt(
    protokoll.items.some((z) => z.action === 'verwalter.totp.off'),
    'Das Abschalten steht nicht im Protokoll',
  )
})

await pruefe('T18', 'Der Admin ist weder Kapitän noch Spieler, und ein Kapitän spielt in seiner Mannschaft', async () => {
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)
  const eigenes = await testTeam()
  const fremde = await zweiteMannschaft()

  const meiner = await testMitglied('t18-eigen')
  const fremder = await testMitglied('t18-fremd', true, fremde.id)

  const adresse = () => `test-t18-${randomBytes(4).toString('hex')}@example.org`

  // Vorbild Dartszentrale: Ein Konto verweist OPTIONAL auf einen Spieler. Beim Admin nie —
  // er verwaltet, er spielt nicht.
  gleich(
    (
      await ruf('/admin/api/verwalter', {
        method: 'POST',
        body: JSON.stringify({ email: adresse(), rolle: 'admin', team: eigenes }),
      })
    ).status,
    400,
    'Admin mit Mannschaft',
  )
  gleich(
    (
      await ruf('/admin/api/verwalter', {
        method: 'POST',
        body: JSON.stringify({ email: adresse(), rolle: 'admin', mitglied: meiner.satz.id }),
      })
    ).status,
    400,
    'Admin mit Spielereintrag',
  )

  // Ein Kapitän darf nur mit einem Spieler SEINER Mannschaft verknüpft werden — sonst stünde er
  // in einer fremden, und die Trennung wäre wieder offen.
  gleich(
    (
      await ruf('/admin/api/verwalter', {
        method: 'POST',
        body: JSON.stringify({
          email: adresse(),
          rolle: 'kapitaen',
          team: eigenes,
          mitglied: fremder.satz.id,
        }),
      })
    ).status,
    400,
    'Kapitän mit fremdem Spieler',
  )

  const verknuepft = await (
    await ruf('/admin/api/verwalter', {
      method: 'POST',
      body: JSON.stringify({
        email: adresse(),
        rolle: 'kapitaen',
        team: eigenes,
        mitglied: meiner.satz.id,
      }),
    })
  ).json()
  aufraeumen.push(['verwalter', verknuepft.id])

  const finde = async () =>
    (await (await ruf('/admin/api/verwalter')).json()).items.find((v) => v.id === verknuepft.id)
  gleich((await finde()).mitglied, meiner.satz.id, 'Verknüpfung steht')

  // Ein Konto, das zum Admin wird, verliert Mannschaft UND Spielereintrag.
  gleich(
    (await ruf(`/admin/api/verwalter/${verknuepft.id}`, { method: 'PATCH', body: '{"rolle":"admin"}' })).status,
    200,
    'zum Admin machen',
  )
  const danach = await finde()
  gleich(danach.rolle, 'admin', 'Rolle')
  gleich(danach.team, '', 'keine Mannschaft mehr')
  gleich(danach.mitglied, '', 'kein Spielereintrag mehr')
})

await pruefe('T19', 'Jeder ändert sein eigenes Passwort, aber nur mit dem bisherigen', async () => {
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)

  const email = `test-t19-${randomBytes(4).toString('hex')}@example.org`
  const konto = await (
    await ruf('/admin/api/verwalter', {
      method: 'POST',
      body: JSON.stringify({ email, rolle: 'kapitaen', team: await testTeam() }),
    })
  ).json()
  aufraeumen.push(['verwalter', konto.id])

  const anmelden2 = async (passwort) =>
    roh('/manage/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: passwort }),
    })

  const ersteAnmeldung = await anmelden2(konto.passwort)
  gleich(ersteAnmeldung.status, 200, 'Anmeldung mit dem erzeugten Passwort')
  const alsKap = alsKapitaen(kekse(ersteAnmeldung).jar)

  gleich(
    (await alsKap('/manage/api/passwort', { method: 'PATCH', body: '{"alt":"falsch","neu":"NeuesPasswort123"}' })).status,
    400,
    'falsches bisheriges Passwort',
  )
  gleich(
    (
      await alsKap('/manage/api/passwort', {
        method: 'PATCH',
        body: JSON.stringify({ alt: konto.passwort, neu: 'kurz' }),
      })
    ).status,
    400,
    'zu kurzes neues Passwort',
  )
  gleich(
    (
      await alsKap('/manage/api/passwort', {
        method: 'PATCH',
        body: JSON.stringify({ alt: konto.passwort, neu: 'elfzeichen' + '1' }),
      })
    ).status,
    400,
    'elf Zeichen sind zu wenig (Abschnitt 12)',
  )
  gleich(
    (
      await alsKap('/manage/api/passwort', {
        method: 'PATCH',
        // Der eigene Adressteil vor dem @ — das erste, was jemand probiert.
        body: JSON.stringify({ alt: konto.passwort, neu: `${email.split('@')[0]}!` }),
      })
    ).status,
    400,
    'Passwort mit dem eigenen Anmeldenamen',
  )
  gleich(
    (
      await alsKap('/manage/api/passwort', {
        method: 'PATCH',
        body: JSON.stringify({ alt: konto.passwort, neu: 'NeuesPasswort123' }),
      })
    ).status,
    200,
    'Passwort ändern',
  )

  gleich((await anmelden2(konto.passwort)).status, 401, 'altes Passwort gilt nicht mehr')
  gleich((await anmelden2('NeuesPasswort123')).status, 200, 'neues Passwort gilt')
})

await pruefe('T9b', 'Der Admin sieht Sperren und kann sie aufheben (R7)', async () => {
  // Die Sperre selbst lässt sich hier nicht auslösen: Der Zähler pro IP schlägt schon nach fünf
  // Versuchen zu, der pro Konto erst nach zehn Fehlversuchen. Bis dahin bräuchte es mehrere
  // Adressen — genau der Fall, für den er da ist, und genau der, den ein Testlauf von einem
  // Rechner aus nicht herstellen kann. Bleibt zu prüfen, was von hier aus prüfbar ist: dass die
  // Auskunft mitkommt und der Weg zum Aufheben steht.
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)

  const konten = await (await ruf('/admin/api/verwalter')).json()
  for (const k of konten.items) {
    if (typeof k.gesperrt !== 'number') throw new Error(`${k.email}: keine Auskunft über Sperren`)
  }

  const eines = konten.items[0]
  gleich((await ruf(`/admin/api/verwalter/${eines.id}/entsperren`, { method: 'POST' })).status, 200, 'aufheben')

  // Und ein Kapitän kommt an diesen Weg nicht heran (R6).
  const email = `test-t9b-${randomBytes(4).toString('hex')}@example.org`
  const konto = await (
    await ruf('/admin/api/verwalter', {
      method: 'POST',
      body: JSON.stringify({ email, rolle: 'kapitaen', team: await testTeam() }),
    })
  ).json()
  aufraeumen.push(['verwalter', konto.id])

  const alsKap = alsKapitaen(
    kekse(
      await roh('/manage/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: konto.passwort }),
      }),
    ).jar,
  )
  gleich(
    (await alsKap(`/admin/api/verwalter/${eines.id}/entsperren`, { method: 'POST' })).status,
    404,
    'als Kapitän',
  )
})

await pruefe('A15', 'Der Kapitän wechselt ohne Token in seine eigene Spieleransicht (Abschnitt 12)', async () => {
  const jar = await adminSitzung()
  const ruf = alsKapitaen(jar)
  const team = await testTeam()

  // Ein Kapitän, der mitspielt: Konto und Spielereintrag sind verbunden.
  const { satz: spieler } = await testMitglied('t-a15')
  const email = `test-a15-${randomBytes(4).toString('hex')}@example.org`
  const konto = await (
    await ruf('/admin/api/verwalter', {
      method: 'POST',
      body: JSON.stringify({ email, rolle: 'kapitaen', team, mitglied: spieler.id }),
    })
  ).json()
  aufraeumen.push(['verwalter', konto.id])

  const angemeldet = await roh('/manage/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: konto.passwort }),
  })
  const kapJar = kekse(angemeldet).jar

  const gewechselt = await alsKapitaen(kapJar)('/manage/api/spieleransicht', { method: 'POST' })
  gleich(gewechselt.status, 200, 'Wechsel')

  // Was zurückkommt, ist eine MITGLIEDERsitzung — und sie zeigt den Aushang seiner Mannschaft.
  const mitgliedJar = kekse(gewechselt).jar
  if (!mitgliedJar.dz_sid) throw new Error('keine Mitgliedersitzung ausgestellt')
  const board = await (await roh('/api/board', { headers: { Cookie: `dz_sid=${mitgliedJar.dz_sid}` } })).json()
  gleich(board.me, spieler.id, 'Wer der Aushang zu sein glaubt')
  gleich(board.verwalter, true, 'Der Aushang zeigt den Weg zurück in die Verwaltung')

  // Der Admin selbst spielt nicht — für ihn gibt es diese Route nicht (R6).
  gleich((await ruf('/manage/api/spieleransicht', { method: 'POST' })).status, 404, 'als Admin')
})

await pruefe('T9', '6× falsches Passwort → gesperrt, auch für das richtige', async () => {
  let letzter = null
  for (let i = 0; i < 6; i++) letzter = (await adminAnmelden('immer-falsch')).antwort
  // Der sechste Fehlgriff ist der, der die Sperre auslöst — beantwortet wird er noch mit 401.
  // Gezählt werden seit R13e Fehlversuche und nicht Anfragen: Acht Kapitäne im selben WLAN
  // sollen sich nicht gegenseitig aussperren, nur weil sie sich alle richtig anmelden.
  gleich(letzter.status, 401, 'Status beim sechsten Fehlversuch')

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
