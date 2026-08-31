/// <reference path="../pb_data/types.d.ts" />
// Kapitänsansicht — Abschnitt 5, Admin-Teil.
//
// R5 · GETRENNTE ROUTER. Diese Routen teilen sich mit dem Mitgliederteil keine einzige Zeile
// Prüflogik: eigener Cookie-Name (dz_admin statt dz_sid), eigene Sitzungstabelle
// (admin_sessions), eigene Vorprüfung, eigener Pfad. Kein gemeinsamer Handler mit
// `if (isAdmin)` — genau dort entstehen die Fehler, bei denen ein Mitglied versehentlich
// Adminrechte bekommt.
//
// R13e · ZWEI PRÄFIXE, und der Präfix ist die Markierung. Was ein Kapitän braucht, liegt unter
// `/manage/api` und ist von außen erreichbar. Was nur die Rolle `admin` darf — Konten,
// Mannschaften anlegen und löschen, Einstellungen, Sicherungen —, liegt unter `/admin/api` und
// damit hinter dem Gate aus R13b.
//
// Die Rollenprüfung im Handler bleibt trotzdem stehen, jede einzelne. Der Präfix ist eine
// Aussage über den Proxy, und ein Proxy kann falsch konfiguriert sein; die Prüfung im Code kann
// es nicht. Wer eine Route verschiebt, verschiebt deshalb beides oder nichts.
//
// R13 · Angemeldet wird gegen PocketBases eigene `_superusers`-Collection. Kein selbstgebautes
// Passwort-Handling, kein eigener Hash, kein eigener Vergleich. Vor diesen Code gehört zusätzlich
// ein Gate in der Reverse-Proxy-Konfiguration (R13b, deploy/Caddyfile): IP-Allowlist oder eine
// vorgeschaltete Proxy-Anmeldung. Das ist die wirksamste Einzelmaßnahme, weil ein Fehler hier
// dann von außen gar nicht erst ansprechbar ist.
//
// ZUM ZWEITEN FAKTOR: `validatePassword()` weiter unten prüft das Passwort direkt und geht damit
// weiterhin an PocketBases eigenem MFA vorbei — ein im Dashboard am Superuser eingeschalteter
// zweiter Faktor schützt `/_/`, aber NICHT diesen Login. Dieser Login bringt seinen eigenen mit
// (`admin_totp`, siehe pb_hooks/totp.js): zeitbasierte Codes aus einer Authenticator-App, geprüft
// direkt hinter der Passwortprüfung. PocketBases MFA kam nicht in Frage, weil es Einmalcodes per
// E-Mail verschickt und diese App bewusst keinen Mailserver hat.
//
// Das Gate aus R13b bleibt trotzdem die wirksamste Einzelmaßnahme und ersetzt nichts davon.
//
// Alle Hilfen kommen aus adminauth.js und werden INNERHALB der Handler geholt. Funktionen im
// Modul-Scope stehen den Handlern nicht zur Verfügung — sie laufen in isolierten Laufzeiten.

// ── POST /manage/api/login ──────────────────────────────────────────────────────────────────
routerAdd('POST', '/manage/api/login', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const limit = require(`${__hooks}/ratelimit.js`)

  // R7 · Zwei Zähler, seit dieser Login ohne Gate im Netz steht (R13e), und beide zählen
  // FEHLVERSUCHE — nicht Anfragen.
  //
  // Pro IP: 5 Fehlversuche pro Minute, danach 15 Minuten Sperre. Bremst den einzelnen Anschluss.
  //
  // Pro Konto: 10 Fehlversuche in einer Viertelstunde. Ohne diesen Zähler wäre die IP-Grenze
  // wirkungslos, sobald jemand über viele Adressen anfragt — jede einzelne bliebe darunter, das
  // Konto bekäme trotzdem beliebig viele Versuche.
  //
  // **Anfragen zu zählen wäre hier derselbe Fehler wie beim Einlösen der Einladungslinks** (R7):
  // Acht Kapitäne im WLAN des Vereinsheims sind acht Anmeldungen von EINER öffentlichen Adresse.
  // Wer Anfragen zählt, sperrt die letzten drei aus, obwohl alle das richtige Passwort haben.
  //
  // Beim Zähler pro Konto kommt ein zweiter Grund dazu: Er lässt sich von außen füttern — wer die
  // Adresse eines Kapitäns kennt, könnte ihn sonst absichtlich aussperren. Zehn statt fünf hält
  // den ehrlichen Nutzer heraus; ein Tippfehler zu viel ist schnell passiert, zehn nicht.
  // Aufheben lässt sich eine Sperre durch Warten, durch den Admin (bei fremden Konten) oder
  // durch einen Neustart; sie liegt im Arbeitsspeicher.
  const ipSchluessel = `login:${e.realIP()}`
  const ipTakt = limit.istGesperrt(e.app, ipSchluessel)
  if (ipTakt.gesperrt) {
    return e.json(429, { message: `Zu viele Versuche. Warte ${ipTakt.wartenSekunden} Sekunden.` })
  }

  const koerper = e.requestInfo().body || {}
  const email = String(koerper.email || '')
  const passwort = String(koerper.password || '')
  const kontoSchluessel = `login:konto:${email.trim().toLowerCase()}`

  const kontoTakt = limit.istGesperrt(e.app, kontoSchluessel)
  if (kontoTakt.gesperrt) {
    return e.json(429, { message: `Zu viele Versuche. Warte ${kontoTakt.wartenSekunden} Sekunden.` })
  }

  /** Ein Fehlversuch zählt auf beide Konten — auf die Adresse und auf den Anschluss. */
  const danebenGegriffen = () => {
    limit.pruefen(e.app, ipSchluessel, 5, 60, 900)
    limit.pruefen(e.app, kontoSchluessel, 10, 900, 900)
  }

  // Abschnitt 12 · Zwei Quellen, in dieser Reihenfolge: die Verwalterkonten der Kapitäne, dann
  // der Superuser. Beide Male prüft PocketBase das Passwort selbst (R13) — nur die Tabelle ist
  // eine andere. Der Superuser bleibt immer anmeldefähig; er ist der Rettungsanker, wenn beim
  // Verteilen der Rollen etwas schiefgeht.
  let konto = null
  try {
    konto = e.app.findAuthRecordByEmail('verwalter', email)
  } catch {
    konto = null
  }
  if (!konto) {
    try {
      konto = e.app.findAuthRecordByEmail('_superusers', email)
    } catch {
      konto = null
    }
  }

  // R6 · Falsche Adresse und falsches Passwort liefern dieselbe Antwort — kein Hinweis darauf,
  // welche Adressen es gibt.
  //
  // Ehrlich gesagt: die ANTWORTZEIT unterscheidet sich trotzdem. Bei einer bekannten Adresse
  // läuft eine bcrypt-Prüfung, bei einer unbekannten nicht. Diese Lücke lässt sich ohne einen
  // künstlichen Vergleich mit exakt denselben Kosten nicht schließen. Was sie zumacht, ist die
  // Sperre oben: nach fünf Versuchen ist eine Viertelstunde Ruhe, also höchstens fünf prüfbare
  // Adressen pro Viertelstunde — allerdings pro IP und nur im Arbeitsspeicher. Zusammen mit dem
  // vorgeschalteten Gate aus R13b ist das der Punkt, an dem sich weiterer Aufwand nicht mehr
  // lohnt; ohne dieses Gate wäre es das nicht.
  if (!konto || !konto.validatePassword(passwort)) {
    danebenGegriffen()
    return e.json(401, { message: 'Anmeldung fehlgeschlagen.' })
  }

  // ── Zweiter Faktor (Abschnitt 9) ──────────────────────────────────────────────────────────
  // Hier war die Lücke, die der Kopf dieser Datei jahrelang angekündigt hat: `validatePassword()`
  // geht an PocketBases MFA vorbei, ein am Superuser eingeschalteter zweiter Faktor schützte
  // deshalb nur `/_/`, nicht diesen Login. Jetzt prüft er hier selbst.
  //
  // Unbestätigte Einträge zählen nicht. Wer die Einrichtung abbricht, bevor ein Code gestimmt
  // hat, sperrt sich sonst selbst aus — und zwar aus einer Ansicht, die er braucht, um es
  // rückgängig zu machen.
  let totpSatz = null
  try {
    totpSatz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m} && confirmed = true', {
      m: email,
    })
  } catch {
    totpSatz = null
  }

  if (totpSatz) {
    const totp = require(`${__hooks}/totp.js`)
    const code = String(koerper.code || '')

    // Ohne Code ist das keine fehlgeschlagene Anmeldung, sondern eine halbe: Der Client soll
    // das Codefeld zeigen und es noch einmal versuchen. Preisgegeben wird damit nichts, was
    // nicht schon feststeht — wer bis hierher kommt, hat das richtige Passwort.
    if (!code) {
      return e.json(401, { mfa: true, message: 'Code aus der Authenticator-App nötig.' })
    }

    const schritt = totp.pruefen(
      totpSatz.getString('secret'),
      code,
      Math.floor(Date.now() / 1000),
      totpSatz.getInt('last_step'),
    )

    if (schritt) {
      // Verbrauchen, damit derselbe Code kein zweites Mal gilt.
      try {
        totpSatz.set('last_step', schritt)
        e.app.save(totpSatz)
      } catch {
        /* nicht schlimm genug, um die Anmeldung scheitern zu lassen */
      }
    } else {
      // Kein gültiger Zeitcode — vielleicht ein Wiederherstellungscode. Das Handy ist weg, der
      // Zettel ist da. Beides wird an derselben Stelle eingegeben: Wer in dieser Lage ist, soll
      // nicht erst einen anderen Knopf suchen müssen.
      const uebrig = totp.codeEinloesen(totpSatz.getString('codes'), code)
      if (uebrig === null) {
        danebenGegriffen()
        return e.json(401, { mfa: true, message: 'Der Code stimmt nicht.' })
      }
      totpSatz.set('codes', uebrig)
      e.app.save(totpSatz)
      u.protokollieren(e.app, `admin:${email}`, 'admin.totp.recovery', '', '', `${uebrig.length} übrig`)
    }
  }

  // Erst JETZT zurücksetzen. Stünde das oben hinter dem Passwort, könnte jemand mit dem
  // richtigen Passwort beliebig viele Codes durchprobieren, ohne je an die Sperre zu stoßen.
  limit.zuruecksetzen(e.app, ipSchluessel)
  limit.zuruecksetzen(e.app, kontoSchluessel)

  // Eigene Sitzung, eigener Cookie-Name, eigene Pfade. Der PocketBase-Token landet NICHT im
  // Browser — weder im Cookie noch in localStorage (R13).
  //
  // „Angemeldet bleiben" entscheidet der Nutzer pro Gerät. Die Laufzeit steht an der Sitzung,
  // nicht nur am Cookie: gälte sie nur dort, wäre ein abgegriffener Wert unbegrenzt gültig.
  //
  // ABER: die 90 Tage gibt es NUR mit zweitem Faktor. Ohne ihn bleibt es bei 12 Stunden, auch
  // wenn der Haken gesetzt war. Der Grund ist eine Abwägung, keine Schikane: Ein Gerät, das drei
  // Monate lang angemeldet bleibt, ist ein Passwort, das drei Monate lang niemand mehr eingibt —
  // wer es findet, ist drin. Mit einem zweiten Faktor ist wenigstens die Anmeldung selbst nicht
  // allein mit dem Passwort zu haben. Damit bleibt TOTP freiwillig, aber wer es einschaltet,
  // bekommt etwas dafür. Das ist der ehrlichere Weg als eine Pflicht: Bequemlichkeit als Anreiz
  // statt einer Vorschrift, die die Leute umgehen.
  const dauer = koerper.bleiben === true && totpSatz ? a.ADMIN_DAUER_LANG : a.ADMIN_DAUER
  const sid = $security.randomStringWithAlphabet(43, a.B64URL)
  const satz = new Record(e.app.findCollectionByNameOrId('admin_sessions'))
  satz.set('sid_hash', $security.sha256(sid))
  satz.set('email', email)
  satz.set('dauer', dauer)
  satz.set('last_seen', new DateTime())
  e.app.save(satz)

  a.cookiesSetzen(e, sid, dauer)

  u.protokollieren(e.app, `admin:${email}`, 'admin.login', '', dauer === a.ADMIN_DAUER_LANG ? 'angemeldet bleiben' : '', '')
  // `bleiben` sagt dem Client, was er BEKOMMEN hat, nicht was er wollte. Wer den Haken ohne
  // zweiten Faktor setzt, soll erfahren, warum er trotzdem wieder herausfliegt.
  return e.json(200, { ok: true, email, bleiben: dauer === a.ADMIN_DAUER_LANG })
})

