/// <reference path="../pb_data/types.d.ts" />
// Die drei schreibenden Mitglieder-Routen aus Abschnitt 5.
//
// Alle drei halten sich an dieselben zwei Regeln, und die sind der ganze Punkt dieser Datei:
//
//   R3 · Das Mitglied kommt AUSSCHLIESSLICH aus dem Cookie. Ein `member`-Feld im Body wird nicht
//        geprüft und nicht abgelehnt — es wird gelesen von niemandem. Wer einen fremden Wert
//        mitschickt, ändert damit seinen eigenen Datensatz.
//   R4 · Whitelist statt Blacklist. Erlaubt ist genau das, was hier steht; alles andere → 400
//        ohne Auskunft darüber, was falsch war.

// ── PUT /api/response/{fixtureId} — dabei / unsicher / kann nicht ───────────────────────────
routerAdd('PUT', '/api/response/{fixtureId}', (e) => {
  const u = require(`${__hooks}/utils.js`)

  const vor = u.zugangPruefen(e, e.request.pathValue('fixtureId'))
  if (vor.fehler) return e.json(vor.fehler.status, { message: vor.fehler.message })
  const { sitzung, spieltag } = vor

  const koerper = e.requestInfo().body || {}
  const status = koerper.status === null || koerper.status === undefined ? null : String(koerper.status)

  // R4 · Genau diese drei Werte, oder null zum Zurücknehmen.
  if (status !== null && ['yes', 'maybe', 'no'].indexOf(status) === -1) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const vorhanden = u.eigenerSatz(e, 'responses', spieltag.id, sitzung.mitglied.id)
  const alt = vorhanden ? vorhanden.getString('status') : ''

  if (status === null) {
    if (vorhanden) e.app.delete(vorhanden)
  } else {
    const satz = vorhanden || new Record(e.app.findCollectionByNameOrId('responses'))
    satz.set('fixture', spieltag.id)
    // Aus der Sitzung, nicht aus dem Body (R3).
    satz.set('member', sitzung.mitglied.id)
    satz.set('status', status)
    e.app.save(satz)
  }

  u.protokollieren(e.app, `member:${sitzung.mitglied.id}`, 'response.set', spieltag.id, alt, status || '')
  return e.json(200, { ok: true, status })
})

// ── PUT /api/ride/{fixtureId} — ich fahre, mit so vielen Plätzen ────────────────────────────
routerAdd('PUT', '/api/ride/{fixtureId}', (e) => {
  const u = require(`${__hooks}/utils.js`)

  const vor = u.zugangPruefen(e, e.request.pathValue('fixtureId'))
  if (vor.fehler) return e.json(vor.fehler.status, { message: vor.fehler.message })
  const { sitzung, spieltag } = vor

  const koerper = e.requestInfo().body || {}
  const faehrt = koerper.driving === true
  const vorhanden = u.eigenerSatz(e, 'rides', spieltag.id, sitzung.mitglied.id)

  if (!faehrt) {
    if (vorhanden) {
      // Die Mitfahrer dieses Autos verschwinden über cascadeDelete gleich mit — sie müssen sich
      // neu einteilen. Alles andere wäre eine stille Lüge im Fahrplan.
      e.app.delete(vorhanden)
    }
    u.protokollieren(e.app, `member:${sitzung.mitglied.id}`, 'ride.set', spieltag.id, 'fährt', 'fährt nicht')
    return e.json(200, { ok: true, driving: false })
  }

  // R4 · Plätze ohne den Fahrer, 1 bis 6. Alles außerhalb → 400.
  const plaetze = Number(koerper.seats)
  if (!Number.isInteger(plaetze) || plaetze < 1 || plaetze > 6) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  // Wer schon in einem anderen Auto sitzt, kann nicht gleichzeitig selbst fahren.
  const alsMitfahrer = u.eigenerSatz(e, 'seat_claims', spieltag.id, sitzung.mitglied.id)
  if (alsMitfahrer) e.app.delete(alsMitfahrer)

  if (vorhanden) {
    // Plätze zu verkleinern, wenn schon mehr Leute drinsitzen, ginge nur, indem der Server
    // jemanden aus dem Auto wirft. Das entscheidet nicht der Server — 409 und der Fahrer klärt es.
    const belegt = e.app
      .findRecordsByFilter('seat_claims', 'ride = {:r}', '', 20, 0, { r: vorhanden.id })
      .length
    if (plaetze < belegt) {
      return e.json(409, { message: `Es sitzen schon ${belegt} Leute mit.` })
    }
  }

  const satz = vorhanden || new Record(e.app.findCollectionByNameOrId('rides'))
  satz.set('fixture', spieltag.id)
  satz.set('member', sitzung.mitglied.id)
  satz.set('seats', plaetze)
  e.app.save(satz)

  u.protokollieren(
    e.app,
    `member:${sitzung.mitglied.id}`,
    'ride.set',
    spieltag.id,
    vorhanden ? String(vorhanden.getInt('seats')) : '',
    String(plaetze),
  )
  return e.json(200, { ok: true, driving: true, seats: plaetze })
})

// ── PUT /api/seat/{fixtureId} — ich fahre bei jemandem mit ──────────────────────────────────
routerAdd('PUT', '/api/seat/{fixtureId}', (e) => {
  const u = require(`${__hooks}/utils.js`)

  const vor = u.zugangPruefen(e, e.request.pathValue('fixtureId'))
  if (vor.fehler) return e.json(vor.fehler.status, { message: vor.fehler.message })
  const { sitzung, spieltag } = vor

  const koerper = e.requestInfo().body || {}
  const mitfahren = koerper.riding === true
  const vorhanden = u.eigenerSatz(e, 'seat_claims', spieltag.id, sitzung.mitglied.id)

  if (!mitfahren) {
    if (vorhanden) e.app.delete(vorhanden)
    u.protokollieren(e.app, `member:${sitzung.mitglied.id}`, 'seat.set', spieltag.id, 'mit', '')
    return e.json(200, { ok: true, riding: false })
  }

  // R4 · Das Auto muss benannt sein, existieren und zu DIESEM Spieltag gehören.
  let fahrt
  try {
    fahrt = e.app.findRecordById('rides', String(koerper.ride || ''))
  } catch {
    fahrt = null
  }
  if (!fahrt || fahrt.getString('fixture') !== spieltag.id) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }
  // Im eigenen Auto mitfahren ergibt keinen Sinn.
  if (fahrt.getString('member') === sitzung.mitglied.id) {
    return e.json(400, { message: 'Ungültige Angabe.' })
  }

  const belegt = e.app
    .findRecordsByFilter('seat_claims', 'ride = {:r}', '', 20, 0, { r: fahrt.id })
    .filter((p) => p.getString('member') !== sitzung.mitglied.id).length
  if (belegt >= fahrt.getInt('seats')) {
    return e.json(409, { message: 'Dieses Auto ist voll.' })
  }

  const satz = vorhanden || new Record(e.app.findCollectionByNameOrId('seat_claims'))
  satz.set('fixture', spieltag.id)
  satz.set('member', sitzung.mitglied.id)
  satz.set('ride', fahrt.id)
  e.app.save(satz)

  u.protokollieren(
    e.app,
    `member:${sitzung.mitglied.id}`,
    'seat.set',
    spieltag.id,
    vorhanden ? vorhanden.getString('ride') : '',
    fahrt.id,
  )
  return e.json(200, { ok: true, riding: true, ride: fahrt.id })
})
