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
import { offersToMentor, postPairing } from '../support/pair-popup'

/**
 * Manual pairing, recut ticket 02. A set of separate one-to-ones where each
 * Disciple carries their own Material, posted to the pairing route as
 * `materialId.<personId>`: each one-to-one holds the Material named for its own
 * Disciple as an intention, and its acceptance writes it into that one-to-one's
 * history, as a Material chosen at pairing already is for one relationship.
 *
 * Posted as the Pair popup's N × 1:1 pairs post from its Discipler's side, so a
 * refusal comes back to the popup (Manual pairing, recut ticket 05).
 */

describe.skipIf(skipUnlessAppIsRunning)('a Material per Disciple in a separate submission, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel, A Material Each')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  const woman = (fullName: string) =>
    addPerson(ministry, fullName, { phone: aTestPhoneNumber(), answers: { gender: 'female' } })

  const pairSeparately = (leader: string, participants: string[], more: [string, string][] = []) =>
    postPairing(cookie, [
      ['pair', leader],
      ['mode', 'separate'],
      ['leaderId', leader],
      ...participants.map((participant): [string, string] => ['participantId', participant]),
      ...more,
    ])

  /** Each Disciple's open one-to-one: what it still intends, and the Materials its history holds, in order. */
  const oneToOneOf = async (disciple: string) => {
    const { rows } = await pool.query<{ id: string; intended: string | null; history: (string | null)[] }>(
      `select r.id,
              r.intended_material_id as intended,
              coalesce(
                (select array_agg(a.material_id order by a.started_at, a.material_id nulls first)
                   from material_assignment a where a.relationship_id = r.id),
                '{}'
              ) as history
         from relationship r
         join relationship_member m on m.relationship_id = r.id
        where m.person_id = $1 and m.role = 'participant' and m.ended_at is null`,
      [disciple],
    )
    return rows
  }

  const acceptEveryInvitationOf = async (leader: string, fullName: string) => {
    const { rows } = await pool.query<{ token: string }>(
      `select token from invitation where person_id = $1 and consumed_at is null order by token`,
      [leader],
    )
    for (const { token } of rows) {
      const response = await fetch(`${baseUrl}/invitation/${token}/accept`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ fullName, password: 'a-long-enough-password' }),
      })
      expect(response.headers.get('location')).toContain('done=accepted')
    }
    return rows.length
  }

  it('holds a different Material on each one-to-one, and acceptance writes each into its own history', async () => {
    const mark = await addMaterial(ministry, 'Gospel of Mark')
    const romans = await addMaterial(ministry, 'Romans')
    const claire = await woman('Claire Martinez')
    const sam = await woman('Sam Lee')
    const ana = await woman('Ana Ruiz')
    const ruth = await woman('Ruth Okafor')
    const bystander = await woman('Beth Bystander')

    const receipt = await pairSeparately(claire, [sam, ana, ruth], [
      [`materialId.${sam}`, mark],
      [`materialId.${ana}`, romans],
      // Named for somebody who is not among the Disciples: ignored, not refused.
      [`materialId.${bystander}`, romans],
      // The one Material a single relationship takes is not theirs.
      ['materialId', romans],
    ])
    expect(receipt.pathname).toBe('/roster')
    expect(Object.fromEntries(receipt.searchParams)).toEqual({ pairs: '3' })

    // Held as an intention, one apiece, and none where none was named: one
    // Disciple's choice never spills onto another.
    expect((await oneToOneOf(sam)).map(({ intended }) => intended)).toEqual([mark])
    expect((await oneToOneOf(ana)).map(({ intended }) => intended)).toEqual([romans])
    expect((await oneToOneOf(ruth)).map(({ intended }) => intended)).toEqual([null])
    expect(await oneToOneOf(bystander)).toEqual([])

    expect(await acceptEveryInvitationOf(claire, 'Claire Martinez')).toBe(3)

    // Spent at acceptance: the opening period and then that Disciple's Material,
    // and the opening period alone where there was none.
    expect((await oneToOneOf(sam))[0]).toMatchObject({ intended: null, history: [null, mark] })
    expect((await oneToOneOf(ana))[0]).toMatchObject({ intended: null, history: [null, romans] })
    expect((await oneToOneOf(ruth))[0]).toMatchObject({ intended: null, history: [null] })
  })

  it('refuses the whole set for a Material the Ministry does not hold, names who it was for, and returns every choice', async () => {
    const mark = await addMaterial(ministry, 'Gospel of Mark, Again')
    const claire = await woman('Claire Refused')
    // A Discipler, so the popup she comes back to is her Discipler's side.
    await offersToMentor(pool, ministry, claire)
    const sam = await woman('Sam Refused')
    const ana = await woman('Ana Refused')
    const nothingHere = crypto.randomUUID()

    const back = await pairSeparately(claire, [sam, ana], [
      [`materialId.${sam}`, mark],
      [`materialId.${ana}`, nothingHere],
    ])
    expect(back.pathname).toBe('/roster')
    expect(back.searchParams.get('pair')).toBe(claire)
    expect(back.searchParams.get('error')).toBe('relationship.material_is_not_on_the_list')
    expect(back.searchParams.get('about')).toBe(ana)
    expect(back.searchParams.get('mode')).toBe('separate')
    expect(back.searchParams.getAll('with')).toEqual([sam, ana])
    expect(back.searchParams.get(`materialId.${sam}`)).toBe(mark)
    expect(back.searchParams.get(`materialId.${ana}`)).toBe(nothingHere)

    // The popup reopens on every choice, so correcting one person does not lose
    // the others: Sam's dropdown on her Material, and Ana's on none, because the
    // one she was given is not on the list to be chosen again.
    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    expect(html).toContain('Ana Refused: That Material is no longer on this Ministry’s list.')
    const dropdownFor = (id: string) => html.match(new RegExp(`<select[^>]*name="materialId\\.${id}"[\\s\\S]*?</select>`))?.[0] ?? ''
    expect(dropdownFor(sam)).toMatch(new RegExp(`<option[^>]*value="${mark}"[^>]*selected=""`))
    const onFor = (id: string) => dropdownFor(id).match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1] ?? ''
    expect(dropdownFor(ana)).toContain('<option')
    expect(onFor(ana)).toBe('')

    expect(await oneToOneOf(sam)).toEqual([])
    expect(await oneToOneOf(ana)).toEqual([])
  })

  it('refuses the whole set for a Material that has been removed', async () => {
    const leviticus = await addMaterial(ministry, 'Leviticus, Soon Removed')
    const claire = await woman('Claire Stale')
    const sam = await woman('Sam Stale')
    const ana = await woman('Ana Stale')
    const removed = await fetch(`${baseUrl}/materials/${leviticus}/remove`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams({ confirm: 'yes' }),
    })
    expect(removed.status).toBe(303)

    const back = await pairSeparately(claire, [sam, ana], [[`materialId.${sam}`, leviticus]])
    expect(back.searchParams.get('error')).toBe('relationship.material_is_not_on_the_list')
    expect(back.searchParams.get('about')).toBe(sam)
    expect(await oneToOneOf(sam)).toEqual([])
    expect(await oneToOneOf(ana)).toEqual([])
  })

  it('still takes the single Material in together mode, and ignores any per-Disciple choice', async () => {
    const mark = await addMaterial(ministry, 'Gospel of Mark, Together')
    const romans = await addMaterial(ministry, 'Romans, Together')
    const claire = await woman('Claire Together')
    const sam = await woman('Sam Together')
    const ana = await woman('Ana Together')

    const receipt = await postPairing(cookie, [
      ['pair', claire],
      ['shape', 'group'],
      ['leaderId', claire],
      ['participantId', sam],
      ['participantId', ana],
      ['declaredGender', 'female'],
      ['name', 'Claire with Sam & Ana'],
      ['materialId', mark],
      [`materialId.${sam}`, romans],
    ])
    expect(Object.fromEntries(receipt.searchParams)).toEqual({ paired: '2' })

    const [theirs] = await oneToOneOf(sam)
    expect(theirs?.intended).toBe(mark)
    expect((await oneToOneOf(ana))[0]?.id).toBe(theirs?.id)
  })
})
