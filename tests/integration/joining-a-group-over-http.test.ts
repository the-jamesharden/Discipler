import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addMembership,
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  openMaterialHistory,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The group form driven the way a congregant does it, and the Roster driven the
 * way the Admin who named the group does. Over HTTP against the running app,
 * because the original link is a surface used by somebody who will never have an
 * account, and because *the link never breaks* is a claim about a URL.
 */
describe.skipIf(skipUnlessAppIsRunning)('joining a group through the link', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string
  let numbered = 0
  const aNumber = () => `+1555${String(4_000_000 + ((Date.now() % 100_000) * 10 + ++numbered)).padStart(7, '0')}`

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
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

  const open = async (params: Record<string, string | string[]> = {}) => {
    const response = await fetch(link(params), { redirect: 'manual' })
    return { response, html: await response.text() }
  }

  const post = async (path: string, fields: Record<string, string>, repeated: Record<string, string[]> = {}) => {
    const body = new URLSearchParams(fields)
    for (const [key, values] of Object.entries(repeated)) for (const v of values) body.append(key, v)
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...(path.startsWith('/roster') ? { cookie } : {}) },
      body,
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  const aGroup = async (over: {
    readonly name: string | null
    readonly joinRequiresApproval?: boolean
    readonly declaredGender?: 'male' | 'female' | null
  }) => {
    // The people match what the group declares: a men's group is led by a man.
    const gender = over.declaredGender === undefined ? 'female' : (over.declaredGender ?? 'female')
    const leader = await addPerson(ministry, `${gender === 'male' ? 'David' : 'Ruth'} ${++numbered}`, {
      phone: aNumber(),
      answers: { gender },
    })
    const first = await addPerson(ministry, `${gender === 'male' ? 'Sam' : 'Emily'} ${++numbered}`, {
      phone: aNumber(),
      answers: { gender },
    })
    const acceptedAt = new Date('2026-03-02T09:00:00Z')
    const { rows } = await pool.query<{ id: string }>(
      `insert into relationship (ministry_id, kind, accepted_at, name, join_requires_approval, declared_gender)
       values ($1, 'group', $2, $3, $4, $5) returning id`,
      [ministry.id, acceptedAt, over.name, over.joinRequiresApproval ?? false, over.declaredGender === undefined ? 'female' : over.declaredGender],
    )
    const id = rows[0]!.id
    await openMaterialHistory(ministry, id, acceptedAt)
    await addMembership({ ministry, relationshipId: id, kind: 'group', personId: leader, role: 'leader' })
    await addMembership({ ministry, relationshipId: id, kind: 'group', personId: first, role: 'participant' })
    return { id, leader }
  }

  const membersOf = async (relationship: string) => {
    const { rows } = await pool.query<{ full_name: string }>(
      `select p.full_name from relationship_member m join person p on p.id = m.person_id
        where m.relationship_id = $1 and m.ended_at is null`,
      [relationship],
    )
    return rows.map((row) => row.full_name)
  }

  it('says there is nothing to join before any group exists, and points at the wizard', async () => {
    const { response, html } = await open()
    expect(response.status).toBe(200)
    expect(html).toContain('Join a group at Riverside Chapel')
    expect(html).toContain('isn’t taking group sign-ups')
    expect(html).toContain(`/intake/${ministry.id}/discipleship`)
    expect(html).not.toContain('name="ageBand"')
  })

  it('asks gender and age, then the grid, then the group, then the rest -- and no Goal', async () => {
    const women = await aGroup({ name: `Tuesday Women ${++numbered}` })
    const men = await aGroup({ name: `Tuesday Men ${++numbered}`, declaredGender: 'male' })
    const mixed = await aGroup({ name: `Mixed ${++numbered}`, declaredGender: null })

    const one = await open()
    expect(one.html).toContain('name="ageBand"')
    expect(one.html).toContain('name="gender"')
    expect(one.html).not.toContain('name="groupId"')

    const two = await open({ step: '2', ageBand: '25-34', gender: 'female' })
    expect(two.html).toContain('monday:early_morning')

    // The list is filtered on the gender answered: a men's group is not offered to
    // a woman, and a mixed one is offered to everybody.
    const three = await open({ step: '3', ageBand: '25-34', gender: 'female', availability: ['monday:midday'] })
    expect(three.html).toContain('Which group would you like to join?')
    expect(three.html).toContain(`value="${women.id}"`)
    expect(three.html).toContain(`value="${mixed.id}"`)
    expect(three.html).not.toContain(`value="${men.id}"`)

    const four = await open({
      step: '4', ageBand: '25-34', gender: 'female', availability: ['monday:midday'], groupId: women.id,
    })
    expect(four.html).toContain('name="fullName"')
    expect(four.html).toContain('name="smsConsent"')
    expect(four.html).not.toContain('name="goalId"')
    expect(four.html).toContain(`name="groupId" value="${women.id}"`)
  })

  it('drops the group chosen when the gender is answered again', async () => {
    const women = await aGroup({ name: `Women ${++numbered}` })
    const { html } = await open({
      step: '1', ageBand: '25-34', gender: 'female', availability: ['monday:midday'], groupId: women.id,
    })
    expect(html).not.toContain('name="groupId"')
    expect(html).toContain('name="availability" value="monday:midday"')
  })

  it('will not carry a group nobody was offered, and says so at the group screen', async () => {
    const men = await aGroup({ name: `Men ${++numbered}`, declaredGender: 'male' })
    // A man's group in a woman's URL: the group never survives the read, so the
    // wizard stops at the group screen rather than at the one after it.
    const { html } = await open({
      step: '4', ageBand: '25-34', gender: 'female', availability: ['monday:midday'], groupId: men.id,
    })
    expect(html).toContain('Which group would you like to join?')
    expect(html).not.toContain('name="fullName"')
  })

  it('joins an open group on submit and says who leads it', async () => {
    const group = await aGroup({ name: `Open ${++numbered}` })
    const fullName = `Priya ${++numbered}`
    const { response, location } = await post(
      `/intake/${ministry.id}/submit`,
      {
        via: 'qr', ageBand: '25-34', gender: 'female', groupId: group.id,
        fullName, phone: aNumber(), smsConsent: 'yes', contactSharing: 'granted',
      },
      { availability: ['tuesday:evening'] },
    )
    expect(response.status).toBe(303)
    expect(location).toContain('/done')
    expect(location).toContain(`groupId=${group.id}`)
    expect(location).toContain('outcome=joined')

    expect(await membersOf(group.id)).toContain(fullName)

    const done = await fetch(`${baseUrl}${new URL(location, baseUrl).pathname}${new URL(location, baseUrl).search}`).then((r) => r.text())
    expect(done).toContain('You’re in')
    expect(done).toContain('Your leader is Ruth')

    const { rows } = await pool.query(
      `select c.intake_path, c.source from consent_record c join person p on p.id = c.person_id
        where p.full_name = $1 and c.ministry_id = $2`,
      [fullName, ministry.id],
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.intake_path).toBe('group')
      expect(row.source).toBe('qr_code')
    }
  })

  it('asks rather than joins for a guarded group, and lets the Admin admit from the Roster', async () => {
    const group = await aGroup({ name: `Guarded ${++numbered}`, joinRequiresApproval: true })
    const fullName = `Nadia ${++numbered}`
    const { location } = await post(
      `/intake/${ministry.id}/submit`,
      {
        via: 'link', ageBand: '35-44', gender: 'female', groupId: group.id,
        fullName, phone: aNumber(), smsConsent: 'yes', contactSharing: 'granted',
      },
      { availability: ['tuesday:evening'] },
    )
    expect(location).toContain('outcome=requested')
    expect(await membersOf(group.id)).not.toContain(fullName)

    const done = await fetch(`${baseUrl}${new URL(location, baseUrl).pathname}${new URL(location, baseUrl).search}`).then((r) => r.text())
    expect(done).toContain('You’re on the list')
    expect(done).not.toContain('Your leader is')

    const roster = await getPage('/roster', cookie)
    expect(roster.html).toContain('Waiting to join a group')
    expect(roster.html).toContain(fullName)
    const itemId = roster.html.match(new RegExp(`name="itemId" value="([0-9a-f-]{36})"`))?.[1]
    expect(itemId).toBeTruthy()

    const { rows: person } = await pool.query<{ id: string }>(
      `select id from person where full_name = $1 and ministry_id = $2`, [fullName, ministry.id],
    )
    const admitted = await post('/roster/join-requests/admit', { itemId: itemId!, personId: person[0]!.id })
    expect(admitted.response.status).toBe(303)
    expect(admitted.location).toContain(`admitted=${person[0]!.id}`)
    expect(await membersOf(group.id)).toContain(fullName)

    // The receipt rides on the redirect, looked up by id and never echoed.
    const landing = new URL(admitted.location, baseUrl)
    const after = await getPage(`${landing.pathname}${landing.search}`, cookie)
    expect(after.html).toContain(`${fullName} is in.`)
    expect(after.html).not.toContain(`name="itemId" value="${itemId}"`)
  })

  it('lets the Admin name a group and close its door from the Roster', async () => {
    const group = await aGroup({ name: null })
    const roster = await getPage('/roster', cookie)
    expect(roster.html).toContain('Unnamed group')

    const saved = await post('/roster/groups/configure', {
      relationshipId: group.id, name: `Named ${numbered}`, joinRequiresApproval: 'yes',
    })
    expect(saved.location).toContain(`configured=${group.id}`)

    const { rows } = await pool.query(`select name, join_requires_approval from relationship where id = $1`, [group.id])
    expect(rows[0]).toEqual({ name: `Named ${numbered}`, join_requires_approval: true })

    const blank = await post('/roster/groups/configure', { relationshipId: group.id, name: '   ' })
    expect(blank.location).toContain('groupError=group.name_missing')
  })

  it('requires a name of a group formed from the Roster, and none of a pair', async () => {
    const david = await addPerson(ministry, `David ${++numbered}`, { phone: aNumber(), answers: { gender: 'male' } })
    const sam = await addPerson(ministry, `Sam ${++numbered}`, { phone: aNumber(), answers: { gender: 'male' } })
    const tom = await addPerson(ministry, `Tom ${++numbered}`, { phone: aNumber(), answers: { gender: 'male' } })

    const unnamed = await post('/roster/pair/create', { leaderId: david, declaredGender: 'male' }, { participantId: [sam, tom] })
    expect(unnamed.location).toContain('error=relationship.needs_a_name')

    const named = await post(
      '/roster/pair/create',
      { leaderId: david, declaredGender: 'male', name: 'Thursday Men', joinRequiresApproval: 'yes' },
      { participantId: [sam, tom] },
    )
    expect(named.location).toContain('paired=2')
    const { rows } = await pool.query(
      `select name, join_requires_approval from relationship where ministry_id = $1 and name = 'Thursday Men'`,
      [ministry.id],
    )
    expect(rows[0]).toEqual({ name: 'Thursday Men', join_requires_approval: true })
  })

  it('captions the original QR code for the form it now opens', async () => {
    const code = await fetch(`${baseUrl}/roster/intake-code.svg`, { headers: { cookie }, redirect: 'manual' })
    expect(code.status).toBe(200)
    expect(await code.text()).toContain('Join a group')
  })
})
