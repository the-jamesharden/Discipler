import pg from 'pg'
import { ministryId, personId } from '~/domain/ids'
import { invitationState, isWithdrawnAs } from '~/domain/invitations'
import { countsAsLeading, type MemberRole } from '~/domain/relationships'
import type { InvitationPage, InvitationReader } from '~/service/ports'
import { looksLikeAnId } from './rows'

/**
 * What the Invitation Link's page shows. Like the Intake form, it is served to
 * somebody with no account and no session -- that is the whole point of it -- so
 * it reads on the same trusted connection the command boundary uses.
 *
 * It is the one read in Discipler that cannot name its Ministry up front: an
 * Invitation Link deliberately does not carry one, because a link that announced
 * which church it belonged to would say something about its holder before they
 * had proved anything. So the token buys exactly one answer -- which Ministry to
 * scope to -- and everything shown is then read back under the ordinary policies.
 *
 * Resolving does not consume. The token is spent by account creation and nothing
 * else, so a Leader who opens the link and is interrupted by a phone call returns
 * to the same message rather than needing a re-issue.
 */
export interface PostgresInvitationReader extends InvitationReader {
  close(): Promise<void>
}

export const createPostgresInvitationReader = (
  connectionString: string,
  now: () => Date = () => new Date(),
): PostgresInvitationReader => {
  const pool = new pg.Pool({ connectionString })

  return {
    async readInvitationPage(token: string): Promise<InvitationPage | null> {
      // A link is typed off a phone as often as it is tapped, so what arrives here
      // is not trusted into a query until it has the shape of a token.
      if (!looksLikeAnId(token)) return null

      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')

        const { rows: scoped } = await client.query<{ ministry_id: string | null }>(
          `select app.ministry_for_invitation($1) as ministry_id`,
          [token],
        )
        const ministry = scoped[0]?.ministry_id
        // The same answer for a token that was never real and one whose
        // relationship has been deleted. Neither tells its holder anything about a
        // Ministry they have not proved they belong to.
        if (!ministry) return null

        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministry])

        const { rows } = await client.query<{
          person_id: string
          full_name: string
          phone: string | null
          role: MemberRole
          user_id: string | null
          expires_at: Date
          consumed_at: Date | null
          withdrawn_as: string | null
          ministry_name: string
          relationship_accepted_at: Date | null
        }>(
          `select i.person_id,
                  p.full_name,
                  p.phone,
                  p.user_id,
                  m.role,
                  i.expires_at,
                  i.consumed_at,
                  i.withdrawn_as,
                  n.name as ministry_name,
                  r.accepted_at as relationship_accepted_at
             from invitation i
             join person p on p.id = i.person_id
             join ministry n on n.id = i.ministry_id
             join relationship r on r.id = i.relationship_id
             join relationship_member m
               on m.relationship_id = i.relationship_id
              and m.person_id = i.person_id
              -- The membership they hold, or, for an invitation that was
              -- withdrawn, the one that ended with it: the two are stamped with
              -- one instant by one write. A declined link still has to say it
              -- was declined, and to whom.
              and (m.ended_at is null
                   or (i.withdrawn_at is not null and m.ended_at = i.withdrawn_at))
            where i.token = $1
            order by m.ended_at nulls first
            limit 1`,
          [token],
        )

        const held = rows[0]
        // A token naming a relationship its holder has left some other way
        // resolves to no membership, and there is nothing here for them to act on.
        if (!held) return null

        // Everyone else in it, with their roles: the reveal is drawn from the
        // other side of the relationship, and who they would be leading with
        // from their own.
        const { rows: others } = await client.query<{
          full_name: string
          role: MemberRole
          accepted_at: Date | null
        }>(
          `select p.full_name, m.role, m.accepted_at
             from invitation i
             join relationship_member m on m.relationship_id = i.relationship_id
             join person p on p.id = m.person_id
            where i.token = $1 and m.ended_at is null and m.person_id <> i.person_id
            order by m.role, m.started_at`,
          [token],
        )

        const withdrawnAs = isWithdrawnAs(held.withdrawn_as) ? held.withdrawn_as : null
        // The other side of the relationship, never everybody in it. A
        // Participant shown their co-Participants would be told who else is
        // being discipled, which nothing in the product permits.
        const pairedWith = others.filter((row) => row.role !== held.role)

        return {
          ministryId: ministryId(ministry),
          ministryName: held.ministry_name,
          personId: personId(held.person_id),
          fullName: held.full_name,
          phone: held.phone,
          role: held.role,
          userId: held.user_id,
          state: invitationState(
            { expiresAt: held.expires_at, consumedAt: held.consumed_at, withdrawnAs },
            now(),
          ),
          withdrawn: withdrawnAs !== null,
          // How many they were paired with, which is all a withdrawn link keeps of
          // the reveal: the page still says *this group* truthfully, and names
          // nobody to somebody who is no longer on the relationship.
          pairedWithCount: pairedWith.length,
          withNames: withdrawnAs !== null ? [] : pairedWith.map((row) => row.full_name),
          // Who they would be leading with (Manual pairing, recut ticket 01). An
          // Admin may add a Leader to a group already running, so the holder of a
          // link may be joining somebody: a running group names the Leaders who
          // have accepted, and one nobody has activated names everybody it waits
          // on, as every Admin screen does.
          leadingWith:
            held.role === 'leader' && withdrawnAs === null
              ? others
                  .filter(
                    (row) =>
                      row.role === 'leader' &&
                      countsAsLeading(held.relationship_accepted_at, row.accepted_at),
                  )
                  .map((row) => row.full_name)
              : [],
        }
      } finally {
        // Nothing here writes, so there is nothing to commit -- and rolling back
        // is what guarantees it stays that way.
        await client.query('rollback')
        client.release()
      }
    },

    close: () => pool.end(),
  }
}
