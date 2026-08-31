import { describe, expect, it } from 'vitest'
import { dekodiere, unlesbareZeichen, zerlegeCsv } from './csv'
import {
  ausTermin,
  leseSpielplan,
  quellSchluessel,
  SpielplanFehler,
  VORLAGE_SPALTEN,
  vorlageCsv,
} from './spielplan'

// Die Testdatei bildet die drei Formen nach, die in einem echten Verbands-Export nebeneinander
// vorkommen: eine gewöhnliche Liga mit Heim- und Auswärtsspiel im eigenen Lokal (Vereinsheim,
// 09000010), eine Liga mit Turniertagen an neutralen Orten (dort ist die eigene Mannschaft
// nominell Heim, spielt aber auswärts) und eine unbrauchbare Zeile. Eigener Verein ist 0900001.
const KOPF =
  'Termin;Verband;Saison;Meisterschaft;Liga;Staffel;Spieltag;BegegnungNr;SpiellokalNr;SpiellokalName;' +
  'HeimVereinVerband;HeimVereinNr;HeimVereinName;HeimVereinKurzName;HeimMannschaftNr;HeimMannschaftName;' +
  'GastVereinVerband;GastVereinNr;GastVereinName;GastVereinKurzName;GastMannschaftNr;GastMannschaftName;' +
  'ToreHeim;ToreGast'

const zeile = (
  termin: string,
  staffel: string,
  begegnungNr: string,
  lokalNr: string,
  lokal: string,
  heimNr: string,
  heim: string,
  gastNr: string,
  gast: string,
) =>
  `${termin};VBD;2026/27;Beispiel 2026/27;Liga;${staffel};0;${begegnungNr};${lokalNr};${lokal};` +
  `VBD;${heimNr};Verein;Kurz;1;${heim};VBD;${gastNr};Verein;Kurz;1;${gast};0;0`

const VERBANDSDATEI = [
  KOPF,
  // Bezirksliga: eigenes Heimspiel im Vereinsheim
  zeile('18.09.2026 20:00', 'Kreisliga A', '2', '09000010', 'Vereinsheim', '0900001', 'SV Beispiel III', '0900002', 'TSV Muster'),
  // Bezirksliga: Auswärtsspiel
  zeile('25.09.2026 20:00', 'Kreisliga A', '7', '09000020', 'Sportheim Muster', '0900002', 'TSV Muster', '0900001', 'SV Beispiel III'),
  // zweites Heimspiel derselben Mannschaft — macht das Vereinsheim zum häufigsten Lokal
  zeile('02.10.2026 20:00', 'Kreisliga A', '9', '09000010', 'Vereinsheim', '0900001', 'SV Beispiel III', '0900003', 'SG Exempel'),
  // Turniertag der Ersten: die Datei führt uns als Heim, gespielt wird an einem neutralen Ort
  zeile('05.09.2026 14:30', 'Oberliga', '2', '09000050', 'Sportheim FC Probe', '0900001', 'SV Beispiel', '0900004', 'DC Vorbild'),
  // dasselbe Turnier, wir als Gast
  zeile('05.09.2026 12:00', 'Oberliga', '1', '09000050', 'Sportheim FC Probe', '0900005', 'FC Probe', '0900001', 'SV Beispiel'),
  // einziges echtes Heimspiel der Ersten
  zeile('24.10.2026 12:00', 'Oberliga', '22', '09000010', 'Vereinsheim', '0900001', 'SV Beispiel', '0900006', 'SV Nachbar'),
  // spielfrei — kein Gegner
  zeile('30.10.2026 20:00', 'Kreisliga A', '11', '09000010', 'Vereinsheim', '0900001', 'SV Beispiel III', '', ''),
  // kaputter Termin
  zeile('irgendwann', 'Kreisliga A', '12', '09000010', 'Vereinsheim', '0900001', 'SV Beispiel III', '0900002', 'TSV Muster'),
].join('\r\n')

