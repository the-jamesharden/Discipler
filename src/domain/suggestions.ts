import type { PersonId, RelationshipId } from './ids'
import {
  AGE_BANDS,
  slotKey,
  type AgeBand,
  type AvailabilitySlot,
  type DeclaredSide,
  type DiscipleshipGoalId,
  type Gender,
} from './intake'
import type { MinistrySettings } from './ministry-settings'
import type { MemberRole } from './relationships'

/**
 * Suggested Pairs: who could lead whom, ranked, with a reason anyone could read aloud.
 *
 * A pure function of the Roster and the Ministry's two pairing settings. No I/O and
 * no clock: the longest wait is the earliest Intake, which needs no *now*.
 *
 * Exactly four inputs, in two categories that never mix
 * (`docs/adr/0001-pairing-suggestion-inputs.md`). **Constraints** -- gender and the
 * age band -- remove combinations before anything is ranked and never appear as a
 * reason. **Ranking inputs** -- the count of shared availability slots, always
 * dominant, and the Discipleship Goal, which only separates comparable overlaps --
 * order whoever is left. Nothing else a Person answered reaches this file.
 *
 * The output is three labels and no number. A count of shared slots is spoken in
 * the reason sentence as words and is never a field, so no screen can print a score.
 */

/**
 * Where Excellent fit and Good fit begin, as counts of shared one-hour slots out of
 * the grid's eighty-four.
 *
 * **These numbers were set against the thirty-five-cell grid and carried over
 * unchanged** when the grid went hourly. `docs/adr/0018-the-hourly-grid.md` reopened
 * them and nothing has re-decided them; the design prototype, which is already
 * hourly, still draws these. One constant, so a new decision is one edit and the
 * tests that pin each boundary say which one moved.
 *
 * The distinct-days rule is the part that earns its keep: four hours that are all
 * one Saturday are one afternoon, not four separate chances to meet.
 */
export const TIER_CUTOFFS = {
  excellentSlots: 4,
  excellentDays: 2,
  goodSlots: 2,
} as const

export const TIERS = ['excellent', 'good', 'recommended'] as const
export type Tier = (typeof TIERS)[number]

/** A goal as the suggestion names it: matched by id, spoken by the Ministry's current wording. */
export interface SuggestionGoal {
  readonly id: DiscipleshipGoalId
  readonly label: string
}

/** One open membership, as far as the pools and the exclusions need to know it. */
export interface CandidateMembership {
  readonly relationshipId: RelationshipId
  readonly role: MemberRole
  /**
   * Which participation cap it counts against, as the database declared it when it
   * was formed (ADR-0004). Told the answer, never the kind it came from.
   */
  readonly countsAsAGroup: boolean
  /**
   * Nobody has agreed to lead it yet, or this Person has not agreed to their part in
   * it. Everyone in an unaccepted relationship is held out of both pools, because
   * suggesting them elsewhere would let two Admins double-book one person.
   */
  readonly awaitingAcceptance: boolean
}

/** One Person on the Roster, with what their latest Intake said. */
export interface SuggestionCandidate {
  readonly personId: PersonId
  readonly fullName: string
  /** Null only where there is no Intake, and such a Person is in neither pool. */
  readonly gender: Gender | null
  readonly ageBand: AgeBand | null
  /** Null where they never chose one, or the Ministry retired the option they chose. */
  readonly goal: SuggestionGoal | null
  /** What their latest Intake selected. */
  readonly availability: readonly AvailabilitySlot[]
  /** Their latest Intake, which is the answers being ranked; null where there is none. */
  readonly intakeSubmittedAt: Date | null
  /** Their current decision on texts is yes. Null and no are both not. */
  readonly consentsToTexts: boolean
  readonly optedOut: boolean
  /** The side they answered at their latest Intake, or null where the form did not ask. */
  readonly declaredSide: DeclaredSide | null
  readonly memberships: readonly CandidateMembership[]
}

