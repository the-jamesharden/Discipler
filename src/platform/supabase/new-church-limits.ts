import pg from 'pg'
import { ministryId } from '~/domain/ids'
import {
  newChurchesOpenedSince,
  rosterRoomWith,
  textRoomWith,
  textWeekSince,
  type NewChurchLimit,
} from '~/domain/new-church-limits'
import type { NewChurchLimits } from '~/service/ports'

/**
 * The limits on a new church's first weeks, as they are read (Exponential launch, ticket
 * 37). The two reads a command and a drain make are on their own connection, as
 * `discipler_command`, so row-level security holds them to the church they act for. The
 * watch and its table span every new church, so they are on the trusted connection.
 */

interface Queryable {
  query: pg.ClientBase['query']
}

/** The lift is an event, so it stands for good and shows in the church's history. */
const LIFTED = 'ministry.new_church_limits_lifted'

/** Whether a church still counts as new. `$since` is when its first weeks would have had to start. */
const isHeldToTheLimits = (church: string, since: string): string => `
  exists (
    select 1 from ministry_event opened
     where opened.ministry_id = ${church} and opened.type = 'ministry.opened' and opened.occurred_at > ${since}
  )
  and not exists (
    select 1 from ministry_event lifted
     where lifted.ministry_id = ${church} and lifted.type = '${LIFTED}'
  )`

/** Everybody on the Roster as the page counts them: a removal keeps the Person and takes them off it. */
const PEOPLE_ON_THE_ROSTER = (church: string): string => `
  (select count(*)::int from person p
    where p.ministry_id = ${church}
      and not exists (select 1 from person_removal r where r.person_id = p.id and r.restored_at is null))`

const TEXTS_SENT_SINCE = (church: string, since: string): string => `
  (select count(*)::int from outbound_message sent where sent.ministry_id = ${church} and sent.sent_at > ${since})`

const THIS_CHURCH = 'app.command_ministry_id()'

const heldNow = async (client: Queryable, at: Date): Promise<boolean> => {
  const { rows } = await client.query<{ held: boolean }>(
    `select ${isHeldToTheLimits(THIS_CHURCH, '$1')} as held`,
    [newChurchesOpenedSince(at)],
  )
  return rows[0]?.held === true
}

/** For a connection already acting for one church. Null when it is not held to the limits. */
export const newChurchRosterRoom = async (client: Queryable, at: Date): Promise<number | null> => {
  if (!(await heldNow(client, at))) return null
  const { rows } = await client.query<{ people: number }>(
    `select ${PEOPLE_ON_THE_ROSTER(THIS_CHURCH)} as people`,
  )
  return rosterRoomWith(rows[0]?.people ?? 0)
}

/** For a connection already acting for one church. Null when it is not held to the limits. */
export const newChurchTextRoom = async (client: Queryable, at: Date): Promise<number | null> => {
  if (!(await heldNow(client, at))) return null
  const { rows } = await client.query<{ texts: number }>(
    `select ${TEXTS_SENT_SINCE(THIS_CHURCH, '$1')} as texts`,
    [textWeekSince(at)],
  )
  return textRoomWith(rows[0]?.texts ?? 0)
}

export interface PostgresNewChurchLimits extends NewChurchLimits {
  close(): Promise<void>
}

export const createPostgresNewChurchLimits = (connectionString: string): PostgresNewChurchLimits => {
  const pool = new pg.Pool({ connectionString })

  return {
    async standings(now) {
      const { rows } = await pool.query<{
        id: string
        name: string
        opened_at: Date
        people: number
        texts: number
      }>(
        `select m.id, m.name, opened.occurred_at as opened_at,
                ${PEOPLE_ON_THE_ROSTER('m.id')} as people,
                ${TEXTS_SENT_SINCE('m.id', '$2')} as texts
           from ministry_event opened
           join ministry m on m.id = opened.ministry_id
          where opened.type = 'ministry.opened'
            and opened.occurred_at > $1
            and not exists (
              select 1 from ministry_event lifted
               where lifted.ministry_id = m.id and lifted.type = '${LIFTED}'
            )
          order by opened.occurred_at, m.id`,
        [newChurchesOpenedSince(now), textWeekSince(now)],
      )
      return rows.map((row) => ({
        church: ministryId(row.id),
        name: row.name,
        openedAt: row.opened_at,
        people: row.people,
        textsThisWeek: row.texts,
      }))
    },

    async recordHit(church, limit, at) {
      await pool.query(
        `insert into new_church_limit_hit (church, limit_kind, church_name, hit_at)
         select m.id, $2, m.name, $3 from ministry m where m.id = $1
         on conflict (church, limit_kind) do nothing`,
        [church, limit, at],
      )
    },

    async untold() {
      const { rows } = await pool.query<{ church: string; limit_kind: NewChurchLimit; church_name: string }>(
        `select church, limit_kind, church_name
           from new_church_limit_hit
          where told_at is null
          order by hit_at, church, limit_kind`,
      )
      return rows.map((row) => ({
        church: ministryId(row.church),
        churchName: row.church_name,
        limit: row.limit_kind,
      }))
    },

    async recordTold(church, limit, at) {
      await pool.query(
        `update new_church_limit_hit set told_at = $3 where church = $1 and limit_kind = $2`,
        [church, limit, at],
      )
    },

    async lift(church, at) {
      const { rowCount } = await pool.query(
        `insert into ministry_event (ministry_id, occurred_at, type, subject_type, subject_id, payload)
         select m.id, $2, '${LIFTED}', 'ministry', m.id, '{}'::jsonb
           from ministry m
          where m.id = $1
            and not exists (
              select 1 from ministry_event lifted
               where lifted.ministry_id = m.id and lifted.type = '${LIFTED}'
            )`,
        [church, at],
      )
      if ((rowCount ?? 0) > 0) return true
      const { rows } = await pool.query(`select 1 from ministry where id = $1`, [church])
      return rows.length > 0
    },

    close: () => pool.end(),
  }
}
