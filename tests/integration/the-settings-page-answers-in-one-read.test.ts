import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { readPageDocument } from '~/platform/supabase/page'
import { rows } from '~/platform/supabase/rows'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  signInAs,
  signInWith,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * `settings_page`, the one read behind `/settings`: the Admin and their
 * Ministry's settings row in one document, where the page used to resolve the
 * Admin and then ask `ministry_settings`. The row is the same row, under the same
 * names, which is what lets the reader's parsing move without changing.
 */

describe('the settings page answers in one read', () => {
  let riverside: MinistryFixture
  let admin: SupabaseClient

  beforeAll(async () => {
    riverside = await createMinistryWithAdmin('Riverside Chapel')
    admin = await signInAs(riverside)
  })

  it('carries the Admin and the settings row the separate read gives', async () => {
    const doc = await readPageDocument(admin, 'settings_page')

    const { data, error } = await admin.rpc('ministry_settings', {
      target_ministry_id: riverside.id,
    })
    if (error) throw new Error(error.message)
    const separate = rows(data)[0]

    expect(doc).toEqual({
      session: 'admin',
      user_id: riverside.adminUserId,
      admin: {
        ministry_id: riverside.id,
        ministry_name: 'Riverside Chapel',
        person_id: riverside.adminPersonId,
      },
      settings: separate,
    })
    expect(separate).toMatchObject({ name: 'Riverside Chapel' })
  })

  it('carries no settings for a Leader who administers nothing', async () => {
    const leader = await addPersonWithAccount(riverside, 'Karen Whitfield', 'leader')

    const doc = await readPageDocument(await signInWith(leader), 'settings_page')

    expect(doc).toEqual({ session: 'not-an-admin', user_id: leader.userId })
  })

  it('refuses a visitor with no session', async () => {
    const { apiUrl, anonKey } = localSupabase()
    const nobody = createClient(apiUrl, anonKey)

    expect((await nobody.rpc('settings_page')).error).not.toBeNull()
  })

  it('answers for the session’s own Ministry and no other', async () => {
    const northgate = await createMinistryWithAdmin('Northgate Community Church')

    const doc = await readPageDocument(await signInAs(northgate), 'settings_page')

    expect(doc.admin).toMatchObject({ ministry_id: northgate.id })
    expect(doc.settings).toMatchObject({ name: 'Northgate Community Church' })
    expect(JSON.stringify(doc)).not.toContain(riverside.id)
  })
})
