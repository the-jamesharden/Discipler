import type { PoolClient } from 'pg'
import pg from 'pg'
import type {
  AwaitingLeader,
  IntakeLinkSnapshot,
  InvitationSnapshot,
  PausedRelationship,
  PersonContact,
  RelationshipSnapshot,
  UnacceptedRelationship,
} from '~/domain/boundary'
import type {
  IntakeRecord,
  LeadEligibility,
  LeaderAcceptance,
  MaterialAssignment,
  OutboundMessageDraft,
  ParticipantDeparture,
  RelationshipCancellation,
  RelationshipEnding,
} from '~/domain/effects'
import {
  followUpPayload,
  type FollowUpResolution,
  type NewFollowUpItem,
} from '~/domain/follow-up'
import { intakeLinkToken, type IntakeLinkToken, type NewIntakeLink } from '~/domain/intake-link'
import { invitationToken, type InvitationToken, type NewInvitation } from '~/domain/invitations'
import {
  keywordExchangeId,
  type InboundSnapshot,
  type KeywordMember,
  type KeywordRelationship,
  type OpenKeywordExchange,
  type RelationshipKeyword,
} from '~/domain/keywords'
import { readStandingPause, type StandingPause } from '~/domain/pause'
import type { MemberRole, RelationshipOutcome } from '~/domain/relationships'
import type { ConcernResolution, ConcernViewing, NewConcern } from '~/domain/concerns'
import {
  CancellationRefused,
  ConcernRefused,
  DepartureRefused,
  EndingRefused,
  FollowUpRefused,
  IntakeRefused,
  InvitationRefused,
  MaterialAssignmentRefused,
  PairingRefused,
  RosterImportRefused,
  type CancellationRefusal,
  type EndingRefusal,
  type MaterialAssignmentRefusal,
  type PairingRefusal,
} from '~/domain/errors'
import type { HistoryEvent } from '~/domain/history'
import {
  eventId,
  ministryId,
  personId,
  relationshipId,
  type MinistryId,
  type PersonId,
  type RelationshipId,
} from '~/domain/ids'
import type { NewRelationship } from '~/domain/relationships'
import {
  phoneNumber,
  rosterKey,
  type NewPerson,
  type PhoneNumber,
  type RosterKey,
} from '~/domain/roster'
import {
  CLARIFICATIONS_PER_QUESTION,
  checkInPromptId,
  checkInSequenceId,
  type CheckInRelationship,
  type CheckInSnapshot,
  type OpenPrompt,
  type OpenSequence,
} from '~/domain/check-in'
import type { EffectStore, InboundReader, InboundSender, UnitOfWork } from '~/service/ports'

/**
 * The participation caps live in indexes, because they can only be judged against
 * the Ministry's other relationships and an application-side check would hold only
 * until the first write path that forgot it. That makes the constraint name the
 * place the refusal is decided, so it is translated here rather than surfacing as a
 * Postgres error nobody upstream can read.
 */
const REFUSALS: Record<string, PairingRefusal> = {
  relationship_member_one_open_per_person: 'relationship.person_already_in_this_relationship',
  leader_one_open_group: 'relationship.leader_already_leads_a_group',
  participant_one_open_one_to_one: 'relationship.participant_already_in_a_one_to_one',
  relationship_member_person_fk: 'relationship.person_belongs_to_another_ministry',
  relationship_member_participant_has_completed_intake:
    'relationship.participant_has_not_completed_intake',
  relationship_member_participant_has_not_opted_out: 'relationship.participant_has_opted_out',
  relationship_member_leader_has_completed_intake:
    'relationship.leader_has_not_completed_intake',
  relationship_member_leader_has_not_opted_out: 'relationship.leader_has_opted_out',
  relationship_member_gender_matches: 'relationship.gender_must_match',
  one_to_one_one_open_leader: 'relationship.already_has_a_leader',
}

/** The one place that knows where a driver hides the name of what it violated. */
const constraintViolated = (error: unknown): string | undefined =>
  (error as { constraint?: string } | null)?.constraint

const asRefusal = (error: unknown): PairingRefused | undefined => {
  const constraint = constraintViolated(error)
  const refusal = constraint ? REFUSALS[constraint] : undefined
  return refusal ? new PairingRefused(refusal) : undefined
}

/**
 * Command-side persistence. Writes run inside a transaction on a connection that
 * has dropped into `discipler_command` -- a role that cannot bypass row-level
 * security -- and that has declared which Ministry it is acting for. A command
 * handling one Ministry cannot write a row belonging to another, whatever the
 * application code asks for.
 */

// The Participants of a relationship, oldest membership first. Both queries in
// `checkInFor` select it, so it is written once -- it reads `r.id`, so it only
// belongs in a query where the relationship is aliased `r`.
const participantNamesColumn = `coalesce(
                (select array_agg(p.full_name order by pm.started_at, p.full_name)
                   from relationship_member pm
                   join person p on p.id = pm.person_id
                  where pm.relationship_id = r.id
                    and pm.role = 'participant'
                    and pm.ended_at is null),
                array[]::text[]
              ) as participant_names`

/**
 * The cadence, resolved. Per-relationship override first, Ministry setting
 * behind it -- from the first line, exactly as ADR-0007 says, even though every
 * override column is null in V1 and nothing surfaces them.
 *
 * Written here so the day one *is* surfaced, no query has to be rewritten: it
 * already reads the override. Like `participantNamesColumn` it reads `r.`, so it
 * only belongs in a query where the relationship is aliased `r`.
 */
const cadenceColumns = `coalesce(r.checkin_day, ms.checkin_day) as checkin_day,
              coalesce(r.checkin_hour, ms.checkin_hour) as checkin_hour`

/**
 * One row of `relationship_pauses`. Its period is `integer` in SQL and one of five
 * numbers in the domain, and the narrowing below is what joins the two.
 */
interface PauseRow {
  relationship_id: string
  paused_at: Date
  period_weeks: number
}

/** The pause a row describes, or null where there is no row. */
const standingPause = (row: PauseRow | undefined): StandingPause | null =>
  row
    ? readStandingPause({
        relationshipId: row.relationship_id,
        pausedAt: row.paused_at,
        periodWeeks: row.period_weeks,
      })
    : null

interface CheckInRelationshipRow {
  relationship_id: string
  created_at: Date
  accepted_at: Date | null
  participant_names: string[]
  checkin_day: number
  checkin_hour: number
}

// Whether a Pause stands on the relationship aliased `r`, read the way every
// caller reads one: the later of `relationship.paused` and `relationship.resumed`.
//
// Both check-in queries select it. The relationships a Person leads *now* need it
// because a paused one is not asked about; the ones an open sequence already
// covers need it because a Pause taken mid-conversation withdraws the question it
// is waiting on -- which used to be hardcoded false here, and was the reason a
// Leader who stepped back on Tuesday still got Wednesday's reminder.
const pausedColumn = `coalesce(
                (select e.type = 'relationship.paused'
                   from ministry_event e
                  where e.subject_type = 'relationship'
                    and e.subject_id = r.id
                    and e.type in ('relationship.paused', 'relationship.resumed')
                  order by e.occurred_at desc, e.recorded_at desc
                  limit 1),
                false
              ) as paused`

// The open members of the relationship `$1`, in a stable order.
//
// Two messages *list* these names in a sentence -- the Starter Message tells a
// group's Participant who their Leaders are, and the Resume Message names the
// other side -- and two members paired in one action share a `started_at` to the
// millisecond, which leaves the tie to the planner. The same group could be read
// *David and Sarah* on one send and *Sarah and David* on the next.
//
// `full_name` is the tiebreak because it is the only part of the ordering that
// means anything to the person reading the message; `person_id` settles two people
// who share a name, and settles it the same way every time. One ordering rule, so
// the two readers cannot drift apart and put two messages in two different orders.
//
// Open memberships only. Whoever has left is not in the set a token resolves to
// and is not somebody a resume writes to.
const openMembersOfRelationship = `select m.person_id, m.role, p.full_name, p.phone, m.accepted_at
     from relationship_member m
     join person p on p.id = m.person_id
    where m.relationship_id = $1 and m.ended_at is null
    order by m.role, m.started_at, p.full_name, m.person_id`


/** One open Keyword Exchange, as the row holds it. */
interface KeywordExchangeRow {
  id: string
  keyword: RelationshipKeyword
  options: string[]
  target_id: string | null
  opened_at: Date
  prompted_at: Date
  clarifications_sent: number
}

/**
 * The relationships a keyword may act on, with every open member and the three
 * conditions eligibility turns on -- accepted, ended, paused.
 *
 * Two callers hand it different ways of naming the set: *what this Person holds
 * right now*, and *the identifiers an exchange printed a menu from*. Both need
 * exactly the same facts back, and the second must not silently return fewer rows
 * than it asked about -- which is why the caller reorders and the ordering rule is
 * theirs rather than this query's.
 *
 * The inner select must yield `id` and `held_as`, and nothing else is read from it.
 * That contract is the parameter's name rather than only this sentence, because it
 * arrives as interpolated SQL and nothing downstream can check it.
 */
