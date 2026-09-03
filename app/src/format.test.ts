import { describe, expect, it } from 'vitest'
import {
  anzahl,
  ausEingabe,
  ausISO,
  ausZeitangabe,
  ergebnis,
  navigationsZiel,
  fuerEingabe,
  nachReihenfolge,
  seit,
  plaetze,
  systemDatum,
  systemDatumZeit,
  tag,
  uhrzeit,
  wannUngefaehr,
} from './format'

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

describe('fuerEingabe / ausEingabe', () => {
  // Der Fehler, den das verhindert: PocketBase liefert UTC, das Feld zeigt Ortszeit. Wer die
  // Zeichenkette einfach durchreicht, verschiebt jeden Anwurf um den Zonenversatz — im Sommer
  // um zwei Stunden, und zwar bei jedem Speichern erneut.
  it('rechnet UTC in Ortszeit fürs Eingabefeld um', () => {
    const utc = '2026-08-29 17:30:00.000Z'
    const d = new Date('2026-08-29T17:30:00Z')
    const zwei = (n: number) => String(n).padStart(2, '0')
    const erwartet =
      `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}` +
      `T${zwei(d.getHours())}:${zwei(d.getMinutes())}`
    expect(fuerEingabe(utc)).toBe(erwartet)
  })

  it('legt den Zeitpunkt bei Hin und Rück nicht um', () => {
    const utc = '2026-08-29 17:30:00.000Z'
    expect(ausEingabe(fuerEingabe(utc))).toBe('2026-08-29 17:30:00')
  })

  it('liest das Feld als Ortszeit, nicht als UTC', () => {
    const eingegeben = '2026-08-29T19:30'
    expect(ausEingabe(eingegeben)).toBe(
      new Date(eingegeben).toISOString().replace('T', ' ').slice(0, 19),
    )
  })

  it('macht aus Unsinn eine leere Angabe statt eines kaputten Datums', () => {
    for (const unsinn of ['', null, undefined, 'nächsten Dienstag']) {
      expect(ausEingabe(unsinn)).toBe('')
      expect(fuerEingabe(unsinn)).toBe('')
    }
  })
})

describe('systemDatumZeit / systemDatum', () => {
  it('schreibt so, wie das System es vorgibt', () => {
    const utc = '2026-08-29 17:30:00.000Z'
    const d = new Date('2026-08-29T17:30:00Z')
    expect(systemDatumZeit(utc)).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d),
    )
    expect(systemDatum(utc)).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d),
    )
  })

  it('zeigt bei fehlendem Wert nichts an', () => {
    expect(systemDatumZeit(null)).toBe('')
    expect(systemDatum('')).toBe('')
  })
})

describe('nachReihenfolge', () => {
  const namen = (liste: string[]) =>
    liste
      .map((name) => ({ name }))
      .sort(nachReihenfolge)
      .map((x) => x.name)

  it('sortiert deutsch statt nach Bytes', () => {
    // Genau die Reihenfolge, die der Server liefert: Kleinbuchstaben und Umlaute hinter dem
    // Großalphabet. Nachgemessen an einer PocketBase-Instanz.
    expect(namen(['Zoe', 'Anna', 'miri', 'Örs', 'Bernd'])).toEqual([
      'Anna',
      'Bernd',
      'miri',
      'Örs',
      'Zoe',
    ])
  })

  it('stellt den Umlaut zum Grundbuchstaben', () => {
    expect(namen(['Mustermann', 'Müller', 'Mayer'])).toEqual(['Mayer', 'Müller', 'Mustermann'])
  })

  it('lässt der gesetzten Reihenfolge den Vortritt', () => {
    const liste = [
      { name: 'Anna', sort: 2 },
      { name: 'Zoe', sort: 1 },
      { name: 'Bernd', sort: 2 },
    ]
    expect([...liste].sort(nachReihenfolge).map((x) => x.name)).toEqual(['Zoe', 'Anna', 'Bernd'])
  })
})

describe('ausZeitangabe', () => {
  it('liest den ISO-Stand aus der Datenbank', () => {
    expect(ausZeitangabe('2026-09-01 08:12:33.123Z')?.toISOString()).toBe('2026-09-01T08:12:33.123Z')
  })

  it('liest die Schreibweise der Go-Laufzeit aus dem Dateisystem', () => {
    // So kommt der Änderungszeitpunkt einer Sicherungsdatei an. `ausISO` scheitert daran.
    expect(ausZeitangabe('2026-09-01 08:12:33.123456 +0000 UTC')?.toISOString()).toBe(
      '2026-09-01T08:12:33.000Z',
    )
  })

  it('gibt bei Unsinn null zurück, statt etwas zu erfinden', () => {
    expect(ausZeitangabe('gestern irgendwann')).toBeNull()
    expect(ausZeitangabe('')).toBeNull()
  })
})

