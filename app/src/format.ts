// Anzeigeformate für den Abfahrtsplan. Bewusst von Hand statt über Intl: „Sa., 29.08." mit dem
// Punkt hinter dem Wochentag passt nicht in eine 96 px schmale Zeitspalte, und die Reihenfolge
// soll sich nicht mit der Browsersprache ändern — der Aushang sieht überall gleich aus.

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/**
 * PocketBase liefert "2026-08-29 17:30:00.000Z" — mit Leerzeichen statt „T". Manche Engines
 * parsen das nicht. Vor jedem Date-Aufruf begradigen. Gibt null bei Unsinn.
 */
export function ausISO(wert: string | null | undefined): Date | null {
  if (!wert) return null
  const glatt = String(wert).trim().replace(' ', 'T')
  const mitZone = /[Zz]|[+-]\d\d:?\d\d$/.test(glatt) ? glatt : `${glatt}Z`
  const datum = new Date(mitZone)
  return isNaN(datum.getTime()) ? null : datum
}

/** „Sa 29.08." — der Wochentag ohne Punkt, damit die Zeile schmal bleibt. */
export function tag(wert: string | null | undefined): string {
  const d = ausISO(wert)
  if (!d) return ''
  const tt = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${WOCHENTAGE[d.getDay()]} ${tt}.${mm}.`
}

/** „17:55" */
export function uhrzeit(wert: string | null | undefined): string {
  const d = ausISO(wert)
  if (!d) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * „in 6 Tagen", „morgen", „heute" — die Angabe, die beim Überfliegen wirklich zählt.
 * Vergangene Spieltage bekommen „vorbei".
 */
export function wannUngefaehr(wert: string | null | undefined, jetzt = new Date()): string {
  const d = ausISO(wert)
  if (!d) return ''
  const heute = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate())
  const ziel = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const tage = Math.round((ziel.getTime() - heute.getTime()) / 86400000)
  if (tage < 0) return 'vorbei'
  if (tage === 0) return 'heute'
  if (tage === 1) return 'morgen'
  if (tage < 7) return `in ${tage} Tagen`
  if (tage < 14) return 'nächste Woche'
  return `in ${Math.round(tage / 7)} Wochen`
}

/** „2 Plätze frei" / „1 Platz frei" / „keine Plätze frei" */
export function plaetze(frei: number): string {
  if (frei <= 0) return 'keine Plätze frei'
  return frei === 1 ? '1 Platz frei' : `${frei} Plätze frei`
}

/**
 * Zahl plus Wort, in der richtigen Zahlform — „1 Fahrt", „3 Fahrten".
 *
 * Das gab es bisher nur als Sonderfall je Stelle (`plaetze`, „1 Gerät / 2 Geräte"), und beim
 * Mannschaftswechsel standen deshalb kurz „1 Rückmeldung(en)" und „1 Fahrt(en)" auf dem
 * Bildschirm. Die Klammerform ist eine Notlösung aus Fehlermeldungen; in der Oberfläche liest
 * sie sich wie ein Formular vom Amt, und der Rest des Produkts macht es überall richtig.
 */
export function anzahl(wieviele: number, eins: string, mehrere: string): string {
  return `${wieviele} ${wieviele === 1 ? eins : mehrere}`
}

/**
 * Die drei Wörter für eine Rückmeldung. Sie stehen hier und nicht im Aushang, weil die
 * Kapitänsansicht dieselben braucht: Wer eine Rückmeldung korrigiert, soll dieselben drei
 * Wörter sehen wie der, dessen Rückmeldung er korrigiert. Zweimal hingeschrieben wären es
 * zwei Wahrheiten, und die Kapitänsansicht liegt in einem eigenen Bündelteil — ein Import
 * aus `Zeile.tsx` zöge den ganzen Aushang mit hinüber.
 */
export const ANTWORTEN: { wert: 'yes' | 'maybe' | 'no'; text: string; klasse: string }[] = [
  { wert: 'yes', text: 'Dabei', klasse: 'knopf--ja' },
  { wert: 'maybe', text: 'Unsicher', klasse: 'knopf--vielleicht' },
  { wert: 'no', text: 'Kann nicht', klasse: 'knopf--nein' },
]

/**
 * Namenslisten alphabetisch — und zwar so, wie hier jemand das Alphabet meint.
 *
 * Der Server sortiert bereits mit `sort,name`, aber SQLite vergleicht Bytes: Kleinbuchstaben
 * stehen hinter dem gesamten Großalphabet und Umlaute noch dahinter. Nachgemessen kam
 * `Anna · Bernd · Zoe · miri · Örs` heraus — und „Müller" landete hinter „Mustermann". Für eine
 * Mannschaftsliste sieht das aus wie gar keine Sortierung.
 *
 * `Intl.Collator('de')` kennt die Regeln: Groß und klein gleichrangig, ä bei a, ö bei o, ß bei
 * ss. Der Vergleich läuft im Browser und braucht dafür nichts nachzuladen.
 *
 * Das Feld `sort` behält den Vortritt, wo es eines gibt — es heißt im Schema „Reihenfolge in
 * Listen" und wäre sonst wirkungslos. Heute steht es überall auf 0, also entscheidet der Name.
 */
const namensfolge = new Intl.Collator('de')
export function nachReihenfolge(
  a: { sort?: number; name: string },
  b: { sort?: number; name: string },
): number {
  return (a.sort ?? 0) - (b.sort ?? 0) || namensfolge.compare(a.name, b.name)
}

/**
 * Der Stempel für einen gespielten Spieltag — „Sieg 6:2", „Niederlage 2:6", „Unentschieden 4:4".
 *
 * Als Hinweis gedacht und nicht als Auswertung: Er steht am einzelnen Spieltag und verschwindet
 * mit ihm. Eine Tabelle, eine Saisonbilanz oder etwas je Spieler gibt es bewusst nicht — dafür
 * gibt es die DartsZentrale.
 *
 * `null`, solange nichts eingetragen ist. `-1` heißt „nicht eingetragen"; die Null taugt dafür
 * nicht, denn ein 0:0 ist ein Ergebnis. Beide Zahlen müssen dastehen: Ein halb ausgefülltes
 * Ergebnis ist keines.
 *
 * Die Wörter stehen hier und nicht im Aushang, weil die Kapitänsansicht dieselben braucht.
 */
export function ergebnis(
  wir: number | undefined,
  gegner: number | undefined,
): { wort: 'Sieg' | 'Niederlage' | 'Unentschieden'; text: string } | null {
  if (typeof wir !== 'number' || typeof gegner !== 'number') return null
  if (wir < 0 || gegner < 0) return null
  const wort = wir > gegner ? 'Sieg' : wir < gegner ? 'Niederlage' : 'Unentschieden'
  return { wort, text: `${wort} ${wir}:${gegner}` }
}

/**
 * Wohin die Karten-Box führt — und warum das drei Fälle sind.
 *
 * Es gibt keine Adresse, die auf jedem Gerät „die Navigations-App" öffnet, und die bequeme Antwort
 * (ein Google-Maps-Link für alle) widerspricht Abschnitt 8: keine Requests an Dritte. Deshalb je
 * Gerät der Weg, der ohne fremden Dienst auskommt oder wenigstens ohne einen zusätzlichen:
 *
 * - **Android und alles, was `geo:` versteht:** `geo:0,0?q=…`. Das Betriebssystem fragt, welche
 *   installierte App übernehmen soll. Es geht KEINE Anfrage ins Netz — die Adresse verlässt das
 *   Gerät erst, wenn die gewählte App sie selbst nachschlägt.
 * - **iPhone und iPad:** Safari kennt `geo:` nicht, ein Tippen liefe ins Leere. Dort führt der Weg
 *   über `maps.apple.com`, das die vorhandene Karten-App öffnet — also über Apple, dessen App auf
 *   dem Gerät ohnehin liegt, und nicht über einen weiteren Anbieter.
 * - **Alles andere (Schreibtisch):** OpenStreetMap. Dort navigiert niemand, dort will jemand
 *   nachsehen, wo das ist — und OSM ist der Kartendienst ohne Werbegeschäft dahinter.
 *
 * Die Erkennung geht über die Gerätekennung, was sonst zu Recht verpönt ist. Hier geht es nicht um
 * Aussehen, sondern darum, WELCHES Adressschema ein Gerät überhaupt versteht — und das lässt sich
 * nicht abfragen, nur wissen.
 */
export function navigationsZiel(adresse: string, kennung = navigator.userAgent): string {
  const ziel = encodeURIComponent(adresse.trim())
  if (/iPhone|iPad|iPod/i.test(kennung)) return `https://maps.apple.com/?q=${ziel}`
  if (/Android/i.test(kennung)) return `geo:0,0?q=${ziel}`
  return `https://www.openstreetmap.org/search?query=${ziel}`
}