// ── POST /manage/api/logout ─────────────────────────────────────────────────────────────────
routerAdd('POST', '/manage/api/logout', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const satz = a.sitzung(e)
  if (satz) {
    try {
      e.app.delete(satz)
    } catch {
      /* schon weg */
    }
  }
  a.cookiesLoeschen(e)
  return e.json(200, { ok: true })
})

// ── GET /manage/api/me ──────────────────────────────────────────────────────────────────────
routerAdd('GET', '/manage/api/me', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const kontext = a.kontext(e)
  if (!kontext) return e.json(404, { message: 'Nicht gefunden.' })

  // Die Oberfläche braucht drei Dinge: wer man ist, was man darf, und welche Mannschaften zur
  // Auswahl stehen. Ein Kapitän bekommt genau eine — die Umschaltung erscheint bei ihm gar
  // nicht erst, und selbst wenn er sie sich herbeiredete, hielte der Server dagegen.
  let teams = []
  try {
    const filter = kontext.rolle === 'kapitaen' ? 'id = {:t}' : "id != ''"
    teams = e.app
      .findRecordsByFilter('teams', filter, 'sort,name', 50, 0, { t: kontext.team })
      .map((t) => ({ id: t.id, name: t.getString('name') }))
  } catch {
    teams = []
  }

  // Hat dieses Konto einen zweiten Faktor? Nur die Auskunft, nie das Geheimnis.
  //
  // Die Oberfläche braucht sie für die Ersteinrichtung: Für Admin-Konten ist der Faktor Pflicht
  // (R13), und ohne ihn antwortet alles unter /admin/api mit 403. Ohne diese Auskunft erführe
  // der frisch eingerichtete Betreiber das erst, wenn er auf „Konten" klickt und einen roten
  // Kasten bekommt — eine Bedingung, die man von Anfang an sagen kann, gehört an den Anfang.
  let totp = false
  try {
    totp = !!e.app.findFirstRecordByFilter('admin_totp', 'email = {:m} && confirmed = true', {
      m: kontext.email,
    })
  } catch {
    totp = false
  }

  return e.json(200, {
    email: kontext.email,
    rolle: kontext.rolle,
    team: kontext.team,
    mitglied: kontext.mitglied,
    teams: teams,
    totp: totp,
  })
})

// ── POST /manage/api/spieleransicht · Als Spieler weitermachen (Abschnitt 12) ───────────────
// Der Kapitän spielt meistens selbst mit. Für „wie steht es" und die eigene Zu- oder Absage
// braucht er die Kapitänsansicht gar nicht — dafür hat er, wie jeder andere, seinen
// persönlichen Einladungslink.
//
// Nur: Diesen Link kann ihm niemand zeigen. In `members` steht ausschließlich der HASH des
// Tokens (R1), der Klartext existiert nach dem Ausstellen nirgends mehr. Ein Knopf „hier ist
// dein Link" wäre also nur um den Preis zu haben, das Token wieder auszustellen — und damit den
// alten Link auf allen anderen Geräten des Kapitäns zu entwerten.
//
// Deshalb dieser Weg: Wer angemeldet ist und einen Spielereintrag hat, bekommt hier eine
// MITGLIEDER-Sitzung für genau diesen Eintrag. Kein Token wandert dabei durch die Gegend.
//
// R5, und warum das hier keine Verletzung ist: Die beiden Bereiche bleiben getrennt — getrennte
// Tabellen, getrennte Cookies, getrennte Prüfung. Hier wird nichts vermischt, sondern eine
// zweite Sitzung ausgestellt, und zwar nur für den Eintrag, der am eigenen Konto hängt. Die
// Rechte werden dabei ausschließlich KLEINER: Wer die Spieltage seiner Mannschaft ändern darf,
// darf erst recht seine eigene Rückmeldung setzen. Die Kapitänssitzung bleibt bestehen, der Weg
// zurück ist also ein Klick.
routerAdd('POST', '/manage/api/spieleransicht', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)

  const mitgliedId = vor.kontext.mitglied
  // Kein Spielerbezug: Das ist der Admin oder ein Kapitän, der nur organisiert. R6 — für ihn
  // gibt es diese Route schlicht nicht.
  if (!mitgliedId) return e.json(404, { message: 'Nicht gefunden.' })

  let mitglied
  try {
    mitglied = e.app.findRecordById('members', mitgliedId)
  } catch {
    return e.json(404, { message: 'Nicht gefunden.' })
  }
  if (!mitglied || !mitglied.getBool('active')) return e.json(404, { message: 'Nicht gefunden.' })

  u.sessionStarten(e, mitglied)
  a.protokoll(e, 'admin.spieleransicht', mitglied.id, '', mitglied.getString('name'))
  return e.json(200, { ok: true })
})

// ── Spieltage ───────────────────────────────────────────────────────────────────────────────
routerAdd('GET', '/manage/api/fixtures', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  // Abschnitt 12 · Ein Kapitän sieht nur seine Mannschaft, der Gesamt-Admin die gewählte oder
  // alle. `teamFuer` liest den Wunsch aus dem Request NUR für den Gesamt-Admin — bei einem
  // Kapitän steht dort immer die eigene, egal was er mitschickt.
  const team = a.teamFuer(kontext, (e.requestInfo().query || {}).team)
  const alle = team
    ? e.app.findRecordsByFilter('fixtures', 'team = {:t}', 'date', 500, 0, { t: team })
    : e.app.findRecordsByFilter('fixtures', "id != ''", 'date', 500, 0)

  // Der Kapitän soll sehen, was seine Mannschaft sieht: „4/4 zugesagt · 2 Plätze frei". Ohne
  // diese drei Felder stand in seiner Liste nur, gegen wen und wann gespielt wird — und der
  // Zweck des Produkts laut PRODUCT.md ist gerade, dass er NICHT nachzählen muss.
  //
  // Wie im Aushang alles auf einmal holen und im Speicher zuordnen, statt pro Spieltag drei
  // Abfragen zu fahren. Die Eingrenzung geht über die Beziehung zum Spieltag, weil an
  // Rückmeldung, Fahrt und Platz selbst kein Mannschaftsfeld hängt — beim Gesamt-Admin ohne
  // gewählte Mannschaft fällt sie weg, er darf ohnehin alles sehen.
  const eingrenzung = team ? 'fixture.team = {:t}' : "id != ''"
  const parameter = team ? { t: team } : {}
  const proSpieltag = (satzListe) => {
    const map = {}
    for (const satz of satzListe) {
      const schluessel = satz.getString('fixture')
      if (!map[schluessel]) map[schluessel] = []
      map[schluessel].push(satz)
    }
    return map
  }
  const rMap = proSpieltag(e.app.findRecordsByFilter('responses', eingrenzung, '', 5000, 0, parameter))
  const fMap = proSpieltag(e.app.findRecordsByFilter('rides', eingrenzung, '', 5000, 0, parameter))
  const pMap = proSpieltag(e.app.findRecordsByFilter('seat_claims', eingrenzung, '', 5000, 0, parameter))

  return e.json(200, {
    items: alle.map((s) => ({
      id: s.id,
      date: s.getDateTime('date').string(),
      opponent_club: s.getString('opponent_club'),
      opponent_town: s.getString('opponent_town'),
      is_home: s.getBool('is_home'),
      venue: s.getString('venue'),
      km: s.getInt('km'),
      team: s.getString('team'),
      meeting_point: s.getString('meeting_point'),
      departure_manual: s.getDateTime('departure_manual').string(),
      tempo_kmh: s.getInt('tempo_kmh'),
      puffer_minuten: s.getInt('puffer_minuten'),
      // Was tatsächlich gilt, samt Herkunft — die Eingabemaske zeigt daneben an, was ein leeres
      // Feld bedeutet, und muss dafür nicht selbst rechnen (die Formel bleibt im Backend).
      tempo_effektiv: u.fahrzeitwerte(s).tempo,
      puffer_effektiv: u.fahrzeitwerte(s).puffer,
      departure_berechnet: (() => {
        const w = u.fahrzeitwerte(s)
        return u.abfahrt(s.getDateTime('date').string(), s.getInt('km'), s.getBool('is_home'), w.tempo, w.puffer)
      })(),
      needed_players: s.getInt('needed_players'),
      locked: s.getBool('locked'),
      // Aus dem Spielplan übernommen? Der Kapitän soll sehen, welche Spieltage noch auf ihn
      // warten: Ort, Kilometer und Treffpunkt stehen in keinem Verbands-Export. Der Schlüssel
      // selbst geht bewusst NICHT hinaus — er ist eine Innerei des Imports, und für die
      // Anzeige genügt die Frage, ob es einen gibt.
      aus_spielplan: s.getString('source_key') !== '',
      // Dieselbe Gestalt wie im Aushang (board.pb.js), damit die Kapitänsansicht denselben
      // Satz rechnen kann und nicht eine zweite, abweichende Wahrheit entsteht.
      responses: (() => {
        const r = {}
        for (const satz of rMap[s.id] || []) r[satz.getString('member')] = satz.getString('status')
        return r
      })(),
      rides: (() => {
        const belegung = {}
        for (const p of pMap[s.id] || []) {
          const fahrt = p.getString('ride')
          belegung[fahrt] = (belegung[fahrt] || 0) + 1
        }
        return (fMap[s.id] || []).map((f) => ({
          id: f.id,
          member: f.getString('member'),
          seats: f.getInt('seats'),
          taken: belegung[f.id] || 0,
        }))
      })(),
    })),
  })
})

