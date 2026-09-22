import { describe, expect, it } from 'vitest'
import { personId, relationshipId } from '~/domain/ids'
import { discipleshipGoalId, type AgeBand, type AvailabilitySlot, type Gender, type Weekday } from '~/domain/intake'
import {
  A_ONE_TO_ONE,
  suggest,
  tierOf,
  type CandidateMembership,
  type SuggestionCandidate,
  type SuggestionSettings,
} from '~/domain/suggestions'

/**
 * Suggested Pairs, tested as the pure function it is (core operating loop, ticket
 * 04). Every rule in `docs/adr/0001-pairing-suggestion-inputs.md` has a case,
 * including the negative ones: that gender is not overridable, that the age band
 * points one way, that no number is ever emitted.
 */

const DEFAULTS: SuggestionSettings = { suggestGenderMatch: true, suggestMaxAgeBandGap: 1 }

const CAREER = { id: discipleshipGoalId('goal-career'), label: 'Career and calling' }
const PRAYER = { id: discipleshipGoalId('goal-prayer'), label: 'Prayer' }

/** `hours('monday', 4)`: four one-hour slots from 8am on one day. */
const hours = (day: Weekday, count: number, from = 8): AvailabilitySlot[] =>
  Array.from({ length: count }, (_, at) => ({
    day,
    hour: String(from + at).padStart(2, '0') as AvailabilitySlot['hour'],
  }))

const WEEK: AvailabilitySlot[] = [...hours('monday', 3), ...hours('wednesday', 3), ...hours('saturday', 3)]

let made = 0
const person = (
  name: string,
  overrides: Partial<Omit<SuggestionCandidate, 'personId' | 'fullName'>> = {},
): SuggestionCandidate => {
  made += 1
  return {
    personId: personId(name.toLowerCase().replace(/\s+/g, '-')),
    fullName: name,
    gender: 'female' satisfies Gender,
    ageBand: '25-34' satisfies AgeBand,
    goal: CAREER,
    availability: WEEK,
    intakeSubmittedAt: new Date(Date.UTC(2026, 7, 1, 0, made)),
    consentsToTexts: true,
    optedOut: false,
    declaredSide: null,
    memberships: [],
    ...overrides,
  }
}

const mentor = (name: string, overrides: Parameters<typeof person>[1] = {}) =>
  person(name, { declaredSide: 'mentor', ...overrides })

const member = (
  id: string,
  role: CandidateMembership['role'],
  overrides: Partial<Omit<CandidateMembership, 'relationshipId' | 'role'>> = {},
): CandidateMembership => ({
  relationshipId: relationshipId(id),
  role,
  countsAsAGroup: false,
  awaitingAcceptance: false,
  ...overrides,
})

const pairsOf = (roster: SuggestionCandidate[], settings = DEFAULTS) =>
  suggest(roster, settings).pairs.map((pair) => `${pair.leader.fullName} -> ${pair.participant.fullName}`)

describe('Suggested Pairs: the tiers', () => {
  it('is Excellent fit at four or more shared slots spanning at least two days', () => {
    expect(tierOf(4, 2)).toBe('excellent')
    expect(tierOf(12, 5)).toBe('excellent')
  })

  it('is Good fit, not Excellent fit, when four shared slots all fall on one day', () => {
    expect(tierOf(4, 1)).toBe('good')
    const grace = mentor('Grace Lee', { availability: hours('saturday', 4) })
    const ana = person('Ana Ruiz', { availability: hours('saturday', 4) })
    expect(suggest([grace, ana], DEFAULTS).pairs[0]?.tier).toBe('good')
  })

  it('is Good fit at two or three, Recommended at exactly one, and nothing at zero', () => {
    expect(tierOf(3, 3)).toBe('good')
    expect(tierOf(2, 1)).toBe('good')
    expect(tierOf(1, 1)).toBe('recommended')
    expect(tierOf(0, 0)).toBeNull()
  })

  it('lands goal-matching and goal-differing pairs with the same overlap in the same tier, the matching one first', () => {
    const grace = mentor('Grace Lee', { goal: CAREER })
    const matching = person('Mia Chen', { goal: CAREER })
    const differing = person('Zoe Park', { goal: PRAYER })
    const { pairs } = suggest([grace, differing, matching], DEFAULTS)
    expect(pairs.map((pair) => [pair.participant.fullName, pair.tier])).toEqual([
      ['Mia Chen', 'excellent'],
      ['Zoe Park', 'excellent'],
    ])
  })

  it('never lets a goal outrank availability', () => {
    const grace = mentor('Grace Lee', { goal: CAREER })
    const moreTime = person('Zoe Park', { goal: PRAYER })
    const sameGoal = person('Mia Chen', { goal: CAREER, availability: hours('monday', 2) })
    expect(pairsOf([grace, sameGoal, moreTime])).toEqual(['Grace Lee -> Zoe Park', 'Grace Lee -> Mia Chen'])
  })
})

