import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  aTestPhoneNumber,
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Unpair, on a person's page, driven the way an Admin presses it (James,
 * 2026-09-21): the page is fetched, the form it offers beside a pairing is posted
 * as it stands, and the database is read for what happened. Which act a line gets
 * is `tests/app/unpairing.test.ts`'s; this is that the button is there, that each
 * act lands, and that nobody is sent anything.
 */

describe.skipIf(skipUnlessAppIsRunning)('Unpair, on a person’s page', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  const woman = (name: string) =>
    addPerson(ministry, name, { phone: aTestPhoneNumber(), answers: { gender: 'female' } })

  /** The Pairings card's line about one pairing, as markup: from its `<li` to the next. */
  const lineAbout = async (person: string, relationship: string) => {
    const { response, html } = await getPage(`/roster/${person}`, cookie)
    expect(response.status).toBe(200)
    return html.split('<li').find((candidate) => candidate.includes(`value="${relationship}"`)) ?? ''
  }

  /** Pressed as the page offers it: the Unpair form's own hidden fields, and the button pressed. */
  const pressUnpair = async (line: string, pressed: Record<string, string> = {}) => {
    const offered = line.match(/<form[^>]*action="\/roster\/unpair"[^>]*>([\s\S]*?)<\/form>/)
    expect(offered, 'the line offers no Unpair').not.toBeNull()
    const hidden = Object.fromEntries(
      [...offered![1]!.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]+)"/g)].map((field) => [field[1]!, field[2]!]),
    )
    const response = await fetch(`${baseUrl}/roster/unpair`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...hidden, ...pressed }),
    })
    expect(response.status).toBe(303)
    return response.headers.get('location') ?? ''
  }

  const relationshipRow = async (id: string) =>
    (
      await pool.query<{ ended: boolean; outcome: string | null; reason: string | null; by: string | null }>(
        `select ended_at is not null as ended, ended_outcome as outcome, ended_reason as reason, ended_by as by
           from relationship where id = $1`,
        [id],
      )
    ).rows[0]!

  const openMembers = async (id: string) =>
    (
      await pool.query<{ person_id: string }>(
        `select person_id from relationship_member where relationship_id = $1 and ended_at is null`,
        [id],
      )
    ).rows.map((row) => row.person_id)

  const textsInTheMinistry = async () =>
    Number((await pool.query(`select count(*) from outbound_message where ministry_id = $1`, [ministry.id])).rows[0].count)

  it('ends a one-to-one that has started, asking how it ended and nothing else', async () => {
    const grace = await woman('Grace Lee')
    const emily = await woman('Emily Davis')
    const pairing = await pairOneToOne(ministry, grace, emily)
    const before = await textsInTheMinistry()

    // The same pairing from either page, and the question names them both.
    const onHers = await lineAbout(emily, pairing)
    expect(onHers).toContain('Unpair Emily Davis and Grace Lee?')
    const line = await lineAbout(grace, pairing)
    expect(line).toContain('>Unpair</summary>')
    expect(line).toContain('Unpair Grace Lee and Emily Davis?')
    expect(line).toContain('>It finished well</button>')
    expect(line).toContain('>It did not run its course</button>')
    // The reason is hers to give or not.
    expect(line).not.toMatch(/<textarea[^>]*required/)

    const location = await pressUnpair(line, { outcome: 'completed', reason: '' })
    expect(location).toContain(`/roster/${grace}?unpair=ended`)

    expect(await relationshipRow(pairing)).toEqual({
      ended: true,
      outcome: 'completed',
      reason: 'Unpaired from the Roster.',
      by: ministry.adminUserId,
    })
    expect(await openMembers(pairing)).toEqual([])
    // Nobody is sent anything.
    expect(await textsInTheMinistry()).toBe(before)

    const after = await getPage(`/roster/${grace}?unpair=ended`, cookie)
    expect(after.html).toContain('Unpaired. The history is kept, and nobody was sent anything.')
    expect(after.html).not.toContain(`value="${pairing}"`)
    // And her Disciple is ready to pair again.
    expect((await getPage(`/roster/${emily}`, cookie)).html).toContain('Ready to Pair')
  })

  it('records the reason an Admin wrote, and that it did not run its course', async () => {
    const pairing = await pairOneToOne(ministry, await woman('Ruth Bader'), await woman('Nora Kim'))
    const [anybody] = await openMembers(pairing)

    await pressUnpair(await lineAbout(anybody!, pairing), { outcome: 'discontinued', reason: '  Nora moved away.  ' })

    expect(await relationshipRow(pairing)).toMatchObject({ ended: true, outcome: 'discontinued', reason: 'Nora moved away.' })
  })

  it('ends nothing without one of the two answers', async () => {
    const grace = await woman('Hannah Cole')
    const pairing = await pairOneToOne(ministry, grace, await woman('Lily Tran'))

    const location = await pressUnpair(await lineAbout(grace, pairing))
    expect(location).toContain('unpair=refused')
    expect((await relationshipRow(pairing)).ended).toBe(false)
    expect((await getPage(`/roster/${grace}?unpair=refused`, cookie)).html).toContain('nothing was done')
  })

  it('cancels a one-to-one nobody has accepted in one press', async () => {
    const grace = await woman('Esther Cole')
    const pairing = await pairOneToOne(ministry, grace, await woman('Sam Lee'), { acceptedAt: null })

    const line = await lineAbout(grace, pairing)
    // One press: a plain button, and no question behind it.
    expect(line).toContain('>Unpair</button>')
    expect(line).not.toContain('<summary')
    // Beside the act that was already there.
    expect(line).toContain('Send a new invitation')

    expect(await pressUnpair(line)).toContain(`/roster/${grace}?unpair=cancelled`)
    expect(await relationshipRow(pairing)).toMatchObject({ ended: true, reason: 'cancelled' })
    expect(await openMembers(pairing)).toEqual([])
  })

  it('takes one Disciple out of a group that goes on, and ends the group from its Discipler’s page', async () => {
    const group = await formGroup(ministry, {
      name: 'Thursday Table',
      declaredGender: 'female',
      leader: { name: 'Miriam Hart', phone: aTestPhoneNumber(), gender: 'female' },
      disciples: ['Mia Chen', 'Zoe Park', 'Ana Ruiz'].map((name) => ({ name, phone: aTestPhoneNumber(), gender: 'female' as const })),
    })
    const [mia, zoe, ana] = group.disciples
    const before = await textsInTheMinistry()

    const hers = await lineAbout(mia!, group.id)
    expect(hers).toContain('>Unpair</button>')
    expect(await pressUnpair(hers)).toContain(`/roster/${mia}?unpair=left`)

    expect((await relationshipRow(group.id)).ended).toBe(false)
    expect((await openMembers(group.id)).sort()).toEqual([group.leader, zoe!, ana!].sort())

    // From the Discipler who leads it, it is everybody's, and the question says whose.
    const leaders = await lineAbout(group.leader, group.id)
    expect(leaders).toContain('Unpair Miriam Hart from this group? It ends for')
    expect(leaders).toContain('Zoe Park')
    expect(leaders).toContain('Ana Ruiz')
    expect(leaders).not.toContain('Mia Chen')
    expect(await pressUnpair(leaders, { outcome: 'discontinued' })).toContain(`/roster/${group.leader}?unpair=ended`)

    expect(await relationshipRow(group.id)).toMatchObject({ ended: true, outcome: 'discontinued' })
    expect(await openMembers(group.id)).toEqual([])
    expect(await textsInTheMinistry()).toBe(before)
  })

  it('does nothing for somebody with no session', async () => {
    const grace = await woman('Judith Owen')
    const pairing = await pairOneToOne(ministry, grace, await woman('Tess Ward'))

    const response = await fetch(`${baseUrl}/roster/unpair`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ relationshipId: pairing, personId: grace, outcome: 'completed' }),
    })
    expect(response.headers.get('location')).toContain('/login')
    expect((await relationshipRow(pairing)).ended).toBe(false)
  })

  it('does nothing about another Ministry’s pairing', async () => {
    const other = await createMinistryWithAdmin('Hillside Church')
    const theirs = await pairOneToOne(
      other,
      await addPerson(other, 'Olive Reed', { phone: aTestPhoneNumber() }),
      await addPerson(other, 'Pia Stone', { phone: aTestPhoneNumber() }),
    )
    const [olive] = await openMembers(theirs)

    const response = await fetch(`${baseUrl}/roster/unpair`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ relationshipId: theirs, personId: olive!, outcome: 'completed' }),
    })
    expect(response.status).toBe(303)
    expect((await relationshipRow(theirs)).ended).toBe(false)
  })
})
