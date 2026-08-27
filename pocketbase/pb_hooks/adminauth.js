/// <reference path="../pb_data/types.d.ts" />
// Vorprüfung und Hilfen für die Kapitänsansicht. Wie utils.js ohne `.pb.js`-Endung und
// INNERHALB der Handler geholt.
//
// Warum nicht einfach oben in admin.pb.js als Funktionen? Weil jeder Handler in einer eigenen,
// isolierten JS-Laufzeit läuft. Eine im Modul-Scope definierte Funktion ist dort schlicht nicht
// vorhanden — der Handler bricht mit einem ReferenceError ab, und PocketBase meldet nach außen
// ein nichtssagendes „400 Something went wrong". Genau so ist diese Datei entstanden.

const ADMIN_COOKIE = 'dz_admin'
const ADMIN_CSRF_COOKIE = 'dz_admin_csrf'
const ADMIN_DAUER = 12 * 3600 // 12 Stunden (R13)
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const SPIELTAG_FELDER = [
  'date',
  'opponent_club',
  'opponent_town',
  'is_home',
  'venue',
  'km',
  'meeting_point',
  'departure_manual',
  'needed_players',
  'locked',
]

module.exports = {
  ADMIN_COOKIE,
  ADMIN_CSRF_COOKIE,
  ADMIN_DAUER,
  B64URL,

  /**
   * Liest die Kapitänssitzung aus `admin_sessions` — einer eigenen Tabelle (R5). Eine
   * Mitgliedersitzung kann hier strukturell nicht durchrutschen, auch wenn jemand später eine
   * Prüfung vergisst.
   */
  sitzung(e) {
    let sid = ''
    try {
      sid = e.request.cookie(ADMIN_COOKIE).value || ''
    } catch {
      return null
    }
    if (!sid) return null

    let satz
    try {
      satz = e.app.findFirstRecordByData('admin_sessions', 'sid_hash', $security.sha256(sid))
    } catch {
      return null
    }
    if (!satz) return null

    // Die 12 Stunden aus R13 werden hier durchgesetzt, nicht nur über die Cookie-Lebensdauer:
    // ein abgegriffener Cookie-Wert wäre sonst serverseitig unbegrenzt gültig.
    let angelegt = null
    try {
      angelegt = new Date(satz.getDateTime('created').string().replace(' ', 'T'))
    } catch {
      angelegt = null
    }
    if (!angelegt || isNaN(angelegt.getTime()) || Date.now() - angelegt.getTime() > ADMIN_DAUER * 1000) {
      try {
        e.app.delete(satz)
      } catch {
        /* schon weg */
      }
      return null
    }

    try {
      satz.set('last_seen', new DateTime())
      e.app.save(satz)
    } catch {
      /* nicht schlimm */
    }
    return satz
  },

  /**
   * R11 · Double-Submit, auch für die Kapitänsansicht. „Alle schreibenden Routen prüfen die
   * Übereinstimmung" — das schließt diese hier ein, auch wenn sie ohnehin hinter VPN bzw. LAN
   * liegen sollen. Eigener Cookie-Name, damit sich die beiden Bereiche nichts teilen (R5).
   */
  csrfOk(e) {
    let ausCookie = ''
    try {
      ausCookie = e.request.cookie(ADMIN_CSRF_COOKIE).value || ''
    } catch {
      return false
    }
    return ausCookie !== '' && ausCookie === (e.request.header.get('X-CSRF-Token') || '')
  },

  /**
   * R6 · 404 statt 403 — kein Hinweis darauf, dass es hier überhaupt etwas gibt.
   * Bei schreibenden Anfragen zusätzlich die CSRF-Prüfung.
   * @returns die fertige Fehlerantwort, oder null wenn alles in Ordnung ist
   */
  abweisen(e) {
    if (!this.sitzung(e)) return e.json(404, { message: 'Nicht gefunden.' })
    if (e.request.method !== 'GET' && !this.csrfOk(e)) {
      return e.json(403, { message: 'Ungültige Anfrage.' })
    }
    return null
  },

  /**
   * Wer ist angemeldet, und was darf er? — Abschnitt 12.
   *
   * @returns null ohne Sitzung, sonst { email, rolle: 'gesamt'|'kapitaen', team }
   */
  kontext(e) {
    const satz = this.sitzung(e)
    if (!satz) return null
    const email = satz.getString('email')

    try {
      const v = e.app.findFirstRecordByFilter('verwalter', 'email = {:m}', { m: email })
      if (v) {
        return {
          email,
          rolle: v.getString('rolle') === 'kapitaen' ? 'kapitaen' : 'gesamt',
          team: v.getString('team') || '',
        }
      }
    } catch {
      /* kein Verwalterkonto zu dieser Adresse */
    }

    // Ein Superuser ohne Verwalterkonto ist immer Gesamt-Admin. Das ist der Rettungsanker: Wer
    // sich beim Verteilen der Rollen vergreift — etwa das eigene Konto zum Kapitän macht —,
    // kommt über den Superuser wieder herein und kann es geradeziehen.
    return { email, rolle: 'gesamt', team: '' }
  },

  /**
   * Vorprüfung und Rollenauskunft in einem. Für jede Route, die wissen muss, wer fragt.
   *
   * @returns { fehler } zum direkten Zurückgeben, oder { kontext }
   */
  pruefen(e) {
    const raus = this.abweisen(e)
    if (raus) return { fehler: raus }
    return { kontext: this.kontext(e) }
  },

  /**
   * Welche Mannschaft gilt für diese Anfrage?
   *
   * Für einen Kapitän IMMER die eigene — was im Request steht, wird nicht gelesen. Das ist
   * dieselbe Regel wie R3 auf der Mitgliederseite: Die Identität kommt aus der Sitzung, nie aus
   * dem Request. Für den Gesamt-Admin die gewünschte, oder '' für „alle".
   */
  teamFuer(kontext, gewuenscht) {
    if (kontext.rolle === 'kapitaen') return kontext.team
    return String(gewuenscht === null || gewuenscht === undefined ? '' : gewuenscht)
  },

  /**
   * Darf dieser Verwalter einen Datensatz dieser Mannschaft anfassen?
   *
   * Ein Kapitän ohne eigene Mannschaft darf NICHTS — das ist ein halb angelegtes Konto, und im
   * Zweifel ist zu wenig Recht besser als zu viel.
   */
  darfTeam(kontext, teamId) {
    if (kontext.rolle === 'gesamt') return true
    return !!kontext.team && String(teamId) === kontext.team
  },

  protokoll(e, action, target, alt, neu) {
    const u = require(`${__hooks}/utils.js`)
    let wer = 'admin:?'
    try {
      wer = `admin:${this.sitzung(e).getString('email')}`
    } catch {
      /* bleibt beim Fragezeichen */
    }
    u.protokollieren(e.app, wer, action, target, alt, neu)
  },

  /**
   * Dateiname einer Sicherung: kein Pfad, kein `..`, nur ZIP. Streng, weil der Name in den
   * Ablagezugriff wandert — eine lockere Prüfung wäre hier ein Pfad-Ausbruch.
   */
  backupNameOk(name) {
    return typeof name === 'string' && /^[A-Za-z0-9._-]+\.zip$/.test(name) && name.indexOf('..') === -1
  },

  /** `2026-08-27 07:54:29.123Z` → `20260827_075429`, für Dateinamen. */
  backupZeitstempel() {
    return new DateTime().string().replace(/[-:]/g, '').replace(' ', '_').slice(0, 15)
  },

  /** R4 · Whitelist. Was nicht in SPIELTAG_FELDER steht, wird ignoriert — nicht abgelehnt. */
  spieltagUebernehmen(satz, koerper) {
    for (const feld of SPIELTAG_FELDER) {
      if (!(feld in koerper)) continue
      if (feld === 'is_home' || feld === 'locked') {
        satz.set(feld, !!koerper[feld])
      } else if (feld === 'km' || feld === 'needed_players') {
        const zahl = Number(koerper[feld])
        if (!isFinite(zahl) || zahl < 0) return 'Ungültige Angabe.'
        satz.set(feld, Math.round(zahl))
      } else {
        satz.set(feld, String(koerper[feld] === null || koerper[feld] === undefined ? '' : koerper[feld]))
      }
    }
    return null
  },
}
