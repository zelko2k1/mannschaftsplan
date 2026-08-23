import { describe, expect, it } from 'vitest'
import { ausISO, plaetze, tag, uhrzeit, wannUngefaehr } from './format'

// Die Tests rechnen in lokaler Zeit — genau wie die Anzeige. Deshalb werden die Erwartungswerte
// aus demselben Date-Objekt abgeleitet statt fest hingeschrieben; sonst schlägt die Suite in
// jeder anderen Zeitzone fehl, ohne dass irgendetwas kaputt wäre.

describe('ausISO', () => {
  it('versteht PocketBases Format mit Leerzeichen statt T', () => {
    // Genau die Falle, an der die Abfahrtszeit im Backend stillschweigend ausfiel.
    expect(ausISO('2026-08-29 17:30:00.000Z')?.toISOString()).toBe('2026-08-29T17:30:00.000Z')
  })

  it('nimmt auch echtes ISO', () => {
    expect(ausISO('2026-08-29T17:30:00Z')?.toISOString()).toBe('2026-08-29T17:30:00.000Z')
  })

  it('ergänzt eine fehlende Zeitzone als UTC', () => {
    expect(ausISO('2026-08-29 17:30:00')?.toISOString()).toBe('2026-08-29T17:30:00.000Z')
  })

  it('gibt null statt einer kaputten Anzeige', () => {
    for (const unsinn of ['', null, undefined, 'übermorgen']) {
      expect(ausISO(unsinn)).toBeNull()
    }
  })
})

describe('tag', () => {
  it('schreibt den Wochentag ohne Punkt', () => {
    const d = new Date(2026, 7, 29, 19, 30) // Samstag, 29.08.2026
    expect(tag(d.toISOString())).toBe('Sa 29.08.')
  })

  it('füllt einstellige Tage und Monate auf', () => {
    const d = new Date(2026, 0, 4, 12, 0) // Sonntag, 04.01.2026
    expect(tag(d.toISOString())).toBe('So 04.01.')
  })

  it('bleibt bei Unsinn leer statt „Invalid Date" anzuzeigen', () => {
    expect(tag('kaputt')).toBe('')
  })
})

describe('uhrzeit', () => {
  it('füllt auf zwei Stellen auf', () => {
    const d = new Date(2026, 7, 29, 9, 5)
    expect(uhrzeit(d.toISOString())).toBe('09:05')
  })
})

describe('wannUngefaehr', () => {
  const jetzt = new Date(2026, 7, 23, 12, 0)
  const inTagen = (n: number, stunde = 19) =>
    new Date(2026, 7, 23 + n, stunde, 30).toISOString()

  it('benennt die nahen Tage beim Namen', () => {
    expect(wannUngefaehr(inTagen(0), jetzt)).toBe('heute')
    expect(wannUngefaehr(inTagen(1), jetzt)).toBe('morgen')
    expect(wannUngefaehr(inTagen(3), jetzt)).toBe('in 3 Tagen')
  })

  it('zählt in Wochen, sobald Tage nichts mehr sagen', () => {
    expect(wannUngefaehr(inTagen(10), jetzt)).toBe('nächste Woche')
    expect(wannUngefaehr(inTagen(21), jetzt)).toBe('in 3 Wochen')
  })

  it('rechnet in Kalendertagen, nicht in 24-Stunden-Schritten', () => {
    // Heute Mittag, Spieltag heute Abend: „heute", nicht „morgen".
    expect(wannUngefaehr(new Date(2026, 7, 23, 23, 0).toISOString(), jetzt)).toBe('heute')
  })

  it('markiert Vergangenes als vorbei', () => {
    expect(wannUngefaehr(inTagen(-1), jetzt)).toBe('vorbei')
  })
})

describe('plaetze', () => {
  it('zählt richtig im Singular und Plural', () => {
    expect(plaetze(2)).toBe('2 Plätze frei')
    expect(plaetze(1)).toBe('1 Platz frei')
  })

  it('sagt bei null Plätzen etwas Lesbares statt „0 Plätze"', () => {
    expect(plaetze(0)).toBe('keine Plätze frei')
    expect(plaetze(-1)).toBe('keine Plätze frei')
  })
})
