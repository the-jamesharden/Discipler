import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { Cross } from '../../icons'
import { NotAnAdmin } from '../../shell'
import { RESTART_ONBOARDING, TOUR_DONE_ADDRESS } from '../onboarding/addresses'
import {
  BACK,
  CLOSE_THE_TOUR,
  DEMO,
  NEXT,
  OF_THE_STEPS,
  PHONE_OWNER,
  PHONE_WHEN,
  START_YOUR_DEMO,
  TOUR_STEPS,
  TOUR_TITLE,
} from './copy'
import { TourDriver } from './driver'
import { TOUR_PAGES, TOUR_PHONE } from './pages.generated'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: TOUR_TITLE }

/**
 * The tour (Exponential launch, ticket 27): a full-screen demo of Example Ministry, in
 * seven steps, to be watched rather than used.
 *
 * Its pages are Example Ministry's real screens, captured by `scripts/capture-tour.ts`, so
 * this reads nothing about the church watching beyond whether they are an Admin. They sit
 * in an `inert` camera, so none of them can be clicked, focused or reached by a screen
 * reader; `./play` moves them about.
 *
 * Its own page and not an `iframe` over the modal, because the security headers refuse to
 * be framed. So the close button goes back to the modal's cards by an ordinary link, and
 * Done by an ordinary form.
 */
const Arrow = ({ d }: { readonly d: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
)

export default async function TourPage() {
  const resolution = await resolveAdmin()
  if (resolution.status === 'signed-out') redirect('/login')
  if (resolution.status !== 'admin') return <NotAnAdmin title={TOUR_TITLE} />

  return (
    <div className="tour">
      <div className="tour-viewport">
        <div className="tour-camera" inert>
          <div
            className="tour-pages"
            dangerouslySetInnerHTML={{
              __html: `<div class="container botanical">${TOUR_PAGES.shell}${TOUR_PAGES.panes}</div>${TOUR_PAGES.pairModal}`,
            }}
          />
          <div className="tour-cursor">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3 2l17 9.5-7.6 1.6L9 20.5z"
                fill="#1d1d1f"
                stroke="#fff"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <a className="tour-close" href={RESTART_ONBOARDING} aria-label={CLOSE_THE_TOUR}>
        <Cross />
      </a>
      <div className="tour-bar tour-gold" role="note">
        <strong>{DEMO}</strong>
        <span className="tour-count" hidden>
          <span className="tour-count-now" /> {OF_THE_STEPS} {TOUR_STEPS.length}
        </span>
      </div>
      <div className="tour-intro">
        <button type="button" className="tour-start tour-gold">
          {START_YOUR_DEMO}
        </button>
      </div>

      <div className="tour-phone" aria-hidden="true">
        <p className="tour-phone-from">
          <strong>{PHONE_OWNER}</strong>
          {PHONE_WHEN}
        </p>
        {TOUR_PHONE.map((message, index) => (
          <p key={message} className={index % 2 === 0 ? 'tour-message in' : 'tour-message out'}>
            {message}
          </p>
        ))}
      </div>

      <button type="button" className="tour-arrow back" aria-label={BACK}>
        <Arrow d="M15 5l-7 7 7 7" />
      </button>
      <button type="button" className="tour-arrow fwd" aria-label={NEXT}>
        <span className="word">{NEXT}</span>
        <Arrow d="M9 5l7 7-7 7" />
      </button>

      <div className="tour-caption" aria-live="polite">
        <div className="tour-caption-body">
          <h2>{TOUR_STEPS[0].title}</h2>
          <p>{TOUR_STEPS[0].text}</p>
        </div>
        <div className="tour-dots">
          {TOUR_STEPS.map((step) => (
            <span key={step.title} />
          ))}
        </div>
      </div>

      <form className="tour-done" method="post" action={TOUR_DONE_ADDRESS} hidden />
      <TourDriver />
    </div>
  )
}
