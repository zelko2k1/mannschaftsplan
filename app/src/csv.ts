// Dekodieren und Zerlegen hochgeladener CSV-Dateien. Bewusst ohne Abhängigkeit — es geht um
// Verbands-Exporte, und die halten sich an wenige, gut bekannte Formen.
//
// Übernommen aus DartsZentrale (`app/src/lib/csv.ts`), wo dieselben Verbands-Exporte seit
// Längerem eingelesen werden. Die Erkennungslogik ist dort an echten Dateien gewachsen; sie hier
// neu zu erfinden hieße, dieselben Fallen ein zweites Mal zu entdecken.

/**
 * Macht aus hochgeladenen Bytes Text.
 *
 * **Der Grund, warum das nicht einfach `new TextDecoder()` ist:** Verbands-Exporte kommen
 * regelmäßig als Windows-1252, nicht als UTF-8 — nachgemessen an einer echten Datei. Als UTF-8
 * gelesen wird aus „Grünau" ein „N<?>rnberg", und weil der Import den Mannschaftsnamen als
 * Schlüssel benutzt, stünde der Schaden anschließend in der Datenbank statt nur auf dem
 * Bildschirm.
 *
 * Strategie: erst UTF-8 versuchen; tauchen Ersetzungszeichen auf, auf Windows-1252 wechseln.
 * Die Unterscheidung ist nötig, weil ein U+FFFD zwei Ursachen haben kann:
 *  (a) Windows-1252-Bytes als UTF-8 fehlgelesen — der Decoder *erzeugt* das Zeichen, und
 *      Umschalten repariert die Umlaute;
 *  (b) die Datei enthält bereits echtes U+FFFD (Bytes `ef bf bd`) — die Information war schon
 *      vor dem Speichern verloren. Hier macht Umschalten es schlimmer: aus jedem <?> würde
 *      „ï¿½".
 * Deshalb nur dann wechseln, wenn mindestens ein Ersetzungszeichen NICHT durch vorhandene
 * `ef bf bd`-Bytes erklärbar ist.
 */
export function dekodiere(puffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(puffer)
  const gesamt = (utf8.match(/�/g) || []).length
  if (gesamt === 0) return utf8

  const bytes = new Uint8Array(puffer)
  let echte = 0
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] === 0xef && bytes[i + 1] === 0xbf && bytes[i + 2] === 0xbd) {
      echte++
      i += 2
    }
  }
  if (echte >= gesamt) return utf8

  try {
    return new TextDecoder('windows-1252').decode(puffer)
  } catch {
    return utf8
  }
}

/** Wie viele unlesbare Zeichen im fertigen Text stehen — für die Warnung in der Vorschau. */
export function unlesbareZeichen(text: string): number {
  return (text.match(/�/g) || []).length
}

/** Das wahrscheinlichste Trennzeichen aus der Kopfzeile — „;" ist üblich, aber nicht sicher. */
export function trennzeichen(kopfzeile: string): string {
  const kandidaten = [';', '\t', ',', '|']
  let bestes = ';'
  let meiste = -1
  for (const k of kandidaten) {
    const anzahl = kopfzeile.split(k).length - 1
    if (anzahl > meiste) {
      meiste = anzahl
      bestes = k
    }
  }
  return bestes
}

/**
 * Zerlegt CSV-Text in Zeilen und Spalten. Versteht `"…"`-Anführungszeichen samt verdoppelter
 * `""` im Feld, CR/LF in jeder Mischung und ein BOM am Anfang. Leere Zeilen fallen weg.
 */
export function zerlegeCsv(text: string, trenner?: string): string[][] {
  const quelle = text.replace(/^\uFEFF/, '')
  const ersteZeile = quelle.split(/\r?\n/).find((z) => z.trim().length > 0) || ''
  const trenn = trenner || trennzeichen(ersteZeile)

  const zeilen: string[][] = []
  let feld = ''
  let zeile: string[] = []
  let inAnfuehrung = false

  const feldAb = () => {
    zeile.push(feld)
    feld = ''
  }
  const zeileAb = () => {
    feldAb()
    zeilen.push(zeile)
    zeile = []
  }

  for (let i = 0; i < quelle.length; i++) {
    const z = quelle[i]
    if (inAnfuehrung) {
      if (z === '"') {
        if (quelle[i + 1] === '"') {
          feld += '"'
          i++
        } else inAnfuehrung = false
      } else feld += z
      continue
    }
    if (z === '"') {
      inAnfuehrung = true
      continue
    }
    if (z === trenn) {
      feldAb()
      continue
    }
    if (z === '\r') continue
    if (z === '\n') {
      zeileAb()
      continue
    }
    feld += z
  }
  if (feld.length > 0 || zeile.length > 0) zeileAb()

  return zeilen.filter((z) => z.some((feld) => feld.trim().length > 0))
}
