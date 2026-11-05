import Link from 'next/link'
import { testCheckInQuestion } from '~/domain/outbound-copy'
import { stepsDoneOf, tourIsDone } from '~/domain/onboarding'
import { upcomingOfficeHours } from '~/domain/office-hours'
import type { SignedInAdmin } from '~/service/ports'
import { NEXT_OFFICE_HOURS, speakWithTheTeamLine } from '../../help/office-hours'
import { WELCOME_VIDEO_TITLE, WELCOME_VIDEO_URL } from '../../help/setup-videos'
import { VideoCamera } from '../../icons'
import { setupCount, setupPercent } from '../../setup-meter-copy'
import { TOUR_ADDRESS } from './addresses'
import {
  EDIT_SETTINGS,
  EDIT_SETTINGS_ADDRESS,
  EYEBROW,
  FOOT,
  onboardingTitle,
  TEAM_CARD,
  TEST_CARD_TITLE,
  TOUR_CARD,
  WELCOME_EYEBROW,
  welcomeLede,
  welcomeTitle,
  WHAT_HAPPENS_NEXT,
  whatHappensNext,
} from './copy'
import { JAMES_PHOTO } from './james-photo'
import { videoPlayerFor } from './video'
import { OnboardingWindow, WelcomeVideo } from './window'

/**
 * The onboarding modal (Exponential launch, ticket 27;
 * `.lavish/onboarding/s0-welcome.html` and `s1-modal.html`). It reads nothing: all of it
 * came with the page's one read, or is a file in the repo.
 *
 * The first time it opens for an Admin, James's welcome video comes first, while there is
 * one. Restart onboarding, and the end of the tour, go straight to the cards.
 */

const Tick = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

const Figure = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="24" r="12" fill="#c9b79a" />
    <path d="M8 62c2-14 12-22 24-22s22 8 24 22" fill="#c9b79a" />
  </svg>
)

export const OnboardingModal = ({
  admin,
  restarted,
  now,
  videoUrl = WELCOME_VIDEO_URL,
}: {
  readonly admin: SignedInAdmin
  readonly restarted: boolean
  readonly now: Date
  /** The repo file's address, or a test's. */
  readonly videoUrl?: string
}) => {
  const { onboarding, ministryName, setup } = admin
  const done = stepsDoneOf(setup)
  const tourDone = tourIsDone(setup)
  const officeHours = upcomingOfficeHours(NEXT_OFFICE_HOURS, now)

  const welcome =
    !restarted && !onboarding.opened && videoUrl ? (
      <>
        <p className="onb-eyebrow">{WELCOME_EYEBROW}</p>
        <h2 id="onb-title" className="onb-title">
          {welcomeTitle(admin.fullName)}
        </h2>
        <p className="onb-lede">{welcomeLede(ministryName)}</p>
        <WelcomeVideo title={WELCOME_VIDEO_TITLE} player={videoPlayerFor(videoUrl)} />
      </>
    ) : null

  const cards = (
    <>
      <p className="onb-eyebrow">{EYEBROW}</p>
      <h2 id="onb-title" className="onb-title">
        {onboardingTitle(ministryName)}
      </h2>
      <div className="onb-progress">
        <div className="mini" aria-hidden="true">
          <div style={{ width: `${setupPercent(done)}%` }} />
        </div>
        <span>{setupCount(done)}</span>
      </div>

      <div className="onb-cards">
        <article className={tourDone ? 'onb-card is-done' : 'onb-card'}>
          <div className="thumb thumb-shot" aria-hidden="true">
            <img src="/tour/overview.png" alt="" />
          </div>
          <h3>
            {tourDone ? <Tick /> : null}
            {TOUR_CARD.title}
          </h3>
          <p>{TOUR_CARD.body}</p>
          <Link className={tourDone ? 'btn sec onb-go' : 'btn onb-go'} href={TOUR_ADDRESS} prefetch={false}>
            {tourDone ? TOUR_CARD.again : TOUR_CARD.start}
          </Link>
        </article>

        {/* The card's sentence, its agreement, its Verify step and its button are ticket
            28's, and go here above the foot of the card. */}
        <article className="onb-card test">
          <div className="thumb thumb-phone" aria-hidden="true">
            <div className="mini-phone">
              <div className="notch" />
              <p className="bubble">
                {testCheckInQuestion({
                  ministryName: onboarding.readsAs,
                  leaderNoun: onboarding.leaderNoun,
                  participantNoun: onboarding.participantNoun,
                })}
              </p>
            </div>
          </div>
          <h3>{TEST_CARD_TITLE}</h3>
        </article>

        <article className="onb-card">
          <div className="thumb thumb-james" aria-hidden="true">
            <div className="photo">{JAMES_PHOTO ? <img src={JAMES_PHOTO} alt="" /> : <Figure />}</div>
            <span className="live">
              <VideoCamera />
              {TEAM_CARD.zoom}
            </span>
          </div>
          <h3>{TEAM_CARD.title}</h3>
          <p>{speakWithTheTeamLine(officeHours)}</p>
          {officeHours ? (
            <a className="btn sec onb-go" href={officeHours.link} target="_blank" rel="noopener noreferrer">
              {TEAM_CARD.join}
            </a>
          ) : null}
        </article>
      </div>

      <section className="onb-next" aria-labelledby="onb-next-h">
        <div className="onb-next-head">
          <h3 id="onb-next-h">{WHAT_HAPPENS_NEXT}</h3>
          <Link href={EDIT_SETTINGS_ADDRESS}>{EDIT_SETTINGS}</Link>
        </div>
        <ul>
          {whatHappensNext(onboarding).map((line) => (
            <li key={line}>
              <Tick />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="onb-foot">{FOOT}</p>
    </>
  )

  return <OnboardingWindow welcome={welcome} cards={cards} firstOpening={!onboarding.opened} />
}
