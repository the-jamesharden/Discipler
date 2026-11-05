import Link from 'next/link'
import type { SignedInAdmin } from '~/service/ports'
import { BILLING } from './settings/billing/copy'

/**
 * The two banners across every Admin page (Exponential launch, ticket 33; mock-up 5's
 * `overview-past-due.html` and `overview-ended.html`), under the tabs and above the setup
 * bar. Neither can be closed. They read `admin.billing`, as the webhook wrote it, so they
 * cost nothing and Stripe being away cannot hold a page up.
 */

const Glyph = ({ children }: { readonly children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const AlertGlyph = () => (
  <Glyph>
    <path d="M12 3l9.5 17h-19z" />
    <path d="M12 10v4M12 17.5v.01" />
  </Glyph>
)

export const LockGlyph = () => (
  <Glyph>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Glyph>
)

/** Whether this Admin's pages are read-only: drawn so, and the requests are refused in `middleware.ts`. */
export const isReadOnly = (admin: SignedInAdmin | undefined): boolean => admin?.billing.standing === 'ended'

export const BillingBanner = ({ admin }: { readonly admin: SignedInAdmin }) => {
  if (admin.billing.standing === 'past_due') {
    return (
      <div className="bill-banner due" role="alert">
        <p>
          <AlertGlyph />
          <strong>{BILLING.banner.due}</strong> {BILLING.banner.dueRest}
        </p>
        <form method="post" action="/settings/billing/open">
          <input type="hidden" name="step" value="update" />
          <button type="submit" className="btn small">
            {BILLING.update}
          </button>
        </form>
      </div>
    )
  }
  if (admin.billing.standing === 'ended') {
    return (
      <div className="bill-banner ended" role="status">
        <p>
          <LockGlyph />
          <strong>{BILLING.banner.ended}</strong> {BILLING.banner.endedRest}
        </p>
        <Link className="btn small" href="/settings/billing/restart">
          {BILLING.restart}
        </Link>
      </div>
    )
  }
  return null
}
