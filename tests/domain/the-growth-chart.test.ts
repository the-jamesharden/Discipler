import { describe, expect, it } from 'vitest'
import {
  WEEKS_ON_THE_CHART,
  discipledAt,
  growthSeries,
  type GrowthHistory,
  type GrowthMembership,
  type GrowthPause,
  type GrowthRelationship,
} from '~/domain/growth'

/**
 * The growth chart on Overview (Pastor feedback, ticket 05): how many people
 * were being discipled at the end of each week or month, and now.
 *
 * Every point is read off the stored history, so what the tests below prove is
 * that a point says what was true then: a relationship ended or paused last
 * month counts as it stood last month, a week ends when the Ministry's own week
 * ends, and a person is counted once however many relationships they are in.
 */

const at = (iso: string) => new Date(iso)

let made = 0
const nextId = (prefix: string) => `${prefix}-${++made}`

/** A history being built: relationships, who was in them and when, and the Pauses on them. */
const aHistory = (openedAt = at('2026-01-05T12:00:00Z')) => {
  const relationships: GrowthRelationship[] = []
  const members: GrowthMembership[] = []
  const pauses: GrowthPause[] = []

  const relationship = (options: {
    readonly name?: string | null
    readonly acceptedAt: string | null
    readonly createdAt?: string
    readonly endedAt?: string | null
  }) => {
    const id = nextId('relationship')
    relationships.push({
      id,
      name: options.name ?? null,
      createdAt: at(options.createdAt ?? options.acceptedAt ?? '2026-01-05T12:00:00Z'),
      acceptedAt: options.acceptedAt === null ? null : at(options.acceptedAt),
      endedAt: options.endedAt ? at(options.endedAt) : null,
    })
    return id
  }

  const member = (
    relationshipId: string,
    personId: string,
    role: 'leader' | 'participant',
    startedAt: string,
    endedAt: string | null = null,
  ) => {
    members.push({
      relationshipId,
      personId,
      role,
      startedAt: at(startedAt),
      endedAt: endedAt === null ? null : at(endedAt),
      // A Leader has accepted from the moment they joined, unless a test says not.
      acceptedAt: role === 'leader' ? at(startedAt) : null,
    })
  }

  return {
    relationships,
    members,
    pauses,
    history: (): GrowthHistory => ({ openedAt, relationships, members, pauses }),
    /** A one-to-one: one Discipler and one Disciple, from `from`. */
    pair: (disciple: string, from: string, options: { readonly endedAt?: string; readonly leader?: string } = {}) => {
      const id = relationship({ acceptedAt: from, endedAt: options.endedAt ?? null })
      member(id, options.leader ?? nextId('discipler'), 'leader', from, options.endedAt ?? null)
      member(id, disciple, 'participant', from, options.endedAt ?? null)
      return id
    },
    /** A named Group of these Disciples, from `from`. */
    group: (name: string, disciples: readonly string[], from: string, options: { readonly endedAt?: string } = {}) => {
      const id = relationship({ name, acceptedAt: from, endedAt: options.endedAt ?? null })
      member(id, nextId('discipler'), 'leader', from, options.endedAt ?? null)
      for (const disciple of disciples) member(id, disciple, 'participant', from, options.endedAt ?? null)
      return id
    },
    relationship,
    member,
    pause: (relationshipId: string, when: string) => pauses.push({ relationshipId, kind: 'paused', at: at(when) }),
    resume: (relationshipId: string, when: string) => pauses.push({ relationshipId, kind: 'resumed', at: at(when) }),
  }
}

