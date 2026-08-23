/// <reference path="../pb_data/types.d.ts" />
// Gemeinsame Hilfen für die Routen aus Abschnitt 5.
//
// Die Datei heißt bewusst NICHT `.pb.js` — sonst würde PocketBase sie als eigene Hook-Datei laden.
// Sie wird INNERHALB der Handler geholt:
//
//     const u = require(`${__hooks}/utils.js`)
//
// Nicht im Modul-Scope: die Handler laufen in eigenen, voneinander isolierten JS-Laufzeiten, ein
// require ganz oben in einer Hook-Datei steht ihnen nicht zur Verfügung.

// base64url-Alphabet. R1/R2 verlangen Zufall aus einem kryptografischen Generator —
// $security.randomStringWithAlphabet liefert genau das (crypto/rand, nicht math/rand).
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const SID_COOKIE = 'dz_sid'
const CSRF_COOKIE = 'dz_csrf'

// Go-Konstante http.SameSiteLaxMode. Die Zahlen sind: 1 Default, 2 Lax, 3 Strict, 4 None.
// R2 verlangt Lax — mit Strict käme man aus einem angeklickten Link heraus nicht herein.
const SAMESITE_LAX = 2

// Ein halbes Jahr, wie in R2.
const SESSION_DAUER = 15552000

