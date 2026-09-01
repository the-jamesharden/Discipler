import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, hours, type Clock } from '~/domain/clock'
import { outboundMessageId, personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createCommandService } from '~/service/command-service'
import { serialisationOf } from '~/domain/outstanding-reply'
import { dispatchQueue } from '~/service/outbound-dispatch'
import type { MessageTransport } from '~/service/ports'
import {
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * **A phone holds one conversation at a time.**
 *
 * The unit is the number and never the Person, so the fixture is the case that
 * makes the difference visible: one handset, two Leaders. A married couple, a
 * parent and a teenager -- ordinary, and the reason a rule keyed to the Person
 * would be the wrong rule.
 *
 * Every assertion is against what actually *left*, because a message enqueued and
 * a message sent are exactly what serialisation tells apart. The rows underneath
 * are how the wait is remembered.
 */
describe('one conversation per phone', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let queue: ReturnType<typeof createPostgresOutboundQueue>
  let pool: pg.Pool

  const ids: IdSource = { next: () => crypto.randomUUID() }

  beforeAll(async () => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    queue = createPostgresOutboundQueue(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await queue.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  /**
   * One Ministry per test, because a drain is Ministry-wide: a message another
   * test left waiting would be counted as this one's hold.
   */
  const aMinistry = async (name: string, startingAt: Date) => {
    const ministry: MinistryFixture = await createMinistryWithAdmin(name)
    let clock: Clock = createTestClock(startingAt)
    const sent: { to: string; body: string }[] = []
    const transport: MessageTransport = {
      async deliver(_from, to, body) {
        sent.push({ to, body })
      },
    }

    const service = () =>
      createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

    return {
      ministry,
      /** Moves the injected clock. Nothing here ever reads system time. */
      at(moment: Date) {
        clock = createTestClock(moment)
      },
      async congregant(fullName: string, phone: string) {
        const id = personId(await addPerson(ministry, fullName, { phone }))
        await completeIntake(ministry, id)
        return id
      },
      start: (person: PersonId) =>
        service().execute({
          type: 'checkin.start',
          ministryId: ministry.id,
          personId: person,
        }),
      texts: (person: PersonId, body: string) =>
        service().execute({
          type: 'sms.inbound',
          ministryId: ministry.id,
          personId: person,
          body,
        }),
      tick: () => service().execute({ type: 'scheduled.tick', ministryId: ministry.id }),
      drain: () =>
        dispatchQueue({ queue, transport, clock, ministryId: ministry.id }),
      /** What actually left, in the order the vendor was handed it. */
      arrivedAt: (phone: string) =>
        sent.filter((message) => message.to === phone).map((message) => message.body),
      /** Every conversation this number has held, newest first, as the queue sees it. */
      async conversationsOn(phone: string) {
        const { rows } = await pool.query<{ prompt_state: string | null; body: string }>(
          `select prompt_state, body from outbound_message
            where prompt_key = $1 order by enqueued_at desc, created_at desc`,
          [phone],
        )
        return rows
      },
      queueRow: (id: string) => outboundMessageId(id),
    }
  }

  /**
   * Waits until a `claim` is parked on the unique index, rather than guessing at it
   * with a timer.
   *
   * A worker taking a number that another transaction has taken and not yet
   * committed does not fail and does not proceed: the index makes it wait on that
   * transaction. Postgres says so in `pg_stat_activity`, so the test reads it there
   * -- a fixed delay would be the difference between proving the block and
   * usually observing it.
   */
  const blockedOnTheOpenReplyIndex = async () => {
    for (let attempt = 0; attempt < 400; attempt++) {
      const { rows } = await pool.query(
        `select 1 from pg_stat_activity
          where state = 'active' and wait_event_type = 'Lock'
            and query like '%reply_opened_at%'
          limit 1`,
      )
      if (rows.length > 0) return
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('the second worker never reached the index')
  }

  // A Monday at nine, which is the default cadence, so a suite that stays inside
  // one ISO week has no second check-in falling due in the middle of it.
  const monday = new Date('2026-10-05T09:00:00Z')

  it('holds the second question until the first one closes, and sends it then', async () => {
    const world = await aMinistry('Riverside Chapel', monday)

    // One handset. Ruth leads one relationship and her daughter Naomi leads
    // another, and Discipler dials the same number for both.
    const handset = aNumber()
    const ruth = await world.congregant('Ruth Adeyemi', handset)
    const naomi = await world.congregant('Naomi Adeyemi', handset)
    const tom = await world.congregant('Tom Hale', aNumber())
    const iris = await world.congregant('Iris Bantham', aNumber())
    await pairOneToOne(world.ministry, ruth, tom)
    await pairOneToOne(world.ministry, naomi, iris)

    await world.start(ruth)
    await world.start(naomi)

    // Two questions, both due, both bound for the same handset.
    const first = await world.drain()

    expect(first.sent).toBe(1)
    expect(first.held).toBe(1)
    expect(world.arrivedAt(handset)).toEqual([
      'Riverside Chapel: Did you meet with Tom Hale this week? Reply 1 for yes, 2 for no. ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    ])

    // Draining again changes nothing. The number is still busy, and a held message
    // is left neither sent nor withheld so the next pass reconsiders it.
    expect((await world.drain()).held).toBe(1)
    expect(world.arrivedAt(handset)).toHaveLength(1)

    // Ruth answers, which closes the conversation she was in -- and that is what
    // releases Naomi's. Nothing else changed: the number did not become free
    // because time passed.
    await world.texts(ruth, '2')
    const third = await world.drain()

    expect(third.held).toBe(0)
    expect(world.arrivedAt(handset).join('\n')).toContain(
      'Did you meet with Iris Bantham this week?',
    )
  })

  it('never holds a keyword command behind the check-in it is trying to interrupt', async () => {
    const world = await aMinistry('Northgate Fellowship', monday)

    const handset = aNumber()
    const ada = await world.congregant('Ada Nwosu', handset)
    const joel = await world.congregant('Joel Amankwah', aNumber())
    await pairOneToOne(world.ministry, ada, joel)

    await world.start(ada)
    await world.drain()
    expect(world.arrivedAt(handset)).toHaveLength(1)

    // The question is out and unanswered, so the number is busy. A Leader who texts
    // PAUSE is asking to step back from exactly this, and answering the check-in
    // first is not a condition anybody agreed to.
    await world.texts(ada, 'PAUSE')
    const outcome = await world.drain()

    expect(outcome.held).toBe(0)
    expect(world.arrivedAt(handset)[1]).toContain('Pause check-ins with Joel Amankwah')

    // And it took the number with it. The most recent prompt owns the next reply,
    // so the check-in question is superseded -- still unanswered, no longer the
    // thing a reply would bind to.
    const rows = await world.conversationsOn(handset)
    expect(rows[0]?.prompt_state).toBe('open')
    expect(rows[0]?.body).toContain('Pause check-ins')
    expect(rows[1]?.prompt_state).toBe('superseded')

    // Supersession *closes* a conversation; it does not free the number. The
    // question that lost it is closed and the keyword question holds it in the same
    // statement, so anything waiting goes on waiting -- for the exchange now, not
    // for the check-in. Nothing is ever released by supersession alone.
  })

  it('lets a message that expects no reply straight past, and takes nothing with it', async () => {
    const world = await aMinistry('Eastbrook Chapel', monday)

    const handset = aNumber()
    const sam = await world.congregant('Sam Okonkwo', handset)
    const grace = await world.congregant('Grace Miller', aNumber())
    await pairOneToOne(world.ministry, sam, grace)

    // A Starter Message, put on the queue directly because acceptance is not what
    // is under test. What is, is that the queue lets a `no_reply` row past without
    // taking the number. That acceptance actually enqueues the Starter Message as
    // `no_reply` -- the other half of the claim, and the one this row asserts
    // nothing about -- is `tests/domain/accepting-an-invitation`'s.
    await pool.query(
      `insert into outbound_message
         (ministry_id, person_id, to_phone, body, enqueued_at, prompt_key, message_kind)
       values ($1, $2, $3, $4, $5, $3, 'no_reply')`,
      [
        world.ministry.id,
        sam,
        handset,
        'Eastbrook Chapel: you have been paired.',
        new Date(monday.getTime() - hours(1)),
      ],
    )

    await world.start(sam)
    const outcome = await world.drain()

    // Both, on one drain, in the order they were queued.
    expect(outcome.held).toBe(0)
    expect(world.arrivedAt(handset)).toEqual([
      'Eastbrook Chapel: you have been paired.',
      'Eastbrook Chapel: Did you meet with Grace Miller this week? Reply 1 for yes, 2 for no. ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    ])

    // And only one of the two is holding the number.
    const rows = await world.conversationsOn(handset)
    expect(rows.map((row) => row.prompt_state)).toEqual(['open', null])
  })

  it('releases a hold when the sweep runs, forty-eight hours later', async () => {
    const world = await aMinistry('Hillside Church', monday)

    const handset = aNumber()
    const esther = await world.congregant('Esther Vale', handset)
    const ruthie = await world.congregant('Ruthie Vale', handset)
    const dan = await world.congregant('Dan Priestley', aNumber())
    const mo = await world.congregant('Mo Farrah', aNumber())
    await pairOneToOne(world.ministry, esther, dan)
    await pairOneToOne(world.ministry, ruthie, mo)

    await world.start(esther)
    await world.start(ruthie)
    expect((await world.drain()).held).toBe(1)

    // A day on, the question is only reminded. The reminder re-sends what is
    // already out, so it neither waits for the number nor frees it.
    world.at(new Date(monday.getTime() + hours(24)))
    await world.tick()
    expect((await world.drain()).held).toBe(1)

    // Forty-eight hours, and a reply can no longer change anything: twenty-four to
    // the reminder and twenty-four more before the sequence moves on without it.
    // Still the same ISO week, so no new cadence has fallen due -- the sweep is the
    // only thing that could let the second question through.
    world.at(new Date(monday.getTime() + hours(48)))
    await world.tick()

    const scheduled = async (name: string) => {
      const { rows } = await pool.query<{ prompt_state: string | null; sent_at: Date | null }>(
        `select prompt_state, sent_at from outbound_message
          where prompt_key = $1 and message_kind = 'scheduled_question'
            and body like '%' || $2 || '%'`,
        [handset, name],
      )
      return rows[0]
    }

    // The sweep closed the question Esther never answered, and until it did, the
    // question for Ruthie had never left the queue.
    expect((await scheduled('Dan Priestley'))?.prompt_state).toBe('timed_out')
    expect((await scheduled('Mo Farrah'))?.sent_at).toBeNull()

    const released = await world.drain()
    expect(released.held).toBe(0)

    const freed = await scheduled('Mo Farrah')
    expect(freed?.sent_at).not.toBeNull()
    expect(freed?.prompt_state).toBe('open')
  })

  it('releases it at the start of a new week, before forty-eight hours are up', async () => {
    // A Saturday afternoon.
    const saturday = new Date('2026-10-10T14:00:00Z')
    const world = await aMinistry('Trinity Fellowship', saturday)

    const handset = aNumber()
    const paul = await world.congregant('Paul Adeyemi', handset)
    const rita = await world.congregant('Rita Chen', aNumber())
    await pairOneToOne(world.ministry, paul, rita)

    await world.start(paul)
    await world.drain()

    // Monday at nine is forty-three hours later, so the sweep would not have
    // touched it. The week that just began has replaced the question anyway, which
    // is what makes room for its own.
    world.at(new Date('2026-10-12T09:00:00Z'))
    await world.tick()

    const outcome = await world.drain()
    expect(outcome.held).toBe(0)

    const rows = await world.conversationsOn(handset)
    expect(rows[0]?.prompt_state).toBe('open')
    expect(rows[1]?.prompt_state).toBe('timed_out')
  })

  it('gives a Keyword Exchange twenty-four hours, and never reminds anybody about it', async () => {
    const world = await aMinistry('Cornerstone Chapel', monday)

    // Check-ins on a Saturday here, so the ticks below advance the clock without
    // a cadence falling due in the middle of what is being measured.
    await pool.query(`update ministry set checkin_day = 6 where id = $1`, [
      world.ministry.id,
    ])

    const handset = aNumber()
    const ada = await world.congregant('Ada Nwosu', handset)
    const joel = await world.congregant('Joel Amankwah', aNumber())
    await pairOneToOne(world.ministry, ada, joel)

    // A pause Ada asked for and then never answered. No check-in is open, so
    // nothing else on this number is running on a clock of its own.
    await world.texts(ada, 'PAUSE')
    await world.drain()
    expect(world.arrivedAt(handset)[0]).toContain('Pause check-ins with Joel Amankwah')

    // A scheduled question behind it, put on the queue directly so that the only
    // thing keeping it there is the exchange.
    await pool.query(
      `insert into outbound_message
         (ministry_id, person_id, to_phone, body, enqueued_at, prompt_key, message_kind)
       values ($1, $2, $3, 'Cornerstone Chapel: did you meet?', $4, $3, 'scheduled_question')`,
      [world.ministry.id, ada, handset, monday],
    )

    // Twenty-three hours in, it is still Ada's request to answer.
    world.at(new Date(monday.getTime() + hours(23)))
    await world.tick()
    expect((await world.drain()).held).toBe(1)
    expect(world.arrivedAt(handset)).toHaveLength(1)

    // Twenty-four, and it is not. **With no reminder** -- a check-in question is
    // Discipler's question and is worth re-sending once, and re-prompting a Leader
    // about a request they abandoned is nagging.
    world.at(new Date(monday.getTime() + hours(24)))
    await world.tick()

    const rows = await world.conversationsOn(handset)
    expect(rows.find((row) => row.body.includes('Pause check-ins'))?.prompt_state).toBe(
      'timed_out',
    )

    const released = await world.drain()
    expect(released.held).toBe(0)
    expect(world.arrivedAt(handset)).toEqual([
      expect.stringContaining('Pause check-ins with Joel Amankwah'),
      'Cornerstone Chapel: did you meet?',
    ])
  })

  it('cannot be talked into two conversations by two workers draining at once', async () => {
    const world = await aMinistry('Grace Community', monday)

    const handset = aNumber()
    const leah = await world.congregant('Leah Osei', handset)

    const { rows } = await pool.query<{ id: string }>(
      `insert into outbound_message
         (ministry_id, person_id, to_phone, body, enqueued_at, prompt_key, message_kind)
       values ($1, $2, $3, 'Grace Community: first?',  $4, $3, 'scheduled_question'),
              ($1, $2, $3, 'Grace Community: second?', $4, $3, 'scheduled_question')
       returning id`,
      [world.ministry.id, leah, handset, monday],
    )
    const [first, second] = rows.map((row) => row.id) as [string, string]

    // The losing interleaving, held open rather than raced for. Two `claim` calls
    // fired at once would usually have the first one *committed* before the second
    // one looks, and the second would then be refused by the ordinary busy check --
    // the case that needs no index at all. So the first worker is played by hand,
    // and stopped between taking the number and committing it.
    const firstWorker = await pool.connect()
    try {
      await firstWorker.query('begin')
      await firstWorker.query(
        `update outbound_message set prompt_state = 'open', reply_opened_at = $2
          where id = $1`,
        [first, monday],
      )

      // Uncommitted, so the second worker's busy check reads the number as free.
      // This is precisely what the row locks cannot catch: two workers, two
      // different rows, nothing shared but the key.
      const secondWorker = queue.claim(
        world.ministry.id,
        world.queueRow(second),
        serialisationOf('scheduled_question'),
        monday,
      )

      // It gets past the check and blocks on the index, which is where it stays
      // until the first worker commits or aborts. Waited for rather than slept
      // through, so the test proves the block instead of hoping for it.
      await blockedOnTheOpenReplyIndex()
      await firstWorker.query('commit')

      // And the index, not the check, is what refuses it -- reported as the same
      // `held` a busy number gets, because it means the same thing to a dispatcher.
      expect(await secondWorker).toBe('held')
    } finally {
      firstWorker.release()
    }

    const open = (await world.conversationsOn(handset)).filter(
      (row) => row.prompt_state === 'open',
    )
    expect(open).toHaveLength(1)
  })

  it('times out a conversation the worker opened and never finished sending', async () => {
    const world = await aMinistry('Wellspring Church', monday)

    const handset = aNumber()
    const zoe = await world.congregant('Zoe Marsh', handset)

    // A worker that claimed the number and was killed before Twilio answered. It
    // holds the conversation and has no `sent_at`, so a sweep measured from the
    // send would step straight over the one hold nobody else can release.
    const { rows } = await pool.query<{ id: string }>(
      `insert into outbound_message
         (ministry_id, person_id, to_phone, body, enqueued_at, prompt_key, message_kind)
       values ($1, $2, $3, 'Wellspring Church: did you meet?', $4, $3, 'scheduled_question'),
              ($1, $2, $3, 'Wellspring Church: and this week?', $4, $3, 'scheduled_question')
       returning id`,
      [world.ministry.id, zoe, handset, monday],
    )

    expect(
      await queue.claim(
        world.ministry.id,
        world.queueRow(rows[0]!.id),
        serialisationOf('scheduled_question'),
        monday,
      ),
    ).toBe('claimed')

    const abandoned = await world.conversationsOn(handset)
    expect(abandoned.filter((row) => row.prompt_state === 'open')).toHaveLength(1)

    // Forty-eight hours from when the number was taken, not from a send that never
    // happened. Same ISO week, so nothing else could have closed it.
    world.at(new Date(monday.getTime() + hours(48)))
    await world.tick()

    const { rows: stranded } = await pool.query<{ prompt_state: string; sent_at: Date | null }>(
      `select prompt_state, sent_at from outbound_message where id = $1`,
      [rows[0]!.id],
    )
    expect(stranded[0]?.sent_at).toBeNull()
    expect(stranded[0]?.prompt_state).toBe('timed_out')
  })

  it('lets two Ministries reach one handset without either holding the other up', async () => {
    // A number a Person is reachable on in two congregations. Neither Ministry may
    // read, sweep or close the other's rows, so a conversation shared across the two
    // would be a hold with nothing on either side able to release it. Whether one
    // handset is one conversation or two is ticket 26's question; it is not answered
    // here by making one tenant wait on a row it may not see.
    const handset = aNumber()
    const riverside = await aMinistry('Fieldstone Chapel', monday)
    const northgate = await aMinistry('Harbour Church', monday)

    const here = await riverside.congregant('Priya Raman', handset)
    const there = await northgate.congregant('Priya Raman', handset)

    for (const [world, person] of [
      [riverside, here],
      [northgate, there],
    ] as const) {
      await pool.query(
        `insert into outbound_message
           (ministry_id, person_id, to_phone, body, enqueued_at, prompt_key, message_kind)
         values ($1, $2, $3, $4, $5, $3, 'scheduled_question')`,
        [world.ministry.id, person, handset, `${world.ministry.name}: did you meet?`, monday],
      )
    }

    expect((await riverside.drain()).held).toBe(0)
    expect((await northgate.drain()).held).toBe(0)
    expect(riverside.arrivedAt(handset)).toEqual(['Fieldstone Chapel: did you meet?'])
    expect(northgate.arrivedAt(handset)).toEqual(['Harbour Church: did you meet?'])
  })

  it('refuses a conversation that cannot say when it opened', async () => {
    // Every timeout is measured from that moment, so a row without one is a hold
    // the sweep would never reach.
    const world = await aMinistry('Lakeview Chapel', monday)

    const handset = aNumber()
    const eve = await world.congregant('Eve Sandoval', handset)

    await expect(
      pool.query(
        `insert into outbound_message
           (ministry_id, person_id, to_phone, body, enqueued_at, prompt_key,
            message_kind, prompt_state)
         values ($1, $2, $3, 'Lakeview Chapel: did you meet?', $4, $3,
                 'scheduled_question', 'open')`,
        [world.ministry.id, eve, handset, monday],
      ),
    ).rejects.toThrow(/outbound_message_an_open_reply_knows_when_it_opened/)
  })

  it('refuses a second open conversation on one number even if something asks for it', async () => {
    // The index the two workers above contend on, stated directly. They hold two
    // different row locks and share nothing else, so this is the whole of what
    // stops both of them deciding the number is free.
    const world = await aMinistry('Beacon Chapel', monday)

    const handset = aNumber()
    const noah = await world.congregant('Noah Bright', handset)

    await expect(
      pool.query(
        `insert into outbound_message
           (ministry_id, person_id, to_phone, body, enqueued_at, prompt_key,
            message_kind, prompt_state, reply_opened_at)
         values ($1, $2, $3, 'Beacon Chapel: one?', $4, $3, 'scheduled_question', 'open', $4),
                ($1, $2, $3, 'Beacon Chapel: two?', $4, $3, 'scheduled_question', 'open', $4)`,
        [world.ministry.id, noah, handset, monday],
      ),
    ).rejects.toThrow(/outbound_message_one_open_reply_per_number/)
  })
})
