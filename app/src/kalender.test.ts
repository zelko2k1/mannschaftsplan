import { describe, expect, it } from 'vitest'
import { alsIcs } from './kalender'
import type { Spieltag } from './api'

/**
 * Ein Spieltag mit allem Nötigen. Die Tests überschreiben nur, worum es ihnen geht — sonst
 * verdeckt der Aufbau die Aussage.
 */
function spieltag(teil: Partial<Spieltag> = {}): Spieltag {
  return {
    id: 'abc123',
    date: '2026-09-12 17:30:00.000Z',
    opponent_club: 'DC Musterstadt',
    opponent_town: 'Musterstadt',
    is_home: false,
    venue: 'Sportlerheim',
    km: 42,
    meeting_point: 'Vereinsheim',
    needed_players: 4,
    locked: false,
    departure: '2026-09-12 16:35:00.000Z',
    responses: {},
    hinweis: '',
    adresse: '',
    ohne_fahrdienst: false,
    ergebnis_wir: -1,
    ergebnis_gegner: -1,
    selbst_anreise: [],
    verlegt_am: '',
    verlegt_von: '',
    responses_alt: [],
    rides: [],
    seat_claims: {},
    ...teil,
  }
}

/** Entfaltet, was `falten()` umgebrochen hat — für Prüfungen auf den ganzen Wert. */
const entfalten = (ics: string) => ics.replace(/\r\n /g, '')