routerAdd('POST', '/manage/api/fixtures', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  const koerper = e.requestInfo().body || {}
  if (!String(koerper.opponent_town || '').trim() || !String(koerper.date || '').trim()) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  // Abschnitt 12 · Ohne Mannschaft kein Spieltag. Der Kapitän bekommt seine eigene zugewiesen,
  // der Gesamt-Admin muss sagen, für welche. Das Schema lehnte es ohnehin ab — hier steht es,
  // damit die Meldung verständlich ist statt einer Datenbankfehlermeldung.
  const team = a.teamFuer(kontext, koerper.team)
  // Zwei verschiedene Gründe, zwei verschiedene Sätze. „Es ist keine gewählt" ist ein Zustand,
  // den der Anfragende ändern kann und deshalb erfahren soll — er hat gerade ein Formular
  // ausgefüllt. „Diese darfst du nicht" bleibt wortkarg: Ob es die fremde Mannschaft überhaupt
  // gibt, geht ihn nichts an (R6).
  if (!team) return e.json(400, { message: 'Wähle zuerst eine Mannschaft aus.' })
  if (!a.darfTeam(kontext, team)) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  // Für den Admin lässt `darfTeam` jede Mannschaft zu — auch eine, die es nicht gibt. Ohne
  // diese Zeile fiel eine erfundene Kennung erst beim Speichern auf, und PocketBase antwortete
  // mit "Failed to find all relation records with the provided ids.": englischer Rohtext aus der
  // Datenbank, genau das, was der Kommentar oben zu verhindern verspricht. Dieselbe Meldung wie
  // oben, damit „darfst du nicht" und „gibt es nicht" von außen gleich aussehen (R6).
  try {
    e.app.findRecordById('teams', team)
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const satz = new Record(e.app.findCollectionByNameOrId('fixtures'))
  satz.set('team', team)
  // PocketBase kennt keine Defaultwerte — was Abschnitt 3 als „default" führt, muss hier stehen.
  // Bei Tempo und Puffer ist der Standard „nicht gesetzt", nicht die Null: 0 hieße ein Tempo von
  // null und einen Spieltag ohne Abfahrtszeit.
  satz.set('tempo_kmh', -1)
  satz.set('puffer_minuten', -1)
  satz.set('needed_players', 4)
  satz.set('km', 0)
  satz.set('locked', false)
  const fehler = a.spieltagUebernehmen(satz, koerper)
  if (fehler) return e.json(400, { message: fehler })

  e.app.save(satz)
  a.protokoll(e, 'fixture.create', satz.id, '', satz.getString('opponent_town'))
  return e.json(200, { id: satz.id })
})