describe('Suggested Pairs: the reason', () => {
  it('names the shared slots, and the goal where it matches', () => {
    const grace = mentor('Grace Lee', { availability: [...hours('monday', 2), ...hours('friday', 2)] })
    const ana = person('Ana Ruiz', { availability: [...hours('monday', 2), ...hours('friday', 2)] })
    expect(suggest([grace, ana], DEFAULTS).pairs[0]?.reason).toBe(
      'Four shared time slots. You both selected Career and calling.',
    )
  })

  it('never names a mismatch', () => {
    const grace = mentor('Grace Lee', { goal: PRAYER, availability: hours('monday', 1) })
    const ana = person('Ana Ruiz', { availability: hours('monday', 1) })
    expect(suggest([grace, ana], DEFAULTS).pairs[0]?.reason).toBe('One shared time slot.')
  })

  it('says a large count in words', () => {
    const grace = mentor('Grace Lee', { goal: null })
    const ana = person('Ana Ruiz', { goal: null })
    const twentyOne = [...hours('monday', 12), ...hours('tuesday', 9)]
    expect(
      suggest([{ ...grace, availability: twentyOne }, { ...ana, availability: twentyOne }], DEFAULTS).pairs[0]
        ?.reason,
    ).toBe('Twenty-one shared time slots.')
  })

  it('emits no number anywhere', () => {
    const numbers: unknown[] = []
    const walk = (value: unknown): void => {
      if (typeof value === 'number') numbers.push(value)
      else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
    }
    walk(suggest([mentor('Grace Lee'), person('Ana Ruiz'), person('Zoe Park', { availability: [] })], DEFAULTS))
    expect(numbers).toEqual([])
  })

  it('cannot be constructed without one', () => {
    const grace = mentor('Grace Lee')
    const ana = person('Ana Ruiz')
    const pair = suggest([grace, ana], DEFAULTS).pairs[0]!
    // @ts-expect-error -- a reason is only ever written by `suggest`.
    const forged: typeof pair = { ...pair, reason: 'Trust me.' }
    // @ts-expect-error -- and a suggestion without one is not a suggestion.
    const bare: typeof pair = { tier: pair.tier, leader: pair.leader, participant: pair.participant }
    expect([forged, bare]).toHaveLength(2)
  })
})