/**
 * What is being suggested, which decides who is in the pools and never how they are
 * ordered. A one-to-one is the only kind the tab offers today; the group case is a
 * parameter so that suggesting into a group changes the pools and nothing else.
 *
 * A group that declared a gender takes only people of it, Leader and Participant
 * alike, whatever `suggestGenderMatch` says: the declaration is a statement an Admin
 * made about one relationship on purpose, and the Ministry-wide setting does not
 * disable it. Null is a group declared mixed, which no gender rule constrains.
 */
export type SuggestionKind =
  | { readonly countsAsAGroup: false }
  | { readonly countsAsAGroup: true; readonly declaredGender: Gender | null }

export const A_ONE_TO_ONE: SuggestionKind = { countsAsAGroup: false }

export type SuggestionSettings = Pick<MinistrySettings, 'suggestGenderMatch' | 'suggestMaxAgeBandGap'>

declare const reasonBrand: unique symbol

/**
 * The one plain sentence every suggestion states. Branded with a symbol this module
 * does not export, so the only way to hold one is to have had `suggest` write it,
 * and a `SuggestedPair` without a reason cannot be constructed. The reason card is a
 * permanent constraint, not a UI preference: an input that cannot be said this way
 * is out of scope by construction.
 */
export type SuggestionReason = string & { readonly [reasonBrand]: true }

/** A Person as a suggestion shows them. */
export interface SuggestedPerson {
  readonly personId: PersonId
  readonly fullName: string
  readonly ageBand: AgeBand | null
  readonly goal: string | null
  /** When the Intake being ranked was given: how long they have waited. */
  readonly intakeSubmittedAt: Date
}

export interface SuggestedPair {
  readonly tier: Tier
  readonly leader: SuggestedPerson
  readonly participant: SuggestedPerson
  readonly reason: SuggestionReason
}

export interface Suggestions {
  /** Strongest first, one per Participant, in an order that reads the same on every visit. */
  readonly pairs: readonly SuggestedPair[]
  /**
   * Participants who share no time with any Leader they could be suggested, longest
   * waiting first. Listed for visibility and never presented as a fit.
   */
  readonly noScheduleOverlap: readonly SuggestedPerson[]
}

/** Completed Intake, agreed to texts, and has not opted out. Both pools begin here. */
const readyToPair = (person: SuggestionCandidate): boolean =>
  person.intakeSubmittedAt !== null && person.consentsToTexts && !person.optedOut

const held = (person: SuggestionCandidate): boolean =>
  person.memberships.some((membership) => membership.awaitingAcceptance)

const leadsOpen = (person: SuggestionCandidate, groupsOnly: boolean): boolean =>
  person.memberships.some(
    (membership) => membership.role === 'leader' && (!groupsOnly || membership.countsAsAGroup),
  )

/**
 * Whether Suggested Pairs offers this Person to disciple somebody: leading an open
 * relationship or having answered the mentor side at Intake. It is the rule that
 * presets the Pair popup on *Disciples somebody* (`isDiscipler` in
 * `app/roster/lists.ts`, Roles per pairing, ticket 01), less its third fact, an
 * import planning them as one, which is not a suggestion input.
 */
const isADiscipler = (person: SuggestionCandidate): boolean =>
  person.declaredSide === 'mentor' || leadsOpen(person, false)

/**
 * Whether Suggested Pairs offers this Person to be discipled: being discipled
 * already, having asked to be on their Intake form, or not being one it offers to
 * disciple at all. So somebody it offers to disciple, whom nobody disciples and
 * who did not ask, is not offered here. This was the Roster's Disciples list
 * (James, 2026-09-22), drawn so because the Pair popup a card opens could not
 * then choose such a person. Since Roles per pairing, ticket 01, the popup can
 * choose anybody on either side, so that reason is gone; the pool stands as it
 * was until James decides whether it should widen. Somebody in both pools is the
 * multiplication case working.
 */
const isADisciple = (person: SuggestionCandidate): boolean =>
  person.memberships.some((membership) => membership.role === 'participant') ||
  person.declaredSide === 'mentee' ||
  !isADiscipler(person)