module.exports = {
  SID_COOKIE,
  CSRF_COOKIE,

  /** SHA-256 als Hex — die einzige Form, in der Token und Session-IDs gespeichert werden. */
  hash(text) {
    return $security.sha256(String(text))
  },

  /** Einladungstoken: 22 Zeichen base64url ≈ 132 Bit (R1). */
  neuesToken() {
    return $security.randomStringWithAlphabet(22, B64URL)
  },

  /** Session-ID: 43 Zeichen base64url ≈ 256 Bit, unabhängig vom Token erzeugt (R2). */
  neueSid() {
    return $security.randomStringWithAlphabet(43, B64URL)
  },

  /**
   * Legt eine Session an und setzt beide Cookies.
   * Die Session-ID wird NICHT aus dem Token abgeleitet (R2) — wer eins kennt, kennt das andere nicht.
   */
  sessionStarten(e, mitglied) {
    const sid = $security.randomStringWithAlphabet(43, B64URL)
    const csrf = $security.randomStringWithAlphabet(43, B64URL)

    const satz = new Record(e.app.findCollectionByNameOrId('sessions'))
    satz.set('member', mitglied.id)
    satz.set('sid_hash', $security.sha256(sid))
    satz.set('last_seen', new DateTime())
    // Nur zur Wiedererkennung in der Geräteliste — der User-Agent selbst wird nicht gespeichert.
    satz.set('ua_hash', $security.sha256(e.request.header.get('User-Agent') || ''))
    e.app.save(satz)

    // HttpOnly: kein JavaScript-Zugriff auf die Session-ID.
    e.setCookie(
      new Cookie({
        name: SID_COOKIE,
        value: sid,
        path: '/',
        maxAge: SESSION_DAUER,
        secure: true,
        httpOnly: true,
        sameSite: SAMESITE_LAX,
      }),
    )
    // R11 · Double-Submit: dieses Cookie MUSS lesbar sein, der Client schickt den Wert als
    // X-CSRF-Token-Kopfzeile zurück. Deshalb httpOnly: false — das ist Absicht, kein Versehen.
    e.setCookie(
      new Cookie({
        name: CSRF_COOKIE,
        value: csrf,
        path: '/',
        maxAge: SESSION_DAUER,
        secure: true,
        httpOnly: false,
        sameSite: SAMESITE_LAX,
      }),
    )
    return satz
  },

  /** Beide Cookies löschen (maxAge < 0 weist den Browser an, sie zu vergessen). */
  cookiesLoeschen(e) {
    for (const name of [SID_COOKIE, CSRF_COOKIE]) {
      e.setCookie(
        new Cookie({ name, value: '', path: '/', maxAge: -1, secure: true, sameSite: SAMESITE_LAX }),
      )
    }
  },

  /**
   * R3 · Die EINZIGE Quelle für die Identität eines Mitglieds. Ein `member`-Feld im Request-Body
   * wird nirgends gelesen. Gibt null zurück, wenn keine gültige Session vorliegt oder das
   * Mitglied inaktiv ist.
   */
  mitgliedAusSession(e) {
    let sid = ''
    try {
      sid = e.request.cookie(SID_COOKIE).value || ''
    } catch {
      return null // Cookie gar nicht vorhanden.
    }
    if (!sid) return null

    let session
    try {
      session = e.app.findFirstRecordByData('sessions', 'sid_hash', $security.sha256(sid))
    } catch {
      return null
    }
    if (!session) return null

    let mitglied
    try {
      mitglied = e.app.findRecordById('members', session.getString('member'))
    } catch {
      return null
    }
    // Ein deaktiviertes Mitglied kommt auch mit gültiger Session nicht mehr herein.
    if (!mitglied || !mitglied.getBool('active')) return null

    // Für die Geräteliste des Kapitäns. Bewusst ohne Fehlerbehandlung nach oben: wenn das
    // Fortschreiben scheitert, ist die Anfrage trotzdem gültig.
    try {
      session.set('last_seen', new DateTime())
      e.app.save(session)
    } catch {
      /* nicht schlimm */
    }

    return { mitglied, session }
  },

  /**
   * R11 · Double-Submit-Prüfung. Der Wert im nicht-HttpOnly-Cookie muss mit der Kopfzeile
   * übereinstimmen. Fremde Seiten können zwar einen Request auslösen, aber das Cookie nicht lesen
   * und die Kopfzeile deshalb nicht setzen.
   */
  csrfOk(e) {
    let ausCookie = ''
    try {
      ausCookie = e.request.cookie(CSRF_COOKIE).value || ''
    } catch {
      return false
    }
    const ausHeader = e.request.header.get('X-CSRF-Token') || ''
    return ausCookie !== '' && ausCookie === ausHeader
  },

  /**
   * Die Vorprüfung, die vor JEDER schreibenden Mitglieder-Route steht — Sitzung, CSRF, Spieltag,
   * Sperre. An einer Stelle, damit keine Route sie versehentlich auslässt.
   *
   * @returns { fehler } zum direkten Zurückgeben, oder { sitzung, spieltag }
   */
  zugangPruefen(e, spieltagId) {
    const sitzung = this.mitgliedAusSession(e)
    if (!sitzung) return { fehler: { status: 401, message: 'Keine gültige Sitzung.' } }

    // R11 · Ohne passende Kopfzeile keine Änderung. Fremde Seiten können den Cookie-Wert nicht
    // lesen und die Kopfzeile deshalb nicht setzen.
    if (!this.csrfOk(e)) return { fehler: { status: 403, message: 'Ungültige Anfrage.' } }

    let spieltag
    try {
      spieltag = e.app.findRecordById('fixtures', spieltagId)
    } catch {
      spieltag = null
    }
    // R4 · Der Spieltag muss existieren. 400 ohne Detailauskunft.
    if (!spieltag) return { fehler: { status: 400, message: 'Ungültige Angabe.' } }

    if (spieltag.getBool('locked')) {
      return { fehler: { status: 403, message: 'Dieser Spieltag ist abgeschlossen.' } }
    }
    return { sitzung, spieltag }
  },

  /**
   * Findet den Datensatz eines Mitglieds zu einem Spieltag — die drei Tabellen responses, rides
   * und seat_claims haben alle denselben Zuschnitt (UNIQUE über fixture + member).
   */
  eigenerSatz(e, collection, spieltagId, mitgliedId) {
    try {
      const treffer = e.app.findRecordsByFilter(
        collection,
        'fixture = {:f} && member = {:m}',
        '',
        1,
        0,
        { f: spieltagId, m: mitgliedId },
      )
      return treffer.length ? treffer[0] : null
    } catch {
      return null
    }
  },

  /** Eintrag ins Protokoll. Milderung für R14 — hier steht, wer was geändert hat. */
  protokollieren(app, actor, action, target, alt, neu) {
    try {
      const satz = new Record(app.findCollectionByNameOrId('audit_log'))
      satz.set('at', new DateTime())
      satz.set('actor', actor)
      satz.set('action', action)
      satz.set('target', target || '')
      satz.set('old_value', alt === null || alt === undefined ? '' : String(alt))
      satz.set('new_value', neu === null || neu === undefined ? '' : String(neu))
      app.save(satz)
    } catch {
      // Ein fehlgeschlagener Protokolleintrag darf die eigentliche Aktion nicht kippen.
    }
  },

  /**
   * Abfahrtszeit nach Abschnitt 6.3:
   *
   *     fahrzeit_min = km / 80 * 60 + 25          // 25 min Puffer
   *     abfahrt      = anwurf − round(fahrzeit auf 5 min)
   *
   * Gehört ins Backend, damit alle dasselbe sehen — nicht jedes Gerät seine eigene Zeit rechnet.
   * Bei Heimspielen gibt es keine Abfahrt; die Zeitspalte zeigt dann den Anwurf.
   *
   * @returns ISO-Zeitstempel oder null bei Heimspiel
   */
  abfahrt(anwurfISO, km, istHeimspiel) {
    if (istHeimspiel) return null

    // PocketBase liefert "2026-09-05 19:30:00.000Z" — mit Leerzeichen statt „T". Node schluckt
    // das, die JS-Engine von PocketBase nicht: dort kommt NaN heraus und die Abfahrtszeit fehlte
    // stillschweigend. Deshalb vor dem Parsen begradigen.
    const normalisiert = String(anwurfISO).trim().replace(' ', 'T')
    const anwurf = new Date(/[Zz]|[+-]\d\d:?\d\d$/.test(normalisiert) ? normalisiert : normalisiert + 'Z')
    if (isNaN(anwurf.getTime())) return null
    const fahrzeit = (Number(km) || 0) / 80 * 60 + 25
    const gerundet = Math.round(fahrzeit / 5) * 5
    return new Date(anwurf.getTime() - gerundet * 60000).toISOString()
  },

  /** Pflicht vor jeder Ausgabe in HTML — das Token kommt aus der URL und ist Fremdeingabe. */
  escape(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  },
}
