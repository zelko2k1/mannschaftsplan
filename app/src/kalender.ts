// Den Spielplan als Kalenderdatei — iCalendar nach RFC 5545.
//
// WARUM EINE DATEI UND KEIN ABO: Ein Abo (`webcal:`) würde eine Verlegung von selbst nachziehen,
// bräuchte dafür aber eine Adresse, die den Spieler erkennt — also sein persönliches Token in
// einer URL, die dauerhaft in seinem Kalenderkonto steht und bei Apple oder Google über deren
// Server geht. Das ist genau, was R1 und R14 verhindern sollen. Eine Datei kostet dafür, dass
// sie eine Momentaufnahme ist.
//
// Der Preis wird gemildert, nicht verschwiegen: Jeder Termin trägt eine **feste Kennung** (die
// ID des Spieltags). Wer die Datei nach einer Verlegung erneut einliest, aktualisiert damit
// seine Termine, statt sie zu verdoppeln — genau dafür ist `UID` in RFC 5545 da.
//
// Erzeugt wird hier im Browser, aus den Daten, die der Aushang ohnehin schon hat. Kein
// Endpunkt, keine zweite Wahrheit über den Spielplan.

import type { Spieltag } from './api'
import { ausISO, uhrzeit } from './format'

/** Wie lange ein Spieltag im Kalender steht. Ein Ligaabend ist ungefähr so lang. */
const DAUER_STUNDEN = 3

/**
 * Was in einem iCalendar-Wert nicht roh stehen darf — RFC 5545, 3.3.11.
 *
 * Der Backslash zuerst, sonst verdoppelt der eigene Ersatz die Maskierung der folgenden Zeichen.
 * Das Komma trifft hier wirklich zu: Anschriften haben eines.
 */
