import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingModal } from '../../app/overview/onboarding/modal'
import { welcomeTitle, whatHappensNext } from '../../app/overview/onboarding/copy'
import { videoPlayerFor } from '../../app/overview/onboarding/video'
import { speakWithTheTeamLine } from '../../app/help/office-hours'
import { SETUP_VIDEOS, WELCOME_VIDEO_URL } from '../../app/help/setup-videos'
import { REMINDER_AFTER_HOURS } from '~/domain/check-in'
import { INVITATION_LIFETIME_DAYS } from '~/domain/invitations'
import { ACCEPTANCE_ESCALATION_DAYS, ACCEPTANCE_REMINDER_DAYS } from '~/domain/relationships'
import { onboardingOf, stepsDoneOf, tourIsDone } from '~/domain/onboarding'
import { SETUP_STEPS, type SetupMeter, type SetupStep } from '~/domain/setup-meter'
import type { SignedInAdmin } from '~/service/ports'

/**
 * The onboarding modal as the server draws it, in the words of `.lavish/onboarding`, which
 * are James's (Exponential launch, ticket 27). When it opens and what it records is
 * `tests/integration/the-onboarding-over-http.test.ts`.
 */

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) =>
    createElement('a', { href, className }, children as never),
}))

const meter = (done: readonly SetupStep[]): SetupMeter => ({
  shown: true,
  done,
  unseen: [],
  checkIn: { day: 1, hour: 9 },
})

const anAdmin = (over: Partial<SignedInAdmin> = {}): SignedInAdmin =>
  ({
    userId: 'u',
    ministryId: 'm',
    ministryName: 'Riverside Chapel',
    fullName: 'Grace Adeyemi',
    personId: null,
    whatsNewDismissed: [],
    billing: {},
    setup: meter([]),
    onboarding: {
      opened: false,
      checkIn: { day: 1, hour: 9 },
      leaderNoun: 'mentor',
      participantNoun: 'mentee',
      readsAs: 'Riverside Chapel',
    },
    ...over,
  }) as SignedInAdmin

const drawn = (over: Partial<SignedInAdmin> = {}, props: { restarted?: boolean; videoUrl?: string } = {}) =>
  renderToStaticMarkup(
    createElement(OnboardingModal, {
      admin: anAdmin(over),
      restarted: props.restarted ?? false,
      now: new Date('2026-11-04T12:00:00Z'),
      videoUrl: props.videoUrl ?? '',
    }),
  )

const wordsOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const VIDEO = 'https://www.loom.com/share/abc123'

describe('what happens next', () => {
  const settings = { checkIn: { day: 1, hour: 9 }, leaderNoun: 'mentor', participantNoun: 'mentee' }

  it('reads as the mock-up reads, for a church on the mock-up settings', () => {
    expect(whatHappensNext(settings)).toEqual([
      'Every Monday at 9am, each mentor is texted to ask whether they met with each mentee this week, and how it went.',
      "A mentor who hasn't replied in 24 hours is asked once more, then left until next week.",
      'A concern goes straight to your Follow-Up tab, with what the mentor wrote.',
      'When you pair two people, the mentor is texted a link to accept. It works for 14 days.',
      "A mentor who hasn't accepted in 2 days gets a reminder. After 5 days it shows on your Follow-Up tab.",
      'Discipler only texts people who filled in your Intake form, and anyone can reply STOP.',
    ])
  })

  it("follows the church's check-in day, hour and words", () => {
    const lines = whatHappensNext({
      checkIn: { day: 4, hour: 19 },
      leaderNoun: 'shepherd',
      participantNoun: 'sheep',
    })
    expect(lines[0]).toBe(
      'Every Thursday at 7pm, each shepherd is texted to ask whether they met with each sheep this week, and how it went.',
    )
    expect(lines.join(' ')).not.toContain('mentor')
  })

  it('states the constants the product runs on, and never a typed number', () => {
    const lines = whatHappensNext(settings).join(' ')
    expect(lines).toContain(`in ${REMINDER_AFTER_HOURS} hours`)
    expect(lines).toContain(`for ${INVITATION_LIFETIME_DAYS} days`)
    expect(lines).toContain(`in ${ACCEPTANCE_REMINDER_DAYS} days`)
    expect(lines).toContain(`After ${ACCEPTANCE_ESCALATION_DAYS} days`)
  })
})

