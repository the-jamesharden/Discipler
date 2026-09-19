import { importRowId, personId, relationshipId } from '~/domain/ids'
import { phoneNumber, type PhoneNumber } from '~/domain/roster'
import { isPairingRefusal } from '~/domain/errors'
import { intendedPairingId } from '~/domain/ids'
import type { RosterIntendedPairing } from '~/service/ports'
import { isParticipationStatus, type ParticipationStatus } from '~/domain/participation'
import { isMemberRole, type MemberRole } from '~/domain/relationships'
import { intakeLinkState, intakeLinkToken } from '~/domain/intake-link'
import { DECLARED_SIDES, GENDERS, isOneOf, type DeclaredSide, type Gender } from '~/domain/intake'
import { systemClock, type Clock } from '~/domain/clock'
import type {
  AccountOnTheRoster,
  GroupToJoin,
  IssuedIntakeLink,
  MaterialOption,
  RosterEntry,
  RosterPage,
  RosterReader,
  RosterRelationship,
  RosterSurface,
  UnansweredImportRow,
} from '~/service/ports'
import type { NameOnTheNumber } from '~/domain/roster'
import { careNeededFrom } from './care-needed-reader'
import { adminPage, list, readPageDocument, section, type PageDocument } from './page'
import { liveMaterialRows } from './materials-reader'
import { historyOf } from './relationship-history'
import { createSupabaseServerClient } from './server-client'

interface MemberRow {
  person_id: string
  relationship_id: string
  role: MemberRole
}

/**
 * `public.roster` returns a derivation beside eight columns, so the generated types
 * do not know about it and the row arrives untyped. Named here once rather than
 * cast at the point of use.
 */
interface PersonRow {
  readonly id: string
  readonly fullName: string
  readonly participationStatus: ParticipationStatus
  readonly declaredSide: DeclaredSide | null
  readonly firstTime: boolean | null
  readonly holdsAnAccount: boolean
  readonly phone: PhoneNumber | null
  readonly email: string | null
  readonly gender: Gender | null
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
    declared_side: side,
    first_time: firstTime,
    holds_an_account: holdsAnAccount,
    phone,
    email,
    gender,
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
  // Both columns are nullable and null is a real answer -- the Person answered a
  // form that did not ask -- so null passes and everything else is checked. What is
  // caught here is the column missing altogether, which is this reader and the
  // function having drifted apart: read as *nothing declared*, a whole Ministry's
  // offers to mentor would vanish from the Roster without a single error.
  if (side !== null && !isOneOf(DECLARED_SIDES, side)) {
    throw new Error(`A Roster row arrived with a side nothing recognises for ${id}`)
  }
  if (firstTime !== null && typeof firstTime !== 'boolean') {
    throw new Error(`A Roster row arrived with no first-time answer for ${id}`)
  }
  // `user_id is not null` is never null itself, so anything but a boolean here is
  // the select list and this reader having drifted apart. Read as *holds none*, a
  // whole Ministry's Leaders would lose the reset action from their rows without a
  // single error -- which is the state ticket 28 exists to end.
  if (typeof holdsAnAccount !== 'boolean') {
    throw new Error(`A Roster row arrived with no account answer for ${id}`)
  }
  // Both nullable, and null is a real answer: an imported Person has no email, and
  // a Person added by hand may have no number yet. Anything but a string or null is
  // the select list and this reader having drifted apart -- and a Roster whose
  // contact column had quietly gone blank is the spreadsheet-beside-the-screen
  // state ADR-0021 exists to end.
  if (phone !== null && typeof phone !== 'string') {
    throw new Error(`A Roster row arrived with no phone answer for ${id}`)
  }
  if (email !== null && typeof email !== 'string') {
    throw new Error(`A Roster row arrived with no email answer for ${id}`)
  }
  // Nullable, and null is a real answer: nobody has ever asked this Person. What
  // is caught is the column missing altogether or holding a value the enum has
  // since grown. Read as *never asked*, either would leave every row on the
  // pairing form enabled against a declaration, and the first an Admin would
  // hear of a mismatch is the database refusing it.
  if (gender !== null && !isOneOf(GENDERS, gender)) {
    throw new Error(`A Roster row arrived with no gender answer for ${id}`)
  }

