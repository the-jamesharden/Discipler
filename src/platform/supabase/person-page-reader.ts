import type { Clock } from '~/domain/clock'
import type { PersonPage } from '~/service/ports'
import { formsNowFrom, ownAnswersFrom } from './intake-form-document'
import type { PageDocument } from './page'
import { rosterPageFrom } from './roster-reader'
import { looksLikeAnId } from './rows'

/**
 * The person page's one read (Pastor feedback, ticket 12): the Roster's document,
 * and beside it the one Person's answers to the Ministry's own Intake questions,
 * which the Roster row never shows. A file of its own, apart from the Roster's
 * reader, because those answers are shown and never matched on, and the Roster's
 * rows are what the Pair popup's rules read (`own-answers-are-never-matched-on`).
 */

/**
 * Which page function answers the person page: the one with that Person's own
 * answers beside the Roster, for a Person named by an id; the Roster's alone
 * otherwise, which answers the page's *not found* the same way without asking
 * the database about an id that cannot be one.
 */
export const personDocument = (
  person: string,
): [page: string, args?: Readonly<Record<string, unknown>>] =>
  looksLikeAnId(person) ? ['person_intake_page', { intake_person_id: person }] : ['person_page']

/** The person page, out of its one document. Exported so a test can drive it with a real session. */
export const personPageFrom = (doc: PageDocument, clock: Clock): PersonPage => ({
  ...rosterPageFrom(doc, clock, 'person'),
  ownAnswers: ownAnswersFrom(formsNowFrom(doc.intake_forms), doc.own_answers),
})