// ── Kapitänsansicht ─────────────────────────────────────────────────────────────────────────
// Dort gilt das Gegenteil der Regel oben: der Aushang soll überall gleich aussehen, die
// Verwaltung dagegen so, wie der Rechner des Kapitäns Datum und Uhrzeit schreibt. Reihenfolge,
// Trenner und 12-/24-Stunden-Zählung kommen deshalb aus den Systemeinstellungen (`undefined`
// als Sprache = die des Browsers), die Zeitzone ebenfalls.

/** „29. Aug. 2026, 19:30" — oder was das System daraus macht. */
export function systemDatumZeit(wert: string | null | undefined): string {
  const d = ausISO(wert)
  if (!d) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

/**
 * Ein Zeitpunkt, der von außerhalb der Datenbank kommt — heute: der Änderungszeitpunkt einer
 * Sicherungsdatei.
 *
 * Der geht nicht durch PocketBases Datumstyp, sondern durch das Dateisystem, und kommt deshalb in
 * der Schreibweise der Go-Laufzeit an: `2026-09-01 08:12:33.123456 +0000 UTC`. Daran scheitert
 * `ausISO` — die Zeitzone am Ende ist kein ISO-Kürzel. Statt auf eine Schreibweise zu wetten, die
 * niemand hier festlegt, wird zuerst der ISO-Weg versucht und danach der gemeinsame Anfang beider
 * Formen gelesen; was auf beides nicht passt, gilt als unbekannt und wird nicht angezeigt.
 */
export function ausZeitangabe(wert: string | null | undefined): Date | null {
  const ueberIso = ausISO(wert)
  if (ueberIso) return ueberIso
  const teile = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(wert || '').trim())
  if (!teile) return null
  const [, jahr, monat, tag, stunde, minute, sekunde] = teile
  return new Date(
    Date.UTC(+jahr, +monat - 1, +tag, +stunde, +minute, +sekunde),
  )
}

