import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { readCareNeeded } from '~/platform/supabase/care-needed-reader'
import { readThisWeeksCheckIns } from '~/platform/supabase/check-ins-reader'
import { readOverview } from '~/platform/supabase/overview-reader'
import { rosterFrom } from '~/platform/supabase/roster-reader'
import { supabaseAccounts } from '~/platform/supabase/accounts'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  signInAs,
  signInWith,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'
import { asDocument, asRows } from '../support/page-document'

/**
 * A page is one read. Each Admin tab has one SQL function that answers the whole
 * page in one document: who is signed in, whether the session is still held, and
 * every row the tab derives from. These prove the document says what the separate
 * reads it replaced said, and that it says nothing to anyone the reads would have
 * refused.
 */

const TABS = [
  'overview_page',
  'check_ins_page',
  'suggested_pairs_page',
  'follow_up_page',
  'roster_page',
] as const

describe('the Admin tabs answer in one read', () => {
  let ministry: MinistryFixture
  let other: MinistryFixture
  let leader: AccountFixture
  let participant: AccountFixture
  let relationship: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('One Read Chapel')
    other = await createMinistryWithAdmin('The Chapel Next Door')
    leader = await addPersonWithAccount(ministry, 'Lee Leader', 'leader')
    participant = await addPersonWithAccount(ministry, 'Pat Participant', 'leader')
    relationship = await pairOneToOne(ministry, leader.personId, participant.personId)
  })

  afterAll(async () => {})

  it('names the Admin and their Ministry at the top of every tab', async () => {
    const admin = await signInAs(ministry)

    for (const tab of TABS) {
      const { data, error } = await admin.rpc(tab)
      expect(error, tab).toBeNull()

      const doc = asDocument(data)
      expect(doc.session, tab).toBe('admin')
      expect(doc.user_id, tab).toBe(ministry.adminUserId)
      expect(doc.admin, tab).toEqual({
        ministry_id: ministry.id,
        ministry_name: ministry.name,
        person_id: ministry.adminPersonId,
      })
    }
  })

  it('carries the history the Overview derives from, row for row with the reads it replaced', async () => {
    const admin = await signInAs(ministry)
    const doc = asDocument((await admin.rpc('overview_page')).data)
    const history = asDocument(doc.history)

    expect(history.timezone).toBe('UTC')

    const relationships = asRows(history.relationships)
    expect(relationships.map((row) => row.id)).toEqual([relationship])
    expect(Object.keys(relationships[0]!).sort()).toEqual(['accepted_at', 'created_at', 'ended_at', 'id'])

    // The same rows the separate reads gave, so the derivations see exactly what
    // they saw before the page became one read.
    const members = await admin
      .from('relationship_member')
      // Each membership's own acceptance rides along: who counts as leading a
      // running relationship is derived from it (Manual pairing, ticket 22).
      .select('relationship_id, person_id, role, accepted_at')
      .eq('ministry_id', ministry.id)
      .is('ended_at', null)
    expect(asRows(history.members)).toEqual(expect.arrayContaining(asRows(members.data)))
    expect(asRows(history.members)).toHaveLength(asRows(members.data).length)

    const weeks = await admin.rpc('relationship_weeks', { target_ministry_id: ministry.id })
    expect(history.weeks).toEqual(weeks.data)
    const answers = await admin.rpc('relationship_week_answers', { target_ministry_id: ministry.id })
    expect(history.answers).toEqual(answers.data)
    const pauses = await admin.rpc('relationship_pauses', { target_ministry_id: ministry.id })
    expect(history.pauses).toEqual(pauses.data)

    expect(history.concerns).toEqual([])
    expect(history.follow_ups).toEqual([])

    // Everyone the rows point at, by name, as the `person` policies let the Admin
    // name them.
    expect(asRows(history.people).map((row) => row.full_name).sort()).toEqual([
      'Lee Leader',
      'Pat Participant',
    ])
  })

  it('serves the Check-Ins and Suggested Pairs tabs from the same history', async () => {
    const admin = await signInAs(ministry)
    const overview = asDocument((await admin.rpc('overview_page')).data)

    for (const tab of ['check_ins_page', 'suggested_pairs_page'] as const) {
      const doc = asDocument((await admin.rpc(tab)).data)
      expect(doc.history, tab).toEqual(overview.history)
    }
  })

  it('carries the one number a reveal answers, through the consent check', async () => {
    const admin = await signInAs(ministry)

    const plain = asDocument((await admin.rpc('follow_up_page')).data)
    expect(plain.reveal).toBeNull()

    const revealed = asDocument(
      (await admin.rpc('follow_up_page', { reveal_person_id: participant.personId })).data,
    )
    const direct = await admin.rpc('contact_to_share', {
      target_ministry_id: ministry.id,
      target_person_id: participant.personId,
    })
    expect(revealed.reveal).toEqual(asRows(direct.data)[0] ?? null)
    expect(asDocument(revealed.reveal).full_name).toBe('Pat Participant')
  })

  it('carries the Roster, its relationships, the plans and the held rows as their functions give them', async () => {
    const admin = await signInAs(ministry)
    const doc = asDocument((await admin.rpc('roster_page')).data)
    const roster = asDocument(doc.roster)

    const rows = await admin.rpc('roster', { target_ministry_id: ministry.id })
    expect(roster.rows).toEqual(rows.data)

    const members = await admin
      .from('relationship_member')
      // Each membership's own acceptance rides along (Manual pairing, ticket 22).
      .select('person_id, relationship_id, role, accepted_at')
      .eq('ministry_id', ministry.id)
      .is('ended_at', null)
    expect(asRows(roster.members)).toEqual(expect.arrayContaining(asRows(members.data)))

    // The relationships the memberships name, and only those, with the one column
    // the Roster derives Awaiting Leader Acceptance from.
    expect(asRows(roster.relationships)).toEqual([{ id: relationship, accepted_at: expect.any(String) }])

    const planned = await admin.rpc('intended_pairings', { target_ministry_id: ministry.id })
    expect(roster.intended_pairings).toEqual(planned.data)
    const held = await admin.rpc('held_import_rows', { target_ministry_id: ministry.id })
    expect(roster.held_import_rows).toEqual(held.data)

    // And the derivation over it says what the Roster said: three people, one of
    // them leading the other.
    const entries = rosterFrom(doc)
    expect(entries.map((entry) => entry.fullName)).toEqual(
      ['Admin of One Read Chapel', 'Lee Leader', 'Pat Participant'],
    )
    const lee = entries.find((entry) => entry.fullName === 'Lee Leader')!
    expect(lee.relationships).toEqual([
      expect.objectContaining({ role: 'leader', withNames: ['Pat Participant'], awaitingAcceptance: false }),
    ])
  })

  it('derives the tabs the readers derived, through a real session', async () => {
    const admin = await signInAs(ministry)
    const clock = createTestClock(new Date('2026-09-11T12:00:00Z'))

    const overview = await readOverview(admin, ministry.id, clock)
    expect(overview.relationships).toEqual([
      expect.objectContaining({ leaderNames: ['Lee Leader'], participantNames: ['Pat Participant'] }),
    ])
    expect(overview.active).toBe(1)

    // Healthy, accepted this week: nothing to act on, and the week is the
    // Ministry's own.
    expect(await readCareNeeded(admin, ministry.id, clock)).toEqual([])
    expect((await readThisWeeksCheckIns(admin, ministry.id, clock)).week).toBe('2026-W37')
  })

  it('tells a Leader who administers nothing so, and hands them no Ministry', async () => {
    const lead = await signInWith(leader)

    for (const tab of TABS) {
      const { data, error } = await lead.rpc(tab)
      expect(error, tab).toBeNull()
      const doc = asDocument(data)
      expect(doc.session, tab).toBe('not-an-admin')
      expect(doc.user_id, tab).toBe(leader.userId)
      expect(doc, tab).not.toHaveProperty('history')
      expect(doc, tab).not.toHaveProperty('roster')
      expect(doc, tab).not.toHaveProperty('admin')
    }
  })

  it('answers signed-out to a token whose session has been ended', async () => {
    const stranded = await addPersonWithAccount(ministry, 'Sam Stranded', 'leader')
    const held = await signInWith(stranded)
    expect(asDocument((await held.rpc('overview_page')).data).session).toBe('not-an-admin')

    // A reset ends every session on the account (ADR-0016). The token is unchanged
    // and still verifies, so this verdict is the whole of how a page refuses it.
    await supabaseAccounts.setPassword(stranded.userId, 'harbinger-lantern-copper-fern')

    for (const tab of TABS) {
      const doc = asDocument((await held.rpc(tab)).data)
      expect(doc, tab).toEqual({ session: 'signed-out' })
    }
  })

  it('answers nobody without a session', async () => {
    const { apiUrl, anonKey } = localSupabase()
    const nobody = createClient(apiUrl, anonKey)

    for (const tab of TABS) {
      expect((await nobody.rpc(tab)).error, tab).not.toBeNull()
    }
  })

  it('shows an Admin of another Ministry none of this one', async () => {
    const neighbour = await signInAs(other)
    const doc = asDocument((await neighbour.rpc('overview_page')).data)
    expect(asDocument(doc.admin).ministry_id).toBe(other.id)
    expect(asDocument(doc.history).relationships).toEqual([])
    expect(asDocument(doc.history).people).toEqual([])

    const roster = asDocument(asDocument((await neighbour.rpc('roster_page')).data).roster)
    expect(asRows(roster.rows).map((row) => row.full_name)).toEqual(['Admin of The Chapel Next Door'])

    // And a reader asked about a Ministry the session does not administer reads
    // the empty state the policies would have returned.
    const clock = createTestClock(new Date('2026-09-11T12:00:00Z'))
    expect((await readOverview(neighbour, ministry.id, clock)).relationships).toEqual([])
    expect(await readCareNeeded(neighbour, ministry.id, clock)).toEqual([])
  })
})
