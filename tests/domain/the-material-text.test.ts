import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { createSequentialIds, materialId, ministryId, personId, relationshipId } from '~/domain/ids'
import {
  materialNoticesDue,
  type MaterialRecipient,
  type MaterialStanding,
} from '~/domain/material-notices'
import { materialMessage } from '~/domain/outbound-copy'

/** The line a text may carry; whether it does this month is the sending layer's to settle. */
const RATES = ' Msg & data rates may apply. Reply STOP to opt out, HELP for help.'

/**
 * The text a Leader gets when their Material changes (Richer materials, ticket
 * 03), decided against a test clock: an afternoon of edits passes in a
 * millisecond. James, 2026-09-24: one text a person, once the changes have been
 * still for an hour, at most once a day, between 8am and 9pm, saying where
 * things ended up.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const grace = personId('00000000-0000-4000-8000-0000000000b1')
const withEmily = relationshipId('00000000-0000-4000-8000-0000000000d1')
const withSarah = relationshipId('00000000-0000-4000-8000-0000000000d2')
const withTom = relationshipId('00000000-0000-4000-8000-0000000000d3')
const romans = materialId('00000000-0000-4000-8000-0000000000c1')
const multiply = materialId('00000000-0000-4000-8000-0000000000c2')

const TZ = 'America/Chicago'
/** 2pm in Chicago on a Wednesday. */
const afternoon = new Date('2026-09-23T19:00:00Z')
const minutes = (n: number) => n * 60_000
const before = (at: Date, ms: number) => new Date(at.getTime() - ms)
const after = (at: Date, ms: number) => new Date(at.getTime() + ms)

const standing = (fields: Partial<MaterialStanding> = {}): MaterialStanding => ({
  relationshipId: withEmily,
  role: 'leader',
  paused: false,
  running: { materialId: romans, title: 'Romans', fingerprint: 'r1' },
  told: null,
  changedAt: before(afternoon, minutes(90)),
  leaderNames: [],
  ...fields,
})

const recipient = (
  standings: readonly MaterialStanding[],
  fields: Partial<MaterialRecipient> = {},
): MaterialRecipient => ({
  personId: grace,
  phone: '+15555550101',
  lastTextedAt: null,
  standings,
  ...fields,
})

const due = (recipients: readonly MaterialRecipient[], now: Date = afternoon) =>
  materialNoticesDue(recipients, now, TZ)

describe('when a Leader is texted', () => {
  it('texts once a change has been still for an hour, naming where it ended up', () => {
    const [notice] = due([recipient([standing()])])
    expect(notice?.text).toEqual({ kind: 'leader_moved', title: 'Romans' })
    expect(notice?.told.map((told) => told.relationshipId)).toEqual([withEmily])
  })

  it('waits while a change is less than an hour old', () => {
    expect(due([recipient([standing({ changedAt: before(afternoon, minutes(59)) })])])).toEqual([])
  })

  it('sends one text for an afternoon of edits, once they stop', () => {
    const edits = [minutes(0), minutes(20), minutes(45), minutes(130)]
    const texts = []
    for (let tick = 0; tick <= 6; tick++) {
      const now = after(afternoon, minutes(60 * tick))
      const lastEdit = edits.filter((at) => at <= now.getTime() - afternoon.getTime()).at(-1)!
      const told = texts.length > 0 ? { materialId: romans, fingerprint: 'r4' } : null
      const notices = due(
        [
          recipient([standing({ running: { materialId: romans, title: 'Romans', fingerprint: 'r4' }, told, changedAt: after(afternoon, lastEdit) })], {
            lastTextedAt: texts.at(-1) ?? null,
          }),
        ],
        now,
      )
      if (notices[0]?.text) texts.push(now)
    }
    expect(texts).toHaveLength(1)
  })

  it('sends nothing for a change undone before the text went', () => {
    const undone = standing({ told: { materialId: romans, fingerprint: 'r1' } })
    expect(due([recipient([undone])])).toEqual([])
  })

  it('sends nothing for a change to the title alone, since the fingerprint does not move', () => {
    const retitled = standing({
      running: { materialId: romans, title: 'Romans, revised', fingerprint: 'r1' },
      told: { materialId: romans, fingerprint: 'r1' },
    })
    expect(due([recipient([retitled])])).toEqual([])
  })

  it('says the Material was updated when it is the same one holding something new', () => {
    const [notice] = due([
      recipient([standing({ running: { materialId: romans, title: 'Romans', fingerprint: 'r2' }, told: { materialId: romans, fingerprint: 'r1' } })]),
    ])
    expect(notice?.text).toEqual({ kind: 'leader_updated', title: 'Romans' })
  })

  it('says there is no Material when the relationship was taken off one', () => {
    const [notice] = due([
      recipient([standing({ running: { materialId: null, title: null, fingerprint: null }, told: { materialId: romans, fingerprint: 'r1' } })]),
    ])
    expect(notice?.text).toEqual({ kind: 'leader_none' })
  })

  it('texts a Leader of three relationships changed together once, and records all three', () => {
    const [notice, ...rest] = due([
      recipient([
        standing(),
        standing({ relationshipId: withSarah }),
        standing({ relationshipId: withTom, running: { materialId: multiply, title: 'Multiply', fingerprint: 'm1' } }),
      ]),
    ])
    expect(rest).toEqual([])
    expect(notice?.text).toEqual({ kind: 'leader_several', count: 3 })
    expect(notice?.told).toHaveLength(3)
  })

  it('holds every change while any one of them is still settling', () => {
    const notices = due([
      recipient([standing(), standing({ relationshipId: withSarah, changedAt: before(afternoon, minutes(10)) })]),
    ])
    expect(notices).toEqual([])
  })

  it('leaves out a relationship with nothing pending', () => {
    const [notice] = due([
      recipient([standing(), standing({ relationshipId: withSarah, told: { materialId: romans, fingerprint: 'r1' } })]),
    ])
    expect(notice?.text).toEqual({ kind: 'leader_moved', title: 'Romans' })
    expect(notice?.told.map((told) => told.relationshipId)).toEqual([withEmily])
  })
})

