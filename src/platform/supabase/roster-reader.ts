import { personId } from '~/domain/ids'
import type { RosterEntry, RosterReader } from '~/service/ports'
import { createSupabaseServerClient } from './server-client'

export const supabaseRosterReader: RosterReader = {
  async listRoster(ministryId): Promise<readonly RosterEntry[]> {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from('person')
      .select('id, full_name')
      .eq('ministry_id', ministryId)
      .order('full_name')

    if (error) throw new Error(`Could not read the Roster: ${error.message}`)

    return (data ?? []).map((row) => ({
      personId: personId(row.id),
      fullName: row.full_name,
    }))
  },
}