  return {
    id,
    fullName,
    participationStatus: status,
    declaredSide: side,
    firstTime,
    holdsAnAccount,
    phone: phone === null ? null : phoneNumber(phone),
    email,
    gender,
  }
}

/**
 * The Roster, out of the `roster` part of the page's document. The rows come from
 * `public.roster` -- a function rather than a table read with a computed column.
 * Two facts drove it there and only one is about tidiness. `participation_status`
 * is a derivation, not a column -- one SQL function over Intake, consent and open
 * participant memberships -- and asking for it in the same statement that reads
 * the people is what stops a caller reading a Roster and forgetting to ask what
 * each row's status is. Asking PostgREST for it as a computed column made that a
 * whole-row reference, and since ticket 15 no browser session holds SELECT on
 * every column of `person`: the number is not one a Roster may read.
 */
export const rosterFrom = (doc: PageDocument): readonly RosterEntry[] => {
  const roster = section(doc, 'roster')

  const people = list(roster, 'rows').map(asPersonRow)
  const nameOf = new Map(people.map((row) => [row.id, row.fullName]))

  // Open memberships only: a relationship someone has left says who they were with,
  // not who they are with. The role comes back with them, because a Person leading
  // two relationships and a Person being discipled in two are the same list of
  // names and opposite situations -- and telling them apart on the row is what
  // makes `Ready to Pair` beside two names read as a fact rather than a bug.
  const members = list(roster, 'members')

  // A role this reader does not recognise is dropped rather than guessed at. The
  // enum has two values and the policies scope the read, so reaching one means the
  // schema has moved on -- and calling an unknown role `participant` on a Roster
  // would say a Person is being discipled by somebody they lead.
  const memberships = (members as unknown as MemberRow[]).filter((row) => isMemberRole(row.role))

  // The relationships themselves, for one column: whether each has been accepted.
  // `accepted_at` is activation and Awaiting Leader Acceptance is its absence --
  // there is no status column to read, by design, so the Roster derives it here or
  // it goes on asserting it in a banner and never saying it again.
  //
  // The rows the function gave are exactly the relationships the memberships
  // name, rather than the Ministry's whole set, so this list cannot hold a row
  // the memberships did not already name.
  const acceptedById = new Map(
    (list(roster, 'relationships') as unknown as { id: string; accepted_at: string | null }[]).map(
      (row) => [row.id, row.accepted_at !== null],
    ),
  )

  /**
   * The two reads are policed by predicates written to mirror each other -- a
   * membership is visible to exactly whoever its relationship is. So a membership
   * whose relationship did not come back means they have drifted apart, and it is
   * thrown like the other drift in this file rather than defaulted: reading a
   * missing row as *accepted* would tell an Admin a relationship had started when
   * nobody had agreed to it, and reading it as *awaiting* would tell a Leader
   * their live relationships had all stalled.
   */
  const awaitingAcceptanceOf = (relationship: string): boolean => {
    const accepted = acceptedById.get(relationship)
    if (accepted === undefined) {
      throw new Error(`A Roster membership named a relationship that did not come back: ${relationship}`)
    }
    return !accepted
  }

  // The pairings an import planned, still standing or refused and unresolved,
  // through their own function and its Admin test. Each lands on both rows,
  // from that row's side.
  const planned = list(roster, 'intended_pairings')

  const plansFor = (id: string): RosterIntendedPairing[] =>
    planned.flatMap((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>
      const { id: planId, leader_id: leader, participant_id: participant, outcome, refusal } = row
      if (typeof planId !== 'string' || typeof leader !== 'string' || typeof participant !== 'string') {
        throw new Error('A planned pairing arrived with no id or no people')
      }
      if (leader !== id && participant !== id) return []
      const refused = outcome === 'refused'
      if (refused && !isPairingRefusal(refusal)) {
        throw new Error(`A refused plan arrived with a reason nothing recognises: ${planId}`)
      }
      const other = leader === id ? participant : leader
      return [
        {
          id: intendedPairingId(planId),
          role: leader === id ? 'leader' : 'participant',
          withPersonId: personId(other),
          withName: nameOf.get(other) ?? 'Somebody no longer on the Roster',
          state: refused ? 'refused' : 'awaiting_intake',
          refusal: refused && isPairingRefusal(refusal) ? refusal : null,
        } satisfies RosterIntendedPairing,
      ]
    })

  const byRelationship = new Map<string, MemberRow[]>()
  for (const row of memberships) {
    byRelationship.set(row.relationship_id, [
      ...(byRelationship.get(row.relationship_id) ?? []),
      row,
    ])
  }

  /** The names of everyone in a relationship holding one role, sorted. */
  const namesIn = (relationship: string, role: MemberRole): string[] =>
    [
      ...new Set(
        (byRelationship.get(relationship) ?? []).flatMap((member) =>
          member.role === role ? (nameOf.get(member.person_id) ?? []) : [],
        ),
      ),
    ].sort()

  /**
   * One entry per open relationship this Person holds a membership in, each
   * saying what they are in it and who else is. A group shows everyone in it,
   * which is the same question either way round -- and beside everyone, the
   * two sides apart, so the Roster can name the other side of the row it is on.
   */
  const relationshipsFor = (id: string): RosterRelationship[] =>
    memberships
      .filter((row) => row.person_id === id)
      .map((membership) => ({
        relationshipId: relationshipId(membership.relationship_id),
        role: membership.role,
        awaitingAcceptance: awaitingAcceptanceOf(membership.relationship_id),
        withNames: [
          ...new Set(
            (byRelationship.get(membership.relationship_id) ?? []).flatMap((other) =>
              other.person_id === id ? [] : (nameOf.get(other.person_id) ?? []),
            ),
          ),
        ].sort(),
        leaderNames: namesIn(membership.relationship_id, 'leader'),
        participantNames: namesIn(membership.relationship_id, 'participant'),
        participantCount: (byRelationship.get(membership.relationship_id) ?? []).filter(
          (member) => member.role === 'participant',
        ).length,
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
    declaredSide: row.declaredSide,
    firstTime: row.firstTime,
    holdsAnAccount: row.holdsAnAccount,
    phone: row.phone,
    email: row.email,
    gender: row.gender,
    intendedPairings: plansFor(row.id),
  }))
}