describe('zerlegeCsv', () => {
  it('nimmt Semikolon, CRLF und ein BOM', () => {
    const zeilen = zerlegeCsv('﻿a;b;c\r\n1;2;3\r\n')
    expect(zeilen).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('versteht Anführungszeichen samt verdoppelter im Feld', () => {
    expect(zerlegeCsv('a;b\n"Sport;heim";"sagt ""hallo"""')).toEqual([
      ['a', 'b'],
      ['Sport;heim', 'sagt "hallo"'],
    ])
  })
})

describe('dekodiere', () => {
  // Der Fall, der ohne diese Funktion still danebengeht: Verbands-Exporte sind oft Windows-1252.
  it('erkennt Windows-1252 an den kaputten Umlauten und schaltet um', () => {
    const bytes = new Uint8Array([0x47, 0x72, 0xfc, 0x6e]) // G r ü n
    expect(dekodiere(bytes.buffer)).toBe('Grün')
  })

  it('lässt echtes UTF-8 in Ruhe', () => {
    const bytes = new TextEncoder().encode('Grün')
    expect(dekodiere(bytes.buffer as ArrayBuffer)).toBe('Grün')
  })

  it('verschlimmbessert eine Datei nicht, in der das Ersetzungszeichen schon steht', () => {
    const bytes = new TextEncoder().encode('Gr�n')
    const text = dekodiere(bytes.buffer as ArrayBuffer)
    expect(unlesbareZeichen(text)).toBe(1)
    expect(text).not.toContain('ï¿½')
  })
})

describe('ausTermin', () => {
  // Die Falle aus PR #7, diesmal über hundertfach: die Datei schreibt Ortszeit, PocketBase
  // speichert UTC. Der Erwartungswert wird aus demselben Date-Objekt abgeleitet, damit die Suite
  // in jeder Zeitzone läuft.
  it('rechnet Ortszeit nach UTC um', () => {
    expect(ausTermin('05.09.2026 12:00')).toBe(new Date(2026, 8, 5, 12, 0, 0, 0).toISOString())
  })

  it('nimmt Datum und Uhrzeit auch getrennt — so steht es in der Vorlage', () => {
    expect(ausTermin('05.09.2026', '12:00')).toBe(new Date(2026, 8, 5, 12, 0, 0, 0).toISOString())
  })

  it('versteht auch die ISO-Schreibweise, die Tabellenprogramme gern erzeugen', () => {
    expect(ausTermin('2026-09-05', '12:00')).toBe(new Date(2026, 8, 5, 12, 0, 0, 0).toISOString())
  })

  it('nimmt einen Termin ohne Uhrzeit', () => {
    expect(ausTermin('05.09.2026')).toBe(new Date(2026, 8, 5, 0, 0, 0, 0).toISOString())
  })

  it('weist Unsinn ab, statt still ein falsches Datum zu liefern', () => {
    expect(ausTermin('irgendwann')).toBeNull()
    expect(ausTermin('32.09.2026 20:00')).toBeNull()
    expect(ausTermin('05.09.2026', '25:00')).toBeNull()
    expect(ausTermin('')).toBeNull()
  })
})

describe('leseSpielplan · Verbands-Export', () => {
  const plan = leseSpielplan(VERBANDSDATEI)

  it('erkennt die eigenen Mannschaften', () => {
    expect(plan.mannschaften).toEqual(['SV Beispiel', 'SV Beispiel III'])
    expect(plan.saison).toBe('2026/27')
  })

  it('überspringt spielfrei und kaputte Termine, ohne den Rest zu verlieren', () => {
    expect(plan.zeilen).toHaveLength(6)
    expect(plan.uebersprungen).toBe(2)
    expect(plan.warnungen.some((w) => w.includes('Unlesbarer Termin'))).toBe(true)
  })

  it('setzt den Gegner auf die Mannschaft, nicht auf den Verein', () => {
    const heim = plan.zeilen.find((z) => z.staffel === 'Kreisliga A' && z.is_home)
    expect(heim?.opponent_club).toBe('TSV Muster')
    expect(heim?.mannschaft).toBe('SV Beispiel III')
  })

  it('lässt Ort und Kilometer leer — die kennt kein Verbands-Export', () => {
    expect(plan.zeilen.every((z) => z.opponent_town === '' && z.km === 0)).toBe(true)
  })

  // Der Kern: Heim ergibt sich aus dem Spiellokal, nicht aus der Spalte.
  it('zählt ein Heimspiel am neutralen Ort als Auswärtsspiel', () => {
    const turnier = plan.zeilen.find((z) => z.opponent_club === 'DC Vorbild')
    expect(turnier?.is_home).toBe(false)
    expect(turnier?.heimAnFremdemOrt).toBe(true)
    expect(turnier?.venue).toBe('Sportheim FC Probe')
  })

  it('lässt das echte Heimspiel derselben Mannschaft Heimspiel bleiben', () => {
    const daheim = plan.zeilen.find((z) => z.opponent_club === 'SV Nachbar')
    expect(daheim?.is_home).toBe(true)
  })

  it('erklärt die neutralen Orte in einer Warnung', () => {
    expect(plan.warnungen.some((w) => w.includes('gespielt wird aber woanders'))).toBe(true)
  })
})

describe('leseSpielplan · Vorlage', () => {
  const DATEI = [
    VORLAGE_SPALTEN.join(';'),
    '18.09.2026;20:00;Erste;Gegner A;nein;Sportheim A;Beispielstadt;42;',
    '25.09.2026;20:00;Erste;Gegner B;ja;Unser Heim;;;',
    '02.10.2026;19:30;Zweite;Gegner C;Nein;Sportheim C;Anderswo;13,4;pokal-1',
    // ohne Gegner → übersprungen
    '09.10.2026;20:00;Erste;;nein;;;;',
  ].join('\r\n')
  const plan = leseSpielplan(DATEI)

  it('liest die Zeilen und erkennt beide Mannschaften', () => {
    expect(plan.zeilen).toHaveLength(3)
    expect(plan.uebersprungen).toBe(1)
    expect(plan.mannschaften).toEqual(['Erste', 'Zweite'])
  })

  it('nimmt Ort und Kilometer mit — dafür gibt es die Vorlage', () => {
    const auswaerts = plan.zeilen.find((z) => z.opponent_club === 'Gegner A')
    expect(auswaerts?.is_home).toBe(false)
    expect(auswaerts?.opponent_town).toBe('Beispielstadt')
    expect(auswaerts?.km).toBe(42)
    expect(auswaerts?.venue).toBe('Sportheim A')
  })

  it('versteht „ja" in jeder Schreibweise und rundet ein Komma weg', () => {
    expect(plan.zeilen.find((z) => z.opponent_club === 'Gegner B')?.is_home).toBe(true)
    expect(plan.zeilen.find((z) => z.opponent_club === 'Gegner C')?.km).toBe(13)
  })

  it('bildet ohne eigene Kennung einen Schlüssel, der eine Verlegung überlebt', () => {
    const vorher = leseSpielplan(DATEI).zeilen.find((z) => z.opponent_club === 'Gegner A')
    const verlegt = leseSpielplan(DATEI.replace('18.09.2026', '19.09.2026')).zeilen.find(
      (z) => z.opponent_club === 'Gegner A',
    )
    expect(verlegt?.date).not.toBe(vorher?.date)
    expect(verlegt?.quelle).toBe(vorher?.quelle)
  })

  it('nimmt eine eigene Kennung, wenn eine dasteht', () => {
    const mitKennung = plan.zeilen.find((z) => z.opponent_club === 'Gegner C')
    expect(mitKennung?.quelle).toBe(quellSchluessel(['vorlage', 'Zweite', 'pokal-1']))
  })

  it('warnt, wenn dieselbe Paarung mehrfach mit derselben Seite vorkommt', () => {
    const doppelt = [
      VORLAGE_SPALTEN.join(';'),
      '18.09.2026;20:00;Erste;Gegner A;nein;;;;',
      '20.11.2026;20:00;Erste;Gegner A;nein;;;;',
    ].join('\r\n')
    const zweimal = leseSpielplan(doppelt)
    expect(zweimal.zeilen).toHaveLength(2)
    expect(zweimal.zeilen[0].quelle).not.toBe(zweimal.zeilen[1].quelle)
    expect(zweimal.warnungen.some((w) => w.includes('Kennung'))).toBe(true)
  })
})

describe('vorlageCsv', () => {
  // Die Vorlage muss durch denselben Leser gehen wie eine ausgefüllte Datei — sonst lädt jemand
  // etwas herunter, das die App anschließend nicht annimmt.
  it('lässt sich unverändert wieder einlesen', () => {
    const plan = leseSpielplan(vorlageCsv())
    expect(plan.zeilen).toHaveLength(2)
    expect(plan.mannschaften).toEqual(['Erste'])
    expect(plan.zeilen[0].km).toBe(42)
    expect(plan.zeilen[1].is_home).toBe(true)
  })

  it('beginnt mit einem BOM und trennt mit Semikolon — sonst zerlegt Excel sie falsch', () => {
    expect(vorlageCsv().startsWith('﻿')).toBe(true)
    expect(vorlageCsv().split('\r\n')[0]).toBe('﻿' + VORLAGE_SPALTEN.join(';'))
  })
})

describe('leseSpielplan · was keine der beiden Formen ist', () => {
  it('sagt, welche Spalten die Vorlage braucht', () => {
    expect(() => leseSpielplan('a;b;c\n1;2;3')).toThrow(SpielplanFehler)
    expect(() => leseSpielplan('a;b;c\n1;2;3')).toThrow(/Datum, Mannschaft, Gegner, Heim/)
  })
})

describe('quellSchluessel', () => {
  // Verlegt heißt: anderer Termin, gleiche Begegnung. Der Schlüssel darf sich nicht ändern,
  // sonst legt der zweite Import den Spieltag ein zweites Mal an.
  it('unterscheidet zwei Partien mit derselben Nummer am Turniertag', () => {
    const eins = quellSchluessel(['verband', '2026/27', 'Oberliga', '2', 'SV Beispiel', 'DC Vorbild'])
    const zwei = quellSchluessel(['verband', '2026/27', 'Oberliga', '2', 'FC Probe', 'SV Beispiel'])
    expect(eins).not.toBe(zwei)
  })

  it('hält Vorlage und Verbands-Export auseinander', () => {
    expect(quellSchluessel(['vorlage', 'Erste', 'A'])).not.toBe(quellSchluessel(['verband', 'Erste', 'A']))
  })
})
