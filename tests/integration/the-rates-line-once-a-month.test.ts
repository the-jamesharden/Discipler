import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, minutes } from '~/domain/clock'
import { enqueueMessage } from '~/domain/effects'
import { personId, relationshipId, type IdSource, type PersonId } from '~/domain/ids'
import { groupJoinedMessage, invitationMessage, starterMessageToLeader } from '~/domain/outbound-copy'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { applyEffects, createCommandService } from '~/service/command-service'
import { dispatchQueue } from '~/service/outbound-dispatch'
import type { MessageTransport } from '~/service/ports'
import {
  aTestPhoneNumber,
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Text wording, ticket 01, against the real queue. *Msg & data rates may apply.
 * Reply STOP to opt out, HELP for help.* reaches a Person at most once a calendar
 * month, on the first text of that month that would carry it -- decided per
 * Person, in the Ministry's own month, and recorded on the row as a fact.
 *
 * The dates are July and August 2026, in the past, so no assertion here depends on
 * where the real calendar is.
 */

const LINE = 'Msg & data rates may apply. Reply STOP to opt out, HELP for help.'

describe('the rates line, once a month', () => {
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

  /** A Ministry of its own per scenario, on the clock the scenario names. */
  const aMinistry = async (name: string, timezone = 'UTC') => {
    const ministry = await createMinistryWithAdmin(name)
    await pool.query(`update ministry set timezone = $2 where id = $1`, [ministry.id, timezone])

    const serviceAt = (now: Date) =>
      createCommandService({
        clock: createTestClock(now),
        ids,
        store,
        appBaseUrl: 'https://discipler.test',
      })

    const congregant = async (fullName: string) =>
      personId(await addPerson(ministry, fullName, { phone: aNumber() }))

    const aRelationship = async (leader: PersonId, participant: PersonId) =>
      relationshipId(
        await pairOneToOne(ministry, leader, participant, {
          createdAt: new Date('2026-06-01T09:00:00Z'),
          acceptedAt: new Date('2026-06-01T09:00:00Z'),
        }),
      )

    /**
     * A resume: the text an Admin's act sends everyone in a relationship, and one
     * that may carry the line. Paused a minute before, so there is something to
     * resume.
     */
    const resumeAt = async (now: Date, relationship: ReturnType<typeof relationshipId>) => {
      await serviceAt(new Date(now.getTime() - minutes(1))).execute({
        type: 'relationship.pause',
        ministryId: ministry.id,
        relationshipId: relationship,
        pausedBy: ministry.adminUserId,
      })
      await serviceAt(now).execute({
        type: 'relationship.resume',
        ministryId: ministry.id,
        relationshipId: relationship,
        resumedBy: ministry.adminUserId,
      })
    }

    return { ministry, serviceAt, congregant, aRelationship, resumeAt }
  }

  /** Every text queued for one Person, oldest first, and what the row says it carried. */
  const inbox = async (ministry: MinistryFixture, person: PersonId) => {
    const { rows } = await pool.query<{ body: string; carries_rates_line: boolean }>(
      `select body, carries_rates_line from outbound_message
        where ministry_id = $1 and person_id = $2
        order by enqueued_at, created_at`,
      [ministry.id, person],
    )
    return rows
  }

  const carried = async (ministry: MinistryFixture, person: PersonId) =>
    (await inbox(ministry, person)).map((row) => row.carries_rates_line)

  const firstGoalId = async (ministry: MinistryFixture): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )
    return rows[0]!.id
  }

  it('rides on first contact, is left off a text later that month, and returns the next', async () => {
    const church = await aMinistry('Welcome Chapel')
    const phone = aTestPhoneNumber()

    await church.serviceAt(new Date('2026-07-02T15:00:00Z')).execute({
      type: 'intake.submit',
      ministryId: church.ministry.id,
      form: {
        fullName: 'Emily Hart',
        phone: phone.slice(2),
        email: null,
        ageBand: '25-34',
        gender: 'female',
        goalId: await firstGoalId(church.ministry),
        availability: ['monday:12'],
        smsConsent: true,
        contactSharing: 'granted',
        source: 'pastor_link',
        intakePath: null,
        declaredSide: null,
        experience: null,
        groupId: null,
      },
    })
    const { rows } = await pool.query<{ id: string }>(
      `select id from person where ministry_id = $1 and phone = $2`,
      [church.ministry.id, phone],
    )
    const emily = personId(rows[0]!.id)

    const [welcome] = await inbox(church.ministry, emily)
    expect(welcome).toEqual({ body: expect.stringMatching(/^Discipler: Welcome Chapel: /), carries_rates_line: true })
    expect(welcome!.body.endsWith(LINE)).toBe(true)

    const leader = await church.congregant('James Ellis')
    const relationship = await church.aRelationship(leader, emily)

    // The same month as the Welcome: left off hers, and carried on his, since he
    // has never been sent it. One command, decided per Person.
    await church.resumeAt(new Date('2026-07-14T18:00:00Z'), relationship)
    expect((await inbox(church.ministry, emily))[1]).toEqual({
      body: 'Welcome Chapel: Your discipleship with James Ellis has been resumed!',
      carries_rates_line: false,
    })
    expect(await inbox(church.ministry, leader)).toEqual([
      {
        body: `Welcome Chapel: Your discipleship with Emily Hart has been resumed! ${LINE}`,
        carries_rates_line: true,
      },
    ])

    // A new month: carried again.
    await church.resumeAt(new Date('2026-08-03T18:00:00Z'), relationship)
    expect(await carried(church.ministry, emily)).toEqual([true, false, true])
  })

  it('leaves it off a Leader’s first check-in of the month after another text carried it', async () => {
    const church = await aMinistry('Check-In Chapel')
    const leader = await church.congregant('James Ellis')
    const relationship = await church.aRelationship(leader, await church.congregant('Emily Hart'))

    await church.resumeAt(new Date('2026-07-06T18:00:00Z'), relationship)
    await church.serviceAt(new Date('2026-07-13T09:00:00Z')).execute({
      type: 'checkin.start',
      ministryId: church.ministry.id,
      personId: leader,
    })

    const [, question] = await inbox(church.ministry, leader)
    expect(question).toEqual({
      body: 'Check-In Chapel: Did you meet with Emily Hart this week? Reply 1 for yes, 2 for no.',
      carries_rates_line: false,
    })
  })

  it('carries it on a Leader’s first check-in of a month nothing else carried it in', async () => {
    const church = await aMinistry('New Month Chapel')
    const leader = await church.congregant('James Ellis')
    const relationship = await church.aRelationship(leader, await church.congregant('Emily Hart'))

    await church.resumeAt(new Date('2026-07-27T18:00:00Z'), relationship)
    await church.serviceAt(new Date('2026-08-03T09:00:00Z')).execute({
      type: 'checkin.start',
      ministryId: church.ministry.id,
      personId: leader,
    })

    expect(await carried(church.ministry, leader)).toEqual([true, true])
    expect((await inbox(church.ministry, leader))[1]!.body.endsWith(LINE)).toBe(true)
  })

  it('sends it once to a Leader of three relationships', async () => {
    const church = await aMinistry('Three Chapel')
    const leader = await church.congregant('James Ellis')
    const emily = await church.congregant('Emily Hart')
    const marcus = await church.congregant('Marcus Bell')
    const ade = await church.congregant('Ade Obi')
    const withEmily = await church.aRelationship(leader, emily)
    const withMarcus = await church.aRelationship(leader, marcus)
    const withAde = await church.aRelationship(leader, ade)

    await church.resumeAt(new Date('2026-07-06T18:00:00Z'), withEmily)
    await church.resumeAt(new Date('2026-07-07T18:00:00Z'), withMarcus)
    await church.resumeAt(new Date('2026-07-08T18:00:00Z'), withAde)

    expect(await carried(church.ministry, leader)).toEqual([true, false, false])
    // Each of the three has had it once, on their own first text.
    for (const participant of [emily, marcus, ade]) {
      expect(await carried(church.ministry, participant)).toEqual([true])
    }
  })

  it('carries it once between two texts queued to one Person in the same command', async () => {
    const church = await aMinistry('One Command Chapel')
    const leader = await church.congregant('James Ellis')
    const at = new Date('2026-07-06T18:00:00Z')
    const dashboardLink = 'https://discipler.test/relationships'
    const to = (body: string, ratesLine: 'once_a_month' | 'never') =>
      enqueueMessage({
        ministryId: church.ministry.id,
        personId: leader,
        toPhone: aNumber(),
        body,
        enqueuedAt: at,
        disclosesPersonId: null,
        kind: 'no_reply',
        ratesLine,
      })

    await store.transact(church.ministry.id, (unit) =>
      applyEffects(
        [
          to(
            invitationMessage({
              ministryName: 'One Command Chapel',
              fullName: 'James Ellis',
              leaderNoun: 'mentor',
              link: 'https://discipler.test/invitation/x',
            }),
            'never',
          ),
          to(starterMessageToLeader({ ministryName: 'One Command Chapel', dashboardLink }), 'once_a_month'),
          to(
            groupJoinedMessage({
              ministryName: 'One Command Chapel',
              joinerFullName: 'Ade Obi',
              groupName: 'Tuesday men',
              dashboardLink,
            }),
            'once_a_month',
          ),
        ],
        unit,
      ),
    )

    const texts = await inbox(church.ministry, leader)
    expect(texts.map((row) => row.carries_rates_line)).toEqual([false, true, false])
    expect(texts.filter((row) => row.body.includes(LINE))).toHaveLength(1)
  })

  it('turns the month at the Ministry’s midnight, not UTC’s', async () => {
    // Sydney is ten hours ahead in July and August. 15:00 UTC on 31 July is 1am on
    // 1 August there: a new month in Sydney and the same one in UTC.
    const sydney = await aMinistry('Harbour Chapel', 'Australia/Sydney')
    const utc = await aMinistry('Meridian Chapel')
    const instants = [
      new Date('2026-07-31T12:00:00Z'), // 10pm, 31 July, Sydney
      new Date('2026-07-31T15:00:00Z'), // 1am, 1 August, Sydney
      new Date('2026-08-01T05:00:00Z'), // 3pm, 1 August, Sydney
    ]

    for (const church of [sydney, utc]) {
      const leader = await church.congregant('James Ellis')
      const relationship = await church.aRelationship(leader, await church.congregant('Emily Hart'))
      for (const at of instants) await church.resumeAt(at, relationship)
    }

    const leaderOf = async (church: MinistryFixture) => {
      const { rows } = await pool.query<{ id: string }>(
        `select id from person where ministry_id = $1 and full_name = 'James Ellis'`,
        [church.id],
      )
      return personId(rows[0]!.id)
    }

    expect(await carried(sydney.ministry, await leaderOf(sydney.ministry))).toEqual([true, true, false])
    expect(await carried(utc.ministry, await leaderOf(utc.ministry))).toEqual([true, false, true])
  })

  describe('a text that was never read', () => {
    const delivered: string[] = []
    const accepting: MessageTransport = {
      async deliver(_from, _to, body) {
        delivered.push(body)
      },
    }
    const refusing: MessageTransport = {
      async deliver() {
        throw new Error('the vendor refused it')
      },
    }

    it('does not count where it was withheld at send time', async () => {
      const church = await aMinistry('Withheld Chapel')
      const leader = await church.congregant('James Ellis')
      const emily = await church.congregant('Emily Hart')
      const relationship = await church.aRelationship(leader, emily)
      const drain = (transport: MessageTransport, at: Date) =>
        dispatchQueue({ queue, transport, clock: createTestClock(at), ministryId: church.ministry.id })

      // Queued carrying the line, and then she says STOP before it goes: the
      // sending layer withholds it, so she never read it.
      await church.resumeAt(new Date('2026-07-06T18:00:00Z'), relationship)
      await church.serviceAt(new Date('2026-07-06T18:02:00Z')).execute({
        type: 'sms.inbound',
        ministryId: church.ministry.id,
        personId: emily,
        body: 'STOP',
      })
      await drain(accepting, new Date('2026-07-06T18:05:00Z'))

      const { rows } = await pool.query<{ withheld_reason: string | null }>(
        `select withheld_reason from outbound_message where person_id = $1`,
        [emily],
      )
      expect(rows.map((row) => row.withheld_reason)).toEqual(['recipient_opted_out'])

      await church.serviceAt(new Date('2026-07-07T10:00:00Z')).execute({
        type: 'sms.inbound',
        ministryId: church.ministry.id,
        personId: emily,
        body: 'START',
      })
      await church.resumeAt(new Date('2026-07-08T18:00:00Z'), relationship)

      expect(await carried(church.ministry, emily)).toEqual([true, true])
      // He was sent both, and read the line on the first.
      expect(await carried(church.ministry, leader)).toEqual([true, false])
    })

    it('still counts where the vendor refused it, because it is tried again until it goes', async () => {
      const church = await aMinistry('Retried Chapel')
      const leader = await church.congregant('James Ellis')
      const emily = await church.congregant('Emily Hart')
      const relationship = await church.aRelationship(leader, emily)

      await church.resumeAt(new Date('2026-07-06T18:00:00Z'), relationship)
      const outcome = await dispatchQueue({
        queue,
        transport: refusing,
        clock: createTestClock(new Date('2026-07-06T18:05:00Z')),
        ministryId: church.ministry.id,
      })
      expect(outcome.failed).toBe(2)

      await church.resumeAt(new Date('2026-07-08T18:00:00Z'), relationship)

      expect(await carried(church.ministry, emily)).toEqual([true, false])
    })
  })
})