/**
 * The import rows still waiting on an answer, out of the `roster` part of the
 * page's document. The rows come from `held_import_rows`, a function rather than
 * a table read, for the two reasons `roster` is one: the Admin test is written
 * into it, and it carries the number and the names on it -- which the table alone
 * cannot, because `authenticated` holds no SELECT on the phone column and the
 * Admin test inside the function is the only way a number reaches this screen
 * (ADR-0021).
 */
export const heldImportRowsFrom = (doc: PageDocument): readonly UnansweredImportRow[] => {
  // One row per question per name already on its number, so they are grouped back
  // into one question each. Insertion order is preserved, and the function orders
  // by the import instant -- so the oldest unanswered question is first, which is
  // the one that has been waiting longest.
  const questions = new Map<string, UnansweredImportRow & { onThisNumber: NameOnTheNumber[] }>()

  for (const row of list(section(doc, 'roster'), 'held_import_rows')) {
    const {
      row_id: id,
      line,
      full_name: fullName,
      phone,
      imported_at: importedAt,
      person_id: person,
      person_name: personName,
    } = (row ?? {}) as Record<string, unknown>

    // Checked rather than asserted, on every field, for the reason the Roster row
    // beside it is: this is a screen an Admin is about to rename somebody from,
    // and a question rendered without the line or the name is one they cannot
    // place in the file they uploaded.
    if (typeof id !== 'string' || id === '') {
      throw new Error('A held import row arrived with no id')
    }
    if (typeof line !== 'number' || !Number.isInteger(line)) {
      throw new Error(`A held import row arrived with no line number: ${id}`)
    }
    if (typeof fullName !== 'string' || fullName === '') {
      throw new Error(`A held import row arrived with no name: ${id}`)
    }
    if (typeof phone !== 'string' || phone === '') {
      throw new Error(`A held import row arrived with no phone number: ${id}`)
    }
    if (typeof importedAt !== 'string') {
      throw new Error(`A held import row arrived with no import date: ${id}`)
    }

    const question =
      questions.get(id) ??
      {
        rowId: importRowId(id),
        line,
        fullName,
        phone: phoneNumber(phone),
        importedAt: new Date(importedAt),
        onThisNumber: [],
      }
    questions.set(id, question)

    // The left join says the Roster holds nobody on this number any more, which
    // leaves *someone else on this number* as the only answer. The question is
    // still shown: a row that vanished would be the silent expiry this surface
    // exists to prevent.
    if (typeof person === 'string' && person !== '' && typeof personName === 'string') {
      question.onThisNumber.push({ personId: personId(person), fullName: personName })
    }
  }

  return [...questions.values()]
}

