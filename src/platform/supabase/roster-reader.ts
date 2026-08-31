import { personId } from '~/domain/ids'
import { isParticipationStatus, type ParticipationStatus } from '~/domain/participation'
import { isMemberRole, type MemberRole } from '~/domain/relationships'
import { intakeLinkState, intakeLinkToken } from '~/domain/intake-link'
import type {
  IssuedIntakeLink,
  RosterEntry,
  RosterReader,
  RosterRelationship,
} from '~/service/ports'
import { createSupabaseServerClient } from './server-client'

interface MemberRow {
  person_id: string
  relationship_id: string
  role: MemberRole
}

/**
 * `public.roster` returns a derivation beside three columns, so the generated types
 * do not know about it and the row arrives untyped. Named here once rather than
 * cast at the point of use.
 */
interface PersonRow {
  readonly id: string
  readonly fullName: string
  readonly participationStatus: ParticipationStatus
  readonly eligibleToLead: boolean
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
    eligible_to_lead: eligible,
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
  // The column is `not null default false`, so a missing answer is not "nobody has
  // decided yet" -- it is the select list and this reader having drifted apart, and
  // rendering it as *not eligible* would quietly empty a Ministry's leader pool.
  if (typeof eligible !== 'boolean') {
    throw new Error(`A Roster row arrived with no lead eligibility for ${id}`)
  }

  return { id, fullName, participationStatus: status, eligibleToLead: eligible }
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
    // not who they are with. The role comes back with them, because a Person leading
    // two relationships and a Person being discipled in two are the same list of
    // names and opposite situations -- and telling them apart on the row is what
    // makes `Ready to Pair` beside two names read as a fact rather than a bug.
    const { data: members, error: memberError } = await supabase
      .from('relationship_member')
      .select('person_id, relationship_id, role')
      .eq('ministry_id', ministryId)
      .is('ended_at', null)

    if (memberError) throw new Error(`Could not read relationships: ${memberError.message}`)

    // A role this reader does not recognise is dropped rather than guessed at. The
    // enum has two values and the policies scope the read, so reaching one means the
    // schema has moved on -- and calling an unknown role `participant` on a Roster
    // would say a Person is being discipled by somebody they lead.
    const memberships = ((members ?? []) as MemberRow[]).filter((row) => isMemberRole(row.role))

    const byRelationship = new Map<string, MemberRow[]>()
    for (const row of memberships) {
      byRelationship.set(row.relationship_id, [
        ...(byRelationship.get(row.relationship_id) ?? []),
        row,
      ])
    }

    /**
     * One entry per open relationship this Person holds a membership in, each
     * saying what they are in it and who else is. A group shows everyone in it,
     * which is the same question either way round.
     */
    const relationshipsFor = (id: string): RosterRelationship[] =>
      memberships
        .filter((row) => row.person_id === id)
        .map((membership) => ({
          role: membership.role,
          withNames: [
            ...new Set(
              (byRelationship.get(membership.relationship_id) ?? []).flatMap((other) =>
                other.person_id === id ? [] : (nameOf.get(other.person_id) ?? []),
              ),
            ),
          ].sort(),
        }))
        // Led relationships first, then the ones they are in as a Participant, and
        // alphabetically within each. A stable order, so a Roster read twice reads
        // the same way -- `relationship_member` has no order of its own.
        .sort(
          (a, b) =>
            Number(a.role === 'participant') - Number(b.role === 'participant') ||
            a.withNames.join(', ').localeCompare(b.withNames.join(', ')),
        )

    return people.map((row) => ({
      personId: personId(row.id),
      fullName: row.fullName,
      relationships: relationshipsFor(row.id),
      participationStatus: row.participationStatus,
      eligibleToLead: row.eligibleToLead,
    }))
  },

  async liveIntakeLink(ministryId, person): Promise<IssuedIntakeLink | null> {
    const supabase = await createSupabaseServerClient()

    // Through the signed-in session, so the policy on `intake_link` is what decides
    // whether this caller may see it -- an Admin of that Ministry and nobody else.
    // The `eq` restates the same fact and is not what enforces it.
    const { data, error } = await supabase
      .from('intake_link')
      .select('token, expires_at')
      .eq('ministry_id', ministryId)
      .eq('person_id', person)
      .maybeSingle()

    if (error) throw new Error(`Could not read the Intake link: ${error.message}`)
    if (!data) return null

    const token = typeof data.token === 'string' ? data.token : null
    const expiresAt = typeof data.expires_at === 'string' ? new Date(data.expires_at) : null

    // A row that came back malformed is a broken read and is thrown rather than
    // folded into the null above. Both reach the Admin as *there is no link*, and
    // the one that means a rule has stopped holding must not hide inside the one
    // that means nobody has issued one.
    if (!token || !expiresAt) {
      throw new Error(`The Intake link for ${person} came back without a token or a date`)
    }

    // A row is not a live link. `intake_link` holds one row per Person and is
    // replaced rather than deleted on re-issue, so the row an expired link left
    // behind is still there -- and this port promises the link they *hold*, which
    // an Admin is about to send. Handing back a dead token would put *works until*
    // a date already past on the Roster and send a Person to a page telling them to
    // ask for a link they were just given.
    //
    // Decided here against the clock rather than filtered in SQL, which is where
    // every other expiry question in this codebase is answered: `intakeLinkState`
    // is the one definition of when a link has run out, and a `where expires_at >
    // now()` beside it would be a second one for the same fact.
    if (intakeLinkState(expiresAt, new Date()) === 'expired') return null

    return { token: intakeLinkToken(token), expiresAt }
  },
}