const keywordRelationships = async (
  client: PoolClient,
  selectingIdAndHeldAs: string,
  parameters: readonly unknown[],
): Promise<readonly KeywordRelationship[]> => {
  const { rows } = await client.query<{
    relationship_id: string
    held_as: MemberRole
    created_at: Date
    accepted_at: Date | null
    ended_at: Date | null
    paused: boolean
  }>(
    `with held as (${selectingIdAndHeldAs})
     select r.id as relationship_id,
            held.held_as,
            r.created_at,
            r.accepted_at,
            r.ended_at,
            -- Paused lives in history rather than in a column, like every other
            -- relationship state here.
            ${pausedColumn}
       from held
       join relationship r on r.id = held.id`,
    [...parameters],
  )

  if (rows.length === 0) return []

  // Every member of every one of them, in one round trip and in the one ordering
  // this codebase names people in. Two members paired in a single action share a
  // `started_at` to the millisecond, so `full_name` is the tiebreak that means
  // something to the person reading the message and `person_id` settles two people
  // who share a name -- the same rule `openMembersOfRelationship` uses, because a
  // menu and a Resume Message listing the same group in two orders would be one
  // Ministry with two memories.
  const { rows: members } = await client.query<{
    relationship_id: string
    person_id: string
    role: MemberRole
    full_name: string
    phone: string | null
    still_open: boolean
    reachable: boolean
  }>(
    // Closed memberships come back too, and are dropped below only where the
    // relationship still has open ones. A relationship that has ended has closed
    // *every* membership, so filtering in SQL would leave it with no names at all --
    // and a menu line reading "them" is a worse answer than the name of the person
    // it was always about.
    //
    // `reachable` is the outbound queue's own floor, asked here rather than
    // discovered by the insert being refused: no opt-out standing, and SMS consent
    // that currently holds. Opting out ends no relationship, so a member who texted
    // `STOP` is still here and must simply not be written to.
    `select m.relationship_id, m.person_id, m.role, p.full_name, p.phone,
            m.ended_at is null as still_open,
            (not exists (
               select 1 from person_opt_out o
                where o.person_id = m.person_id and o.ended_at is null
             ) and app.current_consent(m.person_id, 'sms') is true) as reachable
       from relationship_member m
       join person p on p.id = m.person_id
      where m.relationship_id = any($1::uuid[])
      order by m.role, m.started_at, p.full_name, m.person_id`,
    [rows.map((row) => row.relationship_id)],
  )

  const membersOf = new Map<string, KeywordMember[]>()
  const openOf = new Map<string, KeywordMember[]>()
  for (const member of members) {
    const held: KeywordMember = {
      personId: personId(member.person_id),
      role: member.role,
      fullName: member.full_name,
      phone: member.phone,
      reachable: member.reachable,
    }
    membersOf.set(member.relationship_id, [
      ...(membersOf.get(member.relationship_id) ?? []),
      held,
    ])
    if (member.still_open) {
      openOf.set(member.relationship_id, [...(openOf.get(member.relationship_id) ?? []), held])
    }
  }

  return rows.map((row) => ({
    relationshipId: relationshipId(row.relationship_id),
    role: row.held_as,
    startedAt: row.created_at,
    acceptedAt: row.accepted_at,
    endedAt: row.ended_at,
    paused: row.paused,
    // The open members where there are any. Every message a keyword route composes
    // is for a relationship that passed the eligibility rule, and an ended one never
    // does -- so what these carry for a live relationship is exactly its open
    // members, and the fallback only ever shows up in a menu line.
    members: openOf.get(row.relationship_id) ?? membersOf.get(row.relationship_id) ?? [],
  }))
}

const asCheckInRelationship = (
  row: CheckInRelationshipRow & { paused: boolean },
): CheckInRelationship => ({
  relationshipId: relationshipId(row.relationship_id),
  role: 'leader',
  startedAt: row.created_at,
  participantNames: row.participant_names,
  acceptedAt: row.accepted_at,
  paused: row.paused,
  cadence: { day: row.checkin_day, hour: row.checkin_hour },
})

/**
 * Closing a care record exactly once, and telling an Admin which of the three
 * things happened when it does not close.
 *
 * Shared by Follow-Up Items and Concerns because it is one rule and not two that
 * happen to resemble each other. `where resolved_at is null` is what makes two
 * Admins clicking Resolve close it once; the second updates nothing and has to be
 * told whether the record is gone or whether somebody beat them to it, which only
 * the database can tell apart. Written once so the two cannot drift into
 * answering that differently -- and, on a Concern, so the second click cannot
 * clear words the first Admin deliberately kept.
 */
const closeOnce = async (closing: {
  readonly client: PoolClient
  /**
   * The closing update's `where` must end `id = $1 and resolved_at is null`,
   * because `$1` is the identifier this re-reads with and the null check is what
   * makes it close once. Where the statement is a data-modifying CTE, that is the
   * CTE's `where`, and the outer statement must affect exactly one row per row the
   * CTE closed -- `rowCount` is what tells closing from already-closed.
   */
  readonly update: string
  readonly parameters: readonly unknown[]
  /** A literal union, never a caller's string: it is interpolated into SQL below. */
  readonly table: 'follow_up_item' | 'concern'
  /**
   * The composite key onto `ministry_member`, which is what says an account is not
   * enough -- whoever is closing this has to belong to the Ministry. Translated
   * here like every other constraint, so it reaches a surface as a code rather
   * than as a Postgres error nobody upstream can read.
   */
  readonly resolverKey: string
  readonly refuse: (
    why: 'resolver_is_not_in_this_ministry' | 'already_resolved' | 'not_found',
  ) => Error
}): Promise<void> => {
  const { client, update, parameters, table, resolverKey, refuse } = closing

  let closed: number | null = null
  try {
    ;({ rowCount: closed } = await client.query(update, [...parameters]))
  } catch (error) {
    if (constraintViolated(error) === resolverKey) {
      throw refuse('resolver_is_not_in_this_ministry')
    }
    throw error
  }
  if (closed === 1) return

  const { rows } = await client.query(`select 1 from ${table} where id = $1`, [
    parameters[0],
  ])
  throw refuse(rows.length > 0 ? 'already_resolved' : 'not_found')
}

/**
 * The one call that ends a relationship, wherever the ending came from.
 *
 * Both callers go through `app.end_relationship`, which stamps the relationship and
 * closes every open membership on it in one transaction. That function is the only
 * write path that ends a relationship, and the invariant it holds -- no open
 * membership outlives the relationship it belongs to -- is a fact about two tables
 * that no check constraint can state.
 *
 * What is left here is the translation. The function answers with a refusal code or
 * with null, because ending a relationship somebody else ended a second earlier is
 * ordinary and reaches an Admin as a sentence; the constraint on `ended_by` is the
 * one refusal it cannot answer with, because a stranger's identifier fails as a
 * foreign key rather than as a decision.
 */
type DatabaseEndingRefusal =
  | 'relationship_not_found'
  | 'relationship_already_ended'
  | 'relationship_already_accepted'
  | 'relationship_not_accepted'

const endInTheDatabase = async (
  client: PoolClient,
  ending: {
    readonly relationshipId: RelationshipId
    readonly at: Date
    readonly actor: string
    readonly reason: string
    readonly outcome: RelationshipOutcome
    /** True for an ending, false for a cancellation. The one thing they differ in. */
    readonly expectsAccepted: boolean
    readonly notInThisMinistry: () => Error
  },
): Promise<DatabaseEndingRefusal | null> => {
  try {
    const { rows } = await client.query<{ refusal: DatabaseEndingRefusal | null }>(
      `select app.end_relationship($1, $2, $3, $4, $5, $6) as refusal`,
      [
        ending.relationshipId,
        ending.at,
        ending.actor,
        ending.reason,
        ending.outcome,
        ending.expectsAccepted,
      ],
    )
    return rows[0]?.refusal ?? null
  } catch (error) {
    // Translated here like every other constraint, so it reaches a surface as a
    // code rather than as a Postgres error nobody upstream can read.
    if (constraintViolated(error) === 'relationship_ended_by_fk') {
      throw ending.notInThisMinistry()
    }
    throw error
  }
}

/**
 * What each act calls each answer the function can give.
 *
 * Tables rather than a chain of ternaries, so a sixth answer added to
 * `DatabaseEndingRefusal` fails to compile here until both acts say what they call
 * it -- where a chain would silently inherit whichever branch happened to be last.
 *
 * `null` marks an answer this act cannot receive, and the two nulls are opposites:
 * a cancellation declares it expects an unaccepted relationship, so it is never
 * told one is unaccepted, and an ending declares the reverse. Null rather than a
 * plausible-looking code, because mapping an impossible answer to a real refusal
 * would put a wrong sentence on a screen the day the impossible happens.
 */
const CANCELLATION_REFUSALS: Readonly<
  Record<DatabaseEndingRefusal, CancellationRefusal | null>
> = {
  relationship_not_found: 'relationship.not_found',
  relationship_already_ended: 'relationship.already_ended',
  relationship_already_accepted: 'relationship.already_accepted',
  relationship_not_accepted: null,
}

const ENDING_REFUSALS: Readonly<Record<DatabaseEndingRefusal, EndingRefusal | null>> = {
  relationship_not_found: 'ending.relationship_not_found',
  relationship_already_ended: 'ending.already_ended',
  relationship_not_accepted: 'ending.relationship_not_accepted',
  relationship_already_accepted: null,
}

/**
 * What `app.assign_material` can answer with.
 *
 * Three of these are states an Admin can genuinely be in, and each reaches a screen
 * as a sentence: the relationship is not theirs, it has ended, or nobody has
 * accepted it.
 *
 * The other three are defects rather than decisions, and every one of them says the
 * Material history has broken in a way no production path can produce -- a
 * relationship that activated without opening its history, an acceptance that tried
 * to open one twice, and an assignment dated before the period it would have to
 * follow. Mapping any of them to a plausible-looking refusal would put a wrong
 * sentence in front of somebody on the one day the record is actually wrong, so they
 * map to null and `refused` raises instead.
 */
