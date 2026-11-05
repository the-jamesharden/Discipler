'use client'

import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { Stripe, StripeElementsOptions, StripeExpressCheckoutElementConfirmEvent } from '@stripe/stripe-js'
import { loadStripe } from '@stripe/stripe-js/pure'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { postToSignUp } from '../post'
import { PAYMENT_PAGE, trialLine } from './copy'
import {
  AFTER_THE_PAYMENT_STEP,
  ASKING_FOR_ACCESS_EVERY_MS,
  someWalletIsAvailable,
  stepAfterOpening,
  trialEndsOn,
  WAITING_BEFORE_OFFERING_THE_LINK_MS,
  type OpenedTrial,
  type PaymentStep,
} from './flow'

/** The site's own look, as far as Stripe's frames can wear it. */
export const ELEMENTS_LOOK: Pick<StripeElementsOptions, 'appearance' | 'fonts'> = {
  appearance: {
    theme: 'stripe',
    variables: {
      colorPrimary: '#2d5016',
      colorText: '#2d2d2d',
      colorDanger: '#a4342a',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      borderRadius: '6px',
    },
  },
  fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap' }],
}

/** Where a method that must leave the page comes back to: this page, which asks the server again. */
const returnAddress = (): string => new URL('/signup/payment', window.location.origin).href

/**
 * Stripe's two Elements and the button, in one Elements group as Stripe's guide has it.
 * The confirming is here; what it means is the webhook's.
 */
