import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { systemClock } from '~/domain/clock'
import { rosterPageFrom } from '~/platform/supabase/roster-reader'
import { getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addMaterial,
  addPerson,
  addPersonWithAccount,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  signInAs,
  signInWith,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'
import { asDocument, asRows } from '../support/page-document'
import { offersToMentor, popupIn } from '../support/pair-popup'

/**
 * Three facts the pairing form needs and the Roster's document never carried:
 * each candidate's gender, whether the Ministry enforces the absolute one-to-one
 * gender match, and the Ministry's Materials. The Pair page's document moves to
 * carry them; the Roster's and the person page's do not.
 */

/** A Material the Ministry once offered and no longer does. */
const addRemovedMaterial = async (ministry: MinistryFixture, title: string): Promise<string> => {
  const id = await addMaterial(ministry, title)
  const { error } = await serviceRoleClient()
    .from('material')
    .update({ removed: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Could not remove the Material ${title}: ${error.message}`)
  return id
}

/** A Ministry that deliberately turned the absolute one-to-one gender match off. */
const createPermissiveMinistry = async (name: string): Promise<MinistryFixture> => {
  const ministry = await createMinistryWithAdmin(name)
  const { error } = await serviceRoleClient()
    .from('ministry')
    .update({ suggest_gender_match: false })
    .eq('id', ministry.id)
  if (error) throw new Error(`Could not turn the gender match off for ${name}: ${error.message}`)
  return ministry
}

describe('what the Pair screen reads', () => {
  let ministry: MinistryFixture
  let other: MinistryFixture
  let leader: AccountFixture
  let her: string
  let him: string
  let neverAsked: string
  let romans: string
  let galatians: string
  let james: string
  let pool: pg.Pool

  // The badge's count rides in the page and nothing here asserts it, so the real
  // clock: a pinned date beside fixtures stamped with the real one is a date bomb.
  const clock = systemClock

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Pairing Chapel')
    other = await createMinistryWithAdmin('The Chapel Across The Road')
    leader = await addPersonWithAccount(ministry, 'Lena Leader', 'leader')
    her = await addPerson(ministry, 'Amara Blythe', { answers: { gender: 'female' } })
    him = await addPerson(ministry, 'Bruno Clay', { answers: { gender: 'male' } })
    neverAsked = await addPerson(ministry, 'Nico Unasked', { intake: false })
    // Added out of title order, with one removed and one that is somebody else's.
    romans = await addMaterial(ministry, 'Romans')
    galatians = await addMaterial(ministry, 'Galatians')
    james = await addRemovedMaterial(ministry, 'James')
    await addMaterial(other, 'Somebody Else’s Material')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  const genderOn = (rows: unknown, person: string) =>
    asRows(rows).find((row) => row.person_id === person)?.gender

  it('carries the gender each candidate gave at Intake, and null for somebody never asked', async () => {
    const admin = await signInAs(ministry)
    const doc = asDocument((await admin.rpc('pair_page')).data)
    const rows = asDocument(doc.roster).rows

    expect(genderOn(rows, her)).toBe('female')
    expect(genderOn(rows, him)).toBe('male')
    expect(genderOn(rows, neverAsked)).toBeNull()
  })

  it('reads the most recent submission, so a correction is the answer that counts', async () => {
    const corrected = await addPerson(ministry, 'Cory Corrected', { answers: { gender: 'female' } })
    await completeIntake(ministry, corrected, [], 'pastor_link', { gender: 'male' })

    const admin = await signInAs(ministry)
    const rows = await admin.rpc('roster', { target_ministry_id: ministry.id })
    expect(genderOn(rows.data, corrected)).toBe('male')
  })

  it('hands a gender to nobody but an Admin of that Ministry', async () => {
    // The Roster's function is the only way a gender reaches a browser session,
    // and its Admin test is what lets it out: a Leader of the same Ministry and
    // an Admin of another both read no rows at all.
    const lead = await signInWith(leader)
    expect((await lead.rpc('roster', { target_ministry_id: ministry.id })).data).toEqual([])

    const neighbour = await signInAs(other)
    expect((await neighbour.rpc('roster', { target_ministry_id: ministry.id })).data).toEqual([])
  })

  it('leaves no browser session a path to ask for one Person’s gender directly', async () => {
    const { rows } = await pool.query<{ role: string; may: boolean }>(`
      select r.role, has_function_privilege(r.role, 'app.current_gender(uuid)', 'execute') as may
        from unnest(array['authenticated', 'anon', 'public']) as r(role)
    `)
    expect(rows).toEqual([
      { role: 'authenticated', may: false },
      { role: 'anon', may: false },
      { role: 'public', may: false },
    ])

    // And the table the answer lives in is as closed as it was: a Leader reads no
    // submission under its Admin-only policy, and a visitor is refused outright.
    // The Roster's Admin test is how a gender got out, not a wider grant.
    const lead = await signInWith(leader)
    const asLeader = await lead.from('intake_submission').select('gender').eq('ministry_id', ministry.id)
    expect(asLeader.data).toEqual([])

    const { apiUrl, anonKey } = localSupabase()
    const asNobody = await createClient(apiUrl, anonKey).from('intake_submission').select('gender')
    expect(asNobody.error).not.toBeNull()
  })

  it('says whether the Ministry enforces the one-to-one gender match', async () => {
    const admin = await signInAs(ministry)
    expect(asDocument((await admin.rpc('pair_page')).data).suggest_gender_match).toBe(true)

    const theirs = await signInAs(await createPermissiveMinistry('Open Door Fellowship'))
    expect(asDocument((await theirs.rpc('pair_page')).data).suggest_gender_match).toBe(false)
  })

  it('carries the Ministry’s Materials in title order, a removed one with its flag', async () => {
    const admin = await signInAs(ministry)
    const doc = asDocument((await admin.rpc('pair_page')).data)

    expect(doc.materials).toEqual([
      { id: galatians, title: 'Galatians', removed: null },
      { id: james, title: 'James', removed: expect.any(String) },
      { id: romans, title: 'Romans', removed: null },
    ])
  })

  it('is the Roster’s document with its own keys beside it, and moves nobody else’s', async () => {
    const admin = await signInAs(ministry)
    const roster = asDocument((await admin.rpc('roster_page')).data)
    const person = asDocument((await admin.rpc('person_page')).data)
    const pair = asDocument((await admin.rpc('pair_page')).data)

    expect(person).toEqual(roster)
    expect(roster).not.toHaveProperty('suggest_gender_match')
    expect(roster).not.toHaveProperty('materials')

    // The groups are the third, from Manual pairing, ticket 08, and have their own
    // suite in `the-groups-on-the-pair-document.test.ts`.
    const { suggest_gender_match: _setting, materials: _materials, groups: _groups, ...rest } = pair
    expect(rest).toEqual(roster)
  })

  it('derives the gender on each row, the setting, and the live Materials alone', async () => {
    const admin = await signInAs(ministry)
    const page = rosterPageFrom(asDocument((await admin.rpc('pair_page')).data), clock, 'pair')

    const genderOf = (person: string) => page.roster.find((entry) => entry.personId === person)?.gender
    expect(genderOf(her)).toBe('female')
    expect(genderOf(him)).toBe('male')
    expect(genderOf(neverAsked)).toBeNull()

    expect(page.suggestGenderMatch).toBe(true)

    // The removed one is off the list, and what is left is id and title in title
    // order: what a select needs and nothing else.
    expect(page.materials.map((material) => material.title)).toEqual(['Galatians', 'Romans'])
    expect(Object.keys(page.materials[0]!).sort()).toEqual(['materialId', 'title'])
  })

  it('derives a Ministry that turned the match off as having turned it off', async () => {
    const theirs = await signInAs(await createPermissiveMinistry('Wide Gate Fellowship'))
    const page = rosterPageFrom(asDocument((await theirs.rpc('pair_page')).data), clock, 'pair')
    expect(page.suggestGenderMatch).toBe(false)
  })

  it('reads the Roster’s own document as enforced and offering no Materials', async () => {
    // The Roster and the person page read a document without the two keys. True
    // and not false: the safe default for a safeguarding constraint is enforced.
    const admin = await signInAs(ministry)

    for (const surface of ['roster', 'person'] as const) {
      const page = rosterPageFrom(asDocument((await admin.rpc(`${surface}_page`)).data), clock, surface)
      expect(page.suggestGenderMatch, surface).toBe(true)
      expect(page.materials, surface).toEqual([])
      expect(page.roster.length, surface).toBeGreaterThan(0)
    }
  })

  it('refuses a document whose setting or gender is something it does not know', async () => {
    const admin = await signInAs(ministry)
    const doc = asDocument((await admin.rpc('pair_page')).data)

    expect(() => rosterPageFrom({ ...doc, suggest_gender_match: 'no' }, clock, 'pair')).toThrow(/gender match/i)

    // The Pair page's own document arriving without its keys is the function and
    // the reader having drifted apart, and is not read as the Roster's defaults.
    const { suggest_gender_match: _setting, ...unsaid } = doc
    expect(() => rosterPageFrom(unsaid, clock, 'pair')).toThrow(/gender match/i)
    const { materials: _materials, ...unstocked } = doc
    expect(() => rosterPageFrom(unstocked, clock, 'pair')).toThrow(/materials/i)

    // A Ministry row the session could not see reads as enforced.
    expect(rosterPageFrom({ ...doc, suggest_gender_match: null }, clock, 'pair').suggestGenderMatch).toBe(true)

    const roster = asDocument(doc.roster)
    const [first, ...rest] = asRows(roster.rows)
    const drifted = { ...doc, roster: { ...roster, rows: [{ ...first, gender: 'unknown' }, ...rest] } }
    expect(() => rosterPageFrom(drifted, clock, 'pair')).toThrow(/gender/i)

    // The column missing altogether is the function and the reader having drifted
    // apart, and is not read as *never asked*.
    const { gender: _gender, ...without } = first!
    const missing = { ...doc, roster: { ...roster, rows: [without, ...rest] } }
    expect(() => rosterPageFrom(missing, clock, 'pair')).toThrow(/gender/i)
  })

  it('tells a Leader who administers nothing so, and hands them no Materials', async () => {
    const lead = await signInWith(leader)
    const doc = asDocument((await lead.rpc('pair_page')).data)

    expect(doc.session).toBe('not-an-admin')
    expect(doc).not.toHaveProperty('roster')
    expect(doc).not.toHaveProperty('materials')
    expect(doc).not.toHaveProperty('suggest_gender_match')
  })

  it('answers nobody without a session, and not the service role either', async () => {
    const { apiUrl, anonKey } = localSupabase()
    expect((await createClient(apiUrl, anonKey).rpc('pair_page')).error).not.toBeNull()
    expect((await serviceRoleClient().rpc('pair_page')).error).not.toBeNull()

    const { rows } = await pool.query<{ role: string; may: boolean }>(`
      select r.role, has_function_privilege(r.role, 'public.pair_page()', 'execute') as may
        from unnest(array['authenticated', 'anon', 'service_role', 'public']) as r(role)
    `)
    expect(rows).toEqual([
      { role: 'authenticated', may: true },
      { role: 'anon', may: false },
      { role: 'service_role', may: false },
      { role: 'public', may: false },
    ])
  })
})

/**
 * Nothing on the screen changes in this ticket, so what the running app can say
 * is that the three surfaces still answer once the Pair page's document carries
 * every new state at once: somebody never asked their gender, a Ministry with the
 * match turned off, and a removed Material beside a live one.
 */
describe.skipIf(skipUnlessAppIsRunning)('the Pair screen, loaded by a signed-in Admin', () => {
  it('still answers, as the Roster and the person page beside it do', async () => {
    const ministry = await createPermissiveMinistry('Loaded Chapel')
    const amara = await addPerson(ministry, 'Amara Blythe', { answers: { gender: 'female' } })
    const bruno = await addPerson(ministry, 'Bruno Clay', { answers: { gender: 'male' } })
    // A Discipler, so that each side of the popup has somebody to list.
    const pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    await offersToMentor(pool, ministry, bruno).finally(() => pool.end())
    await addPerson(ministry, 'Nico Unasked', { intake: false })
    await addMaterial(ministry, 'Romans')
    await addRemovedMaterial(ministry, 'James')

    const { cookie } = await signIn(ministry)

    // The Pair popup, which the old Pair page's address opens now (Manual pairing,
    // recut ticket 05), from each side.
    const fromHer = await getPage(`/roster?pair=${amara}`, cookie)
    expect(fromHer.response.status).toBe(200)
    expect(popupIn(fromHer.html)).toContain('Bruno Clay')
    const fromHim = await getPage(`/roster?pair=${bruno}`, cookie)
    expect(fromHim.response.status).toBe(200)
    expect(popupIn(fromHim.html)).toContain('Amara Blythe')

    expect((await getPage('/roster', cookie)).response.status).toBe(200)
    expect((await getPage(`/roster/${amara}`, cookie)).response.status).toBe(200)
  })
})
