import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MINISTRY_SETUP_LIFETIME_DAYS } from '~/domain/ministry-setup'
import {
  createSupabaseMinistrySetup,
  MinistrySetupNotIssued,
  type SupabaseMinistrySetup,
} from '~/platform/supabase/ministry-setup'
import {
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  publishSupabaseCredentials,
} from '../support/local-supabase'

/**
 * How a real Ministry comes into existence: an operator mints a link, and the
 * church's first Admin spends it typing their own name and password. This is the
 * whole of it against the platform, with the clock in hand; the page and the
 * route are driven over HTTP in `setup-link-over-http.test.ts`.
 */
describe('a Ministry Setup Link', () => {
  let pool: pg.Pool
  let setup: SupabaseMinistrySetup
  let now = new Date('2026-03-02T09:00:00Z')

  beforeAll(() => {
    publishSupabaseCredentials()
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    setup = createSupabaseMinistrySetup(localSupabase().databaseUrl, () => now)
  })

  afterAll(async () => {
    await setup.close()
    await pool.end()
  })

  const aLink = (name = 'Anthem Church') =>
    setup.issue({ ministryName: name, sendingNumber: aTestPhoneNumber(), adminPhone: aTestPhoneNumber() })

  it('is minted with both numbers read the way the product reads them', async () => {
    const typed = aTestPhoneNumber().replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')

    const link = await setup.issue({
      ministryName: '  As Typed Chapel ',
      sendingNumber: aTestPhoneNumber(),
      adminPhone: typed,
    })

    expect(link.ministryName).toBe('As Typed Chapel')
    expect(link.adminPhone).toMatch(/^\+1\d{10}$/)
    expect(link.expiresAt.getTime() - link.createdAt.getTime()).toBe(
      MINISTRY_SETUP_LIFETIME_DAYS * 86_400_000,
    )
  })

  it('refuses a number it cannot read, and mints nothing', async () => {
    await expect(
      setup.issue({ ministryName: 'Unreadable', sendingNumber: aTestPhoneNumber(), adminPhone: 'ring me' }),
    ).rejects.toThrow(MinistrySetupNotIssued)
    await expect(
      setup.issue({ ministryName: 'Unreadable', sendingNumber: 'the office', adminPhone: aTestPhoneNumber() }),
    ).rejects.toThrow(/unreadable sending number/)
    await expect(
      setup.issue({ ministryName: '   ', sendingNumber: aTestPhoneNumber(), adminPhone: aTestPhoneNumber() }),
    ).rejects.toThrow(/needs a name/)
  })

  it('refuses a number that already signs somebody in, while the operator can still act', async () => {
    // The person at the page could do nothing about this; the operator at the
    // terminal can.
    const existing = await createMinistryWithAdmin('Already Here Chapel')

    await expect(
      setup.issue({ ministryName: 'Elsewhere', sendingNumber: aTestPhoneNumber(), adminPhone: existing.adminPhone }),
    ).rejects.toThrow(/already signs somebody in/)
  })

  it('shows the church and the number, and opening it spends nothing', async () => {
    const link = await aLink('Riverside Chapel')

    const page = await setup.read(link.token)
    await setup.read(link.token)

    expect(page).toEqual({ ministryName: 'Riverside Chapel', adminPhone: link.adminPhone, state: 'live' })
    const { rows } = await pool.query(`select consumed_at from ministry_setup where token = $1`, [link.token])
    expect(rows[0].consumed_at).toBeNull()
  })

  it('resolves nothing for a token that was never minted, or is not the shape of one', async () => {
    expect(await setup.read(crypto.randomUUID())).toBeNull()
    expect(await setup.read("' or 1=1 --")).toBeNull()
    expect(await setup.open("' or 1=1 --", { fullName: 'X', password: 'a-long-enough-password' })).toEqual({
      refusal: 'setup.not_found',
    })
  })

  it('opens the Ministry on a name and a password: the account, the Admin, the history, and the spent link', async () => {
    const link = await aLink('Northgate Community Church')

    const opened = await setup.open(link.token, { fullName: 'Tom Halloran', password: 'a-long-enough-password' })
    expect(opened).toHaveProperty('ministryId')
    if ('refusal' in opened) throw new Error(opened.refusal)

    // The Ministry, sending from the number on the link.
    const ministry = await pool.query<{ name: string; sending_number: string }>(
      `select name, sending_number from ministry where id = $1`,
      [opened.ministryId],
    )
    expect(ministry.rows[0]).toEqual({ name: 'Northgate Community Church', sending_number: link.sendingNumber })

    // The Admin: a Person on their own Roster, on the number from the link, with
    // one membership at `admin`.
    const admin = await pool.query<{ full_name: string; phone: string; user_id: string; tier: string }>(
      `select p.full_name, p.phone, p.user_id, m.tier
         from person p join ministry_member m on m.user_id = p.user_id and m.ministry_id = p.ministry_id
        where p.ministry_id = $1`,
      [opened.ministryId],
    )
    expect(admin.rows).toHaveLength(1)
    expect(admin.rows[0]).toMatchObject({ full_name: 'Tom Halloran', phone: link.adminPhone, tier: 'admin' })

    // The opening is the first event in the Ministry's history.
    const history = await pool.query<{ type: string; subject_id: string; payload: { name: string } }>(
      `select type, subject_id, payload from ministry_event where ministry_id = $1`,
      [opened.ministryId],
    )
    expect(history.rows).toEqual([
      expect.objectContaining({ type: 'ministry.opened', subject_id: opened.ministryId, payload: expect.objectContaining({ name: 'Northgate Community Church' }) }),
    ])

    // And the link is spent, pointing at what it became.
    const spent = await pool.query<{ consumed_at: Date | null; opened_ministry_id: string | null }>(
      `select consumed_at, opened_ministry_id from ministry_setup where token = $1`,
      [link.token],
    )
    expect(spent.rows[0]?.consumed_at).not.toBeNull()
    expect(spent.rows[0]?.opened_ministry_id).toBe(opened.ministryId)
    expect(await setup.read(link.token)).toMatchObject({ state: 'consumed' })
  })

  it('opens nothing twice: a spent link is refused, and the Ministry it opened stands', async () => {
    // Named per run: the database keeps the Ministry after the suite ends, so a
    // fixed name would count the last run's as well.
    const name = `Once Only Chapel ${crypto.randomUUID()}`
    const link = await aLink(name)
    await setup.open(link.token, { fullName: 'First', password: 'a-long-enough-password' })

    const again = await setup.open(link.token, { fullName: 'Second', password: 'another-long-password' })

    expect(again).toEqual({ refusal: 'setup.already_used' })
    const { rows } = await pool.query(`select id from ministry where name = $1`, [name])
    expect(rows).toHaveLength(1)
  })

  it('refuses a password too short to be worth having, and leaves the link live', async () => {
    const link = await aLink('Shortpass Fellowship')

    expect(await setup.open(link.token, { fullName: 'Too Short', password: 'short' })).toEqual({
      refusal: 'account.password_too_short',
    })
    expect(await setup.read(link.token)).toMatchObject({ state: 'live' })
    const { rows } = await pool.query(`select id from ministry where name = $1`, ['Shortpass Fellowship'])
    expect(rows).toHaveLength(0)
  })

  it('runs out after the window, and says so rather than opening anything', async () => {
    const link = await aLink('Late Chapel')
    const before = now
    now = new Date(link.expiresAt.getTime() + 1)
    try {
      expect(await setup.read(link.token)).toMatchObject({ state: 'expired' })
      expect(await setup.open(link.token, { fullName: 'Late', password: 'a-long-enough-password' })).toEqual({
        refusal: 'setup.expired',
      })
    } finally {
      now = before
    }
  })

  it('minting again for the same phone replaces the link, and the old one opens nothing', async () => {
    const phone = aTestPhoneNumber()
    const first = await setup.issue({ ministryName: 'First Name Typed Wrong', sendingNumber: aTestPhoneNumber(), adminPhone: phone })
    const second = await setup.issue({ ministryName: 'First Name Typed Right', sendingNumber: aTestPhoneNumber(), adminPhone: phone })

    expect(second.token).not.toBe(first.token)
    expect(await setup.read(first.token)).toBeNull()
    expect(await setup.read(second.token)).toMatchObject({ ministryName: 'First Name Typed Right', state: 'live' })
  })
})
