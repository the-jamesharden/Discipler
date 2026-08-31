import type { DiscipleshipGoalId } from './intake'

/**
 * The list of Discipleship Goals a Ministry offers at Intake is the Ministry's
 * own, set before a semester begins. Nothing here touches a database: the options
 * come from `discipleship_goal`, which stores them, and every rule about what an
 * Admin may do to the list is decided here, where a test can drive a whole
 * semester's worth of edits in a millisecond.
 *
 * Two facts about the list shape all of it. An option is a row, so renaming one
 * keeps every answer that points at it -- a reworded option is the same option.
 * And removing one blanks those answers, which is a loss no undo recovers, so the
 * count of who chose it travels with the option rather than being looked up
 * afterwards by whoever happens to need it.
 */

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
  readonly label: string
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
 * on the form as separate choices that read identically.
 */
export const readGoalWording = (raw: string): string | null => {
  const wording = raw.trim().replace(/\s+/g, ' ')
  return wording === '' ? null : wording
}

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
  wording: string,
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
 * or null where nothing moves: the first option asked upwards, the last asked
 * downwards, or an id this Ministry does not offer.
 *
 * The whole order rather than the pair that swapped. Positions are the Ministry's
 * and the list is short, so rewriting all of them is what keeps a list that had
 * drifted -- gaps left by removals, a position two options once shared -- coming
 * out contiguous instead of preserving the drift one swap at a time.
 *
 * Null is *the list is already like that*, which is not a refusal: an Admin
 * pressing up on the top option has asked for the list they are already looking
 * at, and telling them off for it would be inventing an error out of a no-op.
 *
 * An unknown id is null here rather than a throw, and is refused before this is
 * called -- `goal.not_found` is a different thing to say to an Admin than *it is
 * already at the top*, and the caller is where the two are told apart.
 */
export const orderAfterMoving = (
  goals: readonly OfferedGoal[],
  id: DiscipleshipGoalId,
  direction: GoalDirection,
): readonly DiscipleshipGoalId[] | null => {
  const shown = [...goals].sort((one, other) => one.position - other.position)
  const from = shown.findIndex((goal) => goal.id === id)
  if (from < 0) return null

  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= shown.length) return null

  const moved = [...shown]
  const [option] = moved.splice(from, 1)
  moved.splice(to, 0, option!)

  return moved.map((goal) => goal.id)
}
