#!/usr/bin/env node
// Die Testfälle aus Abschnitt 11, soweit sie sich automatisieren lassen. Läuft gegen ein
// laufendes PocketBase — lokal gegen scripts/dev-pb.sh, in der CI gegen ein Wegwerf-PocketBase.
//
//   PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node scripts/api-tests.mjs
//
// Die Tests legen eigene Mitglieder und Spieltage an (Präfix „test-") und räumen sie hinterher
// wieder weg. Ein Seed muss dafür nicht gelaufen sein.
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

// ── Aufräumen ──────────────────────────────────────────────────────────────────────────────
// Rückwärts, damit abhängige Datensätze vor ihren Bezugspunkten verschwinden.
for (const [collection, id] of aufraeumen.reverse()) {
  try {
    await pb(`/api/collections/${collection}/records/${id}`, { method: 'DELETE' })
  } catch {
    /* schon weg */
  }
}

console.log(`\n${bestanden} bestanden, ${durchgefallen.length} durchgefallen\n`)
if (durchgefallen.length) process.exit(1)
