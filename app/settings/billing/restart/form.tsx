'use client'

import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { Stripe, StripeExpressCheckoutElementConfirmEvent } from '@stripe/stripe-js'
import { loadStripe } from '@stripe/stripe-js/pure'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { moneyOf } from '~/domain/billing-picture'
import type { BillingCycle } from '~/domain/offers'
import type { RestartPrices } from '~/service/ports'
import { PAYMENT_PAGE } from '../../../signup/payment/copy'
import {
  ASKING_FOR_ACCESS_EVERY_MS,
  someWalletIsAvailable,
  WAITING_BEFORE_OFFERING_THE_LINK_MS,
} from '../../../signup/payment/flow'
import { ELEMENTS_LOOK } from '../../../signup/payment/form'
import { monthlyPriceWords, RESTART, twelveMonthlyWords, yearlyPriceWords } from '../copy'

const AFTER_RESTARTING = '/settings/billing'

const returnAddress = (): string => new URL('/settings/billing/restart', window.location.origin).href

type Opened = { readonly clientSecret: string | null } | { readonly refusal: string }

const open = async (cycle: BillingCycle): Promise<Opened> => {
  const response = await fetch('/settings/billing/restart/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cycle }),
  })
  return (await response.json()) as Opened
}

/** Stripe's two Elements and the button. The Subscription is made only once the form is good. */
const StripeForm = ({
  cycle,
  onDone,
}: {
  readonly cycle: BillingCycle
  readonly onDone: () => void
}) => {
  const stripe = useStripe()
  const elements = useElements()
  const [wallets, setWallets] = useState(false)
  const [formReady, setFormReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pressed = useRef(false)

  const confirm = async (): Promise<string | null> => {
    if (!stripe || !elements) return RESTART.couldNotCharge
    const { error: incomplete } = await elements.submit()
    if (incomplete) return incomplete.type === 'validation_error' ? '' : (incomplete.message ?? RESTART.couldNotCharge)

    const opened = await open(cycle).catch(() => null)
    if (!opened) return RESTART.couldNotCharge
    if ('refusal' in opened) return opened.refusal === 'restart.already_paying' ? null : RESTART.couldNotCharge
    if (opened.clientSecret === null) return null

    const { error: refused } = await stripe.confirmPayment({
      elements,
      clientSecret: opened.clientSecret,
      confirmParams: { return_url: returnAddress() },
      redirect: 'if_required',
    })
    if (!refused) return null
    if (refused.type === 'validation_error') return ''
    return refused.type === 'card_error' && refused.message ? refused.message : RESTART.couldNotCharge
  }

  const press = async (event: FormEvent) => {
    event.preventDefault()
    if (pressed.current) return
    pressed.current = true
    setBusy(true)
    setError(null)
    const words = await confirm()
    if (words === null) {
      onDone()
      return
    }
    setError(words === '' ? null : words)
    pressed.current = false
    setBusy(false)
  }

  const confirmExpress = async (event: StripeExpressCheckoutElementConfirmEvent) => {
    setError(null)
    const words = await confirm()
    if (words === null) {
      onDone()
      return
    }
    event.paymentFailed({ reason: 'fail' })
    setError(words === '' ? RESTART.couldNotCharge : words)
  }

  return (
    <form onSubmit={press} noValidate>
      <p className="hint restart-method-hint">{RESTART.methodHint}</p>
      <div className="stripe-el" aria-label="Stripe payment form">
        <div className={wallets ? 'wallets' : 'wallets wallets-none'}>
          <ExpressCheckoutElement
            options={{
              paymentMethods: {
                applePay: 'auto',
                link: 'auto',
                googlePay: 'never',
                amazonPay: 'never',
                paypal: 'never',
                klarna: 'never',
              },
              layout: { maxColumns: 2, overflow: 'never' },
            }}
            onReady={({ availablePaymentMethods }) => setWallets(someWalletIsAvailable(availablePaymentMethods))}
            onAvailablePaymentMethodsChange={({ paymentMethods }) => setWallets(someWalletIsAvailable(paymentMethods))}
            onLoadError={() => setWallets(false)}
            onConfirm={confirmExpress}
          />
        </div>
        {wallets ? <div className="or">{PAYMENT_PAGE.or}</div> : null}
        <PaymentElement
          options={{
            layout: 'tabs',
            wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
            paymentMethodOrder: ['card', 'us_bank_account'],
          }}
          onReady={() => setFormReady(true)}
        />
        <p className="by">{PAYMENT_PAGE.secured}</p>
      </div>
      {error ? (
        <p className="field-error payment-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="full" disabled={!stripe || !elements || !formReady || busy}>
        {RESTART.submit}
      </button>
      <p className="under-button">{RESTART.underTheButton}</p>
    </form>
  )
}

/** Nothing to confirm: credit covers today, so the button only has to make the Subscription. */
const CoveredForm = ({ cycle, onDone }: { readonly cycle: BillingCycle; readonly onDone: () => void }) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const press = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const opened = await open(cycle).catch(() => null)
    if (opened && (!('refusal' in opened) || opened.refusal === 'restart.already_paying')) {
      onDone()
      return
    }
    setError(RESTART.couldNotCharge)
    setBusy(false)
  }
  return (
    <form onSubmit={press}>
      {error ? (
        <p className="field-error payment-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="full" disabled={busy}>
        {RESTART.submit}
      </button>
      <p className="under-button">{RESTART.underTheButtonCovered}</p>
    </form>
  )
}

const Waiting = () => {
  const [takingLonger, setTakingLonger] = useState(false)

  useEffect(() => {
    const leaving = new AbortController()
    const timers: ReturnType<typeof setTimeout>[] = []
    const ask = async () => {
      const answer = await fetch('/settings/billing/access', { signal: leaving.signal, cache: 'no-store' })
        .then((response) => (response.ok ? (response.json() as Promise<{ hasAccess?: unknown }>) : null))
        .catch(() => null)
      if (answer?.hasAccess === true) {
        window.location.assign(AFTER_RESTARTING)
        return
      }
      if (!leaving.signal.aborted) timers.push(setTimeout(() => void ask(), ASKING_FOR_ACCESS_EVERY_MS))
    }
    void ask()
    timers.push(setTimeout(() => setTakingLonger(true), WAITING_BEFORE_OFFERING_THE_LINK_MS))
    return () => {
      leaving.abort()
      timers.forEach(clearTimeout)
    }
  }, [])

  return (
    <div role="status">
      <button type="button" className="full" disabled>
        {RESTART.finishing}
      </button>
      {takingLonger ? (
        <p className="under-button">
          {RESTART.takingLonger} <a href={AFTER_RESTARTING}>{RESTART.goToBilling}</a>
        </p>
      ) : null}
    </div>
  )
}

/**
 * The restart page's form. Elements start with no Subscription behind them, because the
 * church has not chosen monthly or yearly until it presses; the press makes it, in the
 * billing lock, and confirms its first payment. Nothing the browser sees unlocks anything:
 * waiting ends when the webhook has written that the church has access.
 */
export const RestartForm = ({
  publishableKey,
  customerSession,
  prices,
  paymentMethodTypes,
  cameBackFailed,
}: {
  readonly publishableKey: string | null
  readonly customerSession: string | null
  readonly prices: RestartPrices | null
  readonly paymentMethodTypes: readonly string[]
  readonly cameBackFailed: boolean
}) => {
  const [cycle, setCycle] = useState<BillingCycle>('month')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const stripePromise = useMemo<Promise<Stripe | null> | null>(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  )

  const fullCents = prices ? (cycle === 'month' ? prices.monthCents : prices.yearCents) : 0
  const credit = prices?.creditCents ?? 0
  const dueToday = Math.max(0, fullCents - credit)

  return (
    <>
      <fieldset className="restart-cycle" disabled={done}>
        <legend className="plain">{RESTART.legend}</legend>
        <div className="choices stack">
          <label className="option">
            <input type="radio" name="cycle" value="month" checked={cycle === 'month'} onChange={() => setCycle('month')} />
            <span className="option-title">{RESTART.monthly}</span>
            <span className="option-desc">{monthlyPriceWords} a month</span>
          </label>
          <label className="option">
            <input type="radio" name="cycle" value="year" checked={cycle === 'year'} onChange={() => setCycle('year')} />
            <span className="option-title">
              {RESTART.yearly} <span className="save">{RESTART.save}</span>
            </span>
            <span className="option-desc">
              <s className="was">{twelveMonthlyWords}</s> {yearlyPriceWords} a year
            </span>
          </label>
        </div>
      </fieldset>

      {credit > 0 && prices ? (
        <p className="hint restart-method-hint">
          {dueToday === 0 ? RESTART.creditCovers : RESTART.creditTaken(moneyOf(credit))}
        </p>
      ) : null}
      {cameBackFailed && !done ? (
        <p className="field-error payment-error" role="alert">
          {RESTART.didNotGoThrough}
        </p>
      ) : null}

      {done ? <Waiting /> : null}

      {!done && !stripePromise ? (
        <>
          <p className="field-error payment-error" role="alert">
            {RESTART.noStripe}
          </p>
          <button type="button" className="full" disabled>
            {RESTART.submit}
          </button>
          <p className="under-button">{RESTART.underTheButton}</p>
        </>
      ) : null}

      {!done && stripePromise && dueToday === 0 ? <CoveredForm cycle={cycle} onDone={() => setDone(true)} /> : null}

      {!done && stripePromise && dueToday > 0 ? (
        <Elements
          key={customerSession ?? 'no-session'}
          stripe={stripePromise}
          options={{
            mode: 'subscription',
            amount: dueToday,
            currency: 'usd',
            allowedPaymentMethodTypes: [...paymentMethodTypes],
            paymentMethodOptions: {
              us_bank_account: {
                verification_method: 'instant',
                financial_connections: { permissions: ['payment_method'] },
              },
            },
            ...(customerSession ? { customerSessionClientSecret: customerSession } : {}),
            ...ELEMENTS_LOOK,
          }}
        >
          <StripeForm cycle={cycle} onDone={() => setDone(true)} />
        </Elements>
      ) : null}
    </>
  )
}
