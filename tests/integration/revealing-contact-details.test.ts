import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { personId, type MinistryId } from '~/domain/ids'
import { readContactToShare } from '~/platform/supabase/care-needed-reader'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  recordConsentDecision,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * `Nudge` reveals a number and sends nothing (ticket 11, and
 * `docs/adr/0010-nudge-reveals-a-number-and-sends-nothing.md`).
 *
 * These assert the reveal on the surface that performs it: a signed-in Admin, whose
 * session cannot reach `app.current_consent` directly. The sending layer resolves the
 * same rule on its own connection and is covered by `withdrawing-consent.test.ts`;
 * what is proved here is that the browser path reaches the same answer and that a
 * Ministry boundary still holds when a definer function is the thing answering.
 */

describe('Revealing contact details', () => {
  let ministry: MinistryFixture
  let elsewhere: MinistryFixture
  let admin: SupabaseClient
  let pool: pg.Pool

  const reveal = (person: string, of: MinistryFixture = ministry) =>
    readContactToShare(admin, of.id as MinistryId, personId(person))

  /**
   * A decision made after the one `addPerson` records at Intake. The rule is *the
   * latest decision wins*, so a fixture that dated a withdrawal before the grant it
   * withdraws would be asserting nothing -- the grant would still be the latest, and
   * correctly so. Offsets from the Intake's own instant rather than fixed calendar
   * dates, because `completeIntake` stamps its consent at the real clock.
   */
  const afterIntake = (minutes: number) => new Date(Date.now() + minutes * 60_000)

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    elsewhere = await createMinistryWithAdmin('Northgate Fellowship')
    admin = await signInAs(ministry)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await admin.auth.signOut()
    await pool.end()
  })

  it('gives the Admin the number when the Person currently agrees to share it', async () => {
    const person = await addPerson(ministry, 'Grace Miller', { phone: '+15554440101' })

    expect(await reveal(person)).toEqual({
      fullName: 'Grace Miller',
      phone: '+15554440101',
    })
  })

  it('stops revealing it once the Person withdraws that consent', async () => {
    // The rule the ticket states in its own words: a Person who granted sharing and
    // later withdrew it has two records, and the older one must not answer for them.
    const person = await addPerson(ministry, 'Amara Osei', { phone: '+15554440102' })
    expect(await reveal(person)).not.toBeNull()

    await recordConsentDecision(
      ministry,
      person,
      'contact_sharing',
      false,
      afterIntake(1),
    )

    expect(await reveal(person)).toBeNull()
  })

  it('reveals it again if the Person changes their mind back', async () => {
    // The latest decision wins, rather than a refusal latching the number shut for
    // good. Proved on the Admin path and not only on the sending one.
    const person = await addPerson(ministry, 'Ruth Adeyemi', { phone: '+15554440103' })
    await recordConsentDecision(
      ministry,
      person,
      'contact_sharing',
      false,
      afterIntake(1),
    )
    expect(await reveal(person)).toBeNull()

    await recordConsentDecision(
      ministry,
      person,
      'contact_sharing',
      true,
      afterIntake(2),
    )

    expect(await reveal(person)).not.toBeNull()
  })

  it('reveals nothing for a Person who was never asked', async () => {
    // NULL and false are both "do not". A Person on the Roster who never completed
    // Intake has no decision on record, and an absent decision is not a grant.
    const person = await addPerson(ministry, 'Never Asked', {
      phone: '+15554440104',
      intake: false,
    })

    expect(await reveal(person)).toBeNull()
  })

  it('reveals nothing for a Person with no number to give', async () => {
    // Not a number withheld, but the Admin cannot tell the difference and does not
    // need to: both mean the call cannot be made from here.
    const person = await addPerson(ministry, 'No Number')

    expect(await reveal(person)).toBeNull()
  })

  it('sends nothing and enqueues nothing when it reveals a number', async () => {
    // The whole of ticket 11's third criterion, asserted against the only code that
    // now implements `Nudge`. There is no admin-initiated send in Discipler, which is
    // why there are no per-recipient ceilings to enforce -- ticket 11a built some and
    // was withdrawn when it turned out they had no subject. A reveal that quietly
    // queued a message would put that subject back without anyone deciding to.
    const person = await addPerson(ministry, 'Miriam Vale', { phone: '+15554440106' })

    const before = await pool.query('select count(*) from outbound_message')
    expect(await reveal(person)).not.toBeNull()
    const after = await pool.query('select count(*) from outbound_message')

    expect(after.rows[0].count).toBe(before.rows[0].count)
  })

  it('reveals nothing when asked for a Ministry the Person is not in', async () => {
    // The Person is on this Admin's own Roster and the Admin may see their number --
    // but not in answer to a question about a different Ministry. `app.is_member_of`
    // alone would have allowed this, since the Admin does belong to Riverside; it is
    // the Ministry argument being consulted that refuses it. Asserted because a
    // parameter that is carried and never read looks identical from the outside until
    // something like this asks.
    const person = await addPerson(ministry, 'Selah Nkemdi', { phone: '+15554440107' })
    expect(await reveal(person)).not.toBeNull()

    expect(await reveal(person, elsewhere)).toBeNull()
  })

  it('reveals nothing about a Person in another Ministry', async () => {
    // The function runs as its owner, so no policy is between the caller and the
    // row. `app.is_member_of` is the whole of the boundary here, which is why this
    // is asserted rather than assumed from the policies that cover every other read.
    const outsider = await addPerson(elsewhere, 'Tobi Adeleke', { phone: '+15554440105' })

    expect(await reveal(outsider, elsewhere)).toBeNull()
  })
})
