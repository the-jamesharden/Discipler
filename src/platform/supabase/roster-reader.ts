import { personId } from '~/domain/ids'
import { isParticipationStatus, type ParticipationStatus } from '~/domain/participation'
import type { RosterEntry, RosterReader } from '~/service/ports'
import { createSupabaseServerClient } from './server-client'

interface MemberRow {
  person_id: string
  relationship_id: string
}

/**
 * `public.roster` returns a derivation beside two columns, so the generated types
 * do not know about it and the row arrives untyped. Named here once rather than
 * cast at the point of use.
 */
interface PersonRow {
  readonly id: string
  readonly fullName: string
  readonly participationStatus: ParticipationStatus
}

/**
 * Checked rather than asserted, and checked on every field rather than the one that
 * looked interesting. A cast here is a promise about a shape this file did not
 * define and cannot see -- the select list, the function, and the generated types
 * can each drift from the others -- and the Roster is a screen somebody is about to
 * act on, so a missing name is worth failing over rather than rendering blank.
 */
const asPersonRow = (row: unknown): PersonRow => {
  const {
    person_id: id,
    full_name: fullName,
    participation_status: status,
  } = (row ?? {}) as Record<string, unknown>

  if (typeof id !== 'string' || id === '') throw new Error('A Roster row arrived with no id')
  if (typeof fullName !== 'string' || fullName === '') {
    throw new Error(`A Roster row arrived with no name for ${id}`)
  }
  // The derivation refuses to answer for a Person the caller may not see, and the
  // policies on `person` refuse to show them that Person at all. The two predicates
  // are written to mirror each other, so reaching here with no status means they
  // have drifted apart.
  if (!isParticipationStatus(status)) {
    throw new Error(`No Participation Status was derived for ${id}`)
  }

  return { id, fullName, participationStatus: status }
}

export const supabaseRosterReader: RosterReader = {
  async listRoster(ministryId): Promise<readonly RosterEntry[]> {
    const supabase = await createSupabaseServerClient()

    // A function rather than a table read with a computed column. Two facts drove
    // it there and only one is about tidiness. `participation_status` is a
    // derivation, not a column -- one SQL function over Intake, consent and open
    // participant memberships -- and asking for it in the same statement that reads
    // the people is what stops a caller reading a Roster and forgetting to ask what
    // each row's status is. Asking PostgREST for it as a computed column made that
    // a whole-row reference, and since ticket 15 no browser session holds SELECT on
    // every column of `person`: the number is not one a Roster may read.
    const { data, error } = await supabase.rpc('roster', { target_ministry_id: ministryId })

    if (error) throw new Error(`Could not read the Roster: ${error.message}`)

    const people = ((data ?? []) as unknown[]).map(asPersonRow)
    const nameOf = new Map(people.map((row) => [row.id, row.fullName]))

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
      fullName: row.fullName,
      withNames: withNamesFor(row.id),
      participationStatus: row.participationStatus,
    }))
  },
}
