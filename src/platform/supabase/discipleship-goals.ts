import { goalWording, type OfferedGoal } from '~/domain/discipleship-goals'
import { discipleshipGoalId } from '~/domain/intake'
import type { DiscipleshipGoalReader } from '~/service/ports'
import { count, rows, text } from './rows'
import { createSupabaseServerClient } from './server-client'

/**
 * What the settings surface shows a Ministry about its own list.
 *
 * Read through the signed-in Admin's session, like the Roster, so the policies
 * are what scope it rather than a `where` clause this file could forget --
 * `discipleship_goal_options` answers for the Ministry the caller administers and
 * for no other, which is how *goals are never shared or compared across
 * Ministries* stays true of the data instead of true of the page.
 */

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

export const supabaseDiscipleshipGoalReader: DiscipleshipGoalReader = {
  async listDiscipleshipGoals(ministryId): Promise<readonly OfferedGoal[]> {
    const supabase = await createSupabaseServerClient()

    // A function rather than a table read plus a count of its own. The count is
    // *people whose current answer points here*, which is a `distinct on` over an
    // append-only table -- and the command boundary decides against the very same
    // definition, so an Admin cannot be warned with one number and have history
    // record another.
    const { data, error } = await supabase.rpc('discipleship_goal_options', {
      target_ministry_id: ministryId,
    })

    if (error) {
      throw new Error(`Could not read the Discipleship Goal options: ${error.message}`)
    }

    // Already ordered by position: the Ministry's own ordering is pastoral and is
    // the function's to give back, not this reader's to impose.
    return rows(data).map(asOption)
  },
}