routerAdd('PATCH', '/manage/api/fixtures/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  let satz
  try {
    satz = e.app.findRecordById('fixtures', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  // Dieselbe Antwort wie „gibt es nicht" (R6) — ein Kapitän soll nicht durchprobieren können,
  // welche IDs zu anderen Mannschaften gehören.
  if (!a.darfTeam(kontext, satz.getString('team'))) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  const fehler = a.spieltagUebernehmen(satz, e.requestInfo().body || {})
  if (fehler) return e.json(400, { message: fehler })

  e.app.save(satz)
  a.protokoll(e, 'fixture.update', satz.id, '', satz.getString('opponent_town'))
  return e.json(200, { ok: true })
})

routerAdd('DELETE', '/manage/api/fixtures/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  let satz
  try {
    satz = e.app.findRecordById('fixtures', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (!a.darfTeam(kontext, satz.getString('team'))) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  const wohin = satz.getString('opponent_town')
  // Rückmeldungen, Fahrten und Mitfahrer verschwinden über cascadeDelete mit.
  e.app.delete(satz)
  a.protokoll(e, 'fixture.delete', e.request.pathValue('id'), wohin, '')
  return e.json(200, { ok: true })
})

// ── POST /admin/api/fixtures/import · Spielplan aus einem Verbands-Export ───────────────────
// Schritt 8 („Echtdaten“). Gelesen und zugeordnet wird die Datei im Browser
// (`app/src/spielplan.ts`) - hier kommt eine fertige Liste an. Geprüft wird sie trotzdem noch
// einmal vollständig: Was aus dem Browser kommt, ist eine Behauptung.
//
// **Nur der Admin.** Ein Verbands-Export umfasst den ganzen VEREIN, also alle Mannschaften. Wer
// ihn einliest, schreibt damit in fremde Mannschaften — für einen Kapitän wäre das die Grenze
// aus R13d. Ein Kapitän sieht das Ergebnis in seiner Ansicht, einlesen tut es der Admin.
//
// Wiedererkannt wird an `source_key`. Daraus folgen die drei Regeln, die diesen Endpunkt von
// einem gewöhnlichen Anlegen unterscheiden:
//   • Von Hand angelegte Spieltage haben keinen Schlüssel und werden nie angefasst.
//   • Ein gesperrter Spieltag bleibt unberührt — „nach dem Spiel keine Änderungen mehr“ gilt
//     auch für den Import, sonst überschriebe ein Nachimport im Frühjahr die halbe Hinrunde.
//   • Was der Kapitän ergänzt hat, bleibt stehen, solange die Datei nichts dazu sagt. Ort und
//     Kilometer kennt ein Verbands-Export nicht — die selbst ausgefüllte Vorlage schon, und
//     dann sind sie eine Angabe und keine Lücke. Leer heißt deshalb „nicht angerührt", nicht
//     „auf leer setzen"; Treffpunkt und benötigte Spieler bleiben in jedem Fall unberührt.
routerAdd('POST', '/admin/api/fixtures/import', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  if (vor.kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  const koerper = e.requestInfo().body || {}
  const zeilen = koerper.zeilen
  // KEIN Array.isArray: was aus dem Rumpf kommt, ist im JSVM ein Go-Slice, und darauf antwortet
  // Array.isArray mit false. Gezählt wird deshalb über .length.
  const anzahl = Number(zeilen && zeilen.length) || 0
  if (anzahl === 0) return e.json(400, { message: 'Es ist nichts zu übernehmen.' })
  // Ein Vereinsspielplan hat gut 130 Zeilen. Die Grenze ist großzügig und trotzdem eine
  // Grenze: ein einzelner Aufruf soll die Datenbank nicht minutenlang beschäftigen.
  if (anzahl > 600) {
    return e.json(400, { message: 'Zu viele Begegnungen auf einmal — höchstens 600.' })
  }

  // Einmal lesen statt einmal je Zeile. Bei 128 Begegnungen ist der Unterschied zwischen einer
  // Abfrage und 128 spürbar.
  const vorhanden = {}
  for (const satz of e.app.findAllRecords('fixtures')) {
    const schluessel = satz.getString('source_key')
    if (schluessel) vorhanden[schluessel] = satz
  }
  const bekannteTeams = {}

  let neu = 0
  let geaendert = 0
  let unveraendert = 0
  let gesperrt = 0

  for (let i = 0; i < anzahl; i++) {
    const z = zeilen[i] || {}
    const schluessel = String(z.quelle || '').trim()
    const team = String(z.team || '').trim()
    const datum = String(z.date || '').trim()
    const gegner = String(z.opponent_club || '').trim()
    const lokal = String(z.venue || '').trim()

    if (!schluessel || schluessel.length > 120) {
      return e.json(400, { message: `Zeile ${i + 1}: unbrauchbare Herkunftsangabe.` })
    }
    if (!datum || isNaN(new Date(datum.replace(' ', 'T')).getTime())) {
      return e.json(400, { message: `Zeile ${i + 1}: unbrauchbarer Termin.` })
    }
    const ort = String(z.opponent_town || '').trim()
    const km = z.km === undefined || z.km === null || z.km === '' ? null : Number(z.km)
    if (gegner.length > 80 || lokal.length > 120 || ort.length > 80) {
      return e.json(400, { message: `Zeile ${i + 1}: Angabe zu lang.` })
    }
    if (km !== null && (!isFinite(km) || km < 0 || km > 2000 || km !== Math.round(km))) {
      return e.json(400, { message: `Zeile ${i + 1}: unbrauchbare Kilometerangabe.` })
    }
    if (!team) return e.json(400, { message: `Zeile ${i + 1}: keine Mannschaft zugeordnet.` })
    if (!bekannteTeams[team]) {
      try {
        e.app.findRecordById('teams', team)
        bekannteTeams[team] = true
      } catch {
        return e.json(400, { message: `Zeile ${i + 1}: unbekannte Mannschaft.` })
      }
    }

    const alt = vorhanden[schluessel]
    if (alt) {
      if (alt.getBool('locked')) {
        gesperrt++
        continue
      }
      const abbild = (satz) =>
        [
          satz.getString('team'),
          satz.getDateTime('date').string(),
          satz.getString('opponent_club'),
          satz.getBool('is_home') ? '1' : '0',
          satz.getString('venue'),
          satz.getString('opponent_town'),
          String(satz.getInt('km')),
        ].join(' ')
      const vorher = abbild(alt)
      alt.set('team', team)
      alt.set('date', datum)
      alt.set('opponent_club', gegner)
      alt.set('is_home', !!z.is_home)
      alt.set('venue', lokal)
      // Nur wenn die Datei etwas dazu sagt. Ein leeres Feld ist keine Aussage — sonst löschte
      // ein Nachimport aus dem Verbands-Export genau die Angaben, die der Kapitän mühsam
      // nachgetragen hat.
      if (ort) alt.set('opponent_town', ort)
      if (km !== null && km > 0) alt.set('km', km)
      if (abbild(alt) === vorher) {
        unveraendert++
        continue
      }
      e.app.save(alt)
      geaendert++
      continue
    }

    const satz = new Record(e.app.findCollectionByNameOrId('fixtures'))
    satz.set('team', team)
    satz.set('source_key', schluessel)
    satz.set('date', datum)
    satz.set('opponent_club', gegner)
    satz.set('is_home', !!z.is_home)
    satz.set('venue', lokal)
    // Der Export kennt sie nicht — und PocketBase kennt keine Defaultwerte. Ohne diese Zeilen
    // stünde überall 0: ein Tempo von null und ein Spieltag ohne Abfahrtszeit.
    satz.set('opponent_town', ort)
    satz.set('meeting_point', '')
    satz.set('tempo_kmh', -1)
    satz.set('puffer_minuten', -1)
    satz.set('needed_players', 4)
    satz.set('km', km === null ? 0 : km)
    satz.set('locked', false)
    e.app.save(satz)
    neu++
  }

  a.protokoll(e, 'fixture.import', '', '', `${neu} neu, ${geaendert} geändert, ${gesperrt} gesperrt`)
  return e.json(200, { neu, geaendert, unveraendert, gesperrt })
})

// ── Mitglieder ──────────────────────────────────────────────────────────────────────────────
routerAdd('GET', '/manage/api/members', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  // Die Grenze steht in utils.js, weil der Aushang dieselbe braucht. Im Modul-Scope dieser
  // Datei wäre sie den Handlern nicht zugänglich — jeder läuft in einer eigenen Laufzeit.
  const u = require(`${__hooks}/utils.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  const team = a.teamFuer(kontext, (e.requestInfo().query || {}).team)
  const alle = team
    ? e.app.findRecordsByFilter('members', 'team = {:t}', 'sort,name', u.MITGLIEDER_GRENZE, 0, { t: team })
    : e.app.findRecordsByFilter('members', "id != ''", 'sort,name', u.MITGLIEDER_GRENZE, 0)

  // Wie viele es WIRKLICH sind — gezählt, nicht geholt. Ohne diese Zahl könnte die Ansicht den
  // Unterschied zwischen „200 Spieler" und „mehr als 200, der Rest fehlt hier" nicht kennen:
  // Sie sieht in beiden Fällen genau 200 Zeilen. Genau das war die stille Grenze.
  const gesamt = team ? e.app.countRecords('members', $dbx.hashExp({ team })) : e.app.countRecords('members')

  return e.json(200, {
    grenze: u.MITGLIEDER_GRENZE,
    gesamt,
    items: alle.map((m) => {
      const sitzungen = e.app.findRecordsByFilter('sessions', 'member = {:m}', '', 50, 0, { m: m.id })
      return {
        id: m.id,
        team: m.getString('team'),
        name: m.getString('name'),
        active: m.getBool('active'),
        sort: m.getInt('sort'),
        note: m.getString('note'),
        // R1 · Der Hash verlässt den Server nicht. Nur die Aussage, OB ein Token ausgestellt
        // wurde, und wann.
        hat_token: m.getString('token_hash') !== '',
        token_issued_at: m.get('token_issued_at') ? m.getDateTime('token_issued_at').string() : '',
        geraete: sitzungen.length,
      }
    }),
  })
})

routerAdd('POST', '/manage/api/members', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  const koerper = e.requestInfo().body || {}
  const name = String(koerper.name || '').trim()
  if (!name) return e.json(400, { message: 'Ungültige Angabe.' })

  const team = a.teamFuer(kontext, koerper.team)
  // Zwei verschiedene Gründe, zwei verschiedene Sätze. „Es ist keine gewählt" ist ein Zustand,
  // den der Anfragende ändern kann und deshalb erfahren soll — er hat gerade ein Formular
  // ausgefüllt. „Diese darfst du nicht" bleibt wortkarg: Ob es die fremde Mannschaft überhaupt
  // gibt, geht ihn nichts an (R6).
  if (!team) return e.json(400, { message: 'Wähle zuerst eine Mannschaft aus.' })
  if (!a.darfTeam(kontext, team)) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  // Für den Admin lässt `darfTeam` jede Mannschaft zu — auch eine, die es nicht gibt. Ohne
  // diese Zeile fiel eine erfundene Kennung erst beim Speichern auf, und PocketBase antwortete
  // mit "Failed to find all relation records with the provided ids.": englischer Rohtext aus der
  // Datenbank, genau das, was der Kommentar oben zu verhindern verspricht. Dieselbe Meldung wie
  // oben, damit „darfst du nicht" und „gibt es nicht" von außen gleich aussehen (R6).
  try {
    e.app.findRecordById('teams', team)
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const satz = new Record(e.app.findCollectionByNameOrId('members'))
  satz.set('team', team)
  satz.set('name', name)
  // Ohne dieses Feld wäre das neue Mitglied sofort inaktiv und käme nicht herein — PocketBase
  // kennt keine Defaultwerte.
  satz.set('active', true)
  satz.set('sort', Number(koerper.sort) || 0)
  satz.set('note', String(koerper.note || ''))
  satz.set('token_hash', '')
  e.app.save(satz)

  a.protokoll(e, 'member.create', satz.id, '', name)
  return e.json(200, { id: satz.id })
})

routerAdd('PATCH', '/manage/api/members/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  let satz
  try {
    satz = e.app.findRecordById('members', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (!a.darfTeam(kontext, satz.getString('team'))) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  const koerper = e.requestInfo().body || {}
  const vorher = satz.getBool('active')

  if ('name' in koerper) {
    const name = String(koerper.name || '').trim()
    if (!name) return e.json(400, { message: 'Ungültige Angabe.' })
    satz.set('name', name)
  }
  if ('active' in koerper) satz.set('active', !!koerper.active)
  if ('sort' in koerper) satz.set('sort', Number(koerper.sort) || 0)
  if ('note' in koerper) satz.set('note', String(koerper.note || ''))
  e.app.save(satz)

  // Wer deaktiviert wird, fliegt sofort von allen Geräten. Ohne das bliebe die Sitzung bestehen
  // und der Zugang faktisch offen — die Prüfung in mitgliedAusSession fängt es zwar ab, aber
  // die Sitzung soll gar nicht erst liegen bleiben.
  if (vorher && !satz.getBool('active')) {
    for (const s of e.app.findRecordsByFilter('sessions', 'member = {:m}', '', 100, 0, { m: satz.id })) {
      try {
        e.app.delete(s)
      } catch {
        /* schon weg */
      }
    }
  }

  a.protokoll(e, 'member.update', satz.id, String(vorher), String(satz.getBool('active')))
  return e.json(200, { ok: true })
})

// ── DELETE /manage/api/members/{id} · Einen Spieler wirklich entfernen ──────────────────────
// Bis hierher gab es nur „inaktiv“: Der Spieler verschwindet aus den Listen, der Datensatz
// bleibt. Das ist im Betrieb richtig - wer aufhoert, hat trotzdem letzten Monat mitgespielt, und
// seine Rückmeldungen gehören zu Spieltagen, die es noch gibt.
//
// Nach der Saison stimmt das nicht mehr. Deshalb hier ein echtes Loeschen, aber MIT WACHE:
// erlaubt nur, wenn an diesem Spieler nichts mehr hängt. Wer Historie hat, wird erst durch das
// Aufräumen der alten Spieltage löschbar - und dann ist der Verlust auch keiner mehr.
//
// Die Wache ist kein Misstrauen gegen den Kapitaen, sondern gegen den Klick: Die Beziehungen
// hängen an cascadeDelete, ein Loeschen nähme Rückmeldungen, Fahrten und Mitfahrer lautlos
// mit. Was mitgeht, soll man vorher wissen.
routerAdd('DELETE', '/manage/api/members/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)

  let satz
  try {
    satz = e.app.findRecordById('members', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (!a.darfTeam(vor.kontext, satz.getString('team'))) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  // Was hängt noch dran? Gezaehlt wird einzeln, damit die Meldung sagen kann, WAS im Weg ist.
  let rueckmeldungen = 0
  let fahrten = 0
  for (const [was, ziel] of [['responses', 'r'], ['rides', 'f'], ['seat_claims', 'f']]) {
    const treffer = e.app.findRecordsByFilter(was, 'member = {:m}', '', 200, 0, { m: satz.id })
    if (ziel === 'r') rueckmeldungen += treffer.length
    else fahrten += treffer.length
  }
  if (rueckmeldungen > 0 || fahrten > 0) {
    const teile = []
    if (rueckmeldungen > 0) teile.push(`${rueckmeldungen} Rückmeldung(en)`)
    if (fahrten > 0) teile.push(`${fahrten} Fahrt(en) oder Mitfahrten`)
    return e.json(409, {
      message: `An diesem Spieler hängen noch ${teile.join(' und ')}. Erst die Spieltage der alten Saison aufräumen, dann geht es.`,
    })
  }

  // Ein Kapitän, der mitspielt, hängt mit seinem KONTO an diesem Eintrag. Die Beziehung hat
  // ausdruecklich kein cascadeDelete, das Konto überlebte es also - aber lautlos die
  // Spieleransicht eines Kollegen abzuschalten ist keine Freundlichkeit.
  const konten = e.app.findRecordsByFilter('verwalter', 'mitglied = {:m}', '', 1, 0, { m: satz.id })
  if (konten.length) {
    return e.json(409, {
      message: 'Zu diesem Spieler gehört ein Kapitänskonto. Erst dort die Verknüpfung lösen.',
    })
  }

  const name = satz.getString('name')
  e.app.delete(satz)
  a.protokoll(e, 'member.delete', satz.id, name, '')
  return e.json(200, { ok: true })
})

// ── POST /admin/api/spieltage/aufraeumen · Saisonende ───────────────────────────────────────
// Der Löschjob raeumt Spieltage nach zwölf Monaten von selbst weg (Abschnitt 8). Das ist die
// Untergrenze fuer den Datenschutz, aber kein Werkzeug: Wer nach der Saison Ordnung machen oder
// eine Testmannschaft loswerden will, wartet nicht ein Jahr.
//
// Zwei Regler, weil es zwei Anlässe gibt: ein Datum (alles davor) und wahlweise eine einzelne
// Mannschaft. Beide zusammen decken „Saison abschließen“ und „Testdaten weg“ ab, ohne dass es
// zwei Funktionen braucht.
//
// Nur der Admin, und nur mit zweitem Faktor: Das hier nimmt Rückmeldungen und Fahrten per
// Kaskade mit, und die Vorschau in der Oberflaeche sagt vorher, wie viele es sind.
routerAdd('POST', '/admin/api/spieltage/aufraeumen', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  if (vor.kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  const koerper = e.requestInfo().body || {}
  const bis = String(koerper.bis || '').trim()
  // Erwartet wird ein Datum, kein Zeitpunkt: „bis einschließlich diesem Tag“.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bis)) return e.json(400, { message: 'Ungültiges Datum.' })
  // Verglichen wird gegen den ANFANG des Folgetags, nicht gegen 23:59:59 desselben. Sonst
  // entschiede die letzte Sekunde eines Tages darüber, ob ein Spieltag mitgeht — und die
  // Vorschau in der Oberfläche, die nur auf das Datum sieht, zählte etwas anderes als der
  // Server löscht.
  const tag = new Date(`${bis}T00:00:00Z`)
  if (isNaN(tag.getTime())) return e.json(400, { message: 'Ungültiges Datum.' })
  tag.setUTCDate(tag.getUTCDate() + 1)
  const grenze = tag.toISOString().replace('T', ' ').slice(0, 19)

  const team = String(koerper.team || '').trim()
  if (team) {
    try {
      e.app.findRecordById('teams', team)
    } catch {
      return e.json(400, { message: 'Ungültige Angabe.' })
    }
  }

  const filter = team ? 'date < {:g} && team = {:t}' : 'date < {:g}'
  const parameter = team ? { g: grenze, t: team } : { g: grenze }

  let spieltage = 0
  // In Schüben, damit auch eine lange Historie in einem Aufruf durchlaeuft.
  for (let runde = 0; runde < 20; runde++) {
    const treffer = e.app.findRecordsByFilter('fixtures', filter, 'date', 500, 0, parameter)
    if (!treffer.length) break
    for (const s of treffer) {
      // Rückmeldungen, Fahrten und Mitfahrer verschwinden ueber cascadeDelete mit.
      e.app.delete(s)
      spieltage += 1
    }
  }

  a.protokoll(e, 'fixtures.cleanup', team, bis, `${spieltage} Spieltage`)
  return e.json(200, { spieltage })
})

// ── R12 · Neues Token ───────────────────────────────────────────────────────────────────────
routerAdd('POST', '/manage/api/members/{id}/rotate-token', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  let satz
  try {
    satz = e.app.findRecordById('members', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (!a.darfTeam(kontext, satz.getString('team'))) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  // 1. Neuer Hash — der alte ist damit weg, jeder verteilte Link läuft ins Leere.
  const klartext = u.neuesToken()
  satz.set('token_hash', u.hash(klartext))
  satz.set('token_issued_at', new DateTime())
  e.app.save(satz)

  // 2. Alle Geräte ausloggen. Ohne diesen Schritt bliebe ein angemeldetes Handy drin, obwohl
  //    der Link tot ist — genau der Fall, den T4 prüft.
  let beendet = 0
  for (const s of e.app.findRecordsByFilter('sessions', 'member = {:m}', '', 100, 0, { m: satz.id })) {
    try {
      e.app.delete(s)
      beendet += 1
    } catch {
      /* schon weg */
    }
  }

  // 3. Protokoll.
  a.protokoll(e, 'token.rotate', satz.id, '', `${beendet} Sitzungen beendet`)

  // R1 · Das einzige Mal, dass der Klartext den Server verlässt.
  return e.json(200, { token: klartext, sitzungen_beendet: beendet })
})

// ── Korrektur einer Rückmeldung durch den Kapitän ───────────────────────────────────────────
routerAdd('PUT', '/manage/api/response/{fixtureId}/{memberId}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  const spieltagId = e.request.pathValue('fixtureId')
  const mitgliedId = e.request.pathValue('memberId')

  // Beide müssen zur Mannschaft des Verwalters gehören — und zueinander. Sonst könnte ein
  // Kapitän die Rückmeldung eines fremden Mitglieds zu seinem eigenen Spieltag setzen.
  let spieltagSatz = null
  let mitgliedSatz = null
  try {
    spieltagSatz = e.app.findRecordById('fixtures', spieltagId)
    mitgliedSatz = e.app.findRecordById('members', mitgliedId)
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (
    !spieltagSatz ||
    !mitgliedSatz ||
    spieltagSatz.getString('team') !== mitgliedSatz.getString('team') ||
    !a.darfTeam(kontext, spieltagSatz.getString('team'))
  ) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const koerper = e.requestInfo().body || {}
  const status =
    koerper.status === null || koerper.status === undefined ? null : String(koerper.status)
  if (status !== null && ['yes', 'maybe', 'no'].indexOf(status) === -1) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  // Anders als beim Mitglied darf der Kapitän auch abgeschlossene Spieltage korrigieren —
  // genau dafür ist diese Route da.
  try {
    e.app.findRecordById('fixtures', spieltagId)
    e.app.findRecordById('members', mitgliedId)
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const vorhanden = u.eigenerSatz(e, 'responses', spieltagId, mitgliedId)
  const alt = vorhanden ? vorhanden.getString('status') : ''
  if (status === null) {
    if (vorhanden) e.app.delete(vorhanden)
  } else {
    const satz = vorhanden || new Record(e.app.findCollectionByNameOrId('responses'))
    satz.set('fixture', spieltagId)
    satz.set('member', mitgliedId)
    satz.set('status', status)
    e.app.save(satz)
  }

  a.protokoll(e, 'response.correct', `${spieltagId}/${mitgliedId}`, alt, status || '')
  return e.json(200, { ok: true })
})

// ── Einstellungen ───────────────────────────────────────────────────────────────────────────
// Genau ein Datensatz, angelegt von der Migration. Gelesen wird er auch von der
// Einladungsseite — deshalb liegt das Holen in utils.js und nicht hier.
routerAdd('GET', '/manage/api/settings', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  return e.json(200, u.einstellungen(e.app))
})

routerAdd('PATCH', '/admin/api/settings', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const u = require(`${__hooks}/utils.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  const koerper = e.requestInfo().body || {}

  // R4 · Whitelist mit Grenzen. Die Grenzen spiegeln die Migration — ohne sie lehnte erst die
  // Datenbank ab, mit einer Meldung, die dem Kapitän nichts sagt.
  const ZAHLEN = {
    puffer_minuten: { min: 0, max: 180 },
    auto_sperre_stunden: { min: 0, max: 168 },
  }

  let satz
  try {
    const alle = e.app.findAllRecords('settings')
    satz = alle && alle.length ? alle[0] : new Record(e.app.findCollectionByNameOrId('settings'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const vorher = u.einstellungen(e.app)
  const geaendert = []

  if ('anzeigename' in koerper) {
    const name = String(koerper.anzeigename || '').trim()
    // Leer ginge nicht: die Einladungsseite hätte dann eine leere Überschrift.
    if (!name || name.length > 60) return e.json(400, { message: 'Ungültige Angabe.' })
    if (name !== vorher.anzeigename) geaendert.push(['anzeigename', vorher.anzeigename, name])
    satz.set('anzeigename', name)
  }

  // Impressum und Datenschutz dürfen leer sein — dann gibt es die Seite nicht und nichts
  // verlinkt darauf. Im Protokoll steht nur, DASS sich etwas geändert hat: der Text selbst
  // gehörte sonst in voller Länge in jede Zeile.
  for (const feld of ['impressum', 'datenschutz']) {
    if (!(feld in koerper)) continue
    const text = String(koerper[feld] === null || koerper[feld] === undefined ? '' : koerper[feld]).trim()
    if (text.length > 8000) return e.json(400, { message: 'Der Text ist zu lang.' })
    if (text !== vorher[feld]) {
      geaendert.push([feld, vorher[feld] ? `${vorher[feld].length} Zeichen` : 'leer', text ? `${text.length} Zeichen` : 'leer'])
    }
    satz.set(feld, text)
  }

  for (const feld in ZAHLEN) {
    if (!(feld in koerper)) continue
    const wert = Number(koerper[feld])
    if (!isFinite(wert) || wert !== Math.round(wert)) return e.json(400, { message: 'Ungültige Angabe.' })
    if (wert < ZAHLEN[feld].min || wert > ZAHLEN[feld].max) return e.json(400, { message: 'Ungültige Angabe.' })
    if (wert !== vorher[feld]) geaendert.push([feld, String(vorher[feld]), String(wert)])
    satz.set(feld, wert)
  }

  if (!geaendert.length) return e.json(200, u.einstellungen(e.app))

  e.app.save(satz)

  // Je Feld eine Zeile. Der Anzeigename steht anschließend in jeder Linkvorschau, die Frist
  // schließt Spieltage ohne Zutun — beides gehört nachvollziehbar ins Protokoll.
  for (const [feld, alt, neu] of geaendert) a.protokoll(e, 'settings.update', feld, alt, neu)

  return e.json(200, u.einstellungen(e.app))
})

// ── Protokoll ───────────────────────────────────────────────────────────────────────────────
routerAdd('GET', '/manage/api/audit', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  const gewuenscht = Number((e.requestInfo().query || {}).limit) || 100
  const grenze = Math.min(gewuenscht, 500)
  const team = a.teamFuer(kontext, (e.requestInfo().query || {}).team)

  // Im Protokoll stehen IDs — `member:n5xck1yyp6pk0a3` sagt dem Kapitän nichts. Einmal alle
  // Namen holen und im Speicher auflösen, statt pro Zeile nachzuschlagen.
  //
  // Abschnitt 12 · Dieselbe Liste entscheidet, WELCHE Zeilen er überhaupt sieht: Ist eine
  // Mannschaft gewählt, bleiben nur Zeilen übrig, deren Ziel zu ihr gehört. Zentrale Ereignisse
  // — Anmeldungen, Einstellungen, Sicherungen — haben gar kein Ziel und fallen damit heraus.
  // Für einen Kapitän ist das richtig so: Sie gehen ihn nichts an.
  const namen = {}
  const eigene = {}
  const mFilter = team ? 'team = {:t}' : "id != ''"
  for (const m of e.app.findRecordsByFilter('members', mFilter, '', 500, 0, { t: team })) {
    namen[m.id] = m.getString('name')
    eigene[m.id] = true
  }
  for (const s of e.app.findRecordsByFilter('fixtures', mFilter, '', 500, 0, { t: team })) {
    namen[s.id] = s.getString('opponent_town')
    eigene[s.id] = true
  }

  // Gelöschte Spieltage und Mitglieder stehen weiterhin als ID da — das ist richtig so, die
  // Zeile soll nicht verschwinden, nur weil ihr Bezug weg ist.
  const lesbar = (wert) => {
    if (!wert) return ''
    if (wert.indexOf('admin:') === 0) return wert.slice(6)
    // Der Cron, der gespielte Spieltage schließt. Ohne eigenen Zweig stünde hier die rohe
    // Zeichenkette `system:auto-sperre`.
    if (wert.indexOf('system:') === 0) return wert.slice(7)
    if (wert.indexOf('member:') === 0) {
      const id = wert.slice(7)
      return namen[id] || `Mitglied ${id}`
    }
    // Ziele wie `<fixtureId>` oder `<fixtureId>/<memberId>`.
    return wert
      .split('/')
      .map((teil) => namen[teil] || teil)
      .join(' · ')
  }

  const gehoertDazu = (x) => {
    const ziel = x.getString('target')
    if (ziel && eigene[ziel]) return true
    const wer = x.getString('actor')
    return wer.indexOf('member:') === 0 && eigene[wer.slice(7)]
  }

  // Die Zugehörigkeit zu einer Mannschaft steht nicht in der Zeile, sondern ergibt sich erst aus
  // der Auflösung von `target` und `actor` — filtern lässt sie sich also nur im Speicher.
  //
  // Vorher wurden dafür die neuesten `grenze` Zeilen geholt und DANACH gefiltert. In einem
  // Verein mit sieben Mannschaften heißt das: Wer die Damen betreut, sieht sein Protokoll nur,
  // wenn seine Zeilen zufällig unter den letzten hundert des ganzen Vereins liegen. Sonst las er
  // „Noch nichts passiert." — ein Protokoll, das genau in der Lage schweigt, für die es gebaut
  // wurde. Jetzt wird stapelweise weitergelesen, bis `grenze` eigene Zeilen zusammen sind.
  //
  // Die Obergrenze ist ein Stoppschild, kein Erwartungswert: Die Aufbewahrung liegt bei 90 bis
  // 365 Tagen (cron.pb.js), das Protokoll wächst also nicht unbegrenzt.
  let alle = []
  if (team) {
    const stapelgroesse = 500
    for (let versatz = 0; versatz < 10000 && alle.length < grenze; versatz += stapelgroesse) {
      const stapel = e.app.findRecordsByFilter('audit_log', "id != ''", '-at', stapelgroesse, versatz)
      for (const x of stapel) {
        if (gehoertDazu(x)) alle.push(x)
        if (alle.length >= grenze) break
      }
      if (stapel.length < stapelgroesse) break
    }
  } else {
    alle = e.app.findRecordsByFilter('audit_log', "id != ''", '-at', grenze, 0)
  }

  return e.json(200, {
    items: alle.map((x) => ({
      at: x.getDateTime('at').string(),
      actor: lesbar(x.getString('actor')),
      // Ob es der Kapitän, ein Mitglied oder die Automatik war, geht sonst verloren, sobald der
      // Präfix weg ist.
      actor_typ:
        x.getString('actor').indexOf('admin:') === 0
          ? 'admin'
          : x.getString('actor').indexOf('system:') === 0
            ? 'system'
            : 'member',
      action: x.getString('action'),
      target: lesbar(x.getString('target')),
      old_value: x.getString('old_value'),
      new_value: x.getString('new_value'),
    })),
  })
})

// ── Sicherungen (Abschnitt 7.4) ─────────────────────────────────────────────────────────────
// Warum das hier liegt und nicht nur im Skript: `scripts/backup.sh` ist für einen Cronjob auf
// einer ANDEREN Maschine gedacht und bleibt der Rückhalt — eine Sicherung, die jemand von Hand
// anstößt, entsteht nur, wenn er daran denkt. Aber ein Vereinsadmin, der einmal im Monat eine
// Kopie in die Hand nehmen will, soll dafür weder SSH noch SFTP noch einen Pfad kennen müssen.
//
// Alles läuft über `newBackupsFilesystem()` statt über direkte Dateizugriffe: Damit funktioniert
// es unverändert weiter, wenn jemand PocketBases S3-Ablage einschaltet.
//
// Der Kontext kommt aus `$app.rootCmd.context()`, NICHT aus dem Request. Ein Request-Kontext
// wird abgebrochen, sobald die Antwort draußen ist — beim Wiederherstellen liefe die Operation
// dann mitten hinein.

// ── POST /admin/api/backup · Sicherung erzeugen ─────────────────────────────────────────────
routerAdd('POST', '/admin/api/backup', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  const name = `pb_backup_manuell_${a.backupZeitstempel()}.zip`

  try {
    e.app.createBackup($app.rootCmd.context(), name)
  } catch (fehler) {
    console.log('Sicherung erzeugen:', fehler)
    return e.json(500, { message: 'Die Sicherung konnte nicht erzeugt werden.' })
  }

  a.protokoll(e, 'backup.create', name, '', 'von Hand')
  return e.json(200, { name: name })
})

// ── GET /admin/api/backups · Was liegt da ───────────────────────────────────────────────────
routerAdd('GET', '/admin/api/backups', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  let eintraege = []
  try {
    eintraege = e.app.newBackupsFilesystem().list('')
  } catch (fehler) {
    console.log('Sicherungen auflisten:', fehler)
    return e.json(500, { message: 'Die Sicherungen konnten nicht gelesen werden.' })
  }

  const items = eintraege
    .filter((x) => x && a.backupNameOk(x.key))
    .map((x) => ({ name: x.key, groesse: x.size, geaendert: String(x.modTime) }))
    .sort((x, y) => (x.geaendert < y.geaendert ? 1 : -1))

  return e.json(200, { items: items })
})

// ── GET /admin/api/backup/{name} · Herunterladen ────────────────────────────────────────────
// Kein CSRF-Token nötig (GET) — der Knopf ist damit ein gewöhnlicher Link, und der Browser legt
// die Datei in den Download-Ordner. Genau das ist der Punkt der Übung.
routerAdd('GET', '/admin/api/backup/{name}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  const name = e.request.pathValue('name')
  if (!a.backupNameOk(name)) return e.json(404, { message: 'Nicht gefunden.' })

  try {
    e.app.newBackupsFilesystem().serve(e.response, e.request, name, name)
  } catch (fehler) {
    console.log('Sicherung ausliefern:', fehler)
    return e.json(404, { message: 'Nicht gefunden.' })
  }

  a.protokoll(e, 'backup.download', name, '', '')
  return null
})

// ── POST /admin/api/backup/upload · Zurückgeben ─────────────────────────────────────────────
// Ohne diesen Weg kennt PocketBase eine heruntergeladene Datei nicht mehr, und das
// Wiederherstellen läuft ins Leere — die Stelle, über die der erste Testlauf gestolpert ist.
routerAdd('POST', '/admin/api/backup/upload', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  let datei
  try {
    datei = e.findUploadedFiles('datei')[0]
  } catch {
    datei = null
  }
  if (!datei) return e.json(400, { message: 'Keine Datei erhalten.' })

  const name = String(datei.originalName || '')
  if (!a.backupNameOk(name)) {
    return e.json(400, { message: 'Nur Sicherungsdateien mit der Endung .zip.' })
  }

  try {
    e.app.newBackupsFilesystem().uploadFile(datei, name)
  } catch (fehler) {
    console.log('Sicherung hochladen:', fehler)
    return e.json(500, { message: 'Die Datei konnte nicht abgelegt werden.' })
  }

  a.protokoll(e, 'backup.upload', name, '', '')
  return e.json(200, { name: name })
})

