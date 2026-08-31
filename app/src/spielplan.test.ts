import { describe, expect, it } from 'vitest'
import { dekodiere, unlesbareZeichen, zerlegeCsv } from './csv'
import { ausNuligaTermin, leseSpielplan, quellSchluessel, SpielplanFehler } from './spielplan'

// Die Testdatei bildet die drei Formen nach, die in der echten Datei nebeneinander vorkommen:
// eine gewöhnliche Liga mit Heim- und Auswärtsspiel im eigenen Lokal (Vereinsheim, 09000010),
// eine Liga mit Turniertagen an neutralen Orten (dort ist die eigene Mannschaft nominell Heim,
// spielt aber auswärts) und eine unbrauchbare Zeile. Eigener Verein ist 0900001.
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
  `${termin};VBD;2026/27;Bayern 2026/27;Liga;${staffel};0;${begegnungNr};${lokalNr};${lokal};` +
  `VBD;${heimNr};Verein;Kurz;1;${heim};VBD;${gastNr};Verein;Kurz;1;${gast};0;0`

const DATEI = [
  KOPF,
  // Bezirksliga: eigenes Heimspiel im Vereinsheim
  zeile('18.09.2026 20:00', 'Kreisliga A', '2', '09000010', 'Vereinsheim', '0900001', 'SV Beispiel III', '0900002', 'TSV Muster'),
  // Bezirksliga: Auswärtsspiel
  zeile('25.09.2026 20:00', 'Kreisliga A', '7', '09000020', 'Sportheim Muster', '0900002', 'TSV Muster', '0900001', 'SV Beispiel III'),
  // zweites Heimspiel derselben Mannschaft — macht das Vereinsheim zum häufigsten Lokal
  zeile('02.10.2026 20:00', 'Kreisliga A', '9', '09000010', 'Vereinsheim', '0900001', 'SV Beispiel III', '0900003', 'SG Exempel'),
  // Turniertag der Ersten: nuLiga führt uns als Heim, gespielt wird in Beispielstadt
  zeile('05.09.2026 14:30', 'Oberliga', '2', '09000030', 'Sportheim FC Probe', '0900001', 'SV Beispiel', '0900004', 'DC Vorbild'),
  // dasselbe Turnier, wir als Gast
  zeile('05.09.2026 12:00', 'Oberliga', '1', '09000030', 'Sportheim FC Probe', '0900005', 'FC Probe', '0900001', 'SV Beispiel'),
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
  // Der Fall, der ohne diese Funktion still danebenginge: nuLiga liefert Windows-1252.
  it('erkennt Windows-1252 an den kaputten Umlauten und schaltet um', () => {
    const bytes = new Uint8Array([0x4e, 0xfc, 0x72, 0x6e, 0x62, 0x65, 0x72, 0x67]) // G r ü n a u
    expect(dekodiere(bytes.buffer)).toBe('Grünau')
  })

  it('lässt echtes UTF-8 in Ruhe', () => {
    const bytes = new TextEncoder().encode('Grünau')
    expect(dekodiere(bytes.buffer as ArrayBuffer)).toBe('Grünau')
  })

  it('verschlimmbessert eine Datei nicht, in der das Ersetzungszeichen schon steht', () => {
    const bytes = new TextEncoder().encode('Grünau')
    const text = dekodiere(bytes.buffer as ArrayBuffer)
    expect(unlesbareZeichen(text)).toBe(1)
    expect(text).not.toContain('ï¿½')
  })
})

describe('ausNuligaTermin', () => {
  // Die Falle aus PR #7, diesmal 128-fach: nuLiga schreibt Ortszeit, PocketBase speichert UTC.
  // Der Erwartungswert wird aus demselben Date-Objekt abgeleitet, damit die Suite in jeder
  // Zeitzone läuft.
  it('rechnet Ortszeit nach UTC um', () => {
    expect(ausNuligaTermin('05.09.2026 12:00')).toBe(new Date(2026, 8, 5, 12, 0, 0, 0).toISOString())
  })

  it('nimmt auch einen Termin ohne Uhrzeit', () => {
    expect(ausNuligaTermin('05.09.2026')).toBe(new Date(2026, 8, 5, 0, 0, 0, 0).toISOString())
  })

  it('weist Unsinn ab, statt still ein falsches Datum zu liefern', () => {
    expect(ausNuligaTermin('irgendwann')).toBeNull()
    expect(ausNuligaTermin('32.09.2026 20:00')).toBeNull()
    expect(ausNuligaTermin('')).toBeNull()
  })
})

describe('leseSpielplan', () => {
  const plan = leseSpielplan(DATEI)

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

  it('meckert bei einer Datei, die kein Vereinsspielplan ist', () => {
    expect(() => leseSpielplan('a;b;c\n1;2;3')).toThrow(SpielplanFehler)
    expect(() => leseSpielplan('a;b;c\n1;2;3')).toThrow(/HeimMannschaftName/)
  })
})

describe('quellSchluessel', () => {
  // Verlegt heißt: anderer Termin, gleiche Begegnung. Der Schlüssel darf sich nicht ändern,
  // sonst legt der zweite Import den Spieltag ein zweites Mal an.
  it('überlebt eine Verlegung', () => {
    const a = quellSchluessel('2026/27', 'Kreisliga A', '2', 'SV Beispiel III', 'TSV Muster')
    const b = quellSchluessel('2026/27', 'Kreisliga A', '2', 'SV Beispiel III', 'TSV Muster')
    expect(a).toBe(b)
  })

  it('unterscheidet zwei Partien mit derselben Nummer am Turniertag', () => {
    const eins = quellSchluessel('2026/27', 'Oberliga', '2', 'SV Beispiel', 'DC Vorbild')
    const zwei = quellSchluessel('2026/27', 'Oberliga', '2', 'FC Probe', 'SV Beispiel')
    expect(eins).not.toBe(zwei)
  })
})
