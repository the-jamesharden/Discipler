import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addMaterial,
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  optOut,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'
import {
  attribute,
  currentList,
  detailsOf,
  expectGreyed,
  expectLeftOut,
  expectOpen,
  freshPhoneNumbers,
  hiddenIn,
  inputsIn,
  offeredAs,
  offersToMentor as recordMentorOffer,
  popupIn,
  postPairing,
  rowFor,
  shownAs,
} from '../support/pair-popup'

/**
 * The Pair popup over the Roster, opened as a Discipler (Manual pairing, ticket
 * 23, stage 2, and recut tickets 02 and 04), as an Admin's browser receives it: the
 * list of Disciples with boxes, one tick that makes a one-to-one, and two or more
 * that become a 1:2 pair, N x 1:1 pairs or a Group, each with its Materials. No row
 * opens this side until the old Pair page retires, so it is reached here as it is
 * reached today, by its address.
 *
 * What needs script (the sentence following a tick, Clear, the toggle following a
 * pick) is driven without a browser in `tests/app/pair-shape.test.ts` and looked at
 * in one; the server renders the same component from the same selection, so ticks,
 * a shape and Materials restored from an address show the rest here.
 */

describe.skipIf(skipUnlessAppIsRunning)('the Pair popup, from a Discipler', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string

  // One Ministry holding every kind of row the list has to get right.
  let claire: string
  let sam: string
  let ana: string
  let brianna: string
  let tom: string
  let waiting: string
  let left: string
  let rosa: string
  let grace: string
  let mark: string
  let romans: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Popup Chapel, From A Discipler')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie

    claire = await addPerson(ministry, 'Claire Martinez', { phone: number(), answers: { gender: 'female' } })
    await offersToMentor(claire)
    sam = await addPerson(ministry, 'Sam Lee', { phone: '+17065557781', answers: { gender: 'female' } })
    await pool.query(`update person set email = 'sam.l@example.org' where id = $1`, [sam])
    // No number and no address, and she said this is her first time.
    ana = await addPerson(ministry, 'Ana Ruiz', { answers: { gender: 'female' } })
    await pool.query(`update intake_submission set first_time = true where person_id = $1`, [ana])
    // Already in a one-to-one, which is what one tick would make.
    const david = await addPerson(ministry, 'David Chen', { phone: number(), answers: { gender: 'female' } })
    brianna = await addPerson(ministry, 'Brianna Frazier', { phone: number(), answers: { gender: 'female' } })
    await pairOneToOne(ministry, david, brianna)
    // Of another gender, in a Ministry that enforces the match, as a new one does.
    tom = await addPerson(ministry, 'Tom Wilson', { phone: number(), answers: { gender: 'male' } })
    // Never completed Intake, so no gender on file either; and opted out.
    waiting = await addPerson(ministry, 'Jo Okafor', { phone: number(), intake: false })
    left = await addPerson(ministry, 'Opted Outerson', { phone: number() })
    await optOut(ministry, left)
    // In a group already, which hides nobody and greys nobody.
    const group = await formGroup(ministry, {
      name: 'Grace’s Group',
      declaredGender: 'female',
      leader: { name: 'Grace Lee', gender: 'female' },
      disciples: [
        { name: 'Rosa Delgado', gender: 'female', phone: '+17625551333' },
        { name: 'Emily Davis', gender: 'female' },
      ],
    })
    rosa = group.disciples[0]!
    grace = group.leader
    // Two live Materials, which the list offers in title order.
    mark = await addMaterial(ministry, 'Gospel of Mark')
    romans = await addMaterial(ministry, 'Romans')
  })

  afterAll(async () => {
    await pool.end()
  })

  const number = freshPhoneNumbers()

  const offersToMentor = (personId: string, inMinistry: MinistryFixture = ministry) =>
    recordMentorOffer(pool, inMinistry, personId)

  const popupAt = (list: string, personId: string, more: [string, string][] = []) =>
    getPage(`/roster?${new URLSearchParams([['list', list], ['pair', personId], ...more])}`, cookie)

  /** Everybody the popup offers as a Disciple, by the value their box would post, in the order listed. */
  const offered = (popup: string) => offeredAs(popup, 'participantId')

  const submit = (fields: [string, string][]) => postPairing(cookie, fields)

  it('opens on the Discipler’s side on Disciplers and on All, by address, and no row opens it yet', async () => {
    for (const list of ['disciplers', 'all']) {
      const { response, html } = await popupAt(list, claire)
      expect(response.status, list).toBe(200)
      const popup = popupIn(html)
      expect(popup, list).not.toBeNull()
      expect(popup, list).toContain('Pair Claire Martinez')
      expect(popup, list).toContain('Choose who Claire Martinez will disciple.')
      // Boxes for the Disciples, of whom several can be ticked. The only round marks
      // are the groups under them, of which one can be chosen (recut ticket 04).
      expect(popup, list).toContain('type="checkbox"')
      for (const round of inputsIn(popup!).filter((input) => attribute(input, 'type') === 'radio')) {
        expect(attribute(round, 'name'), list).toBe('groupId')
      }
      expect(currentList(html), list).toBe(list === 'all' ? 'All' : 'Disciplers')
      // The X, Cancel and the backdrop, all to the list it was drawn over.
      expect(popup!.match(new RegExp(`href="/roster\\?list=${list}"`, 'g')), list).toHaveLength(3)

      // Her row still goes to the old Pair page, which is untouched, until it retires.
      const roster = (await getPage(`/roster?list=${list}`, cookie)).html
      expect(roster, list).toContain(`href="/roster/pair?leaderId=${claire}"`)
      expect(roster, list).not.toContain(`pair=${claire}`)
    }
    expect((await getPage(`/roster/pair?leaderId=${claire}`, cookie)).response.status).toBe(200)
  })

  it('lists every Disciple who has completed Intake and not opted out, each with what their row holds', async () => {
    const popup = popupIn((await popupAt('disciplers', claire)).html)!

    // Everyone who could be paired, greyed or not, in the Roster's order; and
    // nobody who has not completed Intake (so nobody with no gender on file), nobody
    // opted out, and never Claire herself.
    const listed = offered(popup)
    expect(listed).toEqual(expect.arrayContaining([sam, ana, brianna, tom, rosa]))
    for (const absent of [waiting, left, claire]) expect(listed).not.toContain(absent)
    // Counted as shown: he is on the list only once a Coed Group opens his row.
    expect(shownAs(popup, 'participantId')).toEqual(listed.filter((id) => id !== tom))
    expect(popup).toContain(`${listed.length - 1} disciples`)
    // The toolbar counts and clears. There is no Select all.
    expect(popup).not.toMatch(/select all/i)

    const samRow = rowFor(popup, sam)
    expect(samRow).toMatch(/type="checkbox"[^>]*name="participantId"|name="participantId"[^>]*type="checkbox"/)
    expect(samRow).toContain('SL')
    expect(samRow).toContain('Sam Lee')
    expect(samRow).toContain('sam.l@example.org')
    expect(samRow).toContain('(706) 555-7781')

    // Each missing detail is simply absent, and the first-time note is the Pair page's.
    const anaRow = rowFor(popup, ana)
    expect(detailsOf(anaRow)).toBe('New to this')
    expect(anaRow).not.toContain('>-<')

    // In a group: listed, open, and the row names the group.
    const rosaRow = rowFor(popup, rosa)
    expect(rosaRow).toContain('in Grace’s Group')
    expectOpen(popup, rosa)

    // In a one-to-one: listed, and greyed with the reason. Of another gender, while
    // the Ministry enforces the match: not shown at all (James, 2026-09-21).
    expectGreyed(popup, brianna, 'Already in a 1:1 with David Chen')
    expectLeftOut(popup, tom)

    // Nothing ticked: no sentence, and the button reads Pair. Nothing else is asked.
    expect(popup).not.toContain('in a one-on-one.')
    expect(popup).toMatch(/<button[^>]*type="submit"[^>]*>Pair<\/button>/)
    expect(popup).not.toMatch(/name="(declaredGender|name|materialId|joinRequiresApproval|mode)"/)
    expect(hiddenIn(popup)).toEqual({ pair: claire, list: 'disciplers', leaderId: claire })
    expect(popup).toMatch(/<form[^>]*action="\/roster\/pair\/create"/)
  })

  it('greys nobody for gender in a Ministry that does not enforce the match', async () => {
    const relaxed = await createMinistryWithAdmin('The Chapel That Does Not Enforce, From A Discipler')
    await pool.query(`update ministry set suggest_gender_match = false where id = $1`, [relaxed.id])
    const theirCookie = (await signIn(relaxed)).cookie
    const lead = await addPerson(relaxed, 'Claire Martinez', { answers: { gender: 'female' } })
    await offersToMentor(lead, relaxed)
    const man = await addPerson(relaxed, 'Tom Wilson', { answers: { gender: 'male' } })

    const { html } = await getPage(`/roster?${new URLSearchParams({ list: 'disciplers', pair: lead })}`, theirCookie)
    expectOpen(popupIn(html)!, man)

    // A 1:2 pair still declares her gender, whatever the Ministry says of a
    // one-to-one, so he cannot be in hers. Ticked with a woman, the two of them are
    // 2 x 1:1 untouched, since that is what they can be, and nobody is unticked.
    const woman = await addPerson(relaxed, 'Sam Lee', { answers: { gender: 'female' } })
    const two = popupIn(
      (await getPage(
        `/roster?${new URLSearchParams([['list', 'disciplers'], ['pair', lead], ['with', woman], ['with', man]])}`,
        theirCookie,
      )).html,
    )!
    expect(rowFor(two, man)).toMatch(/checked=""/)
    expect(rowFor(two, woman)).toMatch(/checked=""/)
    expect(two).not.toContain('was unticked')
    expect(two).toContain('Claire Martinez will disciple Sam Lee and Tom Wilson separately, in 2 one-on-ones.')
    expect(two).toMatch(/<label><input type="radio" name="mode" value="together"\/>1:2 pair<\/label>/)
  })

  it('says what one tick makes, and asks nothing else: no toggle, no Material', async () => {
    const one = popupIn((await popupAt('disciplers', claire, [['with', sam]])).html)!
    expect(rowFor(one, sam)).toMatch(/checked=""/)
    expect(one.match(/checked=""/g)).toHaveLength(1)
    // The ticked row takes the selected treatment, and no other row does.
    expect(rowFor(one, sam)).toContain('class="pair-opt on"')
    expect(one.match(/class="pair-opt on/g)).toHaveLength(1)
    expect(one).toContain('Claire Martinez will disciple Sam Lee in a one-on-one.')
    expect(one).toMatch(/<button[^>]*type="submit"[^>]*>Create 1:1 pair<\/button>/)
    // The toggle is hidden at one tick, and a single one-to-one asks nothing, a
    // Material included, though the Ministry holds two.
    expect(one).not.toContain('Pair them as')
    expect(one).not.toContain('<select')
    expect(one).not.toMatch(/name="(declaredGender|name|materialId[^"]*|mode)"/)
    // The placeholder line for two or more ticked is gone.
    expect(one).not.toContain('is coming')
  })

  /** The toggle's segments: what each says, whether it is selected, and whether it can be picked. */
  const segmentsIn = (popup: string) =>
    (popup.match(/<div class="pair-shape"[\s\S]*?<\/div>/)?.[0].match(/<label[\s\S]*?<\/label>/g) ?? []).map(
      (label) => ({
        says: label.replace(/<[^>]*>/g, ''),
        mode: label.match(/\svalue="([^"]*)"/)?.[1],
        selected: /\schecked=""/.test(label),
        disabled: /\sdisabled=""/.test(label),
        treatment: label.match(/<label(?: class="([^"]*)")?/)?.[1] ?? '',
      }),
    )

  /** Every dropdown: the field it posts, the option it is on, and what it offers, in order. */
  const dropdownsIn = (popup: string) =>
    (popup.match(/<select[\s\S]*?<\/select>/g) ?? []).map((select) => ({
      field: select.match(/\sname="([^"]*)"/)?.[1],
      labelled: popup.match(new RegExp(`<label[^>]*for="${select.match(/\sid="([^"]*)"/)?.[1]}"[^>]*>([^<]*)<`))?.[1],
      on: select.match(/<option[^>]*value="([^"]*)"[^>]*selected=""/)?.[1] ?? '',
      offers: [...select.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((option) => option[1]),
    }))

  it('asks what to make of two ticked, defaulting to a 1:2 pair that is named and declared without asking', async () => {
    const two = popupIn((await popupAt('disciplers', claire, [['with', sam], ['with', ana]])).html)!
    expect(two.match(/checked=""/g)).toHaveLength(3)
    expect(two).toContain('Pair them as')
    expect(segmentsIn(two)).toEqual([
      { says: '1:2 pair', mode: 'together', selected: true, disabled: false, treatment: 'on' },
      { says: '2 × 1:1 pairs', mode: 'separate', selected: false, disabled: false, treatment: '' },
      { says: 'Group', mode: 'together', selected: false, disabled: false, treatment: '' },
    ])
    expect(two).not.toContain('needs exactly two')
    // Named in the list's order, which is the Roster's, whatever order they were ticked in.
    expect(two).toContain('Claire Martinez will disciple Ana Ruiz and Sam Lee together as a 1:2 pair.')
    expect(two).toMatch(/<button[^>]*type="submit"[^>]*>Create 1:2 pair<\/button>/)
    expect(two).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/)

    // Nothing is asked: the name is generated and never shown, and the declaration
    // is the Discipler's gender. A 1:2 is a group for every rule, so it carries both.
    expect(hiddenIn(two)).toEqual({
      pair: claire,
      list: 'disciplers',
      leaderId: claire,
      name: 'Claire with Ana &amp; Sam',
      declaredGender: 'female',
    })
    expect(two.replace(/<input[^>]*>/g, '')).not.toContain('Claire with Ana')

    // One dropdown, posted as the one Material a relationship holds: No material
    // first and the default, then the Ministry's live Materials.
    expect(two).toContain('What are they running?')
    expect(dropdownsIn(two)).toEqual([
      { field: 'materialId', labelled: 'What are they running?', on: '', offers: ['No material', 'Gospel of Mark', 'Romans'] },
    ])

    // Read against what a third tick would make, which is a Group: somebody
    // already in a one-to-one can be in one, and it is a women's group until
    // somebody says otherwise.
    expectOpen(two, brianna)
    expectLeftOut(two, tom)
  })

  it('shows one dropdown per ticked Disciple for N × 1:1 pairs, each labelled with their name', async () => {
    const separately = popupIn(
      (await popupAt('disciplers', claire, [['with', sam], ['with', ana], ['mode', 'separate']])).html,
    )!
    expect(segmentsIn(separately).map(({ says, selected }) => [says, selected])).toEqual([
      ['1:2 pair', false],
      ['2 × 1:1 pairs', true],
      ['Group', false],
    ])
    expect(separately).toContain('Claire Martinez will disciple Ana Ruiz and Sam Lee separately, in 2 one-on-ones.')
    expect(separately).toMatch(/<button[^>]*type="submit"[^>]*>Create 2 1:1 pairs<\/button>/)
    // Nothing of a group is posted: a one-to-one has nothing a name is for.
    expect(hiddenIn(separately)).toEqual({ pair: claire, list: 'disciplers', leaderId: claire })

    expect(separately).toContain('What is each of them running?')
    const offers = ['No material', 'Gospel of Mark', 'Romans']
    expect(dropdownsIn(separately)).toEqual([
      { field: `materialId.${ana}`, labelled: 'Ana Ruiz', on: '', offers },
      { field: `materialId.${sam}`, labelled: 'Sam Lee', on: '', offers },
    ])
  })

  it('strikes 1:2 pair out at three ticked, says why beneath the toggle, and counts the N', async () => {
    const three = popupIn(
      (await popupAt('disciplers', claire, [['with', sam], ['with', ana], ['with', rosa], ['mode', 'separate']])).html,
    )!
    expect(segmentsIn(three)).toEqual([
      { says: '1:2 pair', mode: 'together', selected: false, disabled: true, treatment: 'struck' },
      { says: '3 × 1:1 pairs', mode: 'separate', selected: true, disabled: false, treatment: 'on' },
      { says: 'Group', mode: 'together', selected: false, disabled: false, treatment: '' },
    ])
    expect(three).toMatch(/<p class="pair-hint" id="pair-shape-hint">1:2 pair needs exactly two checked<\/p>/)
    expect(three).toContain('separately, in 3 one-on-ones.')
    expect(three).toMatch(/<button[^>]*type="submit"[^>]*>Create 3 1:1 pairs<\/button>/)
    expect(dropdownsIn(three).map(({ labelled }) => labelled)).toEqual(['Ana Ruiz', 'Rosa Delgado', 'Sam Lee'])
  })

  /** The gender toggle under the shape toggle: what each segment says and posts, and which is on. */
  const declaresIn = (popup: string) =>
    (popup.match(/<div class="pair-shape pair-declares"[\s\S]*?<\/div>/)?.[0].match(/<label[\s\S]*?<\/label>/g) ?? []).map(
      (label) => ({
        says: label.replace(/<[^>]*>/g, ''),
        field: label.match(/\sname="([^"]*)"/)?.[1],
        posts: label.match(/\svalue="([^"]*)"/)?.[1],
        on: /\schecked=""/.test(label),
      }),
    )

  /** The Group's name field, as the server sends it. */
  const nameFieldIn = (popup: string) => popup.match(/<input[^>]*id="pair-group-name"[^>]*>/)?.[0]

  it('defaults to a Group at three ticked, preset from the Discipler, and asks its name and one Material (mock state D)', async () => {
    const three = popupIn(
      (await popupAt('disciplers', claire, [['with', sam], ['with', ana], ['with', rosa]])).html,
    )!
    expect(segmentsIn(three)).toEqual([
      { says: '1:2 pair', mode: 'together', selected: false, disabled: true, treatment: 'struck' },
      { says: '3 × 1:1 pairs', mode: 'separate', selected: false, disabled: false, treatment: '' },
      { says: 'Group', mode: 'together', selected: true, disabled: false, treatment: 'on' },
    ])
    expect(three).toMatch(/<p class="pair-hint" id="pair-shape-hint">1:2 pair needs exactly two checked<\/p>/)

    // The answer is visible, in words, and changeable: three real radios posting the
    // declaration's own field, Women's on because Claire is a woman.
    expect(declaresIn(three)).toEqual([
      { says: 'Women’s', field: 'declaredGender', posts: 'female', on: true },
      { says: 'Men’s', field: 'declaredGender', posts: 'male', on: false },
      { says: 'Coed', field: 'declaredGender', posts: 'mixed', on: false },
    ])

    // A name, required, with a placeholder that is a hint and never the value.
    expect(three).toContain('Group name')
    const nameField = nameFieldIn(three)!
    expect(attribute(nameField, 'name')).toBe('name')
    expect(attribute(nameField, 'placeholder')).toBe('Claire’s Group')
    expect(attribute(nameField, 'value')).toBe('')
    expect(nameField).toMatch(/\srequired=""/)

    // One Material dropdown, the 1:2 pair's own. And no join-approval control.
    expect(dropdownsIn(three)).toEqual([
      { field: 'materialId', labelled: 'What are they running?', on: '', offers: ['No material', 'Gospel of Mark', 'Romans'] },
    ])
    expect(three).not.toContain('joinRequiresApproval')

    expect(three).toContain('Claire Martinez will lead a women’s group of 3: Ana Ruiz, Rosa Delgado and Sam Lee.')
    expect(three).toMatch(/<button[^>]*type="submit"[^>]*>Create group of 3<\/button>/)
    // It says that it is a Group, for the way back, and nothing is generated for it.
    expect(hiddenIn(three)).toEqual({ pair: claire, list: 'disciplers', leaderId: claire, shape: 'group' })

    // Other-gender rows are not shown until Coed is chosen; one-to-ones and other groups grey nobody.
    expectLeftOut(three, tom)
    expectOpen(three, brianna)
    expect(rowFor(three, rosa)).toMatch(/checked=""/)
  })

  it('opens other-gender rows under Coed, and the sentence says coed', async () => {
    const coed = popupIn(
      (await popupAt('disciplers', claire, [
        ['with', sam],
        ['with', tom],
        ['shape', 'group'],
        ['declaredGender', 'mixed'],
        ['name', 'Thursday Table'],
      ])).html,
    )!
    // Two ticked, and the Group it came back as, not the 1:2 pair two default to.
    expect(segmentsIn(coed).find(({ selected }) => selected)?.says).toBe('Group')
    expect(declaresIn(coed).find(({ on }) => on)?.says).toBe('Coed')
    expect(rowFor(coed, tom)).toMatch(/checked=""/)
    expect(rowFor(coed, sam)).toMatch(/checked=""/)
    expectOpen(coed, tom)
    // And he is counted now that he is shown.
    expect(coed).toContain(`${offered(coed).length} disciples`)
    expect(coed).not.toContain('was unticked')
    expect(coed).toMatch(/Claire Martinez will lead a coed group of 2: (Sam Lee and Tom Wilson|Tom Wilson and Sam Lee)\./)
    expect(attribute(nameFieldIn(coed)!, 'value')).toBe('Thursday Table')

    // The same two as a women's group: he is greyed, so he is unticked, and a line says who.
    const womens = popupIn(
      (await popupAt('disciplers', claire, [
        ['with', sam],
        ['with', tom],
        ['shape', 'group'],
        ['declaredGender', 'female'],
      ])).html,
    )!
    expectLeftOut(womens, tom)
    expect(womens).toMatch(/role="status"[^>]*>Tom Wilson was unticked: Women’s group: choose Coed to include\.</)
  })

  it('opens somebody already in a one-to-one for a 1:2 pair, and unticks them, saying who, for N × 1:1', async () => {
    // With one ticked, a second tick would make a 1:2 pair, which she can be in.
    const one = popupIn((await popupAt('disciplers', claire, [['with', sam]])).html)!
    expectOpen(one, brianna)
    // Another gender is left out for a 1:2 as for a one-to-one: it declares Claire's.
    expectLeftOut(one, tom)

    const together = popupIn((await popupAt('disciplers', claire, [['with', sam], ['with', brianna]])).html)!
    expect(rowFor(together, brianna)).toMatch(/checked=""/)
    expect(together).toContain('Claire Martinez will disciple Brianna Frazier and Sam Lee together as a 1:2 pair.')
    expect(together).not.toContain('was unticked')

    // The same two as N x 1:1: she is greyed, so she is unticked, and a line says
    // who. That leaves one, so the toggle hides and the one-tick sentence returns.
    const apart = popupIn(
      (await popupAt('disciplers', claire, [['with', sam], ['with', brianna], ['mode', 'separate']])).html,
    )!
    expect(rowFor(apart, brianna)).not.toMatch(/checked=""/)
    expect(apart).toMatch(/role="status"[^>]*>Brianna Frazier was unticked: Already in a 1:1 with David Chen\.</)
    expect(apart).not.toContain('Pair them as')
    expect(apart).toContain('Claire Martinez will disciple Sam Lee in a one-on-one.')
  })

  it('greys 1:2 pair and Group for a Discipler who already leads a group, and the default moves to N × 1:1', async () => {
    const popup = popupIn((await popupAt('disciplers', grace, [['with', sam], ['with', ana]])).html)!
    expect(segmentsIn(popup)).toEqual([
      { says: '1:2 pair', mode: 'together', selected: false, disabled: true, treatment: 'off' },
      { says: '2 × 1:1 pairs', mode: 'separate', selected: true, disabled: false, treatment: 'on' },
      // Group is greyed as 1:2 already is: each is a group for the one-group limit.
      { says: 'Group', mode: 'together', selected: false, disabled: true, treatment: 'off' },
    ])
    expect(popup).toMatch(/<p class="pair-hint" id="pair-shape-hint">Grace already leads a group<\/p>/)
    expect(popup).toContain('Grace Lee will disciple Ana Ruiz and Sam Lee separately, in 2 one-on-ones.')
  })

  it('keeps a group that has fallen to one Disciple a group, for both caps and from both sides', async () => {
    const shrunk = await formGroup(ministry, {
      name: 'Nora’s Group',
      declaredGender: 'female',
      leader: { name: 'Nora Lindgren', gender: 'female' },
      disciples: [
        { name: 'Olive Last', gender: 'female' },
        { name: 'Petra Gone', gender: 'female' },
      ],
    })
    const [last, gone] = shrunk.disciples as [string, string]
    // Ended with this process's clock and never the database's, which can sit behind it.
    await pool.query(
      `update relationship_member set ended_at = $1 where relationship_id = $2 and person_id = $3`,
      [new Date(), shrunk.id, gone],
    )

    // Its last Disciple is in a group of one, and not in a one-to-one: a Discipler
    // can tick her, where the head count used to grey her as *Already in a 1:1*.
    const fromClaire = popupIn((await popupAt('disciplers', claire)).html)!
    expectOpen(fromClaire, last)
    expect(rowFor(fromClaire, last)).toContain('Olive Last')

    // And from her own side every Discipler she could be given is open.
    const fromHer = popupIn((await popupAt('disciples', last)).html)!
    expectOpen(fromHer, claire)

    // Its Discipler still leads her one group, so a 1:2 pair is ruled out for her.
    const fromNora = popupIn((await popupAt('disciplers', shrunk.leader, [['with', sam], ['with', ana]])).html)!
    expect(segmentsIn(fromNora)[0]).toMatchObject({ says: '1:2 pair', disabled: true, treatment: 'off' })
    expect(fromNora).toContain('Nora already leads a group')
  })

  it('shows no dropdown and no empty label in a Ministry with no live Materials', async () => {
    const bare = await createMinistryWithAdmin('The Chapel With No Materials')
    const theirCookie = (await signIn(bare)).cookie
    const lead = await addPerson(bare, 'Claire Martinez', { answers: { gender: 'female' } })
    await offersToMentor(lead, bare)
    const one = await addPerson(bare, 'Sam Lee', { answers: { gender: 'female' } })
    const other = await addPerson(bare, 'Ana Ruiz', { answers: { gender: 'female' } })

    for (const mode of ['together', 'separate']) {
      const { html } = await getPage(
        `/roster?${new URLSearchParams([['list', 'disciplers'], ['pair', lead], ['with', one], ['with', other], ['mode', mode]])}`,
        theirCookie,
      )
      const popup = popupIn(html)!
      expect(popup, mode).toContain('Pair them as')
      expect(popup, mode).not.toContain('<select')
      expect(popup, mode).not.toMatch(/running\?/)
    }
  })

  it('refuses two ticks posted without script, forms nothing, and comes back as the 1:2 pair they default to', async () => {
    // A browser without script never sees the toggle, so two ticks arrive saying
    // nothing about themselves, and the route refuses what it would refuse of any
    // group that did. The popup that comes back has both ticks and, now, the name
    // and the declaration a 1:2 pair posts, so pressing the button again makes it.
    const location = await submit([
      ['pair', claire],
      ['list', 'disciplers'],
      ['leaderId', claire],
      ['participantId', sam],
      ['participantId', ana],
    ])
    expect(location.pathname).toBe('/roster')
    expect(location.searchParams.get('pair')).toBe(claire)
    expect(location.searchParams.get('error')).toMatch(/^relationship\.needs_a_/)
    expect(location.searchParams.getAll('with')).toEqual([sam, ana])
    expect(location.searchParams.has('leaderId')).toBe(false)

    const { html } = await getPage(`${location.pathname}${location.search}`, cookie)
    const popup = popupIn(html)!
    expect(popup).toMatch(/role="alert"/)
    expect(rowFor(popup, sam)).toMatch(/checked=""/)
    expect(rowFor(popup, ana)).toMatch(/checked=""/)
    expect(segmentsIn(popup).find(({ selected }) => selected)?.says).toBe('1:2 pair')
    expect(hiddenIn(popup)).toMatchObject({ name: 'Claire with Ana &amp; Sam', declaredGender: 'female' })
    expect(currentList(html)).toBe('Disciplers')

    const formed = await pool.query(
      `select 1 from relationship_member where person_id = any($1::uuid[])`,
      [[sam, ana]],
    )
    expect(formed.rows).toEqual([])
  })

  it('forms a one-to-one awaiting acceptance, and the receipt is on the list the Admin was on', async () => {
    const disciple = await addPerson(ministry, 'Lena Brandt', { phone: number(), answers: { gender: 'female' } })

    const location = await submit([['pair', claire], ['list', 'disciplers'], ['leaderId', claire], ['participantId', disciple]])
    expect(location.pathname).toBe('/roster')
    expect(Object.fromEntries(location.searchParams)).toEqual({ list: 'disciplers', paired: '1' })

    const { html } = await getPage(`${location.pathname}${location.search}`, cookie)
    expect(popupIn(html)).toBeNull()
    expect(currentList(html)).toBe('Disciplers')
    expect(html).toContain('They are paired.')

    const formed = await pool.query(
      `select r.kind, r.accepted_at
         from relationship r
         join relationship_member m on m.relationship_id = r.id
        where m.person_id = $1 and m.role = 'participant'`,
      [disciple],
    )
    expect(formed.rows).toEqual([{ kind: 'one_to_one', accepted_at: null }])
  })

  it('reopens on a refusal on the Discipler’s side, with the reason and the tick restored', async () => {
    // Posted anyway, a greyed row is refused by the database as it always was, and
    // the address carries who was ticked. A greyed tick is not restored as ticked.
    const location = await submit([['pair', claire], ['list', 'all'], ['leaderId', claire], ['participantId', tom]])
    expect(location.pathname).toBe('/roster')
    expect([...location.searchParams]).toEqual([
      ['list', 'all'],
      ['pair', claire],
      ['error', 'relationship.gender_must_match'],
      ['with', tom],
    ])
    const refused = popupIn((await getPage(`${location.pathname}${location.search}`, cookie)).html)!
    expect(refused).toContain('Choose who Claire Martinez will disciple.')
    expect(refused).toMatch(/role="alert"[^>]*>[^<]*gender/i)
    expect(refused).not.toContain('relationship.gender_must_match')
    expectLeftOut(refused, tom)
    expect(refused).not.toMatch(/checked=""/)

    // A tick that can still be made comes back ticked, with its sentence and button.
    const { html } = await popupAt('all', claire, [
      ['error', 'relationship.person_already_in_this_relationship'],
      ['with', sam],
    ])
    const popup = popupIn(html)!
    expect(popup).toMatch(/role="alert"/)
    expect(rowFor(popup, sam)).toMatch(/checked=""/)
    expect(popup).toContain('Claire Martinez will disciple Sam Lee in a one-on-one.')
    expect(currentList(html)).toBe('All')
    // The refusal is the popup's, so the import dialog behind it is shut.
    expect(html.match(/class="modal-bg open"/g)).toHaveLength(1)

    // And somebody not on the list is restored as nobody.
    const stranger = popupIn((await popupAt('all', claire, [['with', waiting]])).html)!
    expect(stranger).not.toMatch(/checked=""/)
  })

  /**
   * What the popup's form posts for each shape, posted as a browser would, into a
   * Ministry of its own so that what is formed is only what each test formed.
   */
  describe('forming what two or more ticks make', () => {
    let chapel: MinistryFixture
    let theirCookie: string
    let gospel: string
    let letters: string

    beforeAll(async () => {
      chapel = await createMinistryWithAdmin('Popup Chapel, Two Or More Ticked')
      theirCookie = (await signIn(chapel)).cookie
      gospel = await addMaterial(chapel, 'Gospel of Mark')
      letters = await addMaterial(chapel, 'Romans')
    })

    const woman = (fullName: string) => addPerson(chapel, fullName, { phone: number(), answers: { gender: 'female' } })
    const discipler = async (fullName: string) => {
      const id = await woman(fullName)
      await offersToMentor(id, chapel)
      return id
    }
    const post = (fields: [string, string][]) => postPairing(theirCookie, fields)

    /** Every open relationship somebody is a Disciple in: what it is called, declares and intends. */
    const discipledIn = async (disciple: string) =>
      (
        await pool.query<{ id: string; name: string | null; declared_gender: string | null; intended: string | null; disciples: string }>(
          `select r.id, r.name, r.declared_gender, r.intended_material_id as intended,
                  (select count(*) from relationship_member p
                    where p.relationship_id = r.id and p.role = 'participant' and p.ended_at is null)::text as disciples
             from relationship r
             join relationship_member m on m.relationship_id = r.id
            where m.person_id = $1 and m.role = 'participant' and m.ended_at is null
            order by r.id`,
          [disciple],
        )
      ).rows

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
    }

    const historyOf = async (relationshipId: string) =>
      (
        await pool.query<{ material_id: string | null }>(
          `select material_id from material_assignment where relationship_id = $1
            order by started_at, material_id nulls first`,
          [relationshipId],
        )
      ).rows.map(({ material_id }) => material_id)

    it('forms a 1:2 pair as one relationship with a generated name, the Discipler’s gender and its Material', async () => {
      const claireHere = await discipler('Claire Martinez')
      const samHere = await woman('Sam Lee')
      const anaHere = await woman('Ana Ruiz')

      const receipt = await post([
        ['pair', claireHere],
        ['list', 'disciplers'],
        ['leaderId', claireHere],
        ['name', 'Claire with Sam & Ana'],
        ['declaredGender', 'female'],
        ['participantId', samHere],
        ['participantId', anaHere],
        ['mode', 'together'],
        ['materialId', gospel],
      ])
      expect(Object.fromEntries(receipt.searchParams)).toEqual({ list: 'disciplers', paired: '2' })

      const [theirs, ...others] = await discipledIn(samHere)
      expect(others).toEqual([])
      expect(theirs).toMatchObject({
        name: 'Claire with Sam & Ana',
        declared_gender: 'female',
        intended: gospel,
        disciples: '2',
      })
      expect((await discipledIn(anaHere)).map(({ id }) => id)).toEqual([theirs!.id])

      // Held as intended, and written at acceptance.
      await acceptEveryInvitationOf(claireHere, 'Claire Martinez')
      expect(await historyOf(theirs!.id)).toEqual([null, gospel])
    })

    it('forms 3 × 1:1 as three one-to-ones, and 2 × 1:1 with a different Material each hold one apiece', async () => {
      const lead = await discipler('Dana Whitfield')
      const three = [await woman('Una First'), await woman('Dua Second'), await woman('Tria Third')]

      const receipt = await post([
        ['pair', lead],
        ['list', 'all'],
        ['leaderId', lead],
        ...three.map((id): [string, string] => ['participantId', id]),
        ['mode', 'separate'],
        ...three.map((id): [string, string] => [`materialId.${id}`, '']),
      ])
      expect(Object.fromEntries(receipt.searchParams)).toEqual({ pairs: '3', list: 'all' })
      for (const id of three) {
        expect(await discipledIn(id)).toMatchObject([{ name: null, intended: null, disciples: '1' }])
      }

      const two = [await woman('Mara Fourth'), await woman('Nell Fifth')]
      await post([
        ['pair', lead],
        ['list', 'all'],
        ['leaderId', lead],
        ['participantId', two[0]!],
        ['participantId', two[1]!],
        ['mode', 'separate'],
        [`materialId.${two[0]}`, gospel],
        [`materialId.${two[1]}`, letters],
      ])
      expect((await discipledIn(two[0]!)).map(({ intended }) => intended)).toEqual([gospel])
      expect((await discipledIn(two[1]!)).map(({ intended }) => intended)).toEqual([letters])
    })

    it('forms none of a set with one refusal, and reopens with the ticks, the shape and every Material restored', async () => {
      const lead = await discipler('Eve Lindqvist')
      const first = await woman('Fay Open')
      const second = await woman('Gia Open')
      const man = await addPerson(chapel, 'Hal Refused', { phone: number(), answers: { gender: 'male' } })

      const back = await post([
        ['pair', lead],
        ['list', 'disciplers'],
        ['leaderId', lead],
        ['participantId', first],
        ['participantId', man],
        ['participantId', second],
        ['mode', 'separate'],
        [`materialId.${first}`, gospel],
        [`materialId.${second}`, letters],
      ])
      expect(back.pathname).toBe('/roster')
      expect([...back.searchParams]).toEqual([
        ['list', 'disciplers'],
        ['pair', lead],
        ['error', 'relationship.gender_must_match'],
        ['about', man],
        ['mode', 'separate'],
        ['with', first],
        ['with', man],
        ['with', second],
        [`materialId.${first}`, gospel],
        [`materialId.${second}`, letters],
      ])
      for (const id of [first, second, man]) expect(await discipledIn(id)).toEqual([])

      // Named, as old ticket 21 names him, and everything else as it was. He is
      // greyed now, so his tick is not restored, and the line says so.
      const popup = popupIn((await getPage(`${back.pathname}${back.search}`, theirCookie)).html)!
      expect(popup).toMatch(/role="alert"[^>]*>Hal Refused: A one-to-one must be between two people of the same gender\./)
      expect(popup).toContain('None of these one-to-ones was made.')
      expect(rowFor(popup, first)).toMatch(/checked=""/)
      expect(rowFor(popup, second)).toMatch(/checked=""/)
      expectLeftOut(popup, man)
      expect(popup).toContain('Hal Refused was unticked: Women’s only: a 1:1 is same-gender.')
      expect(segmentsIn(popup).find(({ selected }) => selected)?.says).toBe('2 × 1:1 pairs')
      expect(dropdownsIn(popup).map(({ labelled, on }) => [labelled, on])).toEqual([
        ['Fay Open', gospel],
        ['Gia Open', letters],
      ])
    })

    it('refuses a Material removed between opening the popup and submitting, with the rest of the selection intact', async () => {
      const lead = await discipler('Ida Moreno')
      const first = await woman('Jo Steady')
      const second = await woman('Kit Steady')
      const leviticus = await addMaterial(chapel, 'Leviticus, Soon Removed')
      const removed = await fetch(`${baseUrl}/materials/${leviticus}/remove`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: theirCookie },
        body: new URLSearchParams({ confirm: 'yes' }),
      })
      expect(removed.status).toBe(303)

      // N x 1:1: the refusal names who it was chosen for, which is which dropdown.
      const apart = await post([
        ['pair', lead],
        ['list', 'disciplers'],
        ['leaderId', lead],
        ['participantId', first],
        ['participantId', second],
        ['mode', 'separate'],
        [`materialId.${first}`, gospel],
        [`materialId.${second}`, leviticus],
      ])
      expect(apart.searchParams.get('error')).toBe('relationship.material_is_not_on_the_list')
      expect(apart.searchParams.get('about')).toBe(second)
      const reopened = popupIn((await getPage(`${apart.pathname}${apart.search}`, theirCookie)).html)!
      expect(reopened).toMatch(/role="alert"[^>]*>Kit Steady: That Material is no longer on this Ministry’s list\./)
      expect(reopened.match(/checked=""/g)).toHaveLength(3)
      expect(dropdownsIn(reopened).map(({ labelled, on }) => [labelled, on])).toEqual([
        ['Jo Steady', gospel],
        // Off the list, so there is nothing to restore it to: No material.
        ['Kit Steady', ''],
      ])

      // A 1:2 pair: one dropdown, and the same refusal.
      const together = await post([
        ['pair', lead],
        ['list', 'disciplers'],
        ['leaderId', lead],
        ['name', 'Ida with Jo & Kit'],
        ['declaredGender', 'female'],
        ['participantId', first],
        ['participantId', second],
        ['mode', 'together'],
        ['materialId', leviticus],
      ])
      expect(together.searchParams.get('error')).toBe('relationship.material_is_not_on_the_list')
      expect(together.searchParams.get('materialId')).toBe(leviticus)
      const again = popupIn((await getPage(`${together.pathname}${together.search}`, theirCookie)).html)!
      expect(again).toContain('That Material is no longer on this Ministry’s list.')
      expect(segmentsIn(again).find(({ selected }) => selected)?.says).toBe('1:2 pair')
      expect(dropdownsIn(again).map(({ field, on }) => [field, on])).toEqual([['materialId', '']])

      for (const id of [first, second]) expect(await discipledIn(id)).toEqual([])
    })

    it('restores a 1:2 pair’s Material with its ticks', async () => {
      const lead = await discipler('Lou Hart')
      const first = await woman('Mo Restored')
      const second = await woman('Nan Restored')

      const { html } = await getPage(
        `/roster?${new URLSearchParams([
          ['list', 'disciplers'],
          ['pair', lead],
          ['error', 'relationship.person_already_in_this_relationship'],
          ['with', first],
          ['with', second],
          ['materialId', letters],
        ])}`,
        theirCookie,
      )
      expect(dropdownsIn(popupIn(html)!).map(({ field, on }) => [field, on])).toEqual([['materialId', letters]])
    })

    /** Everybody in a relationship as a Disciple, by id, and what the relationship asks of a group link. */
    const groupOf = async (relationshipId: string) => {
      const members = await pool.query<{ person_id: string }>(
        `select person_id from relationship_member
          where relationship_id = $1 and role = 'participant' and ended_at is null`,
        [relationshipId],
      )
      const asked = await pool.query<{ join_requires_approval: boolean; accepted_at: Date | null }>(
        `select join_requires_approval, accepted_at from relationship where id = $1`,
        [relationshipId],
      )
      return { disciples: members.rows.map(({ person_id }) => person_id).sort(), ...asked.rows[0]! }
    }

    it('forms a women’s group of three with its name, its declaration and its Material, and no join approval', async () => {
      const lead = await discipler('Ruth Alder')
      const three = [await woman('Sara One'), await woman('Tess Two'), await woman('Uma Three')]

      const receipt = await post([
        ['pair', lead],
        ['list', 'disciplers'],
        ['leaderId', lead],
        ['shape', 'group'],
        ...three.map((id): [string, string] => ['participantId', id]),
        ['mode', 'together'],
        ['declaredGender', 'female'],
        ['name', 'Ruth’s Group'],
        ['materialId', letters],
      ])
      expect(Object.fromEntries(receipt.searchParams)).toEqual({ list: 'disciplers', paired: '3' })

      const [theirs, ...others] = await discipledIn(three[0]!)
      expect(others).toEqual([])
      expect(theirs).toMatchObject({ name: 'Ruth’s Group', declared_gender: 'female', intended: letters, disciples: '3' })
      expect(await groupOf(theirs!.id)).toEqual({
        disciples: [...three].sort(),
        // A group formed here takes the default: that switch stays on the Intake forms page.
        join_requires_approval: false,
        accepted_at: null,
      })

      const { html } = await getPage(`${receipt.pathname}${receipt.search}`, theirCookie)
      expect(html).toContain('A group of 3 is paired.')
    })

    it('forms a Coed group that holds both genders, which is how a mixed group is made by hand', async () => {
      const lead = await discipler('Vera Holt')
      const her = await woman('Wren Mixed')
      const him = await addPerson(chapel, 'Xavi Mixed', { phone: number(), answers: { gender: 'male' } })

      const receipt = await post([
        ['pair', lead],
        ['list', 'disciplers'],
        ['leaderId', lead],
        ['shape', 'group'],
        ['participantId', her],
        ['participantId', him],
        ['mode', 'together'],
        ['declaredGender', 'mixed'],
        ['name', 'Thursday Table'],
      ])
      expect(receipt.searchParams.get('paired')).toBe('2')

      const [theirs] = await discipledIn(him)
      // Coed is the screen's word; the model holds mixed as no declared gender.
      expect(theirs).toMatchObject({ name: 'Thursday Table', declared_gender: null, intended: null, disciples: '2' })
      expect((await groupOf(theirs!.id)).disciples).toEqual([her, him].sort())
    })

    it('refuses a women’s group with a man posted anyway, forms nothing, and restores the ticks, the shape, the gender, the name and the Material', async () => {
      const lead = await discipler('Yara Finch')
      const first = await woman('Zoe Kept')
      const second = await woman('Abi Kept')
      const man = await addPerson(chapel, 'Ben Refused', { phone: number(), answers: { gender: 'male' } })

      const back = await post([
        ['pair', lead],
        ['list', 'disciplers'],
        ['leaderId', lead],
        ['shape', 'group'],
        ['participantId', first],
        ['participantId', man],
        ['participantId', second],
        ['mode', 'together'],
        ['declaredGender', 'female'],
        ['name', 'Yara’s Group'],
        ['materialId', gospel],
      ])
      expect(back.pathname).toBe('/roster')
      expect([...back.searchParams]).toEqual([
        ['list', 'disciplers'],
        ['pair', lead],
        ['error', 'relationship.gender_does_not_match_the_declaration'],
        ['with', first],
        ['with', man],
        ['with', second],
        ['shape', 'group'],
        ['declaredGender', 'female'],
        ['name', 'Yara’s Group'],
        ['materialId', gospel],
      ])
      for (const id of [first, second, man]) expect(await discipledIn(id)).toEqual([])

      const popup = popupIn((await getPage(`${back.pathname}${back.search}`, theirCookie)).html)!
      expect(popup).toMatch(/role="alert"[^>]*>Somebody selected is not of the gender this pairing was declared to be\./)
      // Two of the three are left ticked, and it is still the Group it was posted as.
      expect(rowFor(popup, first)).toMatch(/checked=""/)
      expect(rowFor(popup, second)).toMatch(/checked=""/)
      expectLeftOut(popup, man)
      expect(popup).toContain('Ben Refused was unticked: Women’s group: choose Coed to include.')
      expect(segmentsIn(popup).find(({ selected }) => selected)?.says).toBe('Group')
      expect(declaresIn(popup).find(({ on }) => on)?.says).toBe('Women’s')
      expect(attribute(nameFieldIn(popup)!, 'value')).toBe('Yara’s Group')
      expect(dropdownsIn(popup).map(({ field, on }) => [field, on])).toEqual([['materialId', gospel]])
      expect(popup).toMatch(/<button[^>]*type="submit"[^>]*>Create group of 2<\/button>/)
    })

    it('is still refused by the domain where a Group is posted without a declaration, and nothing is formed', async () => {
      const lead = await discipler('Cleo Marsh')
      const three = [await woman('Dee Undeclared'), await woman('Eve Undeclared'), await woman('Flo Undeclared')]

      const back = await post([
        ['pair', lead],
        ['list', 'disciplers'],
        ['leaderId', lead],
        ['shape', 'group'],
        ...three.map((id): [string, string] => ['participantId', id]),
        ['mode', 'together'],
        ['name', 'Cleo’s Group'],
      ])
      expect(back.searchParams.get('error')).toBe('relationship.needs_a_gender_declaration')
      // The screen never sends back a declaration nobody made.
      expect(back.searchParams.has('declaredGender')).toBe(false)
      for (const id of three) expect(await discipledIn(id)).toEqual([])

      const popup = popupIn((await getPage(`${back.pathname}${back.search}`, theirCookie)).html)!
      expect(popup).toMatch(/role="alert"[^>]*>Say whether this is a men’s group, a women’s group, or a mixed one\./)
      expect(segmentsIn(popup).find(({ selected }) => selected)?.says).toBe('Group')
      expect(attribute(nameFieldIn(popup)!, 'value')).toBe('Cleo’s Group')
    })

    it('refuses a Group with no name, in words, with the rest restored', async () => {
      const lead = await discipler('Gwen Nameless')
      const two = [await woman('Hope Unnamed'), await woman('Iris Unnamed')]

      const back = await post([
        ['pair', lead],
        ['list', 'all'],
        ['leaderId', lead],
        ['shape', 'group'],
        ...two.map((id): [string, string] => ['participantId', id]),
        ['mode', 'together'],
        ['declaredGender', 'female'],
        // Only spaces: the placeholder is never submitted, and this is what is.
        ['name', '   '],
      ])
      expect(back.searchParams.get('error')).toBe('relationship.needs_a_name')
      for (const id of two) expect(await discipledIn(id)).toEqual([])

      const popup = popupIn((await getPage(`${back.pathname}${back.search}`, theirCookie)).html)!
      expect(popup).toMatch(/role="alert"[^>]*>Give this group a name\./)
      expect(segmentsIn(popup).find(({ selected }) => selected)?.says).toBe('Group')
      expect(popup.match(/class="pair-opt on/g)).toHaveLength(2)
    })

    it('says the domain’s refusal in words where a 1:2 pair posts no declaration, as a Discipler with no gender on file does', async () => {
      const lead = await discipler('Opal Reyes')
      const first = await woman('Pia Undeclared')
      const second = await woman('Quin Undeclared')

      const back = await post([
        ['pair', lead],
        ['list', 'disciplers'],
        ['leaderId', lead],
        ['name', 'Opal with Pia & Quin'],
        ['participantId', first],
        ['participantId', second],
        ['mode', 'together'],
      ])
      expect(back.searchParams.get('error')).toBe('relationship.needs_a_gender_declaration')
      const popup = popupIn((await getPage(`${back.pathname}${back.search}`, theirCookie)).html)!
      expect(popup).toMatch(/role="alert"[^>]*>Say whether this is a men’s group, a women’s group, or a mixed one\./)
      expect(await discipledIn(first)).toEqual([])
    })
  })
})