// ── DELETE /admin/api/backup/{name} · Wegräumen ─────────────────────────────────────────────
// Ohne diesen Weg sammeln sich die Sicherungen in `pb_data` für immer an — jede so groß wie die
// ganze Datenbank. Der Kapitän soll aufräumen können, ohne dafür auf den Server zu müssen.
routerAdd('DELETE', '/admin/api/backup/{name}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  const name = e.request.pathValue('name')
  if (!a.backupNameOk(name)) return e.json(404, { message: 'Nicht gefunden.' })

  try {
    e.app.newBackupsFilesystem().delete(name)
  } catch (fehler) {
    console.log('Sicherung löschen:', fehler)
    return e.json(404, { message: 'Nicht gefunden.' })
  }

  a.protokoll(e, 'backup.delete', name, '', '')
  return e.json(200, { name: name })
})

// ── POST /admin/api/backup/{name}/restore · Zurückspielen ───────────────────────────────────
// Der scharfe Knopf, deshalb zwei Sicherungen davor:
//   1. Der Name muss im Rumpf noch einmal stehen. Ein Fehlklick allein reicht nicht.
//   2. Vorher entsteht automatisch eine Kopie des AKTUELLEN Standes. Wer sich vergreift, kann
//      zurück — sonst wäre der Fehlgriff endgültig.
//
// PocketBase nennt `restoreBackup` ausdrücklich experimentell und UNIX-only und will doppelt so
// viel freien Plattenplatz wie die Sicherung.
//
// ZWEI EIGENHEITEN, die man kennen muss:
//
// 1. Der Prozess startet NOCH IM AUFRUF neu. Das `return` unten wird im Erfolgsfall nie
//    erreicht, die Verbindung reißt vorher ab. Der Client wertet genau diesen Abriss als
//    Erfolg — siehe `sicherungZurueckspielen` in adminApi.ts. Es hilft nicht, die Antwort
//    vorher rauszuschreiben: Ob sie den Browser noch erreicht, bevor execve zuschlägt, ist
//    nicht zugesichert.
// 2. Der Protokolleintrag unten liegt in der Datenbank, die gleich ersetzt wird — er überlebt
//    den Vorgang also NICHT. Ein Zurückspielen bleibt im Protokoll unsichtbar. Das lässt sich
//    nicht beheben, solange die Datenbank die Datenbank ersetzt; er wird trotzdem geschrieben,
//    weil er bei einem FEHLGESCHLAGENEN Versuch stehen bleibt und dann das Einzige ist, was
//    davon zeugt.
routerAdd('POST', '/admin/api/backup/{name}/restore', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  // Zentral (Abschnitt 12): Das geht alle Mannschaften an, also nur den Gesamt-Admin. Antwort
  // wie überall 404 statt 403 — ein Kapitän soll nicht einmal erfahren, dass es hier etwas gibt.
  if (kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  const name = e.request.pathValue('name')
  if (!a.backupNameOk(name)) return e.json(404, { message: 'Nicht gefunden.' })

  const koerper = e.requestInfo().body || {}
  if (koerper.bestaetigung !== name) {
    return e.json(400, { message: 'Zur Bestätigung den Dateinamen eintragen.' })
  }

  // Gibt es die Datei überhaupt? Sonst stünde am Ende ein Neustart ohne Grund.
  let vorhanden = false
  try {
    vorhanden = e.app.newBackupsFilesystem().list('').some((x) => x && x.key === name)
  } catch {
    vorhanden = false
  }
  if (!vorhanden) return e.json(404, { message: 'Nicht gefunden.' })

  const rettung = `pb_backup_vor_wiederherstellung_${a.backupZeitstempel()}.zip`
  try {
    e.app.createBackup($app.rootCmd.context(), rettung)
  } catch (fehler) {
    // Ohne Netz wird nicht gesprungen.
    console.log('Sicherheitskopie vor Wiederherstellung:', fehler)
    return e.json(500, { message: 'Die Sicherheitskopie schlug fehl — es wurde nichts verändert.' })
  }

  a.protokoll(e, 'backup.restore', name, rettung, 'Neustart folgt')

  try {
    e.app.restoreBackup($app.rootCmd.context(), name)
  } catch (fehler) {
    console.log('Wiederherstellen:', fehler)
    return e.json(500, { message: 'Das Zurückspielen schlug fehl. Der bisherige Stand ist unverändert.' })
  }

  return e.json(200, { name: name, sicherheitskopie: rettung })
})


