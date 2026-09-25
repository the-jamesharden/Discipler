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
  pauseRelationship,
  type MinistryFixture,
} from '../support/local-supabase'
import {
  attribute,
  chosenIn,
  currentList,
  detailsOf,
  expectGreyed,
  expectOpenGroup,
  hiddenIn,
  inputsIn,
  offeredAs,
  sectionsOf,
  offersToMentor,
  popupIn,
  rowFor,
} from '../support/pair-popup'

/**
 * The Ministry's groups in the Pair popup opened from a Discipler (Manual pairing,
 * recut ticket 04), as an Admin's browser receives it: a Groups heading under the
 * Disciples, one row per group the Discipler is not already in and whose own
 * declaration does not rule them out, and **Add as co-leader**, which posts to the
 * route that invites them to help lead it.
 *
 * What needs script (ticking a Disciple clearing a chosen group, and the other way
 * round, and Clear) is driven without a browser in `tests/app/pair-shape.test.ts`
 * and looked at in one. The server renders the same component, so a group restored
 * from a refusal shows the sentence, the button and where the form posts here.
 */
describe.skipIf(skipUnlessAppIsRunning)('the groups in the Pair popup, from a Discipler', () => {
  let pool: pg.Pool
  let numbered = 0
  // Letters only after the first name: a name is matched in markup below, and a
  // digit run is what a phone number looks like.
  const letter = (n: number) => String.fromCharCode(97 + (n % 26))
  const named = (first: string) => {
    const n = numbered++
    return `${first} Colead${letter(Math.floor(n / 26))}${letter(n)}`
  }

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  type Gender = 'male' | 'female'

  /** A Ministry of a test's own, since every test here says exactly what the popup lists. */
  const aMinistry = async (name: string) => {
    const ministry = await createMinistryWithAdmin(name)
    return { ministry, cookie: (await signIn(ministry)).cookie }
  }

  const aGroup = async (
    ministry: MinistryFixture,
    name: string | null,
    declaredGender: Gender | null,
    over: { readonly accepted?: boolean; readonly leaderGender?: Gender } = {},
  ) => {
    const gender: Gender = over.leaderGender ?? declaredGender ?? 'female'
    const leaderName = named('Grace')
    const group = await formGroup(ministry, {
      name,
      declaredGender,
      ...(over.accepted === false ? { acceptedAt: null } : {}),
      leader: { name: leaderName, phone: aTestPhoneNumber(), gender },
      disciples: [
        { name: named('Emily'), phone: aTestPhoneNumber(), gender },
        { name: named('Freya'), phone: aTestPhoneNumber(), gender },
      ],
    })
    return { ...group, leaderName }
  }

  // Somebody with no gender on file is shown every group: proved on the pure rule in
  // `tests/app/who-is-greyed.test.ts`, because Intake asks gender of everybody, and
  // nobody who has not completed Intake can open this popup at all.

  /** Somebody who offered to mentor and leads nobody: a Discipler by the Roster's own rule. */
  const aDiscipler = async (ministry: MinistryFixture, gender: Gender) => {
    const name = named(gender === 'female' ? 'Claire' : 'Tom')
    const id = await addPerson(ministry, name, { phone: aTestPhoneNumber(), answers: { gender } })
    await offersToMentor(pool, ministry, id)
    return { name, id }
  }

  const popupFor = async (cookie: string, personId: string, more: Record<string, string> = {}) => {
    const page = await getPage(`/roster?${new URLSearchParams({ list: 'disciplers', pair: personId, ...more })}`, cookie)
    return { ...page, popup: popupIn(page.html)! }
  }

  /** Every group the popup offers, by the value its round mark would post. */
  const groupsOffered = (popup: string) => offeredAs(popup, 'groupId')

  const formOf = (popup: string): string => popup.match(/<form[^>]*>/)![0]

  const join = async (cookie: string, fields: Record<string, string>) => {
    const response = await fetch(`${baseUrl}/roster/pair/join`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams(fields),
    })
    return new URL(response.headers.get('location') ?? '', baseUrl)
  }

  it('lists the groups under a Groups heading below the Disciples, for a Discipler who leads nobody, and counts both', async () => {
    const { ministry, cookie } = await aMinistry('Co-leader Chapel, Leads Nobody')
    const claire = await aDiscipler(ministry, 'female')
    const womens = await aGroup(ministry, 'Grace’s Group', 'female')
    const coed = await aGroup(ministry, 'Thursday Table', null, { leaderGender: 'male' })
    await pauseRelationship(ministry, coed.id)
    const unnamed = await aGroup(ministry, null, 'female', { accepted: false })
    // Ruled out by what it declared: not listed at all, and not counted.
    const mens = await aGroup(ministry, 'Men’s Breakfast', 'male')
    // One she is already in, as a Disciple. One she is already invited to lead is
    // the round trip's to show, since it also makes her somebody who leads a group.
    const hers = await aGroup(ministry, 'Already In It', 'female')
    await addMembership({ ministry, relationshipId: hers.id, kind: 'group', personId: claire.id, role: 'participant' })

    const { popup } = await popupFor(cookie, claire.id)

    expect([...groupsOffered(popup)].sort()).toEqual([womens.id, coed.id, unnamed.id].sort())
    for (const absent of [mens.id, hers.id]) expect(groupsOffered(popup)).not.toContain(absent)
    expect(popup).not.toContain('Men’s Breakfast')

    // Round marks under boxes: a group is one choice, and Disciples are several.
    for (const id of [womens.id, coed.id, unnamed.id]) {
      expect(attribute(rowFor(popup, id).match(/<input[^>]*>/)![0], 'type')).toBe('radio')
    }

    // The heading, once, after the last Disciple and before the first group.
    expect(popup.match(/>Groups</g)).toHaveLength(1)
    const heading = popup.indexOf('>Groups<')
    const boxes = inputsIn(popup).filter((input) => attribute(input, 'name') === 'participantId')
    expect(boxes.length).toBeGreaterThan(0)
    expect(popup.lastIndexOf(boxes.at(-1)!)).toBeLessThan(heading)
    expect(popup.indexOf(`value="${womens.id}"`)).toBeGreaterThan(heading)

    // The toolbar counts both, and only what is listed: the men of the Coed group and
    // of the men's are on her list once a Group of hers is Coed, and not before.
    const listed = offeredAs(popup, 'participantId')
    for (const man of [...mens.disciples, ...coed.disciples]) expect(listed).not.toContain(man)
    for (const woman of [...womens.disciples, ...unnamed.disciples, ...hers.disciples]) expect(listed).toContain(woman)
    // Those who lead are on it too, since anybody can be picked (Roles per pairing,
    // ticket 01), folded under Everyone else with the rest.
    for (const woman of [womens.leader, unnamed.leader]) expect(listed).toContain(woman)
    expect(listed).not.toContain(coed.leader)
    const { first, everyoneElse } = sectionsOf(popup)
    expect(first.length + everyoneElse.length).toBe(listed.length)
    expect(popup).toContain(`${first.length} asked · ${everyoneElse.length} more · 3 groups`)

    // Rows read as they do from a Disciple: the same component, on a square.
    const womensRow = rowFor(popup, womens.id)
    expect(womensRow).toContain('Grace’s Group')
    expect(womensRow).toContain('avatar of-a-group')
    expect(detailsOf(womensRow)).toBe(`led by ${womens.leaderName} · 2 disciples · Women’s`)
    expect(detailsOf(rowFor(popup, coed.id))).toBe(`led by ${coed.leaderName} · 2 disciples · Coed · paused`)
    // Nobody has named it, so it is its leader's group, and does not say her twice.
    const unnamedRow = rowFor(popup, unnamed.id)
    expect(unnamedRow).toContain(`${unnamed.leaderName}’s group`)
    expect(detailsOf(unnamedRow)).toBe('2 disciples · Women’s · awaiting acceptance')

    for (const id of [womens.id, coed.id, unnamed.id]) expectOpenGroup(popup, id)

    // Nothing chosen: the form still pairs, and nothing of a group is posted.
    expect(formOf(popup)).toContain('action="/roster/pair/create"')
    expect(hiddenIn(popup)).toEqual({ pair: claire.id, list: 'disciplers', side: 'discipler', leaderId: claire.id })
  })

  it('shows no heading and counts no groups in a Ministry with none', async () => {
    const { ministry, cookie } = await aMinistry('Co-leader Chapel, No Groups')
    const claire = await aDiscipler(ministry, 'female')
    await addPerson(ministry, named('Sam'), { phone: aTestPhoneNumber(), answers: { gender: 'female' } })

    const { popup } = await popupFor(cookie, claire.id)
    expect(popup).not.toContain('>Groups<')
    expect(popup).toContain('>1 asked')
    expect(popup).not.toContain('groups')
    expect(inputsIn(popup).filter((input) => attribute(input, 'name') === 'groupId')).toEqual([])
  })

  it('greys every group row for a Discipler who already leads a group, beside the 1:2 and Group shapes', async () => {
    const { ministry, cookie } = await aMinistry('Co-leader Chapel, Already Leads')
    const theirs = await aGroup(ministry, 'Grace’s Group', 'female')
    const another = await aGroup(ministry, 'Thursday Table', null)
    const third = await aGroup(ministry, 'Friday Table', 'female')
    const first = theirs.leaderName.split(' ')[0]!

    const { popup } = await popupFor(cookie, theirs.leader, { groupId: another.id })

    // The one they lead is not listed; every other is, greyed with the cap by first name.
    expect([...groupsOffered(popup)].sort()).toEqual([another.id, third.id].sort())
    for (const id of [another.id, third.id]) expectGreyed(popup, id, `${first} already leads a group`)
    // A greyed group is not restored as chosen, so nothing here joins anything.
    expect(popup).not.toContain('will co-lead')
    expect(formOf(popup)).toContain('action="/roster/pair/create"')

    // And posted anyway, the route refuses it in words that name them.
    const refused = await join(cookie, { personId: theirs.leader, groupId: another.id, as: 'leader', list: 'disciplers' })
    expect(refused.searchParams.get('error')).toBe('joining.already_leads_a_group')
    expect(refused.searchParams.get('groupId')).toBe(another.id)
    const reopened = popupIn((await getPage(`${refused.pathname}${refused.search}`, cookie)).html)!
    expect(reopened).toMatch(new RegExp(`role="alert"[^>]*>${theirs.leaderName} already leads a group\\.`))
    expect(reopened).not.toContain('joining.already_leads_a_group')
    expect(chosenIn(reopened)).toEqual([])
  })

  it('says who they will co-lead with, and posts the chosen group to the route that joins, as a leader', async () => {
    const { ministry, cookie } = await aMinistry('Co-leader Chapel, Chosen')
    const claire = await aDiscipler(ministry, 'female')
    const group = await aGroup(ministry, 'Grace’s Group', 'female')
    const second = await aGroup(ministry, 'Friday Table', 'female')
    const sam = await addPerson(ministry, named('Sam'), { phone: aTestPhoneNumber(), answers: { gender: 'female' } })

    // Whatever was refused, the address carries the code and the group chosen. A
    // group that can still be chosen comes back chosen, with the reason.
    const { html, popup } = await popupFor(cookie, claire.id, { groupId: group.id, error: 'joining.group_has_ended' })
    expect(popup).toMatch(/role="alert"[^>]*>That group has ended/)
    expect(popup).not.toContain('joining.group_has_ended')
    expect(rowFor(popup, group.id)).toMatch(/checked=""/)
    expect(chosenIn(popup)).toEqual([group.id])
    expect(currentList(html)).toBe('Disciplers')

    expect(popup).toContain(`${claire.name} will co-lead Grace’s Group with ${group.leaderName}.`)
    expect(popup).toMatch(/<button[^>]*type="submit"[^>]*>Add as co-leader<\/button>/)
    expect(popup).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/)

    // One thing at a time: with a group chosen nothing a shape asks is on screen.
    expect(popup).not.toContain('Pair them as')
    expect(popup).not.toContain('pair-declares')
    expect(popup).not.toContain('Group name')
    expect(popup).not.toContain('<select')

    // The form names her as the Person to add and says as what, and not as a Discipler to pair.
    expect(formOf(popup)).toContain('action="/roster/pair/join"')
    expect(hiddenIn(popup)).toEqual({ pair: claire.id, list: 'disciplers', side: 'discipler', personId: claire.id, as: 'leader' })

    // The chosen group can be pressed as it stands. Every other mark waits for
    // script: the form points at the route that joins, and a Disciple ticked beside
    // the group before script ran would be posted there and ignored.
    expectOpenGroup(popup, group.id)
    expectOpenGroup(popup, second.id)
    const box = rowFor(popup, sam).match(/<input[^>]*>/)![0]
    expect(box).toMatch(/\sdisabled=""/)
    expect(box).not.toMatch(/\schecked=""/)
    expect(rowFor(popup, sam)).not.toContain('pair-why')
  })

  it('names every leader a group already has, and an unnamed group as its leaders’ group', async () => {
    const { ministry, cookie } = await aMinistry('Co-leader Chapel, Several Leaders')
    const claire = await aDiscipler(ministry, 'female')
    const group = await aGroup(ministry, 'Thursday Table', 'female')
    const other = await aDiscipler(ministry, 'female')
    await addMembership({ ministry, relationshipId: group.id, kind: 'group', personId: other.id, role: 'leader' })
    const unnamed = await aGroup(ministry, null, 'female')

    const several = (await popupFor(cookie, claire.id, { groupId: group.id })).popup
    expect(several).toMatch(
      new RegExp(`${claire.name} will co-lead Thursday Table with (${group.leaderName} and ${other.name}|${other.name} and ${group.leaderName})\\.`),
    )

    const theirs = (await popupFor(cookie, claire.id, { groupId: unnamed.id })).popup
    expect(theirs).toContain(`${claire.name} will co-lead ${unnamed.leaderName}’s group.`)
  })

  it('invites her to help lead it: the receipt says invited and carrying on, and the group is as it was', async () => {
    const { ministry, cookie } = await aMinistry('Co-leader Chapel, Round Trip')
    const claire = await aDiscipler(ministry, 'female')
    const group = await aGroup(ministry, 'Grace’s Group', 'female')
    const before = await pool.query(`select accepted_at, ended_at from relationship where id = $1`, [group.id])

    // Exactly what the popup's form posts once the group is chosen.
    const { popup } = await popupFor(cookie, claire.id, { groupId: group.id })
    const location = await join(cookie, { ...(hiddenIn(popup) as Record<string, string>), groupId: group.id })
    expect(location.pathname).toBe('/roster')
    expect(Object.fromEntries(location.searchParams)).toEqual({ list: 'disciplers', invited: claire.id })

    const { html } = await getPage(`${location.pathname}${location.search}`, cookie)
    expect(popupIn(html)).toBeNull()
    expect(currentList(html)).toBe('Disciplers')
    expect(html).toContain(
      `${claire.name} has been invited to help lead the group, and nobody else has been contacted. `
      + 'The group carries on meanwhile.',
    )
    expect(html).not.toContain(`${claire.name} leads`)

    // She is a leader of it who has not accepted, with an invitation of her own,
    // and the group itself is untouched.
    const membership = await pool.query<{ role: string; accepted_at: Date | null }>(
      `select role, accepted_at from relationship_member
        where relationship_id = $1 and person_id = $2 and ended_at is null`,
      [group.id, claire.id],
    )
    expect(membership.rows).toEqual([{ role: 'leader', accepted_at: null }])
    const invitations = await pool.query(
      `select 1 from invitation where relationship_id = $1 and person_id = $2 and consumed_at is null`,
      [group.id, claire.id],
    )
    expect(invitations.rows).toHaveLength(1)
    expect((await pool.query(`select accepted_at, ended_at from relationship where id = $1`, [group.id])).rows).toEqual(before.rows)

    // And it is no longer offered to her: she is in it now.
    expect(groupsOffered((await popupFor(cookie, claire.id)).popup)).not.toContain(group.id)
  })

  it('restores nothing for a `groupId` that is not on the popup’s list', async () => {
    const { ministry, cookie } = await aMinistry('Co-leader Chapel, Not Listed')
    const claire = await aDiscipler(ministry, 'female')
    const mens = await aGroup(ministry, 'Men’s Breakfast', 'male')

    // A real refusal: her gender rules the group out, so it was never listed for her.
    const refused = await join(cookie, { personId: claire.id, groupId: mens.id, as: 'leader', list: 'disciplers' })
    expect(refused.searchParams.get('error')).toBe('relationship.gender_does_not_match_the_declaration')

    const popup = popupIn((await getPage(`${refused.pathname}${refused.search}`, cookie)).html)!
    expect(popup).toMatch(/role="alert"[^>]*>This is a men’s or a women’s group/)
    expect(chosenIn(popup)).toEqual([])
    expect(popup).not.toContain('will co-lead')
    expect(formOf(popup)).toContain('action="/roster/pair/create"')
  })
})
