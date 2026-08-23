/// <reference path="../pb_data/types.d.ts" />
// R7 · Rate Limits. Wie utils.js ohne `.pb.js`-Endung und innerhalb der Handler geholt.
//
// Der Umsetzungsplan sah das ursprünglich primär in Caddy vor. Das braucht dort aber ein
// Zusatz-Plugin (`caddy-ratelimit`), das in keinem Standard-Image steckt — und im
// Entwicklungsbetrieb steht überhaupt kein Caddy davor. Deshalb liegen die Zähler hier: sie
// greifen überall, auch lokal und im Homelab, und hängen an keinem Plugin.
//
// Der Zustand liegt in app.store(), einem prozessweiten Speicher. Das heißt zweierlei:
// nach einem Neustart sind alle Zähler weg (verschmerzbar), und der Speicher muss begrenzt
// bleiben — sonst legt jemand mit vielen IP-Adressen den Prozess lahm. Darum das Aufräumen.

const MAX_EINTRAEGE = 5000

module.exports = {
  /**
   * Festes Zeitfenster. Beim Überschreiten optional eine Sperre, die länger dauert als das
   * Fenster selbst (für den Login: 5 Versuche pro Minute, danach 15 Minuten Pause).
   *
   * @returns { ok: true } oder { ok: false, wartenSekunden }
   */
  pruefen(app, schluessel, maxAnfragen, fensterSekunden, sperreSekunden) {
    const speicher = app.store()
    const jetzt = Date.now()
    const key = `rl:${schluessel}`

    let eintrag = null
    try {
      const gelesen = speicher.get(key)
      if (gelesen && typeof gelesen === 'object') eintrag = gelesen
    } catch {
      eintrag = null
    }

    // Eine laufende Sperre gilt, egal wie das Fenster gerade steht.
    if (eintrag && eintrag.gesperrtBis > jetzt) {
      return { ok: false, wartenSekunden: Math.ceil((eintrag.gesperrtBis - jetzt) / 1000) }
    }

    if (!eintrag || jetzt - eintrag.start >= fensterSekunden * 1000) {
      eintrag = { start: jetzt, zaehler: 0, gesperrtBis: 0 }
    }
    eintrag.zaehler += 1
    // Grenze und Fenster mitschreiben, damit istGesperrt() ohne die Aufrufparameter auskommt.
    eintrag.max = maxAnfragen
    eintrag.fenster = fensterSekunden * 1000

    if (eintrag.zaehler > maxAnfragen) {
      if (sperreSekunden) eintrag.gesperrtBis = jetzt + sperreSekunden * 1000
      speicher.set(key, eintrag)
      return {
        ok: false,
        wartenSekunden:
          sperreSekunden || Math.ceil((eintrag.start + fensterSekunden * 1000 - jetzt) / 1000),
      }
    }

    speicher.set(key, eintrag)
    this.aufraeumen(speicher, jetzt)
    return { ok: true }
  },

  /**
   * Nur nachsehen, ob gerade eine Sperre läuft — ohne den Zähler hochzuzählen.
   *
   * Gebraucht überall dort, wo FEHLVERSUCHE begrenzt werden sollen und nicht Anfragen: erst
   * prüfen, ob gesperrt, dann die eigentliche Arbeit, und nur bei Misserfolg zählen.
   */
  istGesperrt(app, schluessel) {
    try {
      const eintrag = app.store().get(`rl:${schluessel}`)
      if (eintrag && eintrag.gesperrtBis > Date.now()) {
        return { gesperrt: true, wartenSekunden: Math.ceil((eintrag.gesperrtBis - Date.now()) / 1000) }
      }
      if (eintrag && eintrag.zaehler > eintrag.max && Date.now() - eintrag.start < eintrag.fenster) {
        return {
          gesperrt: true,
          wartenSekunden: Math.ceil((eintrag.start + eintrag.fenster - Date.now()) / 1000),
        }
      }
    } catch {
      /* nichts gespeichert */
    }
    return { gesperrt: false }
  },

  /** Erfolgreicher Versuch: Zähler zurücksetzen, damit ein Tippfehler nicht nachwirkt. */
  zuruecksetzen(app, schluessel) {
    try {
      app.store().remove(`rl:${schluessel}`)
    } catch {
      /* war nicht da */
    }
  },

  /**
   * Abgelaufene Einträge wegwerfen, sobald der Speicher groß wird. Ohne das würde jede je
   * gesehene IP-Adresse für immer liegen bleiben.
   */
  aufraeumen(speicher, jetzt) {
    try {
      if (speicher.length() < MAX_EINTRAEGE) return
      const alle = speicher.getAll()
      for (const key in alle) {
        if (key.indexOf('rl:') !== 0) continue
        const e = alle[key]
        // Eine Stunde ohne Aktivität und ohne laufende Sperre: weg damit.
        if (!e || (jetzt - e.start > 3600000 && (e.gesperrtBis || 0) < jetzt)) {
          speicher.remove(key)
        }
      }
    } catch {
      /* Aufräumen ist Kür — ein Fehler hier darf die Anfrage nicht kippen */
    }
  },
}