// ── Zweiter Faktor verwalten (Abschnitt 9) ──────────────────────────────────────────────────
// Der Ablauf ist bewusst zweistufig: `POST` legt ein Geheimnis an, das noch NICHT gilt, und
// `POST /confirm` schaltet es scharf, nachdem ein Code daraus gestimmt hat. Wer sonst die App
// falsch einrichtet oder das Fenster zu früh schließt, hätte einen zweiten Faktor, den er nicht
// erzeugen kann — und käme an die Ansicht, die ihn abschalten würde, nicht mehr heran.

// ── GET /manage/api/totp · Was ist eingerichtet ─────────────────────────────────────────────
routerAdd('GET', '/manage/api/totp', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  const email = a.sitzung(e).getString('email')
  let satz = null
  try {
    satz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m}', { m: email })
  } catch {
    satz = null
  }

  // Das Geheimnis selbst geht hier NIE mit. Es verlässt den Server genau einmal, beim Anlegen.
  return e.json(200, {
    aktiv: !!satz && satz.getBool('confirmed'),
    ausstehend: !!satz && !satz.getBool('confirmed'),
    codes_uebrig: satz ? require(`${__hooks}/totp.js`).codesLesen(satz.getString('codes')).length : 0,
  })
})

// ── POST /manage/api/totp · Einrichtung beginnen ────────────────────────────────────────────
routerAdd('POST', '/manage/api/totp', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  const totp = require(`${__hooks}/totp.js`)
  const u = require(`${__hooks}/utils.js`)
  const email = a.sitzung(e).getString('email')

  let satz = null
  try {
    satz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m}', { m: email })
  } catch {
    satz = null
  }

  // Einen bereits scharfen zweiten Faktor überschreibt das hier nicht. Sonst genügte ein
  // Klick, um ihn durch einen neuen zu ersetzen — und der Schutz wäre keiner.
  if (satz && satz.getBool('confirmed')) {
    return e.json(409, { message: 'Es ist bereits ein zweiter Faktor eingerichtet.' })
  }

  const geheimnis = totp.neuesGeheimnis()
  if (!satz) satz = new Record(e.app.findCollectionByNameOrId('admin_totp'))
  satz.set('email', email)
  satz.set('secret', geheimnis)
  satz.set('confirmed', false)
  satz.set('last_step', 0)
  e.app.save(satz)

  const einst = u.einstellungen(e.app)
  return e.json(200, {
    geheimnis: geheimnis,
    uri: totp.otpauthUri(geheimnis, email, einst.anzeigename || 'Mannschaftsplan'),
  })
})

