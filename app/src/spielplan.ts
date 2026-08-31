// Liest einen Spielplan aus einer CSV-Datei und macht daraus Spieltage.
//
// ZWEI FORMEN, erkannt an der Kopfzeile:
//
//  1. **Der Export deines Verbands.** Eine Datei für den ganzen Verein, alle Mannschaften, alle
//     Staffeln — bei einem mittelgroßen Verein gut 130 Begegnungen. Nichts abzutippen, aber die
//     Datei kennt nur, was der Verband führt: kein Ort, keine Entfernung.
//  2. **Die Vorlage** (`vorlageCsv()`), von Hand ausgefüllt. Für Vereine, deren Verband nichts
//     Brauchbares ausgibt, für Pokalrunden und für Freundschaftsspiele. Wenige Spalten, dafür
//     dürfen Ort und Kilometer gleich mitkommen.
//
// Reine Funktionen, kein Netz, kein DOM. Was hier herauskommt, ist ein Vorschlag — bestätigt
// wird er in der Verwaltung, geschrieben wird er serverseitig.

import { zerlegeCsv } from './csv'

/** Eine Begegnung der eigenen Mannschaft, fertig für die Vorschau. */
export type ImportZeile = {
  /** Stabiler Schlüssel über Importe hinweg — siehe `quellSchluessel`. */
  quelle: string
  /** Name der eigenen Mannschaft, so wie sie in der Datei steht. */
  mannschaft: string
  /** Anwurf als ISO-Zeitstempel in UTC. */
  date: string
  /** Der Gegner — die Mannschaft, nicht der Verein („TSV Muster", nicht „TSV Muster"). */
  opponent_club: string
  /** Wird bei uns gespielt? Beim Verbands-Export aus dem Spiellokal, siehe unten. */
  is_home: boolean
  /** Die Spielstätte, wie sie in der Datei steht. */
  venue: string
  /** Ort des Gegners — nur die Vorlage kennt ihn; aus einem Verbands-Export kommt er leer. */
  opponent_town: string
  /** Einfache Strecke in Kilometern. 0 = nicht angegeben. */
  km: number
  /** Staffel oder Wettbewerb — nur zur Orientierung in der Vorschau. */
  staffel: string
  /**
   * Wahr, wenn der Verband uns als Heimmannschaft führt, gespielt aber woanders wird. Das ist
   * kein Fehler, sondern der Normalfall in Ligen mit Turniertagen — die Vorschau weist darauf
   * hin, weil es dem Kapitän sonst wie ein Importfehler vorkommt.
   */
  heimAnFremdemOrt: boolean
}

export type Spielplan = {
  saison: string
  /** Die eigenen Mannschaften, wie sie in der Datei heißen — Vorlage für die Zuordnung. */
  mannschaften: string[]
  zeilen: ImportZeile[]
  /** Zeilen, die keine verwertbare Begegnung waren (spielfrei, kaputtes Datum). */
  uebersprungen: number
  warnungen: string[]
}

/**
 * Die Spalten der Vorlage. Reihenfolge = Reihenfolge in der Datei.
 *
 * Diese Liste ist die einzige Wahrheit: Sowohl die heruntergeladene Vorlage als auch das Lesen
 * richten sich danach. Wer hier etwas ändert, ändert beides zugleich — genau darum steht es an
 * einer Stelle.
 */
export const VORLAGE_SPALTEN = [
  'Datum',
  'Uhrzeit',
  'Mannschaft',
  'Gegner',
  'Heim',
  'Spielort',
  'Ort',
  'Kilometer',
  'Kennung',
] as const

/** Ohne diese vier ist eine Zeile der Vorlage nicht zu gebrauchen. */
const VORLAGE_PFLICHT = ['Datum', 'Mannschaft', 'Gegner', 'Heim']

/** Woran ein Verbands-Export zu erkennen ist. */
const VERBAND_PFLICHT = [
  'Termin',
  'Staffel',
  'BegegnungNr',
  'SpiellokalNr',
  'SpiellokalName',
  'HeimVereinNr',
  'HeimMannschaftName',
  'GastVereinNr',
  'GastMannschaftName',
]