describe('who is counted at an instant', () => {
  it('counts Disciples and not the people discipling them', () => {
    const ministry = aHistory()
    ministry.pair('ana', '2026-02-02T12:00:00Z', { leader: 'grace' })
    ministry.group('Thursday Table', ['ben', 'cal'], '2026-02-02T12:00:00Z')

    const now = at('2026-03-01T12:00:00Z')
    expect(discipledAt(ministry.history(), 'mentorship', now)).toBe(1)
    expect(discipledAt(ministry.history(), 'groups', now)).toBe(2)
    expect(discipledAt(ministry.history(), 'total', now)).toBe(3)
  })

  it('counts a Discipler who is also discipled somewhere else, as a Disciple there', () => {
    const ministry = aHistory()
    ministry.pair('ana', '2026-02-02T12:00:00Z', { leader: 'grace' })
    // Grace leads Ana, and is herself discipled by Ruth.
    ministry.pair('grace', '2026-02-02T12:00:00Z', { leader: 'ruth' })

    expect(discipledAt(ministry.history(), 'total', at('2026-03-01T12:00:00Z'))).toBe(2)
  })

  it('counts a person in a pair and a group once in the total, and once in each of the other two', () => {
    const ministry = aHistory()
    ministry.pair('ana', '2026-02-02T12:00:00Z')
    ministry.group('Thursday Table', ['ana', 'ben'], '2026-02-02T12:00:00Z')

    const now = at('2026-03-01T12:00:00Z')
    expect(discipledAt(ministry.history(), 'mentorship', now)).toBe(1)
    expect(discipledAt(ministry.history(), 'groups', now)).toBe(2)
    expect(discipledAt(ministry.history(), 'total', now)).toBe(2)
  })

  it('counts a person in two pairs once', () => {
    const ministry = aHistory()
    ministry.pair('ana', '2026-02-02T12:00:00Z')
    // A 1:2 pair: one Discipler and two Disciples, and no name.
    const oneToTwo = ministry.relationship({ acceptedAt: '2026-02-02T12:00:00Z' })
    ministry.member(oneToTwo, 'ruth', 'leader', '2026-02-02T12:00:00Z')
    ministry.member(oneToTwo, 'ana', 'participant', '2026-02-02T12:00:00Z')
    ministry.member(oneToTwo, 'ben', 'participant', '2026-02-02T12:00:00Z')

    expect(discipledAt(ministry.history(), 'mentorship', at('2026-03-01T12:00:00Z'))).toBe(2)
    expect(discipledAt(ministry.history(), 'groups', at('2026-03-01T12:00:00Z'))).toBe(0)
  })

  it('tells a pair from a Group as the Overview does: a Group has a name, and a nameless one larger than a pair is a Group too', () => {
    const ministry = aHistory()
    const nameless = ministry.relationship({ acceptedAt: '2026-02-02T12:00:00Z' })
    ministry.member(nameless, 'ruth', 'leader', '2026-02-02T12:00:00Z')
    for (const disciple of ['ana', 'ben', 'cal']) ministry.member(nameless, disciple, 'participant', '2026-02-02T12:00:00Z')
    // A named Group of one Disciple is still a Group.
    ministry.group('Saturday Breakfast', ['dee'], '2026-02-02T12:00:00Z')

    const now = at('2026-03-01T12:00:00Z')
    expect(discipledAt(ministry.history(), 'groups', now)).toBe(4)
    expect(discipledAt(ministry.history(), 'mentorship', now)).toBe(0)
  })

  it('counts nobody in a relationship nobody has accepted yet', () => {
    const ministry = aHistory()
    const waiting = ministry.relationship({ acceptedAt: null, createdAt: '2026-02-02T12:00:00Z' })
    ministry.member(waiting, 'ruth', 'leader', '2026-02-02T12:00:00Z')
    ministry.member(waiting, 'ana', 'participant', '2026-02-02T12:00:00Z')

    expect(discipledAt(ministry.history(), 'total', at('2026-03-01T12:00:00Z'))).toBe(0)
  })

  it('counts a Disciple from when the relationship was accepted, not from when it was formed', () => {
    const ministry = aHistory()
    const later = ministry.relationship({ createdAt: '2026-02-02T12:00:00Z', acceptedAt: '2026-02-10T12:00:00Z' })
    ministry.member(later, 'ruth', 'leader', '2026-02-02T12:00:00Z')
    ministry.member(later, 'ana', 'participant', '2026-02-02T12:00:00Z')

    expect(discipledAt(ministry.history(), 'total', at('2026-02-09T12:00:00Z'))).toBe(0)
    expect(discipledAt(ministry.history(), 'total', at('2026-02-10T12:00:00Z'))).toBe(1)
  })

  it('counts a relationship until it ended and not after', () => {
    const ministry = aHistory()
    ministry.pair('ana', '2026-02-02T12:00:00Z', { endedAt: '2026-04-01T12:00:00Z' })

    expect(discipledAt(ministry.history(), 'total', at('2026-03-31T12:00:00Z'))).toBe(1)
    expect(discipledAt(ministry.history(), 'total', at('2026-04-01T12:00:00Z'))).toBe(0)
  })

  it('counts a Disciple who left a Group until they left, and the Group goes on', () => {
    const ministry = aHistory()
    const group = ministry.group('Thursday Table', ['ben'], '2026-02-02T12:00:00Z')
    ministry.member(group, 'cal', 'participant', '2026-02-02T12:00:00Z', '2026-03-01T12:00:00Z')

    expect(discipledAt(ministry.history(), 'groups', at('2026-02-20T12:00:00Z'))).toBe(2)
    expect(discipledAt(ministry.history(), 'groups', at('2026-03-02T12:00:00Z'))).toBe(1)
  })

  it('leaves a paused relationship out of all three for as long as the Pause stands', () => {
    const ministry = aHistory()
    const pair = ministry.pair('ana', '2026-02-02T12:00:00Z')
    const group = ministry.group('Thursday Table', ['ben'], '2026-02-02T12:00:00Z')
    ministry.pause(pair, '2026-03-01T12:00:00Z')
    ministry.pause(group, '2026-03-01T12:00:00Z')
    ministry.resume(pair, '2026-04-01T12:00:00Z')

    const history = ministry.history()
    const during = at('2026-03-15T12:00:00Z')
    expect(discipledAt(history, 'mentorship', during)).toBe(0)
    expect(discipledAt(history, 'groups', during)).toBe(0)
    expect(discipledAt(history, 'total', during)).toBe(0)

    // Resumed, the pair counts again; the Group's Pause still stands, though its
    // period ran out long ago, because expiry resumes nothing.
    const after = at('2026-06-01T12:00:00Z')
    expect(discipledAt(history, 'mentorship', after)).toBe(1)
    expect(discipledAt(history, 'groups', after)).toBe(0)
  })

  it('reads the Pauses in the order they happened, however they arrive', () => {
    const ministry = aHistory()
    const pair = ministry.pair('ana', '2026-02-02T12:00:00Z')
    ministry.resume(pair, '2026-03-08T12:00:00Z')
    ministry.pause(pair, '2026-03-01T12:00:00Z')
    ministry.pause(pair, '2026-05-01T12:00:00Z')

    const history = ministry.history()
    expect(discipledAt(history, 'total', at('2026-03-05T12:00:00Z'))).toBe(0)
    expect(discipledAt(history, 'total', at('2026-04-01T12:00:00Z'))).toBe(1)
    expect(discipledAt(history, 'total', at('2026-05-02T12:00:00Z'))).toBe(0)
  })

  it('still counts a person in a running pair while another relationship of theirs is paused', () => {
    const ministry = aHistory()
    ministry.pair('ana', '2026-02-02T12:00:00Z')
    const group = ministry.group('Thursday Table', ['ana'], '2026-02-02T12:00:00Z')
    ministry.pause(group, '2026-03-01T12:00:00Z')

    const now = at('2026-03-15T12:00:00Z')
    expect(discipledAt(ministry.history(), 'total', now)).toBe(1)
    expect(discipledAt(ministry.history(), 'groups', now)).toBe(0)
  })
})