const StripeForm = ({
  prefill,
  onConfirmed,
  hidden,
}: {
  readonly prefill: { readonly name: string | null; readonly email: string | null }
  readonly onConfirmed: () => void
  readonly hidden: boolean
}) => {
  const stripe = useStripe()
  const elements = useElements()
  const [wallets, setWallets] = useState(false)
  const [formReady, setFormReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A ref as well as `busy`, because a second click can land before `busy` has rendered.
  const pressed = useRef(false)

  /** What both ways of confirming share. Answers the words to show, or null. */
  const confirm = async (): Promise<string | null> => {
    if (!stripe || !elements) return PAYMENT_PAGE.couldNotSave
    const { error: incomplete } = await elements.submit()
    // Stripe draws what is wrong with the form inside its own frame.
    if (incomplete) return incomplete.type === 'validation_error' ? '' : (incomplete.message ?? PAYMENT_PAGE.couldNotSave)

    const { error: refused } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: returnAddress() },
      redirect: 'if_required',
    })
    if (!refused) return null
    if (refused.type === 'validation_error') return ''
    // Stripe's message is meant for this person for a card or bank that said no, and
    // anything else is not for them to read.
    return refused.type === 'card_error' && refused.message ? refused.message : PAYMENT_PAGE.couldNotSave
  }

  const press = async (event: FormEvent) => {
    event.preventDefault()
    if (pressed.current) return
    pressed.current = true
    setBusy(true)
    setError(null)

    const words = await confirm()
    if (words === null) {
      onConfirmed()
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
      onConfirmed()
      return
    }
    event.paymentFailed({ reason: 'fail' })
    setError(words === '' ? PAYMENT_PAGE.couldNotSave : words)
  }

  return (
    <form onSubmit={press} noValidate hidden={hidden}>
      <div className="stripe-el" aria-label="Stripe payment form">
        {/* Kept in the layout while it has nothing to show, because Stripe measures it to draw it. */}
        <div className={wallets ? 'wallets' : 'wallets wallets-none'}>
          <ExpressCheckoutElement
            options={{
              // Apple Pay and Link and nothing else, as the spec lists them.
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
            // The card and bank form below goes on working without it.
            onLoadError={() => setWallets(false)}
            onConfirm={confirmExpress}
          />
        </div>
        {wallets ? <div className="or">{PAYMENT_PAGE.or}</div> : null}
        <PaymentElement
          options={{
            layout: 'tabs',
            // Shown above, by the Express Checkout Element, so not twice.
            wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
            paymentMethodOrder: ['card', 'us_bank_account'],
            defaultValues: {
              billingDetails: {
                ...(prefill.name ? { name: prefill.name } : {}),
                ...(prefill.email ? { email: prefill.email } : {}),
              },
            },
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
        {PAYMENT_PAGE.submit}
      </button>
      <p className="under-button">{PAYMENT_PAGE.underTheButton}</p>
    </form>
  )
}

/** Whether the church has access yet, as the webhook wrote it. A failed read is "not yet". */
const askForAccess = async (signal: AbortSignal): Promise<boolean> => {
  try {
    const response = await fetch('/signup/payment/access', { signal, cache: 'no-store' })
    if (!response.ok) return false
    const body = (await response.json()) as { hasAccess?: unknown }
    return body.hasAccess === true
  } catch {
    return false
  }
}

/** The button's waiting state: asks until the webhook has landed, and offers a way on past 30 seconds. */
const Waiting = () => {
  const [takingLonger, setTakingLonger] = useState(false)

  useEffect(() => {
    const leaving = new AbortController()
    const timers: ReturnType<typeof setTimeout>[] = []

    const ask = async () => {
      if (await askForAccess(leaving.signal)) {
        window.location.assign(AFTER_THE_PAYMENT_STEP)
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
        {PAYMENT_PAGE.finishing}
      </button>
      {takingLonger ? (
        <p className="under-button">
          {PAYMENT_PAGE.takingLonger} <a href={AFTER_THE_PAYMENT_STEP}>{PAYMENT_PAGE.goToOverview}</a>
        </p>
      ) : null}
    </div>
  )
}

/**
 * The payment step (Exponential launch, ticket 18; mock-up 1's `s5-checkout.html`).
 *
 * It posts the church's stored choice to `/signup/payment/open`, which decides
 * everything else on the server, and gives the answer's client secret to Stripe's
 * Elements. A method that had to leave the page comes back here, and arriving asks the
 * server again whatever the address says, so a return address holds no power.
 */
export const PaymentForm = ({
  cycle,
  code,
  timeZone,
  prefill,
  cameBackFailed,
}: {
  readonly cycle: string
  readonly code: string | null
  readonly timeZone: string
  readonly prefill: { readonly name: string | null; readonly email: string | null }
  readonly cameBackFailed: boolean
}) => {
  const [step, setStep] = useState<PaymentStep>({ kind: 'opening' })
  const [confirmed, setConfirmed] = useState(false)

  const open = useCallback(async () => {
    setStep({ kind: 'opening' })
    setStep(stepAfterOpening(await postToSignUp<OpenedTrial>('/signup/payment/open', { cycle, code: code ?? '' })))
  }, [cycle, code])

  useEffect(() => {
    // What Stripe added to the address has been read, and must not outlive a reload.
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
    void open()
  }, [open])

  const publishableKey = step.kind === 'form' ? step.publishableKey : null
  const stripePromise = useMemo<Promise<Stripe | null> | null>(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  )

  const waiting = step.kind === 'waiting' || confirmed

  return (
    <>
      <h2 className="payment-heading">{PAYMENT_PAGE.title}</h2>
      {step.kind === 'form' ? (
        <p className="hint payment-lead">{trialLine(trialEndsOn(step.trialEndsAt, timeZone))}</p>
      ) : step.kind === 'refused' && !step.canTryAgain ? null : (
        // Not above a refusal that is final: that church is not about to be charged or not.
        <p className="hint payment-lead">{PAYMENT_PAGE.notCharged}</p>
      )}

      {step.kind === 'form' && step.codeRefusal && !waiting ? (
        <p className="field-notice payment-notice" role="status">
          {step.codeRefusal.message}
        </p>
      ) : null}
      {cameBackFailed && step.kind === 'form' && !waiting ? (
        <p className="field-error payment-error" role="alert">
          {PAYMENT_PAGE.didNotGoThrough}
        </p>
      ) : null}

      {step.kind === 'opening' ? (
        <>
          <div className="stripe-el stripe-el-opening" aria-busy="true" />
          <button type="button" className="full" disabled>
            {PAYMENT_PAGE.submit}
          </button>
          <p className="under-button">{PAYMENT_PAGE.underTheButton}</p>
        </>
      ) : null}

      {step.kind === 'refused' ? (
        <>
          <p className="field-error payment-error" role="alert">
            {step.message}
          </p>
          {step.canTryAgain ? (
            <button type="button" className="full" onClick={() => void open()}>
              {PAYMENT_PAGE.tryAgain}
            </button>
          ) : null}
        </>
      ) : null}

      {step.kind === 'form' && stripePromise ? (
        <Elements stripe={stripePromise} options={{ clientSecret: step.clientSecret, ...ELEMENTS_LOOK }}>
          <StripeForm prefill={prefill} onConfirmed={() => setConfirmed(true)} hidden={waiting} />
        </Elements>
      ) : null}

      {waiting ? <Waiting /> : null}
    </>
  )
}
