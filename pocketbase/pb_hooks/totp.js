/// <reference path="../pb_data/types.d.ts" />
// Zeitbasierte Einmalcodes (TOTP, RFC 6238) für den Kapitäns-Login — Abschnitt 9.
//
// WARUM HIER SELBST GERECHNET WIRD, wo `admin.pb.js` sonst jede eigene Kryptografie ablehnt:
//
// PocketBases eingebautes MFA verschickt Einmalcodes per E-Mail. Diese App hat bewusst keinen
// Mailserver — die Einladungen laufen über den Messenger. Bliebe `$security`, und das bietet
// `hs256`/`hs512`, aber kein SHA1. TOTP nach RFC 6238 rechnet im Normalfall mit HMAC-SHA1, und
// zwar nicht aus Nostalgie: Google Authenticator ignoriert den `algorithm`-Parameter und rechnet
// immer SHA1. Ein SHA256-Code wäre dort schlicht falsch.
//
// Deshalb steht SHA1 unten ausgeschrieben. Das ist eine andere Sorte selbstgebaute Kryptografie
// als etwa eine Signaturprüfung: ein reiner Hash ohne Schlüssel, ohne Zufall, ohne Zustand, mit
// veröffentlichten Testvektoren. Er wird in `scripts/api-tests.mjs` gegen die Vektoren aus
// RFC 3174, RFC 2202 und RFC 6238 nachgerechnet — schlägt einer davon fehl, fällt der Testlauf.
//
// SHA1 gilt für Signaturen als gebrochen. Für HMAC ist es das nicht, und HMAC-SHA1 ist genau
// das, was RFC 6238 vorsieht.

/** SHA1 nach RFC 3174. Nimmt Bytes, gibt 20 Bytes. */
function sha1(bytes) {
  const ml = bytes.length * 8
  // Anhängen: 0x80, dann Nullen bis 56 mod 64, dann die Länge als 64-Bit-Big-Endian.
  const mit = []
  for (let i = 0; i < bytes.length; i++) mit.push(bytes[i] & 0xff)
  mit.push(0x80)
  while (mit.length % 64 !== 56) mit.push(0)
  // Längen über 2^32 Bit kommen hier nie vor (wir hashen höchstens 64 Byte).
  mit.push(0, 0, 0, 0)
  mit.push((ml >>> 24) & 0xff, (ml >>> 16) & 0xff, (ml >>> 8) & 0xff, ml & 0xff)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const w = new Array(80)
  const dreh = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0

  for (let block = 0; block < mit.length; block += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] =
        ((mit[block + i * 4] << 24) |
          (mit[block + i * 4 + 1] << 16) |
          (mit[block + i * 4 + 2] << 8) |
          mit[block + i * 4 + 3]) >>>
        0
    }
    for (let i = 16; i < 80; i++) {
      w[i] = dreh((w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) >>> 0, 1)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let i = 0; i < 80; i++) {
      let f
      let k
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (dreh(a, 5) + (f >>> 0) + e + k + w[i]) >>> 0
      e = d
      d = c
      c = dreh(b, 30)
      b = a
      a = temp
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  const aus = []
  for (const h of [h0, h1, h2, h3, h4]) {
    aus.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff)
  }
  return aus
}