describe('the cards', () => {
  it('heads the modal with the church and its progress', () => {
    const words = wordsOf(drawn({ setup: meter(['check_in_time', 'roster', 'intake']) }))
    expect(words).toContain('One last thing')
    expect(words).toContain('Get Riverside Chapel running')
    expect(words).toContain('43% complete · 3 of 7')
    expect(words).toContain('Close this whenever you like. Help, then Restart onboarding, brings it back.')
  })

  it('offers the tour, and offers it again once it is done', () => {
    const before = drawn()
    expect(wordsOf(before)).toContain(
      'Take the 2-minute tour Watch Example Ministry, a church already running on Discipler, at work. Start the tour',
    )
    expect(before).toContain('href="/overview/tour"')
    expect(before).not.toContain('is-done')

    const after = drawn({ setup: meter(['tour']) })
    expect(wordsOf(after)).toContain('Take it again')
    expect(wordsOf(after)).not.toContain('Start the tour')
    expect(after).toContain('is-done')
  })

  it("shows the real first text on the phone, in the church's words", () => {
    const html = drawn({
      onboarding: {
        opened: false,
        checkIn: { day: 1, hour: 9 },
        leaderNoun: 'shepherd',
        participantNoun: 'sheep',
        readsAs: 'Pastor Dan',
      },
    })
    expect(wordsOf(html)).toContain(
      'Pastor Dan via Discipler: This is your test check-in, the same one your shepherds get. Did you meet with your sheep this week? Reply 1 for yes, 2 for no.',
    )
    expect(wordsOf(html)).toContain('Send yourself a test check-in')
  })

  it('says office hours with no Next and no button while there is no date', () => {
    const words = wordsOf(drawn())
    expect(words).toContain('Speak with the team directly! Office hours on Zoom every 2 weeks.')
    expect(words).not.toContain('Next:')
    expect(words).not.toContain('Join on Zoom')
  })

  it('words office hours with their date when there is one', () => {
    expect(
      speakWithTheTeamLine({ date: 'Thursday, November 12', time: '12pm CT', link: 'https://zoom.test' }),
    ).toBe('Office hours on Zoom every 2 weeks. Next: Thursday, November 12, at 12pm CT.')
  })

  it("links Edit settings to the check-in section", () => {
    const html = drawn()
    expect(html).toContain('href="/settings#check-in"')
    expect(wordsOf(html)).toContain('What happens next Edit settings')
  })

  it('shows a church past setup as all done, with the tour to take again', () => {
    const words = wordsOf(drawn({ setup: { shown: false } }))
    expect(words).toContain('100% complete · 7 of 7')
    expect(words).toContain('Take it again')
  })
})

describe('the welcome video', () => {
  it('comes first on the first opening, and waits for Continue', () => {
    const words = wordsOf(drawn({}, { videoUrl: VIDEO }))
    expect(words).toContain('Welcome to Discipler')
    expect(words).toContain('Welcome, Grace')
    expect(words).toContain(
      'A minute from James on what Discipler will do for Riverside Chapel, then three quick things to get you running.',
    )
    expect(words).toContain('A welcome from James · 1 min')
    expect(words).toContain('Continue')
    expect(words).toContain('You can watch it again from Help, then Setup videos.')
    expect(words).not.toContain('Get Riverside Chapel running')
  })

  it('is not there when the modal is restarted', () => {
    const words = wordsOf(drawn({}, { videoUrl: VIDEO, restarted: true }))
    expect(words).not.toContain('Welcome, Grace')
    expect(words).toContain('Get Riverside Chapel running')
  })

  it('is not there once this Admin has had their opening', () => {
    const opened = { ...anAdmin().onboarding, opened: true }
    expect(wordsOf(drawn({ onboarding: opened }, { videoUrl: VIDEO }))).not.toContain('Welcome, Grace')
  })

  it('leaves the modal opening straight to the cards while its address is empty', () => {
    expect(wordsOf(drawn())).toContain('Get Riverside Chapel running')
    expect(wordsOf(drawn())).not.toContain('Welcome to Discipler')
  })

  it('ships with no address, and is listed under Setup videos only once it has one', () => {
    // This test goes when James gives the address: `SETUP_VIDEOS` then holds it.
    expect(WELCOME_VIDEO_URL).toBe('')
    expect(SETUP_VIDEOS).toEqual([])
  })

  it('greets somebody with no name on the Roster without making one up', () => {
    expect(welcomeTitle(null)).toBe('Welcome')
    expect(welcomeTitle('  Grace  Adeyemi ')).toBe('Welcome, Grace')
  })

  it('plays what James is likely to give', () => {
    expect(videoPlayerFor('https://www.loom.com/share/abc123?sid=1')).toEqual({
      kind: 'frame',
      src: 'https://www.loom.com/embed/abc123?autoplay=1',
    })
    expect(videoPlayerFor('https://www.youtube.com/watch?v=xyz')).toEqual({
      kind: 'frame',
      src: 'https://www.youtube-nocookie.com/embed/xyz?autoplay=1&rel=0',
    })
    expect(videoPlayerFor('https://youtu.be/xyz')).toEqual({
      kind: 'frame',
      src: 'https://www.youtube-nocookie.com/embed/xyz?autoplay=1&rel=0',
    })
    expect(videoPlayerFor('https://videos.example/welcome.mp4')).toEqual({
      kind: 'file',
      src: 'https://videos.example/welcome.mp4',
    })
  })
})

describe('the part of the page it comes from', () => {
  const part = {
    opened: false,
    day: 2,
    hour: 18,
    leader_noun: 'mentor',
    participant_noun: 'mentee',
    reads_as: 'Pastor Dan',
  }

  it('reads the setup part of the document', () => {
    expect(onboardingOf({ onboarding: part })).toEqual({
      opened: false,
      checkIn: { day: 2, hour: 18 },
      leaderNoun: 'mentor',
      participantNoun: 'mentee',
      readsAs: 'Pastor Dan',
    })
  })

  it('fails loudly when a later replacement of the function has dropped it', () => {
    expect(() => onboardingOf({ finished: true })).toThrow(/no onboarding/)
  })

  it('counts an Admin who has seen the badge as all seven done', () => {
    expect(stepsDoneOf({ shown: false })).toBe(SETUP_STEPS.length)
    expect(tourIsDone({ shown: false })).toBe(true)
    expect(stepsDoneOf(meter(['tour', 'roster']))).toBe(2)
    expect(tourIsDone(meter(['roster']))).toBe(false)
  })
})
