/// <reference path="../pb_data/types.d.ts" />
// GET /api/board — Abschnitt 5. Ein Aufruf liefert alles, was der Abfahrtsplan braucht.
//
// Bei 8 Spielern und ~20 Spieltagen sind das ein paar Kilobyte; eine Aufteilung in mehrere
// Endpunkte oder Nachladen beim Aufklappen würde die Sache nur komplizierter machen.

routerAdd('GET', '/api/board', (e) => {
  const u = require(`${__hooks}/utils.js`)

  // R3 · Ohne gültige Sitzung gibt es hier nichts zu sehen — auch keine Namensliste (R6).
  const sitzung = u.mitgliedAusSession(e)
  if (!sitzung) return e.json(401, { message: 'Keine gültige Sitzung.' })

  const einst = u.einstellungen(e.app)
  const team = sitzung.mitglied.getString('team')

  // Abschnitt 12 · JEDE dieser Abfragen ist auf die Mannschaft des Anfragenden eingegrenzt. Eine
  // davon zu vergessen hieße nicht „sieht komisch aus", sondern: Die Herren lesen die
  // Rückmeldungen der Damen. Die drei unteren gehen über die Beziehung zum Spieltag, weil an
  // ihnen selbst kein Mannschaftsfeld hängt.
  const mitglieder = e.app.findRecordsByFilter(
    'members',
    'active = true && team = {:t}',
    'sort,name',
    u.MITGLIEDER_GRENZE,
    0,
    { t: team },
  )
  const spieltage = e.app.findRecordsByFilter('fixtures', 'team = {:t}', 'date', 200, 0, { t: team })

  // Alles auf einmal holen und im Speicher zuordnen, statt pro Spieltag drei Abfragen zu fahren.
  const rueckmeldungen = e.app.findRecordsByFilter('responses', 'fixture.team = {:t}', '', 2000, 0, { t: team })
  const fahrten = e.app.findRecordsByFilter('rides', 'fixture.team = {:t}', '', 2000, 0, { t: team })
  const plaetze = e.app.findRecordsByFilter('seat_claims', 'fixture.team = {:t}', '', 2000, 0, { t: team })

  const proSpieltag = (satzListe) => {
    const map = {}
    for (const satz of satzListe) {
      const schluessel = satz.getString('fixture')
      if (!map[schluessel]) map[schluessel] = []
      map[schluessel].push(satz)
    }
    return map
  }
  const rMap = proSpieltag(rueckmeldungen)
  const fMap = proSpieltag(fahrten)
  const pMap = proSpieltag(plaetze)

  const ausgabe = []
  for (const s of spieltage) {
    const datum = s.getDateTime('date').string()
    const heim = s.getBool('is_home')

    const responses = {}
    // Wer zugesagt hat und selbst zum Spielort kommt. Eine Liste und kein Feld je Antwort: Der
    // Aushang fragt sie als Gruppe ab („wer kommt selbst?"), und die Antwortkarte bleibt so
    // schmal, wie sie ist.
    const selbst_anreise = []
    for (const r of rMap[s.id] || []) {
      responses[r.getString('member')] = r.getString('status')
      if (r.getString('status') === 'yes' && r.getBool('selbst_anreise')) {
        selbst_anreise.push(r.getString('member'))
      }
    }

    // Belegung pro Auto zählen, nicht über alle Autos zusammen — seit der Mitfahrer den Fahrer
    // wählt, ist „2 von 4 belegt" eine Aussage über ein bestimmtes Fahrzeug.
    const belegung = {}
    const seat_claims = {}
    for (const p of pMap[s.id] || []) {
      const fahrt = p.getString('ride')
      seat_claims[p.getString('member')] = fahrt
      belegung[fahrt] = (belegung[fahrt] || 0) + 1
    }

    const rides = (fMap[s.id] || []).map((f) => ({
      id: f.id,
      member: f.getString('member'),
      seats: f.getInt('seats'),
      taken: belegung[f.id] || 0,
    }))

    ausgabe.push({
      id: s.id,
      date: datum,
      opponent_club: s.getString('opponent_club'),
      opponent_town: s.getString('opponent_town'),
      is_home: heim,
      venue: s.getString('venue'),
      km: s.getInt('km'),
      meeting_point: s.getString('meeting_point'),
      needed_players: s.getInt('needed_players'),
      locked: s.getBool('locked'),
      // Ein verlegter Spieltag behält seine Rückmeldungen — sie sind nur nicht mehr bestätigt.
      // Wessen Antwort älter ist als die Verlegung, hat den neuen Termin nie gesehen. Es geht
      // die ganze Liste hinaus und nicht nur der eigene Fall: Die Zeile sagt dem Kapitän wie
      // dem Spieler, wie viele noch offen sind.
      verlegt_am: s.getDateTime('verlegt_am').string(),
      verlegt_von: s.getDateTime('verlegt_von').string(),
      responses_alt: (() => {
        const verlegtAm = s.getDateTime('verlegt_am').string()
        if (!verlegtAm) return []
        return (rMap[s.id] || [])
          .filter((r) => {
            const bestaetigt = r.getDateTime('bestaetigt_am').string()
            return !bestaetigt || bestaetigt < verlegtAm
          })
          .map((r) => r.getString('member'))
      })(),
      // Berechnet, nicht gespeichert (Abschnitt 6.3). Bei Heimspielen null — dort zeigt die
      // Zeitspalte den Anwurf mit dem Label „ANWURF" statt „ABFAHRT".
      // Auswärts ohne Autos: Bus, Bahn, zu Fuß. Der Fahrdienst entfällt, und die Zeile hört auf,
      // Plätze zu zählen und „kein Fahrer" zu rufen.
      ohne_fahrdienst: s.getBool('ohne_fahrdienst'),
      selbst_anreise,
      // Wie es ausgegangen ist — als Hinweis am Spieltag, nicht als Statistik. -1 heißt „nicht
      // eingetragen"; 0 ist ein gültiges Ergebnis, deshalb taugt die Null hier nicht als Leerwert.
      ergebnis_wir: s.getInt('ergebnis_wir'),
      ergebnis_gegner: s.getInt('ergebnis_gegner'),
      // Eine von Hand eingetragene Abfahrt schlägt die Formel. Leer heißt rechnen (6.3) —
      // nur so erreicht eine spätere Änderung an Tempo oder Puffer auch alte Spieltage.
      //
      // OHNE FAHRDIENST WIRD NICHT GERECHNET. Die Formel ist `km / tempo + puffer`, also eine
      // Autofahrt; für eine Bahnverbindung wäre das Ergebnis erfunden. Trägt der Kapitän eine
      // Abfahrt von Hand ein — „wir nehmen den 17:42er" —, gilt sie weiterhin. Sonst zeigt die
      // Spalte den Anwurf, wie beim Heimspiel.
      departure: heim
        ? null
        : u.alsISO(s.getDateTime('departure_manual').string()) ||
          (s.getBool('ohne_fahrdienst')
            ? null
            : (() => {
                const w = u.fahrzeitwerte(s)
                return u.abfahrt(datum, s.getInt('km'), heim, w.tempo, w.puffer)
              })()),
      responses,
      rides,
      seat_claims,
    })
  }

  return e.json(200, {
    // Nur ob es die Seiten gibt, nicht ihr Inhalt: der Aushang blendet die Links sonst auf
    // Seiten ein, die mit 404 antworten.
    impressum: !!einst.impressum,
    datenschutz: !!einst.datenschutz,
    me: sitzung.mitglied.id,
    // Abschnitt 12 · Gehört zu diesem Spieler ein Verwalterkonto? Dann blendet der Aushang den
    // Einstieg in die Verwaltung ein. Das ist KEINE Sicherheitsmaßnahme — /manage steht ohnehin
    // offen (R13e) —, sondern eine Frage der Ruhe: Die übrigen Spieler sollen einen Knopf, den
    // sie nie brauchen, gar nicht erst sehen.
    verwalter: (() => {
      try {
        return !!e.app.findFirstRecordByFilter('verwalter', 'mitglied = {:m}', {
          m: sitzung.mitglied.id,
        })
      } catch {
        return false
      }
    })(),
    members: mitglieder.map((m) => ({ id: m.id, name: m.getString('name') })),
    fixtures: ausgabe,
  })
})
