import type { Branded } from './branded'
import type { IntakeSubmissionId, PersonId } from './ids'
import type { DiscipleshipGoalId } from './intake'
import { readWording } from './wording'

/**
 * The list of Discipleship Goals a Ministry offers at Intake is the Ministry's
 * own, set before a semester begins. Nothing here touches a database: the options
 * come from `discipleship_goal`, which stores them, and every rule about what an
 * Admin may do to the list is decided here, where a test can drive a whole
 * semester's worth of edits in a millisecond.
 *
 * Two facts about the list shape all of it. An option is a row, so renaming one
 * keeps every answer that points at it -- a reworded option is the same option.
 * And removing one blanks those answers, so the count of who chose it travels
 * with the option rather than being looked up afterwards by whoever happens to
 * need it. ADR-0014 records why a removal is allowed to take a stated goal off
 * every live surface when nothing else in this product overwrites a past fact --
 * and why the answers it blanks are written into the removal event first, so that
 * what a Ministry lost from its screens is not also lost from its record.
 */

/**
 * Wording that has been through `readGoalWording` -- trimmed, its internal
 * whitespace collapsed, and not empty.
 *
 * Branded for the reason `PhoneNumber` is: the difference between what an Admin
 * typed into a box and the wording an option will actually carry is the whole of
 * this module's input handling, and a plain `string` loses it. The same normalising
 * is relied on by `alreadyOffered` above and by `unique (ministry_id, label)`
 * below, and only the brand records which strings have been through the first.
 */
export type GoalWording = Branded<string, 'GoalWording'>

/** At the platform edge, where the database is the authority on its own column. */
export const goalWording = (value: string): GoalWording => value as GoalWording

/**
 * One option as the Ministry currently offers it, with how many people it would
 * cost to remove.
 *
 * `chosenBy` counts people and not submissions. Intake is append-only and may be
 * re-submitted, so a Person who changed their answer points at one option and
 * used to point at another -- and the warning an Admin needs is about the people
 * whose stated goal would go, not about rows.
 */
export interface OfferedGoal {
  readonly id: DiscipleshipGoalId
  readonly label: GoalWording
  /** Where it appears on the form. The Ministry's own ordering, and pastoral. */
  readonly position: number
  /** How many people's current Intake answer points at this option. */
  readonly chosenBy: number
}

/** Which way along the list an Admin asked to move an option. */
export type GoalDirection = 'up' | 'down'

export const isGoalDirection = (value: unknown): value is GoalDirection =>
  value === 'up' || value === 'down'

/**
 * The wording an option will actually carry, or null where there is none.
 *
 * Trimmed, and internal runs of whitespace collapsed, because the difference
 * between `Career  and calling` and `Career and calling` is a typo rather than a
 * second option a Ministry meant to offer -- and without this the two would sit
 * on the form as separate choices that read identically. That rule is
 * `readWording`'s, shared with the Ministry's own name and its role nouns, which
 * are the same rule about the same box; what is decided here is only the brand.
 */
export const readGoalWording = (raw: string): GoalWording | null =>
  readWording(raw) as GoalWording | null

/**
 * Whether this Ministry already offers an option worded like this, ignoring the
 * option being reworded.
 *
 * Case-insensitive, which is stricter than the database's own unique index. Two
 * options differing only in capitalisation are one option as far as a Person
 * reading the form is concerned, and offering both is a list nobody meant to
 * make. The exception is what lets an Admin correct the capitalisation of an
 * option: compared against itself, an option is not its own duplicate.
 */
export const alreadyOffered = (
  goals: readonly OfferedGoal[],
  wording: GoalWording,
  except?: DiscipleshipGoalId,
): boolean =>
  goals.some(
    (goal) =>
      goal.id !== except && goal.label.toLocaleLowerCase() === wording.toLocaleLowerCase(),
  )

/** The option this id names, or undefined where the Ministry offers no such thing. */
export const offeredGoal = (
  goals: readonly OfferedGoal[],
  id: DiscipleshipGoalId,
): OfferedGoal | undefined => goals.find((goal) => goal.id === id)

/**
 * Where a new option goes: last.
 *
 * After the highest position rather than after the count of options, because
 * removing one leaves a gap and a new option landing in that gap would collide
 * with whatever already sits below it.
 */
export const nextPosition = (goals: readonly OfferedGoal[]): number =>
  goals.reduce((highest, goal) => Math.max(highest, goal.position), 0) + 1

/**
 * The whole list in the order it will be shown after one option moves one place,
 * or null where nothing moves: the first option asked upwards, or the last asked
 * downwards.
 *
 * The whole order rather than the pair that swapped. Positions are the Ministry's
 * and the list is short, so rewriting all of them is what keeps a list that had
 * drifted -- gaps left by removals, a position two options once shared -- coming
 * out contiguous instead of preserving the drift one swap at a time.
 *
 * Null means one thing only: *the list is already like that*. That is not a
 * refusal -- an Admin pressing up on the top option has asked for the list they
 * are already looking at, and telling them off for it would be inventing an error
 * out of a no-op. The option is taken rather than its id so that *this Ministry
 * does not offer that* cannot arrive here as the same null; it is `goal.not_found`,
 * refused by the caller, which is a different thing to say to an Admin.
 */
export const orderAfterMoving = (
  goals: readonly OfferedGoal[],
  goal: OfferedGoal,
  direction: GoalDirection,
): readonly DiscipleshipGoalId[] | null => {
  const shown = [...goals].sort((one, other) => one.position - other.position)
  const from = shown.findIndex((option) => option.id === goal.id)
  if (from < 0) {
    throw new Error(`Discipleship Goal ${goal.id} is not on the list it is being moved in`)
  }

  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= shown.length) return null

  const moved = [...shown]
  const [option] = moved.splice(from, 1)
  moved.splice(to, 0, option!)

  return moved.map((option) => option.id)
}

/**
 * One submission that pointed at an option, as it stood before the removal blanked
 * it.
 *
 * Every submission and not only the standing ones. `chosenBy` counts *people whose
 * current answer points here*, which is what an Admin is deciding about; the delete
 * blanks every row pointing at the option, including the superseded submissions of
 * somebody who has since answered differently. The two are different sets and the
 * larger one is what has to be written down, or a removal still destroys rows
 * nothing recorded.
 */
export interface StatedGoal {
  readonly submissionId: IntakeSubmissionId
  readonly personId: PersonId
  readonly submittedAt: Date
}