type DatabaseAssignmentRefusal =
  | 'relationship_not_found'
  | 'relationship_ended'
  | 'relationship_not_accepted'
  | 'material_history_already_open'
  | 'material_history_not_open'
  | 'assignment_precedes_acceptance'
  | 'assignment_precedes_running_period'

const ASSIGNMENT_REFUSALS: Readonly<
  Record<DatabaseAssignmentRefusal, MaterialAssignmentRefusal | null>
> = {
  relationship_not_found: 'material.relationship_not_found',
  relationship_ended: 'material.relationship_ended',
  relationship_not_accepted: 'material.relationship_not_accepted',
  material_history_already_open: null,
  material_history_not_open: null,
  assignment_precedes_acceptance: null,
  assignment_precedes_running_period: null,
}

const refused = <Answer extends string, Refusal extends string>(
  answer: Answer,
  refusals: Readonly<Record<Answer, Refusal | null>>,
  refusal: new (why: Refusal) => Error,
  // Named rather than defaulted. The message this raises is read on the day
  // something is genuinely wrong, and a default would quietly attribute a third
  // caller's defect to whichever function happened to be the first one written.
  fn: string,
): Error => {
  const why = refusals[answer]
  // Not a refusal anybody can act on: the function answered something this act
  // told it could not arise. Louder than a refusal on purpose -- it means the
  // argument and the answer disagree, which is a defect and not a decision.
  if (why === null) {
    throw new Error(`${fn} answered ${answer}, which this act cannot receive`)
  }
  return new refusal(why)
}

/**
 * One `intake_link` row, by whichever of its two unique columns the caller has.
 * Written once because the two reads differ only in the predicate, and a second
 * copy of a fetch-and-shape is where the two quietly stop agreeing about what an
 * expired row means.
 */
const intakeLinkWhere = async (
  client: PoolClient,
  where: string,
  values: readonly unknown[],
): Promise<IntakeLinkSnapshot | null> => {
  const { rows } = await client.query<{
    person_id: string
    token: string
    expires_at: Date
  }>(`select l.person_id, l.token, l.expires_at from intake_link l where ${where}`, [
    ...values,
  ])
  const row = rows[0]
  return row
    ? {
        personId: personId(row.person_id),
        token: intakeLinkToken(row.token),
        expiresAt: row.expires_at,
      }
    : null
}