describe('Suggested Pairs: the constraints', () => {
  it('filters a gender mismatch before ranking, and it never appears as a reason', () => {
    const grace = mentor('Grace Lee', { gender: 'female' })
    const james = person('James Park', { gender: 'male' })
    const { pairs, noScheduleOverlap } = suggest([grace, james], DEFAULTS)
    expect(pairs).toEqual([])
    // Not suggestable is not the same as not overlapping, and the page says only the second.
    expect(noScheduleOverlap.map((each) => each.fullName)).toEqual(['James Park'])
  })

  it('lets a Ministry turn the one-to-one gender match off, deliberately, in settings', () => {
    const grace = mentor('Grace Lee', { gender: 'female' })
    const james = person('James Park', { gender: 'male' })
    expect(pairsOf([grace, james], { ...DEFAULTS, suggestGenderMatch: false })).toEqual(['Grace Lee -> James Park'])
  })

  it('offers only people of a gender a group declared, even with the Ministry-wide match off', () => {
    const grace = mentor('Grace Lee', { gender: 'female' })
    const ana = person('Ana Ruiz', { gender: 'female' })
    const james = person('James Park', { gender: 'male' })
    const intoAWomensGroup = { countsAsAGroup: true, declaredGender: 'female' } as const
    const off = { ...DEFAULTS, suggestGenderMatch: false }
    expect(suggest([grace, ana, james], off, intoAWomensGroup).pairs.map((pair) => pair.participant.fullName)).toEqual(
      ['Ana Ruiz'],
    )
    // A group declared mixed is what it says it is.
    const intoAMixedGroup = { countsAsAGroup: true, declaredGender: null } as const
    expect(suggest([grace, ana, james], DEFAULTS, intoAMixedGroup).pairs).toHaveLength(2)
  })

  it('suggests a 25-34 Leader for a 35-44 Participant at the default gap of 1, and not a 45-54 one', () => {
    const grace = mentor('Grace Lee', { ageBand: '25-34' })
    const up1 = person('Mia Chen', { ageBand: '35-44' })
    const up2 = person('Zoe Park', { ageBand: '45-54' })
    expect(pairsOf([grace, up1, up2])).toEqual(['Grace Lee -> Mia Chen'])
  })

  it('suggests a 65+ Leader for an 18-24 Participant: the age band points one way only', () => {
    const grace = mentor('Grace Lee', { ageBand: '65+' })
    const ana = person('Ana Ruiz', { ageBand: '18-24' })
    expect(pairsOf([grace, ana])).toEqual(['Grace Lee -> Ana Ruiz'])
  })

  it('excludes any Participant in a band above their Leader at a gap of 0', () => {
    const grace = mentor('Grace Lee', { ageBand: '25-34' })
    const same = person('Mia Chen', { ageBand: '25-34' })
    const above = person('Zoe Park', { ageBand: '35-44' })
    expect(pairsOf([grace, same, above], { ...DEFAULTS, suggestMaxAgeBandGap: 0 })).toEqual(['Grace Lee -> Mia Chen'])
  })

  it('reads both constraints from the settings it is handed, not from constants', () => {
    const grace = mentor('Grace Lee', { gender: 'female', ageBand: '18-24' })
    const james = person('James Park', { gender: 'male', ageBand: '65+' })
    expect(pairsOf([grace, james])).toEqual([])
    expect(pairsOf([grace, james], { suggestGenderMatch: false, suggestMaxAgeBandGap: 5 })).toEqual([
      'Grace Lee -> James Park',
    ])
  })
})

