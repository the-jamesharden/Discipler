import { systemClock, type Clock } from '~/domain/clock'
import { AGE_BANDS, discipleshipGoalId, isOneOf, otherGoal, readSlot, type AgeBand, type AvailabilitySlot } from '~/domain/intake'
import {
  A_ONE_TO_ONE,
  suggest,
  SUGGESTION_QUESTIONS,
  type SuggestionCandidate,
  type SuggestionQuestion,
  type SuggestionSettings,
} from '~/domain/suggestions'
import type { SuggestedPairsPage, SuggestedPairsReader } from '~/service/ports'
import { careNeededFrom } from './care-needed-reader'
import { removedFromTheForms } from './intake-form-document'
import { adminPage, list, readPageDocument, type PageDocument } from './page'
import { historyOf, instant } from './relationship-history'
import { rosterFrom } from './roster-reader'
import { createSupabaseServerClient } from './server-client'

/**
 * What one Person's latest Intake said, off a `suggestion_inputs` row. Checked
 * field by field, as a Roster row is: a suggestion is something an Admin is about
 * to act on, and a column read as absent would rank somebody on availability they
 * never gave or leave them out of a pool they belong in without a word.
 */
interface Inputs {
  readonly intakeSubmittedAt: Date
  readonly consentsToTexts: boolean
  readonly ageBand: AgeBand | null
  readonly goal: SuggestionCandidate['goal']
  readonly availability: readonly AvailabilitySlot[]
}

const inputsOf = (row: Record<string, unknown>): [string, Inputs] => {
  const {
    person_id: id,
    intake_submitted_at: submittedAt,
    consents_to_texts: consents,
    age_band: ageBand,
    goal_id: goalId,
    goal_label: goalLabel,
    goal_other: goalOther,
    availability,
  } = row

  if (typeof id !== 'string' || id === '') throw new Error('A suggestion input arrived with no Person')
  const submitted = instant(submittedAt)
  if (submitted === null || Number.isNaN(submitted.getTime())) {
    throw new Error(`A suggestion input arrived with no Intake time for ${id}`)
  }
  if (typeof consents !== 'boolean') throw new Error(`A suggestion input arrived with no consent answer for ${id}`)
  // Null is a real answer since a form may stop asking it (Pastor feedback,
  // ticket 13). A band nothing recognises is the enum having grown past this
  // reader, and ranking against a guessed band is the age rule applied to
  // somebody it was never asked about.
  if (ageBand !== null && !isOneOf(AGE_BANDS, ageBand)) {
    throw new Error(`A suggestion input arrived with no age band for ${id}`)
  }
  // Null is a real answer: the Ministry retired the option they chose, and they
  // are ranked on availability alone until they answer again.
  if (goalId !== null && (typeof goalId !== 'string' || typeof goalLabel !== 'string' || goalLabel === '')) {
    throw new Error(`A suggestion input arrived with no answer about the goal for ${id}`)
  }
  // Null is a real answer here too: they chose one of the options, or the form
  // asked no goal. Anything but words or null is the column missing, which read as
  // *no typed goal* would quietly stop two people who wrote the same thing from
  // sharing it.
  if (goalOther !== null && (typeof goalOther !== 'string' || goalOther === '')) {
    throw new Error(`A suggestion input arrived with no answer about a typed goal for ${id}`)
  }
  if (goalId !== null && goalOther !== null) {
    throw new Error(`A suggestion input arrived with two goals for ${id}`)
  }
  if (!Array.isArray(availability) || availability.some((key) => typeof key !== 'string')) {
    throw new Error(`A suggestion input arrived with no availability for ${id}`)
  }
  const slots = availability.map((key: string) => readSlot(key))
  if (slots.some((slot) => slot === null)) {
    throw new Error(`A suggestion input arrived with a slot not on the grid for ${id}`)
  }

  return [
    id,
    {
      intakeSubmittedAt: submitted,
      consentsToTexts: consents,
      ageBand,
      goal:
        typeof goalId === 'string' && typeof goalLabel === 'string'
          ? { id: discipleshipGoalId(goalId), label: goalLabel }
          : typeof goalOther === 'string'
            ? { other: otherGoal(goalOther) }
            : null,
      availability: slots as AvailabilitySlot[],
    },
  ]
}

