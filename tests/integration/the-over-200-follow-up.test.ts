import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { EmailEnvelope } from '~/domain/email'
import { createPostgresOver200FollowUps } from '~/platform/supabase/over-200-follow-ups'
import { createEmailSender } from '~/service/email-sender'
import { watchOver200Churches } from '~/service/over-200-watch'
import { createEmailSupportAlerts } from '~/service/support-alerts'
import { addMembership, addPerson, localSupabase, pauseRelationship, type MinistryFixture } from '../support/local-supabase'
import { aGroupFrom, aLargeChurch, addToAGroup, peopleInAGroup } from '../support/over-200-church'

/**
 * The over-200 watch on the real tables (Exponential launch, ticket 14), with Resend
 * stubbed at the transport. What the domain's tests cannot prove is here: that a
 * history and a billing history read as the church answer the question, that the
 * churches it should not look at are not looked at, and that the row keeps a month to
 * one email across passes that fail.
 *
 * Every date is in the past and stays there. The price IDs are this run's own, so no
 * other church in the shared database can be on them.
 */
describe('the over-200 watch, on the real tables', () => {
  const run = crypto.randomUUID().slice(0, 8)
  const MONTHLY = `price_monthly_${run}`
  const YEARLY = `price_yearly_${run}`
  const ABOVE = `price_above_${run}`

  const LONG_AGO = new Date('2026-08-01T00:00:00Z')
  // 1 November 2026 at 08:00 UTC: October has closed at every church in these tests.
  const PASS_AT = new Date('2026-11-01T08:00:00Z')
  const HOUR = 60 * 60 * 1000

  const followUps = createPostgresOver200FollowUps(localSupabase().databaseUrl)
  let pool: pg.Pool

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await followUps.close()
    await pool.end()
  })

  /** A watch of its own: a recording transport, and only this church's emails are read. */
  const watching = (ministry: MinistryFixture) => {
    const clock = createTestClock(PASS_AT)
    const all: EmailEnvelope[] = []
    const faults: { sending: Error | null } = { sending: null }
    const alerts = createEmailSupportAlerts(
      createEmailSender({
        async deliver(envelope) {
          if (faults.sending) throw faults.sending
          all.push(envelope)
        },
      }),
    )
    return {
      clock,
      faults,
      pass: () => watchOver200Churches({ followUps, alerts, clock, firstPrices: [MONTHLY, YEARLY] }),
      emails: () => all.filter((email) => email.idempotencyKey.includes(ministry.id)),
    }
  }

  const rowsOf = async (ministry: MinistryFixture) => {
    const { rows } = await pool.query<{ month: string; fewest_people: number; told_at: Date | null }>(
      `select month, fewest_people, told_at from over_200_follow_up where church = $1 order by month`,
      [ministry.id],
    )
    return rows
  }

  const aChurchAbove = async (name: string, options: Parameters<typeof aLargeChurch>[2] = {}) => {
    const church = await aLargeChurch(pool, name, {
      priceId: MONTHLY,
      onThePriceSince: new Date('2026-09-20T00:00:00Z'),
      ...options,
    })
    const group = await aGroupFrom(church, LONG_AGO)
    await peopleInAGroup(pool, church, group, 205, LONG_AGO)
    return church
  }

  it('emails support@ once about a church above 200 for all of October', async () => {
    const church = await aChurchAbove('Above Chapel')
    const watch = watching(church)

    await watch.pass()
    watch.clock.advanceBy(HOUR)
    await watch.pass()

    expect(watch.emails()).toHaveLength(1)
    const email = watch.emails()[0]!
    expect(email.kind).toBe('over200FollowUp')
    expect(email.to).toEqual(['support@trydiscipler.com'])
    expect(email.subject).toBe('Above Chapel stayed above 200 people through October 2026')
    expect(email.text).toContain('The fewest at any moment that month was 205.')
    expect(email.text).not.toContain('Person ')

    // September is not answered: it was on the price only from the 20th.
    expect(await rowsOf(church)).toEqual([
      { month: '2026-10', fewest_people: 205, told_at: PASS_AT },
    ])
  })

  it('counts the Discipler with the Disciples, and a person in two relationships once', async () => {
    const church = await aLargeChurch(pool, 'Just Over Chapel', {
      priceId: YEARLY,
      onThePriceSince: new Date('2026-09-20T00:00:00Z'),
    })
    const first = await aGroupFrom(church, LONG_AGO)
    const second = await aGroupFrom(church, LONG_AGO)
    const people = await peopleInAGroup(pool, church, first, 199, LONG_AGO)
    // The same people again in a second Group change nothing.
    await addToAGroup(pool, church, second, people.slice(0, 50), LONG_AGO)

    const watch = watching(church)
    await watch.pass()
    expect(watch.emails()).toHaveLength(0)

    // 200 with the Discipler is still not above, and 201 with one more Disciple is.
    const discipler = await addPerson(church, 'The Discipler')
    await addMembership({
      ministry: church,
      relationshipId: first,
      kind: 'group',
      personId: discipler,
      role: 'leader',
      startedAt: LONG_AGO,
      acceptedAt: LONG_AGO,
    })
    await watch.pass()
    expect(watch.emails()).toHaveLength(0)

    const disciple = await addPerson(church, 'One More')
    await addToAGroup(pool, church, second, [disciple], LONG_AGO)
    await watch.pass()
    expect(watch.emails()).toHaveLength(1)
    expect(watch.emails()[0]?.text).toContain('was 201.')
  })

  it('sends nothing about a church that dipped under 200 in the month', async () => {
    const church = await aLargeChurch(pool, 'Dipped Chapel', {
      priceId: MONTHLY,
      onThePriceSince: new Date('2026-09-20T00:00:00Z'),
    })
    const stays = await aGroupFrom(church, LONG_AGO)
    await peopleInAGroup(pool, church, stays, 195, LONG_AGO)
    // Ten leave on the 10th and come back on the 12th, in a Group of their own.
    const away = await aGroupFrom(church, LONG_AGO)
    const people = await peopleInAGroup(pool, church, away, 10, LONG_AGO, new Date('2026-10-10T12:00:00Z'))
    await addToAGroup(pool, church, away, people, new Date('2026-10-12T12:00:00Z'))

    const watch = watching(church)
    await watch.pass()

    expect(watch.emails()).toHaveLength(0)
    expect(await rowsOf(church)).toEqual([])
  })

  it('sends nothing about a church whose Pause took it under 200, read from the events', async () => {
    const church = await aLargeChurch(pool, 'Paused Chapel', {
      priceId: MONTHLY,
      onThePriceSince: new Date('2026-09-20T00:00:00Z'),
    })
    const stays = await aGroupFrom(church, LONG_AGO)
    await peopleInAGroup(pool, church, stays, 195, LONG_AGO)
    const paused = await aGroupFrom(church, LONG_AGO)
    await peopleInAGroup(pool, church, paused, 10, LONG_AGO)
    await pauseRelationship(church, paused, 1, new Date('2026-10-10T12:00:00Z'))

    const watch = watching(church)
    await watch.pass()

    expect(watch.emails()).toHaveLength(0)
  })

  it('reads the month in the church\'s own time zone', async () => {
    // Twenty leave at 05:00 UTC on 1 November and never come back. In Los Angeles that
    // is still 31 October, so October was not whole. In Tokyo it was.
    const leave = new Date('2026-11-01T05:00:00Z')
    const churchIn = async (name: string, timeZone: string) => {
      const church = await aLargeChurch(pool, name, {
        priceId: MONTHLY,
        onThePriceSince: new Date('2026-09-20T00:00:00Z'),
        timeZone,
      })
      const stays = await aGroupFrom(church, LONG_AGO)
      await peopleInAGroup(pool, church, stays, 190, LONG_AGO)
      const leaving = await aGroupFrom(church, LONG_AGO)
      await peopleInAGroup(pool, church, leaving, 20, LONG_AGO, leave)
      return church
    }

    const angeles = await churchIn('Pacific Chapel', 'America/Los_Angeles')
    const tokyo = await churchIn('Tokyo Chapel', 'Asia/Tokyo')

    // One pass, which looks at both of them.
    const watch = watching(tokyo)
    await watch.pass()

    expect(watch.emails().map((email) => email.subject)).toEqual([
      'Tokyo Chapel stayed above 200 people through October 2026',
    ])
    expect(await rowsOf(angeles)).toEqual([])
  })

  it('sends nothing about a church that signed up in the middle of the month', async () => {
    const church = await aChurchAbove('Mid-month Chapel', { onThePriceSince: new Date('2026-10-15T00:00:00Z') })
    const watch = watching(church)

    await watch.pass()

    expect(watch.emails()).toHaveLength(0)
  })

  it('sends nothing about a church billed outside Stripe, or on another price', async () => {
    const outside = await aChurchAbove('Outside Chapel', { billedOutsideStripe: true })
    const higher = await aChurchAbove('Higher Chapel', { priceId: ABOVE })
    const ended = await aChurchAbove('Ended Chapel', { status: 'canceled' })

    const watches = [watching(outside), watching(higher), watching(ended)]
    for (const watch of watches) await watch.pass()

    for (const watch of watches) expect(watch.emails()).toHaveLength(0)
    expect(await rowsOf(outside)).toEqual([])
    expect(await rowsOf(higher)).toEqual([])
    expect(await rowsOf(ended)).toEqual([])
  })

  it('does not look at a church too small to be above 200', async () => {
    const small = await aLargeChurch(pool, 'Small Chapel', { priceId: MONTHLY })
    const group = await aGroupFrom(small, LONG_AGO)
    await peopleInAGroup(pool, small, group, 200, LONG_AGO)

    const asked = await followUps.churchesToAsk([MONTHLY, YEARLY], LONG_AGO, 200)

    expect(asked.map((church) => church.id)).not.toContain(small.id)
  })

  it('reads a church\'s history as that church, whichever is asked for', async () => {
    const church = await aChurchAbove('Own History Chapel')

    const { history, prices, standing } = await followUps.recordsOf(church.id)

    expect(history.members).toHaveLength(205)
    expect(new Set(history.members.map((member) => member.relationshipId)).size).toBe(1)
    expect(prices).toEqual([{ at: new Date('2026-09-20T00:00:00Z'), status: 'active', priceId: MONTHLY }])
    expect(standing).toBe('active')
  })

  it('keeps a month through an email that failed, and sends it once when it can', async () => {
    const church = await aChurchAbove('Retry Chapel')
    const watch = watching(church)

    watch.faults.sending = new Error('Resend is down')
    await watch.pass()
    expect(watch.emails()).toHaveLength(0)
    expect(await rowsOf(church)).toEqual([{ month: '2026-10', fewest_people: 205, told_at: null }])

    watch.faults.sending = null
    watch.clock.advanceBy(HOUR)
    await watch.pass()
    watch.clock.advanceBy(HOUR)
    await watch.pass()

    expect(watch.emails()).toHaveLength(1)
    expect((await rowsOf(church))[0]?.told_at).toEqual(new Date(PASS_AT.getTime() + HOUR))
  })

  it('has one row per church and month however many passes race to record it', async () => {
    const church = await aChurchAbove('Race Chapel')
    const followUp = {
      church: church.id,
      churchName: 'Race Chapel',
      customerId: 'cus_race',
      month: '2026-10' as never,
      fewestPeople: 205,
    }

    await Promise.all([followUps.record(followUp, PASS_AT), followUps.record(followUp, PASS_AT)])

    expect(await rowsOf(church)).toHaveLength(1)
    await pool.query(`update over_200_follow_up set told_at = $2 where church = $1`, [church.id, PASS_AT])
  })
})
