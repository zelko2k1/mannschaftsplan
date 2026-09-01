import { useId, useState } from 'react'
import type { Board, Fahrt, Spieltag, Status } from './api'
import { ANTWORTEN, plaetze as plaetzeText, tag, uhrzeit, wannUngefaehr } from './format'
import { Fehler } from './Meldung'
import { Nachfragekasten, type Nachfrage } from './Nachfrage'

type Props = {
  spieltag: Spieltag
  board: Board
  offen: boolean
  fehler?: string
  /** Was zuletzt gespeichert wurde. Steht neben den Knöpfen und wird angesagt. */
  gemeldet?: string
  laeuft: boolean
  aufklappen: () => void
  setzeAntwort: (status: Status | null) => void
  setzeFahrt: (faehrt: boolean, plaetze?: number) => void
  setzeMitfahrt: (fahrt: string | null) => void
}

/** Belegung als Kästchen statt als Zahl — auf einen Blick lesbar. */
function Balken({ voll, gesamt }: { voll: number; gesamt: number }) {
  const felder = Array.from({ length: Math.max(gesamt, 0) }, (_, i) => i < voll)
  return (
    <span className="belegung" aria-hidden="true">
      {felder.map((belegt, i) => (
        <span key={i} className={`belegung__feld${belegt ? ' belegung__feld--voll' : ''}`} />
      ))}
    </span>
  )
}