describe('alsIcs · Gerüst', () => {
  it('ist eine gültige Hülle mit CRLF', () => {
    const ics = alsIcs([spieltag()])
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
    // Kein blankes \n irgendwo: RFC 5545 schreibt CRLF vor, nicht bloß üblicherweise.
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('lässt Spieltage ohne brauchbares Datum weg, statt die Datei zu vergiften', () => {
    const ics = alsIcs([spieltag({ date: 'irgendwann' }), spieltag({ id: 'gut' })])
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('UID:gut@mannschaftsplan')
  })

  it('nimmt eine leere Liste an und liefert einen leeren Kalender', () => {
    const ics = alsIcs([])
    expect(ics).not.toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VCALENDAR')
  })
})

describe('alsIcs · der Termin', () => {
  it('beginnt am Anwurf und dauert drei Stunden, in UTC', () => {
    const ics = alsIcs([spieltag()])
    expect(ics).toContain('DTSTART:20260912T173000Z')
    expect(ics).toContain('DTEND:20260912T203000Z')
  })

  it('nennt erst wohin, dann gegen wen', () => {
    expect(alsIcs([spieltag()])).toContain('SUMMARY:Auswärtsspiel gegen DC Musterstadt')
    expect(alsIcs([spieltag({ is_home: true })])).toContain(
      'SUMMARY:Heimspiel gegen DC Musterstadt',
    )
  })

  it('nimmt den Ort, wenn kein Vereinsname dasteht — und lässt „gegen" sonst weg', () => {
    expect(alsIcs([spieltag({ opponent_club: '' })])).toContain(
      'SUMMARY:Auswärtsspiel gegen Musterstadt',
    )
    const ohne = alsIcs([spieltag({ opponent_club: '', opponent_town: '' })])
    expect(ohne).toContain('SUMMARY:Auswärtsspiel\r\n')
  })

  it('nimmt die Anschrift als Ort, sonst Spielort und Ort', () => {
    const mit = alsIcs([spieltag({ adresse: 'Musterstr. 1, 12345 Musterstadt' })])
    // Das Komma der Anschrift muss maskiert sein, sonst liest der Kalender zwei Werte.
    expect(entfalten(mit)).toContain('LOCATION:Musterstr. 1\\, 12345 Musterstadt')
    expect(entfalten(alsIcs([spieltag()]))).toContain('LOCATION:Sportlerheim\\, Musterstadt')
  })

  // Die Abfahrt steht in ORTSZEIT, wie überall im Aushang — der Spieler liest dieselbe Uhrzeit
  // wie in der Zeile. Deshalb wird die Erwartung aus demselben Date abgeleitet und nicht
  // hingeschrieben: Sonst schlüge der Test in jeder Zeitzone außer der der CI fehl.
  it('stellt Abfahrt und Treffpunkt in die Beschreibung', () => {
    const s = spieltag()
    const abfahrt = new Date(String(s.departure).replace(' ', 'T'))
    const hh = String(abfahrt.getHours()).padStart(2, '0')
    const mm = String(abfahrt.getMinutes()).padStart(2, '0')
    const ics = entfalten(alsIcs([s]))
    expect(ics).toContain(`DESCRIPTION:Abfahrt ${hh}:${mm} Uhr\\nTreffpunkt: Vereinsheim`)
  })

  it('nennt bei einem Heimspiel keine Abfahrt', () => {
    const ics = entfalten(alsIcs([spieltag({ is_home: true })]))
    expect(ics).not.toContain('Abfahrt')
    expect(ics).toContain('DESCRIPTION:Treffpunkt: Vereinsheim')
  })

  // Der Hinweis kann sich ändern, während der Termin im fremden Kalender stehen bleibt — und in
  // ein Freitextfeld schreibt jemand womöglich etwas über eine einzelne Person.
  it('trägt den Hinweis des Kapitäns nicht hinaus', () => {
    const ics = alsIcs([spieltag({ hinweis: 'Uwe kommt später, muss noch zum Arzt' })])
    expect(ics).not.toContain('Uwe')
  })
})

describe('alsIcs · Maskieren (RFC 5545, 3.3.11)', () => {
  // Angestoßen von CodeQL: Der Faltungstest baute die Maskierung mit einem `replace(/,/g, …)`
  // nach und ließ dabei den Backslash aus — dieselbe halbe Sanitisierung, die der Scanner in
  // echtem Code zu Recht anmahnt. Statt sie im Test zu wiederholen, wird sie hier geprüft.
  it('maskiert Backslash, Semikolon und Komma', () => {
    const wild = 'Weg 1\\2; Haus, hinten'
    const ics = alsIcs([spieltag({ adresse: wild })])
    // Der Backslash zuerst, sonst verdoppelt sein Ersatz die Maskierung der übrigen Zeichen.
    expect(entfalten(ics)).toContain('LOCATION:Weg 1\\\\2\\; Haus\\, hinten')
  })

  it('macht aus einem Zeilenumbruch im Treffpunkt kein zweites Feld', () => {
    const ics = alsIcs([spieltag({ meeting_point: 'Vereinsheim\nHintereingang' })])
    // Ein rohes CRLF hier zerrisse den Termin — der Kalender läse ab dort eine neue Eigenschaft.
    expect(entfalten(ics)).toContain('Treffpunkt: Vereinsheim\\nHintereingang')
    // Keine ZEILE darf damit beginnen — dann wäre aus dem Wert eine neue Eigenschaft geworden.
    // (Dass `Hintereingang` vor einem CRLF steht, ist dagegen richtig: Dort endet DESCRIPTION.)
    expect(ics.split('\r\n').some((z) => z.startsWith('Hintereingang'))).toBe(false)
  })
})

describe('alsIcs · Wiedereinlesen', () => {
  it('gibt jedem Termin die ID seines Spieltags, damit nichts sich verdoppelt', () => {
    expect(alsIcs([spieltag({ id: 'xyz789' })])).toContain('UID:xyz789@mannschaftsplan')
  })

  it('weist einen verlegten Spieltag als neuere Fassung aus', () => {
    expect(alsIcs([spieltag()])).toContain('SEQUENCE:0')
    const verlegt = alsIcs([spieltag({ verlegt_am: '2026-09-05 08:00:00.000Z' })])
    const zahl = Number(/SEQUENCE:(\d+)/.exec(verlegt)?.[1])
    expect(zahl).toBeGreaterThan(0)
    expect(Number.isSafeInteger(zahl)).toBe(true)
  })
})

describe('alsIcs · Zeilen falten (RFC 5545, 3.1)', () => {
  it('bricht keine Zeile über 75 Oktett hinaus um', () => {
    const ics = alsIcs([
      spieltag({ adresse: 'Sehr lange Straße des 17. Juni 123 a, 12345 Irgendwo im Nirgendwo' }),
    ])
    for (const zeile of ics.split('\r\n')) {
      expect(new TextEncoder().encode(zeile).length).toBeLessThanOrEqual(75)
    }
  })

  // Die Anschrift hier hat bewusst KEIN Komma: Es geht ums Falten, nicht ums Maskieren. Eine
  // Erwartung, die die Maskierung im Test nachbaut, wäre eine zweite Fassung von `maskieren()` —
  // und mit Sicherheit eine unvollständige. Das Maskieren prüft der Block darunter.
  it('setzt die Fortsetzung mit einem Leerzeichen fort und verliert dabei nichts', () => {
    const lang = 'Straße am Beispielweg 1 in 12345 Musterstadt-Übermorgenhausen Nebengebäude B'
    const ics = alsIcs([spieltag({ adresse: lang })])
    expect(ics).toContain('\r\n ')
    expect(entfalten(ics)).toContain(lang)
  })

  // Umlaute sind in UTF-8 zwei Oktett. Ein Umbruch mitten im Zeichen macht die Datei kaputt —
  // deshalb wird in Oktett gemessen und trotzdem an Zeichengrenzen getrennt.
  it('trennt nicht mitten in einem Umlaut', () => {
    const ics = alsIcs([spieltag({ adresse: 'ä'.repeat(80) })])
    expect(entfalten(ics)).toContain('ä'.repeat(80))
    expect(ics).not.toContain('�')
  })
})