export class SpielplanFehler extends Error {}

const sauber = (wert: string | undefined) => (wert || '').replace(/\s+/g, ' ').trim()

/**
 * Die Vorlage zum Herunterladen — Kopfzeile und zwei Beispielzeilen.
 *
 * Semikolon als Trennzeichen, CRLF und ein BOM: So öffnet Excel die Datei in einem deutschen
 * Windows ohne Nachfrage und ohne zerschossene Umlaute. Ohne BOM liest Excel die Datei als
 * Windows-1252: aus „Grün" wird „GrÃ¼n" — und der Mannschaftsname ist hier der Schlüssel für
 * die Zuordnung.
 *
 * Die Beispielzeilen zeigen beides: eine vollständig ausgefüllte Auswärtsfahrt und ein Heimspiel,
 * bei dem Ort und Kilometer zu Recht leer bleiben.
 */
export function vorlageCsv(): string {
  const zeilen = [
    VORLAGE_SPALTEN.join(';'),
    '18.09.2026;20:00;Erste;Beispielverein II;nein;Sportheim Beispielstadt;Beispielstadt;42;',
    '25.09.2026;20:00;Erste;Anderer Verein;ja;Unser Vereinsheim;;;',
  ]
  return '\uFEFF' + zeilen.join('\r\n') + '\r\n'
}

/**
 * Der Schlüssel, an dem ein zweiter Import dieselbe Begegnung wiedererkennt.
 *
 * Bewusst OHNE Termin: eine verlegte Begegnung soll aktualisiert und nicht ein zweites Mal
 * angelegt werden. Beim Verbands-Export gehören die beiden Mannschaften hinein, weil
 * `BegegnungNr` innerhalb einer Staffel mehrfach vorkommt — an einem Turniertag tragen mehrere
 * Partien dieselbe Nummer.
 */
export function quellSchluessel(teile: (string | number)[]): string {
  return teile.map((t) => sauber(String(t))).join('|')
}

/**
 * „05.09.2026 12:00" oder „05.09.2026" plus „12:00" → ISO in UTC.
 *
 * Die Datei schreibt **Ortszeit**, PocketBase speichert **UTC**. Genau an dieser Stelle lagen in
 * PR #7 alle von Hand eingetragenen Anwürfe zwei Stunden daneben; bei einem Import wären es
 * über hundert auf einen Schlag. Deshalb wird hier über die lokale Zeitzone des Browsers
 * gerechnet — derselbe Weg, den auch das Eingabefeld nimmt.
 *
 * Verstanden werden TT.MM.JJJJ und JJJJ-MM-TT; die Uhrzeit darf fehlen.
 */
export function ausTermin(datum: string, uhrzeit = ''): string | null {
  const eingabe = sauber(datum)
  const zeitTeil = sauber(uhrzeit) || (/\s/.test(eingabe) ? eingabe.split(' ').slice(1).join(' ') : '')
  const datumTeil = eingabe.split(' ')[0]

  let jahr = 0
  let monat = 0
  let tag = 0
  const deutsch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(datumTeil)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datumTeil)
  if (deutsch) {
    tag = Number(deutsch[1])
    monat = Number(deutsch[2])
    jahr = Number(deutsch[3])
  } else if (iso) {
    jahr = Number(iso[1])
    monat = Number(iso[2])
    tag = Number(iso[3])
  } else return null

  let stunde = 0
  let minute = 0
  if (zeitTeil) {
    const zeit = /^(\d{1,2})[:.](\d{2})$/.exec(zeitTeil)
    if (!zeit) return null
    stunde = Number(zeit[1])
    minute = Number(zeit[2])
    if (stunde > 23 || minute > 59) return null
  }

  const wert = new Date(jahr, monat - 1, tag, stunde, minute, 0, 0)
  if (isNaN(wert.getTime())) return null
  // Ein Tippfehler im Tag ergäbe sonst klaglos ein Datum im Folgemonat.
  if (wert.getDate() !== tag || wert.getMonth() !== monat - 1) return null
  return wert.toISOString()
}

