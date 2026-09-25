import pg from 'pg'
import type { MaterialItem } from '~/domain/materials'
import type { DisciplesMaterialPage, MaterialPageReader } from '~/service/ports'
import { materialItemFrom } from './material-items'

/**
 * A Disciple's Material page (Richer materials, ticket 04). Served to somebody
 * with no account and no session, like the Invitation Link's page, so it reads
 * on the command boundary's trusted connection: the token buys exactly one
 * answer -- which Ministry, and whose link -- and everything shown is then read
 * back under that Ministry's ordinary policies.
 *
 * The page shows the Ministry's name and the Material and nothing about anybody,
 * so a forwarded link shows a study and no person (James, 2026-09-24, Q4).
 * Whether the link still opens anything is decided here each time it is read:
 * once the membership has closed or the relationship has ended, it says so.
 */
export interface PostgresMaterialPageReader extends MaterialPageReader {
  close(): Promise<void>
}

export const createPostgresMaterialPageReader = (
  connectionString: string,
): PostgresMaterialPageReader => {
  const pool = new pg.Pool({ connectionString })

  /** Runs one read scoped to the token's Ministry, or answers null for a token that names nothing. */
  const scoped = async <T>(
    token: string,
    read: (
      client: pg.PoolClient,
      link: { readonly personId: string; readonly relationshipId: string },
    ) => Promise<T>,
  ): Promise<T | null> => {
    // Typed off a phone as often as tapped, so nothing reaches a query until it
    // has the shape of a token.
    if (!/^[0-9a-f-]{36}$/i.test(token)) return null
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('set local role discipler_command')
      const { rows } = await client.query<{
        ministry_id: string
        person_id: string
        relationship_id: string
      }>(`select * from app.material_link_for_token($1)`, [token])
      const link = rows[0]
      if (!link) return null
      await client.query(`select set_config('discipler.ministry_id', $1, true)`, [link.ministry_id])
      return await read(client, { personId: link.person_id, relationshipId: link.relationship_id })
    } finally {
      await client.query('rollback').catch(() => undefined)
      client.release()
    }
  }

  /** The Material running on this link's relationship now, while the link still opens. */
  const running = async (
    client: pg.PoolClient,
    link: { readonly personId: string; readonly relationshipId: string },
  ) => {
    const { rows } = await client.query<{
      ministry_name: string
      still_open: boolean
      material_id: string | null
      title: string | null
      body: string | null
    }>(
      `select n.name as ministry_name,
              (r.ended_at is null and exists (
                 select 1 from relationship_member m
                  where m.relationship_id = r.id
                    and m.person_id = $1
                    and m.ended_at is null)) as still_open,
              a.material_id,
              mat.title,
              mat.body
         from relationship r
         join ministry n on n.id = r.ministry_id
         left join material_assignment a on a.relationship_id = r.id and a.ended_at is null
         left join material mat on mat.id = a.material_id
        where r.id = $2`,
      [link.personId, link.relationshipId],
    )
    return rows[0] ?? null
  }

  const itemsOf = async (client: pg.PoolClient, material: string): Promise<readonly MaterialItem[]> => {
    const { rows } = await client.query<Record<string, unknown>>(
      `select to_jsonb(i) as item from material_item i where i.material_id = $1 order by i.position`,
      [material],
    )
    return rows.map((row) => materialItemFrom(material, row.item as Record<string, unknown>))
  }

  return {
    async readMaterialPage(token: string): Promise<DisciplesMaterialPage | null> {
      return scoped(token, async (client, link) => {
        const now = await running(client, link)
        if (!now) return null
        if (!now.still_open) return { status: 'ended', ministryName: now.ministry_name }
        if (!now.material_id || !now.title) return { status: 'none', ministryName: now.ministry_name }
        return {
          status: 'open',
          ministryName: now.ministry_name,
          title: now.title,
          body: now.body,
          items: await itemsOf(client, now.material_id),
        }
      })
    },

    async fileOnMaterialPage(token: string, itemId: string) {
      if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null
      return scoped(token, async (client, link) => {
        const now = await running(client, link)
        // Only a file of the Material the relationship is on now, and only while
        // the link still opens: an old text is not a way back to a file that has
        // since been taken off.
        if (!now?.still_open || !now.material_id) return null
        const item = (await itemsOf(client, now.material_id)).find((each) => each.id === itemId)
        return item?.kind === 'file' ? { path: item.path, filename: item.filename } : null
      })
    },

    async close() {
      await pool.end()
    },
  }
}
