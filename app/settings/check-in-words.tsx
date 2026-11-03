'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CHECK_IN_WORDING } from '~/domain/check-in'
import {
  checkInSentenceAsSent,
  checkInSentenceRefusals,
  checkInWordsInForce,
  CHECK_IN_LINES,
  DISCIPLERS_CHECK_IN_WORDS,
  type CheckInLine,
  type SavedCheckInWords,
} from '~/domain/check-in-words'
import { CHECK_IN_SENTENCE } from '~/domain/launch-terms'
import {
  checkInThankYou,
  concernDetailRequest,
  meetingQuestion,
  replyChoicesTo,
  satisfactionQuestion,
} from '~/domain/outbound-copy'
import { CHECK_IN_SENTENCE_REFUSALS } from './check-in-words-copy'

/**
 * "What the check-in says": the four lines and the phone beside them (Exponential
 * launch, ticket 40).
 *
 * The phone is composed by the functions that compose the texts that go out, frame
 * and all, so it cannot show an Admin a text their people would not get. It is
 * rendered on the server from what is saved, so the page stands with script off; a
 * blank line there falls back and the save refuses what it must.
 *
 * With script on, a line that would be refused says so as it is typed and stops the
 * form with the browser's own validation, because a refused save comes back with the
 * form as it was saved and the Admin's typing gone.
 */

/** Whoever the example is about, and what they answer, as James saw it in the mock-up. */
const EXAMPLE = {
  subject: 'Jordan Ellis',
  met: '1',
  // D, the concern, because it is what walks the phone through all four sentences.
  rating: 'D',
  concern: 'We keep missing each other. Work has been rough for him.',
}

const FIELD: Record<CheckInLine, { readonly name: string; readonly label: string }> = {
  question: { name: 'checkInQuestion', label: 'The question' },
  rating: { name: 'checkInRating', label: 'How it went' },
  concern: { name: 'checkInConcern', label: 'After a concern' },
  thanks: { name: 'checkInThanks', label: 'The thank-you' },
}

/** The ending a line always carries, said under it, so the answer can be counted. */
const ENDING: Partial<Record<CheckInLine, string>> = {
  question: replyChoicesTo('met', CHECK_IN_WORDING),
  rating: replyChoicesTo('satisfaction', CHECK_IN_WORDING),
}

const Lock = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </svg>
)

