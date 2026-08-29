import type { PoolClient } from 'pg'
import pg from 'pg'
import type {
  AwaitingLeader,
  InvitationSnapshot,
  PersonContact,
  RelationshipSnapshot,
  UnacceptedRelationship,
} from '~/domain/boundary'
import type {
  IntakeRecord,
  LeaderAcceptance,
  OutboundMessageDraft,
  RelationshipCancellation,
} from '~/domain/effects'
import {
  followUpPayload,
  type FollowUpResolution,
  type NewFollowUpItem,
} from '~/domain/follow-up'
import { invitationToken, type InvitationToken, type NewInvitation } from '~/domain/invitations'
import type { MemberRole } from '~/domain/relationships'
import {
  CancellationRefused,
  FollowUpRefused,
  InvitationRefused,
  PairingRefused,
  RosterImportRefused,
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
    if (intake.email !== null) {
      await client.query(`update person set email = $2 where id = $1`, [
        intake.personId,
        intake.email,
      ])
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

    // Open memberships only. A token naming a relationship its holder has since
    // left resolves to a set they are not in, and the boundary refuses it.
    const { rows: members } = await client.query<{
      person_id: string
      role: MemberRole
      full_name: string
      phone: string | null
      accepted_at: Date | null
    }>(
      `select m.person_id, m.role, p.full_name, p.phone, m.accepted_at
         from relationship_member m
         join person p on p.id = m.person_id
        where m.relationship_id = $1 and m.ended_at is null
        order by m.role, m.started_at`,
      [invitation.relationship_id],
    )

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
    // `where resolved_at is null` is what makes two Admins clicking Resolve on the
    // same row close it once. The second updates nothing and is told so, rather
    // than overwriting the first Admin's name with their own.
    let closed: number | null = null
    try {
      ;({ rowCount: closed } = await client.query(
        `update follow_up_item set resolved_at = $2, resolved_by = $3
          where id = $1 and resolved_at is null`,
        [resolution.itemId, resolution.resolvedAt, resolution.resolvedBy],
      ))
    } catch (error) {
      // The composite key onto `ministry_member` is what says an account is not
      // enough: the resolver has to belong to this Ministry. Translated here like
      // every other constraint, so it reaches a surface as a code rather than as a
      // Postgres error nobody upstream can read.
      if (constraintViolated(error) === 'follow_up_item_resolved_by_fk') {
        throw new FollowUpRefused('follow_up.resolver_is_not_in_this_ministry')
      }
      throw error
    }
    if (closed === 1) return

    // Two different things for the Admin to be told, and only the database can
    // tell them apart: an item that is gone, and one somebody else has just closed.
    const { rows } = await client.query(`select 1 from follow_up_item where id = $1`, [
      resolution.itemId,
    ])
    throw new FollowUpRefused(
      rows.length > 0 ? 'follow_up.already_resolved' : 'follow_up.not_found',
    )
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
    // what it reads here, and two Admins cancelling at once would otherwise both
    // read `ended_at` as null and both write an ending date.
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

    // Open memberships only. Whoever already left is not somebody this returns to
    // the pool -- they are already in it.
    const { rows: members } = await client.query<{ person_id: string }>(
      `select person_id from relationship_member
        where relationship_id = $1 and ended_at is null
        order by role, started_at`,
      [id],
    )

    return {
      relationshipId: relationshipId(relationship.id),
      createdAt: relationship.created_at,
      acceptedAt: relationship.accepted_at,
      endedAt: relationship.ended_at,
      memberIds: members.map((row) => personId(row.person_id)),
    }
  },

  async cancelRelationship(cancellation: RelationshipCancellation) {
    // The database has the final say, as it does on activation. The domain decided
    // from a snapshot read under a lock earlier in this transaction; this refuses
    // to stamp anything that has since been accepted or ended.
    let withdrawn: number | null
    try {
      ;({ rowCount: withdrawn } = await client.query(
        `update relationship
            set ended_at = $2, ended_reason = 'cancelled', ended_by = $3
          where id = $1 and ended_at is null and accepted_at is null`,
        [cancellation.relationshipId, cancellation.cancelledAt, cancellation.cancelledBy],
      ))
    } catch (error) {
      // The composite key onto `ministry_member` is what says an account is not
      // enough: the canceller has to belong to this Ministry. Translated here like
      // every other constraint, so it reaches a surface as a code rather than as a
      // Postgres error nobody upstream can read.
      if (constraintViolated(error) === 'relationship_ended_by_fk') {
        throw new CancellationRefused('relationship.canceller_is_not_in_this_ministry')
      }
      throw error
    }
    if (withdrawn === 0) throw new CancellationRefused('relationship.already_ended')

    // Closing every open membership is the whole of returning everyone to the
    // suggestion pool: `participation_status` reads open participant memberships,
    // and the participation caps read open memberships of either role.
    await client.query(
      `update relationship_member set ended_at = $2
        where relationship_id = $1 and ended_at is null`,
      [cancellation.relationshipId, cancellation.cancelledAt],
    )
  },


  async checkInFor(id: PersonId): Promise<CheckInSnapshot | null> {
    // One conversation per Leader at a time, and the lock is what keeps it that
    // way when a reply and a newly-due sequence race each other. Without it both
    // read *no sequence open* and the partial unique index refuses the second
    // insert at commit, which reaches the Leader as a lost reply rather than as a
    // queue that waited.
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [id])

    const { rows: people } = await client.query<{ phone: string | null }>(
      `select phone from person where id = $1`,
      [id],
    )
    const person = people[0]
    if (!person) return null

    // Every live relationship this Person leads. Whether each one is asked about
    // is a rule and lives in the domain, so an unaccepted or paused relationship
    // is loaded here and filtered there -- which is what lets both be proven by a
    // test with no database in it.
    const { rows: led } = await client.query<{
      relationship_id: string
      created_at: Date
      accepted_at: Date | null
      paused: boolean
      participant_names: string[]
    }>(
      `select r.id as relationship_id,
              r.created_at,
              r.accepted_at,
              -- Paused lives in history rather than in a column, like every other
              -- relationship state here. Ticket 12 writes these events; until it
              -- does, no relationship is paused and the rule is proven by
              -- appending one.
              coalesce(
                (select e.type = 'relationship.paused'
                   from ministry_event e
                  where e.subject_type = 'relationship'
                    and e.subject_id = r.id
                    and e.type in ('relationship.paused', 'relationship.resumed')
                  order by e.occurred_at desc, e.recorded_at desc
                  limit 1),
                false
              ) as paused,
              coalesce(
                (select array_agg(p.full_name order by pm.started_at, p.full_name)
                   from relationship_member pm
                   join person p on p.id = pm.person_id
                  where pm.relationship_id = r.id
                    and pm.role = 'participant'
                    and pm.ended_at is null),
                array[]::text[]
              ) as participant_names
         from relationship r
         join relationship_member m on m.relationship_id = r.id
        where m.person_id = $1
          and m.role = 'leader'
          and m.ended_at is null
          and r.ended_at is null`,
      [id],
    )

    const relationships = new Map<string, CheckInRelationship>(
      led.map((row) => [
        row.relationship_id,
        {
          relationshipId: relationshipId(row.relationship_id),
          role: 'leader',
          startedAt: row.created_at,
          participantNames: row.participant_names,
          acceptedAt: row.accepted_at,
          paused: row.paused,
        },
      ]),
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
        answered_at: Date | null
      }>(
        `select id, relationship_id, position, question, answered_at
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
      const { rows: covered } = await client.query<{
        relationship_id: string
        created_at: Date
        accepted_at: Date | null
        participant_names: string[]
      }>(
        `select r.id as relationship_id,
                r.created_at,
                r.accepted_at,
                coalesce(
                  (select array_agg(p.full_name order by pm.started_at, p.full_name)
                     from relationship_member pm
                     join person p on p.id = pm.person_id
                    where pm.relationship_id = r.id
                      and pm.role = 'participant'
                      and pm.ended_at is null),
                  array[]::text[]
                ) as participant_names
           from relationship r
          where r.id = any($1::uuid[])`,
        [sequence.covering],
      )

      const byId = new Map(covered.map((row) => [row.relationship_id, row]))

      openSequence = {
        sequenceId: checkInSequenceId(sequence.id),
        startedAt: sequence.started_at,
        covering: sequence.covering.flatMap((each) => {
          const row = byId.get(each)
          return row
            ? [
                {
                  relationshipId: relationshipId(row.relationship_id),
                  role: 'leader' as const,
                  startedAt: row.created_at,
                  participantNames: row.participant_names,
                  acceptedAt: row.accepted_at,
                  paused: false,
                },
              ]
            : []
        }),
        awaiting:
          latest && latest.answered_at === null
            ? {
                promptId: checkInPromptId(latest.id),
                relationshipId: relationshipId(latest.relationship_id),
                position: latest.position,
                question: latest.question,
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
      leads: [...relationships.values()],
      openSequence,
      lastCheckInAt: asked[0]?.last_checked_in_at ?? null,
    }
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

  async enqueueMessages(messages: readonly OutboundMessageDraft[]) {
    for (const message of messages) {
      await client.query(
        `insert into outbound_message
           (ministry_id, person_id, to_phone, body, enqueued_at,
            discloses_person_id, prompt_key, prompt_state)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          message.ministryId,
          message.personId,
          message.toPhone,
          message.body,
          message.enqueuedAt,
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
