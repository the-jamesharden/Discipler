import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MinistryNotProvisioned, provisionMinistry } from '~/platform/supabase/provisioning'
import {
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
} from '../support/local-supabase'

/**
 * How an Admin comes into existence, which is the half of
 * `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md` that ticket 06 left
 * behind and the whole of `docs/adr/0009-one-account-per-human.md`.
 *
 * Two facts are asserted here and nowhere else, because there is nowhere else they
 * could be: the Admin's account is a phone identity carrying no email, and the
 * Admin is a Person in their own Ministry with `person.user_id` pointing at that
 * account. Everything downstream -- an Admin signing in, an Admin who leads
 * reaching both surfaces, an Admin accepting an Invitation Link without gaining a
 * second login -- rests on those two and would be untestable without them.
 */

describe('provisioning a Ministry and its first Admin', () => {
  let pool: pg.Pool

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  const accountFor = async (userId: string) => {
    const { data, error } = await serviceRoleClient().auth.admin.getUserById(userId)
    if (error) throw new Error(error.message)
    return data.user
  }

  it('mints a phone identity and no email address', async () => {
    const ministry = await createMinistryWithAdmin('Riverside Chapel')
    const account = await accountFor(ministry.adminUserId)

    expect(account.phone).toBe(ministry.adminPhone.replace('+', ''))

    // Not merely unused: absent. An address on the account would be a second door
    // onto it, and nothing in the product opens that one -- so leaving it there
    // would be leaving a credential nobody maintains.
    expect(account.email ?? '').toBe('')
  })

  it('gives the Admin a Person row in their own Ministry, linked to that account', async () => {
    const ministry = await createMinistryWithAdmin('Northgate Community Church', 'Tom Halloran')

    const { rows } = await pool.query<{
      id: string
      ministry_id: string
      full_name: string
      phone: string
      user_id: string
    }>(`select id, ministry_id, full_name, phone, user_id from person where user_id = $1`, [
      ministry.adminUserId,
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: ministry.adminPersonId,
      ministry_id: ministry.id,
      full_name: 'Tom Halloran',
      // The number they sign in with and the number on their record are one fact.
      phone: ministry.adminPhone,
      user_id: ministry.adminUserId,
    })
  })

  it('enrols them as an Admin, in one row and one tier', async () => {
    const ministry = await createMinistryWithAdmin('Eastside Church')

    const { rows } = await pool.query<{ tier: string }>(
      `select tier from ministry_member where ministry_id = $1 and user_id = $2`,
      [ministry.id, ministry.adminUserId],
    )

    expect(rows).toEqual([{ tier: 'admin' }])
  })

  it('refuses a number that already signs somebody in, rather than splitting them in two', async () => {
    const first = await createMinistryWithAdmin('Southbank Chapel')

    await expect(
      provisionMinistry({
        name: 'Somebody Else Entirely',
        sendingNumber: aTestPhoneNumber(),
        admin: {
          fullName: 'Same Number',
          phone: first.adminPhone,
          password: 'a-long-enough-password',
        },
      }),
    ).rejects.toThrow(MinistryNotProvisioned)

    // And leaves nothing behind. A Ministry created before the refusal would be a
    // Ministry nobody can sign in to, which is worse than not creating one.
    const { rows } = await pool.query(`select id from ministry where name = $1`, [
      'Somebody Else Entirely',
    ])
    expect(rows).toHaveLength(0)
  })

  it('refuses a password too short to be worth having, and creates no Ministry', async () => {
    await expect(
      provisionMinistry({
        name: 'Shortpass Fellowship',
        sendingNumber: aTestPhoneNumber(),
        admin: { fullName: 'Too Short', phone: aTestPhoneNumber(), password: 'short' },
      }),
    ).rejects.toThrow(/account.password_too_short/)

    const { rows } = await pool.query(`select id from ministry where name = $1`, [
      'Shortpass Fellowship',
    ])
    expect(rows).toHaveLength(0)
  })
})
