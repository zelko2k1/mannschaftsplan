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
const ADMIN_DAUER = 12 * 3600 // 12 Stunden — die Voreinstellung (R13)
const ADMIN_DAUER_LANG = 90 * 24 * 3600 // 90 Tage — nur mit „angemeldet bleiben" (R13)

// Seit R13e gibt es zwei Wege in dieselbe Ansicht: /manage ohne Gate, /admin dahinter. Ein
// Cookie kennt aber nur EINEN Pfad. Also wird derselbe Wert zweimal gesetzt, einmal je Pfad —
// unschön, aber die Alternative wäre `Path=/`, und dann liefe der Kapitäns-Cookie auch bei jeder
// Mitglieder-Anfrage mit. Getrennt bleibt getrennt (R5).
const COOKIE_PFADE = ['/manage', '/admin']
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
  'tempo_kmh',
  'puffer_minuten',
  'needed_players',
  'locked',
  'ohne_fahrdienst',
  'ergebnis_wir',
  'ergebnis_gegner',
]

module.exports = {
  ADMIN_COOKIE,
  ADMIN_CSRF_COOKIE,
  ADMIN_DAUER,
  ADMIN_DAUER_LANG,
  COOKIE_PFADE,
  B64URL,

  /**
   * Die beiden Sitzungscookies setzen — für jeden Pfad aus COOKIE_PFADE einmal.
   *
   * @param sid der Klartext der Sitzungs-ID (nur hier, in der Datenbank steht der Hash)
   * @param dauer Laufzeit in Sekunden
   * @returns der CSRF-Wert, damit der Aufrufer ihn nicht selbst erzeugen muss
   */
  cookiesSetzen(e, sid, dauer) {
    const csrf = $security.randomStringWithAlphabet(43, B64URL)
    for (const pfad of COOKIE_PFADE) {
      e.setCookie(
        new Cookie({
          name: ADMIN_COOKIE,
          value: sid,
          path: pfad,
          maxAge: dauer,
          secure: true,
          httpOnly: true,
          sameSite: 2, // Lax
        }),
      )
      // R11 · Muss lesbar sein, damit der Client den Wert als Kopfzeile zurückschicken kann.
      e.setCookie(
        new Cookie({
          name: ADMIN_CSRF_COOKIE,
          value: csrf,
          path: pfad,
          maxAge: dauer,
          secure: true,
          httpOnly: false,
          sameSite: 2,
        }),
      )
    }
    return csrf
  },

  /** Beide Cookies auf beiden Pfaden löschen. Einer übrig heißt: halb abgemeldet. */
  cookiesLoeschen(e) {
    for (const pfad of COOKIE_PFADE) {
      for (const name of [ADMIN_COOKIE, ADMIN_CSRF_COOKIE]) {
        e.setCookie(new Cookie({ name, value: '', path: pfad, maxAge: -1, secure: true, sameSite: 2 }))
      }
    }
  },

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

    // Die Laufzeit aus R13 wird hier durchgesetzt, nicht nur über die Cookie-Lebensdauer: ein
    // abgegriffener Cookie-Wert wäre sonst serverseitig unbegrenzt gültig. Welche der beiden
    // gilt, steht an der Sitzung — 0 ist die kurze Voreinstellung, damit Sitzungen aus der Zeit
    // vor dem Feld unverändert weiterlaufen.
    let dauer = ADMIN_DAUER
    try {
      const gewaehlt = satz.getInt('dauer')
      if (gewaehlt === ADMIN_DAUER_LANG) dauer = ADMIN_DAUER_LANG
    } catch {
      dauer = ADMIN_DAUER
    }

    let angelegt = null
    try {
      angelegt = new Date(satz.getDateTime('created').string().replace(' ', 'T'))
    } catch {
      angelegt = null
    }
    if (!angelegt || isNaN(angelegt.getTime()) || Date.now() - angelegt.getTime() > dauer * 1000) {
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
   *
   * ACHTUNG, hier steckte ein Fehler, der zwei Monate unbemerkt blieb: Diese Funktion gab
   * früher `e.json(...)` zurück, und der Aufrufer schrieb `if (raus) return { fehler: raus }`.
   * **`e.json()` liefert im JSVM aber `undefined`** — es SCHREIBT die Antwort und gibt nichts
   * zurück. Damit war die Bedingung falsch, der Handler lief weiter und arbeitete die Anfrage
   * ab. Nach außen sah alles richtig aus, weil die erste Schreiboperation den Statuscode
   * festlegt: 403, und im Rumpf standen zwei JSON-Objekte hintereinander.
   *
   * Bei lesenden Routen lief der Handler danach in einen TypeError (kein `kontext`) und blieb
   * folgenlos. Bei SCHREIBENDEN Routen mit gültiger Sitzung aber fehlender CSRF-Kopfzeile wurde
   * geschrieben — R11 war für diesen Router wirkungslos. Die Mitgliederseite war nie betroffen,
   * sie gibt seit jeher Daten zurück und ruft `e.json()` in der Route auf (utils.js).
   *
   * Deshalb gibt es hier jetzt DATEN, keine Antwort. Geschrieben wird in der Route.
   *
   * @returns null wenn alles in Ordnung ist, sonst { status, koerper }
   */
  abweisen(e) {
    if (!this.sitzung(e)) return { status: 404, koerper: { message: 'Nicht gefunden.' } }
    if (e.request.method !== 'GET' && !this.csrfOk(e)) {
      return { status: 403, koerper: { message: 'Ungültige Anfrage.' } }
    }
    return null
  },

  /**
   * Wer ist angemeldet, und was darf er? — Abschnitt 12.
   *
   * @returns null ohne Sitzung, sonst { email, rolle: 'admin'|'kapitaen', team }
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
          rolle: v.getString('rolle') === 'kapitaen' ? 'kapitaen' : 'admin',
          team: v.getString('team') || '',
          // Der Spielereintrag, falls diese Person mitspielt (Abschnitt 12). Beim Admin immer
          // leer — er verwaltet, er spielt nicht.
          mitglied: v.getString('mitglied') || '',
          konto: v.id,
        }
      }
    } catch {
      /* kein Verwalterkonto zu dieser Adresse */
    }

    // Ein Superuser ohne Verwalterkonto ist immer Admin. Das ist der Rettungsanker: Wer sich
    // beim Verteilen der Rollen vergreift — etwa das eigene Konto zum Kapitän macht —, kommt
    // über den Superuser wieder herein und kann es geradeziehen.
    return { email, rolle: 'admin', team: '', mitglied: '', konto: '' }
  },

  /**
   * Für Admin-Konten ist der zweite Faktor Pflicht (R13). Diese Prüfung steht in jeder Route,
   * die nur `admin` darf — direkt hinter der Rollenprüfung.
   *
   * Warum hier und nicht beim Anmelden: Wer sich nicht mehr anmelden könnte, käme auch nicht an
   * die Einrichtung heran. So kommt er herein, sieht seine Mannschaften und richtet den Faktor
   * ein; verschlossen ist nur, was ALLE Mannschaften betrifft — Konten, Sicherungen, zentrale
   * Einstellungen.
   *
   * Und deshalb hier 403 mit Klartext statt 404 wie sonst: Wer bis hierher gekommen ist, ist
   * angemeldet. Vor ihm etwas zu verstecken, das er selbst aufschließen soll, hilft niemandem.
   *
   * @returns null wenn alles in Ordnung ist, sonst { status, koerper } — siehe abweisen()
   */
  faktorFehlt(e) {
    let email = ''
    try {
      email = this.sitzung(e).getString('email')
    } catch {
      return { status: 404, koerper: { message: 'Nicht gefunden.' } }
    }

    let satz = null
    try {
      satz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m} && confirmed = true', {
        m: email,
      })
    } catch {
      satz = null
    }
    if (satz) return null

    return {
      status: 403,
      koerper: {
        totp_pflicht: true,
        message:
          'Für Admin-Konten ist der zweite Faktor Pflicht. Richte ihn unter deinem Konto ein — danach geht es hier weiter.',
      },
    }
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
    if (kontext.rolle === 'admin') return true
    return !!kontext.team && String(teamId) === kontext.team
  },

  /**
   * Darf dieses Konto mit diesem Spielereintrag verbunden werden? — Abschnitt 12.
   *
   * Ein leerer Bezug ist immer in Ordnung: Wer nur organisiert, hat kein Spielerprofil. Ist
   * einer gesetzt, muss er zu derselben Mannschaft gehören wie das Konto — sonst stünde ein
   * Kapitän der Herren in der Damenmannschaft, und die Trennung wäre wieder offen.
   *
   * @returns null wenn es passt, sonst der Text für die Meldung
   */
  mitgliedPruefen(app, mitgliedId, teamId) {
    if (!mitgliedId) return null
    let satz
    try {
      satz = app.findRecordById('members', mitgliedId)
    } catch {
      return 'Diesen Spieler gibt es nicht.'
    }
    if (!satz) return 'Diesen Spieler gibt es nicht.'
    if (satz.getString('team') !== teamId) {
      return 'Der Spieler gehört zu einer anderen Mannschaft.'
    }
    return null
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

  /**
   * Ab wann eine Verschiebung eine Verlegung ist: eine Stunde.
   *
   * Eine halbe Stunde später ist kein Grund, zehn Leute neu zu fragen — ein anderer Wochentag
   * immer. Die Grenze kommt vom Betreiber, nicht aus der Technik.
   */
  VERLEGUNG_MINUTEN: 60,

  /**
   * Hält fest, dass dieser Spieltag verlegt wurde — wenn es denn eine ist.
   *
   * Gezählt wird als Verlegung: ein anderer Kalendertag, oder eine Verschiebung um mindestens
   * VERLEGUNG_MINUTEN. Beides zusammen ist derselbe Fall. Was darunter bleibt, ist eine
   * Korrektur und lässt die Rückmeldungen in Ruhe.
   *
   * Der Zeitpunkt selbst ist das Kennzeichen: Jede Rückmeldung, die älter ist, stammt vom alten
   * Termin. Deshalb wird er auch bei einer ZWEITEN Verlegung neu gesetzt — sonst gälten Antworten
   * als bestätigt, die nur die erste Verschiebung gesehen haben.
   *
   * Gibt zurück, ob etwas vermerkt wurde; die Route schreibt es ins Protokoll.
   */
  verlegungVermerken(satz, altesDatum) {
    const alsDatum = (wert) => {
      const d = new Date(String(wert || '').trim().replace(' ', 'T'))
      return isNaN(d.getTime()) ? null : d
    }
    const vorher = alsDatum(altesDatum)
    const nachher = alsDatum(satz.getDateTime('date').string())
    if (!vorher || !nachher) return false

    const minuten = Math.abs(nachher.getTime() - vorher.getTime()) / 60000
    const andererTag = vorher.toISOString().slice(0, 10) !== nachher.toISOString().slice(0, 10)
    if (!andererTag && minuten < module.exports.VERLEGUNG_MINUTEN) return false

    satz.set('verlegt_am', new DateTime())
    // Und woher. Ohne das steht in der Zeile nur DASS verschoben wurde, nicht was sich geändert
    // hat — der neue Termin steht ja ohnehin dort, der alte wäre sonst weg.
    satz.set('verlegt_von', altesDatum)
    return true
  },

  /** R4 · Whitelist. Was nicht in SPIELTAG_FELDER steht, wird ignoriert — nicht abgelehnt. */
  spieltagUebernehmen(satz, koerper) {
    for (const feld of SPIELTAG_FELDER) {
      if (!(feld in koerper)) continue
      if (feld === 'is_home' || feld === 'locked' || feld === 'ohne_fahrdienst') {
        satz.set(feld, !!koerper[feld])
      } else if (feld === 'km' || feld === 'needed_players') {
        const zahl = Number(koerper[feld])
        if (!isFinite(zahl) || zahl < 0) return 'Ungültige Angabe.'
        satz.set(feld, Math.round(zahl))
      } else if (feld === 'ergebnis_wir' || feld === 'ergebnis_gegner') {
        // -1 heißt „nicht eingetragen"; 0 ist ein gültiges Ergebnis. Ein leeres Feld aus dem
        // Formular kommt als leerer String an und bedeutet dasselbe wie -1 — sonst müsste die
        // Oberfläche wissen, wie „nichts" im Backend heißt.
        const roh = koerper[feld]
        const zahl = roh === '' || roh === null || roh === undefined ? -1 : Number(roh)
        if (!isFinite(zahl) || zahl !== Math.round(zahl)) return 'Ungültige Angabe.'
        if (zahl < -1 || zahl > 99) return 'Ungültige Angabe.'
        satz.set(feld, zahl)
      } else if (feld === 'tempo_kmh' || feld === 'puffer_minuten') {
        // -1 heißt „nicht gesetzt" und ist deshalb ausdrücklich erlaubt. Sonst dieselben
        // Grenzen wie zentral bzw. an der Mannschaft — die Datenbank lehnte anderes ohnehin ab,
        // nur mit einer Meldung, die dem Kapitän nichts sagt.
        const zahl = Number(koerper[feld])
        if (!isFinite(zahl) || zahl !== Math.round(zahl)) return 'Ungültige Angabe.'
        if (zahl !== -1) {
          if (feld === 'tempo_kmh' && (zahl < 20 || zahl > 200)) return 'Ungültige Angabe.'
          if (feld === 'puffer_minuten' && (zahl < 0 || zahl > 180)) return 'Ungültige Angabe.'
        }
        satz.set(feld, zahl)
      } else {
        satz.set(feld, String(koerper[feld] === null || koerper[feld] === undefined ? '' : koerper[feld]))
      }
    }
    return null
  },
}
