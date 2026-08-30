import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, hours, minutes } from '~/domain/clock'
import { personId } from '~/domain/ids'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { dispatchQueue } from '~/service/outbound-dispatch'
import type { MessageTransport } from '~/service/ports'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The ceilings against a real database. The rule itself is proven in
 * `tests/domain/nudge-limits.test.ts`; what is proven here is that the queue
 * answers the questions the rule asks -- which nudges were *sent*, and whose day
 * and week they fall in -- and that a nudge cannot be enqueued in the one shape
 * that would make it uncountable.
 */
describe('The nudge ceilings hold at the sending layer', () => {
  let ministry: MinistryFixture
  let queue: ReturnType<typeof createPostgresOutboundQueue>
  let pool: pg.Pool
  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))

  const sent: { to: string; body: string }[] = []
  const transport: MessageTransport = {
    async deliver(to, body) {
      sent.push({ to, body })
    },
  }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    queue = createPostgresOutboundQueue(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await queue.close()
    await pool.end()
  })

  /**
   * A consenting Person on the Roster, which is the only kind a nudge reaches --
   * the database refuses to enqueue anything for anyone else, well before any of
   * these ceilings get a say.
   */
  const consentingPerson = (name: string, phone: string): Promise<string> =>
    addPerson(ministry, name, { phone: `+1${phone}` })

  const enqueueNudge = async (person: string, phone: string): Promise<void> => {
    await pool.query(
      `insert into outbound_message
         (ministry_id, person_id, to_phone, body, enqueued_at, kind)
       values ($1, $2, $3, $4, $5, 'nudge')`,
      [ministry.id, person, phone, 'A quick check in from Riverside Chapel.', clock.now()],
    )
  }

  const drain = () => dispatchQueue({ queue, transport, clock, ministryId: ministry.id })

  const reasonsFor = async (person: string): Promise<(string | null)[]> => {
    const { rows } = await pool.query<{ withheld_reason: string | null }>(
      `select withheld_reason from outbound_message
        where person_id = $1 and kind = 'nudge'
        order by enqueued_at, id`,
      [person],
    )
    return rows.map((row) => row.withheld_reason)
  }

  it('sends one message however many times Nudge is clicked', async () => {
    const phone = '5553340001'
    const person = await consentingPerson('Emily Johnson', phone)
    sent.length = 0

    for (let click = 0; click < 20; click++) {
      await enqueueNudge(person, `+1${phone}`)
    }

    const outcome = await drain()

    expect(outcome).toEqual({ sent: 1, withheld: 19 })
    expect(sent).toHaveLength(1)

    // The nineteen are neither delivered nor lost. They stay on the queue saying
    // which ceiling refused them, because a congregant who did not receive
    // something is a thing an Admin has to be able to find out about.
    const reasons = await reasonsFor(person)
    expect(reasons.filter((reason) => reason === null)).toHaveLength(1)
    expect(new Set(reasons.filter((reason) => reason !== null))).toEqual(
      new Set(['nudge_within_cooldown']),
    )
  })

  it('spends no budget on a nudge it withheld', async () => {
    const phone = '5553340002'
    const person = await consentingPerson('Marcus Webb', phone)
    sent.length = 0

    await enqueueNudge(person, `+1${phone}`)
    await enqueueNudge(person, `+1${phone}`)
    await enqueueNudge(person, `+1${phone}`)
    await drain()
    expect(sent).toHaveLength(1)

    // Two were refused. Neither counted against the day or the week, so once the
    // cooldown runs the next one goes -- the property ticket 20 leans on when it
    // holds a message rather than sending it.
    clock.advanceBy(hours(12) + minutes(1))
    await enqueueNudge(person, `+1${phone}`)
    await drain()
    expect(sent).toHaveLength(2)
  })

  it('does not meter anything that is not a nudge', async () => {
    const phone = '5553340003'
    const person = await consentingPerson('Alicia Ruiz', phone)
    sent.length = 0

    // Enqueued the way the Check-In Rhythm and a Welcome Message are, with no kind
    // named. The column defaults to unmetered, so no existing path had to change
    // to keep meaning what it already meant.
    for (let n = 0; n < 5; n++) {
      await pool.query(
        `insert into outbound_message (ministry_id, person_id, to_phone, body, enqueued_at)
         values ($1, $2, $3, $4, $5)`,
        [ministry.id, person, `+1${phone}`, `Did you meet this week? (${n})`, clock.now()],
      )
    }

    const outcome = await drain()

    expect(outcome).toEqual({ sent: 5, withheld: 0 })
    expect(sent).toHaveLength(5)
  })

  it('refuses to queue a nudge that names no Person to count it against', async () => {
    // The caps are counted per recipient Person. A nudge with no Person behind it
    // could be counted against nothing, so it is refused where it cannot be
    // forgotten rather than discovered as an unmetered path later.
    await expect(
      pool.query(
        `insert into outbound_message
           (ministry_id, person_id, to_phone, body, enqueued_at, kind)
         values ($1, null, $2, $3, $4, 'nudge')`,
        [ministry.id, '+15553349999', 'Unattributed.', clock.now()],
      ),
    ).rejects.toThrow(/outbound_message_nudge_names_a_person/)
  })

  it('reads the Ministry’s own timezone, and only for its own Ministry', async () => {
    expect(await queue.timeZoneOf(ministry.id)).toBe('UTC')
  })

  it('counts only nudges that were sent, and only this Ministry’s', async () => {
    const phone = '5553340004'
    const person = await consentingPerson('Dana Whitfield', phone)
    const since = new Date('2026-01-01T00:00:00Z')

    await enqueueNudge(person, `+1${phone}`)
    await enqueueNudge(person, `+1${phone}`)
    expect(await queue.nudgesSentTo(ministry.id, personId(person), since)).toEqual([])

    sent.length = 0
    await drain()

    // One sent, one withheld, and only the sent one is in the budget.
    const counted = await queue.nudgesSentTo(ministry.id, personId(person), since)
    expect(counted).toHaveLength(1)

    // Another Ministry asking about the same Person sees nothing of theirs.
    const other = await createMinistryWithAdmin('Northgate Fellowship')
    expect(await queue.nudgesSentTo(other.id, personId(person), since)).toEqual([])

    // And a window that opens after the send excludes it.
    const only = counted[0]
    if (!only) throw new Error('The nudge under test was not recorded as sent')
    const afterwards = new Date(only.getTime() + minutes(1))
    expect(await queue.nudgesSentTo(ministry.id, personId(person), afterwards)).toEqual([])
  })
})