/**
 * Everyone `isADiscipler` takes, with Intake, consent and no opt-out. No
 * cap on how many they already lead, except that a Leader already holding an open
 * group cannot be offered a second.
 */
export const leaderPool = (
  roster: readonly SuggestionCandidate[],
  kind: SuggestionKind,
): readonly SuggestionCandidate[] =>
  roster.filter(
    (person) =>
      readyToPair(person) &&
      !held(person) &&
      isADiscipler(person) &&
      !(kind.countsAsAGroup && leadsOpen(person, true)),
  )

/**
 * Everyone `isADisciple` takes, with Intake, consent and no opt-out; somebody who
 * disciples may be discipled too. Somebody already a Participant in an open
 * one-to-one cannot be offered a second.
 */
export const participantPool = (
  roster: readonly SuggestionCandidate[],
  kind: SuggestionKind,
): readonly SuggestionCandidate[] =>
  roster.filter(
    (person) =>
      readyToPair(person) &&
      !held(person) &&
      isADisciple(person) &&
      !(
        !kind.countsAsAGroup &&
        person.memberships.some((membership) => membership.role === 'participant' && !membership.countsAsAGroup)
      ),
  )

/**
 * Whether this pair may be suggested at all. Constraints only: nothing here ranks.
 *
 * Beside the two ADR-0001 constraints, three combinations are never offered: a
 * person with themselves; two people already in an open relationship together; and
 * B as a Participant under A while A is an open Participant under B. The last is a
 * rule about suggesting only, deliberately not a database constraint -- an Admin
 * who wants two people in each other's care may have a reason the product does not.
 */
export const maySuggest = (
  leader: SuggestionCandidate,
  participant: SuggestionCandidate,
  settings: SuggestionSettings,
  kind: SuggestionKind,
): boolean => {
  if (leader.personId === participant.personId) return false

  const leaderIn = new Set(leader.memberships.map((membership) => membership.relationshipId))
  if (participant.memberships.some((membership) => leaderIn.has(membership.relationshipId))) return false

  if (kind.countsAsAGroup) {
    if (kind.declaredGender !== null) {
      if (leader.gender !== kind.declaredGender || participant.gender !== kind.declaredGender) return false
    }
  } else if (settings.suggestGenderMatch) {
    if (leader.gender === null || leader.gender !== participant.gender) return false
  }

  // One direction only: a Participant at most N bands above their Leader, and no
  // limit below. An older person discipling a younger one is the common case.
  if (leader.ageBand === null || participant.ageBand === null) return false
  return AGE_BANDS.indexOf(participant.ageBand) - AGE_BANDS.indexOf(leader.ageBand) <= settings.suggestMaxAgeBandGap
}

