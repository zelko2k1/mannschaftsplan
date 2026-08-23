#!/usr/bin/env node
// Testdaten: 8 Mitglieder und 6 Spieltage, plus die Einladungslinks zum Ausprobieren.
//
// Nur fürs Entwickeln und für den ersten Homelab-Test gedacht — der echte Spielplan wird über die
// Kapitänsansicht gepflegt (Schritt 8 des Umsetzungsplans).
//
//   PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node pocketbase/seed.mjs
//
// R1: In der Datenbank landet ausschließlich sha256(token). Der Klartext wird hier EINMAL
// ausgegeben und ist danach nicht wiederherstellbar — wer den Link verliert, bekommt über
// „Neues Token" einen neuen (R12).

import { randomBytes, createHash } from 'node:crypto'

const BASIS = process.env.PB_URL || 'http://127.0.0.1:8090'
const EMAIL = process.env.PB_SUPERUSER_EMAIL
const PASSWORT = process.env.PB_SUPERUSER_PASSWORD

if (!EMAIL || !PASSWORT) {
  console.error(
    'PB_SUPERUSER_EMAIL und PB_SUPERUSER_PASSWORD fehlen.\n' +
      'Superuser anlegen:  cd pocketbase && ./pocketbase superuser upsert <mail> <passwort> --dir=pb_data\n' +
      '(Die Adresse muss eine gültige Form haben — „dev@localhost" lehnt PocketBase ab.)',
  )
  process.exit(1)
}

const sha256 = (wert) => createHash('sha256').update(wert).digest('hex')

// 16 Byte aus dem kryptografischen Zufallsgenerator, base64url — 22 Zeichen (R1).
const neuesToken = () => randomBytes(16).toString('base64url')

let token = ''

async function pb(pfad, optionen = {}) {
  const antwort = await fetch(`${BASIS}${pfad}`, {
    ...optionen,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...optionen.headers,
    },
  })
  const text = await antwort.text()
  const daten = text ? JSON.parse(text) : null
  if (!antwort.ok) {
    throw new Error(`${optionen.method || 'GET'} ${pfad} → ${antwort.status}: ${text}`)
  }
  return daten
}

// ── Spieltage: relativ zu heute, damit die Testdaten nicht mit der Zeit veralten ────────────
function spieltag(tageAbHeute, stunde, minute) {
  const d = new Date()
  d.setDate(d.getDate() + tageAbHeute)
  d.setHours(stunde, minute, 0, 0)
  // PocketBase erwartet "YYYY-MM-DD HH:MM:SS" in UTC.
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

const MITGLIEDER = ['Marco', 'Sven', 'Kai', 'Torben', 'Andrea', 'Jens', 'Nils', 'Miriam']

const SPIELTAGE = [
  { t: 6,  h: 19, m: 30, club: 'Bulls Eye',      town: 'Celle',      heim: false, venue: 'Sportsbar Celle',    km: 52 },
  { t: 13, h: 19, m: 0,  club: 'DC Adler',       town: 'Hannover',   heim: true,  venue: 'Vereinsheim',        km: 0 },
  { t: 20, h: 20, m: 0,  club: 'Checkout 170',   town: 'Wolfsburg',  heim: false, venue: 'Gaststätte Zur Eiche', km: 78 },
  { t: 27, h: 19, m: 30, club: 'Oche Kings',     town: 'Braunschweig', heim: true, venue: 'Vereinsheim',       km: 0 },
  { t: 34, h: 19, m: 30, club: 'Triple Twenty',  town: 'Peine',      heim: false, venue: 'Sportlerheim Peine', km: 41 },
  { t: 41, h: 19, m: 0,  club: 'Dart Devils',    town: 'Gifhorn',    heim: false, venue: 'Bowling Center',     km: 35 },
]

// ── Los ────────────────────────────────────────────────────────────────────────────────────
token = (
  await pb('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: EMAIL, password: PASSWORT }),
  })
).token

const vorhanden = await pb('/api/collections/members/records?perPage=1')
if (vorhanden.totalItems > 0 && !process.argv.includes('--force')) {
  console.error(
    `Es gibt bereits ${vorhanden.totalItems} Mitglieder — der Seed würde doppelte Daten anlegen.\n` +
      'Entweder pb_data löschen und PocketBase neu starten, oder bewusst mit --force nachlegen.',
  )
  process.exit(1)
}

const links = []
for (const [index, name] of MITGLIEDER.entries()) {
  const klartext = neuesToken()
  await pb('/api/collections/members/records', {
    method: 'POST',
    body: JSON.stringify({
      name,
      // PocketBase kennt keine Defaultwerte — `active` muss beim Schreiben gesetzt werden,
      // sonst ist das Mitglied gleich inaktiv und käme nicht herein.
      active: true,
      sort: index,
      token_hash: sha256(klartext),
      token_issued_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    }),
  })
  links.push({ name, klartext })
}

for (const s of SPIELTAGE) {
  await pb('/api/collections/fixtures/records', {
    method: 'POST',
    body: JSON.stringify({
      date: spieltag(s.t, s.h, s.m),
      opponent_club: s.club,
      opponent_town: s.town,
      is_home: s.heim,
      venue: s.venue,
      km: s.km,
      meeting_point: s.heim ? '' : 'Netto-Parkplatz',
      needed_players: 4,
      locked: false,
    }),
  })
}

console.log(`\n${MITGLIEDER.length} Mitglieder und ${SPIELTAGE.length} Spieltage angelegt.\n`)
console.log('Einladungslinks — werden NUR JETZT angezeigt:\n')
for (const { name, klartext } of links) {
  console.log(`  ${name.padEnd(8)} ${BASIS}/j/${klartext}`)
}
console.log('')
