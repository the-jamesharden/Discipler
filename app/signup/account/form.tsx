'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '~/domain/consent'
import { SIGN_UP_TIMEZONE_BEFORE_ASKING, signUpTimezones } from '../../timezones'
import { loadTurnstile, widgetSizeFor } from '../../turnstile-widget'
import {
  ACCOUNT_PAGE,
  ALREADY_HAS_AN_ACCOUNT,
  OPENING_REFUSALS,
  SIGN_IN,
  type AccountPrices,
} from '../copy'
import { canStartFreeTrial, signUpHref, stepAfterOpenRefusal } from '../flow'
import { postToSignUp } from '../post'

type RefusedField = 'churchName' | 'fullName' | 'password' | 'timezone' | 'form'

/** Which field a refusal is about, so the sentence sits under it. */
const fieldOf = (refusal: string | null): RefusedField => {
  if (refusal === 'signup.church_name_needed') return 'churchName'
  if (refusal === 'signup.full_name_needed') return 'fullName'
  if (refusal?.startsWith('account.password_')) return 'password'
  if (refusal === 'signup.bad_timezone') return 'timezone'
  return 'form'
}

/** The device's zone, or null where it has none worth believing. */
const zoneOfThisDevice = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/**
 * The form on "Set up your account" (Exponential launch, ticket 17).
 *
 * Turnstile runs when the button is pressed and not when the page opens, because a token
 * lasts about five minutes and this form can take longer. The button turns off at that
 * press, so a browser sends one request. A refusal keeps what was typed, apart from a
 * refused password.
 *
 * **Ticket 19's church-plant block goes between Timezone and "How would you like to
 * pay?"**, where the comment below marks it, and its required fields join
 * `canStartFreeTrial`.
 */
