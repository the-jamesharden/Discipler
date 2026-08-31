import { discipleshipGoalId } from '~/domain/intake'
import type { DiscipleshipGoalListing, DiscipleshipGoalReader } from '~/service/ports'
import { rows, text } from './rows'
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
 */
const asOption = (row: Record<string, unknown>): DiscipleshipGoalListing => {
  const id = text(row.id)
  const label = text(row.label)
  // `count(*)` is a bigint, and PostgREST renders those as JSON numbers while the
  // direct driver hands back strings. Both are accepted and anything else is not:
  // a count that arrived as neither is a warning nobody could trust.
  const chosenBy =
    typeof row.chosen_by === 'number'
      ? row.chosen_by
      : typeof row.chosen_by === 'string' && row.chosen_by !== ''
        ? Number(row.chosen_by)
        : Number.NaN

  if (id === null) throw new Error('A Discipleship Goal option arrived with no id')
  if (label === null) {
    throw new Error(`A Discipleship Goal option arrived with no wording: ${id}`)
  }
  if (!Number.isInteger(chosenBy)) {
    throw new Error(`No count of who chose Discipleship Goal ${id} came back`)
  }

  return { id: discipleshipGoalId(id), label, chosenBy }
}

export const supabaseDiscipleshipGoalReader: DiscipleshipGoalReader = {
  async listDiscipleshipGoals(ministryId): Promise<readonly DiscipleshipGoalListing[]> {
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
