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
  pageToken: null,
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

describe('when a Disciple is texted (Richer materials, ticket 04)', () => {
  const emily = personId('00000000-0000-4000-8000-0000000000b2')
  const disciple = (fields: Partial<MaterialStanding> = {}) =>
    standing({ role: 'participant', leaderNames: ['Grace Lee'], ...fields })
  const emilyGets = (standings: readonly MaterialStanding[], fields: Partial<MaterialRecipient> = {}) =>
    recipient(standings, { personId: emily, ...fields })

  it('names their Leader and the Material, for the relationship it is about', () => {
    const [notice] = due([emilyGets([disciple()])])
    expect(notice?.text).toEqual({
      kind: 'participant_moved',
      title: 'Romans',
      leaderNames: ['Grace Lee'],
      relationshipId: withEmily,
    })
  })

  it('says updated when it is the same Material holding something new', () => {
    const [notice] = due([
      emilyGets([disciple({ running: { materialId: romans, title: 'Romans', fingerprint: 'r2' }, told: { materialId: romans, fingerprint: 'r1' } })]),
    ])
    expect(notice?.text).toEqual({ kind: 'participant_updated', title: 'Romans', relationshipId: withEmily })
  })

  it('sends nothing when they are moved to no Material, and records them as told, whatever the hour or the day', () => {
    const none = disciple({ running: { materialId: null, title: null, fingerprint: null }, told: { materialId: romans, fingerprint: 'r1' } })
    for (const [now, lastTextedAt] of [
      [afternoon, null],
      [new Date('2026-09-24T04:00:00Z'), null], // 11pm
      [afternoon, before(afternoon, minutes(120))], // texted this morning
    ] as const) {
      const [notice] = due([emilyGets([none], { lastTextedAt })], now)
      expect(notice?.text ?? null).toBeNull()
      expect(notice?.told).toEqual([none])
    }
  })

  it('texts about the most recent of two changed relationships, and leaves the other for another day', () => {
    const older = disciple({ relationshipId: withSarah, changedAt: before(afternoon, minutes(300)) })
    const newer = disciple({ changedAt: before(afternoon, minutes(90)) })
    const [notice] = due([emilyGets([older, newer])])
    expect(notice?.text).toMatchObject({ kind: 'participant_moved', relationshipId: withEmily })
    expect(notice?.told).toEqual([newer])
  })

  it('tells somebody who both leads and is discipled about what they lead first', () => {
    const [notice] = due([recipient([standing(), disciple({ relationshipId: withSarah })])])
    expect(notice?.text).toEqual({ kind: 'leader_moved', title: 'Romans' })
    expect(notice?.told.map((told) => told.relationshipId)).toEqual([withEmily])
  })

  const tick = (recipients: readonly MaterialRecipient[]) =>
    handleCommand(
      { type: 'scheduled.tick', ministryId: ministry },
      {
        ministryId: ministry,
        clock: createTestClock(afternoon),
        ids: createSequentialIds(),
        unaccepted: [],
        checkInsDue: [],
        paused: [],
        ministryName: 'Riverside Chapel',
        appBaseUrl: 'https://app.trydiscipler.com',
        materialNotices: { timeZone: TZ, recipients },
      },
    )

  it('mints their page link the first time a text carries it, and links it', () => {
    const result = tick([emilyGets([disciple()])])
    const [link] = result.effects.flatMap((effect) => (effect.kind === 'materialLink.issue' ? [effect.link] : []))
    expect(link).toEqual({ ministryId: ministry, personId: emily, relationshipId: withEmily, token: expect.any(String) })
    const [message] = result.effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message] : []))
    expect(message?.body).toBe(
      `Riverside Chapel: Your discipleship material with Grace Lee is now Romans. Open it here: https://app.trydiscipler.com/material/${link?.token}${RATES}`,
    )
  })

  it('reuses the link they already have, so every text opens the same page', () => {
    const result = tick([emilyGets([disciple({ pageToken: '3f2a0000-0000-4000-8000-00000000c91e' })])])
    expect(result.effects.some((effect) => effect.kind === 'materialLink.issue')).toBe(false)
    const [message] = result.effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message] : []))
    expect(message?.body).toContain('Open it here: https://app.trydiscipler.com/material/3f2a0000-0000-4000-8000-00000000c91e')
  })
})
