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
 * Remove from the Roster, ticket 01 (James, 2026-09-22), driven the way an
 * Admin presses it: the person page is fetched, the form its Remove card offers
 * is posted as it stands, the question it opens on is read, and its one button
 * is posted too. What a removal does to the rows is
 * `removing-a-person-from-the-roster.test.ts`; this is the card, the two
 * presses, the words, and where the Admin lands.
 */

describe.skipIf(skipUnlessAppIsRunning)('Remove, on a person’s page', () => {
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

  /** The form inside the Remove card, pressed as the page offers it. */
  const press = async (html: string) => {
    const card = html.slice(html.indexOf('Remove from the Roster</h2>'))
    const form = card.match(/<form[^>]*action="\/roster\/remove"[^>]*>([\s\S]*?)<\/form>/)
    expect(form, 'the card offers no form').not.toBeNull()
    const hidden = Object.fromEntries(
      [...form![1]!.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]+)"/g)].map((field) => [field[1]!, field[2]!]),
    )
    const response = await fetch(`${baseUrl}/roster/remove`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(hidden),
    })
    expect(response.status).toBe(303)
    return new URL(response.headers.get('location') ?? '', baseUrl)
  }

  const textsInTheMinistry = async () =>
    Number((await pool.query(`select count(*) from outbound_message where ministry_id = $1`, [ministry.id])).rows[0].count)

  it('asks first, then removes, and the Roster says who went', async () => {
    const hannah = await woman('Hannah Brooks')
    const page = await getPage(`/roster/${hannah}`, cookie)
    expect(page.response.status).toBe(200)
    expect(page.html).toContain('Remove from the Roster</h2>')

    // The first press removes nothing: it opens the question.
    const asking = await press(page.html)
    expect(asking.pathname).toBe(`/roster/${hannah}`)
    expect(asking.searchParams.get('removing')).toBe('yes')
    // At the card, which is at the foot of the page.
    expect(asking.hash).toBe('#remove')
    expect((await pool.query(`select 1 from person_removal where person_id = $1`, [hannah])).rowCount).toBe(0)

    const question = await getPage(`${asking.pathname}${asking.search}`, cookie)
    expect(question.html).toContain('Remove Hannah Brooks from the Roster?')
    expect(question.html).toContain('>Yes, remove Hannah Brooks</button>')
    expect(question.html).toContain('>Keep them</a>')
    // In no pairing, so nothing is said about pairings.
    expect(question.html).not.toContain('all current pairings')

    const before = await textsInTheMinistry()
    const landed = await press(question.html)
    expect(landed.pathname).toBe('/roster')
    expect(landed.searchParams.get('removed')).toBe(hannah)
    expect(await textsInTheMinistry()).toBe(before)

    const roster = await getPage(`${landed.pathname}${landed.search}`, cookie)
    expect(roster.html).toContain('Hannah Brooks has been removed')
    expect(roster.html).not.toContain(`href="/roster/${hannah}"`)
    // And their page is gone with them.
    expect((await getPage(`/roster/${hannah}`, cookie)).response.status).toBe(404)
  })

  it('says, in James’s words, what happens to their pairings, and does it', async () => {
    const grace = await woman('Grace Lee')
    const emily = await woman('Emily Davis')
    const pairing = await pairOneToOne(ministry, grace, emily)

    const asking = await press((await getPage(`/roster/${emily}`, cookie)).html)
    const question = await getPage(`${asking.pathname}${asking.search}`, cookie)
    expect(question.html).toContain(
      'This will remove them from all current pairings and take any one-on-one pairings back to unpaired.',
    )

    const landed = await press(question.html)
    expect(landed.searchParams.get('removed')).toBe(emily)

    const { rows } = await pool.query(`select ended_outcome from relationship where id = $1`, [pairing])
    expect(rows).toEqual([{ ended_outcome: 'discontinued' }])
    expect((await getPage(`/roster/${grace}`, cookie)).html).toContain('Ready to Pair')
  })

  it('says what happens to each group they are in, and does it', async () => {
    const table = await formGroup(ministry, {
      name: 'Thursday Table',
      declaredGender: 'female',
      leader: { name: 'Ruth Adeyemi', gender: 'female' },
      disciples: ['Mia Chen', 'Zoe Park'].map((name) => ({ name, gender: 'female' as const })),
    })

    // A Disciple leaving: the group goes on.
    const mias = await press((await getPage(`/roster/${table.disciples[0]}`, cookie)).html)
    expect((await getPage(`${mias.pathname}${mias.search}`, cookie)).html).toContain(
      'Thursday Table goes on without them.',
    )

    // Its only Discipler: the group ends, and says for whom.
    const asking = await press((await getPage(`/roster/${table.leader}`, cookie)).html)
    const question = await getPage(`${asking.pathname}${asking.search}`, cookie)
    expect(question.html).toContain('Thursday Table ends, and Mia Chen and Zoe Park go back to unpaired.')

    await press(question.html)
    const { rows } = await pool.query(`select ended_at is not null as ended from relationship where id = $1`, [table.id])
    expect(rows).toEqual([{ ended: true }])
  })

  it('lands both on the Roster when two presses remove the same person at once', async () => {
    const grace = await woman('Grace Lee')
    const emily = await woman('Emily Davis')
    await pairOneToOne(ministry, grace, emily)

    const asking = await press((await getPage(`/roster/${emily}`, cookie)).html)
    const question = (await getPage(`${asking.pathname}${asking.search}`, cookie)).html

    // Whichever loses finds its pairing already ended, and them already gone.
    const landed = await Promise.all([press(question), press(question)])
    expect(landed.map((each) => each.pathname)).toEqual(['/roster', '/roster'])
    expect(landed.filter((each) => each.searchParams.get('removed') === emily)).toHaveLength(1)
    expect((await pool.query(`select 1 from person_removal where person_id = $1`, [emily])).rowCount).toBe(1)
  })

  it('offers no card on an Admin’s page, their own included', async () => {
    const own = await getPage(`/roster/${ministry.adminPersonId}`, cookie)
    expect(own.response.status).toBe(200)
    expect(own.html).not.toContain('Remove from the Roster</h2>')
  })

  it('refuses an Admin even from a form composed by hand', async () => {
    const response = await fetch(`${baseUrl}/roster/remove`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ personId: ministry.adminPersonId, confirm: 'yes' }),
    })
    expect(response.status).toBe(303)
    const location = new URL(response.headers.get('location') ?? '', baseUrl)
    expect(location.searchParams.get('remove')).toBe('removal.person_is_an_admin')
    expect((await getPage(`${location.pathname}${location.search}`, cookie)).html).toContain(
      'An Admin is not removed from the Roster, so nothing was done.',
    )
  })
})
