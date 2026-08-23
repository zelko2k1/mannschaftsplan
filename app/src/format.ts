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