describe('seit', () => {
  const tageHer = (tage: number) => {
    const d = new Date(2026, 8, 1, 12, 0, 0)
    d.setDate(d.getDate() - tage)
    return d.toISOString()
  }
  const jetzt = new Date(2026, 8, 1, 12, 0, 0)

  it('benennt die nahe Vergangenheit', () => {
    expect(seit(tageHer(0), jetzt)).toBe('heute')
    expect(seit(tageHer(1), jetzt)).toBe('gestern')
    expect(seit(tageHer(4), jetzt)).toBe('vor 4 Tagen')
  })

  it('wird gröber, je länger es her ist', () => {
    expect(seit(tageHer(14), jetzt)).toBe('vor 2 Wochen')
    expect(seit(tageHer(60), jetzt)).toBe('vor 2 Monaten')
  })

  it('schweigt bei unbekanntem Datum', () => {
    expect(seit('', jetzt)).toBe('')
  })
})

describe('ergebnis', () => {
  it('benennt Sieg, Niederlage und Unentschieden', () => {
    expect(ergebnis(6, 2)?.text).toBe('Sieg 6:2')
    expect(ergebnis(2, 6)?.text).toBe('Niederlage 2:6')
    expect(ergebnis(4, 4)?.text).toBe('Unentschieden 4:4')
  })

  it('nimmt die Null als Ergebnis ernst', () => {
    // 0:0 ist ein Unentschieden, kein fehlender Eintrag — deshalb heißt „nicht eingetragen" -1.
    expect(ergebnis(0, 0)?.wort).toBe('Unentschieden')
    expect(ergebnis(0, 6)?.wort).toBe('Niederlage')
  })

  it('schweigt, solange nichts eingetragen ist', () => {
    expect(ergebnis(-1, -1)).toBeNull()
    expect(ergebnis(undefined, undefined)).toBeNull()
  })

  it('nimmt ein halb ausgefülltes Ergebnis nicht an', () => {
    expect(ergebnis(6, -1)).toBeNull()
    expect(ergebnis(-1, 2)).toBeNull()
  })
})

describe('navigationsZiel', () => {
  const adresse = 'Musterstraße 5, 12345 Beispielstadt'

  it('öffnet auf Android die installierte App, ohne jemanden zu fragen', () => {
    // `geo:` geht ans Betriebssystem, nicht ins Netz — die Adresse verlässt das Gerät erst,
    // wenn die gewählte App sie selbst nachschlägt.
    expect(navigationsZiel(adresse, 'Mozilla/5.0 (Linux; Android 14) Chrome/120')).toMatch(
      /^geo:0,0\?q=/,
    )
  })

  it('nimmt auf dem iPhone Apple, weil Safari `geo:` nicht kennt', () => {
    expect(navigationsZiel(adresse, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari')).toContain(
      'maps.apple.com',
    )
  })

  it('führt am Schreibtisch auf OpenStreetMap', () => {
    expect(navigationsZiel(adresse, 'Mozilla/5.0 (Windows NT 10.0) Firefox/130')).toContain(
      'openstreetmap.org',
    )
  })

  it('gibt die Adresse in keinem Fall roh weiter', () => {
    for (const kennung of ['Android', 'iPhone', 'Windows']) {
      expect(navigationsZiel(adresse, kennung)).not.toContain(' ')
      expect(navigationsZiel(adresse, kennung)).toContain('Musterstra')
    }
  })
})

describe('anzahl', () => {
  it('nimmt bei eins die Einzahl', () => {
    expect(anzahl(1, 'Fahrt', 'Fahrten')).toBe('1 Fahrt')
  })

  it('nimmt sonst die Mehrzahl', () => {
    expect(anzahl(3, 'Fahrt', 'Fahrten')).toBe('3 Fahrten')
  })

  // Die Null ist Mehrzahl — „0 Fahrt" sagt niemand. Sie kommt in der Oberfläche zwar nicht vor,
  // weil dort nur genannt wird, was tatsächlich wegging; falsch wäre sie trotzdem.
  it('behandelt die Null als Mehrzahl', () => {
    expect(anzahl(0, 'Fahrt', 'Fahrten')).toBe('0 Fahrten')
  })
})
