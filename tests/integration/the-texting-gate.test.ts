import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StripeSubscriptionFacts, SubscriptionStatus } from '~/domain/billing'
import { createTestClock, days, weeks } from '~/domain/clock'
import {
  GroupJoinRefused,
  GroupRefused,
  InvitationRefused,
  PairingRefused,
  PauseRefused,
  ReinvitationRefused,
} from '~/domain/errors'
import { followUpItemId, personId, relationshipId, type IdSource } from '~/domain/ids'
import { createPostgresBilling, type PostgresBilling } from '~/platform/supabase/billing'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createCommandService } from '~/service/command-service'
import { dispatchQueue } from '~/service/outbound-dispatch'
import type { MessageTransport } from '~/service/ports'
import { noDailyCap } from '../support/daily-cap'
import {
  addPerson,
  aPhoneNumberNobodyHolds,
  aTestPhoneNumber,
  completeIntake,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  pairOneToOne,
  pauseRelationship,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The texting gate on the real queue, with the real tick queuing the real check-ins
 * and the real billing records saying where each church stands (Exponential launch,
 * ticket 05). Twilio is the one fake, at its port: what it was handed is what left.
 *
 * Monday 2031-03-03, 8pm UTC, which is every church's check-in hour here. A date well
 * ahead, because nothing about these clocks is about the calendar.
 *
 * A long timeout, because most of these open a church of their own and pair people in
 * it, which on a busy machine outlasts the default. One that ran out would go on
 * delivering into the next test's record.
 */
describe('The texting gate', { timeout: 60_000 }, () => {
  const CHECK_IN_HOUR = new Date('2031-03-03T20:00:00Z')

  let store: ReturnType<typeof createPostgresEffectStore>
  let queue: ReturnType<typeof createPostgresOutboundQueue>
  let billing: PostgresBilling
  let pool: pg.Pool

  const ids: IdSource = { next: () => crypto.randomUUID() }

  const delivered: { to: string; body: string }[] = []
  /** A phone Twilio refuses, for a text that stays on the queue. */
  const refusing = new Set<string>()
  const transport: MessageTransport = {
    async deliver(_from, to, body) {
      if (refusing.has(to)) throw new Error('Twilio refused this one')
      delivered.push({ to, body })
    },
  }

  const service = (now: Date) =>
    createCommandService({
      clock: createTestClock(now),
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    })

  const drainAt = (now: Date, church: MinistryFixture) =>
    dispatchQueue({
      queue,
      transport,
      clock: createTestClock(now),
      ministryId: church.id,
      dailyCap: noDailyCap,
    })

  const tickAndDrainAt = async (now: Date, church: MinistryFixture) => {
    await service(now).execute({ type: 'scheduled.tick', ministryId: church.id })
    return drainAt(now, church)
  }

  /** Where a church stands, by the same write the Stripe webhook makes. */
  const standsAt = async (church: MinistryFixture, status: SubscriptionStatus, at = CHECK_IN_HOUR) => {
    const unique = crypto.randomUUID().replaceAll('-', '')
    const customerId = await billing.records.rememberCustomer(church.id, `cus_${unique}`, false)
    const subscription: StripeSubscriptionFacts = {
      id: `sub_${unique}`,
      status,
      createdAt: at,
      priceId: 'price_97',
      latestInvoiceId: `in_${unique}`,
      trialEndsAt: null,
      currentPeriodEndsAt: new Date(at.getTime() + weeks(4)),
      cancelsAt: null,
      namedChurch: null,
    }
    await billing.records.establish(church.id, (unit) =>
      unit.record(
        {
          eventId: `evt_${unique}`,
          eventType: 'customer.subscription.updated',
          eventOccurredAt: at,
          livemode: false,
          customerId,
          invoiceId: null,
          chargeId: null,
          subscription,
        },
        at,
      ),
    )
  }

  /** The statement `20261103100400` runs for every church on production, for this one. */
  const flaggedAsTheMigrationDoes = (church: MinistryFixture) =>
    pool.query(
      `insert into ministry_billing (ministry_id, billed_outside_stripe) values ($1, true)
       on conflict (ministry_id) do update set billed_outside_stripe = true`,
      [church.id],
    )

  /**
   * A church with one Discipler and one Disciple, whose check-in hour is Monday 8pm.
   * With no subscription and no flag, unless the test says otherwise.
   */
  const aChurch = async (name: string, billedOutsideStripe = false) => {
    const church = await createMinistryWithAdmin(name, undefined, { billedOutsideStripe })
    await pool.query(`update ministry set checkin_day = 1, checkin_hour = 20 where id = $1`, [church.id])
    const pair = await aPairIn(church)
    return { church, ...pair }
  }

  const aPairIn = async (church: MinistryFixture) => {
    const leaderPhone = aTestPhoneNumber()
    const leader = personId(await addPerson(church, 'Dana Leader', { phone: leaderPhone }))
    const disciple = personId(await addPerson(church, 'Sam Disciple', { phone: aTestPhoneNumber() }))
    await completeIntake(church, leader)
    await completeIntake(church, disciple)
    const relationship = await pairOneToOne(church, leader, disciple, {
      joinedAt: new Date(CHECK_IN_HOUR.getTime() - weeks(1)),
    })
    return { leader, leaderPhone, disciple, relationship }
  }

  /** An account for somebody accepting an invitation, as `accepting-an-invitation` makes one. */
  const anAccount = async () => {
    const { data, error } = await serviceRoleClient().auth.admin.createUser({
      phone: await aPhoneNumberNobodyHolds(),
      password: 'a-long-enough-password',
      phone_confirm: true,
    })
    if (error) throw new Error(error.message)
    return data.user.id
  }

  const rowsTo = async (church: MinistryFixture, phone: string) => {
    const { rows } = await pool.query<{
      body: string
      sent_at: Date | null
      withheld_reason: string | null
      enqueued_at: Date
    }>(
      `select body, sent_at, withheld_reason, enqueued_at from outbound_message
        where ministry_id = $1 and to_phone = $2 order by enqueued_at, created_at`,
      [church.id, phone],
    )
    return rows
  }

  const aStraggler = async (church: MinistryFixture, to: string, person: string) => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into outbound_message
         (ministry_id, carries_rates_line, person_id, to_phone, body, enqueued_at, message_kind)
       values ($1, false, $2, $3, 'A text queued before the subscription ended', $4, 'no_reply')
       returning id`,
      [church.id, person, to, CHECK_IN_HOUR],
    )
    return rows[0]!.id
  }

  const reasonOf = async (message: string) => {
    const { rows } = await pool.query<{ sent_at: Date | null; withheld_reason: string | null }>(
      `select sent_at, withheld_reason from outbound_message where id = $1`,
      [message],
    )
    return rows[0]!
  }

  beforeAll(async () => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    queue = createPostgresOutboundQueue(localSupabase().databaseUrl)
    billing = createPostgresBilling(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delivered.length = 0
    refusing.clear()
  })

  afterAll(async () => {
    await store.close()
    await queue.close()
    await billing.close()
    await pool.end()
  })

  describe('a church that should text', () => {
    const checkInReaches = async (church: MinistryFixture, leaderPhone: string) => {
      const outcome = await tickAndDrainAt(CHECK_IN_HOUR, church)

      expect(outcome.closedWithoutAccess).toBe(0)
      expect(outcome.accessUnread).toBe(false)
      expect(delivered.map(({ to }) => to)).toContain(leaderPhone)
      const rows = await rowsTo(church, leaderPhone)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((row) => row.sent_at !== null && row.withheld_reason === null)).toBe(true)
    }

    it('sends when it opened outside Stripe', async () => {
      const { church, leaderPhone } = await aChurch('Flagged At Opening', true)
      await checkInReaches(church, leaderPhone)
    })

    it('sends when it carries the flag as migration 20261103100400 wrote it, with no subscription', async () => {
      const { church, leaderPhone } = await aChurch('Flagged By The Migration')
      await flaggedAsTheMigrationDoes(church)
      await checkInReaches(church, leaderPhone)
    })

    it('sends when it carries the flag whatever Stripe says, an ended subscription included', async () => {
      const { church, leaderPhone } = await aChurch('Flagged And Ended')
      await standsAt(church, 'canceled')
      await flaggedAsTheMigrationDoes(church)
      await checkInReaches(church, leaderPhone)
    })

    it.each(['trialing', 'active', 'past_due'] as const)('sends when its subscription is %s', async (status) => {
      const { church, leaderPhone } = await aChurch(`A ${status} church`)
      await standsAt(church, status)
      await checkInReaches(church, leaderPhone)
    })
  })

  describe('a church that should not text', () => {
    const cases: readonly (readonly [string, SubscriptionStatus | null])[] = [
      ['ended (canceled)', 'canceled'],
      ['unpaid', 'unpaid'],
      ['expired before its first payment', 'incomplete_expired'],
      ['paused', 'paused'],
      ['waiting on its first payment', 'incomplete'],
      ['with no subscription', null],
    ]

    it.each(cases)('sends nothing %s, and asks nobody anything', async (_, status) => {
      const { church, leaderPhone, leader } = await aChurch(`A church ${status ?? 'with none'}`)
      if (status) await standsAt(church, status)
      const straggler = await aStraggler(church, leaderPhone, leader)

      const outcome = await tickAndDrainAt(CHECK_IN_HOUR, church)

      expect(delivered).toEqual([])
      expect(outcome.sent).toBe(0)
      expect(outcome.accessUnread).toBe(false)
      expect(outcome.closedWithoutAccess).toBeGreaterThan(0)
      // Closed where it stood, saying why, and apart from anything about the recipient.
      expect(outcome.withheld).toBe(0)
      expect(await reasonOf(straggler)).toMatchObject({ sent_at: null, withheld_reason: 'church_has_no_access' })
      // The tick queued no check-in, and opened no conversation to be silent in.
      const { rows: checkIns } = await pool.query(
        `select 1 from outbound_message where ministry_id = $1 and scheduled_for is not null`,
        [church.id],
      )
      expect(checkIns).toEqual([])
      const { rows: sequences } = await pool.query(`select 1 from checkin_sequence where ministry_id = $1`, [church.id])
      expect(sequences).toEqual([])
    })

    it('does not close another church’s texts', async () => {
      const ended = await aChurch('Ended Next Door')
      const live = await aChurch('Live Next Door', true)
      await standsAt(ended.church, 'canceled')
      const theirs = await aStraggler(live.church, live.leaderPhone, live.leader)

      await drainAt(CHECK_IN_HOUR, ended.church)
      expect((await reasonOf(theirs)).withheld_reason).toBeNull()

      await drainAt(CHECK_IN_HOUR, live.church)
      expect((await reasonOf(theirs)).sent_at).not.toBeNull()
    })
  })

  describe('a church that ends, and restarts weeks later', () => {
    const ENDS = new Date('2031-03-05T10:00:00Z')
    // A Wednesday in a later week, in the morning: past that week's Monday 8pm, and
    // not at this church's hour, so nothing is due to be asked yet.
    const RESTARTS = new Date('2031-03-26T10:00:00Z')
    const HOUR_AFTER_RESTART = new Date('2031-03-26T20:00:00Z')

    it('sends nothing from before it ended, and asks afresh at its own hour', async () => {
      const { church, leaderPhone: asked } = await aChurch('Ends And Restarts')
      await standsAt(church, 'active', new Date(CHECK_IN_HOUR.getTime() - days(1)))
      const stuck = await aPairIn(church)
      refusing.add(stuck.leaderPhone)

      // Monday's check-ins: one reaches its Leader and stands unanswered, and Twilio
      // refuses the other, so it stays on the queue to go on a later drain.
      await tickAndDrainAt(CHECK_IN_HOUR, church)
      expect(delivered.map(({ to }) => to)).toEqual([asked])
      const asOfMonday = await rowsTo(church, stuck.leaderPhone)
      expect(asOfMonday.at(-1)!.sent_at).toBeNull()
      expect(asOfMonday.at(-1)!.withheld_reason).toBeNull()
      refusing.clear()
      delivered.length = 0

      // It ends. The hour's pass closes what was queued, and sends none of it.
      await standsAt(church, 'canceled', ENDS)
      const onEnding = await tickAndDrainAt(ENDS, church)
      expect(delivered).toEqual([])
      expect(onEnding.closedWithoutAccess).toBeGreaterThan(0)
      expect((await rowsTo(church, stuck.leaderPhone)).at(-1)!.withheld_reason).toBe('church_has_no_access')

      // The conversations stop with it, rather than standing to be chased later.
      const { rows: open } = await pool.query(
        `select 1 from checkin_sequence where ministry_id = $1 and closed_at is null`,
        [church.id],
      )
      expect(open).toEqual([])

      // Passes while it stands ended write nothing and send nothing.
      for (const offset of [days(1), days(7), days(14)]) {
        await tickAndDrainAt(new Date(ENDS.getTime() + offset), church)
      }
      expect(delivered).toEqual([])

      // It restarts. The first pass sends nothing: not the held check-in, and not a
      // reminder of Monday's unanswered question three weeks on.
      await standsAt(church, 'active', RESTARTS)
      const onRestart = await tickAndDrainAt(RESTARTS, church)
      expect(delivered).toEqual([])
      expect(onRestart.sent).toBe(0)
      expect((await rowsTo(church, stuck.leaderPhone)).at(-1)!.sent_at).toBeNull()

      // At its own hour, each Leader is asked this week's check-in, once.
      await tickAndDrainAt(HOUR_AFTER_RESTART, church)
      expect(delivered.map(({ to }) => to).sort()).toEqual([asked, stuck.leaderPhone].sort())
      expect((await rowsTo(church, stuck.leaderPhone))[0]!.sent_at).toBeNull()
      const again = await rowsTo(church, stuck.leaderPhone)
      expect(again.at(-1)!.enqueued_at).toEqual(HOUR_AFTER_RESTART)
      expect(again.at(-1)!.sent_at).not.toBeNull()
    })

    it('keeps an import’s plan waiting, and forms it and invites at the restart', async () => {
      const church = await createMinistryWithAdmin('Plans While Ended', undefined, { billedOutsideStripe: false })
      const leaderPhone = aTestPhoneNumber()
      const leader = await addPerson(church, 'Planned Leader', { phone: leaderPhone })
      const disciple = await addPerson(church, 'Planned Disciple', { phone: aTestPhoneNumber() })
      await completeIntake(church, personId(leader))
      await completeIntake(church, personId(disciple))
      await pool.query(
        `insert into intended_pairing (id, ministry_id, leader_id, participant_id, planned_at)
         values ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), church.id, leader, disciple, CHECK_IN_HOUR],
      )
      await standsAt(church, 'canceled')

      expect(await service(CHECK_IN_HOUR).settleIntendedPairings(church.id)).toEqual({
        fulfilled: 0,
        refused: 0,
        waiting: 1,
      })
      await drainAt(CHECK_IN_HOUR, church)
      expect(delivered).toEqual([])

      await standsAt(church, 'active', RESTARTS)
      expect((await service(RESTARTS).settleIntendedPairings(church.id)).fulfilled).toBe(1)
      await drainAt(RESTARTS, church)
      expect(delivered.map(({ to }) => to)).toEqual([leaderPhone])
    })
  })

  describe('when the access read fails', () => {
    /** The read as a real failing statement, in the transaction it was going to run in. */
    const theAccessReadFails = () => {
      const real = pg.Client.prototype.query
      vi.spyOn(pg.Client.prototype, 'query').mockImplementation(function (
        this: pg.Client,
        ...args: unknown[]
      ) {
        const text = typeof args[0] === 'string' ? args[0] : ''
        const statement = text.includes('app.billing_has_access') ? ['select 1 / 0 as has_access'] : args
        return (real as (...given: unknown[]) => unknown).apply(this, statement)
      } as never)
    }

    it('sends on, for a church that should text, and closes nothing', async () => {
      const { church, leaderPhone, leader } = await aChurch('Read Fails, Flagged', true)
      const straggler = await aStraggler(church, leaderPhone, leader)
      vi.spyOn(console, 'error').mockImplementation(() => {})
      theAccessReadFails()

      const outcome = await tickAndDrainAt(CHECK_IN_HOUR, church)

      expect(outcome.accessUnread).toBe(true)
      expect(outcome.closedWithoutAccess).toBe(0)
      expect(delivered.map(({ to }) => to)).toContain(leaderPhone)
      expect((await reasonOf(straggler)).sent_at).not.toBeNull()
    })

    it('never closes a row on a failed read, even for a church with a real no', async () => {
      const { church, leaderPhone, leader } = await aChurch('Read Fails, Ended')
      await standsAt(church, 'canceled')
      const straggler = await aStraggler(church, leaderPhone, leader)
      vi.spyOn(console, 'error').mockImplementation(() => {})
      theAccessReadFails()

      const outcome = await drainAt(CHECK_IN_HOUR, church)

      // The cost of the choice, stated: a church that has ended texts while the read
      // is broken, and the pass says so.
      expect(outcome.accessUnread).toBe(true)
      expect(outcome.closedWithoutAccess).toBe(0)
      expect((await reasonOf(straggler)).withheld_reason).toBeNull()
      expect((await reasonOf(straggler)).sent_at).not.toBeNull()
    })

    it('lets an Admin’s act through, in a transaction the failure did not poison', async () => {
      const { church } = await aChurch('Read Fails, Admin Acts')
      const third = personId(await addPerson(church, 'Third Person'))
      await completeIntake(church, third)
      const fourth = personId(await addPerson(church, 'Fourth Person'))
      await completeIntake(church, fourth)
      vi.spyOn(console, 'error').mockImplementation(() => {})
      theAccessReadFails()

      const { effects } = await service(CHECK_IN_HOUR).execute({
        type: 'relationship.create',
        ministryId: church.id,
        leaderIds: [third],
        participantIds: [fourth],
      })

      expect(effects.some((effect) => effect.kind === 'message.enqueue')).toBe(true)
    })

    it('leaves everything on the queue when the database will not list it, for the next drain', async () => {
      const { church, leaderPhone, leader } = await aChurch('Queue Unreadable', true)
      const straggler = await aStraggler(church, leaderPhone, leader)
      const real = pg.Client.prototype.query
      const spy = vi.spyOn(pg.Client.prototype, 'query').mockImplementation(function (
        this: pg.Client,
        ...args: unknown[]
      ) {
        const text = typeof args[0] === 'string' ? args[0] : ''
        const statement = text.includes('select id, person_id, to_phone') ? ['select 1 / 0'] : args
        return (real as (...given: unknown[]) => unknown).apply(this, statement)
      } as never)

      await expect(drainAt(CHECK_IN_HOUR, church)).rejects.toThrow()
      expect(await reasonOf(straggler)).toMatchObject({ sent_at: null, withheld_reason: null })
      spy.mockRestore()

      await drainAt(CHECK_IN_HOUR, church)
      expect((await reasonOf(straggler)).sent_at).not.toBeNull()
    })
  })

  describe('an inbound text to a church without access', () => {
    const inbound = (church: MinistryFixture, person: ReturnType<typeof personId>, body: string, at = CHECK_IN_HOUR) =>
      service(at).execute({ type: 'sms.inbound', ministryId: church.id, personId: person, body })

    /** A check-in out, answered before the hour's pass has seen the church end. */
    const askedThenEnded = async (name: string) => {
      const made = await aChurch(name)
      await standsAt(made.church, 'active', new Date(CHECK_IN_HOUR.getTime() - days(1)))
      await tickAndDrainAt(CHECK_IN_HOUR, made.church)
      delivered.length = 0
      await standsAt(made.church, 'canceled', new Date(CHECK_IN_HOUR.getTime() + 1000))
      return made
    }

    it('honours STOP, and START, and sends nothing back', async () => {
      const { church, leader } = await askedThenEnded('Stop While Ended')

      await inbound(church, leader, 'STOP')
      await drainAt(CHECK_IN_HOUR, church)
      const { rows: stopped } = await pool.query(
        `select 1 from person_opt_out where person_id = $1 and ended_at is null`,
        [leader],
      )
      expect(stopped).toHaveLength(1)

      await inbound(church, leader, 'START')
      await drainAt(CHECK_IN_HOUR, church)
      const { rows: started } = await pool.query(
        `select 1 from person_opt_out where person_id = $1 and ended_at is null`,
        [leader],
      )
      expect(started).toEqual([])
      expect(delivered).toEqual([])
    })

    it('keeps what was said, and closes the next question it would have asked', async () => {
      const { church, leader, leaderPhone } = await askedThenEnded('Answer While Ended')

      await inbound(church, leader, '1')
      const outcome = await drainAt(CHECK_IN_HOUR, church)

      expect(delivered).toEqual([])
      expect(outcome.closedWithoutAccess).toBeGreaterThan(0)
      const { rows: answered } = await pool.query(
        `select 1 from ministry_event where ministry_id = $1 and type like 'checkin.%answered%'`,
        [church.id],
      )
      expect(answered.length).toBeGreaterThan(0)
      expect((await rowsTo(church, leaderPhone)).at(-1)!.withheld_reason).toBe('church_has_no_access')
    })

    it('answers HELP with nothing, and still tells an Admin a Disciple asked', async () => {
      const { church, disciple } = await aChurch('Help While Ended')
      await standsAt(church, 'canceled')

      const { effects } = await inbound(church, disciple, 'HELP')
      const outcome = await drainAt(CHECK_IN_HOUR, church)

      expect(effects.some((effect) => effect.kind === 'message.enqueue')).toBe(true)
      expect(delivered).toEqual([])
      expect(outcome.closedWithoutAccess).toBeGreaterThan(0)
      const { rows } = await pool.query(
        `select 1 from follow_up_item where ministry_id = $1 and resolved_at is null`,
        [church.id],
      )
      expect(rows.length).toBeGreaterThan(0)
    })
  })

  describe('a link somebody was already texted, at a church without access', () => {
    it('still works, and what it would have texted is closed', async () => {
      const church = await createMinistryWithAdmin('Links While Ended', undefined, { billedOutsideStripe: true })
      const leader = personId(await addPerson(church, 'Late Leader', { phone: aTestPhoneNumber() }))
      const disciple = personId(await addPerson(church, 'Late Disciple', { phone: aTestPhoneNumber() }))
      await completeIntake(church, leader)
      await completeIntake(church, disciple)
      const created = await service(CHECK_IN_HOUR).execute({
        type: 'relationship.create',
        ministryId: church.id,
        leaderIds: [leader],
        participantIds: [disciple],
      })
      const issued = created.effects.flatMap((effect) =>
        effect.kind === 'invitation.issue' ? [effect.invitation.token] : [],
      )
      await drainAt(CHECK_IN_HOUR, church)
      delivered.length = 0

      await pool.query(`update ministry_billing set billed_outside_stripe = false where ministry_id = $1`, [church.id])
      await standsAt(church, 'canceled')

      const { effects } = await service(CHECK_IN_HOUR).execute({
        type: 'relationship.accept',
        ministryId: church.id,
        token: issued[0]!,
        fullName: 'Late Leader',
        userId: await anAccount(),
      })
      const outcome = await drainAt(CHECK_IN_HOUR, church)

      expect(effects.some((effect) => effect.kind === 'invitation.accept')).toBe(true)
      expect(delivered).toEqual([])
      expect(outcome.closedWithoutAccess).toBeGreaterThan(0)
    })
  })

  describe('an Admin’s act that would text, at a church without access', () => {
    let church: MinistryFixture
    let leader: ReturnType<typeof personId>
    let disciple: ReturnType<typeof personId>

    beforeAll(async () => {
      church = await createMinistryWithAdmin('Admin Acts While Ended', undefined, { billedOutsideStripe: false })
      await standsAt(church, 'canceled')
      leader = personId(await addPerson(church, 'Would Lead', { phone: aTestPhoneNumber() }))
      disciple = personId(await addPerson(church, 'Would Follow', { phone: aTestPhoneNumber() }))
      await completeIntake(church, leader)
      await completeIntake(church, disciple)
    }, 60_000)

    const queuedInAll = async () => {
      const { rows } = await pool.query<{ count: number }>(
        `select count(*)::int as count from outbound_message where ministry_id = $1`,
        [church.id],
      )
      return rows[0]!.count
    }

    it('refuses forming a pair, with a code, and writes nothing', async () => {
      const before = await queuedInAll()
      const attempt = service(CHECK_IN_HOUR).execute({
        type: 'relationship.create',
        ministryId: church.id,
        leaderIds: [leader],
        participantIds: [disciple],
      })

      await expect(attempt).rejects.toBeInstanceOf(PairingRefused)
      await expect(attempt).rejects.toMatchObject({ refusal: 'relationship.church_has_no_access' })
      expect(await queuedInAll()).toBe(before)
      const { rows } = await pool.query(`select 1 from relationship where ministry_id = $1`, [church.id])
      expect(rows).toEqual([])
    })

    it('says so when forming is only being checked', async () => {
      await expect(
        service(CHECK_IN_HOUR).checkPairing({
          type: 'relationship.create',
          ministryId: church.id,
          leaderIds: [leader],
          participantIds: [disciple],
        }),
      ).resolves.toBe('relationship.church_has_no_access')
    })

    const aGroupHere = (name: string, joinRequiresApproval = false) =>
      formGroup(church, {
        name,
        declaredGender: null,
        leader: { name: `${name} Leader`, phone: aTestPhoneNumber(), gender: 'female' },
        disciples: [{ name: `${name} Disciple`, gender: 'female' }],
        acceptedAt: new Date(CHECK_IN_HOUR.getTime() - weeks(1)),
        joinRequiresApproval,
      })

    it('refuses adding somebody to a group, whichever side they join', async () => {
      const group = await aGroupHere('The Gate Group')
      const joiner = personId(await addPerson(church, 'Joiner', { phone: aTestPhoneNumber(), answers: { gender: 'female' } }))
      const named = {
        ministryId: church.id,
        relationshipId: relationshipId(group.id),
        personId: joiner,
        addedBy: church.adminUserId,
      }

      const asADisciple = service(CHECK_IN_HOUR).execute({ type: 'group.add_participant', ...named })
      await expect(asADisciple).rejects.toBeInstanceOf(GroupJoinRefused)
      await expect(asADisciple).rejects.toMatchObject({ refusal: 'joining.church_has_no_access' })

      const asALeader = service(CHECK_IN_HOUR).execute({ type: 'group.add_leader', ...named })
      await expect(asALeader).rejects.toBeInstanceOf(GroupJoinRefused)
      await expect(asALeader).rejects.toMatchObject({ refusal: 'joining.church_has_no_access' })
    })

    it('refuses admitting somebody who asked to join, which tells the Leaders', async () => {
      const group = await aGroupHere('The Guarded Group', true)
      const joiner = await addPerson(church, 'Asked To Join', { phone: aTestPhoneNumber(), answers: { gender: 'female' } })
      const { rows } = await pool.query<{ id: string }>(
        `insert into follow_up_item (ministry_id, kind, person_id, relationship_id, raised_at)
         values ($1, 'group_join_requested', $2, $3, $4) returning id`,
        [church.id, joiner, group.id, CHECK_IN_HOUR],
      )

      const attempt = service(CHECK_IN_HOUR).execute({
        type: 'relationship.admit',
        ministryId: church.id,
        itemId: followUpItemId(rows[0]!.id),
        admittedBy: church.adminUserId,
      })

      await expect(attempt).rejects.toBeInstanceOf(GroupRefused)
      await expect(attempt).rejects.toMatchObject({ refusal: 'group.church_has_no_access' })
    })

    it('refuses resuming a pause, which tells the people in it', async () => {
      const paused = await aPairIn(church)
      await pauseRelationship(church, paused.relationship, 2, new Date(CHECK_IN_HOUR.getTime() - days(1)))

      const attempt = service(CHECK_IN_HOUR).execute({
        type: 'relationship.resume',
        ministryId: church.id,
        relationshipId: relationshipId(paused.relationship),
        resumedBy: church.adminUserId,
      })

      await expect(attempt).rejects.toBeInstanceOf(PauseRefused)
      await expect(attempt).rejects.toMatchObject({ refusal: 'pause.church_has_no_access' })
    })

    it('refuses sending an invitation again, and taking back one that would start a group', async () => {
      // Formed while the church could text: its invitations are out, one is accepted.
      const opened = await createMinistryWithAdmin('Invitations Out', undefined, { billedOutsideStripe: false })
      await standsAt(opened, 'active')
      const person = async (name: string) => {
        const id = personId(await addPerson(opened, name, { phone: aTestPhoneNumber(), answers: { gender: 'female' } }))
        await completeIntake(opened, id)
        return id
      }
      const accepting = await person('Accepting Leader')
      const waiting = await person('Waiting Leader')
      const created = await service(CHECK_IN_HOUR).execute({
        type: 'relationship.create',
        ministryId: opened.id,
        leaderIds: [accepting, waiting],
        participantIds: [await person('Their Disciple')],
        declaredGender: null,
        name: 'Two Leaders',
      })
      const tokenOf = (who: ReturnType<typeof personId>) => {
        for (const effect of created.effects) {
          if (effect.kind === 'invitation.issue' && effect.invitation.personId === who) {
            return { token: effect.invitation.token, relationship: effect.invitation.relationshipId }
          }
        }
        throw new Error('No invitation came out for that Leader')
      }
      await service(CHECK_IN_HOUR).execute({
        type: 'relationship.accept',
        ministryId: opened.id,
        token: tokenOf(accepting).token,
        fullName: 'Accepting Leader',
        userId: await anAccount(),
      })
      await standsAt(opened, 'canceled', new Date(CHECK_IN_HOUR.getTime() + 1000))

      const reissue = service(CHECK_IN_HOUR).execute({
        type: 'invitation.reissue',
        ministryId: opened.id,
        relationshipId: tokenOf(waiting).relationship,
        personId: waiting,
      })
      await expect(reissue).rejects.toBeInstanceOf(ReinvitationRefused)
      await expect(reissue).rejects.toMatchObject({ refusal: 'reinvite.church_has_no_access' })

      const withdrawal = service(CHECK_IN_HOUR).execute({
        type: 'invitation.withdraw',
        ministryId: opened.id,
        token: tokenOf(waiting).token,
        withdrawnBy: opened.adminUserId,
      })
      await expect(withdrawal).rejects.toBeInstanceOf(InvitationRefused)
      await expect(withdrawal).rejects.toMatchObject({ refusal: 'invitation.church_has_no_access' })
    })

    it('does not refuse an act that was never going to text', async () => {
      await expect(
        service(CHECK_IN_HOUR).execute({
          type: 'invitation.reissue',
          ministryId: church.id,
          relationshipId: relationshipId(crypto.randomUUID()),
          personId: leader,
        }),
      ).resolves.toMatchObject({ effects: [] })
    })
  })
})