/** „ja", „x", „1", „wahr", „heim" — alles, was jemand in eine Ja/Nein-Spalte schreibt. */
function jaNein(wert: string): boolean {
  return /^(ja|j|x|1|wahr|true|heim|daheim|zuhause)$/i.test(sauber(wert))
}

/**
 * Der häufigste Wert einer Liste. Leerstrings zählen nicht mit.
 *
 * `bevorzugt` entscheidet den Gleichstand. Das ist keine Kosmetik: eine Mannschaft, die in der
 * Datei genau ein Heimspiel daheim und eines an einem Turnierort hat, steht sonst vor einem
 * Losentscheid — und je nachdem, wie er ausgeht, verliert entweder ein echtes Heimspiel oder
 * eine echte Fahrt ihre Einordnung.
 */
function haeufigster(werte: string[], bevorzugt = ''): string {
  const zaehler = new Map<string, number>()
  for (const w of werte) {
    if (!w) continue
    zaehler.set(w, (zaehler.get(w) ?? 0) + 1)
  }
  let bester = ''
  let meiste = 0
  for (const [wert, anzahl] of zaehler) {
    if (anzahl > meiste || (anzahl === meiste && wert === bevorzugt)) {
      meiste = anzahl
      bester = wert
    }
  }
  return bester
}

/** Kopfzeile → Spaltenindex, ohne Rücksicht auf Groß-/Kleinschreibung. */
function spaltenverzeichnis(kopf: string[]): Map<string, number> {
  return new Map(kopf.map((name, i) => [sauber(name).toLowerCase(), i]))
}

const hatAlle = (spalte: Map<string, number>, namen: string[]) =>
  namen.every((n) => spalte.has(n.toLowerCase()))

/**
 * Liest die Datei — welche der beiden Formen es ist, entscheidet die Kopfzeile.
 *
 * Wirft `SpielplanFehler`, wenn es erkennbar keine von beiden ist; alles andere landet als
 * Warnung in der Vorschau, damit ein einzelner Ausreißer nicht den ganzen Import verhindert.
 */
export function leseSpielplan(text: string): Spielplan {
  const roh = zerlegeCsv(text)
  if (roh.length < 2) throw new SpielplanFehler('Die Datei enthält keine Zeilen.')

  const spalte = spaltenverzeichnis(roh[0])
  if (hatAlle(spalte, VERBAND_PFLICHT)) return leseVerbandsexport(roh, spalte)
  if (hatAlle(spalte, VORLAGE_PFLICHT)) return leseVorlage(roh, spalte)

  throw new SpielplanFehler(
    'Diese Datei ist weder ein Verbands-Export noch die Vorlage. In der Vorlage müssen die ' +
      `Spalten ${VORLAGE_PFLICHT.join(', ')} vorkommen — am einfachsten die Vorlage herunterladen ` +
      'und ausfüllen.',
  )
}

