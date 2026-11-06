import { HUMAN_CHECK_ACTIONS } from '~/domain/sign-up-attempt'
import { Centred } from '../../shell'
import { NEEDS_A_SCRIPT, REQUEST_PAGE, SUBTITLE } from './copy'
import { ForgotPasswordForm } from './form'

export const dynamic = 'force-dynamic'

export const metadata = { title: REQUEST_PAGE.title }

/**
 * Asking for a reset link (Exponential launch, ticket 22; mock-up 6's `f1-request.html`
 * and `f2-sent.html`). It asks for one thing, an email address, behind Turnstile, and
 * no session is consulted: somebody here has lost their way into one.
 */
export default function ForgotPasswordPage() {
  return (
    <Centred subtitle={SUBTITLE} botanical>
      <noscript>
        <p className="notice">{NEEDS_A_SCRIPT}</p>
      </noscript>
      <ForgotPasswordForm
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}
        action={HUMAN_CHECK_ACTIONS.forgotPassword}
      />
    </Centred>
  )
}
