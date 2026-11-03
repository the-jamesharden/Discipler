import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'
import { supabaseAccounts } from '~/platform/supabase/accounts'
import { readPageDocument, resolutionOf } from '~/platform/supabase/page'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  signInAs,
  signInWith,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * `signed_in_admin`, the one read behind `resolveAdmin`: the session verdict and
 * the Admin in one document, where this used to be three requests in a row on
 * every page. The three answers it gives are the three `resolveAdmin` always gave,
 * and each is checked here from the session that earns it.
 */

// A church that has not paid, on any page's document (Exponential launch, ticket 03).
const NOTHING_ESTABLISHED = {
  standing: 'no_subscription',
  has_access: false,
  trial_ends_at: null,
  current_period_ends_at: null,
  cancels_at: null,
}

describe('the signed-in Admin answers in one read', () => {
  let riverside: MinistryFixture

  beforeAll(async () => {
    riverside = await createMinistryWithAdmin('Riverside Chapel')
  })

  it('names an Admin, their Ministry and their own row on the Roster', async () => {
    const doc = await readPageDocument(await signInAs(riverside), 'signed_in_admin')

    expect(doc).toEqual({
      session: 'admin',
      user_id: riverside.adminUserId,
      admin: {
        ministry_id: riverside.id,
        ministry_name: 'Riverside Chapel',
        person_id: riverside.adminPersonId,
        full_name: riverside.adminName,
      },
      billing: NOTHING_ESTABLISHED,
      // The setup meter's own document (ticket 26), proved in `the-setup-meter-over-http`.
      setup: expect.objectContaining({ finished: false }),
    })
  })

  it('names nobody for an Admin the Roster holds no row for, rather than failing', async () => {
    const chapel = await createMinistryWithAdmin('The Chapel With No Row')
    const session = await signInAs(chapel)

    // Reachable: an Admin membership does not depend on a row on the Roster.
    const pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    await pool.query('update person set user_id = null where id = $1', [chapel.adminPersonId])
    await pool.end()

    const doc = await readPageDocument(session, 'signed_in_admin')

    expect(doc.admin).toEqual({
      ministry_id: chapel.id,
      ministry_name: 'The Chapel With No Row',
      person_id: null,
      full_name: null,
    })
    const resolution = resolutionOf(doc)
    expect(resolution.status === 'admin' && resolution.admin.fullName).toBeNull()
  })

  it('reads the name the Roster holds now, not one kept anywhere else', async () => {
    const chapel = await createMinistryWithAdmin('The Renaming Chapel', 'Grace Adeyemi')
    const session = await signInAs(chapel)
    const first = resolutionOf(await readPageDocument(session, 'signed_in_admin'))
    expect(first.status === 'admin' && first.admin.fullName).toBe('Grace Adeyemi')

    const pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    await pool.query('update person set full_name = $2 where id = $1', [chapel.adminPersonId, 'Grace Okafor'])
    await pool.end()

    const after = resolutionOf(await readPageDocument(session, 'signed_in_admin'))
    expect(after.status === 'admin' && after.admin.fullName).toBe('Grace Okafor')
  })

  it('says a Leader who administers nothing is not an Admin, and names no Ministry', async () => {
    const leader = await addPersonWithAccount(riverside, 'Karen Whitfield', 'leader')

    const doc = await readPageDocument(await signInWith(leader), 'signed_in_admin')

    expect(doc).toEqual({ session: 'not-an-admin', user_id: leader.userId })
  })

  it('says signed-out once the session has been ended, though the token still verifies', async () => {
    const leader = await addPersonWithAccount(riverside, 'Tomas Ferreira', 'leader')
    const held = await signInWith(leader)

    // Before the reset the session is held, and the document says who holds it.
    expect(await readPageDocument(held, 'signed_in_admin')).toEqual({
      session: 'not-an-admin',
      user_id: leader.userId,
    })

    // A password reset ends every session on the account. Afterwards the token is
    // unchanged and still verifies -- the Auth server signed it and it has not
    // expired -- so this answer is the whole of how a reset signs a held session out
    // of a page (`docs/adr/0016-a-password-change-ends-every-session.md`), and the
    // document carries nothing else beside it.
    await supabaseAccounts.setPassword(leader.userId, 'a-different-correct-horse')

    expect(await readPageDocument(held, 'signed_in_admin')).toEqual({ session: 'signed-out' })
  })

  it('refuses a visitor with no session', async () => {
    const { apiUrl, anonKey } = localSupabase()
    const nobody = createClient(apiUrl, anonKey)

    // Granted to a signed-in user and to nobody else. The hosted platform grants
    // `anon` execute on a new function by default, which is why the revoke is
    // written into the migration rather than assumed.
    expect((await nobody.rpc('signed_in_admin')).error).not.toBeNull()

    // So the reader answers for a visitor itself, from the absence of a verified
    // token, and never sends the request: a refusal at the door is not a verdict,
    // and a page must send a visitor to sign in rather than fail.
    expect(await readPageDocument(nobody, 'signed_in_admin')).toEqual({ session: 'signed-out' })
  })

  it('answers for the session’s own Ministry and no other', async () => {
    const northgate = await createMinistryWithAdmin('Northgate Community Church')

    const doc = await readPageDocument(await signInAs(northgate), 'signed_in_admin')

    expect(doc.admin).toEqual({
      ministry_id: northgate.id,
      ministry_name: 'Northgate Community Church',
      person_id: northgate.adminPersonId,
      full_name: northgate.adminName,
    })
    expect(JSON.stringify(doc)).not.toContain(riverside.id)
  })
})
