#!/usr/bin/env node
// Stellt einem Mitglied ein neues Einladungstoken aus — R12.
//
//   node pocketbase/rotate-token.mjs "<Name des Mitglieds>"
//
// Drei Dinge passieren dabei, und zwar in dieser Reihenfolge:
//   1. neuer Hash → alle alten Links sind tot
//   2. alle Sessions des Mitglieds löschen → alle Geräte ausgeloggt
//   3. Eintrag ins Protokoll
//
// Dasselbe macht später der Knopf „Neues Token" in der Kapitänsansicht (Schritt 6). Dieses Skript
// bleibt daneben bestehen: Wenn die Admin-Oberfläche klemmt oder der Kapitän sich selbst ausgesperrt
// hat, ist es der Weg zurück.

import { randomBytes, createHash } from 'node:crypto'

const BASIS = process.env.PB_URL || 'http://127.0.0.1:8090'
const EMAIL = process.env.PB_SUPERUSER_EMAIL
const PASSWORT = process.env.PB_SUPERUSER_PASSWORD

const name = process.argv[2]
if (!name || !EMAIL || !PASSWORT) {
  console.error(
    'Aufruf:  PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node pocketbase/rotate-token.mjs "<Name>"',
  )
  process.exit(1)
}

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
  if (!antwort.ok) throw new Error(`${optionen.method || 'GET'} ${pfad} → ${antwort.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

const jetzt = () => new Date().toISOString().replace('T', ' ').slice(0, 19)

token = (
  await pb('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: EMAIL, password: PASSWORT }),
  })
).token

const treffer = await pb(
  `/api/collections/members/records?filter=${encodeURIComponent(`name="${name}"`)}`,
)
if (treffer.totalItems !== 1) {
  console.error(
    treffer.totalItems === 0
      ? `Kein Mitglied namens „${name}".`
      : `${treffer.totalItems} Mitglieder heißen „${name}" — bitte in der Datenbank auflösen.`,
  )
  process.exit(1)
}
const mitglied = treffer.items[0]

// 1. Neuer Hash. Der alte ist damit unwiederbringlich weg — jeder verteilte Link läuft ins Leere.
const klartext = randomBytes(16).toString('base64url')
await pb(`/api/collections/members/records/${mitglied.id}`, {
  method: 'PATCH',
  body: JSON.stringify({
    token_hash: createHash('sha256').update(klartext).digest('hex'),
    token_issued_at: jetzt(),
  }),
})

// 2. Alle Geräte ausloggen. Ohne diesen Schritt bliebe ein bereits angemeldetes Handy drin,
//    obwohl der Link tot ist — genau der Fall, den T4 prüft.
const sessions = await pb(
  `/api/collections/sessions/records?perPage=200&filter=${encodeURIComponent(`member="${mitglied.id}"`)}`,
)
for (const s of sessions.items) {
  await pb(`/api/collections/sessions/records/${s.id}`, { method: 'DELETE' })
}

// 3. Protokoll.
await pb('/api/collections/audit_log/records', {
  method: 'POST',
  body: JSON.stringify({
    at: jetzt(),
    actor: `admin:${EMAIL}`,
    action: 'token.rotate',
    target: mitglied.id,
    old_value: '',
    new_value: `${sessions.items.length} Sitzungen beendet`,
  }),
})

console.log(`\nNeues Token für ${mitglied.name}. ${sessions.items.length} Sitzung(en) beendet.`)
console.log('Wird nur jetzt angezeigt:\n')
console.log(`  ${BASIS}/j/${klartext}\n`)