/**
 * Whether the Ministry enforces the absolute gender match on a one-to-one, off
 * the key `pair_page` carries. Null is a Ministry row the session could not see,
 * and reads as enforced: the safe default for a safeguarding constraint is
 * enforced, which is the reason the column itself defaults true. The key missing
 * or holding anything else is the function and this reader having drifted apart,
 * and is thrown for rather than guessed at in either direction.
 */
const suggestGenderMatchFrom = (doc: PageDocument): boolean => {
  const setting = doc.suggest_gender_match
  if (setting === null) return true
  if (typeof setting !== 'boolean') {
    throw new Error(`The page said something other than yes or no about the gender match: ${String(setting)}`)
  }
  return setting
}

/** A list of ids and nothing else, narrowed by the check rather than promised by a cast. */
const isListOfIds = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((each) => typeof each === 'string' && each !== '')

/**
 * The groups an Admin could put somebody into, off the key `pair_page` carries:
 * every open relationship with two or more Disciples, in the order the function
 * gave them.
 *
 * Checked field by field, as a Roster row is. These are rows an Admin is about to
 * put a Person into, and each field decides something on the popup: the members
 * decide whether the group is offered at all, the declaration whether it is
 * greyed, the state what the row says beside its name.
 */
const groupsFrom = (doc: PageDocument): readonly GroupToJoin[] =>
  list(doc, 'groups').map((row) => {
    const {
      id,
      name,
      declared_gender: declaredGender,
      state,
      disciple_count: discipleCount,
      member_ids: memberIds,
      leaders,
    } = row

    if (typeof id !== 'string' || id === '') throw new Error('A group arrived with no id')
    // Nullable, and null is a real answer: nobody has named this group, and
    // nothing here names it for them. The column refuses a blank one, so a blank
    // or a missing key is the function and this reader having drifted apart.
    if (name !== null && (typeof name !== 'string' || name.trim() === '')) {
      throw new Error(`A group arrived with no answer about its name: ${id}`)
    }
    // Null is *mixed*, which is an answer and opens the group to everybody. The
    // key missing must not read as that: a men's group shown as mixed would offer
    // an Admin a row the database is about to refuse.
    if (declaredGender !== null && !isOneOf(GENDERS, declaredGender)) {
      throw new Error(`A group arrived with no answer about its declared gender: ${id}`)
    }
    // Null is *running*, which is an answer. The key missing must not read as
    // that: a group nobody has accepted, shown as running, is a row whose leader
    // the Admin would expect to hear from.
    if (state !== null && state !== 'awaiting_leader_acceptance' && state !== 'paused') {
      throw new Error(`A group arrived with no answer about its state: ${id}`)
    }
    // The function lists nothing with fewer than two, so fewer here is drift too.
    if (typeof discipleCount !== 'number' || !Number.isInteger(discipleCount) || discipleCount < 2) {
      throw new Error(`A group arrived without its count of Disciples: ${id}`)
    }
    if (!isListOfIds(memberIds)) throw new Error(`A group arrived without who is in it: ${id}`)
    if (!Array.isArray(leaders)) throw new Error(`A group arrived without its leaders: ${id}`)

    return {
      relationshipId: relationshipId(id),
      name,
      leaders: leaders.map((raw) => {
        const { id: leader, full_name: fullName } = (raw ?? {}) as Record<string, unknown>
        if (typeof leader !== 'string' || leader === '' || typeof fullName !== 'string' || fullName === '') {
          throw new Error(`A group arrived with a leader who has no id or no name: ${id}`)
        }
        return { personId: personId(leader), fullName }
      }),
      discipleCount,
      declaredGender,
      state,
      memberIds: memberIds.map(personId),
    } satisfies GroupToJoin
  })

