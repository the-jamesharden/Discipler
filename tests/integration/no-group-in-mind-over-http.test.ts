import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  aTestPhoneNumber,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Group form exits, ticket 01, driven the way a congregant and an Admin do it:
 * "I don't have a group in mind" on step three through to the done page, the
 * *Wants a group* item on Follow-Up and its badge on every tab, and **Place in
 * this group** landing the Person on the Roster in the group. Over HTTP against
 * the running app, because the group form is a public surface and the place
 * button is an ordinary form post.
 */
describe.skipIf(skipUnlessAppIsRunning)('no group in mind, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string
  let numbered = 0

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Grace Fellowship')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  const link = (params: Record<string, string | string[]> = {}): string => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      for (const one of [value].flat()) query.append(key, one)
    }
    return `${baseUrl}/intake/${ministry.id}?${query}`
  }

  const open = async (params: Record<string, string | string[]> = {}) =>
    (await fetch(link(params), { redirect: 'manual' })).text()

  const post = async (path: string, fields: Record<string, string>, repeated: Record<string, string[]> = {}) => {
    const body = new URLSearchParams(fields)
    for (const [key, values] of Object.entries(repeated)) for (const v of values) body.append(key, v)
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(path.startsWith('/intake/') ? {} : { cookie }),
      },
      body,
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  const aGroup = async (name: string, declaredGender: 'male' | 'female' | null) => {
    const gender = declaredGender ?? 'male'
    const group = await formGroup(ministry, {
      name,
      declaredGender,
      leader: { name: `Leader ${++numbered}`, phone: aTestPhoneNumber(), gender },
      disciples: [{ name: `Disciple ${++numbered}`, phone: aTestPhoneNumber(), gender }],
    })
    return group
  }

  const stepThree = { step: '3', ageBand: '25-34', gender: 'male', availability: ['tuesday:18', 'thursday:18'] }

  let mens: { id: string; leader: string }
  let mixed: { id: string }
  let womens: { id: string }
  let jonah: { id: string; fullName: string }

  it('offers no group in mind as the last option on step three, dashed, in the same radio group', async () => {
    mens = await aGroup(`Tuesday men’s group ${++numbered}`, 'male')
    mixed = await aGroup(`Saturday breakfast ${++numbered}`, null)
    womens = await aGroup(`Women’s study ${++numbered}`, 'female')

    const html = await open(stepThree)
    const radios = [...html.matchAll(/name="groupId" value="([^"]+)"/g)].map((match) => match[1])
    expect(radios.at(-1)).toBe('none')
    expect(radios).toContain(mens.id)
    expect(radios).toContain(mixed.id)
    expect(radios).not.toContain(womens.id)
    expect(html).toMatch(/class="option dashed"[^>]*>\s*<input[^>]*value="none"/)
    expect(html).toContain('I don’t have a group in mind')
    expect(html).toContain('We’ll let Grace Fellowship know you’d like to be placed in one.')
  })

  it('carries the answer to the contact step and says on the done page that the Ministry was told', async () => {
    const four = await open({ ...stepThree, step: '4', groupId: 'none' })
    expect(four).toContain('name="fullName"')
    expect(four).toContain('name="groupId" value="none"')

    const fullName = `Jonah Fields ${++numbered}`
    const { response, location } = await post(
      `/intake/${ministry.id}/submit`,
      {
        via: 'link', ageBand: '25-34', gender: 'male', groupId: 'none',
        fullName, phone: aTestPhoneNumber(), smsConsent: 'yes', contactSharing: 'granted',
      },
      { availability: ['tuesday:18', 'thursday:18'] },
    )
    expect(response.status).toBe(303)
    expect(location).toContain('/done')
    expect(location).toContain('outcome=placement')
    expect(location).not.toContain('groupId=')

    const landing = new URL(location, baseUrl)
    const done = await fetch(`${baseUrl}${landing.pathname}${landing.search}`).then((r) => r.text())
    expect(done).toContain('You’re on the list')
    expect(done).toContain('We’ve let Grace Fellowship know you’d like to be placed in a group')
    expect(done).not.toContain('You’re in')

    const { rows } = await pool.query<{ id: string }>(
      `select id from person where ministry_id = $1 and full_name = $2`,
      [ministry.id, fullName],
    )
    jonah = { id: rows[0]!.id, fullName }
    const { rows: memberships } = await pool.query(
      `select 1 from relationship_member where person_id = $1`,
      [jonah.id],
    )
    expect(memberships).toEqual([])
  })

  it('takes the answer with space around it as the same answer, to the same done page', async () => {
    const { location } = await post(
      `/intake/${ministry.id}/submit`,
      {
        via: 'link', ageBand: '25-34', gender: 'male', groupId: '  none ',
        fullName: `Spaced ${++numbered}`, phone: aTestPhoneNumber(), smsConsent: 'yes', contactSharing: 'granted',
      },
      { availability: ['tuesday:18'] },
    )
    expect(location).toContain('outcome=placement')
    // Resolved at once, so the count the later tests read is Jonah's item alone.
    const { rows } = await pool.query<{ id: string }>(
      `select f.id from follow_up_item f join person p on p.id = f.person_id
        where p.ministry_id = $1 and p.full_name = $2 and f.kind = 'group_placement_wanted'`,
      [ministry.id, `Spaced ${numbered}`],
    )
    expect(rows).toHaveLength(1)
    const resolved = await post('/follow-up/resolve', { itemId: rows[0]!.id })
    expect(resolved.location).toContain('done=resolved')
  })

  it('shows the item on Follow-Up as S-8 draws it, with only the groups open to them', async () => {
    const { html } = await getPage('/follow-up', cookie)
    expect(html).toContain('Wants a group')
    expect(html).toContain(jonah.fullName)
    expect(html).toMatch(
      /Signed up on the group link on \d{1,2} [A-Z][a-z]{2} with no group in mind\. Men(&#x27;|')s, 25 to 34, available Tuesday and Thursday evenings\./,
    )
    expect(html).toContain('action="/follow-up/place"')
    expect(html).toContain(`value="${mens.id}"`)
    expect(html).toContain(`value="${mixed.id}"`)
    expect(html).not.toContain(`value="${womens.id}"`)
    expect(html).toContain('Place in this group')
    expect(html).toContain('Resolve')
  })

  it('counts the item in the Follow-Up badge on every tab', async () => {
    for (const tab of ['/overview', '/check-ins', '/suggested-pairs', '/follow-up', '/materials', '/roster']) {
      const { html } = await getPage(tab, cookie)
      expect(html, tab).toContain('aria-label="1 needing attention"')
    }
  })

  it('refuses a group not open to them, and leaves the item standing', async () => {
    const refused = await post('/follow-up/place', { personId: jonah.id, groupId: womens.id })
    expect(refused.response.status).toBe(303)
    expect(refused.location).toContain('/follow-up')
    expect(refused.location).toContain('error=relationship.gender_does_not_match_the_declaration')

    const { html } = await getPage('/follow-up', cookie)
    expect(html).toContain('Wants a group')
  })

  it('places them in the group they name, and lands on the Roster with them in it', async () => {
    const placed = await post('/follow-up/place', { personId: jonah.id, groupId: mens.id })
    expect(placed.response.status).toBe(303)
    expect(placed.location).toContain('/roster')
    expect(placed.location).toContain(`joined=${jonah.id}`)
    expect(placed.location).toContain('told=yes')

    const landing = new URL(placed.location, baseUrl)
    const roster = await getPage(`${landing.pathname}${landing.search}`, cookie)
    expect(roster.html).toContain(`${jonah.fullName} is in the group now.`)

    const { rows } = await pool.query(
      `select 1 from relationship_member where relationship_id = $1 and person_id = $2 and ended_at is null`,
      [mens.id, jonah.id],
    )
    expect(rows).toHaveLength(1)

    const followUp = await getPage('/follow-up', cookie)
    expect(followUp.html).not.toContain('Wants a group')
    expect(followUp.html).not.toContain('tab-badge')
  })
})