export const AccountForm = ({
  email,
  heardChoices,
  heardFromLink,
  shortestPassword,
  prices,
  siteKey,
  action,
  code,
  carried,
}: {
  readonly email: string
  readonly heardChoices: readonly { readonly value: string; readonly label: string }[]
  /** What a link said about where they heard, which they may change. */
  readonly heardFromLink: string | null
  readonly shortestPassword: number
  readonly prices: AccountPrices
  readonly siteKey: string | null
  /** `HUMAN_CHECK_ACTIONS.openChurch`, handed in so the page and the service name one word. */
  readonly action: string
  /** The code the address carried, as it came, for the church's row. */
  readonly code: string | null
  readonly carried: string
}) => {
  const [churchName, setChurchName] = useState('')
  const [fullName, setFullName] = useState('')
  const [heardFrom, setHeardFrom] = useState(heardFromLink ?? '')
  const [password, setPassword] = useState('')
  const [timezone, setTimezone] = useState(SIGN_UP_TIMEZONE_BEFORE_ASKING)
  const [browserZone, setBrowserZone] = useState<string | null>(null)
  const [cycle, setCycle] = useState<'month' | 'year'>('month')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<{ readonly refusal: string | null; readonly message: string } | null>(null)

  const host = useRef<HTMLDivElement>(null)
  // A ref as well as `busy`, because a second click can land before `busy` has rendered.
  const pressed = useRef(false)

  // After the first paint, because the server cannot know, and Eastern is what shows
  // until then, so the field is never empty.
  useEffect(() => {
    const zone = zoneOfThisDevice()
    if (!zone) return
    setBrowserZone(zone)
    setTimezone(zone)
  }, [])

  const passTheCheck = async (): Promise<{ readonly token: string; readonly done: () => void }> => {
    if (!siteKey) throw new Error('No site key')
    await loadTurnstile()
    const { turnstile } = window
    if (!turnstile || !host.current) throw new Error('Turnstile did not load')
    const drawnIn = host.current

    return new Promise((resolve, reject) => {
      const widget = turnstile.render(drawnIn, {
        sitekey: siteKey,
        action,
        execution: 'execute',
        // It shows itself only if Cloudflare needs somebody to press something.
        appearance: 'interaction-only',
        theme: 'light',
        size: widgetSizeFor(drawnIn),
        retry: 'never',
        // A token is good once, so the widget goes as soon as it has been answered.
        callback: (token) => resolve({ token, done: () => widget && turnstile.remove(widget) }),
        'error-callback': () => {
          if (widget) turnstile.remove(widget)
          reject(new Error('Turnstile failed'))
          return true
        },
        'timeout-callback': () => {
          if (widget) turnstile.remove(widget)
          reject(new Error('Turnstile timed out'))
        },
        'unsupported-callback': () => reject(new Error('Turnstile is unsupported')),
      })
      if (widget) turnstile.execute(widget)
      else reject(new Error('Turnstile drew nothing'))
    })
  }

  const ready = canStartFreeTrial({ churchName, fullName, password, agreedToTerms }, shortestPassword)

  const start = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || pressed.current) return
    pressed.current = true
    setBusy(true)
    setRefused(null)

    const giveBack = (refusal: string | null, message: string) => {
      setRefused({ refusal, message })
      pressed.current = false
      setBusy(false)
    }

    let check: Awaited<ReturnType<typeof passTheCheck>>
    try {
      check = await passTheCheck()
    } catch {
      giveBack('signup.not_human', OPENING_REFUSALS['signup.not_human'])
      return
    }

    const answer = await postToSignUp<{ next: string }>('/signup/open-church', {
      humanToken: check.token,
      churchName,
      fullName,
      heardFrom,
      password,
      timezone,
      cycle,
      agreedToTerms: agreedToTerms ? 'yes' : 'no',
      code: code ?? '',
    })
    check.done()

    if (answer.ok) {
      window.location.assign(answer.body.next)
      return
    }
    const next = stepAfterOpenRefusal(answer.refusal)
    if (next) {
      window.location.assign(signUpHref(next.step, carried, { again: next.again }))
      return
    }
    if (fieldOf(answer.refusal) === 'password') setPassword('')
    giveBack(answer.refusal, answer.message)
  }

  const refusedField = refused ? fieldOf(refused.refusal) : null
  const describedBy = (field: RefusedField, hint?: string) =>
    [refusedField === field ? `refused-${field}` : null, hint].filter(Boolean).join(' ') || undefined

  const refusalFor = (field: RefusedField) =>
    refused && refusedField === field ? (
      <p className="field-error" id={`refused-${field}`} role="alert">
        {refused.refusal === 'account.already_exists' ? (
          <>
            {ALREADY_HAS_AN_ACCOUNT.before}
            <a href="/login">{ALREADY_HAS_AN_ACCOUNT.signIn}</a>
            {ALREADY_HAS_AN_ACCOUNT.between}
            <a href={signUpHref('human_check', carried, { again: true })}>{ALREADY_HAS_AN_ACCOUNT.startAgain}</a>
            {ALREADY_HAS_AN_ACCOUNT.after}
          </>
        ) : (
          refused.message
        )}
      </p>
    ) : null

  return (
    <form onSubmit={start} noValidate>
      <div className="field">
        <label className="label" htmlFor="churchName">
          {ACCOUNT_PAGE.churchName} <span className="req">*</span>
        </label>
        <input
          id="churchName"
          name="churchName"
          type="text"
          autoComplete="organization"
          value={churchName}
          onChange={(event) => setChurchName(event.target.value)}
          aria-invalid={refusedField === 'churchName' ? true : undefined}
          aria-describedby={describedBy('churchName')}
        />
        {refusalFor('churchName')}
      </div>

      <div className="field">
        <label className="label" htmlFor="fullName">
          {ACCOUNT_PAGE.fullName} <span className="req">*</span>
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          aria-invalid={refusedField === 'fullName' ? true : undefined}
          aria-describedby={describedBy('fullName')}
        />
        {refusalFor('fullName')}
      </div>

      <div className="field">
        <label className="label" htmlFor="heardFrom">
          {ACCOUNT_PAGE.heardAboutUs} <span className="opt-tag">{ACCOUNT_PAGE.optional}</span>
        </label>
        <select id="heardFrom" name="heardFrom" value={heardFrom} onChange={(event) => setHeardFrom(event.target.value)}>
          <option value="">{ACCOUNT_PAGE.chooseOne}</option>
          {heardChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="label" htmlFor="loginEmail">
          {ACCOUNT_PAGE.loginEmail}
        </label>
        <div className="locked-wrap">
          <input
            id="loginEmail"
            className="locked"
            type="email"
            autoComplete="username"
            value={email}
            readOnly
            tabIndex={-1}
          />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="password">
          {ACCOUNT_PAGE.password(shortestPassword)} <span className="req">*</span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={refusedField === 'password' ? true : undefined}
          aria-describedby={describedBy('password', 'password-hint')}
        />
        {refusalFor('password')}
        <p className="hint" id="password-hint">
          {ACCOUNT_PAGE.passwordHint(shortestPassword)}
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="timezone">
          {ACCOUNT_PAGE.timezone} <span className="opt-tag">{ACCOUNT_PAGE.optional}</span>
        </label>
        <select
          id="timezone"
          name="timezone"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          aria-invalid={refusedField === 'timezone' ? true : undefined}
          aria-describedby={describedBy('timezone', 'timezone-hint')}
        >
          {signUpTimezones(browserZone).map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.zones.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {zone.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {refusalFor('timezone')}
        <p className="hint" id="timezone-hint">
          {ACCOUNT_PAGE.timezoneHint}
        </p>
      </div>

      {/* Ticket 19's church-plant block goes here. */}

      <fieldset>
        <legend className="plain">
          {ACCOUNT_PAGE.howToPay} <span className="req">*</span>
        </legend>
        <div className="choices stack account-cycle">
          <label className="option">
            <input
              type="radio"
              name="cycle"
              value="month"
              checked={cycle === 'month'}
              onChange={() => setCycle('month')}
            />
            <span className="option-title">{ACCOUNT_PAGE.monthly}</span>
            <span className="option-desc">{prices.month}</span>
          </label>
          <label className="option">
            <input
              type="radio"
              name="cycle"
              value="year"
              checked={cycle === 'year'}
              onChange={() => setCycle('year')}
            />
            <span className="option-title">
              {ACCOUNT_PAGE.yearly} <span className="save">{ACCOUNT_PAGE.save}</span>
            </span>
            <span className="option-desc">{prices.year}</span>
          </label>
        </div>
      </fieldset>

      <label className="check account-terms">
        <input
          name="agreedToTerms"
          type="checkbox"
          checked={agreedToTerms}
          onChange={(event) => setAgreedToTerms(event.target.checked)}
        />
        <span>
          {ACCOUNT_PAGE.agreeBefore}
          {/* In a new tab, so reading one does not cost a half-filled form. */}
          <a href={TERMS_OF_SERVICE_URL} target="_blank" rel="noopener noreferrer">
            {ACCOUNT_PAGE.terms}
          </a>
          {ACCOUNT_PAGE.agreeBetween}
          <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
            {ACCOUNT_PAGE.privacy}
          </a>
          {ACCOUNT_PAGE.agreeAfter} <span className="req">*</span>
        </span>
      </label>

      <div ref={host} className="opening-check" />
      {refusalFor('form')}
      <button type="submit" className="full account-start" disabled={!ready || busy}>
        {ACCOUNT_PAGE.submit}
      </button>
      <p className="under-button">{prices.underTheButton}</p>
    </form>
  )
}
