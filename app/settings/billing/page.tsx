import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { BillingPicture } from '~/domain/billing-picture'
import { longDate, methodInWords, moneyOf, monthAndDay } from '~/domain/billing-picture'
import { getBillingReader } from '~/service/container'
import { LockGlyph, AlertGlyph } from '../../billing-banner'
import { AdminShell, NotAnAdmin } from '../../shell'
import { paymentStepOf } from '../../signup/payment/standing'
import {
  BILL_STATUS,
  billAmount,
  billDate,
  billWhat,
  BILLING,
  methodBadge,
  methodNote,
  planRowsOf,
} from './copy'
import { readBilling } from './read'

export const dynamic = 'force-dynamic'

const WhatsNext = ({ picture, timeZone, asking }: { readonly picture: BillingPicture; readonly timeZone: string; readonly asking: boolean }) => {
  if (picture.endedAt) return null
  if (picture.cancelsAt) {
    return (
      <div className="state info">
        <p>
          <strong>{BILLING.endsOn(longDate(picture.cancelsAt, timeZone))}</strong>
          {BILLING.endsNote}
        </p>
        <form method="post" action="/settings/billing/keep">
          <button type="submit" className="btn">
            {BILLING.keep}
          </button>
        </form>
      </div>
    )
  }
  if (asking && picture.onASchedule && picture.nextPayment) {
    return (
      <div className="state info">
        <p>
          <strong>{BILLING.askCancel.question(longDate(picture.nextPayment.at, timeZone))}</strong>
          {BILLING.askCancel.rest}
        </p>
        <div className="state-actions">
          <form method="post" action="/settings/billing/cancel">
            <button type="submit" className="btn">
              {BILLING.askCancel.yes}
            </button>
          </form>
          <Link href="/settings/billing">{BILLING.askCancel.no}</Link>
        </div>
      </div>
    )
  }
  if (picture.failed) {
    const { cents, on, retriesOn } = picture.failed
    return (
      <div className="state warn">
        <p>
          <strong>
            <AlertGlyph />
            {BILLING.failed(moneyOf(cents), monthAndDay(on, timeZone))}
          </strong>
          {retriesOn ? BILLING.retries(monthAndDay(retriesOn, timeZone)) : BILLING.retriesUnknown}
        </p>
        <form method="post" action="/settings/billing/open">
          <input type="hidden" name="step" value="update" />
          <button type="submit" className="btn">
            {BILLING.update}
          </button>
        </form>
      </div>
    )
  }
  return null
}

const PaymentCard = ({ picture, timeZone }: { readonly picture: BillingPicture; readonly timeZone: string }) => {
  const { method } = picture
  const badge = methodBadge(method)
  const note = methodNote(picture, timeZone)
  const ended = Boolean(picture.endedAt)
  const canCancel = !ended && !picture.cancelsAt

  return (
    <div className="card">
      <h2 className="card-title bill-title">{BILLING.paymentMethod}</h2>
      <div className="paymeth">
        <span className={badge.bank ? 'brand bank' : 'brand'}>{badge.text}</span>
        <span>
          {methodInWords(method)}
          {note ? (
            <>
              <br />
              <span className="muted">{note}</span>
            </>
          ) : null}
        </span>
      </div>
      {ended ? (
        <div className="stack-btns">
          <Link className="btn" href="/settings/billing/restart">
            {BILLING.restart}
          </Link>
        </div>
      ) : (
        <>
          <div className="stack-btns">
            <form method="post" action="/settings/billing/open">
              <input type="hidden" name="step" value="update" />
              <button type="submit" className="btn">
                {BILLING.update}
              </button>
            </form>
            {canCancel ? (
              <form method="post" action="/settings/billing/open">
                <input type="hidden" name="step" value="cancel" />
                <button type="submit" className="btn sec">
                  {BILLING.cancel}
                </button>
              </form>
            ) : null}
          </div>
          {method?.kind === 'bank' ? <p className="opens">{BILLING.bankLine}</p> : null}
          <p className="opens">
            <LockGlyph /> {canCancel && picture.onASchedule ? BILLING.opensForASchedule : BILLING.opens}
          </p>
        </>
      )}
    </div>
  )
}