describe('what holds a text back', () => {
  it('waits for tomorrow after a text today, and goes after 8am', () => {
    const textedThisMorning = new Date('2026-09-23T15:00:00Z') // 10am Chicago
    const pending = [recipient([standing()], { lastTextedAt: textedThisMorning })]
    expect(due(pending)).toEqual([])
    // 7am the next day is still quiet hours; 8am is not.
    expect(due(pending, new Date('2026-09-24T12:00:00Z'))).toEqual([])
    expect(due(pending, new Date('2026-09-24T13:00:00Z'))[0]?.text).toEqual({ kind: 'leader_moved', title: 'Romans' })
  })

  it('counts the day in the Ministry’s own timezone, not in UTC', () => {
    // 11pm in Chicago on Tuesday is already Wednesday in UTC.
    const lateTuesday = new Date('2026-09-23T04:00:00Z')
    const pending = [recipient([standing()], { lastTextedAt: lateTuesday })]
    expect(due(pending)[0]?.text).toBeDefined()
  })

  it('sends nothing after 9pm, and the same change goes the next morning', () => {
    const tenPm = new Date('2026-09-24T03:00:00Z')
    expect(due([recipient([standing()])], tenPm)).toEqual([])
    expect(due([recipient([standing()])], new Date('2026-09-24T13:30:00Z'))).toHaveLength(1)
  })

  it('waits while the relationship is paused, and goes once it is resumed', () => {
    expect(due([recipient([standing({ paused: true })])])).toEqual([])
    expect(due([recipient([standing({ paused: false })])])).toHaveLength(1)
  })
})

describe('the tick', () => {
  const context = (recipients: readonly MaterialRecipient[]): CommandContext => ({
    ministryId: ministry,
    clock: createTestClock(afternoon),
    ids: createSequentialIds(),
    unaccepted: [],
    checkInsDue: [],
    paused: [],
    ministryName: 'Riverside Chapel',
    appBaseUrl: 'https://app.trydiscipler.com',
    materialNotices: { timeZone: TZ, recipients },
  })

  const messages = (effects: readonly Effect[]) =>
    effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message] : []))
  const notices = (effects: readonly Effect[]) =>
    effects.flatMap((effect) => (effect.kind === 'materialNotice.record' ? [effect.notice] : []))

  it('queues the Leader’s text, no-reply and able to carry the rates line, and records what they were told', () => {
    const result = handleCommand({ type: 'scheduled.tick', ministryId: ministry }, context([recipient([standing()])]))

    expect(messages(result.effects)).toEqual([
      expect.objectContaining({
        personId: grace,
        toPhone: '+15555550101',
        body: `Riverside Chapel: The material for your discipleship is now Romans. See it at https://app.trydiscipler.com/relationships${RATES}`,
        kind: 'no_reply',
        ratesLine: 'once_a_month',
        disclosesPersonId: null,
      }),
    ])
    expect(notices(result.effects)).toEqual([
      {
        ministryId: ministry,
        personId: grace,
        relationshipId: withEmily,
        materialId: romans,
        fingerprint: 'r1',
        toldAt: afternoon,
        texted: true,
      },
    ])
  })

  it('tells nobody anything when it was handed nobody', () => {
    const result = handleCommand({ type: 'scheduled.tick', ministryId: ministry }, context([]))
    expect(messages(result.effects)).toEqual([])
    expect(notices(result.effects)).toEqual([])
  })
})

describe('the wording James approved', () => {
  const link = 'https://app.trydiscipler.com/relationships'
  const say = (text: Parameters<typeof materialMessage>[0]['text']) =>
    materialMessage({ ministryName: 'Riverside Chapel', text, link })

  it('reads as drawn in M-5 for each of a Leader’s four', () => {
    expect(say({ kind: 'leader_moved', title: 'Romans: Life in the Spirit' })).toBe(
      `Riverside Chapel: The material for your discipleship is now Romans: Life in the Spirit. See it at ${link}${RATES}`,
    )
    expect(say({ kind: 'leader_updated', title: 'Romans: Life in the Spirit' })).toBe(
      `Riverside Chapel: Romans: Life in the Spirit, the material for your discipleship, has been updated. See it at ${link}${RATES}`,
    )
    expect(say({ kind: 'leader_several', count: 3 })).toBe(
      `Riverside Chapel: The material has changed for 3 of your discipleship relationships. See them at ${link}${RATES}`,
    )
    expect(say({ kind: 'leader_none' })).toBe(
      `Riverside Chapel: Your discipleship no longer has a material assigned. See it at ${link}${RATES}`,
    )
  })
})