describe('Suggested Pairs: the pools', () => {
  it('takes Leaders who answered the mentor side or lead an open relationship, with no cap on how many they lead', () => {
    const offered = mentor('Grace Lee')
    const leading = person('Ruth Obi', {
      memberships: [member('r1', 'leader'), member('r2', 'leader'), member('r3', 'leader')],
      availability: hours('friday', 4).concat(hours('sunday', 4)),
    })
    const ana = person('Ana Ruiz')
    const eve = person('Eve Stone', { availability: hours('friday', 4).concat(hours('sunday', 4)) })
    expect(pairsOf([offered, leading, ana, eve])).toEqual(['Grace Lee -> Ana Ruiz', 'Ruth Obi -> Eve Stone'])
  })

  it('leaves out a Leader or Participant with no Intake, no consent, or an opt-out', () => {
    const ana = person('Ana Ruiz')
    for (const unready of [
      { intakeSubmittedAt: null },
      { consentsToTexts: false },
      { optedOut: true },
    ] satisfies Parameters<typeof person>[1][]) {
      expect(pairsOf([mentor('Grace Lee', unready), ana])).toEqual([])
      expect(pairsOf([mentor('Grace Lee'), person('Mia Chen', unready)])).toEqual([])
    }
  })

  it('holds everyone in an unaccepted relationship out of both pools', () => {
    const awaiting = { awaitingAcceptance: true }
    expect(pairsOf([mentor('Grace Lee', { memberships: [member('r1', 'leader', awaiting)] }), person('Ana Ruiz')]))
      .toEqual([])
    expect(pairsOf([mentor('Grace Lee'), person('Ana Ruiz', { memberships: [member('r2', 'participant', awaiting)] })]))
      .toEqual([])
  })

  it('keeps a Leader who holds an open group out of group suggestions and in one-to-one ones', () => {
    const grace = mentor('Grace Lee', { memberships: [member('g1', 'leader', { countsAsAGroup: true })] })
    const ana = person('Ana Ruiz')
    expect(suggest([grace, ana], DEFAULTS, A_ONE_TO_ONE).pairs).toHaveLength(1)
    expect(suggest([grace, ana], DEFAULTS, { countsAsAGroup: true, declaredGender: null }).pairs).toEqual([])
  })

  it('offers somebody already in an open one-to-one as a Participant no second one, and somebody in groups only first after the undiscipled', () => {
    const grace = mentor('Grace Lee')
    const inAOneToOne = person('Mia Chen', { memberships: [member('r1', 'participant')] })
    const inAGroup = person('Ana Ruiz', { memberships: [member('g1', 'participant', { countsAsAGroup: true })] })
    const undiscipled = person('Zoe Park')
    expect(pairsOf([grace, inAOneToOne, inAGroup, undiscipled])).toEqual([
      'Grace Lee -> Zoe Park',
      'Grace Lee -> Ana Ruiz',
    ])
  })

  it('lets one person lead on one suggestion and be led on another, the pools never deduplicated', () => {
    const grace = mentor('Grace Lee', { ageBand: '45-54' })
    // Ruth leads somebody and asked to be discipled herself, so the Roster calls her both.
    const ruth = person('Ruth Obi', {
      ageBand: '35-44',
      declaredSide: 'mentee',
      memberships: [member('r9', 'leader')],
      availability: [...WEEK, ...hours('tuesday', 2)],
    })
    const ana = person('Ana Ruiz', { ageBand: '18-24', availability: hours('tuesday', 2) })
    const pairs = pairsOf([grace, ruth, ana])
    expect(pairs).toContain('Grace Lee -> Ruth Obi')
    expect(pairs).toContain('Ruth Obi -> Ana Ruiz')
  })

  it('offers as a Disciple only somebody the Roster calls one: a Discipler nobody disciples is not, unless they asked to be on their Intake form', () => {
    // Ruth and Grace mark the same hours; neither is proposed as the other's Disciple,
    // because the Roster lists neither as one and the Pair popup could not choose them.
    expect(pairsOf([mentor('Ruth Obi'), mentor('Grace Lee'), person('Ana Ruiz')])).toEqual(['Ruth Obi -> Ana Ruiz'])
    // Somebody who leads and answered the mentee side is on both of the Roster's lists (James, 2026-09-22).
    const asked = person('Ruth Obi', { declaredSide: 'mentee', memberships: [member('r1', 'leader')] })
    expect(pairsOf([mentor('Grace Lee'), asked])).toEqual(['Grace Lee -> Ruth Obi'])
  })

  it('never pairs a person with themselves', () => {
    const grace = mentor('Grace Lee')
    expect(suggest([grace], DEFAULTS).pairs).toEqual([])
  })

  it('never offers B under A while A is an open Participant under B', () => {
    // Ruth disciples Grace; Grace may not be suggested as Ruth's Discipler.
    const ruth = mentor('Ruth Obi', { memberships: [member('r1', 'leader')] })
    const grace = mentor('Grace Lee', { memberships: [member('r1', 'participant')] })
    expect(pairsOf([ruth, grace])).not.toContain('Grace Lee -> Ruth Obi')
  })

  it('never suggests two people already in an open relationship together', () => {
    const grace = mentor('Grace Lee', { memberships: [member('g1', 'leader', { countsAsAGroup: true })] })
    const ana = person('Ana Ruiz', { memberships: [member('g1', 'participant', { countsAsAGroup: true })] })
    expect(pairsOf([grace, ana])).toEqual([])
  })

  it('recalculates the moment a pairing changes who is available', () => {
    const grace = mentor('Grace Lee')
    const ana = person('Ana Ruiz')
    expect(pairsOf([grace, ana])).toEqual(['Grace Lee -> Ana Ruiz'])
    // The same Roster read after Ana was paired to somebody else, still unaccepted.
    expect(pairsOf([grace, { ...ana, memberships: [member('r9', 'participant', { awaitingAcceptance: true })] }]))
      .toEqual([])
  })
})