function maskieren(wert: string): string {
  return String(wert)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Zeilen über 75 Oktett müssen umgebrochen werden, die Fortsetzung beginnt mit einem Leerzeichen
 * (RFC 5545, 3.1). Ohne das verwerfen strenge Kalender die ganze Datei — und eine Anschrift plus
 * Spielort reißt die Grenze schnell.
 *
 * Gezählt werden **Oktett, nicht Zeichen**: „ä" ist in UTF-8 zwei davon, und ein Umbruch mitten
 * in einem Zeichen macht die Datei kaputt. Deshalb Zeichen für Zeichen gemessen.
 */
function falten(zeile: string): string {
  const teile: string[] = []
  let stueck = ''
  let oktett = 0
  for (const zeichen of zeile) {
    const breite = new TextEncoder().encode(zeichen).length
    // 75 für die erste Zeile, 74 für jede Fortsetzung — das führende Leerzeichen zählt mit.
    const grenze = teile.length === 0 ? 75 : 74
    if (oktett + breite > grenze) {
      teile.push(stueck)
      stueck = ''
      oktett = 0
    }
    stueck += zeichen
    oktett += breite
  }
  teile.push(stueck)
  return teile.join('\r\n ')
}

/** „20260912T173000Z" — alles in UTC, der Kalender rechnet selbst in die Ortszeit um. */
function alsZeitpunkt(datum: Date): string {
  const z = (n: number, stellen = 2) => String(n).padStart(stellen, '0')
  return (
    `${z(datum.getUTCFullYear(), 4)}${z(datum.getUTCMonth() + 1)}${z(datum.getUTCDate())}` +
    `T${z(datum.getUTCHours())}${z(datum.getUTCMinutes())}${z(datum.getUTCSeconds())}Z`
  )
}

/**
 * Die Überschrift des Termins: erst wohin, dann gegen wen.
 *
 * „Auswärtsspiel gegen DC Musterstadt" — im Kalender steht die Zeile neben zwanzig anderen
 * Terminen, und das Erste, was zählt, ist: Muss ich irgendwohin fahren? Ohne Vereinsnamen tritt
 * der Ort an seine Stelle, wie in der Zeile des Aushangs; ist auch der leer, bleibt es beim
 * bloßen „Heimspiel" — eine Überschrift mit einem baumelnden „gegen" wäre schlechter.
 */
function ueberschrift(spieltag: Spieltag): string {
  const wohin = spieltag.is_home ? 'Heimspiel' : 'Auswärtsspiel'
  const gegner = spieltag.opponent_club || spieltag.opponent_town
  return gegner ? `${wohin} gegen ${gegner}` : wohin
}

/**
 * Wo es stattfindet. Die Anschrift zuerst: Nur mit ihr kann die Karten-App des Kalenders etwas
 * anfangen. Fehlt sie, bleiben Spielort und Ort — besser als ein leeres Feld.
 */
function ort(spieltag: Spieltag): string {
  if (spieltag.adresse) return spieltag.adresse
  return [spieltag.venue, spieltag.opponent_town].filter(Boolean).join(', ')
}

/**
 * Was unter dem Termin steht. Der Anwurf ist der Beginn des Termins; Abfahrt und Treffpunkt
 * gehören hierher, weil sie erklären, wann man wirklich los muss.
 *
 * Bei Heimspielen gibt es keine Abfahrt, und wer selbst anreist, fährt ohnehin nicht mit — dann
 * steht hier weniger, und das ist richtig so.
 *
 * **Der Hinweis des Kapitäns bleibt draußen.** Er ändert sich, während der Termin im fremden
 * Kalender stehen bleibt, und in ein Freitextfeld kann jemand etwas über eine einzelne Person
 * schreiben. Was in der App steht, muss nicht auch bei Apple oder Google liegen.
 */
function beschreibung(spieltag: Spieltag): string {
  const zeilen: string[] = []
  if (!spieltag.is_home && spieltag.departure) {
    zeilen.push(`Abfahrt ${uhrzeit(spieltag.departure)} Uhr`)
  }
  if (spieltag.meeting_point) zeilen.push(`Treffpunkt: ${spieltag.meeting_point}`)
  // Nur wenn die Anschrift schon im Ortsfeld steht — sonst stünde der Spielort zweimal.
  if (spieltag.adresse && spieltag.venue) zeilen.push(`Spielort: ${spieltag.venue}`)
  return zeilen.join('\n')
}

/**
 * Wie oft dieser Termin schon geändert wurde — RFC 5545, 3.8.7.4.
 *
 * Ein Kalender übernimmt eine erneut eingelesene Fassung nur, wenn sie sich als neuer ausweist.
 * Einen Änderungszähler führt die App nicht, wohl aber den Zeitpunkt der letzten Verlegung — und
 * genau die ist der Fall, für den das Wiedereinlesen gedacht ist. Minuten seit 1970 sind klein
 * genug für eine Ganzzahl und wachsen verlässlich.
 */
function fassung(spieltag: Spieltag): number {
  const verlegt = ausISO(spieltag.verlegt_am)
  return verlegt ? Math.floor(verlegt.getTime() / 60000) : 0
}

/**
 * Der ganze Spielplan als iCalendar-Text.
 *
 * Spieltage ohne brauchbares Datum fallen weg statt die Datei zu vergiften: Ein einziges
 * kaputtes `DTSTART` kann einen Kalender die gesamte Einladung verwerfen lassen.
 */
export function alsIcs(spieltage: Spieltag[], jetzt = new Date()): string {
  const zeilen: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mannschaftsplan//Spieltage//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const spieltag of spieltage) {
    const beginn = ausISO(spieltag.date)
    if (!beginn) continue
    const ende = new Date(beginn.getTime() + DAUER_STUNDEN * 3600000)
    const text = beschreibung(spieltag)
    const wo = ort(spieltag)

    zeilen.push('BEGIN:VEVENT')
    // Die ID des Spieltags, damit ein zweites Einlesen aktualisiert statt zu verdoppeln.
    zeilen.push(`UID:${spieltag.id}@mannschaftsplan`)
    zeilen.push(`DTSTAMP:${alsZeitpunkt(jetzt)}`)
    zeilen.push(`DTSTART:${alsZeitpunkt(beginn)}`)
    zeilen.push(`DTEND:${alsZeitpunkt(ende)}`)
    zeilen.push(`SUMMARY:${maskieren(ueberschrift(spieltag))}`)
    if (wo) zeilen.push(`LOCATION:${maskieren(wo)}`)
    if (text) zeilen.push(`DESCRIPTION:${maskieren(text)}`)
    zeilen.push(`SEQUENCE:${fassung(spieltag)}`)
    zeilen.push('END:VEVENT')
  }

  zeilen.push('END:VCALENDAR')
  // CRLF ist in RFC 5545 vorgeschrieben, nicht bloß üblich.
  return zeilen.map(falten).join('\r\n') + '\r\n'
}