/**
 * The two constraints, off the page. Both are required: a Ministry row the session
 * could not see is not a Ministry that switched its gender rule off, and a gap read
 * as absent is not *no limit*. Thrown for rather than defaulted either way.
 */
const settingsFrom = (doc: PageDocument): SuggestionSettings => {
  const { suggest_gender_match: genderMatch, suggest_max_age_band_gap: gap } = doc
  if (typeof genderMatch !== 'boolean') throw new Error('The page said nothing about the gender match')
  if (typeof gap !== 'number' || !Number.isInteger(gap) || gap < 0) {
    throw new Error('The page said nothing about the age band gap')
  }
  return { suggestGenderMatch: genderMatch, suggestMaxAgeBandGap: gap }
}

/**
 * The Roster as the ranking reads it: every row the Roster shows, with what their
 * latest Intake said beside it. Somebody with no Intake has none of it and is in
 * neither pool, which the ranking decides and not this.
 */
export const candidatesFrom = (doc: PageDocument): readonly SuggestionCandidate[] => {
  const inputs = new Map(list(doc, 'suggestion_inputs').map(inputsOf))
  return rosterFrom(doc).map((person) => {
    const said = inputs.get(person.personId)
    return {
      personId: person.personId,
      fullName: person.fullName,
      gender: person.gender,
      ageBand: said?.ageBand ?? null,
      goal: said?.goal ?? null,
      availability: said?.availability ?? [],
      intakeSubmittedAt: said?.intakeSubmittedAt ?? null,
      consentsToTexts: said?.consentsToTexts ?? false,
      optedOut: person.participationStatus === 'opted_out',
      declaredSide: person.declaredSide,
      oneToTwo: person.oneToTwo,
      memberships: person.relationships.map((relationship) => ({
        relationshipId: relationship.relationshipId,
        role: relationship.role,
        countsAsAGroup: relationship.countsAsAGroup,
        awaitingAcceptance: relationship.awaitingAcceptance,
      })),
    }
  })
}

/**
 * What Suggested Pairs reads that the mentor and mentee form no longer asks
 * (Pastor feedback, ticket 13), in the order the tab says it. That form and not
 * the groups form: the side and the goal are asked on no other, and Suggested
 * Pairs suggests one-to-ones, which is what that form signs people up for.
 */
export const unaskedFrom = (doc: PageDocument): readonly SuggestionQuestion[] => {
  const removed = removedFromTheForms(doc.intake_forms_asked).discipleship
  return SUGGESTION_QUESTIONS.filter((question) => removed.includes(question))
}

/** Everything the tab shows, from its one document. Exported so a test can drive it with a real session. */
export const suggestedPairsPageFrom = (doc: PageDocument, clock: Clock): SuggestedPairsPage => {
  const unasked = unaskedFrom(doc)
  return {
    followUpCount: careNeededFrom(historyOf(doc), clock).length,
    suggestions: suggest(candidatesFrom(doc), settingsFrom(doc), A_ONE_TO_ONE, new Set(unasked)),
    unasked,
  }
}

/**
 * Built with a clock for the badge's number alone: the ranking itself needs none,
 * because the longest wait is the earliest Intake.
 */
export const createSupabaseSuggestedPairsReader = (clock: Clock = systemClock): SuggestedPairsReader => ({
  async readSuggestedPairsPage() {
    const doc = await readPageDocument(await createSupabaseServerClient(), 'suggested_pairs_page')
    return adminPage(doc, () => suggestedPairsPageFrom(doc, clock))
  },
})
