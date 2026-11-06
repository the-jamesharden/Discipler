'use client'

import { useState, type FormEvent } from 'react'
import { EMAIL_PAGE, TEXTING_FINE_PRINT } from '../copy'
import { signUpHref, stepAfterSendRefusal } from '../flow'
import { postToSignUp } from '../post'

/** Which field a refusal is about, so the sentence sits under it. */
const fieldOf = (refusal: string | null): 'email' | 'phone' | 'form' => {
  if (refusal === 'signup.bad_email') return 'email'
  if (refusal === 'signup.bad_phone' || refusal === 'signup.phone_not_us') return 'phone'
  return 'form'
}

/**
 * "Continue" (Exponential launch, ticket 15; renamed in mock-up 6). Refusals are the
 * route's own sentences, in place of the browser's validation bubbles, so the page speaks
 * in one voice; a refusal costs nothing and counts against nothing.
 *
 * Going to the code page says `sent`, which is what opens its popup. A code already on
 * its way from the first of a double click was announced by that click.
 */
export const EmailAndPhoneForm = ({
  triedEmail,
  carried,
}: {
  /** An address a failed send left on the attempt. */
  readonly triedEmail: string | null
  readonly carried: string
}) => {
  const [email, setEmail] = useState(triedEmail ?? '')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<{ field: 'email' | 'phone' | 'form'; message: string } | null>(null)

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setRefused(null)

    const answer = await postToSignUp('/signup/send-code', { email, phone })
    if (answer.ok) {
      window.location.assign(signUpHref('code', carried, { sent: true }))
      return
    }
    const next = stepAfterSendRefusal(answer.refusal)
    if (next) {
      window.location.assign(signUpHref(next.step, carried, { again: next.again }))
      return
    }
    setRefused({ field: fieldOf(answer.refusal), message: answer.message })
    setBusy(false)
  }

  const refusalFor = (field: 'email' | 'phone' | 'form') =>
    refused?.field === field ? (
      <p className="field-error" id={`refused-${field}`} role="alert">
        {refused.message}
      </p>
    ) : null

  return (
    <form onSubmit={send} noValidate>
      <div className="field">
        <label className="label" htmlFor="email">
          {EMAIL_PAGE.emailLabel} <span className="req">*</span>
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
        {refusalFor('email')}
        <p className="hint" id="email-hint">
          {EMAIL_PAGE.emailHint}
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="phone">
          {EMAIL_PAGE.phoneLabel} <span className="req">*</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          aria-invalid={refused?.field === 'phone' ? true : undefined}
          aria-describedby={refused?.field === 'phone' ? 'refused-phone phone-fine' : 'phone-fine'}
        />
        <p className="fine" id="phone-fine">
          {TEXTING_FINE_PRINT}
        </p>
        {refusalFor('phone')}
      </div>

      {refusalFor('form')}
      <button type="submit" className={refused?.field === 'form' ? 'full after-field' : 'full'} disabled={busy}>
        {EMAIL_PAGE.submit}
      </button>
    </form>
  )
}
