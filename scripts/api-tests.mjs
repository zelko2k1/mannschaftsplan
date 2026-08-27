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

async function testMitglied(name, aktiv = true) {
  const klartext = neuesToken()
  const satz = await pb('/api/collections/members/records', {
    method: 'POST',
    body: JSON.stringify({
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
      date: jetzt(),
      opponent_club: 'test-Club',
      opponent_town: `test-Ort-${randomBytes(3).toString('hex')}`,
      is_home: false,
      venue: 'test-Halle',
      km: 80,
      meeting_point: 'test-Parkplatz',
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
]

async function adminAnmelden(passwort = PASSWORT) {
  const antwort = await roh('/admin/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: passwort }),
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
    // 60 km bei 60 km/h sind 60 Minuten, plus 10 Minuten Puffer.
    gleich(
      (
        await ruf('/admin/api/settings', {
          method: 'PATCH',
          body: JSON.stringify({ tempo_kmh: 60, puffer_minuten: 10 }),
        })
      ).status,
      200,
      'speichern',
    )
    gleich(await vorlauf(), 70, 'Vorlauf bei 60 km/h und 10 min Puffer')

    // Dasselbe Spiel bei halbem Tempo: doppelte Fahrzeit, Puffer unverändert.
    await ruf('/admin/api/settings', { method: 'PATCH', body: JSON.stringify({ tempo_kmh: 30 }) })
    gleich(await vorlauf(), 130, 'Vorlauf bei 30 km/h')

    // Grenzen aus der Migration, hier gespiegelt: sonst lehnte erst die Datenbank ab.
    for (const [feld, wert] of [
      ['tempo_kmh', 19],
      ['tempo_kmh', 201],
      ['puffer_minuten', -1],
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
  } finally {
    await ruf('/admin/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        tempo_kmh: vorher.tempo_kmh,
        puffer_minuten: vorher.puffer_minuten,
        auto_sperre_stunden: vorher.auto_sperre_stunden,
      }),
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
