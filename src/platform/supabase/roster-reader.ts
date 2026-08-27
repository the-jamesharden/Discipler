import { personId } from '~/domain/ids'
import type { RosterEntry, RosterReader } from '~/service/ports'
import { createSupabaseServerClient } from './server-client'

interface MemberRow {
  person_id: string
  relationship_id: string
}

export const supabaseRosterReader: RosterReader = {
  async listRoster(ministryId): Promise<readonly RosterEntry[]> {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase
      .from('person')
      .select('id, full_name')
      .eq('ministry_id', ministryId)
      .order('full_name')

    if (error) throw new Error(`Could not read the Roster: ${error.message}`)

    const people = data ?? []
    const nameOf = new Map(people.map((row) => [row.id as string, row.full_name as string]))

    // Open memberships only: a relationship someone has left says who they were with,
    // not who they are with. Roles are deliberately not read here -- the Roster
    // answers "who is this person with", and a relationship with several
    // Participants shows everyone in it, which is the same question either way.
    const { data: members, error: memberError } = await supabase
      .from('relationship_member')
      .select('person_id, relationship_id')
      .eq('ministry_id', ministryId)
      .is('ended_at', null)

    if (memberError) throw new Error(`Could not read relationships: ${memberError.message}`)

    const byRelationship = new Map<string, string[]>()
    for (const row of (members ?? []) as MemberRow[]) {
      byRelationship.set(row.relationship_id, [
        ...(byRelationship.get(row.relationship_id) ?? []),
        row.person_id,
      ])
    }

    const withNamesFor = (id: string): string[] => {
      const names = new Set<string>()
      for (const row of (members ?? []) as MemberRow[]) {
        if (row.person_id !== id) continue
        for (const other of byRelationship.get(row.relationship_id) ?? []) {
          if (other === id) continue
          const name = nameOf.get(other)
          if (name) names.add(name)
        }
      }
      return [...names].sort()
    }

    return people.map((row) => ({
      personId: personId(row.id),
      fullName: row.full_name,
      withNames: withNamesFor(row.id),
    }))
  },
}