describe('the weeks', () => {
  // Chicago is five or six hours behind UTC, so a week that ended in Chicago
  // has not ended in UTC, and the tests can tell which one was used.
  const zone = 'America/Chicago'
  // Wednesday 14 October 2026, noon in Chicago: ISO week 2026-W42.
  const now = at('2026-10-14T17:00:00Z')

  it('has the last twelve weeks, the last of them counted now', () => {
    const ministry = aHistory(at('2026-01-05T12:00:00Z'))
    const series = growthSeries(ministry.history(), { measure: 'total', scale: 'weeks' }, zone, now)

    expect(series.slots).toBe(WEEKS_ON_THE_CHART)
    expect(series.points).toHaveLength(12)
    expect(series.points.at(-1)!.countedAt).toEqual(now)
    // Each point opens on a Monday at midnight in Chicago: 27 July is the first
    // of the twelve, and 12 October the week it is now.
    expect(series.points[0]!.opensAt).toEqual(at('2026-07-27T05:00:00Z'))
    expect(series.points.at(-1)!.opensAt).toEqual(at('2026-10-12T05:00:00Z'))
  })

  it('counts each earlier week at its end, in the Ministry Timezone', () => {
    const ministry = aHistory()
    // Sunday 11 October, 11:30pm in Chicago: still last week there, though it is
    // already Monday in UTC.
    ministry.pair('ana', '2026-10-12T04:30:00Z')
    // Monday 12 October, half past midnight in Chicago: this week.
    ministry.pair('ben', '2026-10-12T05:30:00Z')

    const { points } = growthSeries(ministry.history(), { measure: 'total', scale: 'weeks' }, zone, now)
    expect(points.at(-2)!.count).toBe(1)
    expect(points.at(-1)!.count).toBe(2)
  })

  it('makes the last point the live count, with something that changed this morning', () => {
    const ministry = aHistory()
    ministry.pair('ana', '2026-09-01T12:00:00Z', { endedAt: '2026-10-14T14:00:00Z' })
    ministry.pair('ben', '2026-10-14T15:00:00Z')
    ministry.pair('cal', '2026-10-14T18:00:00Z')

    const { points } = growthSeries(ministry.history(), { measure: 'total', scale: 'weeks' }, zone, now)
    // Ana ended at nine this morning and Ben began at ten; Cal begins this
    // afternoon, after now, and is not counted yet.
    expect(points.at(-1)!.count).toBe(1)
    expect(points.at(-2)!.count).toBe(1)
  })

  it('shows a relationship ended or paused weeks ago as it stood then', () => {
    const ministry = aHistory()
    ministry.pair('ana', '2026-08-01T12:00:00Z', { endedAt: '2026-09-02T12:00:00Z' })
    const ben = ministry.pair('ben', '2026-08-01T12:00:00Z')
    ministry.pause(ben, '2026-09-16T12:00:00Z')
    ministry.resume(ben, '2026-09-30T12:00:00Z')

    const { points } = growthSeries(ministry.history(), { measure: 'total', scale: 'weeks' }, zone, now)
    const byWeek = points.map((point) => [point.opensAt.toISOString().slice(0, 10), point.count])
    expect(byWeek).toEqual([
      ['2026-07-27', 2],
      ['2026-08-03', 2],
      ['2026-08-10', 2],
      ['2026-08-17', 2],
      ['2026-08-24', 2],
      // Ana's pair ended on Wednesday 2 September.
      ['2026-08-31', 1],
      ['2026-09-07', 1],
      // Ben's pair was paused on 16 September and resumed on 30 September.
      ['2026-09-14', 0],
      ['2026-09-21', 0],
      ['2026-09-28', 1],
      ['2026-10-05', 1],
      ['2026-10-12', 1],
    ])
  })

  it('ends a week when the clocks change by the zone, not by seven times twenty-four hours', () => {
    // New York falls back on Sunday 1 November 2026. The week of 26 October
    // ends at midnight on Monday 2 November in New York: 5am UTC, an hour
    // later than seven days after the 4am UTC it opened at.
    const newYork = 'America/New_York'
    const ministry = aHistory()
    // Ended at 11:30pm on Sunday 1 November in New York: inside that week, and
    // after the 4am UTC that seven whole days would have ended it at.
    ministry.pair('ana', '2026-11-01T12:00:00Z', { endedAt: '2026-11-02T04:30:00Z' })

    const { points } = growthSeries(
      ministry.history(),
      { measure: 'total', scale: 'weeks' },
      newYork,
      at('2026-11-04T17:00:00Z'),
    )
    const lastWeek = points.at(-2)!
    expect(lastWeek.opensAt).toEqual(at('2026-10-26T04:00:00Z'))
    // Ana's pair ended before the week did: nobody at its end.
    expect(lastWeek.count).toBe(0)
    expect(points.at(-1)!.opensAt).toEqual(at('2026-11-02T05:00:00Z'))
  })

  it('ends a week the clocks went forward in at the zone’s own midnight too', () => {
    // New York springs forward on Sunday 8 March 2026; the next week opens at
    // midnight on Monday 9 March, which is 4am UTC rather than 5am.
    const newYork = 'America/New_York'
    const ministry = aHistory()
    // 12:30am on Monday 9 March in New York: the next week.
    ministry.pair('ana', '2026-03-09T04:30:00Z')

    const { points } = growthSeries(
      ministry.history(),
      { measure: 'total', scale: 'weeks' },
      newYork,
      at('2026-03-11T17:00:00Z'),
    )
    expect(points.at(-1)!.opensAt).toEqual(at('2026-03-09T04:00:00Z'))
    expect(points.at(-2)!.count).toBe(0)
    expect(points.at(-1)!.count).toBe(1)
  })

  it('crosses a year into the next ISO year', () => {
    const ministry = aHistory(at('2026-01-05T12:00:00Z'))
    // Wednesday 6 January 2027: ISO week 2027-W01, after 2026-W53.
    const { points } = growthSeries(
      ministry.history(),
      { measure: 'total', scale: 'weeks' },
      zone,
      at('2027-01-06T18:00:00Z'),
    )
    expect(points).toHaveLength(12)
    expect(points.at(-1)!.opensAt).toEqual(at('2027-01-04T06:00:00Z'))
    expect(points.at(-2)!.opensAt).toEqual(at('2026-12-28T06:00:00Z'))
  })

  it('draws only the weeks since the Ministry opened, for a young one', () => {
    // Opened on Tuesday 22 September in Chicago: four weeks with this one.
    const ministry = aHistory(at('2026-09-22T15:00:00Z'))
    ministry.pair('ana', '2026-09-23T15:00:00Z')

    const series = growthSeries(ministry.history(), { measure: 'total', scale: 'weeks' }, zone, now)
    expect(series.slots).toBe(WEEKS_ON_THE_CHART)
    expect(series.points.map((point) => point.count)).toEqual([1, 1, 1, 1])
    expect(series.points[0]!.opensAt).toEqual(at('2026-09-21T05:00:00Z'))
  })

  it('draws one point, now, for a Ministry younger than a week', () => {
    const ministry = aHistory(at('2026-10-13T15:00:00Z'))
    ministry.pair('ana', '2026-10-13T16:00:00Z')

    const series = growthSeries(ministry.history(), { measure: 'total', scale: 'weeks' }, zone, now)
    expect(series.points).toEqual([{ opensAt: at('2026-10-12T05:00:00Z'), countedAt: now, count: 1 }])
  })

  it('opens the Ministry no later than its first relationship', () => {
    // A Ministry whose history was brought in from before it was opened here.
    const ministry = aHistory(at('2026-10-13T15:00:00Z'))
    ministry.pair('ana', '2026-09-29T15:00:00Z')

    const { points } = growthSeries(ministry.history(), { measure: 'total', scale: 'weeks' }, zone, now)
    expect(points.map((point) => point.count)).toEqual([1, 1, 1])
  })

  it('still draws now for a Ministry whose opening the clock has not reached', () => {
    const ministry = aHistory(at('2026-12-01T15:00:00Z'))
    const { points } = growthSeries(ministry.history(), { measure: 'total', scale: 'weeks' }, zone, now)
    expect(points).toEqual([{ opensAt: at('2026-10-12T05:00:00Z'), countedAt: now, count: 0 }])
  })
})