/** HMAC-SHA1 nach RFC 2104. Schlüssel und Nachricht als Byte-Arrays. */
function hmacSha1(schluessel, nachricht) {
  const BLOCK = 64
  let k = schluessel.slice(0)
  if (k.length > BLOCK) k = sha1(k)
  while (k.length < BLOCK) k.push(0)

  const innen = []
  const aussen = []
  for (let i = 0; i < BLOCK; i++) {
    innen.push(k[i] ^ 0x36)
    aussen.push(k[i] ^ 0x5c)
  }
  return sha1(aussen.concat(sha1(innen.concat(nachricht))))
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

module.exports = {
  sha1,
  hmacSha1,

  /** Bytes → Base32 ohne Auffüllzeichen. So erwarten es die Authenticator-Apps. */
  base32Kodieren(bytes) {
    let bits = 0
    let wert = 0
    let aus = ''
    for (const b of bytes) {
      wert = (wert << 8) | (b & 0xff)
      bits += 8
      while (bits >= 5) {
        aus += BASE32[(wert >>> (bits - 5)) & 31]
        bits -= 5
      }
    }
    if (bits > 0) aus += BASE32[(wert << (5 - bits)) & 31]
    return aus
  },

  /** Base32 → Bytes. Leerzeichen und Kleinschreibung werden verziehen. */
  base32Dekodieren(text) {
    const sauber = String(text)
      .toUpperCase()
      .replace(/[^A-Z2-7]/g, '')
    let bits = 0
    let wert = 0
    const aus = []
    for (const zeichen of sauber) {
      const index = BASE32.indexOf(zeichen)
      if (index < 0) continue
      wert = (wert << 5) | index
      bits += 5
      if (bits >= 8) {
        aus.push((wert >>> (bits - 8)) & 0xff)
        bits -= 8
      }
    }
    return aus
  },

  /**
   * Ein neues Geheimnis: 32 Base32-Zeichen zu je 5 Bit, also die 160 Bit beziehungsweise
   * 20 Byte, die RFC 4226 für HMAC-SHA1 empfiehlt.
   *
   * Direkt über das Zielalphabet gezogen, nicht über Bytes: Ein Umweg über `randomString`
   * lieferte Zeichen aus einem 62er-Alphabet und damit nur rund 119 Bit — richtig gerechnet
   * wäre das immer noch genug, aber es sähe nach 160 aus und wäre keine.
   */
  neuesGeheimnis() {
    return $security.randomStringWithAlphabet(32, BASE32)
  },

  /**
   * Der Code für einen Zeitschritt. `schritt` ist Unixzeit / 30, wie in RFC 6238.
   * Sechs Stellen, führende Nullen bleiben erhalten.
   */
  codeFuer(geheimnisBase32, schritt) {
    const schluessel = this.base32Dekodieren(geheimnisBase32)

    // Der Zähler als 8 Byte Big-Endian. Über 2^32 Schritte kommen wir erst in 4000 Jahren.
    const zaehler = [0, 0, 0, 0, 0, 0, 0, 0]
    let rest = schritt
    for (let i = 7; i >= 4; i--) {
      zaehler[i] = rest & 0xff
      rest = Math.floor(rest / 256)
    }

    const hash = hmacSha1(schluessel, zaehler)
    const versatz = hash[19] & 0x0f
    const zahl =
      (((hash[versatz] & 0x7f) << 24) |
        ((hash[versatz + 1] & 0xff) << 16) |
        ((hash[versatz + 2] & 0xff) << 8) |
        (hash[versatz + 3] & 0xff)) >>>
      0

    const sechs = String(zahl % 1000000)
    return '000000'.slice(sechs.length) + sechs
  },

  /**
   * Prüft einen eingetippten Code gegen das Geheimnis.
   *
   * Ein Schritt Toleranz nach vorn und hinten (±30 Sekunden): Handuhren gehen nach, und wer
   * den Code am Ende seines Fensters abtippt, soll nicht scheitern. Mehr Toleranz vergrößert
   * nur das Zeitfenster für einen abgefangenen Code.
   *
   * `zuletzt` ist der zuletzt erfolgreich benutzte Schritt. Ein Code gilt genau einmal — sonst
   * könnte jemand, der beim Eintippen zusieht, ihn innerhalb derselben halben Minute nachnutzen.
   *
   * @returns der benutzte Schritt, oder 0 wenn der Code nicht stimmt
   */
  pruefen(geheimnisBase32, eingabe, jetztSekunden, zuletzt) {
    const code = String(eingabe || '').replace(/\D/g, '')
    if (code.length !== 6) return 0

    const schritt = Math.floor(jetztSekunden / 30)
    for (const versatz of [0, -1, 1]) {
      const kandidat = schritt + versatz
      if (zuletzt && kandidat <= zuletzt) continue
      // Zeichenweise gleich lang vergleichen — der Zeitunterschied verrät hier zwar wenig,
      // aber $security.equal kostet nichts.
      if ($security.equal(this.codeFuer(geheimnisBase32, kandidat), code)) return kandidat
    }
    return 0
  },

  /** Die Zeile, die eine Authenticator-App als QR-Code oder zum Abtippen erwartet. */
  /**
   * Zehn Wiederherstellungscodes erzeugen. Zurück kommt beides: der Klartext für den Nutzer und
   * die Hashes für die Datenbank. Der Klartext existiert danach nirgends mehr (R1).
   *
   * Form `abcd-efgh`: zwei Gruppen zu vier Zeichen aus einem Alphabet ohne die
   * Verwechslungspaare 0/O und 1/l/I — diese Codes werden abgeschrieben, oft von einem Zettel
   * im Geldbeutel, und meistens in dem Moment, in dem gerade nichts anderes mehr geht.
   */
  wiederherstellungscodes() {
    const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'
    const klartext = []
    for (let i = 0; i < 10; i++) {
      const teil = () => $security.randomStringWithAlphabet(4, ALPHABET)
      klartext.push(`${teil()}-${teil()}`)
    }
    return { klartext, hashes: klartext.map((c) => $security.sha256(c)) }
  },

  /**
   * Die gespeicherten Hashes als Liste. Sie liegen als eine Zeile, durch Leerzeichen getrennt.
   *
   * Warum kein JSON-Feld: PocketBase gibt so eines im JSVM als `types.JSONRaw` zurück, und das
   * ist ein BYTE-Puffer. `Array.isArray()` sagt darauf `true`, und wer sich darauf verlässt,
   * zählt am Ende 671 Wiederherstellungscodes statt zehn. Genau so ist diese Zeile entstanden.
   */
  codesLesen(roh) {
    return String(roh || '')
      .split(/\s+/)
      .filter((x) => x.length > 0)
  },

  /**
   * Einen Wiederherstellungscode einlösen.
   *
   * @param roh die gespeicherte Zeile
   * @param eingabe was der Nutzer getippt hat — Groß-/Kleinschreibung und Leerzeichen egal
   * @returns null wenn er nicht passt, sonst die Zeile OHNE diesen Code (er ist verbraucht)
   */
  codeEinloesen(roh, eingabe) {
    const hashes = this.codesLesen(roh)
    if (hashes.length === 0) return null
    const sauber = String(eingabe || '').trim().toLowerCase().replace(/\s+/g, '')
    if (!/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(sauber)) return null
    const gesucht = $security.sha256(sauber)
    if (hashes.indexOf(gesucht) === -1) return null
    // Bewusst ein String, kein Array: Was hier herauskommt, geht direkt ins Textfeld zurück.
    return hashes.filter((h) => h !== gesucht).join(' ')
  },

  otpauthUri(geheimnisBase32, konto, herausgeber) {
    const e = (s) => encodeURIComponent(String(s))
    return (
      `otpauth://totp/${e(herausgeber)}:${e(konto)}` +
      `?secret=${geheimnisBase32}&issuer=${e(herausgeber)}&algorithm=SHA1&digits=6&period=30`
    )
  },
}
