import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { EmailAddress } from '~/domain/email'
import { SUPPORT_SUBMISSIONS } from '~/domain/launch-terms'
import type { SupportFormFields } from '~/domain/support-form'
import { createPostgresSupportSubmissions, type PostgresSupportSubmissions } from '~/platform/supabase/support-submissions'
import { createEmailSender } from '~/service/email-sender'
import type { EmailTransport } from '~/service/ports'
import { createSupportForm } from '~/service/support-form'
import { createMinistryWithAdmin, localSupabase, signInAs, type MinistryFixture } from '../support/local-supabase'

/**
 * The form's two tables, for real (Exponential launch, ticket 25): nothing a page can
 * read holds a submission, a church's row is written for that church alone, the limits
 * hold under a burst, and the tick's pass deletes on the day the privacy policy says.
 * The vendors are fakes at their ports; `the-support-form-over-http.test.ts` drives the
 * route on a built server.
 */

const fields = (overrides: Partial<SupportFormFields> = {}): SupportFormFields => ({
  kind: 'support',
  message: 'Help, please.',
  replyTo: 'grace@example.org' as EmailAddress,
  pageAddress: null,
  browser: null,
  ...overrides,
})

/** Far enough back that a run's own rows never count, and unique to this run. */
const aNetwork = () => `198.51.100.${Math.floor(Math.random() * 254) + 1}-${crypto.randomUUID()}`