const unitFor = (client: PoolClient): UnitOfWork => ({
  async peopleOnRoster() {
    // Scoped by the policy on `person`, not by a ministry_id in this statement: the
    // connection has already declared which Ministry it acts for, and the database
    // refuses to show it any other.
    const { rows } = await client.query<{ id: string; full_name: string; phone: string }>(
      `select id, full_name, phone from person where phone is not null`,
    )
    const people = new Map<RosterKey, PersonId>()
    const namesByNumber = new Map<PhoneNumber, string[]>()

    for (const row of rows) {
      const phone = phoneNumber(row.phone)
      people.set(rosterKey({ fullName: row.full_name, phone }), personId(row.id))
      namesByNumber.set(phone, [...(namesByNumber.get(phone) ?? []), row.full_name])
    }

    return { people, namesByNumber }
  },

  async peopleWhoCompletedIntake() {
    // Scoped by the policy on `intake_submission`, like the Roster read above: the
    // connection has already declared which Ministry it acts for.
    const { rows } = await client.query<{ person_id: string }>(
      `select distinct person_id from intake_submission`,
    )
    return new Set<PersonId>(rows.map((row) => personId(row.person_id)))
  },

  async ministryName() {
    // Scoped by the policy on `ministry`, like everything else on this connection.
    const { rows } = await client.query<{ name: string }>(`select name from ministry`)
    const name = rows[0]?.name
    if (!name) throw new Error('This command has no Ministry to speak for')
    return name
  },

  async createPeople(people: readonly NewPerson[]) {
    for (const person of people) {
      try {
        await client.query(
          `insert into person (id, ministry_id, full_name, phone, email, created_at)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            person.id,
            person.ministryId,
            person.fullName,
            person.phone,
            person.email,
            person.createdAt,
          ],
        )
      } catch (error) {
        // A name and a number is unique per Ministry, so this is the read above
        // having been overtaken by another write. Refused whole, not partly applied.
        if (constraintViolated(error) === 'person_ministry_identity_uniq') {
          throw new RosterImportRefused('roster.changed_during_the_import')
        }
        throw error
      }
    }
  },

  async appendHistory(events) {
    const inserted: HistoryEvent[] = []

    for (const event of events) {
      const { rows } = await client.query<{ id: string; recorded_at: Date }>(
        `insert into ministry_event
           (ministry_id, occurred_at, type, subject_type, subject_id, payload)
         values ($1, $2, $3, $4, $5, $6)
         returning id, recorded_at`,
        [
          event.ministryId,
          event.occurredAt,
          event.type,
          event.subjectType,
          event.subjectId,
          JSON.stringify(event.payload),
        ],
      )

      const row = rows[0]
      if (!row) throw new Error('History append returned no row')

      inserted.push({ ...event, id: eventId(row.id), recordedAt: row.recorded_at })
    }

    return inserted
  },

  async recordIntake(intake: IntakeRecord) {
    const { rows } = await client.query<{ id: string }>(
      `insert into intake_submission
         (ministry_id, person_id, submitted_at, age_band, gender, discipleship_goal_id)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        intake.ministryId,
        intake.personId,
        intake.submittedAt,
        intake.ageBand,
        intake.gender,
        intake.goalId,
      ],
    )
    const submissionId = rows[0]?.id
    if (!submissionId) throw new Error('Recording the Intake submission returned no row')

    for (const slot of intake.availability) {
      await client.query(
        `insert into intake_availability (ministry_id, intake_submission_id, day, block)
         values ($1, $2, $3, $4)`,
        [intake.ministryId, submissionId, slot.day, slot.block],
      )
    }

    // Each decision is its own row with its own timestamp and the version of the
    // wording the Person actually saw. Nothing here is ever updated: the trigger on
    // this table refuses it, because a consent record migrated forward to newer
    // wording no longer records what anybody agreed to. A change of mind is therefore
    // a later row, and `decided_at` is what orders them.
    for (const decision of intake.consentDecisions) {
      await client.query(
        `insert into consent_record
           (ministry_id, person_id, consent, granted, version, decided_at, source)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          intake.ministryId,
          intake.personId,
          decision.consent,
          decision.granted,
          intake.consentVersion,
          intake.submittedAt,
          intake.source,
        ],
      )
    }

    // What the Person typed about themselves beats what a spreadsheet said, which
    // is the same direction the import refuses to overwrite in.
    //
    // The email always follows its own rule: written when one was given, left alone
    // when the field came back empty. An empty field is not something the Person
    // typed, and treating it as one would let a submission that skipped the optional
    // question wipe an address the Ministry has.
    if (intake.email !== null) {
      await client.query(`update person set email = $2 where id = $1`, [
        intake.personId,
        intake.email,
      ])
    }

    // The name and the number move only where the submission named this Person by
    // token. That *is* the correction: the number Discipler dials lives on `person`,
    // and a change recorded only on the submission would leave every message going
    // to the old one.
    if (intake.corrections === null) return

    try {
      await client.query(`update person set full_name = $2, phone = $3 where id = $1`, [
        intake.personId,
        intake.corrections.fullName,
        intake.corrections.phone,
      ])
    } catch (error) {
      // A name and a number together are who a Person is within a Ministry, so this
      // is a correction that collides with somebody already on the Roster. Refused
      // as a refusal the Person can act on rather than as a broken write: they are
      // looking at a form with both fields on it.
      if (constraintViolated(error) === 'person_ministry_identity_uniq') {
        throw new IntakeRefused(['intake.details_belong_to_someone_else'])
      }
      throw error
    }
  },

  async createRelationship(relationship: NewRelationship) {
    try {
      await client.query(
        `insert into relationship (id, ministry_id, kind, created_at)
         values ($1, $2, $3, $4)`,
        [relationship.id, relationship.ministryId, relationship.kind, relationship.createdAt],
      )

      for (const member of relationship.members) {
        await client.query(
          `insert into relationship_member
             (ministry_id, relationship_id, kind, person_id, role, started_at)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            relationship.ministryId,
            relationship.id,
            relationship.kind,
            member.personId,
            member.role,
            member.startedAt,
          ],
        )
      }
    } catch (error) {
      throw asRefusal(error) ?? error
    }
  },

  async contactsFor(ids: readonly PersonId[]) {
    if (ids.length === 0) return new Map<PersonId, PersonContact>()

    // Scoped by the policy on `person`, like every other read on this connection.
    // An id belonging to another Ministry simply comes back missing, and the
    // boundary refuses to compose a message it has no name for.
    const { rows } = await client.query<{
      id: string
      full_name: string
      phone: string | null
    }>(`select id, full_name, phone from person where id = any($1::uuid[])`, [[...ids]])

    return new Map<PersonId, PersonContact>(
      rows.map((row) => [
        personId(row.id),
        { fullName: row.full_name, phone: row.phone },
      ]),
    )
  },

  async resolveInvitation(token: InvitationToken): Promise<InvitationSnapshot | null> {
    const { rows: found } = await client.query<{
      relationship_id: string
      person_id: string
      expires_at: Date
      consumed_at: Date | null
    }>(
      `select relationship_id, person_id, expires_at, consumed_at
         from invitation where token = $1`,
      [token],
    )

    const invitation = found[0]
    if (!invitation) return null

    // Acceptances on one relationship are serialised here, and this is the whole
    // reason for the lock. Two co-leaders accepting at once touch disjoint
    // membership rows, so under READ COMMITTED each would read the other's
    // `accepted_at` as still null, each would decide it was not the last to
    // agree, and the relationship would stay Awaiting Leader Acceptance with both
    // tokens spent and no way back. Taking the row the decision is *about* makes
    // the second one wait and then read the first one's acceptance.
    await client.query(`select id from relationship where id = $1 for update`, [
      invitation.relationship_id,
    ])

    // A token naming a relationship its holder has since left resolves to a set
    // they are not in, and the boundary refuses it.
    const { rows: members } = await client.query<{
      person_id: string
      role: MemberRole
      full_name: string
      phone: string | null
      accepted_at: Date | null
    }>(openMembersOfRelationship, [invitation.relationship_id])

    return {
      relationshipId: relationshipId(invitation.relationship_id),
      personId: personId(invitation.person_id),
      expiresAt: invitation.expires_at,
      consumedAt: invitation.consumed_at,
      members: members.map((row) => ({
        personId: personId(row.person_id),
        role: row.role,
        fullName: row.full_name,
        phone: row.phone,
        acceptedAt: row.accepted_at,
      })),
    }
  },

  async issueInvitation(invitation: NewInvitation) {
    await client.query(
      `insert into invitation
         (ministry_id, relationship_id, person_id, token, created_at, expires_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        invitation.ministryId,
        invitation.relationshipId,
        invitation.personId,
        invitation.token,
        invitation.createdAt,
        invitation.expiresAt,
      ],
    )
  },

  async acceptInvitation(acceptance: LeaderAcceptance) {
    // Consumed on account creation, not on resolution -- and consumed exactly once.
    // The `where consumed_at is null` is what makes two submissions of the same
    // form spend one token: the second updates no row and is refused here rather
    // than accepting twice.
    const { rowCount: spent } = await client.query(
      `update invitation set consumed_at = $2
        where token = $1 and consumed_at is null`,
      [acceptance.token, acceptance.acceptedAt],
    )
    if (spent === 0) throw new InvitationRefused('invitation.already_used')

    // The name as they typed it, and the account they just made. `person.user_id`
    // is the link between a login and the Person record in that Ministry; a Leader
    // who logs in without one is an error, not a supported state.
    await client.query(
      `update person set full_name = $2, user_id = $3 where id = $1`,
      [acceptance.personId, acceptance.fullName, acceptance.userId],
    )

    // `tier` governs access only. An Admin who also leads holds one row and it says
    // `admin`, because unique (ministry_id, user_id) permits no second one -- so
    // this must not overwrite it, and the Leader surface must never require a
    // `leader` row to exist.
    await client.query(
      `insert into ministry_member (ministry_id, user_id, tier)
       values ($1, $2, 'leader')
       on conflict (ministry_id, user_id) do nothing`,
      [acceptance.ministryId, acceptance.userId],
    )

    const { rowCount: agreed } = await client.query(
      `update relationship_member set accepted_at = $3
        where relationship_id = $1
          and person_id = $2
          and role = 'leader'
          and ended_at is null
          and accepted_at is null`,
      [acceptance.relationshipId, acceptance.personId, acceptance.acceptedAt],
    )
    if (agreed === 0) throw new InvitationRefused('invitation.already_used')

    if (!acceptance.activatesRelationship) return

    // Activation, and the database has the final say on it. The domain decided
    // from a snapshot read earlier in this transaction; this refuses to stamp
    // unless every open leader membership really does carry an acceptance, so a
    // co-leader whose acceptance was rolled back cannot leave a relationship
    // activated on their behalf.
    await client.query(
      `update relationship set accepted_at = $2
        where id = $1
          and accepted_at is null
          and not exists (
            select 1 from relationship_member m
             where m.relationship_id = relationship.id
               and m.role = 'leader'
               and m.ended_at is null
               and m.accepted_at is null
          )`,
      [acceptance.relationshipId, acceptance.acceptedAt],
    )
  },

  async raiseFollowUp(item: NewFollowUpItem) {
    // Raising an item that already stands changes nothing. Twenty taps on "not my
    // number" is one condition, and an Admin sees one thing to act on -- while the
    // history event the domain appends alongside this lands every time, so how
    // often it was raised survives even though the item does not multiply.
    //
    // The index is named rather than left to `on conflict do nothing`, which would
    // swallow a collision on any constraint on the table and turn a real fault into
    // a silent no-op.
    await client.query(
      `insert into follow_up_item
         (ministry_id, kind, person_id, relationship_id, raised_at, payload)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (ministry_id, kind, person_id, relationship_id)
         where resolved_at is null
       do nothing`,
      [
        item.ministryId,
        item.kind,
        item.personId,
        item.relationshipId,
        item.raisedAt,
        // Composed from the discriminated union rather than passed through, so the
        // only shape that can reach the check constraint is one the union permits.
        followUpPayload(item),
      ],
    )
  },

  async resolveFollowUp(resolution: FollowUpResolution) {
    await closeOnce({
      client,
      table: 'follow_up_item',
      update: `update follow_up_item set resolved_at = $2, resolved_by = $3
                where id = $1 and resolved_at is null`,
      parameters: [resolution.itemId, resolution.resolvedAt, resolution.resolvedBy],
      resolverKey: 'follow_up_item_resolved_by_fk',
      refuse: (why) => new FollowUpRefused(`follow_up.${why}`),
    })
  },

  async unacceptedRelationships(): Promise<readonly UnacceptedRelationship[]> {
    // One tick per Ministry at a time. Without this two overlapping runs each read
    // `reminded_at` as null and each text the same Leader, because a row lock
    // would not help: the reminder is read out of history in a subquery, and a
    // blocked statement resumes on the snapshot it started with rather than a
    // fresh one. An advisory lock taken *first* makes the second run wait, and
    // every statement it takes afterwards sees what the first one committed.
    await client.query(
      `select pg_advisory_xact_lock(hashtextextended(app.command_ministry_id()::text, 0))`,
    )

    // Scoped by the policies on this connection, like every other read here. Two
    // statements rather than one join, because a relationship with no Leader left
    // to chase is still a relationship nobody accepted -- and a join would drop it
    // out of the escalation entirely.
    const { rows: relationships } = await client.query<{
      id: string
      created_at: Date
      item_stands_open: boolean
    }>(
      // Open items only, which is the same rule the partial unique index holds and
      // the one the spec settles: every kind dedupes *while it stands open*, and
      // the history accumulates. Counting resolved items here would have deduped
      // forever -- an Admin who closed the item without cancelling would have made
      // that relationship permanently invisible to the surface that exists to stop
      // exactly that, and no later run would ever mention it again.
      `select r.id,
              r.created_at,
              exists (
                select 1 from follow_up_item f
                 where f.relationship_id = r.id
                   and f.kind = 'relationship_unaccepted'
                   and f.resolved_at is null
              ) as item_stands_open
         from relationship r
        where r.accepted_at is null and r.ended_at is null
        order by r.created_at`,
    )

    if (relationships.length === 0) return []

    // Only the Leaders a reminder can actually reach: an open leader membership
    // with no acceptance on it, an Invitation Link nothing has spent, and standing
    // permission to be texted at all.
    //
    // The consent test is not belt-and-braces. `outbound_message` refuses a row for
    // anybody who has opted out or withdrawn SMS consent, and the whole tick is one
    // transaction -- so one Leader who texted STOP after being invited would roll
    // back every reminder and every escalation for the entire Ministry, on this run
    // and on every run after it, with nothing to say why. They are left out here,
    // and the five-day item raises for their relationship regardless, which is
    // exactly the surface an Admin needs for somebody Discipler can no longer text.
    //
    // `remindedAt` is read back from history rather than stamped on a column,
    // because the tick re-evaluates every run and history is already the record of
    // what Discipler has said to whom.
    const { rows: leaders } = await client.query<{
      relationship_id: string
      person_id: string
      full_name: string
      phone: string | null
      token: string
      expires_at: Date
      reminded_at: Date | null
    }>(
      `select m.relationship_id,
              m.person_id,
              p.full_name,
              p.phone,
              i.token,
              i.expires_at,
              (select max(e.occurred_at)
                 from ministry_event e
                where e.type = 'relationship.acceptance_reminded'
                  and e.subject_id = m.relationship_id
                  and e.payload ->> 'personId' = m.person_id::text) as reminded_at
         from relationship_member m
         join person p on p.id = m.person_id
         join invitation i
           on i.relationship_id = m.relationship_id
          and i.person_id = m.person_id
          and i.consumed_at is null
        where m.relationship_id = any($1::uuid[])
          and m.role = 'leader'
          and m.ended_at is null
          and m.accepted_at is null
          and not exists (
            select 1 from person_opt_out o
             where o.person_id = m.person_id and o.ended_at is null
          )
          and app.current_consent(m.person_id, 'sms') is true
        order by m.started_at`,
      [relationships.map((row) => row.id)],
    )

    const awaitingBy = new Map<string, AwaitingLeader[]>()
    for (const row of leaders) {
      awaitingBy.set(row.relationship_id, [
        ...(awaitingBy.get(row.relationship_id) ?? []),
        {
          personId: personId(row.person_id),
          fullName: row.full_name,
          phone: row.phone,
          token: invitationToken(row.token),
          // Whether the link has run out is a question about time, so it is
          // answered against the injected clock at the boundary and never by
          // `now()` in here.
          linkExpiresAt: row.expires_at,
          remindedAt: row.reminded_at,
        },
      ])
    }

    return relationships.map((row) => ({
      relationshipId: relationshipId(row.id),
      createdAt: row.created_at,
      awaiting: awaitingBy.get(row.id) ?? [],
      itemStandsOpen: row.item_stands_open,
    }))
  },

  async relationshipFor(id: RelationshipId): Promise<RelationshipSnapshot | null> {
    // Locked, for the same reason acceptance locks it: the domain decides from
    // what it reads here, and two Admins cancelling -- or pausing -- at once would
    // otherwise both read the row as untouched and both write to it.
    const { rows } = await client.query<{
      id: string
      created_at: Date
      accepted_at: Date | null
      ended_at: Date | null
    }>(
      `select id, created_at, accepted_at, ended_at
         from relationship where id = $1 for update`,
      [id],
    )

    const relationship = rows[0]
    if (!relationship) return null

    // Whoever already left is not somebody this returns to the pool -- they are
    // already in it. The name and the number ride along because a resume tells
    // everybody here that the relationship is running again, and that message
    // needs a recipient and the names on the other side of it. `accepted_at`
    // comes back too and is not read; one ordering rule is worth one column.
    const { rows: members } = await client.query<{
      person_id: string
      role: MemberRole
      full_name: string
      phone: string | null
    }>(openMembersOfRelationship, [id])

    // The Pause standing on it right now, read the same way every other caller
    // reads one: the later of `relationship.paused` and `relationship.resumed`.
    // Whether the period has run out is not asked here -- that is decided at the
    // command boundary against the injected clock.
    const { rows: pauses } = await client.query<PauseRow>(
      `select relationship_id, paused_at, period_weeks
         from relationship_pauses(app.command_ministry_id())
        where relationship_id = $1`,
      [id],
    )

    return {
      relationshipId: relationshipId(relationship.id),
      createdAt: relationship.created_at,
      acceptedAt: relationship.accepted_at,
      endedAt: relationship.ended_at,
      pause: standingPause(pauses[0]),
      members: members.map((row) => ({
        personId: personId(row.person_id),
        role: row.role,
        fullName: row.full_name,
        phone: row.phone,
      })),
    }
  },

  async pausedRelationships(): Promise<readonly PausedRelationship[]> {
    // Everything paused right now, with whether an Admin is already looking at an
    // expiry item for it. Open items only, which is the rule the partial unique
    // index holds: an Admin who resolved the item without resuming has closed a
    // record, not restarted anybody's check-ins, so the condition is true again
    // and is raised again -- the same reading the acceptance escalation takes.
    const { rows } = await client.query<PauseRow & { item_stands_open: boolean }>(
      `select p.relationship_id,
              p.paused_at,
              p.period_weeks,
              exists (
                select 1 from follow_up_item f
                 where f.relationship_id = p.relationship_id
                   and f.kind = 'pause_expired'
                   and f.resolved_at is null
              ) as item_stands_open
         from relationship_pauses(app.command_ministry_id()) p
         join relationship r on r.id = p.relationship_id
        -- A relationship that has ended is nobody's to resume, so a period
        -- running out on one raises nothing. Ending is the decision the item
        -- exists to prompt, already made.
        where r.ended_at is null
        order by p.paused_at`,
    )

    return rows.map((row) => ({
      relationshipId: relationshipId(row.relationship_id),
      ...readStandingPause({
        relationshipId: row.relationship_id,
        pausedAt: row.paused_at,
        periodWeeks: row.period_weeks,
      }),
      itemStandsOpen: row.item_stands_open,
    }))
  },

  async cancelRelationship(cancellation: RelationshipCancellation) {
    // A cancellation is an ending in the data -- an `ended_at`, an actor, a reason
    // and an outcome -- so it goes through the one function that ends a
    // relationship rather than writing the columns itself. That function is what
    // holds *no open membership outlives its relationship*, and a second write path
    // that did its own update would be exactly the drift the single owner exists to
    // prevent.
    //
    // `discontinued`, because nothing was completed: nobody had accepted it. And
    // `expects_accepted` is false, which is what makes the database refuse a
    // cancellation of a relationship that has since been accepted -- the domain
    // decided from a snapshot read under a lock earlier in this transaction, and
    // this is the final say on what has happened since.
    const refusal = await endInTheDatabase(client, {
      relationshipId: cancellation.relationshipId,
      at: cancellation.cancelledAt,
      actor: cancellation.cancelledBy,
      reason: 'cancelled',
      outcome: 'discontinued',
      expectsAccepted: false,
      // The composite key onto `ministry_member` is what says an account is not
      // enough: the canceller has to belong to this Ministry.
      notInThisMinistry: () =>
        new CancellationRefused('relationship.canceller_is_not_in_this_ministry'),
    })

    if (refusal === null) return
    throw refused(refusal, CANCELLATION_REFUSALS, CancellationRefused, 'app.end_relationship')
  },

  async endRelationship(ending: RelationshipEnding) {
    const refusal = await endInTheDatabase(client, {
      relationshipId: ending.relationshipId,
      at: ending.endedAt,
      actor: ending.endedBy,
      reason: ending.reason,
      outcome: ending.outcome,
      // An ending is of a relationship that ran. One nobody accepted is refused
      // here as well as at the boundary, because the boundary decided from a
      // snapshot and an acceptance can land between the two.
      expectsAccepted: true,
      notInThisMinistry: () => new EndingRefused('ending.ender_is_not_in_this_ministry'),
    })

    if (refusal === null) return
    throw refused(refusal, ENDING_REFUSALS, EndingRefused, 'app.end_relationship')
  },

  async departFromRelationship(departure: ParticipantDeparture) {
    // The relationship row first, and `for update`, exactly as `app.end_relationship`
    // takes it. A departure and an ending racing each other is ordinary, and the lock
    // is what makes the answer below the database's final say rather than a second
    // snapshot -- the domain already decided from the first one.
    //
    // Asking here also keeps the three ways this can fail apart. Reading them off the
    // membership update's `rowCount` cannot: an ending that landed a moment ago closed
    // every membership on the relationship, so the update finds nothing and the Admin
    // is told this Person was never in a relationship they were in until a second ago.
    // Every refusal below is the true one, which is the whole reason the ending path
    // has an exhaustive table rather than a single default.
    const { rows: standing } = await client.query<{ ended: boolean }>(
      `select ended_at is not null as ended
         from relationship
        where id = $1
          for update`,
      [departure.relationshipId],
    )
    const relationship = standing[0]
    // Not found is also what another Ministry's relationship looks like from here,
    // because the policy shows this connection neither.
    if (!relationship) throw new DepartureRefused('departure.relationship_not_found')
    if (relationship.ended) throw new DepartureRefused('departure.relationship_ended')

    // One membership, dated rather than deleted. Their past weeks stay attached to
    // the relationship because nothing about them is touched here, and a
    // readmission later inserts a second row -- which the surrogate primary key on
    // `relationship_member` exists to permit.
    //
    // `role = 'participant'` is not decoration: a Leader's membership is not a
    // departure's to close, and the boundary refusing it is a sentence for an Admin
    // rather than a guard on this statement.
    let left: number | null = null
    try {
      ;({ rowCount: left } = await client.query(
        `update relationship_member set ended_at = $3, departed_by = $4
          where relationship_id = $1
            and person_id = $2
            and role = 'participant'
            and ended_at is null`,
        [
          departure.relationshipId,
          departure.personId,
          departure.departedAt,
          departure.departedBy,
        ],
      ))
    } catch (error) {
      // The composite key onto `ministry_member` is what says an account is not
      // enough: whoever removes somebody from a relationship has to belong to this
      // Ministry. Translated here like every other constraint, so it reaches a
      // surface as a code rather than as a Postgres error nobody upstream can read.
      if (constraintViolated(error) === 'relationship_member_departed_by_fk') {
        throw new DepartureRefused('departure.departer_is_not_in_this_ministry')
      }
      throw error
    }

    // The relationship is live and this Person holds no open participant membership
    // on it -- they left already, or they were never in it. With the two states above
    // ruled out under the lock, that is the only thing left for this to mean.
    if (left === 0) {
      throw new DepartureRefused('departure.person_is_not_in_this_relationship')
    }
  },

  async assignMaterial(assignment: MaterialAssignment) {
    // Through `app.assign_material`, which closes the running period and opens its
    // successor at one instant. That function is the only write path that opens a
    // period, and the invariant it holds -- the periods never overlap and never
    // leave gaps -- is a fact about a whole relationship's rows that no single-row
    // check constraint can state.
    //
    // Both acts come through here and differ in one argument. Acceptance passes a
    // null Material, which opens the history; an Admin passes a real one, which
    // requires it to have been opened already.
    let answer: DatabaseAssignmentRefusal | null = null
    try {
      const { rows } = await client.query<{ refusal: DatabaseAssignmentRefusal | null }>(
        `select app.assign_material($1, $2, $3, $4) as refusal`,
        [
          assignment.relationshipId,
          assignment.materialId,
          assignment.assignedAt,
          assignment.assignedBy,
        ],
      )
      answer = rows[0]?.refusal ?? null
    } catch (error) {
      // Two constraints answer with an identifier rather than with a decision, so
      // they arrive as errors and are translated here like every other one -- a
      // surface needs a code, not a Postgres message.
      const constraint = constraintViolated(error)
      if (constraint === 'material_assignment_assigned_by_fk') {
        throw new MaterialAssignmentRefused('material.assigner_is_not_in_this_ministry')
      }
      // A Material of another Ministry looks exactly like one that does not exist,
      // because the composite key is what refuses both.
      if (constraint === 'material_assignment_material_fk') {
        throw new MaterialAssignmentRefused('material.not_found')
      }
      throw error
    }

    if (answer === null) return
    throw refused(answer, ASSIGNMENT_REFUSALS, MaterialAssignmentRefused, 'app.assign_material')
  },

  async checkInFor(id: PersonId): Promise<CheckInSnapshot | null> {
    // One conversation per Leader at a time, and the lock is what keeps it that
    // way when a reply and a newly-due sequence race each other. Without it both
    // read *no sequence open* and the partial unique index refuses the second
    // insert at commit, which reaches the Leader as a lost reply rather than as a
    // queue that waited.
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [id])

    // The timezone comes back with the Person because every time question this
    // snapshot answers -- which ISO week, which calendar month -- is asked
    // against it, and a snapshot carrying the one without the other would be a
    // set of dates with no clock to read them by.
    const { rows: people } = await client.query<{
      phone: string | null
      timezone: string
    }>(
      `select p.phone, ms.timezone
         from person p
         cross join ministry ms
        where p.id = $1`,
      [id],
    )
    const person = people[0]
    if (!person) return null

    // Every live relationship this Person leads. Whether each one is asked about
    // is a rule and lives in the domain, so an unaccepted or paused relationship
    // is loaded here and filtered there -- which is what lets both be proven by a
    // test with no database in it.
    const { rows: led } = await client.query<CheckInRelationshipRow & { paused: boolean }>(
      `select r.id as relationship_id,
              r.created_at,
              r.accepted_at,
              -- Paused lives in history rather than in a column, like every
              -- other relationship state here.
              ${pausedColumn},
              ${participantNamesColumn},
              ${cadenceColumns}
         from relationship r
         join relationship_member m on m.relationship_id = r.id
         -- The Ministry the cadence falls back to. A cross join because the
         -- policy on the ministry table shows this connection exactly one row:
         -- the one Ministry it has declared it is acting for.
         cross join ministry ms
        where m.person_id = $1
          and m.role = 'leader'
          and m.ended_at is null
          and r.ended_at is null`,
      [id],
    )

    const { rows: open } = await client.query<{
      id: string
      started_at: Date
      covering: string[]
    }>(
      `select id, started_at, covering
         from checkin_sequence
        where person_id = $1 and closed_at is null`,
      [id],
    )

    const sequence = open[0]
    let openSequence: OpenSequence | null = null

    if (sequence) {
      // The most recent prompt owns the next reply, so it is read newest-first --
      // and it is *awaiting* one only while it is unanswered.
      const { rows: prompts } = await client.query<{
        id: string
        relationship_id: string
        position: number
        question: OpenPrompt['question']
        asked_at: Date
        reminded_at: Date | null
        clarifications_sent: number
        answered_at: Date | null
      }>(
        `select id, relationship_id, position, question,
                asked_at, reminded_at, clarifications_sent, answered_at
           from checkin_prompt
          where sequence_id = $1
          order by step desc
          limit 1`,
        [sequence.id],
      )
      const latest = prompts[0]

      // Resolved by the ids the sequence opened with, and not from what this
      // Person leads *now*. The shape of a conversation is fixed when it opens,
      // and a relationship that ends mid-week must not shorten it: every question
      // still to come is indexed by the position stored against it, so dropping
      // one entry would bind the next answer to the wrong relationship.
      //
      // The entries stay; what they say about themselves is read fresh. A Pause
      // taken since the conversation opened is exactly the fact the withdrawal
      // rule turns on, so `paused` is selected here rather than assumed false.
      const { rows: covered } = await client.query<
        CheckInRelationshipRow & { paused: boolean }
      >(
        `select r.id as relationship_id,
                r.created_at,
                r.accepted_at,
                ${pausedColumn},
                ${participantNamesColumn},
                ${cadenceColumns}
           from relationship r
           cross join ministry ms
          where r.id = any($1::uuid[])`,
        [sequence.covering],
      )

      const byId = new Map(covered.map((row) => [row.relationship_id, row]))

      openSequence = {
        sequenceId: checkInSequenceId(sequence.id),
        startedAt: sequence.started_at,
        covering: sequence.covering.flatMap((each) => {
          const row = byId.get(each)
          return row ? [asCheckInRelationship(row)] : []
        }),
        awaiting:
          latest && latest.answered_at === null
            ? {
                promptId: checkInPromptId(latest.id),
                relationshipId: relationshipId(latest.relationship_id),
                position: latest.position,
                question: latest.question,
                // The two clocks and the cap, read from the row rather than
                // counted from history: what Discipler said is a different number
                // from what the Leader typed, and it is Discipler's side that is
                // capped.
                askedAt: latest.asked_at,
                remindedAt: latest.reminded_at,
                clarificationsSent: latest.clarifications_sent,
              }
            : null,
      }
    }

    // For the monthly opt-out rule: when this Person's last check-in *conversation*
    // opened.
    //
    // The sequence and not the last question asked. A Leader who answers on the
    // 1st is sent the next question of September's conversation on the 1st, and
    // measuring from that would make October's opening question look like the
    // second check-in of the month -- so October would carry no opt-out language
    // at all.
    const { rows: asked } = await client.query<{ last_checked_in_at: Date | null }>(
      `select max(started_at) as last_checked_in_at
         from checkin_sequence where person_id = $1`,
      [id],
    )

    return {
      personId: id,
      phone: person.phone,
      timeZone: person.timezone,
      leads: led.map(asCheckInRelationship),
      openSequence,
      lastCheckInAt: asked[0]?.last_checked_in_at ?? null,
    }
  },

  async leadersDueForCheckIn(): Promise<readonly CheckInSnapshot[]> {
    // Who could be due: everybody holding an open leader membership on a live
    // relationship. Whether a new ISO week has actually come due for them is a
    // question about time and is answered in the domain against the injected
    // clock, never here -- which is what lets a cadence edit and a week boundary
    // be proven by a test that runs in milliseconds.
    const { rows } = await client.query<{ person_id: string }>(
      // Only the Leaders a question can actually reach: standing permission to be
      // texted at all, which is both halves of it -- no open opt-out, and SMS
      // consent that currently stands. The same pair `unacceptedRelationships`
      // tests, and the same reason.
      //
      // Opting out ends no relationship -- that is the point of it being
      // person-level -- so the cadence still finds them due, and the outbound queue
      // refuses the question. The tick is one transaction, so composing it would
      // roll back every conversation in the Ministry, this week and every week
      // after it, with nothing on any screen to say why.
      //
      // Nothing is lost by leaving them out. A Leader Discipler may no longer text
      // has no conversation to have, and their relationship is still on the Roster
      // and still on Care Needed for an Admin to act on.
      `select distinct m.person_id
         from relationship_member m
         join relationship r on r.id = m.relationship_id
        where m.role = 'leader'
          and m.ended_at is null
          and r.ended_at is null
          and not exists (
            select 1 from person_opt_out o
             where o.person_id = m.person_id and o.ended_at is null
          )
          and app.current_consent(m.person_id, 'sms') is true
        order by m.person_id`,
    )

    // The same read the direct trigger makes, once per Leader, including its
    // advisory lock. Two reads rather than one join because the conversation
    // already open with somebody is what says whether a new one displaces it, and
    // that is a per-Person question either way.
    //
    // The lock order is the Ministry's lock and then each Person's, which is the
    // order every other command takes them in -- an inbound reply holds only the
    // Person's, so nothing here can close a cycle with it.
    const snapshots: CheckInSnapshot[] = []
    for (const row of rows) {
      const snapshot = await this.checkInFor(personId(row.person_id))
      // These identifiers came out of a statement on this same transaction a
      // moment ago, against a foreign key, so a null here is not a Leader who
      // left -- it is this connection unable to see its own Ministry, and every
      // other Leader in the run is about to be invisible for the same reason.
      //
      // Skipping would turn that into a tick that quietly asked nobody, which is
      // exactly the silence an absent snapshot was made distinguishable from.
      if (!snapshot) {
        throw new Error(
          `Leader ${row.person_id} is led by this Ministry and cannot be read from it`,
        )
      }
      snapshots.push(snapshot)
    }

    return snapshots
  },

  async openCheckInSequence(sequence) {
    await client.query(
      `insert into checkin_sequence (id, ministry_id, person_id, started_at, covering)
       values ($1, $2, $3, $4, $5)`,
      [
        sequence.id,
        sequence.ministryId,
        sequence.personId,
        sequence.startedAt,
        sequence.covering,
      ],
    )
  },

  async askCheckInQuestion(prompt) {
    await client.query(
      `insert into checkin_prompt
         (id, ministry_id, sequence_id, relationship_id, role, position, question, asked_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        prompt.id,
        prompt.ministryId,
        prompt.sequenceId,
        prompt.relationshipId,
        prompt.role,
        prompt.position,
        prompt.question,
        prompt.askedAt,
      ],
    )
  },

  async recordCheckInAnswer(answer) {
    // `where answered_at is null` is what makes a second reply to a question
    // already answered land on nothing rather than overwrite what the Leader
    // first said. History is not rewritten by a later message.
    await client.query(
      `update checkin_prompt
          set answered_at = $2, answered_by = $3, met = $4, satisfaction = $5, detail = $6
        where id = $1 and answered_at is null`,
      [
        answer.promptId,
        answer.answeredAt,
        answer.personId,
        answer.met,
        answer.satisfaction,
        answer.detail,
      ],
    )
  },

  async clarifyCheckInQuestion(clarification) {
    // The cap in the `where`, not only in the command. Two commands racing on one
    // question would each read `clarifications_sent` as 1 and each send a
    // clarification; this makes the third increment land on nothing, so the row
    // can never claim Discipler said more than it is allowed to.
    await client.query(
      `update checkin_prompt
          set clarifications_sent = clarifications_sent + 1
        where id = $1 and clarifications_sent < $2`,
      [clarification.promptId, CLARIFICATIONS_PER_QUESTION],
    )
  },

  async remindCheckInQuestion(reminder) {
    // `where reminded_at is null` is what makes the reminder happen once. A tick
    // that runs twice in the same minute finds the second update matching nothing
    // rather than re-stamping the row and restarting the clock to pass it over.
    await client.query(
      `update checkin_prompt set reminded_at = $2 where id = $1 and reminded_at is null`,
      [reminder.promptId, reminder.remindedAt],
    )
  },

  async closeCheckInSequence(closure) {
    await client.query(
      `update checkin_sequence set closed_at = $2, outcome = $3
        where id = $1 and closed_at is null`,
      [closure.sequenceId, closure.closedAt, closure.outcome],
    )
  },

  async optPersonOut(optOut) {
    // `STOP` twice is one opt-out. The partial unique index is named rather than
    // left to a bare `do nothing`, which would swallow a collision on any
    // constraint on the table.
    await client.query(
      `insert into person_opt_out (ministry_id, person_id, started_at)
       values ($1, $2, $3)
       on conflict (person_id) where ended_at is null do nothing`,
      [optOut.ministryId, optOut.personId, optOut.startedAt],
    )
  },

  async optPersonIn(optIn) {
    // The standing opt-out, dated. Not a delete: `STOP` in March and `START` in
    // April are two facts, and only one of them survives a row being removed.
    //
    // `where ended_at is null` is what makes a second `START` a no-op rather than
    // moving the date the first one recorded. The Ministry is not in the clause and
    // does not need to be -- the policy on this table scopes the connection to the
    // one Ministry it declared it is acting for.
    await client.query(
      `update person_opt_out set ended_at = $2
        where person_id = $1 and ended_at is null`,
      [optIn.personId, optIn.endedAt],
    )
  },

  async inboundFor(id: PersonId): Promise<InboundSnapshot | null> {
    // No advisory lock of its own. `checkInFor` takes one on the same Person and
    // every caller of this reads that first, inside the same transaction -- a
    // second lock on the same key would buy nothing and a lock on a different key
    // would be a second ordering for two transactions to deadlock over.
    // Both halves of *may Discipler text this Person*, asked up front rather than
    // discovered by an insert being refused. They are separate answers because
    // `START` acts on the opt-out alone: somebody who never consented has nothing for
    // it to reverse, and somebody who opted out has exactly one thing.
    const { rows: people } = await client.query<{
      opted_out: boolean
      may_be_texted: boolean
    }>(
      `select exists (
                select 1 from person_opt_out o
                 where o.person_id = p.id and o.ended_at is null
              ) as opted_out,
              (not exists (
                 select 1 from person_opt_out o
                  where o.person_id = p.id and o.ended_at is null
               ) and app.current_consent(p.id, 'sms') is true) as may_be_texted
         from person p
        where p.id = $1`,
      [id],
    )
    const person = people[0]
    if (!person) return null

    // Every live relationship this Person holds, on **either side**. A Leader's
    // check-in reads leader memberships only; a keyword does not, because either
    // side may text `SWAP` and a Participant holds nothing else.
    const holds = await keywordRelationships(
      client,
      `select m.relationship_id as id, m.role as held_as
         from relationship_member m
         join relationship r on r.id = m.relationship_id
        where m.person_id = $1
          and m.ended_at is null
          and r.ended_at is null`,
      [id],
    )

    const { rows: open } = await client.query<KeywordExchangeRow>(
      `select id, keyword, options, target_id, opened_at, prompted_at,
              clarifications_sent
         from keyword_exchange
        where person_id = $1 and closed_at is null`,
      [id],
    )
    const standing = open[0]

    let exchange: OpenKeywordExchange | null = null

    if (standing) {
      // Read back by the identifiers the menu printed, in that order, and **kept
      // even where a relationship has ended since**. Dropping an entry would
      // renumber every line below it, and the Leader's `2` would select the one
      // their message meant to leave alone. What each entry says about itself is
      // read fresh, which is what lets the eligibility rule refuse a relationship
      // an Admin paused an hour ago.
      const options = await keywordRelationships(
        client,
        // **No `ended_at is null` on the membership**, and that is the whole point.
        // Ending a relationship closes every membership in it, so a filtered join
        // would return nothing for one that ended while this exchange waited -- and
        // the entry would vanish from `inOrder` below, renumbering every line under
        // it. A Leader shown `1. Alice 2. Bob 3. Carol`, whose Alice relationship an
        // Admin then ended, would reply `2` meaning Bob and swap Carol.
        //
        // `distinct on` because a Person may hold a closed membership and an open one
        // in the same relationship. The open one wins, and the most recent closed one
        // stands in where there is none -- either way the role is what a menu needs,
        // and the eligibility rule is what refuses to act on the relationship.
        `select distinct on (r.id) r.id as id, m.role as held_as
           from relationship r
           join relationship_member m
             on m.relationship_id = r.id and m.person_id = $2
          where r.id = any($1::uuid[])
          order by r.id, (m.ended_at is null) desc, m.started_at desc`,
        [standing.options, id],
      )

      const byId = new Map(options.map((each) => [String(each.relationshipId), each]))
      const inOrder = standing.options.flatMap((each) => {
        const relationship = byId.get(each)
        return relationship ? [relationship] : []
      })

      exchange = {
        exchangeId: keywordExchangeId(standing.id),
        keyword: standing.keyword,
        openedAt: standing.opened_at,
        promptedAt: standing.prompted_at,
        options: inOrder,
        target: standing.target_id
          ? (byId.get(standing.target_id) ?? null)
          : null,
        clarificationsSent: standing.clarifications_sent,
      }
    }

    // When Discipler last answered a message from this Person that it could make
    // nothing of. Read from history rather than from the outbound queue: the queue
    // holds every message ever sent them, and picking this one out of it would mean
    // matching on its wording.
    const { rows: acknowledged } = await client.query<{ last_at: Date | null }>(
      `select max(occurred_at) as last_at
         from ministry_event
        where subject_type = 'person'
          and subject_id = $1
          and type = 'inbound.acknowledged'`,
      [id],
    )

    return {
      personId: id,
      holds,
      exchange,
      lastAcknowledgedAt: acknowledged[0]?.last_at ?? null,
      optedOut: person.opted_out,
      mayBeTexted: person.may_be_texted,
    }
  },

  async openKeywordExchange(exchange) {
    await client.query(
      `insert into keyword_exchange
         (ministry_id, person_id, keyword, options, target_id, opened_at, prompted_at)
       values ($1, $2, $3, $4, $5, $6, $6)`,
      [
        exchange.ministryId,
        exchange.personId,
        exchange.keyword,
        exchange.options.map((option) => option.relationshipId),
        exchange.target?.relationshipId ?? null,
        exchange.openedAt,
      ],
    )
  },

  async setKeywordExchangeTarget(target) {
    // The clarification count goes back to nothing, because the confirmation is a
    // new question: a Leader who mistyped the menu twice has spent nothing against
    // it, and is the one most likely to get the next one right.
    await client.query(
      `update keyword_exchange
          set target_id = $2, prompted_at = $3, clarifications_sent = 0
        where id = $1 and closed_at is null`,
      [target.exchangeId, target.relationshipId, target.promptedAt],
    )
  },

  async clarifyKeywordExchange(clarification) {
    // `prompted_at` is deliberately untouched. A clarification restates the question
    // already out rather than asking a new one, exactly as a check-in reminder
    // re-sends rather than re-asks -- and it must not move the deadline the Leader
    // is answering against either.
    //
    // The cap in the `where`, not only in the command, exactly as
    // `clarifyCheckInQuestion` does it. Two replies racing on one exchange would each
    // read `clarifications_sent` as 1 and each send a clarification; this makes the
    // third increment land on nothing. Nothing serializes a phone's inbound texts
    // today -- that is ticket 20, which comes after this one -- and a delivery vendor
    // retrying a rolled-back callback is the ordinary way the same reply arrives
    // twice.
    await client.query(
      `update keyword_exchange
          set clarifications_sent = clarifications_sent + 1
        where id = $1 and closed_at is null and clarifications_sent < $2`,
      [clarification.exchangeId, CLARIFICATIONS_PER_QUESTION],
    )
  },

  async closeKeywordExchange(closure) {
    // `where closed_at is null`, so closing one twice records the first ending
    // rather than overwriting it with the second. Nothing is refused on a miss: an
    // exchange that is already closed is the state the caller wanted.
    await client.query(
      `update keyword_exchange set closed_at = $2, outcome = $3
        where id = $1 and closed_at is null`,
      [closure.exchangeId, closure.closedAt, closure.outcome],
    )
  },

  async setLeadEligibility(eligibility: LeadEligibility) {
    // A plain update, and the whole of it. Eligibility is one field because the
    // intended role *is* the leader-pool flag, so setting it neither reads nor
    // touches Intake, an account, or a membership -- and withdrawing it is this
    // same statement with the other value.
    //
    // The Ministry is not in the `where` clause and does not need to be: the
    // policy on `person` scopes this connection to the one Ministry it declared it
    // is acting for, and a Person of another's is not visible to update.
    const { rowCount } = await client.query(
      `update person set eligible_to_lead = $2 where id = $1`,
      [eligibility.personId, eligibility.eligible],
    )

    // Nobody was updated, which on this connection means no such Person in this
    // Ministry. Failing rather than passing quietly, because the Admin pressed a
    // control on a row and a silent no-op reads to them as *it did not take*.
    if (rowCount === 0) {
      throw new Error(`No Person ${eligibility.personId} to mark eligible to lead`)
    }
  },

  async issueIntakeLink(link: NewIntakeLink) {
    // One row per Person, replaced. Re-issuing is not a second link -- it is the
    // link, re-cut -- so the one the Admin sent last week stops working the moment
    // they hand over a new one, which is the only way *send them a new one* can
    // mean anything.
    await client.query(
      `insert into intake_link (ministry_id, person_id, token, created_at, expires_at)
       values ($1, $2, $3, $4, $5)
       on conflict (person_id)
         do update set token = excluded.token,
                       created_at = excluded.created_at,
                       expires_at = excluded.expires_at`,
      [link.ministryId, link.personId, link.token, link.createdAt, link.expiresAt],
    )
  },

  async resolveIntakeLink(token: IntakeLinkToken): Promise<IntakeLinkSnapshot | null> {
    // Scoped by the policy on `intake_link`, like every other read on this
    // connection. An expired row still comes back: whether it has run out is
    // decided in the domain against the injected clock, and answering nothing here
    // would make a link that expired indistinguishable from one that never existed.
    return intakeLinkWhere(client, `l.token = $1`, [token])
  },

  async intakeLinkFor(person: PersonId): Promise<IntakeLinkSnapshot | null> {
    // An expired row comes back here too, and the domain decides. Answering null
    // for one that has run out would be the same as answering null for a Person who
    // has never held a link -- which is right, since both mint a new one, but it
    // would put the *why* in this file instead of beside the clock.
    return intakeLinkWhere(client, `l.person_id = $1`, [person])
  },

  async raiseConcern(concern: NewConcern) {
    // No dedupe and no `on conflict`, unlike a Follow-Up Item. Two Concerns raised
    // a fortnight apart are two things a Leader said, and collapsing them would
    // lose the second -- which is the count the badge exists to show.
    await client.query(
      `insert into concern
         (id, ministry_id, relationship_id, raised_by, raised_at, prompt_id, detail)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        concern.id,
        concern.ministryId,
        concern.relationshipId,
        concern.raisedBy,
        concern.raisedAt,
        concern.promptId,
        concern.detail,
      ],
    )
  },

  async recordConcernViewing(viewing: ConcernViewing) {
    try {
      await client.query(
        `insert into concern_viewing (ministry_id, concern_id, viewed_by, viewed_at)
         values ($1, $2, $3, $4)`,
        [viewing.ministryId, viewing.concernId, viewing.viewedBy, viewing.viewedAt],
      )
    } catch (error) {
      if (constraintViolated(error) === 'concern_viewing_viewer_fk') {
        throw new ConcernRefused('concern.viewer_is_not_in_this_ministry')
      }
      if (constraintViolated(error) === 'concern_viewing_concern_fk') {
        throw new ConcernRefused('concern.not_found')
      }
      throw error
    }
  },

  async resolveConcern(resolution: ConcernResolution) {
    await closeOnce({
      client,
      table: 'concern',
      // Both copies of the prose, in one statement. The Concern holds the words
      // and the prompt row holds the raw reply they arrived in, so clearing only
      // the first would leave the sentence sitting in a table granted wholesale to
      // every Admin -- with no viewing audit on it and nothing that ever empties
      // it. Two statements would leave a window in which one is gone and the other
      // is not; a data-modifying CTE closes the Concern and follows its `prompt_id`
      // in the same trip.
      update: `with closed as (
                 update concern
                    set resolved_at = $2,
                        resolved_by = $3,
                        detail = null
                  where id = $1 and resolved_at is null
                 returning prompt_id
               )
               update checkin_prompt
                  set detail = null
                 from closed
                where checkin_prompt.id = closed.prompt_id`,
      parameters: [resolution.concernId, resolution.resolvedAt, resolution.resolvedBy],
      resolverKey: 'concern_resolved_by_fk',
      refuse: (why) => new ConcernRefused(`concern.${why}`),
    })
  },

  async concernDetailFor(id) {
    // The Ministry predicate is stated as well as enforced. The `concern_command`
    // policy scopes this connection already -- `transact` sets the Ministry before
    // any statement runs -- but the most sensitive read in the product should not
    // depend on a policy holding somewhere else in the file, and a query that says
    // which Ministry it is asking about is the one somebody reviewing this can
    // check without leaving it.
    const { rows } = await client.query<{ detail: string | null }>(
      `select detail from concern
        where id = $1 and ministry_id = app.command_ministry_id()`,
      [id],
    )
    return rows[0]?.detail ?? null
  },

  async enqueueMessages(messages: readonly OutboundMessageDraft[]) {
    for (const message of messages) {
      await client.query(
        `insert into outbound_message
           (ministry_id, person_id, to_phone, body, enqueued_at, scheduled_for,
            discloses_person_id, prompt_key, prompt_state)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          message.ministryId,
          message.personId,
          message.toPhone,
          message.body,
          message.enqueuedAt,
          // The cadence that made this message due, as it was read at enqueue
          // time. Null on everything a cadence did not produce. Nothing rewrites
          // it, which is what makes a cadence edit demonstrably future-only.
          message.scheduledFor,
          // Never composed into the body. The sending layer resolves it against
          // contact-sharing consent as it stands then, and null on everything
          // bound for a Leader is what "no message to a Leader contains a phone
          // number" comes to in the queue.
          message.disclosesPersonId,
          // The phone is the unit a conversation is serialised on, so it is the key
          // whether or not this message expects a reply. A message with no number
          // -- one bound for an Admin -- serialises against nothing.
          message.toPhone,
          // Null until something sends a Response-Required Message. Nothing does
          // yet: a Welcome Message expects no reply, so it holds up nobody's queue.
          // Ticket 08 is the first to set this, and the column is already here.
          null,
        ],
      )
    }
  },
})