describe('the months', () => {
  const zone = 'America/Chicago'
  const now = at('2026-10-14T17:00:00Z')

  it('has every month since the Ministry opened, the last counted now', () => {
    const ministry = aHistory(at('2026-06-10T15:00:00Z'))
    const series = growthSeries(ministry.history(), { measure: 'total', scale: 'months' }, zone, now)

    expect(series.points.map((point) => point.opensAt)).toEqual([
      at('2026-06-01T05:00:00Z'),
      at('2026-07-01T05:00:00Z'),
      at('2026-08-01T05:00:00Z'),
      at('2026-09-01T05:00:00Z'),
      at('2026-10-01T05:00:00Z'),
    ])
    expect(series.points.at(-1)!.countedAt).toEqual(now)
    // A year across at the least, so a young Ministry's few months sit at the
    // right as its few weeks do.
    expect(series.slots).toBe(12)
  })

  it('has more slots than a year once the Ministry is older than one', () => {
    const ministry = aHistory(at('2025-03-10T15:00:00Z'))
    const series = growthSeries(ministry.history(), { measure: 'total', scale: 'months' }, zone, now)
    // March 2025 to October 2026.
    expect(series.points).toHaveLength(20)
    expect(series.slots).toBe(20)
  })

  it('counts each earlier month at its end, in the Ministry Timezone', () => {
    const ministry = aHistory(at('2026-06-10T15:00:00Z'))
    // 11:30pm on 31 August in Chicago, already September in UTC.
    ministry.pair('ana', '2026-09-01T04:30:00Z')
    // 12:30am on 1 September in Chicago.
    ministry.pair('ben', '2026-09-01T05:30:00Z')

    const { points } = growthSeries(ministry.history(), { measure: 'total', scale: 'months' }, zone, now)
    expect(points.map((point) => point.count)).toEqual([0, 0, 1, 2, 2])
  })

  it('shows a relationship ended or paused last month as it stood then', () => {
    const ministry = aHistory(at('2026-06-10T15:00:00Z'))
    ministry.pair('ana', '2026-06-15T15:00:00Z', { endedAt: '2026-09-10T15:00:00Z' })
    const group = ministry.group('Thursday Table', ['ben', 'cal'], '2026-07-15T15:00:00Z')
    ministry.pause(group, '2026-08-20T15:00:00Z')
    ministry.resume(group, '2026-10-05T15:00:00Z')

    const history = ministry.history()
    const count = (measure: 'total' | 'mentorship' | 'groups') =>
      growthSeries(history, { measure, scale: 'months' }, zone, now).points.map((point) => point.count)

    expect(count('total')).toEqual([1, 3, 1, 0, 2])
    expect(count('mentorship')).toEqual([1, 1, 1, 0, 0])
    expect(count('groups')).toEqual([0, 2, 0, 0, 2])
  })

  it('draws one point, now, for a Ministry younger than a month', () => {
    const ministry = aHistory(at('2026-10-02T15:00:00Z'))
    ministry.pair('ana', '2026-10-03T15:00:00Z')

    const series = growthSeries(ministry.history(), { measure: 'total', scale: 'months' }, zone, now)
    expect(series.points).toEqual([{ opensAt: at('2026-10-01T05:00:00Z'), countedAt: now, count: 1 }])
    expect(series.slots).toBe(12)
  })

  it('crosses a year', () => {
    const ministry = aHistory(at('2026-11-20T15:00:00Z'))
    const { points } = growthSeries(
      ministry.history(),
      { measure: 'total', scale: 'months' },
      zone,
      at('2027-02-03T18:00:00Z'),
    )
    expect(points.map((point) => point.opensAt)).toEqual([
      at('2026-11-01T05:00:00Z'),
      at('2026-12-01T06:00:00Z'),
      at('2027-01-01T06:00:00Z'),
      at('2027-02-01T06:00:00Z'),
    ])
  })
})
