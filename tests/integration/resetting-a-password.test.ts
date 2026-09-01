import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { PasswordResetRefused } from '~/domain/errors'
import { personId, type IdSource } from '~/domain/ids'
import { supabaseAccounts } from '~/platform/supabase/accounts'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  signInWith,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * An Admin putting a Leader who has lost their password back in.
 *
 * Two halves meet here and only one of them is Discipler's. Setting the password
 * and ending the sessions is Supabase Auth's, reached through the `Accounts` port;
 * recording who did it to whom is a command. They cannot be one transaction, which
 * is why the order between them is a decision and why the tests below cover both
 * sides of it.
 */

describe('resetting somebody’s password', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const at = new Date('2026-09-14T10:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({
      clock: createTestClock(at),
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const NEW_PASSWORD = 'harbinger-lantern-copper-fern'

  const signInAttempt = async (phone: string, password: string) => {
    const { apiUrl, anonKey } = localSupabase()
    const client = createClient(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    return client.auth.signInWithPassword({ phone, password })
  }

  it('ends every session on the account it resets', async () => {
    const leader = await addPersonWithAccount(ministry, 'Marcus Webb', 'leader')

    // A real session, held the way a Leader holds one: signed in with the password
    // they had, and working before anything happens to it.
    const held = await signInWith(leader)
    expect((await held.auth.getUser()).data.user?.id).toBe(leader.userId)

    await supabaseAccounts.setPassword(leader.userId, NEW_PASSWORD)

    // The criterion, asserted against the session and not against a call anybody
    // made. Sessions here last on the order of a year, so a reset that left this one
    // alive would answer *I have forgotten it* and do nothing at all about
    // *somebody else has it* --
    // `docs/adr/0016-a-password-change-ends-every-session.md`.
    const after = await held.auth.getUser()
    expect(after.data.user).toBeNull()
    expect(after.error).not.toBeNull()
  })

  it('leaves the new password working and the old one refused', async () => {
    const leader = await addPersonWithAccount(ministry, 'Ruth Adeyemi', 'leader')
    const wasSignedInWith = leader.password

    await supabaseAccounts.setPassword(leader.userId, NEW_PASSWORD)

    const withTheOld = await signInAttempt(leader.phone, wasSignedInWith)
    expect(withTheOld.error).not.toBeNull()

    const withTheNew = await signInAttempt(leader.phone, NEW_PASSWORD)
    expect(withTheNew.error).toBeNull()
    expect(withTheNew.data.user?.id).toBe(leader.userId)
  })

  it('records who reset whose password, carrying no password material', async () => {
    const leader = await addPersonWithAccount(ministry, 'Sam Doyle', 'leader')

    await service().execute({
      type: 'person.reset_password',
      ministryId: ministry.id,
      personId: personId(leader.personId),
      resetBy: ministry.adminUserId,
    })

    const { rows } = await pool.query<{ payload: Record<string, unknown>; ministry_id: string }>(
      `select payload, ministry_id from ministry_event
        where subject_id = $1 and type = 'person.password_reset'`,
      [leader.personId],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]!.ministry_id).toBe(ministry.id)
    // The keys, not a search for a string. A password is whatever four words came
    // out, so a test looking for one would only ever prove that *that* password was
    // absent.
    expect(Object.keys(rows[0]!.payload)).toEqual(['resetBy'])
    expect(rows[0]!.payload).toEqual({ resetBy: ministry.adminUserId })
  })

  it('sends nothing', async () => {
    const leader = await addPersonWithAccount(ministry, 'Nadia Farouk', 'leader')

    const before = await pool.query<{ count: string }>(
      `select count(*) from outbound_message where person_id = $1`,
      [leader.personId],
    )

    await supabaseAccounts.setPassword(leader.userId, NEW_PASSWORD)
    await service().execute({
      type: 'person.reset_password',
      ministryId: ministry.id,
      personId: personId(leader.personId),
      resetBy: ministry.adminUserId,
    })

    // There is no admin-initiated send anywhere in Discipler and that is a decision
    // -- ADR-0010. Texting a password would also fail for exactly the people who
    // need it: `outbound_message_recipient_has_given_sms_consent` refuses anybody
    // with no standing SMS consent, which is every Admin and every opted-out Leader.
    const after = await pool.query<{ count: string }>(
      `select count(*) from outbound_message where person_id = $1`,
      [leader.personId],
    )
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count)
  })

  it('refuses a Person on another Ministry’s Roster, and writes no history', async () => {
    const northside = await createMinistryWithAdmin('Northside Fellowship')
    const theirs = await addPersonWithAccount(northside, 'Omar Haddad', 'leader')

    // Riverside's Admin, naming Northside's Leader. The connection has already
    // declared which Ministry it acts for, so that Person is not visible to read at
    // all and the command refuses on the same value it would refuse somebody who
    // holds no account with.
    await expect(
      service().execute({
        type: 'person.reset_password',
        ministryId: ministry.id,
        personId: personId(theirs.personId),
        resetBy: ministry.adminUserId,
      }),
    ).rejects.toThrow(new PasswordResetRefused('account.no_account'))

    const { rows } = await pool.query(
      `select 1 from ministry_event where subject_id = $1 and type = 'person.password_reset'`,
      [theirs.personId],
    )
    expect(rows).toHaveLength(0)
  })

  it('refuses an Admin resetting themselves', async () => {
    await expect(
      service().execute({
        type: 'person.reset_password',
        ministryId: ministry.id,
        personId: personId(ministry.adminPersonId),
        resetBy: ministry.adminUserId,
      }),
    ).rejects.toThrow(new PasswordResetRefused('account.cannot_reset_yourself'))
  })

  it('refuses a Person on this Roster who holds no account', async () => {
    const withoutOne = await addPersonWithAccount(
      ministry,
      'Tomas Vidal',
      'leader',
      { intake: false },
    )
    // Unlinked rather than never created, so the Person row is the one the product
    // makes and only the account is missing -- which is every Leader who has not yet
    // accepted their Invitation Link.
    await serviceRoleClient()
      .from('person')
      .update({ user_id: null })
      .eq('id', withoutOne.personId)

    await expect(
      service().execute({
        type: 'person.reset_password',
        ministryId: ministry.id,
        personId: personId(withoutOne.personId),
        resetBy: ministry.adminUserId,
      }),
    ).rejects.toThrow(new PasswordResetRefused('account.no_account'))
  })

  it('resets an account held on two Rosters, and records it only where it was reset', async () => {
    // One human, one login, two Ministries -- `person (ministry_id, user_id)` is
    // unique per Ministry and `person_user_id_idx` is not unique, so this is a state
    // the schema has always permitted and ADR-0009 is what makes it the right one.
    const northside = await createMinistryWithAdmin('Northside Fellowship')
    const shared = await addPersonWithAccount(ministry, 'Ezra Kimani', 'leader')

    const { data: alsoThere, error } = await serviceRoleClient()
      .from('person')
      .insert({
        ministry_id: northside.id,
        full_name: 'Ezra Kimani',
        phone: shared.phone,
        user_id: shared.userId,
      })
      .select('id')
      .single()
    if (error) throw new Error(`Could not put Ezra on Northside’s Roster: ${error.message}`)

    const held = await signInWith(shared)

    await supabaseAccounts.setPassword(shared.userId, NEW_PASSWORD)
    await service().execute({
      type: 'person.reset_password',
      ministryId: ministry.id,
      personId: personId(shared.personId),
      resetBy: ministry.adminUserId,
    })

    // It succeeds. Refusing anybody who holds membership elsewhere would make the
    // commonest real case -- one person serving two campuses -- permanently
    // unrecoverable, and a refusal that explained itself would disclose Northside's
    // existence to an Admin of Riverside.
    expect((await signInAttempt(shared.phone, NEW_PASSWORD)).error).toBeNull()
    // The one credential is the one credential: the session ends on both Rosters
    // because there is only ever one account behind them.
    expect((await held.auth.getUser()).data.user).toBeNull()

    // And the event is written where it was done and nowhere else. Writing it into
    // every Ministry the account belongs to would be a write outside the acting
    // Admin's Ministry, which is exactly the isolation the schema enforces
    // everywhere else -- so Northside's history records nothing, and that cost is
    // named rather than designed around.
    const { rows } = await pool.query<{ ministry_id: string }>(
      `select ministry_id from ministry_event
        where type = 'person.password_reset' and subject_id = any($1)`,
      [[shared.personId, alsoThere.id]],
    )
    expect(rows.map((row) => row.ministry_id)).toEqual([ministry.id])
  })
})
