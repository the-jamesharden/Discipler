import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readPageDocument } from '~/platform/supabase/page'
import { SETUP_HISTORY, SETUP_STEPS } from '~/domain/setup-meter'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  addPerson,
  publishSupabaseCredentials,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, signInAs as signInWith, skipUnlessAppIsRunning } from '../support/app'

/**
 * The onboarding modal and the tour (Exponential launch, ticket 27), through the pages and
 * routes an Admin uses. What the modal says in each state is
 * `tests/app/the-onboarding-modal.test.ts`, and what the tour plays was looked at in a browser.
 */

const SEEN = '/settings/setup-seen'
const RESTART = '/overview?onboarding=cards'
const TOUR = '/overview/tour'
const DONE = '/overview/tour/done'

const modalOf = (html: string): string | null => {
  const start = html.indexOf('class="modal-bg open onb-bg"')
  return start === -1 ? null : html.slice(start, html.indexOf('onb-foot', start))
}

const clean = (html: string) => html.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'")

describe.skipIf(skipUnlessAppIsRunning)('the onboarding', () => {
  let pool: pg.Pool

  beforeAll(() => {
    publishSupabaseCredentials()
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl, max: 2 })
  })

  afterAll(async () => {
    await pool.end()
  })

  const post = (path: string, cookie: string, fields: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    })

  const tell = (cookie: string) => post(SEEN, cookie, { onboarding: 'yes', stay: 'yes' })

  const tourEvents = async (ministry: MinistryFixture) => {
    const { rows } = await pool.query<{ payload: { finishedBy: string } }>(
      'select payload from ministry_event where ministry_id = $1 and type = $2',
      [ministry.id, SETUP_HISTORY.tourFinished],
    )
    return rows
  }

  const openedAt = async (ministry: MinistryFixture, userId: string) => {
    const { rows } = await pool.query<{ onboarding_opened_at: Date | null }>(
      'select onboarding_opened_at from ministry_member where ministry_id = $1 and user_id = $2',
      [ministry.id, userId],
    )
    return rows[0]!.onboarding_opened_at
  }

  describe('an Admin of a church that has just opened', () => {
    let ministry: MinistryFixture
    let cookie: string

    beforeEach(async () => {
      ministry = await createMinistryWithAdmin('Riverside Chapel', 'Grace Adeyemi')
      cookie = (await signIn(ministry)).cookie
    })

    it('opens over the Overview on their first sign-in, and over nothing else', async () => {
      const { html } = await getPage('/overview', cookie)
      const modal = modalOf(html)

      expect(modal).not.toBeNull()
      expect(clean(modal!)).toContain('Get Riverside Chapel running')
      expect(clean(modal!)).toContain('0% complete · 0 of 7')
      expect(clean(modal!)).toContain('aria-label="Close"')
      // Works with no script: the close button is a link.
      expect(modal).toContain('href="/overview"')

      for (const path of ['/roster', '/check-ins', '/settings']) {
        expect(modalOf((await getPage(path, cookie)).html), path).toBeNull()
      }
    })

    it('does not open over a card an Admin has asked for', async () => {
      const a = await addPerson(ministry, 'Mark Wilson')
      const b = await addPerson(ministry, 'Jordan Ellis')
      const relationship = await pairOneToOne(ministry, a, b)

      expect(modalOf((await getPage(`/overview?card=${relationship}`, cookie)).html)).toBeNull()
    })

    it('is said to have opened once, by the page, and the Overview then leaves it shut', async () => {
      expect(await openedAt(ministry, ministry.adminUserId)).toBeNull()
      // Reading the page writes nothing: only the script that has opened it says so.
      await getPage('/overview', cookie)
      expect(await openedAt(ministry, ministry.adminUserId)).toBeNull()

      expect((await tell(cookie)).status).toBe(204)
      const first = await openedAt(ministry, ministry.adminUserId)
      expect(first).not.toBeNull()

      expect(modalOf((await getPage('/overview', cookie)).html)).toBeNull()

      await tell(cookie)
      expect(await openedAt(ministry, ministry.adminUserId)).toEqual(first)
    })

    it('Restart onboarding brings it back at the same progress', async () => {
      await tell(cookie)
      await addPerson(ministry, 'Mark Wilson')

      const { html } = await getPage(RESTART, cookie)

      expect(clean(modalOf(html)!)).toContain('29% complete · 2 of 7')
      expect(html).toContain('href="/overview?onboarding=cards"')
    })

    it('anything else in the address does not bring it back', async () => {
      await tell(cookie)
      expect(modalOf((await getPage('/overview?onboarding=yes', cookie)).html)).toBeNull()
    })

    it("changes its checklist with the church's check-in hour, and its words", async () => {
      await tell(cookie)
      const before = clean(modalOf((await getPage(RESTART, cookie)).html)!)
      expect(before).toContain('Every Monday at 9am, each mentor is texted')

      await pool.query(
        `update ministry set checkin_day = 3, checkin_hour = 15, leader_noun = 'shepherd', from_name = 'Pastor Dan' where id = $1`,
        [ministry.id],
      )
      const after = clean(modalOf((await getPage(RESTART, cookie)).html)!)
      expect(after).toContain('Every Wednesday at 3pm, each shepherd is texted')
      expect(after).toContain('Pastor Dan via Discipler: This is your test check-in, the same one your shepherds get.')
    })

    it('leaves the tour unticked until Done', async () => {
      const opened = await getPage(TOUR, cookie)
      expect(opened.response.status).toBe(200)
      expect(await tourEvents(ministry)).toEqual([])
      expect(clean(modalOf((await getPage('/overview', cookie)).html)!)).toContain('0% complete · 0 of 7')

      const done = await post(DONE, cookie)

      expect(done.status).toBe(303)
      expect(done.headers.get('location')).toContain(RESTART)
      expect(await tourEvents(ministry)).toEqual([{ payload: { finishedBy: ministry.adminUserId } }])

      const { html } = await getPage(RESTART, cookie)
      expect(clean(modalOf(html)!)).toContain('14% complete · 1 of 7')
      expect(clean(modalOf(html)!)).toContain('Take it again')
      expect(html).toContain('data-step="tour" class="step done')
    })

    it('shows the tour on a page that is Example Ministry and not their own', async () => {
      const { html } = await getPage(TOUR, cookie)

      expect(html).toContain('Example Ministry')
      expect(html).toContain('Start your demo')
      expect(html).toContain('class="tour-camera" inert')
      expect(html).not.toContain('Riverside Chapel')
      expect(html).not.toContain('Grace Adeyemi')
      expect(html).toContain('Grace Lee')
    })

    it('closes the tour back to the cards, with no Done', async () => {
      const { html } = await getPage(TOUR, cookie)
      expect(html).toContain('class="tour-close" href="/overview?onboarding=cards"')
    })

    it('sends the crop of Overview to a file that exists', async () => {
      expect((await fetch(`${baseUrl}/tour/overview.png`)).status).toBe(200)
    })
  })

  describe('two Admins of one church', () => {
    it('opens once for each, and one finishing the tour ticks it for both', async () => {
      const ministry = await createMinistryWithAdmin('Hope Church', 'Ana Silva')
      const second = await addPersonWithAccount(ministry, 'Ben Rowe', 'admin')
      const firstCookie = (await signIn(ministry)).cookie
      const secondCookie = (await signInWith({ phone: second.phone, password: second.password })).cookie

      await tell(firstCookie)

      expect(modalOf((await getPage('/overview', firstCookie)).html)).toBeNull()
      expect(modalOf((await getPage('/overview', secondCookie)).html)).not.toBeNull()

      await post(DONE, secondCookie)
      expect(await tourEvents(ministry)).toEqual([{ payload: { finishedBy: second.userId } }])
      expect(clean(modalOf((await getPage(RESTART, firstCookie)).html)!)).toContain('29% complete · 2 of 7')
    })
  })

  describe('a church from before launch', () => {
    it("opens for its Admin at the church's real progress, with nothing backfilled", async () => {
      const ministry = await createMinistryWithAdmin('SAU BCM', 'Dana Cole')
      const cookie = (await signIn(ministry)).cookie
      await pool.query(
        `insert into ministry_event (ministry_id, occurred_at, type, subject_type, subject_id, payload)
         values ($1, now(), 'ministry.settings_changed', 'ministry', $1, '{}')`,
        [ministry.id],
      )
      await addPerson(ministry, 'Mark Wilson')

      const modal = clean(modalOf((await getPage('/overview', cookie)).html)!)

      expect(modal).toContain('43% complete · 3 of 7')
    })
  })

  describe('an Admin past the badge', () => {
    it('can still restart it, at 7 of 7, and is not shown the bar', async () => {
      const ministry = await createMinistryWithAdmin('Done Church', 'Lee Plain')
      const cookie = (await signIn(ministry)).cookie
      await post(SEEN, cookie, { steps: SETUP_STEPS.join(','), badge: 'yes', onboarding: 'yes', stay: 'yes' })

      expect(modalOf((await getPage('/overview', cookie)).html)).toBeNull()

      const { html } = await getPage(RESTART, cookie)
      expect(clean(modalOf(html)!)).toContain('100% complete · 7 of 7')
      expect(clean(modalOf(html)!)).toContain('Take it again')
    })
  })

  describe('the one read', () => {
    it('brings all the modal draws with the page, for an Admin of any standing', async () => {
      const ministry = await createMinistryWithAdmin('One Read Church', 'Lee Plain')
      const doc = await readPageDocument(await signInAs(ministry), 'signed_in_admin')

      expect((doc.setup as { onboarding: unknown }).onboarding).toEqual({
        opened: false,
        day: 1,
        hour: 9,
        leader_noun: 'mentor',
        participant_noun: 'mentee',
        reads_as: 'One Read Church',
      })
    })
  })

  describe('somebody who is not an Admin', () => {
    let ministry: MinistryFixture

    beforeEach(async () => {
      ministry = await createMinistryWithAdmin('Grace Church', 'Sam Pike')
    })

    it('signed out, is sent to sign in, and records nothing', async () => {
      const page = await getPage(TOUR, '')
      expect(page.response.status).toBe(307)
      expect(page.response.headers.get('location')).toContain('/login')

      const done = await post(DONE, '')
      expect(done.status).toBe(303)
      expect(done.headers.get('location')).toContain('/login')
      expect(await tourEvents(ministry)).toEqual([])
    })

    it('a Leader, is shown no tour and records nothing', async () => {
      const leader = await addPersonWithAccount(ministry, 'Tess Lane', 'leader')
      const cookie = (await signInWith({ phone: leader.phone, password: leader.password })).cookie

      expect((await getPage(TOUR, cookie)).html).not.toContain('tour-camera')
      expect((await post(DONE, cookie)).status).toBe(303)
      expect(await tourEvents(ministry)).toEqual([])
    })
  })
})
