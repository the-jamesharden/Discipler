import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addMaterial,
  addPerson,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * A Material chosen at pairing, the way an Admin and a Leader meet it: the Pair
 * route is posted a Material with the people, the Leader accepts on their own
 * link, and the Materials tab then files the group under that Material.
 *
 * There is no control for it on the Pair page yet, so the field is posted
 * directly. What is proven is that the route carries it, which is what the form
 * will land on.
 */

describe.skipIf(skipUnlessAppIsRunning)('a Material chosen at pairing, over HTTP', () => {
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

  const roster = (fullName: string) => addPerson(ministry, fullName, { phone: aTestPhoneNumber() })

  const pairAGroup = async (leader: string, participants: string[], material: string) => {
    const body = new URLSearchParams({ leaderId: leader, declaredGender: 'mixed', name: 'The Tuesday Group' })
    for (const participant of participants) body.append('participantId', participant)
    body.append('materialId', material)

    const response = await fetch(`${baseUrl}/roster/pair/create`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body,
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  const acceptAs = async (leader: string, fullName: string) => {
    const { rows } = await pool.query<{ token: string }>(
      `select token from invitation where person_id = $1 and consumed_at is null`,
      [leader],
    )
    const token = rows[0]?.token
    if (!token) throw new Error('no live invitation was issued')

    const response = await fetch(`${baseUrl}/invitation/${token}/accept`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ fullName, password: 'a-long-enough-password' }),
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  it('files the group under the chosen Material once its Leader accepts, with nothing before it', async () => {
    const romans = await addMaterial(ministry, 'Romans')
    const david = await roster('David Ellis')
    const emily = await roster('Emily Johnson')
    const ada = await roster('Ada Lovelace')

    const paired = await pairAGroup(david, [emily, ada], romans)
    expect(paired.response.status).toBe(303)
    expect(paired.location).toContain('/roster?paired=2')

    // Formed and not accepted: nobody is working through anything yet.
    const before = await getPage(`/materials/${romans}`, cookie)
    expect(before.html).not.toContain('The Tuesday Group')

    const accepted = await acceptAs(david, 'David Ellis')
    expect(accepted.response.status).toBe(303)
    expect(accepted.location).toContain('done=accepted')

    const folder = await getPage(`/materials/${romans}`, cookie)
    expect(folder.response.status).toBe(200)
    expect(folder.html).toContain('1 relationship working through it now')
    expect(folder.html).toContain('The Tuesday Group')
    // Since the day it was accepted, because that is the instant it was assigned.
    expect(folder.html).toMatch(/Group · since \d{1,2} \w{3} \d{4}/)
    // The opening period closed at its own start, so it covers nothing and there
    // is no earlier stretch for the card to speak of.
    expect(folder.html).not.toContain('Previously:')

    // And it is not also filed under *no Material*.
    const none = await getPage('/materials/none', cookie)
    expect(none.html).not.toContain('The Tuesday Group')
  })

  it('sends the Admin back to the form, selection and Material intact, where the Material is off the list', async () => {
    const david = await roster('David Refused')
    const emily = await roster('Emily Refused')
    const ada = await roster('Ada Refused')
    const nothingHere = crypto.randomUUID()

    const { response, location } = await pairAGroup(david, [emily, ada], nothingHere)

    expect(response.status).toBe(303)
    const back = new URL(location, baseUrl)
    expect(back.pathname).toBe('/roster/pair')
    expect(back.searchParams.get('error')).toBe('relationship.material_is_not_on_the_list')
    expect(back.searchParams.get('materialId')).toBe(nothingHere)
    expect(back.searchParams.getAll('with')).toEqual([emily, ada])

    // The sentence an Admin reads, rather than the generic one.
    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    expect(html).toContain('That Material is no longer on this Ministry’s list.')

    const { rows } = await pool.query(
      `select 1 from relationship_member where person_id = any($1::uuid[])`,
      [[david, emily, ada]],
    )
    expect(rows).toEqual([])
  })
})
