import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Die Palette steht an zwei Orten, und das lässt sich nicht auflösen.
 *
 * `index.css` hält die Token für die Anwendung. Die beiden Seiten, die das Backend selbst
 * ausliefert — Einladungsseite und Rechtstexte —, entstehen in `pb_hooks/seiten.js` als
 * Zeichenkette in einer JavaScript-Laufzeit, die kein Stylesheet einlesen kann. Ihre Farben
 * stehen dort als rohe Hex-Werte.
 *
 * Zusammenlegen ginge nur über einen Bauschritt, den dieses Projekt sonst nicht hat. Was bleibt,
 * ist die zweitbeste Lösung: Nicht verhindern, dass die beiden auseinanderlaufen, sondern es
 * merken. Wer `--papier` ändert und die Einladungsseite vergisst, fällt hier auf — und nicht
 * erst dem Menschen auf, der den Link antippt und eine Seite in einem anderen Weiß bekommt.
 *
 * Warum die Datei neben `vite.config.ts` liegt und nicht bei den anderen Prüfungen in `src/`:
 * Sie liest Dateien, braucht also `node:fs`. `tsconfig.app.json` kennt bewusst keine
 * Node-Typen — Browser-Code soll nicht versehentlich `process` benutzen können. Diese Prüfung
 * gehört deshalb zum Node-Projekt. Sie prüft ohnehin nicht die Anwendung, sondern das Repo.
 */

const lies = (pfad: string) => readFileSync(new URL(pfad, import.meta.url), 'utf8')

/** Alle Farbwerte aus dem `:root`-Block, auf Kleinschreibung und Langform gebracht. */
function palette(css: string): Map<string, string> {
  const wurzel = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')))
  const werte = new Map<string, string>()
  for (const [, name, wert] of wurzel.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    werte.set(name, lang(wert))
  }
  return werte
}

/** `#fff` und `#ffffff` sind dieselbe Farbe; verglichen wird die Langform. */
const lang = (hex: string) =>
  hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase()
    : hex.toLowerCase()

describe('Die Palette der servergerenderten Seiten', () => {
  const token = palette(lies('./src/index.css'))
  const seiten = lies('../pocketbase/pb_hooks/seiten.js')
  const benutzt = [...seiten.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((t) => lang(t[0]))

  it('die Token sind überhaupt gefunden worden', () => {
    // Sonst ginge die Prüfung unten durch, weil sie nichts zu vergleichen hätte.
    expect(token.size).toBeGreaterThanOrEqual(8)
    expect([...token.values()]).toContain('#fbf8f0')
  })

  it('die Seiten benutzen überhaupt Farben', () => {
    expect(benutzt.length).toBeGreaterThan(0)
  })

  it('jede Farbe dort ist eine Farbe aus der Palette', () => {
    const fremd = [...new Set(benutzt)].filter((f) => ![...token.values()].includes(f))
    expect(
      fremd,
      `In pb_hooks/seiten.js stehen Farben, die in app/src/index.css nicht (mehr) vorkommen: ` +
        `${fremd.join(', ')}. Entweder wurde ein Token geändert und die servergerenderten ` +
        `Seiten sind nicht mitgezogen, oder dort ist eine Farbe erfunden worden.`,
    ).toEqual([])
  })
})