describe('the support form’s tables', () => {
  let pool: pg.Pool
  let store: PostgresSupportSubmissions
  let ministry: MinistryFixture
  let another: MinistryFixture

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    store = createPostgresSupportSubmissions(localSupabase().databaseUrl)
    ministry = await createMinistryWithAdmin('Support Chapel')
    another = await createMinistryWithAdmin('Another Support Chapel')
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const keepForAChurch = (at: Date, overrides: Partial<SupportFormFields> = {}, who = ministry) =>
    store.keepFromAChurch({
      fields: fields(overrides),
      ministryId: who.id,
      submittedBy: who.adminUserId,
      at,
      limit: { since: new Date(at.getTime() - 60 * 60 * 1000), most: 1000 },
    })

  const rowOf = async (table: string, id: string) =>
    (await pool.query(`select * from ${table} where id = $1`, [id])).rows[0] as Record<string, unknown> | undefined

  it('keeps a signed-in submission with the church', async () => {
    const id = await keepForAChurch(new Date(), { kind: 'bug', pageAddress: '/roster/{id}', browser: 'Chrome' })

    expect(await rowOf('support_submission', id!)).toMatchObject({
      ministry_id: ministry.id,
      submitted_by: ministry.adminUserId,
      kind: 'bug',
      page_address: '/roster/{id}',
      browser: 'Chrome',
      emailed_at: null,
    })
  })

  it('lets nobody in the app read it, not the Admin who sent it and not a stranger', async () => {
    const id = await keepForAChurch(new Date())
    const session = await signInAs(ministry)

    for (const table of ['support_submission', 'signed_out_support_submission']) {
      const { data, error } = await session.from(table).select('id').limit(1)
      expect(error?.code, table).toBe('42501')
      expect(data, table).toBeNull()
    }

    const { rows } = await pool.query(
      `select r.role, t.name
         from unnest(array['anon', 'authenticated', 'service_role']) as r(role)
        cross join unnest(array['support_submission', 'signed_out_support_submission']) as t(name)
        where has_table_privilege(r.role, t.name, 'select')`,
    )
    expect(rows).toEqual([])
    expect(await rowOf('support_submission', id!)).toBeDefined()
  })

  it('holds a command’s write and read to the one church it named', async () => {
    const mine = await keepForAChurch(new Date())
    const theirs = await keepForAChurch(new Date(), {}, another)
    const client = await pool.connect()

    try {
      await client.query('begin')
      await client.query('set local role discipler_command')
      await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministry.id])

      const { rows } = await client.query<{ id: string }>(
        `select id from support_submission where id = any($1::uuid[])`,
        [[mine, theirs]],
      )
      expect(rows.map((row) => row.id)).toEqual([mine])

      await expect(
        client.query(
          `insert into support_submission (ministry_id, submitted_by, kind, message, reply_to, submitted_at)
           values ($1, $2, 'support', 'x', 'a@example.org', now())`,
          [another.id, another.adminUserId],
        ),
      ).rejects.toThrow(/row-level security/)
    } finally {
      await client.query('rollback')
      client.release()
    }
  })

  it('gives a command no way to change or delete one, and no way into the signed-out table', async () => {
    const { rows } = await pool.query<{ allowed: string }>(
      `select p.privilege || ' ' || t.name as allowed
         from unnest(array['update', 'delete', 'truncate']) as p(privilege)
        cross join unnest(array['support_submission']) as t(name)
        where has_table_privilege('discipler_command', t.name, p.privilege)
        union all
       select p.privilege || ' signed_out_support_submission'
         from unnest(array['select', 'insert', 'update', 'delete']) as p(privilege)
        where has_table_privilege('discipler_command', 'signed_out_support_submission', p.privilege)`,
    )

    expect(rows).toEqual([])
  })

  it('refuses an address or a browser on anything but a bug report', async () => {
    await expect(keepForAChurch(new Date(), { kind: 'feature', pageAddress: '/roster' })).rejects.toThrow(
      /support_submission_only_a_bug_attaches/,
    )
  })

  it('passes no burst over the Admin’s limit', async () => {
    const chapel = await createMinistryWithAdmin('The Chapel That Writes A Lot')
    const at = new Date()
    const most = SUPPORT_SUBMISSIONS.perAdminPerHour

    const kept = await Promise.all(
      Array.from({ length: most + 5 }, () =>
        store.keepFromAChurch({
          fields: fields(),
          ministryId: chapel.id,
          submittedBy: chapel.adminUserId,
          at,
          limit: { since: new Date(at.getTime() - 60 * 60 * 1000), most },
        }),
      ),
    )

    expect(kept.filter((id) => id !== null)).toHaveLength(most)
  })

  it('passes no burst over a network’s limit, and keeps no network address', async () => {
    const network = aNetwork()
    const at = new Date()
    const most = SUPPORT_SUBMISSIONS.perNetworkPerHour

    const kept = await Promise.all(
      Array.from({ length: most + 5 }, () =>
        store.keepSignedOut({
          fields: fields(),
          network,
          at,
          limit: { since: new Date(at.getTime() - 60 * 60 * 1000), most },
        }),
      ),
    )

    const ids = kept.filter((id): id is string => id !== null)
    expect(ids).toHaveLength(most)

    const row = await rowOf('signed_out_support_submission', ids[0]!)
    expect(row?.network_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(row)).not.toContain(network)
  })

  describe('the tick’s pass', () => {
    const NOW = new Date()
    const AGO = (months: number, days = 0) => {
      const at = new Date(NOW)
      at.setUTCMonth(at.getUTCMonth() - months)
      at.setUTCDate(at.getUTCDate() - days)
      return at
    }

    const delivered: { kind: string; text: string; subject: string }[] = []
    const vendor = { down: false }
    const transport: EmailTransport = {
      async deliver(envelope) {
        if (vendor.down) throw new Error('Resend is down')
        delivered.push({ kind: envelope.kind, text: envelope.text, subject: envelope.subject })
      },
    }

    const form = () =>
      createSupportForm({
        submissions: store,
        humanCheck: { verify: async () => true },
        sender: createEmailSender(transport),
        clock: createTestClock(NOW),
      })

    const keepSignedOutAt = (at: Date, overrides: Partial<SupportFormFields> = {}) =>
      store.keepSignedOut({
        fields: fields(overrides),
        network: aNetwork(),
        at,
        limit: { since: at, most: 1000 },
      })

    it('deletes what is older than twelve months from both tables, and keeps what is not', async () => {
      const oldChurch = await keepForAChurch(AGO(12, 1))
      const youngChurch = await keepForAChurch(AGO(11, 27))
      const oldSignedOut = await keepSignedOutAt(AGO(13))
      const youngSignedOut = await keepSignedOutAt(AGO(1))
      await store.markEmailed(youngChurch!, NOW)
      await store.markEmailed(youngSignedOut!, NOW)

      const swept = await store.deleteSubmittedBefore(AGO(12))

      expect(swept).toBeGreaterThanOrEqual(2)
      expect(await rowOf('support_submission', oldChurch!)).toBeUndefined()
      expect(await rowOf('signed_out_support_submission', oldSignedOut!)).toBeUndefined()
      expect(await rowOf('support_submission', youngChurch!)).toBeDefined()
      expect(await rowOf('signed_out_support_submission', youngSignedOut!)).toBeDefined()
    })

    it('goes with its church if the church is ever deleted', async () => {
      const chapel = await createMinistryWithAdmin('The Chapel That Closes')
      const id = await store.keepFromAChurch({
        fields: fields(),
        ministryId: chapel.id,
        submittedBy: chapel.adminUserId,
        at: new Date(),
        limit: { since: new Date(), most: 5 },
      })

      const { rows } = await pool.query<{ confdeltype: string }>(
        `select confdeltype from pg_constraint
          where conrelid = 'support_submission'::regclass and contype = 'f'`,
      )

      expect(id).not.toBeNull()
      expect(rows).toEqual([{ confdeltype: 'c' }])
    })

    it('sends what a failed send left waiting, with the church’s name off its row, and marks it', async () => {
      // Anything earlier runs left waiting goes first, so this asks for its own rows.
      await pool.query(`update support_submission set emailed_at = now() where emailed_at is null`)
      await pool.query(`update signed_out_support_submission set emailed_at = now() where emailed_at is null`)
      delivered.length = 0

      const fromChurch = await keepForAChurch(AGO(0, 2), { kind: 'bug', pageAddress: '/roster', browser: 'Chrome' })
      const fromNobody = await keepSignedOutAt(AGO(0, 1), { kind: 'feature' })

      expect(await form().sweep()).toEqual({ deleted: 0, emailed: 2, stillWaiting: 0 })

      expect(delivered.map((one) => one.kind)).toEqual(['bugReport', 'featureRequest'])
      expect(delivered[0]!.text).toContain('Church: Support Chapel')
      expect(delivered[0]!.text).toContain('Page: /roster')
      expect(delivered[1]!.text).toContain('Nobody was signed in')
      expect((await rowOf('support_submission', fromChurch!))?.emailed_at).not.toBeNull()
      expect((await rowOf('signed_out_support_submission', fromNobody!))?.emailed_at).not.toBeNull()

      expect(await form().sweep()).toEqual({ deleted: 0, emailed: 0, stillWaiting: 0 })
    })

    it('leaves what it could not send waiting for the next pass', async () => {
      await pool.query(`update support_submission set emailed_at = now() where emailed_at is null`)
      await pool.query(`update signed_out_support_submission set emailed_at = now() where emailed_at is null`)
      const id = await keepForAChurch(AGO(0, 1))
      vendor.down = true

      const swept = await form().sweep()
      vendor.down = false

      expect(swept).toMatchObject({ emailed: 0, stillWaiting: 1 })
      expect((await rowOf('support_submission', id!))?.emailed_at).toBeNull()
    })
  })
})