/**
 * Billing (Exponential launch, ticket 33; mock-up 5's `billing-*.html`). Everything on it
 * is read from Stripe here, on the server, and Discipler keeps nothing beyond IDs. Any
 * Admin can open it, and a church billed outside Stripe has none to open.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ cancel?: string; stripe?: string }>
}) {
  const resolution = await getBillingReader().readBillingPage()

  if (resolution.status === 'not-an-admin') return <NotAnAdmin title={BILLING.title} />
  if (resolution.status === 'signed-out') redirect('/login')

  const { admin, page } = resolution
  if (admin.billing.standing === 'outside_stripe') redirect('/settings')

  const query = await searchParams
  const { timeZone, followUpCount } = page
  const read = await readBilling(admin.ministryId, new Date())
  const offerThePaymentStep = read.kind === 'none' && paymentStepOf(admin, page.signup) !== null
  // `billing-past-due.html` draws the failed payment once, in the box below and with no banner.
  const saysThePaymentFailed = read.kind === 'read' && read.picture.failed !== null && !read.picture.cancelsAt

  return (
    <AdminShell
      admin={admin}
      current={null}
      followUpCount={followUpCount}
      readOnly={false}
      saysItsOwnBilling={saysThePaymentFailed}
    >
      <div className="page-head">
        <div>
          <Link className="back" href="/settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {BILLING.back}
          </Link>
          <h1>{BILLING.title}</h1>
          <p className="lede">{BILLING.lede(admin.ministryName)}</p>
        </div>
      </div>

      {query.stripe === 'unreachable' ? (
        <p className="toast error" role="alert">
          {BILLING.couldNotOpen}
        </p>
      ) : null}

      {read.kind === 'unreachable' ? (
        <div className="card">
          <p className="empty">{BILLING.couldNotRead}</p>
        </div>
      ) : null}

      {read.kind === 'none' ? (
        <div className="card">
          <p className="empty">{BILLING.noSubscription}</p>
          {offerThePaymentStep ? (
            <p>
              <Link className="btn" href="/signup/payment">
                {BILLING.finishSignUp}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {read.kind === 'read' ? (
        <>
          <WhatsNext picture={read.picture} timeZone={timeZone} asking={query.cancel === 'ask'} />
          <div className="bill-grid">
            <div className="card">
              <h2 className="card-title bill-title">{BILLING.yourPlan}</h2>
              <dl className="plan-rows">
                {planRowsOf(read.picture, timeZone).map((row, index) => (
                  <div key={`${row.label}-${index}`} className="plan-row">
                    <dt>{row.label}</dt>
                    <dd>
                      {row.strong ? <strong>{row.strong}</strong> : null}
                      {row.then ?? null}
                      {row.pill ? <span className="plan-offer">{row.pill}</span> : null}
                      {row.note ? (
                        <>
                          <br />
                          <span className="muted">{row.note}</span>
                        </>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <PaymentCard picture={read.picture} timeZone={timeZone} />
          </div>
          <div className="card bill-bills">
            <h2 className="card-title bill-bills-title">{BILLING.pastBills}</h2>
            {read.bills.length === 0 ? (
              <p className="empty">{BILLING.noBills}</p>
            ) : (
              <>
                <div className="tbl-wrap">
                  <table className="inv">
                    <thead>
                      <tr>
                        <th>{BILLING.columns.date}</th>
                        <th>{BILLING.columns.what}</th>
                        <th className="amt">{BILLING.columns.amount}</th>
                        <th>{BILLING.columns.status}</th>
                        <th aria-label={BILLING.view} />
                      </tr>
                    </thead>
                    <tbody>
                      {read.bills.map((bill) => (
                        <tr key={`${bill.at.getTime()}-${bill.cents}`}>
                          <td>{billDate(bill, timeZone)}</td>
                          <td>{billWhat(bill, timeZone)}</td>
                          <td className="amt">{billAmount(bill)}</td>
                          <td>
                            {bill.status === 'not_paid' ? (
                              <span className="pill needs_care">{BILL_STATUS.not_paid}</span>
                            ) : (
                              BILL_STATUS[bill.status]
                            )}
                          </td>
                          <td>{bill.viewAt ? <a href={bill.viewAt}>{BILLING.view}</a> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="fine">{BILLING.viewFine}</p>
              </>
            )}
          </div>
        </>
      ) : null}
    </AdminShell>
  )
}
