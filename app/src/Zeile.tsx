import { useId } from 'react'
import type { Board, Fahrt, Spieltag, Status } from './api'
import { plaetze as plaetzeText, tag, uhrzeit, wannUngefaehr } from './format'

const ANTWORTEN: { wert: Status; text: string }[] = [
  { wert: 'yes', text: 'Dabei' },
  { wert: 'maybe', text: 'Unsicher' },
  { wert: 'no', text: 'Kann nicht' },
]

type Props = {
  spieltag: Spieltag
  board: Board
  offen: boolean
  fehler?: string
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
    <span className="balken" aria-hidden="true">
      {felder.map((belegt, i) => (
        <span key={i} className={`balken__feld${belegt ? ' balken__feld--voll' : ''}`} />
      ))}
    </span>
  )
}

export default function Zeile({
  spieltag,
  board,
  offen,
  fehler,
  laeuft,
  aufklappen,
  setzeAntwort,
  setzeFahrt,
  setzeMitfahrt,
}: Props) {
  const bereichId = useId()
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
  const freiGesamt = spieltag.rides.reduce((summe, f) => summe + (f.seats - f.taken), 0)
  const vorbei = wannUngefaehr(spieltag.date) === 'vorbei'

  // Bei Heimspielen gibt es keine Abfahrt — die Zeitspalte zeigt dann den Anwurf (6.3).
  const zeitpunkt = spieltag.is_home ? spieltag.date : (spieltag.departure ?? spieltag.date)
  const zeitLabel = spieltag.is_home || !spieltag.departure ? 'Anwurf' : 'Abfahrt'

  // Rot ist für die Dinge da, die jemanden zum Handeln bringen sollen (6.2).
  const ohneFahrer = !spieltag.is_home && spieltag.rides.length === 0
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
              </>
            )}
            {ohneAntwort && !vorbei && (
              <>
                {' · '}
                <span className="zeile__warnung">du fehlst noch</span>
              </>
            )}
          </span>

          {vollzaehlig && <span className="stempel">Komplett</span>}
        </span>
      </button>

      <div id={bereichId} hidden={!offen}>
        {offen && (
          <div className="detail">
            {/* Der Treffpunkt stand bislang nur in der Kapitänsansicht: Er wurde eingegeben, vom
                Board mitgeliefert — und hier fallengelassen. Wer gemeinsam losfährt, muss wissen,
                wohin. Bei Heimspielen fährt niemand los, dort bleibt die Zeile weg. */}
            {!spieltag.is_home && (spieltag.meeting_point || spieltag.departure) && (
              <p className="detail__treffpunkt">
                {spieltag.departure && (
                  <>
                    Abfahrt <strong>{uhrzeit(spieltag.departure)}</strong>
                  </>
                )}
                {spieltag.departure && spieltag.meeting_point && ' · '}
                {spieltag.meeting_point && <>Treffpunkt: {spieltag.meeting_point}</>}
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
                  {ANTWORTEN.map(({ wert, text }) => (
                    <button
                      key={wert}
                      type="button"
                      className="knopf"
                      aria-pressed={meineAntwort === wert}
                      disabled={laeuft}
                      // Nochmal auf dieselbe Antwort tippen nimmt sie zurück.
                      onClick={() => setzeAntwort(meineAntwort === wert ? null : wert)}
                    >
                      {text}
                    </button>
                  ))}
                </div>

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
                          onClick={() => setzeFahrt(!meineFahrt, 3)}
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
                          return (
                            <div key={f.id} className="auto">
                              <span className="auto__wer">{name(f.member)} fährt</span>
                              <Balken voll={f.taken} gesamt={f.seats} />
                              <span className="auto__frei">
                                {mitfahrer(f.id).join(', ') || 'noch frei'}
                              </span>
                              <button
                                type="button"
                                className="knopf"
                                aria-pressed={drin}
                                disabled={laeuft || voll}
                                onClick={() => setzeMitfahrt(drin ? null : f.id)}
                              >
                                {drin ? 'Aussteigen' : voll ? 'Voll' : 'Mitfahren'}
                              </button>
                            </div>
                          )
                        })}

                      {spieltag.rides.length === 0 && (
                        <p className="namen">Noch fährt niemand.</p>
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

            {fehler && (
              <p className="fehler" role="status">
                {fehler}
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