/**
 * Everything the three surfaces derive, from the document of the one named.
 * Exported so a test can drive the derivation with a real session rather than a
 * Next.js request context.
 *
 * The setting, the Materials and the groups are the Pair page's and ride in its
 * document alone. The Roster and the person page read a document without them,
 * and are told enforced and nothing to offer -- true and not false, deliberately, for the
 * reason `suggestGenderMatchFrom` gives. The Pair page's own document arriving
 * without them is a different thing and is thrown for: a form that quietly
 * offered no Materials is the wrong answer shown confidently.
 */
export const rosterPageFrom = (doc: PageDocument, clock: Clock, surface: RosterSurface): RosterPage => ({
  roster: rosterFrom(doc),
  held: heldImportRowsFrom(doc),
  followUpCount: careNeededFrom(historyOf(doc), clock).length,
  suggestGenderMatch: surface === 'pair' ? suggestGenderMatchFrom(doc) : true,
  // Id and title, which is what a select needs. One definition of *live*, shared
  // with the Materials tab, so the two cannot disagree about what is on offer.
  materials:
    surface === 'pair'
      ? liveMaterialRows(doc).map(({ materialId, title }): MaterialOption => ({ materialId, title }))
      : [],
  groups: surface === 'pair' ? groupsFrom(doc) : [],
})

/**
 * Built with a clock rather than reaching for one, because the badge's number is
 * the length of Care Needed, and how long each item there has waited is a
 * time-dependent rule like any other -- the composition root decides whose clock
 * answers it, as it does for the tabs that show the list.
 */
export const createSupabaseRosterReader = (clock: Clock = systemClock): RosterReader => ({
  /**
   * One read for the Roster, the held import rows and the badge's number: all
   * three derive from one document. The person page reads the same one under its
   * own name, and the Pair page reads it with the setting and the Materials
   * beside it; each takes what it needs.
   */
  async readRosterPage(surface) {
    const doc = await readPageDocument(await createSupabaseServerClient(), `${surface}_page`)
    return adminPage(doc, () => rosterPageFrom(doc, clock, surface))
  },

  async accountOnTheRoster(ministryId, person): Promise<AccountOnTheRoster | null> {
    const supabase = await createSupabaseServerClient()

    // Through the signed-in session, so the policies on `person` decide whether
    // this caller may see this row -- an Admin of that Ministry, and nobody else.
    // The `eq` on the Ministry restates the same fact and is not what enforces it.
    //
    // Not through `public.roster`. That function is the whole list and hands back
    // no account identifiers by design; this is the one Person an Admin has asked
    // about, and `user_id` is a column a browser session already holds SELECT on.
    const { data, error } = await supabase
      .from('person')
      .select('id, full_name, user_id')
      .eq('ministry_id', ministryId)
      .eq('id', person)
      .maybeSingle()

    if (error) throw new Error(`Could not read the account on the Roster: ${error.message}`)
    if (!data) return null

    // A Person this Ministry does not hold and a Person holding no account both
    // come back as null, and the caller is told the same thing by both. That is
    // deliberate: a refusal that told them apart would disclose to an Admin that
    // somebody else's Ministry holds that Person.
    if (typeof data.user_id !== 'string' || data.user_id === '') return null

    // A row that came back without a name is a broken read and is thrown rather
    // than folded into the null above. The surface has to say whose password is
    // about to change, and a confirmation naming nobody is one an Admin cannot
    // check before they press it.
    if (typeof data.full_name !== 'string' || data.full_name === '') {
      throw new Error(`The account on the Roster for ${person} came back with no name`)
    }

    return { personId: personId(data.id), fullName: data.full_name, userId: data.user_id }
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
})
