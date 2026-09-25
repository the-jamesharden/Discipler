import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  aTestPhoneNumber,
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  pairOneToOne,
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
    const discipleNames = [named('Emil'), named('Felix')] as const
    const group = await formGroup(ministry, {
      name,
      declaredGender,
      leader: { name: leaderName, phone: aTestPhoneNumber(), gender },
      disciples: [
        { name: discipleNames[0], phone: aTestPhoneNumber(), gender },
        { name: discipleNames[1], phone: aTestPhoneNumber(), gender },
      ],
    })
    return { ...group, leaderName, discipleNames }
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
    // The row and nothing after it: the last row of the table would otherwise run
    // on into whatever the page prints below.
    return row!.split('</tr>')[0]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  }

  it('puts a ready Disciple into a running group, on both rows, with the Discipler texted', async () => {
    const group = await aGroup('Thursday Table', 'male')
    const sam = await aDisciple('male')

    const { status, location } = await join({ personId: sam.id, groupId: group.id, gender: 'men' })

    // Back to the Roster, showing what it showed behind the popup (Roles per
    // pairing, ticket 02), with a receipt.
    expect(status).toBe(303)
    expect(location.pathname).toBe('/roster')
    expect(Object.fromEntries(location.searchParams)).toEqual({
      gender: 'men',
      joined: sam.id,
      told: 'yes',
    })
    expect(await inTheGroup(group.id, sam.id)).toBe(true)

    const landed = await getPage(`${location.pathname}${location.search}`, cookie)
    expect(landed.html).toContain(
      `${sam.name} is in the group now. Its Discipler has been told, and nobody else has been contacted.`,
    )

    // On both rows, the group by its name, each with its direction and the new size.
    const all = await getPage('/roster', cookie)
    expect(rowFor(all.html, sam.name)).toContain('in Thursday Table 3 members')
    expect(rowFor(all.html, group.leaderName)).toContain('leads Thursday Table 3 members')

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

    const refused = await join({ personId: priya.id, groupId: mens.id })

    expect(refused.status).toBe(303)
    expect(refused.location.pathname).toBe('/roster')
    expect(Object.fromEntries(refused.location.searchParams)).toEqual({
      pair: priya.id,
      groupId: mens.id,
      error: 'relationship.gender_does_not_match_the_declaration',
    })
    expect(await inTheGroup(mens.id, priya.id)).toBe(false)
    expect(await queuedFor(mens.leader)).toEqual([])

    const joined = await join({ personId: priya.id, groupId: mixed.id })
    expect(joined.location.searchParams.get('joined')).toBe(priya.id)
    // Nothing the menu ticked was posted, so it lands on Everyone.
    expect([...joined.location.searchParams.keys()]).toEqual(['joined', 'told'])
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

  /**
   * Stage 2, behind the same route: `as=leader` invites a Discipler to help lead,
   * the way the popup's **Add as co-leader** button will.
   */
  describe('a Discipler added as another leader', () => {
    const aDiscipler = async () => {
      const name = named('Claire')
      return { name, id: await addPerson(ministry, name, { phone: aTestPhoneNumber(), answers: { gender: 'male' } }) }
    }

    const leadsIt = async (group: string, person: string) => {
      const { rows } = await pool.query<{ accepted: boolean }>(
        `select accepted_at is not null as accepted from relationship_member
          where relationship_id = $1 and person_id = $2 and role = 'leader' and ended_at is null`,
        [group, person],
      )
      return rows
    }

    it('invites a Discipler who leads nobody onto a running group, and the group’s state is unchanged', async () => {
      const group = await aGroup('Monday Table', 'male')
      const claire = await aDiscipler()
      const stateOf = async () =>
        (await pool.query(`select accepted_at, ended_at, name from relationship where id = $1`, [group.id])).rows[0]
      const before = await stateOf()

      const { status, location } = await join({
        personId: claire.id,
        groupId: group.id,
        as: 'leader',
      })

      expect(status).toBe(303)
      expect(location.pathname).toBe('/roster')
      expect(Object.fromEntries(location.searchParams)).toEqual({ invited: claire.id })
      expect(await leadsIt(group.id, claire.id)).toEqual([{ accepted: false }])
      expect(await stateOf()).toEqual(before)

      // A queued invitation for her, and nothing for anybody else.
      const [toClaire, ...more] = await queuedFor(claire.id)
      expect(more).toEqual([])
      expect(toClaire).toContain('/invitation/')
      expect(await queuedFor(group.leader)).toEqual([])

      // The receipt says she was invited and that the group carries on, not that
      // she leads it.
      const landed = await getPage(`${location.pathname}${location.search}`, cookie)
      expect(landed.html).toContain(
        `${claire.name} has been invited to help lead the group, and nobody else has been contacted. `
        + 'The group carries on meanwhile.',
      )

      // The Roster shows the group on her row, awaiting her acceptance, and on the
      // row of the leader who has accepted it as running.
      const disciplers = await getPage('/roster', cookie)
      const hers = rowFor(disciplers.html, claire.name)
      // She leads it, named by its name (Roles per pairing, ticket 02).
      expect(hers).toContain('leads Monday Table 2 members')
      expect(hers).toContain('awaiting acceptance')
      expect(rowFor(disciplers.html, group.leaderName)).not.toContain('awaiting acceptance')
    })

    // Manual pairing, recut ticket 01: the other end of the invitation above.
    it('shows her who she would lead and who with, and her acceptance leaves the running group as it was', async () => {
      const group = await aGroup('Evening Table', 'male')
      const claire = await aDiscipler()
      await join({ personId: claire.id, groupId: group.id, as: 'leader' })
      const stateOf = async () =>
        (await pool.query(`select accepted_at, ended_at, name from relationship where id = $1`, [group.id])).rows[0]
      const before = await stateOf()

      const [invitation] = await queuedFor(claire.id)
      const link = invitation?.match(/\/invitation\/[0-9a-f-]{36}/)?.[0]
      expect(link, 'her invitation carries no link').toBeDefined()

      // The reveal, with no session: the Disciples, and the leader she would join,
      // both above anything she is asked for.
      const page = await fetch(`${baseUrl}${link}`, { redirect: 'manual' })
      const html = (await page.text()).replace(/<!-- -->/g, '')
      expect(page.status).toBe(200)
      for (const disciple of group.discipleNames) expect(html).toContain(disciple)
      expect(html).toContain(`You will be leading with ${group.leaderName}.`)
      expect(html.indexOf(group.leaderName)).toBeLessThan(html.indexOf('name="password"'))

      const accepted = await fetch(`${baseUrl}${link}/accept`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ fullName: claire.name, password: 'a-long-enough-password' }),
      })
      expect(accepted.status).toBe(303)
      expect(accepted.headers.get('location')).toContain('done=accepted')

      // Her Acceptance, and nothing else: the group's activation is the moment it
      // had, and no Starter Message went to anybody a second time. She alone is
      // sent hers, which names nobody and carries the link to who she is leading.
      expect(await leadsIt(group.id, claire.id)).toEqual([{ accepted: true }])
      expect(await stateOf()).toEqual(before)
      const [, starter, ...more] = await queuedFor(claire.id)
      expect(more).toEqual([])
      expect(starter).toContain('You have been paired for discipleship. See who you’re meeting with')
      for (const disciple of group.discipleNames) expect(starter).not.toContain(disciple)
      expect(await queuedFor(group.leader)).toEqual([])
      for (const disciple of group.disciples) expect(await queuedFor(disciple)).toEqual([])

      // And the Roster stops saying she is awaited.
      const disciplers = await getPage('/roster', cookie)
      expect(rowFor(disciplers.html, claire.name)).not.toContain('awaiting acceptance')
    })

    it('lets the Admin clear her unanswered invitation with the Resolve button the page gives them', async () => {
      const group = await aGroup('Morning Table', 'male')
      const claire = await aDiscipler()
      await join({ personId: claire.id, groupId: group.id, as: 'leader' })
      await pool.query(
        `insert into follow_up_item (ministry_id, kind, relationship_id, raised_at, payload)
         values ($1, 'relationship_unaccepted', $2, $3, '{}')`,
        [ministry.id, group.id, new Date()],
      )

      const before = await getPage('/follow-up', cookie)
      expect(before.html.replace(/<!-- -->/g, '')).toContain(
        `${claire.name} was invited to help lead this group and has not answered. The group carries on meanwhile.`,
      )
      // A running group is never cancelled over one leader who has not answered.
      expect(before.html).not.toContain('/follow-up/relationship/cancel')

      // Pressed as the page offers it: the form's own action and its own hidden field.
      const form = before.html.match(
        /<form[^>]*action="(\/follow-up\/resolve)"[^>]*>\s*<input[^>]*name="itemId"[^>]*value="([^"]+)"/,
      )
      expect(form, 'the page offers no Resolve form').not.toBeNull()
      const pressed = await fetch(`${baseUrl}${form![1]}`, {
        method: 'POST',
        redirect: 'manual',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ itemId: form![2]! }),
      })
      expect(pressed.status).toBe(303)
      expect(pressed.headers.get('location')).toContain('done=resolved')

      const after = await getPage('/follow-up?done=resolved', cookie)
      expect(after.html).toContain('Item cleared')
      expect(after.html).not.toContain(claire.name)
      const { rows } = await pool.query<{ resolved_by: string | null }>(
        `select resolved_by from follow_up_item where id = $1`,
        [form![2]],
      )
      expect(rows).toEqual([{ resolved_by: ministry.adminUserId }])

      // Resolving says an Admin looked. It withdraws nothing: she is still invited.
      expect(await leadsIt(group.id, claire.id)).toEqual([{ accepted: false }])
    })

    it('refuses a Discipler who already leads a group, with a code of its own', async () => {
      const theirs = await aGroup('Tuesday Table', 'male')
      const another = await aGroup('Wednesday Table', 'male')

      const { status, location } = await join({ personId: theirs.leader, groupId: another.id, as: 'leader' })

      expect(status).toBe(303)
      expect(Object.fromEntries(location.searchParams)).toEqual({
        pair: theirs.leader,
        groupId: another.id,
        error: 'joining.already_leads_a_group',
      })
      expect(await leadsIt(another.id, theirs.leader)).toEqual([])
    })

    it('accepts a Discipler with two one-to-ones and no group', async () => {
      const claire = await aDiscipler()
      await pairOneToOne(ministry, claire.id, (await aDisciple('male')).id)
      await pairOneToOne(ministry, claire.id, (await aDisciple('male')).id)
      const group = await aGroup('Saturday Table', 'male')

      const { location } = await join({ personId: claire.id, groupId: group.id, as: 'leader' })

      expect(location.searchParams.get('invited')).toBe(claire.id)
      expect(await leadsIt(group.id, claire.id)).toEqual([{ accepted: false }])
    })

    it('refuses a body that says neither, and adds nobody as anything', async () => {
      const group = await aGroup('Sunday Table', 'male')
      const claire = await aDiscipler()

      const { location } = await join({ personId: claire.id, groupId: group.id, as: 'leadr' })

      expect(location.searchParams.get('error')).toBe('joining.role_not_recognised')
      expect(await leadsIt(group.id, claire.id)).toEqual([])
      expect(await inTheGroup(group.id, claire.id)).toBe(false)
    })
  })
})
