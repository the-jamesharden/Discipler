import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addPerson,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Manual pairing, ticket 21. One Discipler and several Disciples posted to the
 * pairing route as `mode=separate`: a one-to-one with each, all of them or none.
 *
 * No screen has a control for the mode yet, so it is posted directly, as a Material
 * was before the form had one. What is proved is what the route does with it, which
 * is what the popup's N x 1:1 segment will land on.
 */

describe.skipIf(skipUnlessAppIsRunning)('separate one-to-ones in one submission, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string

  beforeAll(async () => {
    // A new Ministry enforces the gender match: `suggest_gender_match` defaults on.
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  const woman = (fullName: string) =>
    addPerson(ministry, fullName, { phone: aTestPhoneNumber(), answers: { gender: 'female' } })
  const man = (fullName: string) =>
    addPerson(ministry, fullName, { phone: aTestPhoneNumber(), answers: { gender: 'male' } })

  const pairSeparately = async (
    leaders: string[],
    participants: string[],
    extra: Record<string, string> = {},
  ) => {
    const body = new URLSearchParams({ mode: 'separate', ...extra })
    for (const leader of leaders) body.append('leaderId', leader)
    for (const participant of participants) body.append('participantId', participant)

    const response = await fetch(`${baseUrl}/roster/pair/create`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body,
    })
    return { response, back: new URL(response.headers.get('location') ?? '', baseUrl) }
  }

  const relationshipsHolding = async (people: string[]) => {
    const { rows } = await pool.query<{
      id: string
      kind: string
      name: string | null
      declared_gender: string | null
      accepted_at: Date | null
      members: string[]
    }>(
      `select r.id, r.kind, r.name, r.declared_gender, r.accepted_at,
              array_agg(m.person_id::text order by m.person_id) as members
         from relationship r
         join relationship_member m on m.relationship_id = r.id
        where r.id in (select relationship_id from relationship_member where person_id = any($1::uuid[]))
        group by r.id
        order by r.id`,
      [people],
    )
    return rows
  }

  const rowOf = (html: string, name: string) =>
    (html.split('<tr').find((row) => new RegExp(`roster-name"[^>]*>${name}<`).test(row)) ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')

  it('forms a one-to-one with each Disciple, each awaiting acceptance and on both Roster rows', async () => {
    const claire = await woman('Claire Martinez')
    const sam = await woman('Sam Lee')
    const ana = await woman('Ana Ruiz')
    const ruth = await woman('Ruth Okafor')

    // A name and a declaration ride along, as a form that asks them of every shape
    // would send them. Neither belongs to a one-to-one, and a one-to-one handed a
    // declaration is held to it, so both are dropped rather than applied to each.
    const { response, back } = await pairSeparately([claire], [sam, ana, ruth], {
      name: 'The Tuesday Group',
      declaredGender: 'male',
    })

    expect(response.status).toBe(303)
    expect(back.pathname).toBe('/roster')
    // The receipt counts what was formed: three one-to-ones, not a group of three.
    expect(back.searchParams.get('pairs')).toBe('3')
    expect(back.searchParams.get('paired')).toBeNull()

    const formed = await relationshipsHolding([sam, ana, ruth])
    expect(formed).toHaveLength(3)
    for (const relationship of formed) {
      expect(relationship.kind).toBe('one_to_one')
      expect(relationship.accepted_at).toBeNull()
      expect(relationship.name).toBeNull()
      expect(relationship.declared_gender).toBeNull()
      expect(relationship.members).toHaveLength(2)
      expect(relationship.members).toContain(claire)
    }
    expect(formed.flatMap((each) => each.members.filter((id) => id !== claire)).sort()).toEqual(
      [sam, ana, ruth].sort(),
    )

    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    expect(html).toContain('3 one-to-ones are paired.')
    expect(html).not.toContain('A group of 3 is paired.')
    for (const disciple of ['Sam Lee', 'Ana Ruiz', 'Ruth Okafor']) {
      expect(rowOf(html, disciple)).toContain('Claire Martinez 1:1 - awaiting acceptance')
      expect(rowOf(html, 'Claire Martinez')).toContain(`${disciple} 1:1 - awaiting acceptance`)
    }
  })

  it('forms none where one Disciple is of another gender, and names that person', async () => {
    const claire = await woman('Claire Refused')
    const sam = await woman('Sam Refused')
    const andrew = await man('Andrew Refused')
    const ruth = await woman('Ruth Refused')

    const { response, back } = await pairSeparately([claire], [sam, andrew, ruth], {
      name: 'The Tuesday Group',
    })

    expect(response.status).toBe(303)
    // Back where it was submitted from, with the whole selection and the mode.
    expect(back.pathname).toBe('/roster/pair')
    expect(back.searchParams.get('error')).toBe('relationship.gender_must_match')
    expect(back.searchParams.get('about')).toBe(andrew)
    expect(back.searchParams.get('mode')).toBe('separate')
    expect(back.searchParams.getAll('leaderId')).toEqual([claire])
    expect(back.searchParams.getAll('with')).toEqual([sam, andrew, ruth])
    expect(back.searchParams.get('name')).toBe('The Tuesday Group')

    // Sam was checked before Andrew and passed, and still holds nothing.
    expect(await relationshipsHolding([claire, sam, andrew, ruth])).toEqual([])
    const { rows: queued } = await pool.query(
      `select 1 from outbound_message where person_id = any($1::uuid[])`,
      [[claire, sam, andrew, ruth]],
    )
    expect(queued).toEqual([])

    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    expect(html).toContain('Andrew Refused: A one-to-one must be between two people of the same gender.')
    expect(html).toContain('None of these one-to-ones was made.')
    // Submitting the corrected form is still a separate submission.
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="mode"[^>]*value="separate"/)
  })

  it('is refused with one Disciple, which is a one-to-one and needs no mode', async () => {
    const claire = await woman('Claire Alone')
    const sam = await woman('Sam Alone')

    const { back } = await pairSeparately([claire], [sam])

    expect(back.pathname).toBe('/roster/pair')
    expect(back.searchParams.get('error')).toBe(
      'relationship.separate_needs_one_leader_and_several_participants',
    )
    expect(back.searchParams.get('about')).toBeNull()
    expect(back.searchParams.get('mode')).toBe('separate')
    expect(await relationshipsHolding([claire, sam])).toEqual([])

    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    expect(html).toContain('Pairing separately needs one Discipler and two or more people')
  })

  it('is refused with two Disciplers, since nobody said who goes with whom', async () => {
    const claire = await woman('Claire Shared')
    const dana = await woman('Dana Shared')
    const sam = await woman('Sam Shared')
    const ana = await woman('Ana Shared')

    const { back } = await pairSeparately([claire, dana], [sam, ana])

    expect(back.pathname).toBe('/roster/pair')
    expect(back.searchParams.get('error')).toBe(
      'relationship.separate_needs_one_leader_and_several_participants',
    )
    expect(back.searchParams.getAll('leaderId')).toEqual([claire, dana])
    expect(await relationshipsHolding([claire, dana, sam, ana])).toEqual([])
  })

  it('reads a mode it does not know as together, which is what pairing has always done', async () => {
    const claire = await woman('Claire Together')
    const sam = await woman('Sam Together')
    const ana = await woman('Ana Together')

    const { back } = await pairSeparately([claire], [sam, ana], {
      mode: 'apart',
      name: 'The Thursday Group',
      declaredGender: 'female',
    })

    expect(back.pathname).toBe('/roster')
    expect(back.searchParams.get('paired')).toBe('2')
    const formed = await relationshipsHolding([sam, ana])
    expect(formed).toHaveLength(1)
    expect(formed[0]?.kind).toBe('group')
    expect(formed[0]?.name).toBe('The Thursday Group')
  })

  it('says how many were made and who was not, on the Roster a set stopped partway lands on', async () => {
    // A set that passed its check and was stopped partway cannot be arranged over
    // HTTP without a second Admin racing the first, so what is proved here is the
    // receipt the route redirects to. The count and the stop are proved in
    // `tests/domain/separate-one-to-ones.test.ts`.
    const ana = await woman('Ana Partway')
    const ruth = await woman('Ruth Partway')
    const query = new URLSearchParams({
      pairs: '2',
      pairError: 'relationship.participant_has_opted_out',
    })
    query.append('notPaired', ana)
    query.append('notPaired', ruth)
    // Somebody this Ministry does not hold is whatever was typed, and names nobody.
    query.append('notPaired', crypto.randomUUID())

    const { html } = await getPage(`/roster?${query}`, cookie)

    expect(html).toContain('Only 2 of 4 one-to-ones were made.')
    expect(html).toContain('Ana Partway and Ruth Partway were not paired.')
    expect(html).toContain('Ana Partway: Somebody selected has opted out, and cannot be paired.')
    expect(html).not.toContain('one-to-ones are paired.')
  })
})
