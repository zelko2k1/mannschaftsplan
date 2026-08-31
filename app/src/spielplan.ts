// Liest den nuLiga-„Vereinsspielplan" (CSV) und macht daraus Spieltage.
//
// Der Export ist bereits auf den eigenen Verein gefiltert und enthält ALLE Mannschaften in
// allen Staffeln — bei einem mittelgroßen Verein gut 128 Begegnungen. Genau deshalb gibt es
// diesen Import: von Hand wären das 128 Formulare.
//
// Reine Funktionen, kein Netz, kein DOM. Was hier herauskommt, ist ein Vorschlag — bestätigt
// wird er in der Verwaltung, geschrieben wird er serverseitig.

import { zerlegeCsv } from './csv'

/** Eine Begegnung der eigenen Mannschaft, fertig für die Vorschau. */
export type ImportZeile = {
  /** Stabiler Schlüssel über Importe hinweg — siehe `quellSchluessel`. */
  quelle: string
  /** Name der eigenen Mannschaft, so wie nuLiga sie schreibt („SV Beispiel III"). */
  mannschaft: string
  /** Anwurf als ISO-Zeitstempel in UTC. */
  date: string
  /** Der Gegner — die Mannschaft, nicht der Verein („TSV Muster", nicht „TSV Muster"). */
  opponent_club: string
  /** Wird bei uns gespielt? Kommt aus dem Spiellokal, NICHT aus der Heim-Spalte (siehe unten). */
  is_home: boolean
  /** Das Spiellokal, wie es im Export steht. */
  venue: string
  /** Die Staffel — nur zur Orientierung in der Vorschau. */
  staffel: string
  /**
   * Wahr, wenn nuLiga uns als Heimmannschaft führt, gespielt aber woanders wird. Das ist kein
   * Fehler, sondern der Normalfall in Ligen mit Turniertagen — die Vorschau weist darauf hin,
   * weil es dem Kapitän sonst wie ein Importfehler vorkommt.
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

/** Was der Import mindestens braucht. Fehlt eine davon, ist es keine Vereinsspielplan-Datei. */
const PFLICHTSPALTEN = [
  'Termin',
  'Saison',
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
 * Der Schlüssel, an dem ein zweiter Import dieselbe Begegnung wiedererkennt.
 *
 * Bewusst OHNE Termin: eine verlegte Begegnung soll aktualisiert und nicht ein zweites Mal
 * angelegt werden. Und bewusst MIT den beiden Mannschaften, weil `BegegnungNr` innerhalb einer
 * Staffel mehrfach vorkommt — an einem Turniertag tragen mehrere Partien dieselbe Nummer.
 * An der echten Datei (128 Zeilen) ist diese Kombination eindeutig.
 */
export function quellSchluessel(
  saison: string,
  staffel: string,
  begegnung: string,
  heim: string,
  gast: string,
): string {
  return ['nuliga', saison, staffel, begegnung, heim, gast].map(sauber).join('|')
}

/**
 * „05.09.2026 12:00" → ISO in UTC.
 *
 * nuLiga schreibt **Ortszeit**, PocketBase speichert **UTC**. Genau an dieser Stelle lagen in
 * PR #7 alle von Hand eingetragenen Anwürfe zwei Stunden daneben; bei einem Import wären es
 * 128 auf einen Schlag. Deshalb wird hier über die lokale Zeitzone des Browsers gerechnet —
 * derselbe Weg, den auch das Eingabefeld nimmt.
 */
export function ausNuligaTermin(termin: string): string | null {
  const treffer = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(sauber(termin))
  if (!treffer) return null
  const [, tt, mm, jjjj, std, min] = treffer
  const datum = new Date(
    Number(jjjj),
    Number(mm) - 1,
    Number(tt),
    Number(std ?? '0'),
    Number(min ?? '0'),
    0,
    0,
  )
  if (isNaN(datum.getTime())) return null
  // Ein Tippfehler im Monat ergäbe sonst klaglos ein Datum im Folgejahr.
  if (datum.getDate() !== Number(tt) || datum.getMonth() !== Number(mm) - 1) return null
  return datum.toISOString()
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

/**
 * Liest den Export. Wirft `SpielplanFehler`, wenn die Datei erkennbar keine ist — alles andere
 * landet als Warnung in der Vorschau, damit ein einzelner Ausreißer nicht den ganzen Import
 * verhindert.
 */
export function leseSpielplan(text: string): Spielplan {
  const roh = zerlegeCsv(text)
  if (roh.length < 2) throw new SpielplanFehler('Die Datei enthält keine Zeilen.')

  const kopf = roh[0].map((s) => sauber(s))
  const spalte = new Map(kopf.map((name, i) => [name.toLowerCase(), i]))
  const fehlend = PFLICHTSPALTEN.filter((p) => !spalte.has(p.toLowerCase()))
  if (fehlend.length > 0) {
    throw new SpielplanFehler(
      `Das sieht nicht nach einem nuLiga-Vereinsspielplan aus — es fehlen die Spalten: ${fehlend.join(', ')}.`,
    )
  }

  const feld = (zeile: string[], name: string) => sauber(zeile[spalte.get(name.toLowerCase())!])
  const daten = roh.slice(1)

  // Der eigene Verein ist der, der in fast jeder Zeile vorkommt — der Export ist auf ihn
  // gefiltert. Über die Vereinsnummer statt über den Namen, weil Vereine sich in nuLiga mal
  // „SV Beispiel" und mal „SV Beispiel 1920 e.V." nennen, je nach Spalte.
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
    const liste = lokaleJeMannschaft.get(m) ?? []
    liste.push(feld(z, 'SpiellokalNr'))
    lokaleJeMannschaft.set(m, liste)
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
    const heimNr = feld(z, 'HeimVereinNr')
    const gastNr = feld(z, 'GastVereinNr')
    const wirSindHeim = heimNr === eigenerVerein
    const wirSindGast = gastNr === eigenerVerein
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

    const date = ausNuligaTermin(feld(z, 'Termin'))
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
    const lokalNr = feld(z, 'SpiellokalNr')
    const is_home = eigenesLokal !== '' && lokalNr === eigenesLokal
    const heimAnFremdemOrt = wirSindHeim && !is_home
    if (heimAnFremdemOrt) neutraleOrte++

    zeilen.push({
      quelle: quellSchluessel(
        feld(z, 'Saison'),
        feld(z, 'Staffel'),
        feld(z, 'BegegnungNr'),
        heimName,
        gastName,
      ),
      mannschaft,
      date,
      opponent_club: gegner.slice(0, 80),
      is_home,
      venue: feld(z, 'SpiellokalName').slice(0, 120),
      staffel: feld(z, 'Staffel'),
      heimAnFremdemOrt,
    })
  }

  if (neutraleOrte > 0) {
    warnungen.push(
      `${neutraleOrte} Begegnung(en) führt nuLiga als Heimspiel, gespielt wird aber woanders — ` +
        'sie zählen als Auswärtsspiel, damit der Fahrdienst nicht ausfällt.',
    )
  }

  const doppelt = new Set<string>()
  const gesehen = new Set<string>()
  for (const z of zeilen) {
    if (gesehen.has(z.quelle)) doppelt.add(z.quelle)
    gesehen.add(z.quelle)
  }
  if (doppelt.size > 0) {
    warnungen.push(
      `${doppelt.size} Begegnung(en) stehen mehrfach in der Datei — es wird jeweils die letzte übernommen.`,
    )
  }

  const mannschaften = [...new Set(zeilen.map((z) => z.mannschaft))].sort((a, b) =>
    a.localeCompare(b, 'de'),
  )

  return {
    saison: haeufigster(daten.map((z) => feld(z, 'Saison'))),
    mannschaften,
    zeilen,
    uebersprungen,
    warnungen,
  }
}