describe('Suggested Pairs: the order', () => {
  it('breaks a tie on overlap and goal by the longest wait since Intake', () => {
    const grace = mentor('Grace Lee')
    const later = person('Ana Ruiz', { intakeSubmittedAt: new Date('2026-09-10T00:00:00Z') })
    const earlier = person('Zoe Park', { intakeSubmittedAt: new Date('2026-08-10T00:00:00Z') })
    expect(pairsOf([grace, later, earlier])).toEqual(['Grace Lee -> Zoe Park', 'Grace Lee -> Ana Ruiz'])
  })

  it('reads the same however the Roster arrived', () => {
    const roster = [
      mentor('Grace Lee'),
      mentor('Ruth Obi', { availability: hours('monday', 3) }),
      person('Ana Ruiz'),
      person('Mia Chen', { availability: hours('monday', 3) }),
      person('Zoe Park', { goal: PRAYER }),
      person('Eve Stone', { availability: [] }),
      person('Ivy Moss', { availability: [] }),
    ]
    const once = suggest(roster, DEFAULTS)
    expect(suggest([...roster].reverse(), DEFAULTS)).toEqual(once)
    expect(suggest(roster, DEFAULTS)).toEqual(once)
  })

  it('gives each Participant one suggestion, with the strongest Leader for them', () => {
    const weaker = mentor('Ruth Obi', { availability: hours('monday', 2) })
    const stronger = mentor('Grace Lee')
    const ana = person('Ana Ruiz')
    const forAna = suggest([weaker, stronger, ana], DEFAULTS).pairs.filter((pair) => pair.participant.fullName === 'Ana Ruiz')
    expect(forAna.map((pair) => pair.leader.fullName)).toEqual(['Grace Lee'])
  })
})

describe('Suggested Pairs: No Schedule Overlap', () => {
  it('returns people who share no time with any Leader separately, longest waiting first, and never as a fit', () => {
    const grace = mentor('Grace Lee', { availability: hours('monday', 4) })
    const recent = person('Ana Ruiz', { availability: hours('sunday', 4), intakeSubmittedAt: new Date('2026-09-10') })
    const waiting = person('Zoe Park', { availability: [], intakeSubmittedAt: new Date('2026-08-10') })
    const { pairs, noScheduleOverlap } = suggest([grace, recent, waiting], DEFAULTS)
    expect(pairs).toEqual([])
    expect(noScheduleOverlap.map((each) => each.fullName)).toEqual(['Zoe Park', 'Ana Ruiz'])
    expect(noScheduleOverlap.every((each) => !('tier' in each) && !('reason' in each))).toBe(true)
  })

  it('does not list a Discipler who overlaps no other Discipler, unless the Roster calls them a Disciple too', () => {
    const grace = mentor('Grace Lee', { availability: hours('monday', 4) })
    const ruth = mentor('Ruth Obi', { availability: hours('sunday', 4) })
    expect(suggest([grace, ruth], DEFAULTS).noScheduleOverlap).toEqual([])
    // Ivy leads somebody and asked to be discipled herself: she is waiting to be placed.
    const ivy = person('Ivy Chen', {
      declaredSide: 'mentee',
      memberships: [member('r1', 'leader')],
      availability: hours('sunday', 4),
    })
    expect(suggest([grace, ivy], DEFAULTS).noScheduleOverlap.map((each) => each.fullName)).toEqual(['Ivy Chen'])
  })

  it('does not list somebody who has a suggestion', () => {
    const { pairs, noScheduleOverlap } = suggest([mentor('Grace Lee'), person('Ana Ruiz')], DEFAULTS)
    expect(pairs).toHaveLength(1)
    expect(noScheduleOverlap).toEqual([])
  })
})
