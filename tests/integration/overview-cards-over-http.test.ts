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
  pauseRelationship,
} from '../support/local-supabase'
import { getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * The Overview's cards coloured by what they need (Pastor feedback, ticket 02),
 * as the page an Admin loads draws them: green and *Healthy*, yellow and
 * *Stalled*, red while a Concern is unresolved, grey and *Paused* or *Awaiting
 * acceptance*. The rule is driven case by case in
 * `tests/app/overview-card-colours.test.ts`; this is the same rule reaching the
 * markup, from states the real commands derived.
 */

/** One card's markup, found by the Leader it names first. */
const cardOf = (html: string, leader: string): string => {
  const cards = html.split('class="rel-card ').slice(1)
  const card = cards.find((each) => each.includes(`>${leader}<`))
  if (!card) throw new Error(`No card on the Overview names ${leader}`)
  return card.slice(0, card.indexOf('</div></', card.indexOf('rel-people')))
}

describe.skipIf(skipUnlessAppIsRunning)('the Overview cards, coloured by need', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // Monday 24 August 2026, 8pm in London -- the Monday of ISO week 2026-W35, long
  // enough ago that a Concern raised in it is past its Needs Care week.
  const firstWeek = new Date('2026-08-24T19:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const at = (week: number) => new Date(firstWeek.getTime() + weeks(week))
  const minutesAfter = (instant: Date, n: number) => new Date(instant.getTime() + n * 60_000)

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
    const replyAt = (now: Date, person: PersonId, body: string) =>
      serviceAt(now).execute({ type: 'sms.inbound', ministryId: ministry.id, personId: person, body })
    return {
      ministry,
      serviceAt,
      congregant,
      tickAt: (now: Date) => serviceAt(now).execute({ type: 'scheduled.tick', ministryId: ministry.id }),
      /** A pair accepted the week before the first check-in. */
      pairedEarly: async (leader: PersonId, participant: PersonId) => {
        const formedAt = new Date(firstWeek.getTime() - weeks(1))
        return pairOneToOne(ministry, leader, participant, { createdAt: formedAt, acceptedAt: formedAt })
      },
      /** Met, then a Concern in words, in the week of `week`. */
      raiseAConcern: async (week: Date, leader: PersonId, words: string) => {
        await replyAt(minutesAfter(week, 1), leader, '1')
        await replyAt(minutesAfter(week, 2), leader, 'C')
        await replyAt(minutesAfter(week, 3), leader, words)
      },
    }
  }

  it('colours healthy green, an old unresolved Concern red, and paused and unaccepted grey', async () => {
    const church = await aMinistry('Coloured Chapel')
    const { cookie } = await signIn(church.ministry)

    const worried = await church.congregant('Wendy Worried')
    await church.pairedEarly(worried, await church.congregant('Will Quiet'))
    // One week asked and answered, with a Concern, in August: the week is long
    // over, so the state is Healthy again and only the badge remains.
    await church.tickAt(at(0))
    await church.raiseAConcern(at(0), worried, 'Not sleeping and will not say why.')

    const healthy = await church.congregant('Hannah Healthy')
    await pairOneToOne(church.ministry, healthy, await church.congregant('Harry Fine'))

    const paused = await church.congregant('Paula Paused')
    const pausedPair = await pairOneToOne(church.ministry, paused, await church.congregant('Pete Away'))
    await pauseRelationship(church.ministry, pausedPair)

    const waiting = await church.congregant('Andy Awaiting')
    await church.serviceAt(new Date(Date.now() - days(6))).execute({
      type: 'relationship.create',
      ministryId: church.ministry.id,
      leaderIds: [waiting],
      participantIds: [await church.congregant('Abby Asked')],
    })

    const { html } = await getPage('/overview', cookie)

    const green = cardOf(html, 'Hannah Healthy')
    expect(green).toMatch(/^need-healthy"/)
    expect(green).toContain('<span class="pill healthy">Healthy</span>')

    const red = cardOf(html, 'Wendy Worried')
    expect(red).toMatch(/^need-concern"/)
    expect(red).not.toContain('Healthy')
    expect(red).toContain('Concern')

    const grey = cardOf(html, 'Paula Paused')
    expect(grey).toMatch(/^need-inactive"/)
    expect(grey).toContain('Paused')

    const unaccepted = cardOf(html, 'Andy Awaiting')
    expect(unaccepted).toMatch(/^need-inactive"/)
    expect(unaccepted).toContain('Awaiting acceptance')
  })

  it('colours a stalled card yellow, and red once it also carries a Concern', async () => {
    const church = await aMinistry('Stalled Chapel')
    const { cookie } = await signIn(church.ministry)

    const silent = await church.congregant('Sam Silent')
    await church.pairedEarly(silent, await church.congregant('Sid Waiting'))
    const worried = await church.congregant('Sue Stalled')
    await church.pairedEarly(worried, await church.congregant('Stan Hurting'))

    // Both are asked three weeks running and neither answers after the first: two
    // finished weeks of silence each, which is Stalled. One of them raised a
    // Concern in the first week and nobody has resolved it.
    await church.tickAt(at(0))
    await church.raiseAConcern(at(0), worried, 'His brother died and he has stopped coming.')
    await church.tickAt(at(1))
    await church.tickAt(at(2))
    await church.tickAt(at(3))

    const { html } = await getPage('/overview', cookie)

    const yellow = cardOf(html, 'Sam Silent')
    expect(yellow).toMatch(/^need-stalled"/)
    expect(yellow).toContain('Stalled')

    const red = cardOf(html, 'Sue Stalled')
    expect(red).toMatch(/^need-concern"/)
    expect(red).toContain('Stalled')
    expect(red).toContain('Concern')
  })
})
