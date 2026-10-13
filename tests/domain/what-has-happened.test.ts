import { describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { weeksBehindTheStall, type RelationshipWeek } from '~/domain/relationship-state'
import { followUpPageFrom } from '~/platform/supabase/follow-up-page-reader'
import type { PageDocument } from '~/platform/supabase/page'
import type { Happening } from '~/service/ports'

/**
 * Follow-Up's fuller card (Pastor feedback, ticket 10), read off a page's
 * document with no database near it: which card an address opens, and what
 * *What has happened* lists, newest first, from the stored history alone.
 */

const zone = 'America/New_York'
const pair = '00000000-0000-4000-8000-0000000000a1'
const mark = '00000000-0000-4000-8000-0000000000b1'
const jordan = '00000000-0000-4000-8000-0000000000b2'
const liam = '00000000-0000-4000-8000-0000000000b3'
const swap = '00000000-0000-4000-8000-0000000000c1'
const keyword = '00000000-0000-4000-8000-0000000000c2'
const concern = '00000000-0000-4000-8000-0000000000d1'

/** Monday evenings in New York; `week(0)` is Monday 14 September 2026. */
const monday = (n: number) => new Date(Date.UTC(2026, 8, 14 + 7 * n, 23, 0))
const later = (instant: Date, hours: number) => new Date(instant.getTime() + hours * 3_600_000)
const iso = (instant: Date) => instant.toISOString()

/** A week of the history's `weeks` rows and the matching `answers` row. */
const asked = (n: number, answer: { met: boolean; satisfaction?: string; concernOpen?: boolean } | null) => {
  const opened = monday(n)
  const closed = later(opened, 48)
  const answered = answer ? later(opened, 1) : null
  return {
    week: {
      relationship_id: pair,
      opened_at: iso(opened),
      closed_at: iso(closed),
      answered_at: answered ? iso(answered) : null,
      reported_not_meeting: answer ? !answer.met : false,
    },
    answer: {
      relationship_id: pair,
      sequence_id: `seq-${n}`,
      opened_at: iso(opened),
      closed_at: iso(closed),
      asked_at: iso(opened),
      answered_at: answered ? iso(answered) : null,
      met: answer ? answer.met : null,
      satisfaction: answer?.satisfaction ?? (answer ? 'good' : null),
      concern_open: answer?.concernOpen ?? false,
    },
  }
}

const documentOf = ({
  weeks,
  concerns = [],
  followUps = [],
  readings = [],
  earlier = [],
  earlierConcerns = [],
  subjects = [],
  card = pair,
}: {
  weeks: ReturnType<typeof asked>[]
  concerns?: Record<string, unknown>[]
  followUps?: Record<string, unknown>[]
  readings?: Record<string, unknown>[]
  earlier?: Record<string, unknown>[]
  earlierConcerns?: Record<string, unknown>[]
  subjects?: Record<string, unknown>[]
  card?: string | null
}): PageDocument => ({
  session: 'admin',
  history: {
    timezone: zone,
    relationships: [{ id: pair, created_at: iso(monday(-2)), accepted_at: iso(monday(-2)), ended_at: null }],
    members: [
      { relationship_id: pair, person_id: mark, role: 'leader', accepted_at: iso(monday(-2)) },
      { relationship_id: pair, person_id: jordan, role: 'participant', accepted_at: null },
    ],
    people: [
      { id: mark, full_name: 'Mark Wilson' },
      { id: jordan, full_name: 'Jordan Ellis' },
      { id: liam, full_name: 'Liam Okafor' },
    ],
    weeks: weeks.map((each) => each.week),
    concerns,
    pauses: [],
    answers: weeks.map((each) => each.answer),
    follow_ups: followUps,
  },
  card:
    card === pair
      ? {
          relationship_id: pair,
          name: null,
          created_at: iso(monday(-2)),
          accepted_at: iso(monday(-2)),
          people: [],
          material: null,
          readings,
          reader_name: 'Pastor Dan Reyes',
        }
      : null,
  follow_up_card: { subjects, earlier, earlier_concerns: earlierConcerns },
})

const lines = (happened: readonly Happening[]) =>
  happened.map((entry) => [entry.kind, entry.at.toISOString().slice(0, 10)])

describe('the weeks a stall was derived from', () => {
  const history = (outcomes: RelationshipWeek['outcome'][]) => ({
    acceptedAt: monday(-2),
    endedAt: null,
    pausedAt: null,
    timeZone: zone,
    concerns: [],
    weeks: outcomes.map((outcome, n) => ({
      openedAt: monday(n),
      closedAt: later(monday(n), 48),
      answeredAt: outcome === 'unanswered' ? null : later(monday(n), 1),
      outcome,
    })),
  })

  it('are the trailing run of silence behind gone silent, oldest first', () => {
    const run = weeksBehindTheStall(history(['met', 'unanswered', 'unanswered', 'unanswered']), monday(4))
    expect(run.map((week) => week.openedAt)).toEqual([monday(1), monday(2), monday(3)])
  })

  it('are the weeks reported as no meeting behind not meeting', () => {
    const run = weeksBehindTheStall(
      history(['did_not_meet', 'met', 'did_not_meet', 'did_not_meet', 'did_not_meet']),
      monday(5),
    )
    expect(run.map((week) => week.openedAt)).toEqual([monday(2), monday(3), monday(4)])
  })

  it('are none where the relationship is not stalled', () => {
    expect(weeksBehindTheStall(history(['met', 'unanswered']), monday(2))).toEqual([])
    expect(weeksBehindTheStall(history(['did_not_meet', 'did_not_meet']), monday(2))).toEqual([])
  })
})

describe('what has happened on a stalled pair', () => {
  const now = later(monday(4), 12)
  const doc = documentOf({
    weeks: [asked(0, { met: true }), asked(1, null), asked(2, null), asked(3, null)],
    followUps: [
      {
        id: swap,
        kind: 'swap_requested',
        raised_at: iso(later(monday(3), 30)),
        relationship_id: pair,
        person_id: mark,
        payload: { requestedBy: 'leader' },
      },
    ],
    earlier: [
      {
        id: '00000000-0000-4000-8000-0000000000e1',
        kind: 'pause_expired',
        payload: { periodWeeks: 2 },
        raised_at: iso(monday(-1)),
        resolved_at: iso(later(monday(-1), 24)),
        person_name: null,
        resolver_name: 'Pastor Ann Lee',
      },
    ],
    earlierConcerns: [
      {
        id: '00000000-0000-4000-8000-0000000000e2',
        raised_at: iso(later(monday(-2), 2)),
        raised_by_name: 'Mark Wilson',
        resolved_at: iso(later(monday(-2), 30)),
        resolver_name: null,
      },
    ],
  })
  const page = followUpPageFrom(doc, createTestClock(now), pair)

  it('opens the pair, with its one open item as a band', () => {
    expect(page.card?.pair?.relationshipId).toBe(pair)
    expect(page.card?.pair?.state).toBe('stalled')
    expect(page.card?.items.map((item) => item.id)).toEqual([swap])
    expect(page.liveRelationships.has(pair)).toBe(true)
  })

  it('lists the item, the stall from the week it crossed, the silent weeks, and what was resolved before, newest first', () => {
    expect(lines(page.card!.happened)).toEqual([
      ['item_raised', '2026-10-07'],
      ['check_in', '2026-10-05'],
      // The second unanswered week, once it closed.
      ['stalled', '2026-09-30'],
      ['check_in', '2026-09-28'],
      ['check_in', '2026-09-21'],
      ['earlier_item', '2026-09-07'],
      ['earlier_concern', '2026-09-01'],
    ])
    const stalled = page.card!.happened.find((entry) => entry.kind === 'stalled')
    expect(stalled).toMatchObject({ reason: 'gone_silent', weeks: 2 })
    expect(page.card!.happened.filter((entry) => entry.kind === 'check_in')).toEqual(
      expect.arrayContaining([expect.objectContaining({ outcome: 'unanswered' })]),
    )
    expect(page.card!.happened.find((entry) => entry.kind === 'earlier_item')).toMatchObject({
      itemKind: 'pause_expired',
      resolvedBy: 'Pastor Ann Lee',
    })
  })
})

describe('what has happened on a pair carrying a Concern', () => {
  const raisedAt = later(monday(1), 2)
  const now = later(monday(1), 20)
  const doc = documentOf({
    weeks: [asked(0, { met: true }), asked(1, { met: true, satisfaction: 'concern', concernOpen: true })],
    concerns: [
      { id: concern, relationship_id: pair, raised_by: mark, raised_at: iso(raisedAt), resolved_at: null },
    ],
    readings: [
      // This Admin earlier the same day, which this opening stands for.
      {
        concern_id: concern,
        viewed_at: iso(later(raisedAt, 5)),
        viewer_name: 'Pastor Dan Reyes',
        by_this_reader: true,
      },
      {
        concern_id: concern,
        viewed_at: iso(later(raisedAt, 2)),
        viewer_name: 'Pastor Ann Lee',
        by_this_reader: false,
      },
      {
        concern_id: concern,
        viewed_at: iso(later(raisedAt, 1)),
        viewer_name: 'Pastor Ann Lee',
        by_this_reader: false,
      },
    ],
  })
  const page = followUpPageFrom(doc, createTestClock(now), pair)

  it('lists each reader once a day at their latest, who raised it, and the D it was raised from, never its words', () => {
    expect(page.card!.happened).toEqual([
      { kind: 'concern_read', at: now, by: 'Pastor Dan Reyes' },
      { kind: 'concern_read', at: later(raisedAt, 2), by: 'Pastor Ann Lee' },
      { kind: 'concern_raised', at: raisedAt, by: 'Mark Wilson' },
      { kind: 'check_in', at: monday(1), outcome: 'concern' },
    ])
  })
})

describe('the card of an item about a Person alone', () => {
  const raisedAt = later(monday(2), 5)
  const doc = documentOf({
    weeks: [],
    card: null,
    followUps: [
      {
        id: keyword,
        kind: 'participant_keyword',
        raised_at: iso(raisedAt),
        relationship_id: null,
        person_id: liam,
        payload: { keyword: 'HELP' },
      },
    ],
    subjects: [{ person_id: liam, phone: '+15555550123', email: null, age_band: '25-34', goal: null, goal_other: null }],
    earlier: [
      {
        id: '00000000-0000-4000-8000-0000000000e3',
        kind: 'participant_keyword',
        payload: { keyword: 'STOP' },
        raised_at: iso(monday(0)),
        resolved_at: iso(monday(1)),
        person_name: 'Liam Okafor',
        resolver_name: 'Pastor Dan Reyes',
      },
    ],
  })

  it('opens by the item’s own id, with the Person it is about and their earlier items', () => {
    const page = followUpPageFrom(doc, createTestClock(later(raisedAt, 1)), keyword)
    expect(page.card?.pair).toBeNull()
    expect(page.card?.items.map((item) => item.id)).toEqual([keyword])
    expect(page.card?.subjects).toEqual([
      expect.objectContaining({ fullName: 'Liam Okafor', phone: '+15555550123', ageBand: '25-34' }),
    ])
    expect(lines(page.card!.happened)).toEqual([
      ['item_raised', '2026-09-29'],
      ['earlier_item', '2026-09-14'],
    ])
  })

  it('opens nothing for an address naming no open item and no live pair', () => {
    const page = followUpPageFrom(doc, createTestClock(later(raisedAt, 1)), '00000000-0000-4000-8000-0000000000ff')
    expect(page.card).toBeNull()
    expect(followUpPageFrom(doc, createTestClock(later(raisedAt, 1)), null).card).toBeNull()
  })
})