/** Die selbst ausgefüllte Vorlage. Eine Zeile, eine Begegnung, keine Heuristik. */
function leseVorlage(roh: string[][], spalte: Map<string, number>): Spielplan {
  const feld = (zeile: string[], name: string) => {
    const i = spalte.get(name.toLowerCase())
    return i === undefined ? '' : sauber(zeile[i])
  }

  const zeilen: ImportZeile[] = []
  const warnungen: string[] = []
  let uebersprungen = 0
  const belegt = new Map<string, number>()

  for (const z of roh.slice(1)) {
    const mannschaft = feld(z, 'Mannschaft')
    const gegner = feld(z, 'Gegner')
    if (!mannschaft || !gegner) {
      uebersprungen++
      continue
    }

    const date = ausTermin(feld(z, 'Datum'), feld(z, 'Uhrzeit'))
    if (!date) {
      uebersprungen++
      warnungen.push(
        `Unlesbares Datum bei ${mannschaft} – ${gegner}: „${feld(z, 'Datum')} ${feld(z, 'Uhrzeit')}"`,
      )
      continue
    }

    const is_home = jaNein(feld(z, 'Heim'))
    const kilometer = Number(feld(z, 'Kilometer').replace(',', '.'))

    // Ohne eigene Kennung wird sie gebildet — aus dem, was eine Begegnung ausmacht und sich bei
    // einer Verlegung NICHT ändert. Spielt dieselbe Paarung mehrfach mit derselben Seite, hängt
    // eine laufende Nummer an; die Kennungsspalte gibt es genau für diesen Fall.
    const eigene = feld(z, 'Kennung')
    let schluessel = quellSchluessel(['vorlage', mannschaft, gegner, is_home ? 'H' : 'A'])
    if (eigene) {
      schluessel = quellSchluessel(['vorlage', mannschaft, eigene])
    } else {
      const schon = belegt.get(schluessel) ?? 0
      belegt.set(schluessel, schon + 1)
      if (schon > 0) schluessel = `${schluessel}|${schon + 1}`
    }

    zeilen.push({
      quelle: schluessel,
      mannschaft,
      date,
      opponent_club: gegner.slice(0, 80),
      is_home,
      venue: feld(z, 'Spielort').slice(0, 120),
      opponent_town: feld(z, 'Ort').slice(0, 80),
      km: Number.isFinite(kilometer) && kilometer > 0 ? Math.round(kilometer) : 0,
      staffel: '',
      heimAnFremdemOrt: false,
    })
  }

  const mehrfach = [...belegt.values()].filter((n) => n > 1).length
  if (mehrfach > 0) {
    warnungen.push(
      `${mehrfach} Paarung(en) kommen mehrfach mit derselben Seite vor. Das geht, ist aber ` +
        'sicherer mit einer eigenen Angabe in der Spalte „Kennung" — sonst hängt die ' +
        'Wiedererkennung an der Reihenfolge in der Datei.',
    )
  }

  return {
    saison: '',
    mannschaften: [...new Set(zeilen.map((z) => z.mannschaft))].sort((a, b) => a.localeCompare(b, 'de')),
    zeilen,
    uebersprungen,
    warnungen,
  }
}

