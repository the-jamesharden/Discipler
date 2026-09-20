import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  aTestPhoneNumber,
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Manual pairing, ticket 22, stage 1, the way the Pair popup's **Add to group**
 * button will drive it: an ordinary form post with no script, answered by a
 * redirect to the Roster. Over HTTP against the running app, because *it redirects
 * to the Roster with a receipt* and *it returns to where the Admin submitted from*
 * are both claims about addresses.
 */
describe.skipIf(skipUnlessAppIsRunning)('an Admin puts a Disciple into a group, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string
  let numbered = 0
  // Letters only after the first name: a name is matched in markup below, and a
  // digit run is what a phone number looks like.
  const letter = (n: number) => String.fromCharCode(97 + (n % 26))
  const named = (first: string) => {
    const n = numbered++
    return `${first} Httpjoin${letter(Math.floor(n / 26))}${letter(n)}`
  }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  type Gender = 'male' | 'female'

  const aGroup = async (name: string, declaredGender: Gender | null) => {
    const gender: Gender = declaredGender ?? 'male'
    const leaderName = named('David')
    const group = await formGroup(ministry, {
      name,
      declaredGender,
      leader: { name: leaderName, phone: aTestPhoneNumber(), gender },
      disciples: [
        { name: named('Emil'), phone: aTestPhoneNumber(), gender },
        { name: named('Felix'), phone: aTestPhoneNumber(), gender },
      ],
    })
    return { ...group, leaderName }
  }

  const aDisciple = async (gender: Gender) => {
    const name = named(gender === 'male' ? 'Sam' : 'Priya')
    return { name, id: await addPerson(ministry, name, { phone: aTestPhoneNumber(), answers: { gender } }) }
  }

  const join = async (fields: Record<string, string>, as: string | null = cookie) => {
    const response = await fetch(`${baseUrl}/roster/pair/join`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(as === null ? {} : { cookie: as }),
      },
      body: new URLSearchParams(fields),
    })
    const location = new URL(response.headers.get('location') ?? '', baseUrl)
    return { status: response.status, location }
  }

  const inTheGroup = async (group: string, person: string) => {
    const { rows } = await pool.query(
      `select 1 from relationship_member
        where relationship_id = $1 and person_id = $2 and role = 'participant' and ended_at is null`,
      [group, person],
    )
    return rows.length === 1
  }

  const queuedFor = async (person: string) => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at, created_at`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  /** One Person's row, as words: keyed on the name cell, tags stripped. */
  const rowFor = (html: string, name: string): string => {
    const row = html
      .split('<tr')
      .find((candidate) => new RegExp(`data-testid="roster-name"[^>]*>${name}<`).test(candidate))
    expect(row, `no row on the Roster for ${name}`).toBeDefined()
    return row!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  }

  it('puts a ready Disciple into a running group, on both rows, with the Discipler texted', async () => {
    const group = await aGroup('Thursday Table', 'male')
    const sam = await aDisciple('male')

    const { status, location } = await join({ personId: sam.id, groupId: group.id, list: 'disciples' })

    // Back to the Roster, on the list the Admin was on, with a receipt.
    expect(status).toBe(303)
    expect(location.pathname).toBe('/roster')
    expect(Object.fromEntries(location.searchParams)).toEqual({
      list: 'disciples',
      joined: sam.id,
      told: 'yes',
    })
    expect(await inTheGroup(group.id, sam.id)).toBe(true)

    const landed = await getPage(`${location.pathname}${location.search}`, cookie)
    expect(landed.html).toContain(
      `${sam.name} is in the group now. Its Discipler has been told, and nobody else has been contacted.`,
    )

    // On both rows: the Disciple's names who leads them, and the Discipler's names them.
    const all = await getPage('/roster?list=all', cookie)
    expect(rowFor(all.html, sam.name)).toContain(group.leaderName)
    expect(rowFor(all.html, group.leaderName)).toContain(sam.name)

    // The Discipler has a text waiting, and the Disciple has none.
    const [toLeader, ...more] = await queuedFor(group.leader)
    expect(more).toEqual([])
    expect(toLeader).toContain('just joined Thursday Table.')
    expect(await queuedFor(sam.id)).toEqual([])
  })

  it('refuses a woman a men’s group, back where the Admin was with the group and the reason, and takes her into a mixed one', async () => {
    const mens = await aGroup('Friday Men', 'male')
    const mixed = await aGroup('Sunday Mixed', null)
    const priya = await aDisciple('female')

    const refused = await join({ personId: priya.id, groupId: mens.id, list: 'disciples' })

    expect(refused.status).toBe(303)
    expect(refused.location.pathname).toBe('/roster')
    expect(Object.fromEntries(refused.location.searchParams)).toEqual({
      list: 'disciples',
      pair: priya.id,
      groupId: mens.id,
      error: 'relationship.gender_does_not_match_the_declaration',
    })
    expect(await inTheGroup(mens.id, priya.id)).toBe(false)
    expect(await queuedFor(mens.leader)).toEqual([])

    const joined = await join({ personId: priya.id, groupId: mixed.id })
    expect(joined.location.searchParams.get('joined')).toBe(priya.id)
    // No list named is All, as it is on the Roster.
    expect(joined.location.searchParams.get('list')).toBe('all')
    expect(await inTheGroup(mixed.id, priya.id)).toBe(true)
  })

  it('refuses an ended group', async () => {
    const group = await aGroup('Ended Table', 'male')
    // Ended the way an Admin ends one, so its memberships close with it and the
    // ending is stamped by the clock that stamped the fixtures. The database's
    // `now()` is another machine's, and a few milliseconds behind it reads as a
    // membership that ended before it started.
    const ending = await fetch(`${baseUrl}/follow-up/relationship/end`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams({
        relationshipId: group.id,
        reason: 'They stopped meeting.',
        outcome: 'discontinued',
      }),
    })
    expect(ending.status).toBe(303)
    const { rows } = await pool.query<{ ended: boolean }>(
      `select ended_at is not null as ended from relationship where id = $1`,
      [group.id],
    )
    expect(rows[0]?.ended).toBe(true)
    const sam = await aDisciple('male')

    const { location } = await join({ personId: sam.id, groupId: group.id })

    expect(location.searchParams.get('error')).toBe('joining.group_has_ended')
    expect(location.searchParams.get('groupId')).toBe(group.id)
    expect(await inTheGroup(group.id, sam.id)).toBe(false)
  })

  it('refuses an id that is not shaped like one as naming nobody, and never as a fault', async () => {
    const group = await aGroup('Shape Table', 'male')
    const sam = await aDisciple('male')

    const noGroup = await join({ personId: sam.id, groupId: 'not-an-id' })
    expect(noGroup.status).toBe(303)
    expect(noGroup.location.searchParams.get('error')).toBe('joining.group_not_found')

    const noPerson = await join({ personId: 'not-an-id', groupId: group.id })
    expect(noPerson.status).toBe(303)
    expect(noPerson.location.searchParams.get('error')).toBe('joining.person_not_found')

    const nothing = await join({})
    expect(nothing.location.searchParams.get('error')).toBe('joining.person_not_found')
  })

  it('does nothing for somebody who is not signed in', async () => {
    const group = await aGroup('Closed Table', 'male')
    const sam = await aDisciple('male')

    const { status } = await join({ personId: sam.id, groupId: group.id }, null)

    expect(status).toBeGreaterThanOrEqual(300)
    expect(await inTheGroup(group.id, sam.id)).toBe(false)
  })

  it('shows no receipt for an address that names nobody on the Roster', async () => {
    const { html } = await getPage(`/roster?joined=${crypto.randomUUID()}&told=yes`, cookie)

    expect(html).not.toContain('is in the group now.')
  })
})