const Line = ({
  line,
  value,
  onChange,
}: {
  readonly line: CheckInLine
  readonly value: string
  readonly onChange: (value: string) => void
}) => {
  const box = useRef<HTMLTextAreaElement>(null)
  const { name, label } = FIELD[line]
  const ending = ENDING[line]

  const refusals = checkInSentenceRefusals(line, value).map(
    (refusal) => CHECK_IN_SENTENCE_REFUSALS[refusal],
  )
  const said = refusals.join(' ')
  // The sentence as it would go out, as the save counts it.
  const length = Array.from(checkInSentenceAsSent(value) ?? '').length

  useEffect(() => {
    box.current?.setCustomValidity(said)
  }, [said])

  // A box the height of what is in it. One sentence, but on a phone a text box would
  // hide the end of even Discipler's thank-you, and 160 characters is three lines.
  useLayoutEffect(() => {
    const current = box.current
    if (!current) return
    const fit = () => {
      current.style.height = 'auto'
      current.style.height = `${current.offsetHeight - current.clientHeight + current.scrollHeight}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [value])

  return (
    <div className="field">
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <textarea
        ref={box}
        id={name}
        name={name}
        rows={1}
        value={value}
        placeholder={DISCIPLERS_CHECK_IN_WORDS[line]}
        onChange={(event) => onChange(event.target.value)}
        // One sentence, on one line as it is sent, so Return adds no line to it.
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault()
        }}
      />
      {length > CHECK_IN_SENTENCE.counterFrom ? (
        <p className={length > CHECK_IN_SENTENCE.longest ? 'w-count over' : 'w-count'}>
          {length} of {CHECK_IN_SENTENCE.longest}
        </p>
      ) : null}
      {ending ? (
        <p className="w-fixed">
          <Lock />
          <span>Always ends with “{ending}” so the answer can be counted.</span>
        </p>
      ) : null}
      {said ? (
        <p className="w-warn small" role="alert">
          {said}
        </p>
      ) : null}
    </div>
  )
}

/** The words typed elsewhere on this form, as they stand, which the phone reads too. */
interface Elsewhere {
  readonly readsAs: string
  readonly leaderNoun: string
  readonly participantNoun: string
}

const valueOf = (id: string): string => {
  const box = document.getElementById(id)
  return box instanceof HTMLInputElement ? box.value.trim() : ''
}

export const CheckInWordsBlock = ({
  saved,
  readsAs,
  leaderNoun,
  participantNoun,
}: {
  readonly saved: SavedCheckInWords
  readonly readsAs: string
  readonly leaderNoun: string
  readonly participantNoun: string
}) => {
  // The box shows Discipler's words on a line with nothing saved, so a church
  // rewrites a sentence rather than starting from nothing. A line left as Discipler
  // wrote it saves as nothing (`readCheckInWords`).
  const [lines, setLines] = useState<Record<CheckInLine, string>>(() =>
    checkInWordsInForce(saved),
  )
  const [elsewhere, setElsewhere] = useState<Elsewhere>({ readsAs, leaderNoun, participantNoun })

  useEffect(() => {
    const read = () =>
      setElsewhere({
        // The same fallback `speakingName` applies, on what is typed so far.
        readsAs: valueOf('fromName') || valueOf('name') || readsAs,
        leaderNoun: valueOf('leaderNoun') || leaderNoun,
        participantNoun: valueOf('participantNoun') || participantNoun,
      })
    document.addEventListener('input', read)
    return () => document.removeEventListener('input', read)
  }, [readsAs, leaderNoun, participantNoun])

  const words = checkInWordsInForce({
    question: checkInSentenceAsSent(lines.question),
    rating: checkInSentenceAsSent(lines.rating),
    concern: checkInSentenceAsSent(lines.concern),
    thanks: checkInSentenceAsSent(lines.thanks),
  })
  const speaking = { ministryName: elsewhere.readsAs, subject: EXAMPLE.subject, words }

  return (
    <section className="wording" id="wording">
      <div>
        <h3>What the check-in says</h3>
        <p className="subtle">
          The words each {elsewhere.leaderNoun} is texted. Write [name] where their{' '}
          {elsewhere.participantNoun}’s name goes. Leave a line blank to use Discipler’s
          words.
        </p>

        {CHECK_IN_LINES.map((line) => (
          <Line
            key={line}
            line={line}
            value={lines[line]}
            onChange={(value) => setLines((was) => ({ ...was, [line]: value }))}
          />
        ))}

        <button
          type="button"
          className="ghost-btn"
          onClick={() => setLines({ ...DISCIPLERS_CHECK_IN_WORDS })}
        >
          Use Discipler’s wording
        </button>
      </div>

      <figure className="w-phone" aria-label={`What each ${elsewhere.leaderNoun} receives`}>
        <figcaption>What each {elsewhere.leaderNoun} receives</figcaption>
        <div className="w-screen">
          {/* As it reads the first time a month, so the whole frame is on the phone:
              the rates line rides on one text a person is sent each month. */}
          <p className="in">{meetingQuestion({ ...speaking, discloseOptOut: true })}</p>
          <p className="out">{EXAMPLE.met}</p>
          <p className="in">{satisfactionQuestion({ ...speaking, wording: CHECK_IN_WORDING })}</p>
          <p className="out">{EXAMPLE.rating}</p>
          <p className="in">{concernDetailRequest(speaking)}</p>
          <p className="out">{EXAMPLE.concern}</p>
          <p className="in">{checkInThankYou(speaking)}</p>
        </div>
      </figure>
    </section>
  )
}
