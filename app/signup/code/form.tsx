'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CODE_PAGE, newCodeSent } from '../copy'
import { countdown, digitsOfCode, signUpHref, stepAfterCodeRefusal, type NextStep } from '../flow'
import { postToSignUp } from '../post'

/**
 * "Continue" and "Send a new code" (Exponential launch, ticket 16). The code goes in a
 * form body and nowhere else, never the address. The server is what counts the wait
 * and the tries; this only shows them, and a page that disagrees is told so by the
 * route's answer.
 */
export const CodeForm = ({
  email,
  resendInSeconds,
  refusedOnArrival,
  carried,
}: {
  readonly email: string
  readonly resendInSeconds: number
  /** A reload after the code expired or its tries ran out. */
  readonly refusedOnArrival: string | null
  readonly carried: string
}) => {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(refusedOnArrival)
  const [notice, setNotice] = useState<string | null>(null)
  const [wait, setWait] = useState(resendInSeconds)
  const waitEndsAt = useRef<number | null>(null)

  const waitFor = (seconds: number) => {
    waitEndsAt.current = Date.now() + seconds * 1000
    setWait(seconds)
  }

  // A clock rather than a running subtraction, so a phone that slept wakes up right.
  useEffect(() => {
    waitEndsAt.current ??= Date.now() + resendInSeconds * 1000
    const ticking = setInterval(() => {
      setWait(Math.max(Math.ceil((waitEndsAt.current! - Date.now()) / 1000), 0))
    }, 1000)
    return () => clearInterval(ticking)
  }, [resendInSeconds])

  const goTo = ({ step, again }: NextStep) => window.location.assign(signUpHref(step, carried, { again }))

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setRefused(null)
    setNotice(null)

    const answer = await postToSignUp('/signup/confirm-code', { code })
    if (answer.ok) {
      goTo({ step: 'account' })
      return
    }
    const next = stepAfterCodeRefusal(answer.refusal)
    if (next) {
      goTo(next)
      return
    }
    setRefused(answer.message)
    setBusy(false)
  }

  const askForAnother = async () => {
    if (busy) return
    setBusy(true)
    setRefused(null)
    setNotice(null)

    const answer = await postToSignUp<{ resendInSeconds: number }>('/signup/resend-code')
    if (answer.ok) {
      setCode('')
      setNotice(newCodeSent(email))
      waitFor(answer.body.resendInSeconds)
    } else {
      const next = stepAfterCodeRefusal(answer.refusal)
      if (next) {
        goTo(next)
        return
      }
      setRefused(answer.message)
      if (answer.resendInSeconds !== undefined) waitFor(answer.resendInSeconds)
    }
    setBusy(false)
  }

  return (
    <>
      <form onSubmit={confirm} noValidate>
        <div className="field">
          <label className="label" htmlFor="code">
            {CODE_PAGE.codeLabel}
          </label>
          <input
            id="code"
            name="code"
            className="code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(event) => setCode(digitsOfCode(event.target.value))}
            aria-invalid={refused ? true : undefined}
            aria-describedby={refused ? 'code-refused' : undefined}
          />
        </div>
        {refused ? (
          <p className="field-error" id="code-refused" role="alert">
            {refused}
          </p>
        ) : null}
        {notice ? (
          <p className="field-notice" role="status">
            {notice}
          </p>
        ) : null}
        <button type="submit" className="full after-field" disabled={busy}>
          {CODE_PAGE.submit}
        </button>
      </form>
      <div className="row-links">
        <a className="muted-link" href={signUpHref('human_check', carried, { again: true })}>
          {CODE_PAGE.differentEmail}
        </a>
        {wait > 0 ? (
          <span className="muted-link">{CODE_PAGE.newCodeIn(countdown(wait))}</span>
        ) : (
          <button type="button" className="link-button" onClick={askForAnother}>
            {CODE_PAGE.newCode}
          </button>
        )}
      </div>
    </>
  )
}