/** The slots both selected, each counted once. */
const sharedSlots = (a: SuggestionCandidate, b: SuggestionCandidate): readonly AvailabilitySlot[] => {
  const theirs = new Set(b.availability.map(slotKey))
  const seen = new Set<string>()
  return a.availability.filter((slot) => {
    const key = slotKey(slot)
    if (!theirs.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Counts of shared slots and nothing else. Zero is not a tier: it is No Schedule Overlap. */
export const tierOf = (slots: number, days: number): Tier | null => {
  if (slots >= TIER_CUTOFFS.excellentSlots && days >= TIER_CUTOFFS.excellentDays) return 'excellent'
  if (slots >= TIER_CUTOFFS.goodSlots) return 'good'
  if (slots >= 1) return 'recommended'
  return null
}

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty']

/** A count of shared slots as a word, so no sentence starts with a numeral. The grid holds eighty-four. */
const inWords = (count: number): string => {
  if (count < 20) return ONES[count]!
  const tens = TENS[Math.floor(count / 10)]!
  return count % 10 === 0 ? tens : `${tens}-${ONES[count % 10]}`
}

/**
 * *Four shared time slots. You both selected Career and calling.* The goal is named
 * only where it matches, and a mismatch never: what two people do not have in common
 * is a judgment about them, not a statement about their calendars.
 */
const reasonFor = (slots: number, goal: SuggestionGoal | null): SuggestionReason => {
  const said = inWords(slots)
  const first = `${said.charAt(0).toUpperCase()}${said.slice(1)} shared time slot${slots === 1 ? '' : 's'}.`
  return (goal === null ? first : `${first} You both selected ${goal.label}.`) as SuggestionReason
}

const shown = (person: SuggestionCandidate): SuggestedPerson => ({
  personId: person.personId,
  fullName: person.fullName,
  ageBand: person.ageBand,
  goal: person.goal?.label ?? null,
  // Everyone shown came through a pool, and both pools begin at a completed Intake.
  intakeSubmittedAt: person.intakeSubmittedAt!,
})

/** Earliest Intake first: the tie-break that quietly serves the person who has been overlooked. */
const byLongestWait = (a: SuggestionCandidate, b: SuggestionCandidate): number =>
  a.intakeSubmittedAt!.getTime() - b.intakeSubmittedAt!.getTime() || a.personId.localeCompare(b.personId)

interface Ranked {
  readonly leader: SuggestionCandidate
  readonly participant: SuggestionCandidate
  readonly tier: Tier
  readonly slots: number
  readonly sharedGoal: SuggestionGoal | null
  /** Holds no open participant membership, so is offered before somebody who does. */
  readonly undiscipled: boolean
}

/**
 * Tier, then the count within it, then a shared goal, then the Participant nobody
 * disciples yet, then the longest wait, then whichever Leader waited longest. Every
 * key ends in an id, so the order is total and a list read twice reads the same.
 */
const strongestFirst = (a: Ranked, b: Ranked): number =>
  TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) ||
  b.slots - a.slots ||
  Number(b.sharedGoal !== null) - Number(a.sharedGoal !== null) ||
  Number(b.undiscipled) - Number(a.undiscipled) ||
  byLongestWait(a.participant, b.participant) ||
  byLongestWait(a.leader, b.leader)

/**
 * The suggestions, from the Roster as it stands. Called on every read, so a pairing
 * that changes who is available changes the list at once and nothing is cached.
 *
 * One suggestion per Participant, with the strongest Leader for them. A Leader may
 * be on several, and the same person may lead on one and be led on another: the
 * pools are never deduplicated against each other.
 */
export const suggest = (
  roster: readonly SuggestionCandidate[],
  settings: SuggestionSettings,
  kind: SuggestionKind = A_ONE_TO_ONE,
): Suggestions => {
  const leaders = leaderPool(roster, kind)
  const participants = participantPool(roster, kind)

  const best: Ranked[] = []
  const overlapNobody: SuggestionCandidate[] = []

  for (const participant of participants) {
    const ranked = leaders.flatMap((leader): Ranked[] => {
      if (!maySuggest(leader, participant, settings, kind)) return []
      const shared = sharedSlots(leader, participant)
      const tier = tierOf(shared.length, new Set(shared.map((slot) => slot.day)).size)
      if (tier === null) return []
      return [
        {
          leader,
          participant,
          tier,
          slots: shared.length,
          sharedGoal:
            leader.goal !== null && participant.goal !== null && leader.goal.id === participant.goal.id
              ? participant.goal
              : null,
          undiscipled: !participant.memberships.some((membership) => membership.role === 'participant'),
        },
      ]
    })
    const strongest = ranked.sort(strongestFirst)[0]
    if (strongest !== undefined) best.push(strongest)
    // Everybody here is somebody `isADisciple` takes, since the participant pool
    // takes nobody else; one `isADiscipler` takes, whom nobody disciples and who
    // did not ask, never reaches this.
    else overlapNobody.push(participant)
  }

  return {
    pairs: best.sort(strongestFirst).map((pair) => ({
      tier: pair.tier,
      leader: shown(pair.leader),
      participant: shown(pair.participant),
      reason: reasonFor(pair.slots, pair.sharedGoal),
    })),
    noScheduleOverlap: overlapNobody.sort(byLongestWait).map(shown),
  }
}
