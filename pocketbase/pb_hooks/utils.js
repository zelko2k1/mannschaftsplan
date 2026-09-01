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

/**
 * Wie viele Spieler einer Mannschaft eine Abfrage zurückgibt — im Aushang wie in der
 * Kapitänsansicht.
 *
 * Eine Obergrenze für die Mannschaftsgröße gibt es im Schema NICHT; begrenzt ist allein die
 * Seitengröße der Abfrage. Genau das war lange die Falle: Wer den 201. Spieler anlegte, bekam
 * keine Meldung — er tauchte einfach nicht auf, und im Aushang fehlte er ebenso. Deshalb steht
 * die Zahl jetzt hier statt dreimal im Code, und die Kapitänsansicht bekommt zusätzlich die
 * echte Gesamtzahl, um davor warnen zu können.
 *
 * Großzügig gewählt: Eine Dartmannschaft hat acht bis sechzehn Leute.
 */
const MITGLIEDER_GRENZE = 200

// Fallen zurück, solange niemand etwas eingestellt hat. Stehen genauso in den Migrationen
// 1787700000_settings.js und 1787800000_settings_fahrzeit_sperre.js — zusammen ändern.
const ANZEIGENAME_STANDARD = 'Mannschaftsplan'
const TEMPO_STANDARD = 80
const PUFFER_STANDARD = 25
const AUTO_SPERRE_STANDARD = 0