export default function Zeile({
  spieltag,
  board,
  offen,
  fehler,
  gemeldet,
  laeuft,
  aufklappen,
  setzeAntwort,
  setzeFahrt,
  setzeMitfahrt,
}: Props) {
  const bereichId = useId()
  const [frage, setFrage] = useState<Nachfrage | null>(null)
  /**
   * Die Rückfrage vor einer Absage — eigener Zustand, weil sie an einer anderen Stelle steht als
   * die beim Zurückziehen des Autos: unter den Rückmeldeknöpfen, wo gerade getippt wurde.
   */
  const [absageFrage, setAbsageFrage] = useState<Nachfrage | null>(null)
  const name = (id: string) => board.members.find((m) => m.id === id)?.name ?? '—'

  /** Wer in einem bestimmten Auto sitzt — der Fahrer will das wissen, nicht nur die Anzahl. */
  const mitfahrer = (fahrtId: string) =>
    Object.entries(spieltag.seat_claims)
      .filter(([, wo]) => wo === fahrtId)
      .map(([wer]) => name(wer))

  const meineAntwort = spieltag.responses[board.me] ?? null
  const meineFahrt = spieltag.rides.find((f) => f.member === board.me) ?? null
  const meinPlatz = spieltag.seat_claims[board.me] ?? null

  const zugesagt = Object.values(spieltag.responses).filter((s) => s === 'yes').length
  const vollzaehlig = zugesagt >= spieltag.needed_players
  /**
   * Ein Auto, dessen Fahrer abgesagt hat, ist keines.
   *
   * Seit `absageAufraeumen` räumt eine Absage die Fahrt gleich mit weg — die Anzeige rechnet
   * trotzdem nicht mit solchen Sätzen: Aus der Zeit davor können welche dastehen, und was der
   * Server einmal übersehen hat, soll die Zeile nicht als freie Plätze weitererzählen.
   */
  const abgesagt = (f: Fahrt) => spieltag.responses[f.member] === 'no'
  const fahrten = spieltag.rides.filter((f) => !abgesagt(f))
  const freiGesamt = fahrten.reduce((summe, f) => summe + (f.seats - f.taken), 0)

  /**
   * Wie viele Zusagen am Ende ohne Mitfahrgelegenheit dastehen.
   *
   * Die Zeile sagte bisher, wie viele Plätze frei sind — nicht, ob sie reichen. Acht Zusagen und
   * ein Auto mit drei belegten Plätzen lasen sich als „8/8 zugesagt · keine Plätze frei", und
   * vier Leute standen am Samstag vor der Kneipe, ohne dass es jemandem gesagt worden wäre.
   * Gezählt wird, wer zugesagt hat und weder selbst fährt noch einen Platz beansprucht; davon
   * finden die freien Plätze noch unter.
   */
  const brauchtPlatz = Object.entries(spieltag.responses).filter(
    ([wer, status]) =>
      status === 'yes' &&
      !spieltag.rides.some((f) => f.member === wer) &&
      !spieltag.seat_claims[wer],
  ).length
  const ohnePlatz = spieltag.is_home ? 0 : Math.max(0, brauchtPlatz - freiGesamt)
  const vorbei = wannUngefaehr(spieltag.date) === 'vorbei'

  // Bei Heimspielen gibt es keine Abfahrt — die Zeitspalte zeigt dann den Anwurf (6.3).
  const zeitpunkt = spieltag.is_home ? spieltag.date : (spieltag.departure ?? spieltag.date)
  const zeitLabel = spieltag.is_home || !spieltag.departure ? 'Anwurf' : 'Abfahrt'

  // Steht in der Spalte die Abfahrt, fehlte der Anwurf bisher in der ganzen Zeile — dabei ist
  // das die zweite Uhrzeit, die zu einem Auswärtsspiel gehört: wann müssen wir dort sein. Sie
  // stand nur im Datum des Spieltags, das die Zeile als Tag ausgibt, nicht als Uhrzeit. Wo kein
  // Abfahrtszeitpunkt eingetragen ist, zeigt die Spalte ohnehin schon den Anwurf.
  const anwurfDazu = !spieltag.is_home && !!spieltag.departure

  // Rot ist für die Dinge da, die jemanden zum Handeln bringen sollen (6.2).
  const ohneFahrer = !spieltag.is_home && fahrten.length === 0
  const ohneAntwort = meineAntwort === null

  const klassen = [
    'zeile',
    spieltag.is_home ? 'zeile--heim' : 'zeile--auswaerts',
    vorbei ? 'zeile--vorbei' : '',
    spieltag.locked ? 'zeile--abgeschlossen' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={klassen}>
      {/* Der aufklappende Knopf steckt in einer Überschrift — das ist das übliche Muster für
          ein Akkordeon und der Grund, warum es sich mit einer Bildschirmleseanwendung bedienen
          lässt: Sie springt von Spieltag zu Spieltag, statt sich durch jede Zeile zu lesen.
          Die Überschrift bringt keine eigene Auszeichnung mit, die Zeile sieht aus wie zuvor. */}
      <h2 className="zeile__titel">
      <button
        type="button"
        className="zeile__knopf"
        aria-expanded={offen}
        aria-controls={bereichId}
        onClick={aufklappen}
      >
        <span className="zeile__zeit">
          <span className="zeile__uhr">{uhrzeit(zeitpunkt)}</span>
          <span className="zeile__label">{zeitLabel.toUpperCase()}</span>
          {anwurfDazu && <span className="zeile__anwurf">Anwurf {uhrzeit(spieltag.date)}</span>}
        </span>

        <span className="zeile__inhalt">
          <span className="zeile__oben">
            <span>
              {tag(spieltag.date)} · {wannUngefaehr(spieltag.date)}
            </span>
            {/* Heim und Auswärts stehen im Text, nicht nur in der Papierfarbe. Rot bekommt
                nur die Entfernung — „Heim" ist keine Warnung. */}
            <span className={`zeile__km${spieltag.is_home ? '' : ' zeile__km--weit'}`}>
              {spieltag.is_home ? 'Heim' : `${spieltag.km} km`}
            </span>
          </span>

          {/* Groß steht der Gegner — danach wird gesucht. Ohne Vereinsnamen tritt der Ort
              an die Stelle, damit die Zeile nie ohne Kopf dasteht. */}
          <span className="zeile__ziel">{spieltag.opponent_club || spieltag.opponent_town}</span>

          <span className="zeile__ort">
            {[
              spieltag.opponent_club ? spieltag.opponent_town : '',
              spieltag.venue,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          </span>

          <span className="zeile__stand">
            {/* Vor dem Zählstand, nicht dahinter: Wenn nichts mehr zu ändern ist, ist das die
                erste Information, die zählt. */}
            {spieltag.locked && (
              <>
                <span className="zeile__geschlossen">abgeschlossen</span>
                {' · '}
              </>
            )}
            {zugesagt}/{spieltag.needed_players} zugesagt
            {!spieltag.is_home && (
              <>
                {' · '}
                <span className={ohneFahrer ? 'zeile__warnung' : undefined}>
                  {ohneFahrer ? 'kein Fahrer' : plaetzeText(freiGesamt)}
                </span>
                {/* Nur wenn überhaupt jemand fährt: Steht dort schon „kein Fahrer", ist das der
                    schärfere Satz, und beides nebeneinander sagte zweimal dasselbe. */}
                {!ohneFahrer && ohnePlatz > 0 && (
                  <>
                    {' · '}
                    <span className="zeile__warnung">{ohnePlatz} ohne Platz</span>
                  </>
                )}
              </>
            )}
            {/* Dieselbe Stelle, zwei Zustände. Die Zeile sagte, wie viele zugesagt haben, wie
                viele Plätze frei sind und ob ein Fahrer fehlt — nur nicht, was man selbst
                geantwortet hat. Sobald geantwortet war, verschwand „du fehlst noch" und nichts
                trat an seine Stelle; wer nachsehen wollte, musste aufklappen. Grundsatz 2
                verlangt genau das nicht, und es ist die Angabe, die der Betrachter garantiert
                sucht.

                Die Wörter kommen aus derselben Liste wie die Knöpfe, kleingeschrieben, weil sie
                hier in einer laufenden Zeile stehen statt auf einem Knopf. */}
            {ohneAntwort
              ? !vorbei &&
                !spieltag.locked && (
                  <>
                    {' · '}
                    <span className="zeile__warnung">du fehlst noch</span>
                  </>
                )
              : (
                  <>
                    {' · '}
                    <span className="zeile__ich">
                      du: {ANTWORTEN.find((a) => a.wert === meineAntwort)?.text.toLowerCase()}
                    </span>
                  </>
                )}
          </span>

          {vollzaehlig && <span className="stempel">Komplett</span>}
        </span>
      </button>
      </h2>

      <div id={bereichId} hidden={!offen}>
        {offen && (
          <div className="detail">
            {/* Der Treffpunkt stand bislang nur in der Kapitänsansicht: Er wurde eingegeben, vom
                Board mitgeliefert — und hier fallengelassen. Wer gemeinsam losfährt, muss wissen,
                wohin. Bei Heimspielen fährt niemand los, dort bleibt die Zeile weg. */}
            {!spieltag.is_home && (
              <p className="detail__treffpunkt">
                {spieltag.departure && (
                  <>
                    Abfahrt <strong>{uhrzeit(spieltag.departure)}</strong>
                    {' · '}
                  </>
                )}
                Anwurf <strong>{uhrzeit(spieltag.date)}</strong>
                {spieltag.meeting_point && <> · Treffpunkt: {spieltag.meeting_point}</>}
              </p>
            )}
            {spieltag.locked ? (
              <p className="gesperrt">
                Dieser Spieltag ist abgeschlossen. Änderungen sind nicht mehr möglich.
              </p>
            ) : (
              <>
                <h3 className="detail__titel">Deine Rückmeldung</h3>
                <div className="knopfreihe">
                  {ANTWORTEN.map(({ wert, text, klasse }) => (
                    <button
                      key={wert}
                      type="button"
                      className={`knopf ${klasse}`}
                      aria-pressed={meineAntwort === wert}
                      disabled={laeuft}
                      onClick={() => {
                        // Nochmal auf dieselbe Antwort tippen nimmt sie zurück.
                        const naechste = meineAntwort === wert ? null : wert
                        // Eine Absage zieht das eigene Auto mit ab (der Server räumt es weg).
                        // Sitzen Leute drin, ist das die Nachricht und nicht die Nebenwirkung:
                        // Sie stehen danach ohne Mitfahrgelegenheit da. Ein leeres Auto betrifft
                        // niemanden und fragt nichts — dieselbe Grenze wie beim Zurückziehen.
                        const drin = meineFahrt ? mitfahrer(meineFahrt.id) : []
                        if (naechste === 'no' && drin.length > 0) {
                          setAbsageFrage({
                            id: spieltag.id,
                            titel: 'Absagen und Auto zurückziehen',
                            text: `${drin.join(' und ')} ${
                              drin.length === 1 ? 'sitzt' : 'sitzen'
                            } bei dir. Sagst du ab, fährt dein Auto nicht mehr — ${
                              drin.length === 1 ? 'er oder sie muss' : 'sie müssen'
                            } sich neu einteilen.`,
                            knopf: 'Absagen',
                            tun: () => {
                              setAbsageFrage(null)
                              setzeAntwort('no')
                            },
                          })
                          return
                        }
                        setzeAntwort(naechste)
                      }}
                    >
                      {text}
                    </button>
                  ))}
                </div>

                <Nachfragekasten
                  frage={absageFrage}
                  abbrechen={() => setAbsageFrage(null)}
                  laeuft={laeuft}
                />

                {!spieltag.is_home && (
                  <>
                    <h3 className="detail__titel">Fahrdienst</h3>
                    <div className="fahrdienst">
                      <div className="knopfreihe">
                        <button
                          type="button"
                          className="knopf"
                          aria-pressed={!!meineFahrt}
                          disabled={laeuft}
                          onClick={() => {
                            // Die einzige Handlung im Aushang, deren Folgen ANDERE tragen: Zieht
                            // der Fahrer sein Auto zurück, löscht der Server die Mitfahrer mit
                            // (mutations.pb.js). Bisher passierte das ohne Rückfrage, und die
                            // Quittung erwähnte es nicht — zwei Leute standen ohne Mitfahrgelegen-
                            // heit da, und der Verursacher erfuhr nicht, dass er es getan hatte.
                            // Ein leeres Auto zurückzuziehen betrifft niemanden und fragt nichts.
                            const drin = meineFahrt ? mitfahrer(meineFahrt.id) : []
                            if (meineFahrt && drin.length > 0) {
                              setFrage({
                                id: spieltag.id,
                                titel: 'Auto zurückziehen',
                                text: `${drin.join(' und ')} ${
                                  drin.length === 1 ? 'sitzt' : 'sitzen'
                                } bei dir. ${
                                  drin.length === 1 ? 'Er oder sie steht' : 'Sie stehen'
                                } danach ohne Mitfahrgelegenheit da und ${
                                  drin.length === 1 ? 'muss' : 'müssen'
                                } sich neu einteilen.`,
                                knopf: 'Auto zurückziehen',
                                tun: () => {
                                  setFrage(null)
                                  setzeFahrt(false)
                                },
                              })
                              return
                            }
                            setzeFahrt(!meineFahrt, 3)
                          }}
                        >
                          Ich fahre
                        </button>

                        {meineFahrt && (
                          <span className="plaetze">
                            <button
                              type="button"
                              className="knopf knopf--schmal"
                              disabled={laeuft || meineFahrt.seats <= 1}
                              aria-label="Ein Platz weniger"
                              onClick={() => setzeFahrt(true, meineFahrt.seats - 1)}
                            >
                              −
                            </button>
                            <span className="plaetze__wert">
                              {meineFahrt.seats}
                              <span className="visuell-versteckt"> Plätze</span>
                            </span>
                            <button
                              type="button"
                              className="knopf knopf--schmal"
                              disabled={laeuft || meineFahrt.seats >= 6}
                              aria-label="Ein Platz mehr"
                              onClick={() => setzeFahrt(true, meineFahrt.seats + 1)}
                            >
                              +
                            </button>
                          </span>
                        )}
                      </div>

                      <Nachfragekasten
                        frage={frage}
                        abbrechen={() => setFrage(null)}
                        laeuft={laeuft}
                      />

                      {/* Das eigene Auto: wer sitzt drin? Ohne das müsste der Fahrer die Liste
                          weiter unten von Hand mit den Mitfahrern abgleichen. */}
                      {meineFahrt && (
                        <div className="auto">
                          <span className="auto__wer">Bei dir</span>
                          <Balken voll={meineFahrt.taken} gesamt={meineFahrt.seats} />
                          <span className="auto__frei">
                            {mitfahrer(meineFahrt.id).join(', ') || 'noch niemand'}
                          </span>
                        </div>
                      )}

                      {spieltag.rides
                        .filter((f) => f.member !== board.me)
                        .map((f: Fahrt) => {
                          const drin = meinPlatz === f.id
                          const voll = f.taken >= f.seats && !drin
                          // Sichtbar stehen bleiben, aber nichts mehr anbieten: Wer hier
                          // einstiege, führe mit niemandem.
                          const fahrerWeg = abgesagt(f)
                          return (
                            <div key={f.id} className="auto">
                              <span className="auto__wer">{name(f.member)} fährt</span>
                              <Balken voll={f.taken} gesamt={f.seats} />
                              <span className="auto__frei">
                                {fahrerWeg ? (
                                  <span className="zeile__warnung">Fahrer hat abgesagt</span>
                                ) : (
                                  mitfahrer(f.id).join(', ') || 'noch frei'
                                )}
                              </span>
                              <button
                                type="button"
                                className="knopf"
                                aria-pressed={drin}
                                disabled={laeuft || voll || (fahrerWeg && !drin)}
                                onClick={() => setzeMitfahrt(drin ? null : f.id)}
                              >
                                {drin
                                  ? 'Aussteigen'
                                  : fahrerWeg
                                    ? 'Fährt nicht'
                                    : voll
                                      ? 'Voll'
                                      : 'Mitfahren'}
                              </button>
                            </div>
                          )
                        })}

                      {spieltag.rides.length === 0 && (
                        <p className="namen">Noch fährt niemand.</p>
                      )}

                      {/* Hier steht der Satz, nicht nur die Zahl: An dieser Stelle entscheidet
                          jemand, ob er sein Auto anbietet. */}
                      {ohnePlatz > 0 && (
                        <p className="namen">
                          <span className="zeile__warnung">
                            {ohnePlatz === 1
                              ? 'Eine Zusage hat noch keinen Platz.'
                              : `${ohnePlatz} Zusagen haben noch keinen Platz.`}
                          </span>
                        </p>
                      )}
                    </div>

                    {spieltag.meeting_point && (
                      <p className="namen">
                        Treffpunkt: <strong>{spieltag.meeting_point}</strong>
                      </p>
                    )}
                  </>
                )}
              </>
            )}

            <h3 className="detail__titel">Die Mannschaft</h3>
            {(['yes', 'maybe', 'no'] as const).map((status) => {
              const wer = board.members.filter((m) => spieltag.responses[m.id] === status)
              if (!wer.length) return null
              const beschriftung = { yes: 'Dabei', maybe: 'Unsicher', no: 'Kann nicht' }[status]
              return (
                <p key={status} className="namen">
                  <strong>{beschriftung}:</strong> {wer.map((m) => m.name).join(', ')}
                </p>
              )
            })}
            {(() => {
              const schweigen = board.members.filter((m) => !spieltag.responses[m.id])
              return schweigen.length ? (
                <p className="namen">
                  <strong>Keine Antwort:</strong> {schweigen.map((m) => m.name).join(', ')}
                </p>
              ) : null
            })()}

            {/* Der Erfolg bekommt eine Zeile wie der Fehler. Sie steht am Ende des
                aufgeklappten Bereichs, wo auch die Fehlerzeile steht, und wird angesagt. */}
            <div role="status">{gemeldet ? <p className="gemeldet">{gemeldet}</p> : null}</div>
            <Fehler text={fehler} />
          </div>
        )}
      </div>
    </li>
  )
}
