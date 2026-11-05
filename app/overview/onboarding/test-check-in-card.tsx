'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { afterOnboardingCloses } from './hold'
import {
  CODE,
  CODE_LABEL,
  CONFIRM_AND_SEND,
  NEW_CODE_SENT,
  SEND_ANOTHER,
  SEND_TEST,
  SOMETHING_WENT_WRONG,
  TEST_CARD_TITLE,
  TEST_CARD_AGREEMENT,
  testCardBody,
  testCardLeft,
  testCardSent,
  testCardVerify,
  TEXT_ME_A_NEW_CODE,
} from './copy'

/**
 * The test check-in's card, its body and its button (Exponential launch, ticket 28;
 * `.lavish/onboarding/s1-modal.html`, `s1-modal-existing.html`, `s2-verify.html`,
 * `s3-sent.html`, `s4-waiting.html` and `s4-limit.html`).
 *
 * Needs script, as the routes it calls are JSON (ticket 09). Everything it says comes
 * either from those answers or from what the server handed it as the modal opened.
 */

const SEND_ADDRESS = '/overview/test-check-in/send'
const CONFIRM_ADDRESS = '/overview/test-check-in/confirm'
const NEW_CODE_ADDRESS = '/account/phone/send-code'

interface Answer {
  readonly sent?: true
  readonly left?: number
  readonly verify?: true
  readonly phoneShown?: string
  readonly refusal?: string
  readonly message?: string
}

const post = async (address: string, fields: Record<string, string> = {}): Promise<Answer> => {
  try {
    const answer = await fetch(address, { method: 'POST', body: new URLSearchParams(fields) })
    return (await answer.json()) as Answer
  } catch {
    return { refusal: 'network', message: SOMETHING_WENT_WRONG }
  }
}

/**
 * The card's title, its last word, "check-in", kept on one line. The tick narrows the
 * title, which otherwise breaks at the hyphen and leaves "in" alone below. One span
 * around it all, as the heading lays its children out side by side.
 */
export const TestCardTitle = () => {
  const last = TEST_CARD_TITLE.lastIndexOf(' ') + 1
  return (
    <span>
      {TEST_CARD_TITLE.slice(0, last)}
      <span className="nowrap">{TEST_CARD_TITLE.slice(last)}</span>
    </span>
  )
}

const Tick = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

export const TestCheckInCard = ({
  phoneShown,
  needsAgreement,
  left: leftAtFirst,
  sentToday,
  stepDone,
  refusalAtFirst,
  refusalKind,
  leaderNoun,
  children,
}: {
  /** The phone as the card shows it, or null where this Admin has none. */
  readonly phoneShown: string | null
  readonly needsAgreement: boolean
  readonly left: number
  readonly sentToday: number
  /** Whether the church's setup step is ticked already. */
  readonly stepDone: boolean
  readonly refusalAtFirst: string | null
  readonly refusalKind: 'no_phone' | 'limit' | null
  readonly leaderNoun: string
  /** The picture on top, drawn on the server. */
  readonly children: React.ReactNode
}) => {
  const router = useRouter()
  const [stage, setStage] = useState<'ready' | 'verify'>('ready')
  const [justSent, setJustSent] = useState(false)
  const [everSent, setEverSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [showsAgreement, setShowsAgreement] = useState(needsAgreement)
  const [shownPhone, setShownPhone] = useState(phoneShown)
  const [left, setLeft] = useState(leftAtFirst)
  const [hasSentToday, setHasSentToday] = useState(sentToday > 0)
  const [refusal, setRefusal] = useState(refusalAtFirst)
  const [closed, setClosed] = useState(refusalKind !== null)
  const [newCode, setNewCode] = useState(false)
  const [code, setCode] = useState('')
  const codeBox = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (stage === 'verify') codeBox.current?.focus()
  }, [stage])

  // The bar under the tabs is drawn from the page's read, so it hears of this once the
  // modal has gone, and plays the tick then. Not stopped when this card unmounts, because
  // closing the modal is what unmounts it, before the modal says it has closed.
  useEffect(() => {
    if (everSent) afterOnboardingCloses(() => router.refresh())
  }, [everSent, router])

  const take = (answer: Answer) => {
    setNewCode(false)
    if (answer.sent) {
      setStage('ready')
      setCode('')
      setRefusal(null)
      setShowsAgreement(false)
      setJustSent(true)
      setEverSent(true)
      setHasSentToday(true)
      setLeft(answer.left ?? 0)
      return
    }
    setJustSent(false)
    if (answer.verify) {
      setRefusal(null)
      setShowsAgreement(false)
      if (answer.phoneShown) setShownPhone(answer.phoneShown)
      setStage('verify')
      return
    }
    setRefusal(answer.message ?? SOMETHING_WENT_WRONG)
    if (answer.refusal === 'test_check_in.agreement_needed') setShowsAgreement(true)
    // Nothing the Admin can do today will change this one, as `s4-limit.html` draws.
    if (answer.refusal === 'test_check_in.limit_reached') setClosed(true)
  }

  const press = async () => {
    setPending(true)
    take(await post(SEND_ADDRESS, showsAgreement ? { agreed: 'yes' } : {}))
    setPending(false)
  }

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    take(await post(CONFIRM_ADDRESS, { code }))
    setPending(false)
  }

  const askForANewCode = async () => {
    setPending(true)
    const answer = await post(NEW_CODE_ADDRESS)
    setPending(false)
    if (answer.refusal) {
      setRefusal(answer.message ?? SOMETHING_WENT_WRONG)
      return
    }
    setRefusal(null)
    setNewCode(true)
    setCode('')
    codeBox.current?.focus()
  }

  // A refusal says its own thing above a plain Send test, as the mock-ups draw it.
  const done = (stepDone || everSent) && !refusal && stage === 'ready'

  return (
    <article id="test-check-in" className={done ? 'onb-card test is-done' : 'onb-card test'}>
      {children}
      <h3>
        {done ? <Tick /> : null}
        <TestCardTitle />
      </h3>
      {shownPhone ? <p>{testCardBody(shownPhone, leaderNoun)}</p> : null}

      {refusal ? (
        <p className="toast error" role="alert">
          {refusal}
        </p>
      ) : null}

      {stage === 'verify' ? (
        <form className="verify-form" onSubmit={confirm}>
          <div className="verify">
            <p>{testCardVerify(shownPhone ?? '')}</p>
            <label className="code">
              <span>{CODE}</span>
              <input
                ref={codeBox}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label={CODE_LABEL}
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button type="button" className="small-link" onClick={askForANewCode} disabled={pending}>
              {TEXT_ME_A_NEW_CODE}
            </button>
            {newCode ? (
              <p className="fine" role="status">
                {NEW_CODE_SENT}
              </p>
            ) : null}
          </div>
          <button type="submit" className="btn onb-go" disabled={pending}>
            {CONFIRM_AND_SEND}
          </button>
        </form>
      ) : (
        <>
          {justSent ? (
            <div className="onb-ok" role="status">
              <Tick />
              <p>
                <strong>{testCardSent.lead}</strong> {testCardSent.rest(leaderNoun)}
              </p>
            </div>
          ) : null}
          {showsAgreement ? <p className="fine">{TEST_CARD_AGREEMENT}</p> : null}
          {hasSentToday && left > 0 && !refusal ? <p className="fine">{testCardLeft(left)}</p> : null}
          <button
            type="button"
            className={done ? 'btn sec onb-go' : 'btn onb-go'}
            onClick={press}
            disabled={pending || closed}
          >
            {done ? SEND_ANOTHER : SEND_TEST}
          </button>
        </>
      )}
    </article>
  )
}