module.exports = {
  MITGLIEDER_GRENZE,
  SID_COOKIE,
  CSRF_COOKIE,

  ANZEIGENAME_STANDARD,
  TEMPO_STANDARD,
  PUFFER_STANDARD,
  AUTO_SPERRE_STANDARD,

  /** SHA-256 als Hex — die einzige Form, in der Token und Session-IDs gespeichert werden. */
  hash(text) {
    return $security.sha256(String(text))
  },

  /**
   * Der eine Datensatz aus `settings`. Fehlt er oder ist die Tabelle noch nicht da — etwa weil
   * eine Migration hängt —, kommt der Standard zurück statt einer Ausnahme: die Einladungsseite
   * darf an einer Einstellung nicht scheitern. Sie ist der einzige Weg der Mannschaft herein.
   */
  einstellungen(app) {
    const standard = {
      anzeigename: ANZEIGENAME_STANDARD,
      auto_sperre_stunden: AUTO_SPERRE_STANDARD,
      // Leer heißt: es gibt die Seite nicht, und der Link erscheint gar nicht erst.
      impressum: '',
      datenschutz: '',
    }
    try {
      const saetze = app.findAllRecords('settings')
      if (!saetze || !saetze.length) return standard
      const satz = saetze[0]
      return {
        // Seit Abschnitt 12 der VEREINSname, nicht der einer Mannschaft: Er steht dort, wo es um
        // die Anwendung als Ganzes geht — Einladungsseite, Rechtstexte, zweiter Faktor. Wie die
        // einzelne Mannschaft heißt, steht in `teams`.
        anzeigename: satz.getString('anzeigename') || standard.anzeigename,
        auto_sperre_stunden: Math.max(0, satz.getInt('auto_sperre_stunden')),
        impressum: satz.getString('impressum') || '',
        datenschutz: satz.getString('datenschutz') || '',
      }
    } catch {
      /* siehe oben */
    }
    return standard
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
   * Eine Mannschaft samt ihrer Werte — Abschnitt 12. Wie `einstellungen()` liefert sie im
   * Zweifel den Standard statt einer Ausnahme: Der Aushang darf an einer fehlenden Mannschaft
   * nicht scheitern.
   */
  mannschaft(app, teamId) {
    const standard = { id: '', name: ANZEIGENAME_STANDARD, startort: '' }
    if (!teamId) return standard
    try {
      const satz = app.findRecordById('teams', String(teamId))
      if (!satz) return standard
      return {
        id: satz.id,
        name: satz.getString('name') || standard.name,
        startort: satz.getString('startort') || '',
      }
    } catch {
      return standard
    }
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

    // R7 · 60 Schreibvorgänge pro Minute und Sitzung. Wer tippt, kommt da nie hin; ein Skript
    // schon. Der Schlüssel ist die Sitzung, nicht die IP — eine Mannschaft sitzt oft hinter
    // demselben Anschluss.
    const limit = require(`${__hooks}/ratelimit.js`)
    const takt = limit.pruefen(e.app, `put:${sitzung.session.id}`, 60, 60)
    if (!takt.ok) {
      return { fehler: { status: 429, message: `Zu viele Änderungen. Warte ${takt.wartenSekunden} Sekunden.` } }
    }

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

    // Abschnitt 12 · Und er muss zur Mannschaft DIESES Mitglieds gehören. Die Prüfung steht hier
    // und nirgends sonst: Alle drei schreibenden Routen kommen hier vorbei, eine vierte käme es
    // auch. Wer sie umgehen wollte, müsste den Spieltag selbst laden — und genau das tut außer
    // dieser Stelle niemand.
    //
    // Dieselbe Antwort wie für „gibt es nicht" (R6): Ein Mitglied der Herren soll nicht
    // herausfinden können, ob eine bestimmte ID ein Spieltag der Damen ist.
    if (spieltag.getString('team') !== sitzung.mitglied.getString('team')) {
      return { fehler: { status: 400, message: 'Ungültige Angabe.' } }
    }

    if (spieltag.getBool('locked')) {
      return { fehler: { status: 403, message: 'Dieser Spieltag ist abgeschlossen.' } }
    }
    return { sitzung, spieltag }
  },

  /**
   * Findet den Datensatz eines Mitglieds zu einem Spieltag — die drei Tabellen responses, rides
   * und seat_claims haben alle denselben Zuschnitt (UNIQUE über fixture + member).
   */
  /**
   * Wer absagt, fährt nicht mehr und sitzt nirgends mehr mit.
   *
   * Ohne das bleibt beides stehen: Das Auto eines Abgesagten steht weiter im Fahrplan und bietet
   * Plätze an, die es nicht gibt — und der Aushang rechnet mit ihnen, wenn er sagt, wie viele
   * Zusagen ohne Mitfahrgelegenheit dastehen. Ein beanspruchter Platz wiederum blockiert weiter
   * einen, den jemand anders gebraucht hätte. Beides sah aus wie ein Fahrplan und war keiner.
   *
   * Die Mitfahrer eines gelöschten Autos verschwinden über cascadeDelete mit — dieselbe Folge
   * wie beim ausdrücklichen „Auto zurückziehen", und im Aushang wird vorher gefragt.
   *
   * Gibt zurück, was weggeräumt wurde; die Route schreibt es ins Protokoll.
   */
  absageAufraeumen(e, spieltagId, mitgliedId) {
    const fahrt = module.exports.eigenerSatz(e, 'rides', spieltagId, mitgliedId)
    const platz = module.exports.eigenerSatz(e, 'seat_claims', spieltagId, mitgliedId)
    let mitfahrer = 0
    if (fahrt) {
      mitfahrer = e.app.findRecordsByFilter('seat_claims', 'ride = {:r}', '', 20, 0, { r: fahrt.id }).length
      e.app.delete(fahrt)
    }
    if (platz) e.app.delete(platz)
    return { fahrt: !!fahrt, platz: !!platz, mitfahrer: mitfahrer }
  },

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
  /**
   * PocketBase liefert "2026-09-05 19:30:00.000Z" — mit Leerzeichen statt „T". Node schluckt das,
   * die JS-Engine von PocketBase nicht: dort kommt NaN heraus, und die Zeit fehlt stillschweigend.
   * Diese Stelle einmal richtig, statt an jeder Fundstelle neu — sie hat schon einmal Zeit
   * gekostet.
   *
   * @returns ISO-Zeichenkette, oder null bei leer und unlesbar
   */
  alsISO(wert) {
    const roh = String(wert === null || wert === undefined ? '' : wert).trim()
    if (!roh) return null
    const normalisiert = roh.replace(' ', 'T')
    const d = new Date(/[Zz]|[+-]\d\d:?\d\d$/.test(normalisiert) ? normalisiert : normalisiert + 'Z')
    return isNaN(d.getTime()) ? null : d.toISOString()
  },

  /**
   * Welche Fahrzeitwerte gelten für DIESEN Spieltag? — Abschnitt 6.3.
   *
   * Zwei Stufen, mehr nicht: der Spieltag, sonst der eingebaute Standard. Es gab einmal noch
   * eine zentrale Einstellung und einen Wert an der Mannschaft dazwischen — gedacht als
   * Bequemlichkeit, in der Bedienung aber das Gegenteil: Wer eine Abfahrtszeit erklären wollte,
   * musste an drei Stellen nachsehen.
   *
   * `-1` heißt „nicht gesetzt". Die Null ist beim Puffer ein gültiger Wunsch — ein Spieltag ohne
   * Rüstzeit — und taugt deshalb nicht als Platzhalter.
   */
  fahrzeitwerte(spieltag) {
    const eigenesTempo = spieltag.getInt('tempo_kmh')
    const eigenerPuffer = spieltag.getInt('puffer_minuten')
    return {
      tempo: eigenesTempo > 0 ? eigenesTempo : TEMPO_STANDARD,
      puffer: eigenerPuffer >= 0 ? eigenerPuffer : PUFFER_STANDARD,
    }
  },

  abfahrt(anwurfISO, km, istHeimspiel, tempo, puffer) {
    if (istHeimspiel) return null

    const anwurfISOSauber = this.alsISO(anwurfISO)
    if (!anwurfISOSauber) return null
    const anwurf = new Date(anwurfISOSauber)

    // Tempo und Puffer kommen aus den Einstellungen (Abschnitt 6.3). Die Standardwerte stehen
    // hier nur als letzte Rückfallebene — wer die Formel ändern will, tut das in der
    // Kapitänsansicht, nicht hier.
    const kmh = Number(tempo) > 0 ? Number(tempo) : TEMPO_STANDARD
    const zuschlag = Number(puffer) >= 0 ? Number(puffer) : PUFFER_STANDARD

    const fahrzeit = ((Number(km) || 0) / kmh) * 60 + zuschlag
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
