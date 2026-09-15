import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { personId } from '~/domain/ids'
import { intakeFormsPageFrom } from '~/platform/supabase/intake-forms-reader'
import { list, readPageDocument } from '~/platform/supabase/page'
import { rows } from '~/platform/supabase/rows'
import {
  addMembership,
  addPerson,
  addPersonWithAccount,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  openMaterialHistory,
  serviceRoleClient,
  signInAs,
  signInWith,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * `intake_forms_page`, the one read behind `/intake-forms`: the Admin, the
 * groups, whoever is waiting to join one, the Discipleship Goal options and the
 * names on the Roster in one document, where the page used to make those reads
 * one after another. Each list is the same rows the separate function gives,
 * under the same names.
 */

/** Rows in an order a test can compare, whatever order the aggregate chose. */
const byId = (list: readonly Record<string, unknown>[], key: string) =>
  [...list].sort((a, b) => String(a[key]).localeCompare(String(b[key])))

describe('the Intake forms page answers in one read', () => {
  let riverside: MinistryFixture
  let admin: SupabaseClient
  let ruth: string
  let nia: string
  let group: string

  const separately = async (client: SupabaseClient, fn: string) => {
    const { data, error } = await client.rpc(fn, { target_ministry_id: riverside.id })
    if (error) throw new Error(error.message)
    return rows(data)
  }

  beforeAll(async () => {
    riverside = await createMinistryWithAdmin('Riverside Chapel')
    admin = await signInAs(riverside)

    // A named group whose door is guarded, led by Ruth, with Nia waiting outside.
    ruth = await addPerson(riverside, 'Ruth Adeyemi', { phone: aTestPhoneNumber() })
    nia = await addPerson(riverside, 'Nia Okafor', { phone: aTestPhoneNumber() })

    const acceptedAt = new Date('2026-03-02T09:00:00Z')
    const { data, error } = await serviceRoleClient()
      .from('relationship')
      .insert({
        ministry_id: riverside.id,
        kind: 'group',
        accepted_at: acceptedAt.toISOString(),
        name: 'Tuesday Women’s Group',
        join_requires_approval: true,
        declared_gender: 'female',
      })
      .select('id')
      .single()
    if (error) throw new Error(`Could not form the group: ${error.message}`)
    group = data.id
    await openMaterialHistory(riverside, group, acceptedAt)
    await addMembership({ ministry: riverside, relationshipId: group, kind: 'group', personId: ruth, role: 'leader' })

    // The request an Intake submission raises where the door is guarded, written as
    // the item it is: open until an Admin acts on it.
    const { error: requestError } = await serviceRoleClient().from('follow_up_item').insert({
      ministry_id: riverside.id,
      kind: 'group_join_requested',
      person_id: nia,
      relationship_id: group,
      raised_at: new Date().toISOString(),
    })
    if (requestError) throw new Error(`Could not raise the join request: ${requestError.message}`)
  })

  it('carries the Admin, the groups, the join requests, the goal options and the names', async () => {
    const doc = await readPageDocument(admin, 'intake_forms_page')

    expect(doc.session).toBe('admin')
    expect(doc.admin).toEqual({
      ministry_id: riverside.id,
      ministry_name: 'Riverside Chapel',
      person_id: riverside.adminPersonId,
    })

    // Each list is what the separate function answers the same session, row for
    // row and name for name.
    const groups = await separately(admin, 'ministry_groups')
    expect(groups.map((row) => row.relationship_id)).toEqual([group])
    expect(byId(list(doc, 'groups'), 'relationship_id')).toEqual(byId(groups, 'relationship_id'))

    const requests = await separately(admin, 'group_join_requests')
    expect(requests.map((row) => row.person_id)).toEqual([nia])
    expect(byId(list(doc, 'join_requests'), 'item_id')).toEqual(byId(requests, 'item_id'))

    // Provisioning seeds the Ministry's list, so there is something to compare.
    const options = await separately(admin, 'discipleship_goal_options')
    expect(options.length).toBeGreaterThan(0)
    expect(byId(list(doc, 'goal_options'), 'id')).toEqual(byId(options, 'id'))

    expect(byId(list(doc, 'people'), 'id')).toEqual(
      byId(
        [
          { id: riverside.adminPersonId, full_name: riverside.adminName },
          { id: ruth, full_name: 'Ruth Adeyemi' },
          { id: nia, full_name: 'Nia Okafor' },
        ],
        'id',
      ),
    )
  })

  it('is what the reader derives the page from', async () => {
    const page = intakeFormsPageFrom(await readPageDocument(admin, 'intake_forms_page'))

    expect(page.groups.map((each) => each.name)).toEqual(['Tuesday Women’s Group'])
    expect(page.groups[0]).toMatchObject({
      joinRequiresApproval: true,
      declaredGender: 'female',
      leaderNames: ['Ruth Adeyemi'],
    })
    expect(page.joinRequests.map((each) => each.fullName)).toEqual(['Nia Okafor'])
    expect(page.joinRequests[0]).toMatchObject({ groupName: 'Tuesday Women’s Group' })
    expect(page.goals.length).toBeGreaterThan(0)
    expect(page.nameOf.get(personId(nia))).toBe('Nia Okafor')
    expect(page.nameOf.get(personId(riverside.adminPersonId))).toBe(riverside.adminName)
  })

  it('carries nothing of the Ministry for a Leader who administers nothing', async () => {
    const leader = await addPersonWithAccount(riverside, 'Karen Whitfield', 'leader')

    const doc = await readPageDocument(await signInWith(leader), 'intake_forms_page')

    expect(doc).toEqual({ session: 'not-an-admin', user_id: leader.userId })
  })

  it('refuses a visitor with no session', async () => {
    const { apiUrl, anonKey } = localSupabase()
    const nobody = createClient(apiUrl, anonKey)

    expect((await nobody.rpc('intake_forms_page')).error).not.toBeNull()
  })

  it('answers for the session’s own Ministry and no other', async () => {
    const northgate = await createMinistryWithAdmin('Northgate Community Church')

    const doc = await readPageDocument(await signInAs(northgate), 'intake_forms_page')

    expect(doc.admin).toMatchObject({ ministry_id: northgate.id })
    expect(list(doc, 'groups')).toEqual([])
    expect(list(doc, 'join_requests')).toEqual([])
    expect(list(doc, 'people').map((row) => row.id)).toEqual([northgate.adminPersonId])
    expect(JSON.stringify(doc)).not.toContain(riverside.id)
    expect(JSON.stringify(doc)).not.toContain(group)
  })
})
