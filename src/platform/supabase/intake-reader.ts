import pg from 'pg'
import {
  discipleshipGoalId,
  slotKey,
  type AgeBand,
  type Gender,
  type SlotHour,
  type Weekday,
} from '~/domain/intake'
import { intakeLinkState } from '~/domain/intake-link'
import { ministryId, personId, relationshipId } from '~/domain/ids'
import type {
  DiscipleshipGoalOption,
  GroupIntakePage,
  IntakePage,
  IntakePrefill,
  IntakeReader,
  JoinableGroup,
  ReopenedIntakePage,
} from '~/service/ports'
import { declaredGenderOf } from './rows'

/**
 * What the Intake form needs to render itself. The page is served to somebody with
 * no account and no session -- that is the whole point of it -- so it reads on the
 * server over the same trusted connection the command boundary uses, scoped to the
 * one Ministry whose link was opened.
 *
 * The pool is opened here but never reached for here: only the composition root
 * constructs this reader, and `close` is what it holds so the suite has something
 * to shut down when it ends.
 */
export interface PostgresIntakeReader extends IntakeReader {
  close(): Promise<void>
}

/**
 * What this Person last told the Ministry, as the form takes it back.
 *
 * The *latest* submission and the *current* consent, which are two different
 * questions with the same shape: this table is append-only, so a Person who has
 * corrected their answers has several rows and only the newest of them describes
 * them. Showing an older one would invite them to re-submit a fact they had
 * already changed.
 */
const prefillFor = async (
  client: pg.PoolClient,
  person: string,
): Promise<IntakePrefill> => {
  const { rows: people } = await client.query<{
    full_name: string
    phone: string | null
    email: string | null
  }>(`select full_name, phone, email from person where id = $1`, [person])
  const details = people[0]

  const { rows: submissions } = await client.query<{
    id: string
    age_band: AgeBand
    gender: Gender
    discipleship_goal_id: string | null
  }>(
    // The same tiebreak the database's own latest-submission reads use, down to
    // the last term: `public.relationship_availability` and the pairing gender
    // read both order by `submitted_at desc, created_at desc, id desc`. Two
    // submissions can share both timestamps -- a correction sent twice in the same
    // second, or a backfill that stamped a batch alike -- and without the id the
    // tiebreak is the planner's, so this form could prefill one submission while
    // the Leader dashboard read the other. A Person would then be shown answers
    // that are not the ones standing against them.
    `select id, age_band, gender, discipleship_goal_id
       from intake_submission
      where person_id = $1
      order by submitted_at desc, created_at desc, id desc
      limit 1`,
    [person],
  )
  const submission = submissions[0]

  // Both columns are enums the domain declares, so a row is already a slot: the
  // database will not hold a day or an hour the grid does not draw.
  const { rows: slots } = submission
    ? await client.query<{ day: Weekday; hour: SlotHour }>(
        `select day, hour from intake_availability where intake_submission_id = $1`,
        [submission.id],
      )
    : { rows: [] }

  // The decision that stands, through the one function that defines what a Person
  // currently consents to. Reading the newest row here instead would be a second
  // definition of *current*, and the two would eventually disagree.
  const { rows: sharing } = await client.query<{ granted: boolean | null }>(
    `select app.current_consent($1, 'contact_sharing') as granted`,
    [person],
  )
  const currentSharing = sharing[0]?.granted ?? null

  return {
    fullName: details?.full_name ?? null,
    phone: details?.phone ?? null,
    email: details?.email ?? null,
    ageBand: submission?.age_band ?? null,
    gender: submission?.gender ?? null,
    goalId: submission?.discipleship_goal_id
      ? discipleshipGoalId(submission.discipleship_goal_id)
      : null,
    // Keyed by the domain and not by a template string beside it, so the form is
    // prefilled with the same spelling it submits.
    availability: slots.map(slotKey),
    // Never asked stays never asked. Rendering it as `declined` would put an answer
    // in front of the Person that they never gave.
    contactSharing: currentSharing === null ? null : currentSharing ? 'granted' : 'declined',
  }
}

