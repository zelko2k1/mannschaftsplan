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
    200,
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
    for (const r of rMap[s.id] || []) {
      responses[r.getString('member')] = r.getString('status')
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
      // Berechnet, nicht gespeichert (Abschnitt 6.3). Bei Heimspielen null — dort zeigt die
      // Zeitspalte den Anwurf mit dem Label „ANWURF" statt „ABFAHRT".
      // Eine von Hand eingetragene Abfahrt schlägt die Formel. Leer heißt rechnen (6.3) —
      // nur so erreicht eine spätere Änderung an Tempo oder Puffer auch alte Spieltage.
      departure: heim
        ? null
        : u.alsISO(s.getDateTime('departure_manual').string()) ||
          (() => {
            const w = u.fahrzeitwerte(s)
            return u.abfahrt(datum, s.getInt('km'), heim, w.tempo, w.puffer)
          })(),
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
    members: mitglieder.map((m) => ({ id: m.id, name: m.getString('name') })),
    fixtures: ausgabe,
  })
})
