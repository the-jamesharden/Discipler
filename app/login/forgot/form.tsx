'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { asEmailAddress } from '~/domain/email'
import { postToSignUp } from '../../signup/post'
import { passTurnstile } from '../../turnstile-widget'
import { BACK_TO_SIGN_IN, FORGOT_REFUSALS, REQUEST_PAGE, SENT_PAGE } from './copy'

/** What the page says once the button has been answered, to everybody alike. */
export const LinkSent = ({ email }: { readonly email: string }) => {
  useEffect(() => {
    document.title = SENT_PAGE.title
  }, [])

  // A long address on a phone breaks after its @, and not one letter before its end.
  const at = email.lastIndexOf('@') + 1

  return (
    <>
      <div className="sent-to" role="status">
        {SENT_PAGE.sentBefore}
        <strong>
          {email.slice(0, at)}
          <wbr />
          {email.slice(at)}
        </strong>
        {SENT_PAGE.sentAfter}
      </div>
      <p className="card-note">{SENT_PAGE.cantFindIt}</p>
      <p className="card-note">
        <a href="/login">{BACK_TO_SIGN_IN}</a>
      </p>
    </>
  )
}

/**
 * "Send me the link" (Exponential launch, ticket 22). Turnstile runs when the button is
 * pressed, and the button turns off at that press, so a browser sends one request. The
 * address is checked here first, so a typo costs no human check.
 *
 * It still names a method, so a press before the page has come alive sends a POST and
 * not a GET, which would put the address in an address bar and a log.
 */
export const ForgotPasswordForm = ({
  siteKey,
  action,
}: {
  readonly siteKey: string | null
  /** `HUMAN_CHECK_ACTIONS.forgotPassword`, handed in so the page and the service name one word. */
  readonly action: string
}) => {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<{ readonly field: 'email' | 'form'; readonly message: string } | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const host = useRef<HTMLDivElement>(null)
  // A ref as well as `busy`, because a second click can land before `busy` has rendered.
  const pressed = useRef(false)

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (pressed.current) return

    if (!asEmailAddress(email)) {
      setRefused({ field: 'email', message: FORGOT_REFUSALS['forgot.bad_email'] })
      return
    }

    pressed.current = true
    setBusy(true)
    setRefused(null)

    const giveBack = (field: 'email' | 'form', message: string) => {
      setRefused({ field, message })
      pressed.current = false
      setBusy(false)
    }

    let check: Awaited<ReturnType<typeof passTurnstile>>
    try {
      if (!siteKey || !host.current) throw new Error('No human check on this page')
      check = await passTurnstile(host.current, siteKey, action)
    } catch {
      giveBack('form', FORGOT_REFUSALS['forgot.not_human'])
      return
    }

    const answer = await postToSignUp<{ email: string }>('/login/forgot/ask', { email, humanToken: check.token })
    check.done()

    if (answer.ok) {
      setSentTo(answer.body.email)
      return
    }
    giveBack(answer.refusal === 'forgot.bad_email' ? 'email' : 'form', answer.message)
  }

  if (sentTo !== null) return <LinkSent email={sentTo} />

  return (
    <>
      <form method="post" action="/login/forgot/ask" onSubmit={send} noValidate>
        <div className="field">
          <label className="label" htmlFor="email">
            {REQUEST_PAGE.emailLabel}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={refused?.field === 'email' ? true : undefined}
            aria-describedby={refused?.field === 'email' ? 'refused-email email-hint' : 'email-hint'}
          />
          {refused?.field === 'email' ? (
            <p className="field-error" id="refused-email" role="alert">
              {refused.message}
            </p>
          ) : null}
          <p className="hint" id="email-hint">
            {REQUEST_PAGE.emailHint}
          </p>
        </div>

        <div ref={host} className="opening-check" />

        {refused?.field === 'form' ? (
          <p className="field-error" role="alert">
            {refused.message}
          </p>
        ) : null}
        <button type="submit" className={refused?.field === 'form' ? 'full after-field' : 'full'} disabled={busy}>
          {REQUEST_PAGE.submit}
        </button>
      </form>
      <p className="card-note">
        <a href="/login">{BACK_TO_SIGN_IN}</a>
      </p>
    </>
  )
}
