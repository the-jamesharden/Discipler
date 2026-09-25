import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  aTestPhoneNumber,
  addMembership,
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  pairOneToOne,
  pauseRelationship,
  type MinistryFixture,
} from '../support/local-supabase'
import {
  attribute,
  shownBehind,
  detailsOf,
  expectGreyed,
  expectOpen,
  expectOpenGroup,
  hiddenIn,
  offeredAs,
  sectionsOf,
  offersToMentor,
  popupIn,
  rowFor,
} from '../support/pair-popup'

/**
 * The Ministry's groups in the Pair popup opened from a Disciple (Manual pairing,
 * recut ticket 03), as an Admin's browser receives it: a Groups heading under the
 * Disciplers, one row per group the Disciple is not already in and whose own
 * declaration does not rule them out, and **Add to group**, which posts to the route
 * that puts them straight in.
 *
 * What needs script (choosing a group clearing a chosen Discipler, and the other
 * way round) is looked at in a browser. The server renders the same component, so
 * a group restored from a refusal shows the sentence, the button and where the
 * form posts here.
 */
describe.skipIf(skipUnlessAppIsRunning)('the groups in the Pair popup, from a Disciple', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string
  let numbered = 0
  // Letters only after the first name: a name is matched in markup below, and a
  // digit run is what a phone number looks like.
  const letter = (n: number) => String.fromCharCode(97 + (n % 26))
  const named = (first: string) => {
    const n = numbered++
    return `${first} Popgroup${letter(Math.floor(n / 26))}${letter(n)}`
  }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Groups Popup Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  type Gender = 'male' | 'female'

  const aGroup = async (
    name: string | null,
    declaredGender: Gender | null,
    over: { readonly in?: MinistryFixture; readonly accepted?: boolean } = {},
  ) => {
    const gender: Gender = declaredGender ?? 'male'
    const leaderName = named('David')
    const group = await formGroup(over.in ?? ministry, {
      name,
      declaredGender,
      ...(over.accepted === false ? { acceptedAt: null } : {}),
      leader: { name: leaderName, phone: aTestPhoneNumber(), gender },
      disciples: [
        { name: named('Emil'), phone: aTestPhoneNumber(), gender },
        { name: named('Felix'), phone: aTestPhoneNumber(), gender },
      ],
    })
    return { ...group, leaderName }
  }

  const aDisciple = async (gender: Gender, inMinistry: MinistryFixture = ministry) => {
    const name = named(gender === 'male' ? 'Sam' : 'Priya')
    return { name, id: await addPerson(inMinistry, name, { phone: aTestPhoneNumber(), answers: { gender } }) }
  }

  const popupFor = async (personId: string, more: Record<string, string> = {}, as: string = cookie) => {
    const page = await getPage(`/roster?${new URLSearchParams({ pair: personId, ...more })}`, as)
    return { ...page, popup: popupIn(page.html)! }
  }

  /**
   * A Ministry of a test's own, for a test that says exactly what the popup lists:
   * the shared one fills with every other test's groups and their Disciplers.
   */
  const aMinistryOfItsOwn = async (name: string) => {
    const own = await createMinistryWithAdmin(name)
    return { own, ownCookie: (await signIn(own)).cookie }
  }

  /** Every group the popup offers, by the value its round mark would post. */
  const groupsOffered = (popup: string) => offeredAs(popup, 'groupId')

  const formOf = (popup: string): string => popup.match(/<form[^>]*>/)![0]

  const join = async (fields: Record<string, string>) => {
    const response = await fetch(`${baseUrl}/roster/pair/join`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams(fields),
    })
    return new URL(response.headers.get('location') ?? '', baseUrl)
  }

  it('lists the groups under a Groups heading, below the Disciplers, and leaves out one the Disciple is in', async () => {
    const { own, ownCookie } = await aMinistryOfItsOwn('Three Groups Chapel')
    const sam = await aDisciple('male', own)
    const his = await aGroup('Thursday Table', null, { in: own })
    await addMembership({ ministry: own, relationshipId: his.id, kind: 'group', personId: sam.id, role: 'participant' })
    const paused = await aGroup('Men’s Breakfast', 'male', { in: own })
    await pauseRelationship(own, paused.id)
    const unnamed = await aGroup(null, null, { in: own, accepted: false })

    const { popup } = await popupFor(sam.id, {}, ownCookie)

    // One row per group he is not already in, each a round mark of its own field.
    expect([...groupsOffered(popup)].sort()).toEqual([paused.id, unnamed.id].sort())
    expect(groupsOffered(popup)).not.toContain(his.id)
    for (const id of [paused.id, unnamed.id]) {
      expect(attribute(rowFor(popup, id).match(/<input[^>]*>/)![0], 'type')).toBe('radio')
    }

    // The heading, once, after the last Discipler and before the first group.
    expect(popup.match(/>Groups</g)).toHaveLength(1)
    const heading = popup.indexOf('>Groups<')
    const lastDiscipler = popup.lastIndexOf('name="leaderId"')
    const firstGroup = popup.indexOf('name="groupId"')
    expect(lastDiscipler).toBeGreaterThan(-1)
    expect(heading).toBeGreaterThan(lastDiscipler)
    expect(firstGroup).toBeGreaterThan(heading)

    // Its name, its leaders, how many Disciples, what it declared, and its state
    // when it is not running.
    const pausedRow = rowFor(popup, paused.id)
    expect(pausedRow).toContain('Men’s Breakfast')
    expect(detailsOf(pausedRow)).toBe(`led by ${paused.leaderName} · 2 disciples · Men’s · paused`)
    expect(pausedRow).toContain('>MB<')

    // One nobody has named is its leaders' group, never a second row reading as a
    // person, and does not say them twice.
    const unnamedRow = rowFor(popup, unnamed.id)
    expect(unnamedRow).toMatch(new RegExp(`class="pair-name"[^>]*>${unnamed.leaderName}’s group<`))
    expect(detailsOf(unnamedRow)).toBe('2 disciples · Coed · awaiting acceptance')

    // The line under the title counts both: the three who lead a group, whom the
    // list opens on, everybody else folded (Roles per pairing, ticket 01), and the
    // two groups.
    const { first, everyoneElse } = sectionsOf(popup)
    expect([...first].sort()).toEqual([his.leader, paused.leader, unnamed.leader].sort())
    expect(popup).toContain(`>3 lead or offered · ${everyoneElse.length} more · 2 groups<`)
  })

  it('shows no heading and counts no groups in a Ministry with none', async () => {
    const bare = await createMinistryWithAdmin('No Groups Chapel')
    const bareCookie = (await signIn(bare)).cookie
    const sam = await aDisciple('male', bare)
    const claire = await addPerson(bare, named('Claire'), { phone: aTestPhoneNumber(), answers: { gender: 'male' } })
    await offersToMentor(pool, bare, claire)

    const { popup } = await popupFor(sam.id, {}, bareCookie)

    expect(popup).toContain('>1 lead or offered')
    expect(popup).not.toContain('>Groups<')
    expect(popup).not.toMatch(/\d groups?\b/)
    expect(groupsOffered(popup)).toEqual([])
  })

  it('never lists another Ministry’s group', async () => {
    const other = await createMinistryWithAdmin('The Chapel Across The Road')
    const theirs = await aGroup('Their Table', null, { in: other })
    const sam = await aDisciple('male')

    expect(groupsOffered((await popupFor(sam.id)).popup)).not.toContain(theirs.id)
  })

  describe('who is left out, and who is greyed', () => {
    // Decided by James on 2026-09-21: from a Disciple, a group gender rules out is
    // not shown at all, in place of a greyed row that says *A men's group*.
    it('leaves out a men’s group for a woman, shows her a Coed one and a women’s one, and counts what it shows', async () => {
      const { own, ownCookie } = await aMinistryOfItsOwn('Men And Women Chapel')
      const priya = await aDisciple('female', own)
      const mens = await aGroup('Men’s Breakfast', 'male', { in: own })
      const coed = await aGroup('Thursday Table', null, { in: own })
      const womens = await aGroup('Grace’s Group', 'female', { in: own })

      const { popup } = await popupFor(priya.id, {}, ownCookie)

      // The men's group is not there, and neither is its row's name.
      expect([...groupsOffered(popup)].sort()).toEqual([coed.id, womens.id].sort())
      expect(popup).not.toContain('Men’s Breakfast')
      expectOpenGroup(popup, coed.id)
      expectOpenGroup(popup, womens.id)
      // Nor are the two men who lead, or anybody else of theirs, while the Ministry
      // enforces the match: the one who leads she is shown is the woman, and the
      // women of her group are folded under Everyone else. The line above counts
      // what is shown.
      const { first, everyoneElse } = sectionsOf(popup)
      expect(first).toEqual([womens.leader])
      expect(everyoneElse).toEqual(expect.arrayContaining(womens.disciples))
      for (const man of [mens.leader, coed.leader, ...mens.disciples, ...coed.disciples]) {
        expect(offeredAs(popup, 'leaderId')).not.toContain(man)
      }
      expect(popup).toContain(`>1 lead or offered · ${everyoneElse.length} more · 2 groups<`)

      // A man is shown the men's group and the Coed one, and not the women's.
      const sam = await aDisciple('male', own)
      const his = (await popupFor(sam.id, {}, ownCookie)).popup
      expect([...groupsOffered(his)].sort()).toEqual([coed.id, mens.id].sort())
      expect([...sectionsOf(his).first].sort()).toEqual([coed.leader, mens.leader].sort())

      // Leaving it out removes no rule underneath: the database still refuses her.
      const refused = await fetch(`${baseUrl}/roster/pair/join`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: ownCookie },
        body: new URLSearchParams({ personId: priya.id, groupId: mens.id }),
      }).then((response) => new URL(response.headers.get('location') ?? '', baseUrl))
      expect(refused.searchParams.get('error')).toBe('relationship.gender_does_not_match_the_declaration')
    })

    it('greys every Discipler for a Disciple already in a one-to-one, and the groups stay open', async () => {
      const sam = await aDisciple('male')
      const markName = named('Mark')
      const mark = await addPerson(ministry, markName, { phone: aTestPhoneNumber(), answers: { gender: 'male' } })
      await pairOneToOne(ministry, mark, sam.id)
      const mens = await aGroup('Saturday Men', 'male')
      const coed = await aGroup('Sunday Table', null)

      const { popup } = await popupFor(sam.id)

      expectGreyed(popup, mens.leader, `Already in a 1:1 with ${markName}`)
      expectGreyed(popup, coed.leader, `Already in a 1:1 with ${markName}`)
      expectOpenGroup(popup, mens.id)
      expectOpenGroup(popup, coed.id)
    })
  })

  it('asks nothing else: no shape, no gender, no name and no Material', async () => {
    const sam = await aDisciple('male')
    const group = await aGroup('Thursday Table', null)

    const { popup } = await popupFor(sam.id, { groupId: group.id, error: 'joining.group_has_ended' })

    expect(popup).not.toContain('<select')
    expect(popup).not.toContain('type="text"')
    expect(popup).not.toContain('type="checkbox"')
    expect(popup).not.toContain('name="declaredGender"')
  })

  it('puts the Disciple straight into the group, and the Roster’s receipt says so', async () => {
    const sam = await aDisciple('male')
    const group = await aGroup('Thursday Table', null)

    // Nothing chosen yet: the form is the pairing form, and the button reads Pair.
    // Until script runs no group can be marked, so that form never carries one, and
    // a Discipler can be, because pairing is the form's own act.
    const fresh = (await popupFor(sam.id)).popup
    expect(attribute(formOf(fresh), 'action')).toBe('/roster/pair/create')
    expectOpenGroup(fresh, group.id)
    expectOpen(fresh, group.leader)
    expect(fresh).toMatch(/<button[^>]*type="submit"[^>]*>Pair<\/button>/)

    // Over what the Roster showed behind the popup (Roles per pairing, ticket 02).
    const landed = await join({ personId: sam.id, groupId: group.id, pairings: 'being-discipled' })
    expect(landed.pathname).toBe('/roster')
    expect(landed.searchParams.get('pairings')).toBe('being-discipled')
    expect(landed.searchParams.get('joined')).toBe(sam.id)
    expect(landed.searchParams.get('pair')).toBeNull()

    const { rows } = await pool.query<{ role: string }>(
      `select role from relationship_member
        where relationship_id = $1 and person_id = $2 and ended_at is null`,
      [group.id, sam.id],
    )
    expect(rows).toEqual([{ role: 'participant' }])

    const { html } = await getPage(`${landed.pathname}${landed.search}`, cookie)
    expect(popupIn(html)).toBeNull()
    expect(shownBehind(html)).toBe('Being discipled')
    expect(html).toContain(`${sam.name} is in the group now.`)

    // And it is no longer offered to him.
    expect(groupsOffered((await popupFor(sam.id)).popup)).not.toContain(group.id)
  })

  it('reopens on a refusal with the reason and the chosen group restored', async () => {
    const sam = await aDisciple('male')
    const group = await aGroup('Thursday Table', null)
    const second = await aGroup('Friday Table', null)

    // Whatever was refused, the address carries the code and the group chosen. A
    // group that can still be chosen comes back chosen.
    const { html, popup } = await popupFor(sam.id, { groupId: group.id, error: 'joining.group_has_ended' })

    expect(popup).toContain(`Pair ${sam.name}`)
    expect(popup).toMatch(/role="alert"/)
    expect(popup).not.toContain('joining.group_has_ended')
    expect(rowFor(popup, group.id)).toMatch(/checked=""/)
    expect(rowFor(popup, second.id)).not.toMatch(/checked=""/)
    expect(popup.match(/checked=""/g)).toHaveLength(1)

    // The sentence names the group and every leader, and the button is the same act.
    expect(popup).toContain(`${sam.name} will join Thursday Table, led by ${group.leaderName}.`)
    expect(popup).toMatch(/<button[^>]*type="submit"[^>]*>Add to group<\/button>/)

    // The group the server sent chosen can be pressed as it stands; one not chosen
    // waits for script, which is what points the form at the route that joins.
    expectOpenGroup(popup, group.id)
    expectOpenGroup(popup, second.id)
    // And so does every Discipler: the form points at the route that joins, and one
    // marked beside the group before script ran would be posted there and ignored.
    for (const id of offeredAs(popup, 'leaderId')) {
      const mark = rowFor(popup, id!).match(/<input[^>]*>/)![0]
      expect(mark).toMatch(/\sdisabled=""/)
      expect(mark).not.toMatch(/\schecked=""/)
    }
    expect(offeredAs(popup, 'leaderId').length).toBeGreaterThan(0)

    // Pressed again as it stands, it posts to the route that joins, naming him.
    expect(attribute(formOf(popup), 'action')).toBe('/roster/pair/join')
    expect(hiddenIn(popup)).toMatchObject({ personId: sam.id })
    expect(shownBehind(html)).toBe('Everyone')
    expect(html.match(/class="modal-bg open"/g)).toHaveLength(1)
  })

  it('round trips a real refusal: the reason in words for this act, and a group not on the list is not restored', async () => {
    const priya = await aDisciple('female')
    const mens = await aGroup('Men’s Breakfast', 'male')

    const refused = await join({ personId: priya.id, groupId: mens.id })
    expect(refused.pathname).toBe('/roster')
    expect(refused.searchParams.get('pair')).toBe(priya.id)
    expect(refused.searchParams.get('groupId')).toBe(mens.id)

    const { html } = await getPage(`${refused.pathname}${refused.search}`, cookie)
    const popup = popupIn(html)!
    expect(popup).toMatch(/role="alert"/)
    // Worded for joining: *say it is mixed* is no fix when the group already said what it is.
    expect(popup).not.toMatch(/say it is mixed/i)
    expect(groupsOffered(popup)).not.toContain(mens.id)
    expect(popup).not.toMatch(/checked=""/)
    expect(popup).toMatch(/<button[^>]*type="submit"[^>]*>Pair<\/button>/)
  })

  it('restores nothing for a `groupId` that is not on the popup’s list', async () => {
    const sam = await aDisciple('male')
    await aGroup('Thursday Table', null)

    const { popup } = await popupFor(sam.id, { groupId: crypto.randomUUID(), error: 'joining.group_not_found' })

    expect(popup).toMatch(/role="alert"/)
    expect(popup).not.toMatch(/checked=""/)
  })
})
