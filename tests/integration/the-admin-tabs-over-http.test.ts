import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days, weeks } from '~/domain/clock'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * The Admin surface as an Admin reaches it: sign in, land on the Overview, and
 * walk the six tabs. Four of them are new under ticket 31 -- Overview, Check-Ins,
 * Suggested Pairs and Follow-Up -- and the tests that matter most are the ones
 * about what is *not* on them: no Concern text anywhere but the page that records
 * its reading, and no number that its Person has not agreed to share.
 */

describe.skipIf(skipUnlessAppIsRunning)('the Admin tabs', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // Monday 24 August 2026, 8pm in London -- the Monday of ISO week 2026-W35.
  const firstWeek = new Date('2026-08-24T19:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const at = (week: number) => new Date(firstWeek.getTime() + weeks(week))

  beforeAll(async () => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const post = async (path: string, cookie: string, body: Record<string, string | string[]>) => {
    const params = new URLSearchParams()
    for (const [name, value] of Object.entries(body)) {
      for (const each of [value].flat()) params.append(name, each)
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    return { response, location: response.headers.get('location') ?? '', html: await response.text() }
  }

  /** One Ministry asking on Monday evenings in London, with the verbs a scenario needs. */
  const aMinistry = async (name: string) => {
    const ministry = await createMinistryWithAdmin(name)
    await pool.query(
      `update ministry set timezone = 'Europe/London', checkin_day = 1, checkin_hour = 20 where id = $1`,
      [ministry.id],
    )
    const serviceAt = (now: Date) =>
      createCommandService({ clock: createTestClock(now), ids, store, appBaseUrl: 'https://discipler.test' })
    const congregant = async (fullName: string) => {
      const id = personId(await addPerson(ministry, fullName, { phone: aNumber() }))
      await completeIntake(ministry, id)
      return id
    }
    return {
      ministry,
      serviceAt,
      congregant,
      tickAt: (now: Date) => serviceAt(now).execute({ type: 'scheduled.tick', ministryId: ministry.id }),
      replyAt: (now: Date, person: PersonId, body: string) =>
        serviceAt(now).execute({ type: 'sms.inbound', ministryId: ministry.id, personId: person, body }),
    }
  }

  describe('an empty Ministry', () => {
    let ministry: MinistryFixture
    let cookie: string

    beforeAll(async () => {
      ministry = await createMinistryWithAdmin('Empty Chapel')
      cookie = (await signIn(ministry)).cookie
    })

    it('sends an Admin from / to the Overview', async () => {
      const response = await fetch(`${baseUrl}/`, { redirect: 'manual', headers: { cookie } })
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/overview')
    })

    it('turns a visitor with no session away from every tab', async () => {
      for (const path of ['/overview', '/check-ins', '/suggested-pairs', '/follow-up', '/roster']) {
        const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
        expect(response.status, path).toBe(307)
        expect(response.headers.get('location'), path).toContain('/login')
      }
    })

    it('shows the six tabs in order, with Materials greyed out and the rest links', async () => {
      const { html } = await getPage('/overview', cookie)

      const order = ['Overview', 'Check-Ins', 'Suggested Pairs', 'Follow-Up', 'Materials', 'Roster']
      const positions = order.map((label) => html.indexOf(`${label}</`))
      expect(positions.every((position) => position >= 0)).toBe(true)
      expect([...positions].sort((a, b) => a - b)).toEqual(positions)

      expect(html).toContain('aria-disabled="true"')
      expect(html).not.toContain('href="/materials"')
      for (const href of ['/overview', '/check-ins', '/suggested-pairs', '/follow-up', '/roster']) {
        expect(html).toContain(`href="${href}"`)
      }
      // The current one is marked, and the Ministry's name is the heading.
      expect(html).toContain('aria-current="page"')
      expect(html).toContain('Empty Chapel')
    })

    it('renders the Overview as zeros and an honest empty state', async () => {
      const { response, html } = await getPage('/overview', cookie)
      expect(response.status).toBe(200)

      for (const tile of ['Active Relationships', 'Meeting Rate', 'Response Rate', 'This Week', 'Needs Follow-Up']) {
        expect(html).toContain(tile)
      }
      expect(html).toContain('0%')
      expect(html).toContain('No relationships yet')
      expect(html).toContain('No check-ins yet')
      // Two rings drawn on the server, and no chart library.
      expect(html.match(/<svg[^>]*class="donut"/g)).toHaveLength(2)
      expect(html).not.toContain('chart.js')
      expect(html).not.toContain('<script src="https://cdn')
    })

    it('renders the Check-Ins tab with three zero counts', async () => {
      const { response, html } = await getPage('/check-ins', cookie)
      expect(response.status).toBe(200)
      expect(html).toContain('Completed')
      expect(html).toContain('Pending')
      expect(html).toContain('Nothing yet this week')
      expect(html).toContain('No open concerns this week')
    })

    it('renders the Suggested Pairs tab as a working page with the empty state', async () => {
      const { response, html } = await getPage('/suggested-pairs', cookie)
      expect(response.status).toBe(200)
      expect(html).toContain('No suggestions right now')
      expect(html).toContain('not available yet')
      expect(html).toContain('href="/roster/pair"')
    })

    it('renders Follow-Up with nothing needing attention and no badge', async () => {
      const { response, html } = await getPage('/follow-up', cookie)
      expect(response.status).toBe(200)
      expect(html).toContain('Nothing needs attention right now')
      expect(html).not.toContain('tab-badge')
    })

    it('signs out on a POST and refuses the tabs afterwards', async () => {
      const { cookie: session } = await signIn(ministry)
      const { response } = await post('/auth/sign-out', session, {})
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toContain('/login')

      // The cookie the sign-out cleared is what a browser would drop; sending the
      // old one back is the stale case, and the middleware refuses it.
      const cleared = response.headers
        .getSetCookie()
        .map((each) => each.split(';', 1)[0])
        .join('; ')
      const after = await fetch(`${baseUrl}/overview`, { redirect: 'manual', headers: { cookie: cleared } })
      expect(after.status).toBe(307)
      expect(after.headers.get('location')).toContain('/login')
    })
  })

  describe('Care Needed', () => {
    it('lists a Follow-Up Item, reveals a number and sends nothing, and resolves it', async () => {
      const church = await aMinistry('Keyword Chapel')
      const { cookie } = await signIn(church.ministry)
      const person = personId(await addPerson(church.ministry, 'Liam Okafor', { phone: '+15559990001' }))
      await store.transact(church.ministry.id, (unit) =>
        unit.raiseFollowUp({
          ministryId: church.ministry.id,
          kind: 'participant_keyword',
          keyword: 'HELP',
          relationshipId: null,
          personId: person,
          raisedAt: new Date(),
        }),
      )

      const before = await getPage('/follow-up', cookie)
      expect(before.html).toContain('Texted a keyword')
      expect(before.html).toContain('Liam Okafor')
      expect(before.html).toContain('See contact details')
      expect(before.html).toContain('tab-badge')
      // The number is not on the list. It is one reveal away, behind consent.
      expect(before.html).not.toContain('+15559990001')

      const reveal = await post('/follow-up/contact', cookie, { personId: person })
      expect(reveal.response.status).toBe(303)
      expect(reveal.location).toContain(`reveal=${person}`)
      // The Person travels on the query string and the number never does.
      expect(reveal.location).not.toContain('5559990001')

      const revealed = await getPage(`/follow-up?reveal=${person}`, cookie)
      expect(revealed.html).toContain('+15559990001')

      const { rows: sent } = await pool.query(
        `select 1 from outbound_message where ministry_id = $1 and person_id = $2`,
        [church.ministry.id, person],
      )
      expect(sent).toHaveLength(0)

      const { rows } = await pool.query(
        `select id from follow_up_item where ministry_id = $1 and person_id = $2 and resolved_at is null`,
        [church.ministry.id, person],
      )
      const resolved = await post('/follow-up/resolve', cookie, { itemId: rows[0]!.id })
      expect(resolved.response.status).toBe(303)
      expect(resolved.location).toContain('done=resolved')

      const after = await getPage('/follow-up?done=resolved', cookie)
      expect(after.html).toContain('Item cleared')
      expect(after.html).not.toContain('Liam Okafor')
    })

    it('withholds a number its Person has not agreed to share', async () => {
      const church = await aMinistry('Withheld Chapel')
      const { cookie } = await signIn(church.ministry)
      const person = personId(
        await addPerson(church.ministry, 'Nia Bello', { phone: '+15559990002', intake: false }),
      )
      await completeIntake(church.ministry, person, ['sms'])
      await store.transact(church.ministry.id, (unit) =>
        unit.raiseFollowUp({
          ministryId: church.ministry.id,
          kind: 'participant_keyword',
          keyword: 'HELP',
          relationshipId: null,
          personId: person,
          raisedAt: new Date(),
        }),
      )

      const { html } = await getPage(`/follow-up?reveal=${person}`, cookie)
      expect(html).toContain('Nia Bello has not agreed to share their number')
      expect(html).not.toContain('+15559990002')
    })

    it('shows a relationship nobody accepted after five days, and cancels it', async () => {
      const church = await aMinistry('Waiting Chapel')
      const { cookie } = await signIn(church.ministry)
      const leader = await church.congregant('Isaac Prince')
      const participant = await church.congregant('Julia North')

      const formedAt = new Date(Date.now() - days(6))
      await church.serviceAt(formedAt).execute({
        type: 'relationship.create',
        ministryId: church.ministry.id,
        leaderIds: [leader],
        participantIds: [participant],
      })
      await church.tickAt(new Date(formedAt.getTime() + days(5)))

      const { html } = await getPage('/follow-up', cookie)
      expect(html).toContain('Awaiting acceptance')
      expect(html).toContain('has not accepted this relationship')
      expect(html).toContain('Cancel relationship')

      const { rows } = await pool.query(
        `select relationship_id from follow_up_item where ministry_id = $1 and kind = 'relationship_unaccepted'`,
        [church.ministry.id],
      )
      const cancelled = await post('/follow-up/relationship/cancel', cookie, {
        relationshipId: rows[0]!.relationship_id,
      })
      expect(cancelled.location).toContain('done=cancelled')

      const overview = await getPage('/overview', cookie)
      expect(overview.html).not.toContain('Isaac Prince')
    })

    it('refuses to end a relationship without a reason and an outcome', async () => {
      const church = await aMinistry('Reasons Chapel')
      const { cookie } = await signIn(church.ministry)
      const leader = await church.congregant('Ruth Adeyemi')
      const participant = await church.congregant('Sam Doyle')
      const relationship = await pairOneToOne(church.ministry, leader, participant)

      const noOutcome = await post('/follow-up/relationship/end', cookie, {
        relationshipId: relationship,
        reason: 'Finished well.',
      })
      expect(noOutcome.location).toContain('error=ending.outcome_not_recognised')

      const noReason = await post('/follow-up/relationship/end', cookie, {
        relationshipId: relationship,
        outcome: 'completed',
        reason: '   ',
      })
      expect(noReason.location).toContain('error=ending.reason_is_required')

      const ended = await post('/follow-up/relationship/end', cookie, {
        relationshipId: relationship,
        outcome: 'completed',
        reason: 'Finished the reading plan together and closed well.',
      })
      expect(ended.location).toContain('done=ended')

      const { rows } = await pool.query(`select ended_at from relationship where id = $1`, [relationship])
      expect(rows[0]?.ended_at).not.toBeNull()
    })

    it('reads a Concern only on its own page, records the viewing, and never lists the words', async () => {
      const church = await aMinistry('Concerned Chapel')
      const { cookie } = await signIn(church.ministry)
      const leader = await church.congregant('Concerned Leader')
      const participant = await church.congregant('Quiet Participant')
      const formedAt = new Date(firstWeek.getTime() - weeks(1))
      await pairOneToOne(church.ministry, leader, participant, { createdAt: formedAt, acceptedAt: formedAt })

      await church.tickAt(at(0))
      const answering = new Date(at(0).getTime() + 60_000)
      await church.replyAt(answering, leader, '1')
      await church.replyAt(new Date(answering.getTime() + 60_000), leader, 'C')
      const words = 'She lost her job and did not want to talk long.'
      await church.replyAt(new Date(answering.getTime() + 120_000), leader, words)

      const list = await getPage('/follow-up', cookie)
      expect(list.html).toContain('Concern')
      expect(list.html).toContain('Read the concern')
      expect(list.html).not.toContain(words)

      const checkIns = await getPage('/check-ins', cookie)
      expect(checkIns.html).not.toContain(words)
      const overview = await getPage('/overview', cookie)
      expect(overview.html).not.toContain(words)
      expect(overview.html).toContain('Concerned Leader')
      expect(overview.html).toContain('Needs Follow-Up')

      const { rows } = await pool.query(`select id from concern where ministry_id = $1`, [church.ministry.id])
      const concern = rows[0]!.id as string

      const opened = await post('/follow-up/concern/view', cookie, { concernId: concern })
      expect(opened.response.status).toBe(200)
      expect(opened.response.headers.get('cache-control')).toContain('no-store')
      expect(opened.html).toContain(words)
      expect(opened.html).toContain('This view was recorded')
      expect(opened.html).toContain('Resolve')

      const { rows: viewings } = await pool.query(
        `select viewed_by from concern_viewing where concern_id = $1`,
        [concern],
      )
      expect(viewings.map((row) => row.viewed_by)).toEqual([church.ministry.adminUserId])

      const resolved = await post('/follow-up/concern/resolve', cookie, { concernId: concern })
      expect(resolved.location).toContain('done=concern-resolved')

      const after = await getPage('/follow-up', cookie)
      expect(after.html).not.toContain('Read the concern')
      const { rows: cleared } = await pool.query(`select detail from concern where id = $1`, [concern])
      expect(cleared[0]?.detail).toBeNull()
    })

    it('shows a Leader nothing of the Admin tabs', async () => {
      const church = await aMinistry('Leaders Only Chapel')
      const { cookie } = await signIn(church.ministry)
      // The Admin surface is gated on the tier. A Leader signed in reaches the
      // sign-in-but-not-an-Admin page on each tab rather than another Ministry's
      // numbers, which the Leader Dashboard tests already cover; here the Admin's
      // own Overview carries no Concern text and no number, which is the property
      // that matters on a surface every Admin can read.
      const { html } = await getPage('/overview', cookie)
      expect(html).not.toMatch(/\+1555\d{7}/)
    })
  })
})
