import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestClock, minutes } from '~/domain/clock'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import { readPageDocument } from '~/platform/supabase/page'
import { SETUP_HISTORY, SETUP_STEPS, testCheckInSent, tourFinished } from '~/domain/setup-meter'
import type { NewHistoryEvent } from '~/domain/history'
import type { PersonId, RelationshipId } from '~/domain/ids'
import {
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  pairOneToOne,
  publishSupabaseCredentials,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, signInAs as signInWith, skipUnlessAppIsRunning } from '../support/app'

/**
 * The setup meter (Exponential launch, ticket 26), through the pages and routes an
 * Admin uses: "Jumpstart discipleship" reads a church's stored history through the one
 * page-session read, the same for every Admin, and never goes down.
 */

const SEEN = '/settings/setup-seen'

/** The bar, as the server drew it: everything from its `section` to the end of it. */
const barOf = (html: string): string | null => {
  const start = html.indexOf('<section class="setup slim"')
  return start === -1 ? null : html.slice(start, html.indexOf('</section>', start))
}

const countIn = (html: string): string | null =>
  /<span class="count">([^<]*)<\/span>/.exec(barOf(html) ?? '')?.[1]?.replace(/<!-- -->/g, '') ?? null

/** Which steps are drawn ticked, by the names the bar marks them with. */
const tickedIn = (html: string): readonly string[] =>
  [...(barOf(html) ?? '').matchAll(/data-step="([a-z_]+)" class="step done/g)].map(([, step]) => step!)

const nextIn = (html: string): string | null =>
  /<span class="next-line"><span>Next: (?:<!-- -->)?([^<]*)/.exec(barOf(html) ?? '')?.[1] ?? null

describe.skipIf(skipUnlessAppIsRunning)('the setup meter', () => {
  let pool: pg.Pool

  beforeAll(() => {
    publishSupabaseCredentials()
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl, max: 2 })
  })

  afterAll(async () => {
    await pool.end()
  })

  // A minute ahead: the fixtures stamp a membership with this process's clock, and an
  // ending has to come after it.
  const service = () =>
    createCommandService({
      clock: createTestClock(new Date(Date.now() + minutes(1))),
      ids: { next: () => crypto.randomUUID() },
      store: createPostgresEffectStore(localSupabase().databaseUrl),
      appBaseUrl: 'https://discipler.test',
    })

  /** A fact as the product records it, as tickets 27 and 28 will. */
  const record = async (event: NewHistoryEvent) => {
    await pool.query(
      `insert into ministry_event (ministry_id, occurred_at, type, subject_type, subject_id, payload)
       values ($1, $2, $3, $4, $5, $6)`,
      [event.ministryId, event.occurredAt, event.type, event.subjectType, event.subjectId, event.payload],
    )
  }

  /** The settings form, posted as the page posts it, with this church's values. */
  const pressSave = async (ministry: MinistryFixture, cookie: string, change: Record<string, string> = {}) => {
    const { rows } = await pool.query(
      `select name, coalesce(from_name, '') as from_name, timezone, leader_noun, participant_noun,
              suggest_gender_match, suggest_max_age_band_gap, checkin_day, checkin_hour
         from ministry where id = $1`,
      [ministry.id],
    )
    const row = rows[0]!
    const response = await fetch(`${baseUrl}/settings/save`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        name: row.name,
        fromName: row.from_name,
        timezone: row.timezone,
        leaderNoun: row.leader_noun,
        participantNoun: row.participant_noun,
        ...(row.suggest_gender_match ? { suggestGenderMatch: 'on' } : {}),
        suggestMaxAgeBandGap: String(row.suggest_max_age_band_gap),
        checkinDay: String(row.checkin_day),
        checkinHour: String(row.checkin_hour),
        checkInQuestion: '',
        checkInRating: '',
        checkInConcern: '',
        checkInThanks: '',
        ...change,
      }),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('saved=yes')
  }

  const tell = async (cookie: string, fields: Record<string, string>) => {
    const response = await fetch(`${baseUrl}${SEEN}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    })
    return response
  }

  /** A church holding all seven steps, as history. */
  const finish = async (ministry: MinistryFixture) => {
    await record({
      ministryId: ministry.id,
      occurredAt: new Date(),
      type: SETUP_HISTORY.checkInTimeConfirmed,
      subjectType: 'ministry',
      subjectId: ministry.id,
      payload: {},
    })
    await record(tourFinished({ ministryId: ministry.id, finishedBy: ministry.adminUserId, at: new Date() }))
    await record(testCheckInSent({ ministryId: ministry.id, sentBy: ministry.adminUserId, at: new Date() }))
    await addPerson(ministry, 'Mark Wilson')
    await createRelationship(ministry, 'one_to_one')
  }

  describe('a church that has just opened', () => {
    let ministry: MinistryFixture
    let cookie: string

    beforeEach(async () => {
      ministry = await createMinistryWithAdmin('Riverside Chapel', 'Grace Adeyemi')
      cookie = (await signIn(ministry)).cookie
    })

    it('counts nothing: an Admin is not somebody added to the Roster', async () => {
      const { html } = await getPage('/overview', cookie)

      expect(countIn(html)).toBe('0% complete · 0 of 7')
      expect(tickedIn(html)).toEqual([])
    })

    it('says what is next, with a button that goes somewhere', async () => {
      const { html } = await getPage('/overview', cookie)
      const bar = barOf(html)!

      expect(nextIn(html)).toBe('Confirm your check-in time')
      expect(bar).toContain('href="/settings#check-in"')
      expect((await getPage('/settings', cookie)).html).toContain('id="check-in"')
    })

    /**
     * Tickets 27 and 28 are not built. Both steps are listed so the count is honest,
     * with no button to press, and "Next:" passes over them.
     */
    it('lists the tour and the test check-in with no button, and passes over them', async () => {
      await pressSave(ministry, cookie)

      const { html } = await getPage('/overview', cookie)
      const bar = barOf(html)!

      expect(bar).toContain('Take the 2-minute tour')
      expect(bar).toContain('Send yourself a test check-in')
      expect(bar).not.toContain('Start the tour')
      expect(bar).not.toContain('Send test')
      expect(nextIn(html)).toBe('Add people to your Roster')
      expect(bar).toContain('href="/roster#import"')
    })

    it('ticks step 1 when Save is pressed with nothing changed', async () => {
      await pressSave(ministry, cookie)

      const { html } = await getPage('/settings?saved=yes', cookie)

      expect(tickedIn(html)).toEqual(['check_in_time'])
      expect(countIn(html)).toBe('14% complete · 1 of 7')

      // And no change is claimed: that record is read for the changes that matter.
      const { rows } = await pool.query(
        `select type, payload from ministry_event
          where ministry_id = $1 and type in ('ministry.settings_changed', $2)`,
        [ministry.id, SETUP_HISTORY.checkInTimeConfirmed],
      )
      expect(rows).toEqual([
        {
          type: SETUP_HISTORY.checkInTimeConfirmed,
          payload: { confirmedBy: ministry.adminUserId, checkinDay: 1, checkinHour: 9 },
        },
      ])
    })

    it('ticks step 1 when Save is pressed with the hour changed', async () => {
      await pressSave(ministry, cookie, { checkinHour: '10' })

      expect(tickedIn((await getPage('/overview', cookie)).html)).toEqual(['check_in_time'])
    })

    it('does not tick step 1 for a save that was refused', async () => {
      const response = await fetch(`${baseUrl}/settings/save`, {
        method: 'POST',
        redirect: 'manual',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ name: '', timezone: 'UTC' }),
      })
      expect(response.headers.get('location')).toContain('error=')

      expect(tickedIn((await getPage('/overview', cookie)).html)).toEqual([])
    })

    /** What tickets 27 and 28 have only to record. */
    it('ticks steps 2 and 3 from the events those tickets will append', async () => {
      await record(tourFinished({ ministryId: ministry.id, finishedBy: ministry.adminUserId, at: new Date() }))
      expect(tickedIn((await getPage('/overview', cookie)).html)).toEqual(['tour'])

      await record(testCheckInSent({ ministryId: ministry.id, sentBy: ministry.adminUserId, at: new Date() }))
      const { html } = await getPage('/overview', cookie)
      expect(tickedIn(html)).toEqual(['tour', 'test_check_in'])
      expect(countIn(html)).toBe('29% complete · 2 of 7')
    })

    it('shows "43% complete · 3 of 7" for a church with three steps done', async () => {
      await pressSave(ministry, cookie)
      await addPerson(ministry, 'Mark Wilson', { intake: false })
      await record(tourFinished({ ministryId: ministry.id, finishedBy: ministry.adminUserId, at: new Date() }))

      const { html } = await getPage('/roster', cookie)

      expect(countIn(html)).toBe('43% complete · 3 of 7')
      expect(tickedIn(html)).toEqual(['check_in_time', 'tour', 'roster'])
    })

    it('is on every Admin page, under the tabs or under the header', async () => {
      const paths = [
        '/overview',
        '/check-ins',
        '/suggested-pairs',
        '/follow-up',
        '/materials',
        '/materials/new',
        '/roster',
        `/roster/${ministry.adminPersonId}`,
        '/settings',
        '/intake-forms',
        '/account',
        '/relationships',
      ]

      for (const path of paths) {
        const { html, response } = await getPage(path, cookie)
        expect(response.status, path).toBe(200)
        const bar = html.indexOf('<section class="setup slim"')
        expect(bar, path).toBeGreaterThan(-1)
        // Above the page's own content.
        expect(bar, path).toBeLessThan(html.indexOf('<main'))
      }
    })

    it('has no meter pill in the header and no points anywhere', async () => {
      const { html } = await getPage('/overview', cookie)

      expect(html.slice(0, html.indexOf('<nav aria-label="Admin surfaces"'))).not.toContain('Jumpstart')
      expect(barOf(html)).not.toMatch(/\bpoints?\b/i)
    })

    it('is on no sign-in page', async () => {
      const response = await fetch(`${baseUrl}/login`)
      expect(await response.text()).not.toContain('Jumpstart')
    })

    it('is not on a Leader\'s page', async () => {
      const leader = await addPersonWithAccount(ministry, 'Lena Leader', 'leader')
      const leaderCookie = (await signInWith(leader)).cookie
      const { html, response } = await getPage('/relationships', leaderCookie)

      expect(response.status).toBe(200)
      expect(html).not.toContain('Jumpstart')
    })

    it('says which steps have not been seen, in the document and on no second read', async () => {
      await pressSave(ministry, cookie)
      const signedIn = await signInAs(ministry)
      const doc = await readPageDocument(signedIn, 'signed_in_admin')

      expect(doc.setup).toMatchObject({
        finished: false,
        seen: [],
        done: Object.fromEntries(SETUP_STEPS.map((step) => [step, step === 'check_in_time'])),
      })

      expect((await tell(cookie, { steps: 'check_in_time', stay: 'yes' })).status).toBe(204)

      const after = await readPageDocument(signedIn, 'signed_in_admin')
      expect(after.setup).toMatchObject({ seen: ['check_in_time'] })
    })

    it('adds to what was seen and never takes away, whatever a page says', async () => {
      await tell(cookie, { steps: 'roster', stay: 'yes' })
      await tell(cookie, { steps: 'intake,everything', stay: 'yes' })

      const { rows } = await pool.query(
        `select setup_steps_seen from ministry_member where ministry_id = $1 and user_id = $2`,
        [ministry.id, ministry.adminUserId],
      )
      expect(rows[0]!.setup_steps_seen).toEqual(['intake', 'roster'])
    })
  })

  describe('never going down', () => {
    let ministry: MinistryFixture
    let cookie: string

    beforeAll(async () => {
      ministry = await createMinistryWithAdmin('Grace Fellowship', 'Ruth Banda')
      cookie = (await signIn(ministry)).cookie
    })

    it('leaves the bar where it was when the only relationship ends and its person is removed', async () => {
      const lena = await addPerson(ministry, 'Lena Leader')
      const mark = await addPerson(ministry, 'Mark Wilson')
      const relationshipId = await pairOneToOne(ministry, lena, mark)

      const before = await getPage('/overview', cookie)
      expect(tickedIn(before.html)).toEqual(['roster', 'intake', 'relationship', 'accepted'])

      await service().execute({
        type: 'relationship.end',
        ministryId: ministry.id,
        relationshipId: relationshipId as RelationshipId,
        reason: 'They finished the material together.',
        outcome: 'completed',
        endedBy: ministry.adminUserId,
      })
      await service().execute({
        type: 'person.remove',
        ministryId: ministry.id,
        personId: mark as PersonId,
        removedBy: ministry.adminUserId,
      })

      const after = await getPage('/overview', cookie)
      expect(tickedIn(after.html)).toEqual(['roster', 'intake', 'relationship', 'accepted'])
      expect(countIn(after.html)).toBe(countIn(before.html))
    })
  })

  describe('reading whichever is there', () => {
    /**
     * The event outlives the row's present tense: somebody imported and later made an
     * Admin by hand leaves no one on the Roster who is not an Admin, and the step stays.
     */
    it('ticks from the history alone, with no row behind it', async () => {
      const ministry = await createMinistryWithAdmin('Old Pilot Church')
      const cookie = (await signIn(ministry)).cookie

      for (const type of ['person.imported', 'intake.submitted', 'relationship.created', 'relationship.activated']) {
        await record({
          ministryId: ministry.id,
          occurredAt: new Date(),
          type,
          subjectType: 'person',
          subjectId: null,
          payload: {},
        })
      }

      expect(tickedIn((await getPage('/overview', cookie)).html)).toEqual([
        'roster',
        'intake',
        'relationship',
        'accepted',
      ])
    })

    it('ticks from the rows alone, with no event behind them', async () => {
      const ministry = await createMinistryWithAdmin('Hand Seeded Church')
      const cookie = (await signIn(ministry)).cookie
      await addPerson(ministry, 'Noah Reid', { intake: false })
      await createRelationship(ministry, 'one_to_one', { acceptedAt: null })

      expect(tickedIn((await getPage('/overview', cookie)).html)).toEqual(['roster', 'relationship'])
    })
  })

  describe('the same for every Admin', () => {
    it('does not count a second Admin as somebody added to the Roster, on either Admin\'s page', async () => {
      const ministry = await createMinistryWithAdmin('Trinity', 'Ada Obi')
      const second = await addPersonWithAccount(ministry, 'Ben Second', 'admin')

      for (const cookie of [(await signIn(ministry)).cookie, (await signInWith(second)).cookie]) {
        const { html } = await getPage('/overview', cookie)
        expect(tickedIn(html)).not.toContain('roster')
      }
    })
  })

  /**
   * SAU BCM, Anthem and Example Ministry opened before the meter existed. They hold
   * what the old commands left, and none of the three new events; every Admin's
   * bookmark is empty, and nothing was backfilled.
   */
  describe('a church that existed before launch', () => {
    let ministry: MinistryFixture
    let cookie: string

    beforeAll(async () => {
      ministry = await createMinistryWithAdmin('SAU BCM', 'Dana Early')
      cookie = (await signIn(ministry)).cookie

      // It chose its check-in hour long ago, and that save said what changed.
      await record({
        ministryId: ministry.id,
        occurredAt: new Date('2026-09-10T15:00:00Z'),
        type: 'ministry.settings_changed',
        subjectType: 'ministry',
        subjectId: ministry.id,
        payload: { changedBy: ministry.adminUserId, changes: { checkinHour: { from: 9, to: 18 } } },
      })
      // Its people came in by import and Intake, its pairs were made, one was accepted,
      // and then that one ended: the pilot's real shape.
      await addPerson(ministry, 'Noah Reid')
      const running = await createRelationship(ministry, 'one_to_one', {
        acceptedAt: new Date('2026-09-14T15:00:00Z'),
        createdAt: new Date('2026-09-12T15:00:00Z'),
      })
      await pool.query(
        `update relationship set ended_at = $2, ended_reason = 'They finished.', ended_outcome = 'completed' where id = $1`,
        [running, new Date('2026-10-20T15:00:00Z')],
      )
    })

    it('shows its real progress on the first sign-in after launch, with nothing backfilled', async () => {
      const { html } = await getPage('/overview', cookie)

      expect(tickedIn(html)).toEqual(['check_in_time', 'roster', 'intake', 'relationship', 'accepted'])
      expect(countIn(html)).toBe('71% complete · 5 of 7')
    })

    it('offers no Next while only the unbuilt steps are left, and no dead button', async () => {
      const bar = barOf((await getPage('/overview', cookie)).html)!

      expect(bar).not.toContain('next-line')
      expect(bar).not.toContain('class="step done next"')
      expect(bar).not.toContain('class="go"')
    })

    it('holds none of the new events, so the count came from the old history', async () => {
      const { rows } = await pool.query(
        `select 1 from ministry_event where ministry_id = $1 and type = any($2)`,
        [ministry.id, Object.values(SETUP_HISTORY)],
      )
      expect(rows).toEqual([])
    })

    it('plays everything for its Admin once, because nothing has been seen yet', async () => {
      const signedIn = await signInAs(ministry)
      const doc = await readPageDocument(signedIn, 'signed_in_admin')

      expect(doc.setup).toMatchObject({ seen: [] })
    })
  })

  describe('the badge', () => {
    let ministry: MinistryFixture
    let first: string
    let second: string

    beforeAll(async () => {
      ministry = await createMinistryWithAdmin('Hope Church', 'Eve First')
      const other = await addPersonWithAccount(ministry, 'Sam Second', 'admin')
      first = (await signIn(ministry)).cookie
      second = (await signInWith(other)).cookie
      await finish(ministry)
    })

    it('plays at 100% over the bar, with the church, its day and its hour', async () => {
      const { html } = await getPage('/check-ins', first)

      expect(countIn(html)).toBe('100% complete · 7 of 7')
      expect(html).toContain('Hope Church is up and running')
      expect(html).toContain(
        'All seven steps are done, and your first relationship has been accepted. Check-ins go out every Monday at 9am.',
      )
      expect(html).toContain('Thank you!')
    })

    it('never plays below 100%', async () => {
      const other = await createMinistryWithAdmin('Almost Church', 'Ivy Almost')
      const cookie = (await signIn(other)).cookie

      expect((await getPage('/overview', cookie)).html).not.toContain('is up and running')
    })

    it('plays once for each Admin, and then the bar is gone for good for that Admin', async () => {
      expect((await tell(first, { steps: SETUP_STEPS.join(','), badge: 'yes', stay: 'yes' })).status).toBe(204)

      for (const path of ['/overview', '/roster', '/settings']) {
        const { html } = await getPage(path, first)
        expect(html, path).not.toContain('is up and running')
        expect(barOf(html), path).toBeNull()
      }

      // The second Admin has not seen it, and sees it once, on their next page.
      const { html } = await getPage('/overview', second)
      expect(html).toContain('Hope Church is up and running')

      await tell(second, { steps: SETUP_STEPS.join(','), badge: 'yes', stay: 'yes' })
      const again = await getPage('/overview', second)
      expect(again.html).not.toContain('is up and running')
      expect(barOf(again.html)).toBeNull()
    })

    it('stays gone: an Admin past the badge asks the history nothing', async () => {
      const signedIn = await signInAs(ministry)
      const doc = await readPageDocument(signedIn, 'signed_in_admin')

      expect(doc.setup).toEqual({ finished: true })
    })

    it('closes with no script: Thank you! posts and lands on the Overview', async () => {
      const church = await createMinistryWithAdmin('Plain Church', 'Lee Plain')
      const cookie = (await signIn(church)).cookie
      await finish(church)

      const response = await tell(cookie, { badge: 'yes' })

      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toContain('/overview')
      expect(barOf((await getPage('/overview', cookie)).html)).toBeNull()
    })
  })

  it('tells nobody signed out anything, and writes nothing', async () => {
    const response = await tell('', { steps: 'roster', stay: 'yes' })

    expect(response.status).toBe(204)
  })
})
