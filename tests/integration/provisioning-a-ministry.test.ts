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
    //
    // The empty string and not `undefined`: that is what GoTrue reports for an
    // account with no email, and asserting the value it actually returns is what
    // makes this fail if one is ever set.
    expect(account.email).toBe('')
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

  it('reads a number typed the way an operator would type it', async () => {
    // The same reading the Roster, the Intake form and the sign-in form use. A
    // second one here would drift, and the way it would fail is an Admin whose
    // record and whose credential hold different numbers -- one of which is also
    // the number their Ministry texts them on.
    const typed = aTestPhoneNumber().replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
    expect(typed).not.toMatch(/^\+/)

    const provisioned = await provisionMinistry({
      name: 'As Typed Chapel',
      sendingNumber: aTestPhoneNumber(),
      admin: { fullName: 'Typed It Out', phone: typed, password: 'a-long-enough-password' },
    })

    expect(provisioned.adminPhone).toMatch(/^\+1\d{10}$/)

    // The record and the credential, agreeing.
    const { rows } = await pool.query<{ phone: string }>(
      `select phone from person where id = $1`,
      [provisioned.adminPersonId],
    )
    expect(rows[0]?.phone).toBe(provisioned.adminPhone)

    const account = await accountFor(provisioned.adminUserId)
    expect(account.phone).toBe(provisioned.adminPhone.replace('+', ''))
  })

  it('refuses a number it cannot read at all, and creates nothing', async () => {
    await expect(
      provisionMinistry({
        name: 'Unreadable Fellowship',
        sendingNumber: aTestPhoneNumber(),
        admin: { fullName: 'Not A Number', phone: 'ring me', password: 'a-long-enough-password' },
      }),
    ).rejects.toThrow(/unreadable phone number/)

    const { rows } = await pool.query(`select id from ministry where name = $1`, [
      'Unreadable Fellowship',
    ])
    expect(rows).toHaveLength(0)
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

  it('takes the Ministry back when a write after it fails, and frees the number', async () => {
    // A failure *inside* the transaction, which the refusals above never reach --
    // they are turned away before a row is written. A blank name passes the type
    // checker and fails `person`'s own check constraint, so the Ministry is already
    // inserted when the second statement gives way.
    //
    // This is the case the compensation used to be hand-rolled for. Postgres takes
    // the rows back, which leaves the account as the only thing that can be
    // half-done -- and it is discarded, which is what makes the number reusable.
    const phone = aTestPhoneNumber()
    // Named per run, because the retry below creates it: a fixed name would have
    // this test asserting nothing on the second run against the same database.
    const name = `Half Made Chapel ${phone}`

    await expect(
      provisionMinistry({
        name,
        sendingNumber: aTestPhoneNumber(),
        admin: { fullName: '   ', phone, password: 'a-long-enough-password' },
      }),
    ).rejects.toThrow(MinistryNotProvisioned)

    const { rows } = await pool.query(`select id from ministry where name = $1`, [name])
    expect(rows).toHaveLength(0)

    // The number is free, so the operator's obvious next move -- fix the name, run
    // it again -- works. It is the whole point of undoing the half-step rather than
    // leaving it to be reconciled.
    const retry = await provisionMinistry({
      name,
      sendingNumber: aTestPhoneNumber(),
      admin: { fullName: 'Named This Time', phone, password: 'a-long-enough-password' },
    })

    expect(retry.adminPhone).toBe(phone)
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
