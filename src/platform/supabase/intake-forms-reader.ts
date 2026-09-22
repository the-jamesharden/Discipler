import {
  followUpItemId,
  materialId,
  personId,
  relationshipId,
  type MaterialId,
  type PersonId,
  type RelationshipId,
} from '~/domain/ids'
import { goalWording, type OfferedGoal } from '~/domain/discipleship-goals'
import { AGE_BANDS, GENDERS, discipleshipGoalId, isOneOf } from '~/domain/intake'
import type {
  IntakeFormsPage,
  IntakeFormsReader,
  JoinRequestOnTheRoster,
  MaterialOption,
  MinistryGroup,
} from '~/service/ports'
import { liveMaterialRows } from './materials-reader'
import { adminPage, list, readPageDocument, type PageDocument } from './page'
import { instant } from './relationship-history'
import { count, declaredGenderOf, text } from './rows'
import { createSupabaseServerClient } from './server-client'

/**
 * What Intake forms shows an Admin: the groups, whoever is waiting to join one,
 * the Ministry's own Discipleship Goal options, and the names of the people a
 * query string may refer to.
 *
 * One document, `intake_forms_page`, read through the signed-in Admin's session,
 * so the definer functions behind it are what scope it rather than a `where`
 * clause this file could forget -- each answers for the Ministry the caller
 * administers and for no other, which is how *goals are never shared or compared
 * across Ministries* stays true of the data instead of true of the page.
 */

/** A text[] column as PostgREST hands it back, or nothing where it is not one. */
const names = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : []

/**
 * A group as `ministry_groups` describes it. A function, for the reason the
 * Roster is one and for one more: *is this a group* is the capacity question
 * ADR-0004 fences to the database, and the function answers it without this file
 * naming what a group is.
 */
const asGroup = (running: RunningPeriods) => (row: Record<string, unknown>): MinistryGroup => {
  const id = text(row.relationship_id)
  if (!id) throw new Error('A group row arrived with no id')
  return {
    relationshipId: relationshipId(id),
    name: text(row.name),
    declaredGender: declaredGenderOf(row.declared_gender),
    joinRequiresApproval: row.join_requires_approval === true,
    accepted: row.accepted === true,
    leaderNames: names(row.leader_names),
    participantNames: names(row.participant_names),
    running: running.get(relationshipId(id)) ?? null,
  }
}

type RunningPeriods = ReadonlyMap<
  RelationshipId,
  { readonly materialId: MaterialId | null; readonly since: Date }
>

/**
 * Each live group's running Material period, by group (Materials, ticket 03). A
 * group nobody has accepted has none, and is absent here. A row without its start
 * is the function and this reader having drifted apart, and a dropdown
 * pre-selected on a guess is the wrong answer shown confidently.
 */
const runningPeriodsOf = (doc: PageDocument): RunningPeriods =>
  new Map(
    list(doc, 'group_materials').map((row) => {
      const id = text(row.relationship_id)
      const since = instant(row.started_at)
      if (!id || !since) {
        throw new Error(`A group's running Material period arrived incomplete: ${JSON.stringify(row)}`)
      }
      const material = text(row.material_id)
      return [
        relationshipId(id),
        { materialId: material === null ? null : materialId(material), since },
      ] as const
    }),
  )

const asJoinRequest = (row: Record<string, unknown>): JoinRequestOnTheRoster => {
  const item = text(row.item_id)
  const person = text(row.person_id)
  const fullName = text(row.full_name)
  const relationship = text(row.relationship_id)
  const raisedAt = text(row.raised_at)
  if (!item || !person || !fullName || !relationship || !raisedAt) {
    throw new Error('A join request arrived with a piece missing')
  }
  const gender = row.gender
  const ageBand = row.age_band
  return {
    itemId: followUpItemId(item),
    personId: personId(person),
    fullName,
    relationshipId: relationshipId(relationship),
    groupName: text(row.group_name),
    gender: isOneOf(GENDERS, gender) ? gender : null,
    ageBand: isOneOf(AGE_BANDS, ageBand) ? ageBand : null,
    raisedAt: new Date(raisedAt),
  }
}

/**
 * Checked field by field rather than cast, like the Roster row beside it. The
 * function, the grants and this reader can each move without the others, and this
 * is the screen an Admin removes options from: an option that arrived without its
 * count would offer a removal with no warning attached, which is the one thing
 * this surface exists to prevent.
 *
 * `count` is the shared reading of a bigint, and the effect store's read of this
 * same function uses it too -- the two had drifted into different strictness, and
 * the lenient one was the one writing the number into history.
 */
const asOption = (row: Record<string, unknown>): OfferedGoal => {
  const id = text(row.id)
  const label = text(row.label)
  const position = count(row.list_position)
  const chosenBy = count(row.chosen_by)

  if (id === null) throw new Error('A Discipleship Goal option arrived with no id')
  if (label === null) {
    throw new Error(`A Discipleship Goal option arrived with no wording: ${id}`)
  }
  if (position === null) {
    throw new Error(`A Discipleship Goal option arrived with no place on the list: ${id}`)
  }
  if (chosenBy === null) {
    throw new Error(`No count of who chose Discipleship Goal ${id} came back`)
  }

  // The column is the authority on its own wording: it is what `readGoalWording`
  // wrote, and `unique (ministry_id, label)` has held it since.
  return { id: discipleshipGoalId(id), label: goalWording(label), position, chosenBy }
}

/**
 * Everyone on the Roster by name. A row without both halves is dropped rather
 * than carried forward as a placeholder: the page falls back on saying nothing,
 * whereas one handed the string `"null"` would print it.
 */
const namesOf = (rows: readonly Record<string, unknown>[]): ReadonlyMap<PersonId, string> =>
  new Map(
    rows.flatMap((row) => {
      const id = text(row.id)
      const fullName = text(row.full_name)
      return id !== null && fullName !== null ? [[personId(id), fullName] as const] : []
    }),
  )

/** What Intake forms derives from its document. */
export const intakeFormsPageFrom = (doc: PageDocument): IntakeFormsPage => ({
  groups: list(doc, 'groups').map(asGroup(runningPeriodsOf(doc))),
  joinRequests: list(doc, 'join_requests').map(asJoinRequest),
  // The options behind the one question both forms ask that the Ministry writes
  // itself. A function rather than a table read plus a count of its own: the count
  // is *people whose current answer points here*, which is a `distinct on` over an
  // append-only table -- and the command boundary decides against the very same
  // definition, so an Admin cannot be warned with one number and have history
  // record another. Already ordered by position: the Ministry's own ordering is
  // pastoral and is the function's to give back, not this reader's to impose.
  goals: list(doc, 'goal_options').map(asOption),
  nameOf: namesOf(list(doc, 'people')),
  // Id and title, which is what a select needs, with the one definition of *live*
  // the Materials tab and the Pair popup share (Materials, ticket 03).
  materials: liveMaterialRows(doc).map(({ materialId, title }): MaterialOption => ({ materialId, title })),
  timeZone: text(doc.timezone),
})

export const supabaseIntakeFormsReader: IntakeFormsReader = {
  async readIntakeFormsPage() {
    const supabase = await createSupabaseServerClient()
    return adminPage(await readPageDocument(supabase, 'intake_forms_page'), intakeFormsPageFrom)
  },
}