/**
 * „heute", „gestern", „vor 5 Tagen" — wie alt etwas ist.
 *
 * Das Gegenstück zu `wannUngefaehr`, das nach vorn schaut. Getrennt, weil die Wörter andere sind:
 * Eine Sicherung ist nicht „in 3 Wochen", sie ist „vor 3 Wochen". Leer bei unbekanntem Datum —
 * eine erfundene Angabe wäre schlimmer als keine.
 */
export function seit(wert: string | null | undefined, jetzt = new Date()): string {
  const d = ausZeitangabe(wert)
  if (!d) return ''
  const heute = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate())
  const damals = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const tage = Math.round((heute.getTime() - damals.getTime()) / 86400000)
  if (tage <= 0) return 'heute'
  if (tage === 1) return 'gestern'
  if (tage < 7) return `vor ${tage} Tagen`
  if (tage < 28) return `vor ${Math.round(tage / 7)} Wochen`
  return `vor ${Math.round(tage / 30)} Monaten`
}

/**
 * Ab wann eine Sicherung alt ist. Kein Naturgesetz, sondern eine Ansage: Ein Verein, der einmal im
 * Monat sichert, verliert im schlimmsten Fall einen Monat Rückmeldungen — das ist die Grenze, ab
 * der die Anzeige etwas sagt, statt nur ein Datum hinzuschreiben.
 */
export const SICHERUNG_ALT_TAGE = 30

/** Wie viele Tage her — für die Entscheidung, ob gewarnt wird. Unbekannt: null. */
export function tageSeit(wert: string | null | undefined, jetzt = new Date()): number | null {
  const d = ausZeitangabe(wert)
  if (!d) return null
  return Math.floor((jetzt.getTime() - d.getTime()) / 86400000)
}

/** Nur der Tag — für Angaben, bei denen die Uhrzeit nichts beiträgt („Link seit …"). */
export function systemDatum(wert: string | null | undefined): string {
  // Über `ausZeitangabe`, nicht über `ausISO`: Dieselbe Funktion zeigt Datenbankdaten („Link
  // seit …") und den Änderungszeitpunkt einer Sicherungsdatei, und der kommt aus dem Dateisystem
  // in einer anderen Schreibweise. Für alles Bisherige ändert sich nichts — der ISO-Weg wird
  // zuerst versucht.
  const d = ausZeitangabe(wert)
  if (!d) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d)
}

/**
 * PocketBase speichert UTC, `<input type="datetime-local">` erwartet Ortszeit ohne Zone.
 * Ohne diese Umrechnung stünde im Formular die UTC-Zeit — im Sommer zwei Stunden zu früh.
 */
export function fuerEingabe(wert: string | null | undefined): string {
  const d = ausISO(wert)
  if (!d) return ''
  const zwei = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}` +
    `T${zwei(d.getHours())}:${zwei(d.getMinutes())}`
  )
}

/**
 * Der Rückweg: „2026-08-29T19:30" aus dem Feld ist ORTSZEIT — als „2026-08-29 19:30:00"
 * weitergereicht liest PocketBase daraus UTC und der Anwurf wandert. Also hier umrechnen.
 */
export function ausEingabe(wert: string | null | undefined): string {
  if (!wert) return ''
  const d = new Date(String(wert)) // ohne Zonenangabe: Ortszeit, so will es die Spezifikation
  return isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ').slice(0, 19)
}
