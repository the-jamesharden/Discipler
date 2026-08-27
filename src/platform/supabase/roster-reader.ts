import { personId } from '~/domain/ids'
import { isParticipationStatus } from '~/domain/participation'
import type { RosterEntry, RosterReader } from '~/service/ports'
import { createSupabaseServerClient } from './server-client'

interface MemberRow {
  person_id: string
  relationship_id: string
}

/**
 * `participation_status` is a function exposed as a column, so the generated types
 * do not know about it and it arrives untyped. Named here once rather than cast at
 * the point of use.
 */
interface PersonRow {
  id: string
  full_name: string
  participation_status: unknown
}

export const supabaseRosterReader: RosterReader = {
  async listRoster(ministryId): Promise<readonly RosterEntry[]> {
    const supabase = await createSupabaseServerClient()

    // `participation_status` is a derivation, not a column: one SQL function over
    // Intake, consent and open participant memberships, asked for in the same
    // statement that reads the people so that no caller can read a Roster and
    // forget to ask what each row's status is.
    const { data, error } = await supabase
      .from('person')
      .select('id, full_name, participation_status')
      .eq('ministry_id', ministryId)
      .order('full_name')

    if (error) throw new Error(`Could not read the Roster: ${error.message}`)

    const people = (data ?? []) as unknown as PersonRow[]
    const nameOf = new Map(people.map((row) => [row.id, row.full_name]))

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

    return people.map((row) => {
      // The derivation refuses to answer for a Person the caller may not see, and
      // the policies on `person` refuse to show them that Person at all. The two
      // predicates are written to mirror each other, so reaching here with no status
      // means they have drifted apart -- worth failing loudly over rather than
      // rendering a blank column on a Roster somebody is about to act on.
      if (!isParticipationStatus(row.participation_status)) {
        throw new Error(`No Participation Status was derived for ${row.id}`)
      }

      return {
        personId: personId(row.id),
        fullName: row.full_name,
        withNames: withNamesFor(row.id),
        participationStatus: row.participation_status,
      }
    })
  },
}
