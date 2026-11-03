'use client'

import Link from 'next/link'
import { useCallback, useState, type FormEvent } from 'react'
import { HUMAN_CHECK_ACTIONS } from '~/domain/sign-up-attempt'
import { SUPPORT_KINDS, type SupportKind } from '~/domain/support-form'
import {
  ATTACHED_WITH_A_PAGE,
  ATTACHED_WITH_NO_PAGE,
  BACK_TO_HELP,
  EMAIL_HINT,
  EMAIL_LABEL,
  KIND_LABELS,
  KIND_QUESTION,
  MESSAGE_HINT,
  MESSAGE_LABEL,
  NOT_SENT,
  SEND,
  SENDING,
  SENT,
  SENT_TITLE,
  STILL_CHECKING,
} from './copy'
import { HumanCheck } from './human-check'

const MESSAGE_LONGEST = 5000

/**
 * The form itself. It posts with `fetch` and stays on screen whatever comes back, as
 * the phone check's card does, so a refusal never costs somebody what they typed.
 *
 * It still names its route with `method="post"`, so a press before the page has come
 * alive sends a POST and not a GET, which would put the message in an address.
 */
export const ContactForm = ({
  page,
  humanCheckKey,
  action,
}: {
  /** The page the Help menu was opened on, already cleaned, or null. */
  readonly page: string | null
  /** Turnstile's site key, for somebody not signed in. Null for a signed-in Admin. */
  readonly humanCheckKey: string | null
  readonly action: string
}) => {
  const [kind, setKind] = useState<SupportKind>('support')
  const [token, setToken] = useState('')
  // A token is good once, so each answer that spent one mounts a new check.
  const [checkRound, setCheckRound] = useState(0)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const onToken = useCallback((next: string) => setToken(next), [])

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending) return
    if (humanCheckKey && !token) {
      setProblem(STILL_CHECKING)
      return
    }

    const body = new URLSearchParams()
    for (const [name, value] of new FormData(event.currentTarget)) {
      if (typeof value === 'string') body.set(name, value)
    }
    if (humanCheckKey) body.set('token', token)

    setSending(true)
    setProblem(null)
    try {
      const response = await fetch(action, { method: 'POST', body })
      const answer = (await response.json().catch(() => null)) as { sent?: boolean; message?: string } | null
      if (answer?.sent) {
        setSentTo(body.get('email'))
        return
      }
      setProblem(answer?.message ?? NOT_SENT)
    } catch {
      setProblem(NOT_SENT)
    } finally {
      setSending(false)
      setToken('')
      setCheckRound((round) => round + 1)
    }
  }

  if (sentTo !== null) {
    return (
      <div className="card" role="status">
        <h2 className="card-title">{SENT_TITLE}</h2>
        <p>{SENT(sentTo)}</p>
        <p className="contact-sent-link">
          <Link href="/help">{BACK_TO_HELP}</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      {problem ? (
        <p className="toast error" role="alert">
          {problem}
        </p>
      ) : null}

      <form method="post" action={action} onSubmit={send}>
        <fieldset className="contact-kinds">
          <legend className="plain">{KIND_QUESTION}</legend>
          <div className="choices stack">
            {SUPPORT_KINDS.map((one) => (
              <label className="option" key={one}>
                <input
                  type="radio"
                  name="kind"
                  value={one}
                  checked={kind === one}
                  onChange={() => setKind(one)}
                />
                <span className="option-title">{KIND_LABELS[one]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label className="label" htmlFor="contact-message">
            {MESSAGE_LABEL}
          </label>
          <textarea id="contact-message" name="message" rows={6} required maxLength={MESSAGE_LONGEST} />
          <span className="contact-field-hint">{MESSAGE_HINT}</span>
        </div>

        <div className="field">
          <label className="label" htmlFor="contact-email">
            {EMAIL_LABEL}
          </label>
          <input id="contact-email" name="email" type="email" required autoComplete="email" maxLength={254} />
          <span className="contact-field-hint">{EMAIL_HINT}</span>
        </div>

        {page ? <input type="hidden" name="page" value={page} /> : null}

        {kind === 'bug' ? (
          <p className="notice contact-attached">{page ? ATTACHED_WITH_A_PAGE(page) : ATTACHED_WITH_NO_PAGE}</p>
        ) : null}

        {humanCheckKey ? (
          <HumanCheck
            key={checkRound}
            siteKey={humanCheckKey}
            action={HUMAN_CHECK_ACTIONS.contactSupport}
            onToken={onToken}
          />
        ) : null}

        <button type="submit" disabled={sending}>
          {sending ? SENDING : SEND}
        </button>
      </form>
    </div>
  )
}