// ── POST /manage/api/totp/confirm · Scharf schalten ─────────────────────────────────────────
routerAdd('POST', '/manage/api/totp/confirm', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  const totp = require(`${__hooks}/totp.js`)
  const email = a.sitzung(e).getString('email')

  let satz = null
  try {
    satz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m}', { m: email })
  } catch {
    satz = null
  }
  if (!satz) return e.json(400, { message: 'Es läuft keine Einrichtung.' })
  if (satz.getBool('confirmed')) return e.json(409, { message: 'Bereits eingerichtet.' })

  const koerper = e.requestInfo().body || {}
  const schritt = totp.pruefen(
    satz.getString('secret'),
    String(koerper.code || ''),
    Math.floor(Date.now() / 1000),
    satz.getInt('last_step'),
  )
  if (!schritt) return e.json(400, { message: 'Der Code stimmt nicht.' })

  // Die Codes entstehen GENAU HIER, zusammen mit dem scharfen zweiten Faktor. Sie später auf
  // Knopfdruck nachzureichen hieße, dass es einen Zustand „eingeschaltet, aber ohne Ausweg"
  // gibt — und in dem steckt man genau dann, wenn man ihn nicht mehr verlassen kann.
  const codes = totp.wiederherstellungscodes()

  satz.set('confirmed', true)
  satz.set('last_step', schritt)
  satz.set('codes', codes.hashes.join(' '))
  e.app.save(satz)

  a.protokoll(e, 'admin.totp.on', '', '', '')
  // Das einzige Mal, dass die Codes im Klartext den Server verlassen (R1).
  return e.json(200, { aktiv: true, codes: codes.klartext })
})

// ── POST /manage/api/totp/codes · Neue Wiederherstellungscodes ──────────────────────────────
// Für den, der seinen Zettel verlegt hat oder Codes verbraucht hat. Die alten gelten danach
// nicht mehr — sonst sammelten sich mit der Zeit Zettel an, von denen keiner mehr weiß, welche
// noch gültig sind.
//
// Ein gültiger Code aus der App ist Voraussetzung: Wer nur eine übernommene Sitzung hat, soll
// sich damit keinen Dauerzugang ausstellen können.
routerAdd('POST', '/manage/api/totp/codes', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)

  const totp = require(`${__hooks}/totp.js`)
  const email = a.sitzung(e).getString('email')

  let satz = null
  try {
    satz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m} && confirmed = true', {
      m: email,
    })
  } catch {
    satz = null
  }
  if (!satz) return e.json(400, { message: 'Es ist kein zweiter Faktor eingerichtet.' })

  const koerper = e.requestInfo().body || {}
  const schritt = totp.pruefen(
    satz.getString('secret'),
    String(koerper.code || ''),
    Math.floor(Date.now() / 1000),
    satz.getInt('last_step'),
  )
  if (!schritt) return e.json(400, { message: 'Der Code stimmt nicht.' })

  const codes = totp.wiederherstellungscodes()
  satz.set('last_step', schritt)
  satz.set('codes', codes.hashes.join(' '))
  e.app.save(satz)

  a.protokoll(e, 'admin.totp.codes', '', '', '10 neue Codes')
  return e.json(200, { codes: codes.klartext })
})

// ── DELETE /manage/api/totp · Wieder abschalten ─────────────────────────────────────────────
// Auch dafür ein gültiger Code. Eine übernommene Sitzung soll den zweiten Faktor nicht mit
// einem Klick loswerden können — sonst schützte er nur, bis jemand drin ist.
//
// Wer sein Gerät verloren hat, kommt hier nicht weiter. Für diesen Fall gibt es den Weg über
// die Kommandozeile auf dem Server, und er steht in der README.
routerAdd('DELETE', '/manage/api/totp', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  const totp = require(`${__hooks}/totp.js`)
  const email = a.sitzung(e).getString('email')

  let satz = null
  try {
    satz = e.app.findFirstRecordByFilter('admin_totp', 'email = {:m}', { m: email })
  } catch {
    satz = null
  }
  if (!satz) return e.json(200, { aktiv: false })

  // Eine noch unbestätigte Einrichtung darf ohne Code weg — sie schützt ja noch nichts, und
  // wer sie nicht loswird, kann auch keine neue beginnen.
  if (satz.getBool('confirmed')) {
    const koerper = e.requestInfo().body || {}
    const schritt = totp.pruefen(
      satz.getString('secret'),
      String(koerper.code || ''),
      Math.floor(Date.now() / 1000),
      satz.getInt('last_step'),
    )
    if (!schritt) return e.json(400, { message: 'Der Code stimmt nicht.' })
  }

  e.app.delete(satz)
  a.protokoll(e, 'admin.totp.off', '', '', '')
  return e.json(200, { aktiv: false })
})


// ── PATCH /manage/api/passwort · Das eigene Passwort ändern (Abschnitt 12) ──────────────────
// Kapitäne bekommen ein erzeugtes Passwort und sollen es durch ein eigenes ersetzen können,
// ohne dafür jemanden zu fragen. Das alte muss mit — sonst genügte eine übernommene Sitzung,
// um jemanden dauerhaft auszusperren.
//
// Funktioniert für beide Quellen: Verwalterkonten und den Superuser. Gehasht wird in beiden
// Fällen von PocketBase (R13).
routerAdd('PATCH', '/manage/api/passwort', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  const koerper = e.requestInfo().body || {}
  const altes = String(koerper.alt || '')
  const neues = String(koerper.neu || '')

  // Zwölf Zeichen, nicht acht: Das erzeugte Passwort hat sechzehn, und wer es ersetzt, soll
  // dabei nicht schlechter dastehen als vorher.
  //
  // Hier hängt mehr dran als eine Zahl. Die Rechnung, mit der der zweite Faktor freiwillig
  // bleiben kann, lautet „Passwörter werden erzeugt, nicht gewählt" (Abschnitt 12) — und sie
  // gilt nur bis zur ersten Änderung. Genau ab hier.
  if (neues.length < 12) {
    return e.json(400, { message: 'Das neue Passwort braucht mindestens zwölf Zeichen.' })
  }

  // Der eigene Adressteil vor dem @ ist das erste, was jemand probiert. Mehr Regeln gibt es
  // bewusst nicht: Wer zu Sonderzeichen und Ziffern gezwungen wird, landet bei „Sommer2026!"
  // und schreibt es auf einen Zettel am Bildschirm.
  const name = String(kontext.email || '').split('@')[0].toLowerCase()
  if (name && neues.toLowerCase().indexOf(name) !== -1) {
    return e.json(400, { message: 'Das Passwort darf nicht deinen Anmeldenamen enthalten.' })
  }

  let konto = null
  for (const quelle of ['verwalter', '_superusers']) {
    try {
      konto = e.app.findAuthRecordByEmail(quelle, kontext.email)
    } catch {
      konto = null
    }
    if (konto) break
  }
  if (!konto || !konto.validatePassword(altes)) {
    return e.json(400, { message: 'Das bisherige Passwort stimmt nicht.' })
  }

  konto.set('password', neues)
  e.app.save(konto)

  // Andere Sitzungen desselben Kontos beenden. Wer sein Passwort ändert, tut das oft genau
  // deshalb — ein Gerät, das weiter angemeldet bliebe, wäre die halbe Sache.
  let beendet = 0
  try {
    const eigene = a.sitzung(e)
    for (const sitz of e.app.findRecordsByFilter('admin_sessions', 'email = {:m}', '', 100, 0, {
      m: kontext.email,
    })) {
      if (eigene && sitz.id === eigene.id) continue
      e.app.delete(sitz)
      beendet += 1
    }
  } catch {
    /* keine weiteren */
  }

  a.protokoll(e, 'admin.passwort', '', '', `${beendet} weitere Sitzungen beendet`)
  return e.json(200, { sitzungen_beendet: beendet })
})

// ── Mannschaften (Abschnitt 12) ─────────────────────────────────────────────────────────────
// Anlegen und Löschen macht der Gesamt-Admin. Den Namen und den Puffer darf jeder Kapitän an
// SEINER Mannschaft ändern — das ist die „Einstellung der Mannschaft", von der sonst überall
// die Rede ist.

routerAdd('GET', '/manage/api/teams', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  const filter = kontext.rolle === 'kapitaen' ? 'id = {:t}' : "id != ''"
  const alle = e.app.findRecordsByFilter('teams', filter, 'sort,name', 50, 0, { t: kontext.team })

  return e.json(200, {
    items: alle.map((t) => ({
      id: t.id,
      name: t.getString('name'),
      sort: t.getInt('sort'),
      startort: t.getString('startort'),
    })),
  })
})

routerAdd('POST', '/admin/api/teams', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext
  if (kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  const koerper = e.requestInfo().body || {}
  const name = String(koerper.name || '').trim()
  if (!name || name.length > 60) return e.json(400, { message: 'Ungültige Angabe.' })

  const satz = new Record(e.app.findCollectionByNameOrId('teams'))
  satz.set('name', name)
  satz.set('sort', Number(koerper.sort) || 0)
  satz.set('startort', '')
  try {
    e.app.save(satz)
  } catch {
    // Der eindeutige Index über den Namen. Zwei „Herren I" wären für jeden verwirrend.
    return e.json(400, { message: 'Diesen Namen gibt es schon.' })
  }

  a.protokoll(e, 'team.create', satz.id, '', name)
  return e.json(200, { id: satz.id })
})