export interface PostgresEffectStore extends EffectStore {
  close(): Promise<void>
}

export const createPostgresEffectStore = (connectionString: string): PostgresEffectStore => {
  const pool = new pg.Pool({ connectionString })

  return {
    async transact<T>(ministryId: MinistryId, work: (unit: UnitOfWork) => Promise<T>) {
      const client = await pool.connect()
      // A connection that died mid-transaction cannot be rolled back and must not
      // go back into the pool, or the next command to borrow it fails for a reason
      // that has nothing to do with itself.
      let connectionIsSuspect: Error | undefined

      try {
        await client.query('begin')
        // Both reset at commit or rollback, so they cannot leak to the next
        // command that borrows this connection from the pool.
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministryId])

        const result = await work(unitFor(client))
        await client.query('commit')
        return result
      } catch (error) {
        try {
          await client.query('rollback')
        } catch (rollbackError) {
          // Swallowed on purpose: the rollback failing is a symptom, and throwing
          // it here would replace the error that actually explains the failure.
          connectionIsSuspect =
            rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
        }
        throw error
      } finally {
        client.release(connectionIsSuspect)
      }
    },
    close: () => pool.end(),
  }
}

/**
 * The one read that cannot name its Ministry up front. A text arrives with a
 * phone number and nothing else, so this answers which Ministry the connection
 * should scope itself to and who on it sent the message -- and everything after
 * that runs inside an ordinary Ministry-scoped unit of work.
 */
export interface PostgresInboundReader extends InboundReader {
  close(): Promise<void>
}

export const createPostgresInboundReader = (
  connectionString: string,
): PostgresInboundReader => {
  const pool = new pg.Pool({ connectionString })

  return {
    async resolveSender(fromPhone: string): Promise<InboundSender | null> {
      const client = await pool.connect()
      try {
        // Inside a transaction, like every other read here. `set local` outside
        // one is a no-op: the function would run as the login role and the
        // connection would go back to the pool unreset.
        await client.query('begin')
        await client.query('set local role discipler_command')
        const { rows } = await client.query<{ ministry_id: string; person_id: string }>(
          `select ministry_id, person_id from app.sender_of_inbound($1)`,
          [fromPhone],
        )
        // Rolled back rather than committed: this reads and writes nothing, and a
        // rollback is what resets the role.
        await client.query('rollback')

        const sender = rows[0]
        return sender
          ? { ministryId: ministryId(sender.ministry_id), personId: personId(sender.person_id) }
          : null
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}
