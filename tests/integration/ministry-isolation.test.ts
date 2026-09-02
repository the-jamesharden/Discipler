import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * "Our data is never combined with another Ministry's" is an agreement the product
 * enters into, not a preference. It is enforced by row-level security in the
 * database, so a missing WHERE clause anywhere in the application cannot leak
 * across Ministries -- and this is the test that proves the policies do what they
 * claim rather than merely existing.
 */

describe('two Ministries operating concurrently', () => {
  let riverside: MinistryFixture
  let northgate: MinistryFixture
  let asRiverside: SupabaseClient
  let asNorthgate: SupabaseClient

  beforeAll(async () => {
    riverside = await createMinistryWithAdmin('Riverside Chapel')
    northgate = await createMinistryWithAdmin('Northgate Community Church')

    await addPerson(riverside, 'Ada Rowe')
    await addPerson(northgate, 'Ben Okafor')

    asRiverside = await signInAs(riverside)
    asNorthgate = await signInAs(northgate)
  })

  it('each sees only its own Roster', async () => {
    const { data: riversideRoster } = await asRiverside.from('person').select('full_name')
    const { data: northgateRoster } = await asNorthgate.from('person').select('full_name')

    // Each Admin is on their own Roster, because provisioning gives them a Person
    // row like everybody else -- and on nobody else's, which is what this is about.
    expect(riversideRoster?.map((p) => p.full_name).sort()).toEqual(
      [riverside.adminName, 'Ada Rowe'].sort(),
    )
    expect(northgateRoster?.map((p) => p.full_name).sort()).toEqual(
      [northgate.adminName, 'Ben Okafor'].sort(),
    )
  })

  it('each sees only its own Ministry', async () => {
    const { data } = await asRiverside.from('ministry').select('name')

    expect(data?.map((m) => m.name)).toEqual(['Riverside Chapel'])
  })

  it('each sees only its own history', async () => {
    // Each Ministry's history begins with its own opening, written by
    // provisioning -- so there is exactly one event here and it is Northgate's.
    const { data } = await asNorthgate.from('ministry_event').select('ministry_id, type')

    expect(data).toEqual([{ ministry_id: northgate.id, type: 'ministry.opened' }])
  })

  it('asking for the other Ministry by id returns nothing rather than its data', async () => {
    const { data, error } = await asRiverside
      .from('person')
      .select('full_name')
      .eq('ministry_id', northgate.id)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('cannot read the other Ministry\'s history by id either', async () => {
    const { data } = await asRiverside
      .from('ministry_event')
      .select('type')
      .eq('ministry_id', northgate.id)

    expect(data).toEqual([])
  })

  it('cannot see that the other Ministry has an Admin at all', async () => {
    const { data } = await asRiverside.from('ministry_member').select('user_id')

    expect(data?.map((m) => m.user_id)).toEqual([riverside.adminUserId])
  })

  it('cannot write a Person into the other Ministry', async () => {
    const { error } = await asRiverside
      .from('person')
      .insert({ ministry_id: northgate.id, full_name: 'Smuggled In' })

    expect(error).not.toBeNull()

    const { data } = await asNorthgate.from('person').select('full_name')
    expect(data?.map((p) => p.full_name).sort()).toEqual(
      [northgate.adminName, 'Ben Okafor'].sort(),
    )
    expect(data?.map((p) => p.full_name)).not.toContain('Smuggled In')
  })

  it('cannot write into its own Ministry from the browser either -- writes go through the command boundary', async () => {
    const { error } = await asRiverside
      .from('person')
      .insert({ ministry_id: riverside.id, full_name: 'Side Door' })

    expect(error).not.toBeNull()
  })

  it('cannot enrol itself into the other Ministry to gain access', async () => {
    const { error } = await asRiverside
      .from('ministry_member')
      .insert({ ministry_id: northgate.id, user_id: riverside.adminUserId, tier: 'admin' })

    expect(error).not.toBeNull()

    const { data } = await asRiverside.from('person').select('full_name')
    expect(data?.map((p) => p.full_name).sort()).toEqual(
      [riverside.adminName, 'Ada Rowe'].sort(),
    )
    expect(data?.map((p) => p.full_name)).not.toContain('Ben Okafor')
  })

  it('shows a signed-out visitor nothing at all', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const { apiUrl, anonKey } = localSupabase()
    const anonymous = createClient(apiUrl, anonKey)

    const { data: people } = await anonymous.from('person').select('full_name')
    const { data: ministries } = await anonymous.from('ministry').select('name')

    expect(people ?? []).toEqual([])
    expect(ministries ?? []).toEqual([])
  })
})

describe('the write side', () => {
  /**
   * Reads are policed by row-level security as the signed-in user. Writes arrive on
   * a trusted connection, which is exactly where isolation is easiest to lose: a
   * superuser connection bypasses RLS, leaving nothing but application care between
   * one Ministry's command and another Ministry's rows.
   */
  let riverside: MinistryFixture
  let northgate: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>

  beforeAll(async () => {
    riverside = await createMinistryWithAdmin('Riverside Chapel')
    northgate = await createMinistryWithAdmin('Northgate Community Church')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    await store.close()
  })

  const at = new Date('2026-03-02T09:00:00Z')

  it('refuses to write history into a Ministry the command is not acting for', async () => {
    await expect(
      store.transact(riverside.id, (sink) =>
        sink.appendHistory([
          {
            ministryId: northgate.id,
            occurredAt: at,
            type: 'week.reported',
            subjectType: 'ministry',
            subjectId: northgate.id,
            payload: {},
          },
        ]),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('refuses to queue a message to another Ministry', async () => {
    await expect(
      store.transact(riverside.id, (sink) =>
        sink.enqueueMessages([
          {
            ministryId: northgate.id,
            personId: null,
            toPhone: '+15550100',
            body: 'Northgate Community Church: hello.',
            enqueuedAt: at,
            scheduledFor: null,
            disclosesPersonId: null,
            kind: 'no_reply',
          },
        ]),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('still writes happily within its own Ministry', async () => {
    const written = await store.transact(riverside.id, (sink) =>
      sink.appendHistory([
        {
          ministryId: riverside.id,
          occurredAt: at,
          type: 'week.reported',
          subjectType: 'ministry',
          subjectId: riverside.id,
          payload: { met: true },
        },
      ]),
    )

    expect(written).toHaveLength(1)
  })

  it('leaves nothing behind in the other Ministry after a refused write', async () => {
    const asNorthgate = await signInAs(northgate)
    const { data } = await asNorthgate.from('ministry_event').select('type')

    // Only its own opening, which was there before anything was refused.
    expect(data).toEqual([{ type: 'ministry.opened' }])
  })
})