routerAdd('PATCH', '/manage/api/teams/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext

  let satz
  try {
    satz = e.app.findRecordById('teams', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (!a.darfTeam(kontext, satz.id)) return e.json(400, { message: 'Ungültige Angabe.' })

  const koerper = e.requestInfo().body || {}
  const geaendert = []

  if ('name' in koerper) {
    const name = String(koerper.name || '').trim()
    if (!name || name.length > 60) return e.json(400, { message: 'Ungültige Angabe.' })
    if (name !== satz.getString('name')) geaendert.push(['name', satz.getString('name'), name])
    satz.set('name', name)
  }
  if ('startort' in koerper) satz.set('startort', String(koerper.startort || '').slice(0, 120))
  // Die Reihenfolge ordnet nur der Gesamt-Admin — sie betrifft die Liste aller Mannschaften.
  if ('sort' in koerper && kontext.rolle === 'admin') satz.set('sort', Number(koerper.sort) || 0)

  try {
    e.app.save(satz)
  } catch {
    return e.json(400, { message: 'Diesen Namen gibt es schon.' })
  }

  for (const [feld, alt, neu] of geaendert) a.protokoll(e, 'team.update', satz.id, `${feld}: ${alt}`, neu)
  return e.json(200, { id: satz.id })
})

routerAdd('DELETE', '/admin/api/teams/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext
  if (kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  const id = e.request.pathValue('id')
  let satz
  try {
    satz = e.app.findRecordById('teams', id)
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  // Kein Kaskadenlöschen: Eine Mannschaft mit Mitgliedern zu löschen, nähme Rückmeldungen und
  // Fahrten gleich mit — ein Klick, und ein Jahr Spielbetrieb ist weg. Wer sie wirklich
  // auflösen will, räumt sie vorher leer und sieht dabei, was er tut.
  for (const [was, feld] of [['members', 'team'], ['fixtures', 'team']]) {
    const rest = e.app.findRecordsByFilter(was, `${feld} = {:t}`, '', 1, 0, { t: id })
    if (rest.length) {
      return e.json(409, {
        message: 'In dieser Mannschaft stehen noch Mitglieder oder Spieltage.',
      })
    }
  }
  const rest = e.app.findRecordsByFilter('verwalter', 'team = {:t}', '', 1, 0, { t: id })
  if (rest.length) return e.json(409, { message: 'Dieser Mannschaft ist noch ein Kapitän zugeordnet.' })

  const name = satz.getString('name')
  e.app.delete(satz)
  a.protokoll(e, 'team.delete', id, name, '')
  return e.json(200, { ok: true })
})

// ── Verwalter (Abschnitt 12) ────────────────────────────────────────────────────────────────
// Konten für Kapitäne. Ausschließlich Sache des Gesamt-Admins — wer Konten anlegen darf, darf
// alles.
//
// Das Passwort wird erzeugt und GENAU EINMAL angezeigt, wie der Einladungslink eines Mitglieds
// (R1). PocketBase speichert davon nur den Hash; herausholen kann es niemand, auch der
// Gesamt-Admin nicht. Wer es verliert, bekommt ein neues.

routerAdd('GET', '/admin/api/verwalter', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  if (vor.kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  const alle = e.app.findRecordsByFilter('verwalter', "id != ''", 'email', 100, 0)

  // Wer hat einen zweiten Faktor? Nur diese Auskunft, nie das Geheimnis — das verlässt den
  // Server ausschließlich bei der Einrichtung, und die macht jeder für sich.
  const mitFaktor = {}
  try {
    for (const t of e.app.findRecordsByFilter('admin_totp', 'confirmed = true', '', 200, 0)) {
      mitFaktor[t.getString('email')] = true
    }
  } catch {
    /* noch keine Tabelle */
  }

  // Läuft gerade eine Sperre? Der Kapitän am Telefon sagt „ich komme nicht rein" — dann soll
  // hier stehen, ob das an der Sperre liegt und wie lange sie noch dauert.
  const limit = require(`${__hooks}/ratelimit.js`)

  return e.json(200, {
    items: alle.map((v) => {
      const email = v.getString('email')
      const sperre = limit.istGesperrt(e.app, `login:konto:${email.trim().toLowerCase()}`)
      return {
        id: v.id,
        email: email,
        rolle: v.getString('rolle'),
        team: v.getString('team'),
        mitglied: v.getString('mitglied'),
        totp: !!mitFaktor[email],
        gesperrt: sperre.gesperrt ? sperre.wartenSekunden : 0,
      }
    }),
  })
})

// ── POST /admin/api/verwalter/{id}/entsperren · Sperre vorzeitig aufheben ───────────────────
// Eine Sperre löst sich nach einer Viertelstunde von selbst — das ist der Normalfall und
// braucht niemanden. Diese Route ist für den anderen: Ein Kapitän hat sich vertippt, steht vor
// dem Spieltag und will jetzt hinein.
//
// Was sie NICHT kann: die eigene Sperre des Admins aufheben. Wer ausgesperrt ist, kommt nicht
// herein, um sich zu entsperren. Dafür bleibt Warten oder ein Neustart des Containers — die
// Zähler liegen im Arbeitsspeicher und sind danach weg.
routerAdd('POST', '/admin/api/verwalter/{id}/entsperren', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  if (vor.kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  let satz
  try {
    satz = e.app.findRecordById('verwalter', e.request.pathValue('id'))
  } catch {
    return e.json(404, { message: 'Nicht gefunden.' })
  }
  if (!satz) return e.json(404, { message: 'Nicht gefunden.' })

  const email = satz.getString('email').trim().toLowerCase()
  require(`${__hooks}/ratelimit.js`).zuruecksetzen(e.app, `login:konto:${email}`)
  a.protokoll(e, 'verwalter.entsperrt', satz.id, '', email)
  return e.json(200, { ok: true })
})

routerAdd('POST', '/admin/api/verwalter', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  if (vor.kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  const koerper = e.requestInfo().body || {}
  const email = String(koerper.email || '').trim().toLowerCase()
  const rolle = koerper.rolle === 'admin' ? 'admin' : 'kapitaen'
  const team = String(koerper.team || '')
  const mitglied = String(koerper.mitglied || '')

  if (!email || email.indexOf('@') < 1) return e.json(400, { message: 'Ungültige Angabe.' })

  // Ein Kapitän ohne Mannschaft könnte nichts sehen und nichts tun — das ist kein Konto,
  // sondern ein Missverständnis.
  if (rolle === 'kapitaen') {
    try {
      if (!team || !e.app.findRecordById('teams', team)) throw new Error('kein Team')
    } catch {
      return e.json(400, { message: 'Ein Kapitän braucht eine Mannschaft.' })
    }
  }

  // Abschnitt 12 · Der Admin verwaltet, er spielt nicht: weder Mannschaft noch Spielereintrag.
  // Das ist keine Anzeigefrage — wer beides hätte, wäre in seiner eigenen Verwaltung Partei.
  if (rolle === 'admin' && (team || mitglied)) {
    return e.json(400, { message: 'Ein Admin hat weder Mannschaft noch Spielereintrag.' })
  }

  // Und ein verknüpfter Spieler muss zur Mannschaft des Kapitäns gehören.
  const mitgliedFehler = require(`${__hooks}/adminauth.js`).mitgliedPruefen(e.app, mitglied, team)
  if (mitgliedFehler) return e.json(400, { message: mitgliedFehler })

  // Lesbar, aber nicht zu erraten: 16 Zeichen ohne die Verwechslungspaare 0/O und 1/l/I.
  const passwort = $security.randomStringWithAlphabet(16, 'abcdefghijkmnopqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789')

  const satz = new Record(e.app.findCollectionByNameOrId('verwalter'))
  satz.set('email', email)
  satz.set('password', passwort)
  satz.set('rolle', rolle)
  satz.set('team', rolle === 'kapitaen' ? team : '')
  satz.set('mitglied', rolle === 'kapitaen' ? mitglied : '')
  // Ohne das gilt das Konto als unbestätigt. Eine Bestätigung per E-Mail gibt es hier nicht —
  // die App hat bewusst keinen Mailserver.
  satz.set('verified', true)
  try {
    e.app.save(satz)
  } catch {
    return e.json(400, { message: 'Diese Adresse gibt es schon.' })
  }

  a.protokoll(e, 'verwalter.create', satz.id, '', `${email} (${rolle})`)
  // Das einzige Mal, dass das Passwort den Server verlässt.
  return e.json(200, { id: satz.id, email: email, passwort: passwort })
})

routerAdd('PATCH', '/admin/api/verwalter/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext
  if (kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  let satz
  try {
    satz = e.app.findRecordById('verwalter', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const koerper = e.requestInfo().body || {}

  // Sich selbst die Rolle zu nehmen ist der schnellste Weg, sich auszusperren. Der Superuser
  // käme zwar noch herein, aber das muss man erst einmal wissen.
  if (satz.getString('email') === kontext.email && 'rolle' in koerper && koerper.rolle !== 'admin') {
    return e.json(400, { message: 'Die eigene Rolle lässt sich nicht herabstufen.' })
  }

  if ('rolle' in koerper) satz.set('rolle', koerper.rolle === 'admin' ? 'admin' : 'kapitaen')
  if ('team' in koerper) satz.set('team', String(koerper.team || ''))
  if ('mitglied' in koerper) satz.set('mitglied', String(koerper.mitglied || ''))

  if (satz.getString('rolle') === 'kapitaen' && !satz.getString('team')) {
    return e.json(400, { message: 'Ein Kapitän braucht eine Mannschaft.' })
  }
  // Ein Konto, das zum Admin wird, verliert Mannschaft und Spielereintrag — beides gehört zur
  // Rolle, die es gerade verlassen hat.
  if (satz.getString('rolle') === 'admin') {
    satz.set('team', '')
    satz.set('mitglied', '')
  }
  const bezugFehler = a.mitgliedPruefen(e.app, satz.getString('mitglied'), satz.getString('team'))
  if (bezugFehler) return e.json(400, { message: bezugFehler })

  // Neues Passwort erzeugen — der Weg zurück, wenn jemand seines verloren hat.
  let passwort = null
  if (koerper.neues_passwort === true) {
    passwort = $security.randomStringWithAlphabet(16, 'abcdefghijkmnopqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789')
    satz.set('password', passwort)
  }

  e.app.save(satz)
  a.protokoll(e, 'verwalter.update', satz.id, '', satz.getString('email'))
  return e.json(200, { id: satz.id, passwort: passwort })
})

// ── DELETE /admin/api/verwalter/{id}/totp · Zweiten Faktor eines Kapitäns abschalten ────────
// Der Ausweg für „Handy verloren". Der Gesamt-Admin kann ihn AUSschalten, aber nicht
// einrichten: Ein Geheimnis, das über seinen Bildschirm liefe, wäre keines mehr — er könnte
// sich danach als dieser Kapitän anmelden. Einrichten bleibt Sache des Kapitäns.
routerAdd('DELETE', '/admin/api/verwalter/{id}/totp', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  if (vor.kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  let satz
  try {
    satz = e.app.findRecordById('verwalter', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const email = satz.getString('email')
  let weg = 0
  try {
    for (const t of e.app.findRecordsByFilter('admin_totp', 'email = {:m}', '', 10, 0, { m: email })) {
      e.app.delete(t)
      weg += 1
    }
  } catch {
    /* keiner eingerichtet */
  }

  // Ins Protokoll gehört das unbedingt: Es ist eine Schwächung, und sie soll nachvollziehbar
  // sein — auch für den Kapitän, dessen zweiter Faktor plötzlich weg ist.
  if (weg) a.protokoll(e, 'verwalter.totp.off', satz.id, email, '')
  return e.json(200, { totp: false })
})

routerAdd('DELETE', '/admin/api/verwalter/{id}', (e) => {
  const a = require(`${__hooks}/adminauth.js`)
  const vor = a.pruefen(e)
  if (vor.fehler) return e.json(vor.fehler.status, vor.fehler.koerper)
  const kontext = vor.kontext
  if (kontext.rolle !== 'admin') return e.json(404, { message: 'Nicht gefunden.' })
  const ohneFaktor = a.faktorFehlt(e)
  if (ohneFaktor) return e.json(ohneFaktor.status, ohneFaktor.koerper)

  let satz
  try {
    satz = e.app.findRecordById('verwalter', e.request.pathValue('id'))
  } catch {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  if (satz.getString('email') === kontext.email) {
    return e.json(400, { message: 'Das eigene Konto lässt sich nicht löschen.' })
  }

  const email = satz.getString('email')

  // Offene Sitzungen dieses Verwalters beenden — sonst arbeitet ein gelöschtes Konto noch bis
  // zu zwölf Stunden weiter. Dieselbe Überlegung wie bei „Neues Token" für ein Mitglied (R12).
  let beendet = 0
  try {
    for (const sitz of e.app.findRecordsByFilter('admin_sessions', 'email = {:m}', '', 100, 0, { m: email })) {
      e.app.delete(sitz)
      beendet += 1
    }
  } catch {
    /* keine offenen Sitzungen */
  }
  // Und ein etwaiger zweiter Faktor gehört zu einem Konto, das es nicht mehr gibt.
  try {
    for (const t of e.app.findRecordsByFilter('admin_totp', 'email = {:m}', '', 10, 0, { m: email })) {
      e.app.delete(t)
    }
  } catch {
    /* keiner eingerichtet */
  }

  e.app.delete(satz)
  a.protokoll(e, 'verwalter.delete', e.request.pathValue('id'), email, `${beendet} Sitzungen beendet`)
  return e.json(200, { ok: true })
})