export const createPostgresIntakeReader = (
  connectionString: string,
): PostgresIntakeReader => {
  const pool = new pg.Pool({ connectionString })

  return {
    async readIntakePage(id: string): Promise<IntakePage | null> {
      // A link is typed, forwarded and scanned off a printed page, so the identifier
      // in it is not to be trusted into a query as a uuid until it looks like one.
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null

      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [id])

        const { rows: ministries } = await client.query<{ name: string }>(
          `select name from ministry where id = $1`,
          [id],
        )
        const name = ministries[0]?.name
        if (!name) return null

        const { rows } = await client.query<{ id: string; label: string }>(
          `select id, label from discipleship_goal where ministry_id = $1 order by position`,
          [id],
        )
        const goals: DiscipleshipGoalOption[] = rows.map((row) => ({
          id: discipleshipGoalId(row.id),
          label: row.label,
        }))

        return { ministryId: ministryId(id), ministryName: name, goals }
      } finally {
        await client.query('rollback')
        client.release()
      }
    },

    async readGroupIntakePage(id: string): Promise<GroupIntakePage | null> {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null

      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [id])

        const { rows: ministries } = await client.query<{ name: string }>(
          `select name from ministry where id = $1`,
          [id],
        )
        const name = ministries[0]?.name
        if (!name) return null

        // Asked of the database rather than filtered here, because which
        // relationships can take another Participant is the capacity question
        // ADR-0004 keeps out of application code. The function returns groups and
        // this reader never names what a group is.
        const { rows } = await client.query<{
          relationship_id: string
          name: string
          declared_gender: string | null
          join_requires_approval: boolean
          leader_first_names: string[]
        }>(`select * from groups_open_to_join($1)`, [id])

        const groups: JoinableGroup[] = rows.map((row) => ({
          relationshipId: relationshipId(row.relationship_id),
          name: row.name,
          declaredGender: declaredGenderOf(row.declared_gender),
          joinRequiresApproval: row.join_requires_approval,
          leaderFirstNames: row.leader_first_names,
        }))

        return { ministryId: ministryId(id), ministryName: name, groups }
      } finally {
        await client.query('rollback')
        client.release()
      }
    },

    async readReopenedIntakePage(token: string): Promise<ReopenedIntakePage | null> {
      // A link is typed and forwarded, so the token in it is not trusted into a
      // query until it looks like one this product mints.
      if (!/^[0-9a-f-]{36}$/i.test(token)) return null

      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')

        // Which Ministry to scope to, before anything is scoped at all. The same
        // problem the Invitation Link has and solved the same way: a link that
        // announced which congregation it belonged to would say something about its
        // holder before they had proved anything.
        const { rows: located } = await client.query<{
          ministry_id: string
          person_id: string
          expires_at: Date
        }>(
          `select ministry_id, person_id, expires_at
             from app.intake_link_for_token($1)`,
          [token],
        )
        const link = located[0]
        if (!link) return null

        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [
          link.ministry_id,
        ])

        const { rows: ministries } = await client.query<{ name: string }>(
          `select name from ministry where id = $1`,
          [link.ministry_id],
        )
        const name = ministries[0]?.name
        // The foreign key says this cannot happen. Reaching it means the connection
        // cannot see the Ministry it was just told to act for, which is a broken
        // read rather than a link that names nothing.
        if (!name) {
          throw new Error(`Intake link ${link.person_id} names a Ministry this cannot read`)
        }

        const { rows: goalRows } = await client.query<{ id: string; label: string }>(
          `select id, label from discipleship_goal where ministry_id = $1 order by position`,
          [link.ministry_id],
        )
        const goals: DiscipleshipGoalOption[] = goalRows.map((row) => ({
          id: discipleshipGoalId(row.id),
          label: row.label,
        }))

        return {
          ministryId: ministryId(link.ministry_id),
          ministryName: name,
          goals,
          personId: personId(link.person_id),
          state: intakeLinkState(link.expires_at, new Date()),
          prefill: await prefillFor(client, link.person_id),
        }
      } finally {
        await client.query('rollback')
        client.release()
      }
    },

    close: () => pool.end(),
  }
}