/** Der Export des Verbands: eine Datei für den ganzen Verein, gefiltert auf ihn. */
function leseVerbandsexport(roh: string[][], spalte: Map<string, number>): Spielplan {
  const feld = (zeile: string[], name: string) => {
    const i = spalte.get(name.toLowerCase())
    return i === undefined ? '' : sauber(zeile[i])
  }
  const daten = roh.slice(1)

  // Der eigene Verein ist der, der in fast jeder Zeile vorkommt — der Export ist auf ihn
  // gefiltert. Über die Vereinsnummer statt über den Namen, weil Vereine je nach Spalte mal
  // „SV Beispiel" und mal „SV Beispiel 1920 e.V." heißen.
  const eigenerVerein = haeufigster(
    daten.flatMap((z) => [feld(z, 'HeimVereinNr'), feld(z, 'GastVereinNr')]),
  )
  if (!eigenerVerein) throw new SpielplanFehler('In der Datei steht keine Vereinsnummer.')

  // Heimlokal je eigener Mannschaft: das Lokal, in dem sie ihre Heimspiele überwiegend austrägt.
  const lokaleJeMannschaft = new Map<string, string[]>()
  for (const z of daten) {
    if (feld(z, 'HeimVereinNr') !== eigenerVerein) continue
    const m = feld(z, 'HeimMannschaftName')
    if (!m) continue
    lokaleJeMannschaft.set(m, [...(lokaleJeMannschaft.get(m) ?? []), feld(z, 'SpiellokalNr')])
  }
  // Das Lokal des Vereins bricht den Gleichstand: Mannschaften eines Vereins spielen fast immer
  // im selben Lokal, und über alle Mannschaften zusammen ist der Befund eindeutig, auch wenn er
  // es für eine einzelne Mannschaft nicht ist.
  const vereinsLokal = haeufigster([...lokaleJeMannschaft.values()].flat())
  const heimlokal = new Map<string, string>()
  for (const [m, lokale] of lokaleJeMannschaft) heimlokal.set(m, haeufigster(lokale, vereinsLokal))

  const zeilen: ImportZeile[] = []
  const warnungen: string[] = []
  let uebersprungen = 0
  let neutraleOrte = 0

  for (const z of daten) {
    const wirSindHeim = feld(z, 'HeimVereinNr') === eigenerVerein
    const wirSindGast = feld(z, 'GastVereinNr') === eigenerVerein
    if (!wirSindHeim && !wirSindGast) {
      uebersprungen++
      continue
    }

    const heimName = feld(z, 'HeimMannschaftName')
    const gastName = feld(z, 'GastMannschaftName')
    const mannschaft = wirSindHeim ? heimName : gastName
    const gegner = wirSindHeim ? gastName : heimName
    if (!mannschaft || !gegner) {
      uebersprungen++
      continue
    }

    const date = ausTermin(feld(z, 'Termin'))
    if (!date) {
      uebersprungen++
      warnungen.push(`Unlesbarer Termin bei ${heimName} – ${gastName}: „${feld(z, 'Termin')}"`)
      continue
    }

    // DIE zentrale Regel dieses Imports. `is_home` steuert in der Anzeige den kompletten
    // Fahrdienst — Kilometer, Treffpunkt, Abfahrt, Fahrerliste. Wer es aus der Heim-Spalte
    // übernimmt, schaltet ihn für Ligen mit Turniertagen genau dann ab, wenn er gebraucht wird:
    // dort ist die eigene Mannschaft nominell Heim, gespielt wird aber im Lokal eines fremden
    // Vereins, teils über hundert Kilometer weit. Maßgeblich ist deshalb das Spiellokal.
    const eigenesLokal = heimlokal.get(mannschaft) ?? ''
    const is_home = eigenesLokal !== '' && feld(z, 'SpiellokalNr') === eigenesLokal
    const heimAnFremdemOrt = wirSindHeim && !is_home
    if (heimAnFremdemOrt) neutraleOrte++

    zeilen.push({
      quelle: quellSchluessel([
        'verband',
        feld(z, 'Saison'),
        feld(z, 'Staffel'),
        feld(z, 'BegegnungNr'),
        heimName,
        gastName,
      ]),
      mannschaft,
      date,
      opponent_club: gegner.slice(0, 80),
      is_home,
      venue: feld(z, 'SpiellokalName').slice(0, 120),
      // Kennt der Export nicht — beides trägt der Kapitän nach.
      opponent_town: '',
      km: 0,
      staffel: feld(z, 'Staffel'),
      heimAnFremdemOrt,
    })
  }

  if (neutraleOrte > 0) {
    warnungen.push(
      `${neutraleOrte} Begegnung(en) führt die Datei als Heimspiel, gespielt wird aber woanders — ` +
        'sie zählen als Auswärtsspiel, damit der Fahrdienst nicht ausfällt.',
    )
  }

  const gesehen = new Set<string>()
  const doppelt = new Set<string>()
  for (const z of zeilen) {
    if (gesehen.has(z.quelle)) doppelt.add(z.quelle)
    gesehen.add(z.quelle)
  }
  if (doppelt.size > 0) {
    warnungen.push(
      `${doppelt.size} Begegnung(en) stehen mehrfach in der Datei — es wird jeweils die letzte übernommen.`,
    )
  }

  return {
    saison: haeufigster(daten.map((z) => feld(z, 'Saison'))),
    mannschaften: [...new Set(zeilen.map((z) => z.mannschaft))].sort((a, b) => a.localeCompare(b, 'de')),
    zeilen,
    uebersprungen,
    warnungen,
  }
}
