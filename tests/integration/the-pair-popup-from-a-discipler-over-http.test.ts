import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  optOut,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The Pair popup over the Roster, opened as a Discipler (Manual pairing, ticket
 * 23, stage 2), as an Admin's browser receives it: the list of Disciples with
 * boxes, and one tick that makes a one-to-one. No row opens this side until
 * ticket 27, so it is reached here as it is reached today, by its address.
 *
 * What needs script (the sentence following a tick, Clear, the disabled button
 * with nothing ticked) is looked at in a browser; the server renders the same
 * component, so ticks restored from an address show the rest here.
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
  })

  afterAll(async () => {
    await pool.end()
  })

  let numbered = 0
  const number = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  /** What answering Mentor on the Intake form records: the fact that makes a Discipler of somebody who leads nobody. */
  const offersToMentor = (personId: string) =>
    pool.query(
      `insert into consent_record
         (ministry_id, person_id, consent, granted, version, source, decided_at, intake_path, declared_side)
       values ($1, $2, 'sms', true, '2026-09-v1', 'pastor_link', now(), 'discipleship', 'mentor')`,
      [ministry.id, personId],
    )

  const popupAt = (list: string, personId: string, more: [string, string][] = []) =>
    getPage(`/roster?${new URLSearchParams([['list', list], ['pair', personId], ...more])}`, cookie)

  /** The popup's own markup and nothing of the Roster behind it, or null where there is none. */
  const popupIn = (html: string): string | null =>
    html.match(/<div[^>]*data-testid="pair-popup"[\s\S]*?<\/form>/)?.[0] ?? null

  /** One Disciple's row in the popup: its label, from the box to the end of it. */
  const rowFor = (popup: string, personId: string): string => {
    const row = popup.split('<label').find((each) => each.includes(`value="${personId}"`))
    expect(row, `no row in the popup for ${personId}`).toBeDefined()
    return row!.split('</label>')[0]!
  }

  const attribute = (tag: string, name: string): string | undefined =>
    tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

  const inputsIn = (popup: string): readonly string[] => popup.match(/<input[^>]*>/g) ?? []

  /** Everybody the popup offers as a Disciple, by the value their box would post, in the order listed. */
  const offered = (popup: string): readonly (string | undefined)[] =>
    inputsIn(popup)
      .filter((input) => attribute(input, 'name') === 'participantId')
      .map((input) => attribute(input, 'value'))

  const hiddenIn = (popup: string): Record<string, string | undefined> =>
    Object.fromEntries(
      inputsIn(popup)
        .filter((input) => attribute(input, 'type') === 'hidden')
        .map((input) => [attribute(input, 'name'), attribute(input, 'value')]),
    )

  const expectGreyed = (popup: string, personId: string, reason: string) => {
    const row = rowFor(popup, personId)
    const box = row.match(/<input[^>]*>/)![0]
    expect(box, reason).toMatch(/\sdisabled=""/)
    expect(box, reason).not.toMatch(/\schecked=""/)
    const described = attribute(box, 'aria-describedby')
    expect(described, reason).toBeDefined()
    expect(row, reason).toMatch(new RegExp(`id="${described}"[^>]*>${reason}<`))
  }

  const currentList = (html: string): string | undefined =>
    html.match(/<a[^>]*aria-current="true"[^>]*>([^<]*)<\/a>/)?.[1]

  const submit = async (fields: [string, string][]) => {
    const response = await fetch(`${baseUrl}/roster/pair/create`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams(fields),
    })
    return new URL(response.headers.get('location') ?? '', baseUrl)
  }

  it('opens on the Discipler’s side on Disciplers and on All, by address, and no row opens it yet', async () => {
    for (const list of ['disciplers', 'all']) {
      const { response, html } = await popupAt(list, claire)
      expect(response.status, list).toBe(200)
      const popup = popupIn(html)
      expect(popup, list).not.toBeNull()
      expect(popup, list).toContain('Pair Claire Martinez')
      expect(popup, list).toContain('Choose who Claire Martinez will disciple.')
      expect(popup, list).toContain('type="checkbox"')
      expect(popup, list).not.toContain('type="radio"')
      expect(currentList(html), list).toBe(list === 'all' ? 'All' : 'Disciplers')
      // The X, Cancel and the backdrop, all to the list it was drawn over.
      expect(popup!.match(new RegExp(`href="/roster\\?list=${list}"`, 'g')), list).toHaveLength(3)

      // Her row still goes to the old Pair page until ticket 27, which is untouched.
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
    expect(popup).toContain(`${listed.length} disciples`)

    const samRow = rowFor(popup, sam)
    expect(samRow).toMatch(/type="checkbox"[^>]*name="participantId"|name="participantId"[^>]*type="checkbox"/)
    expect(samRow).toContain('SL')
    expect(samRow).toContain('Sam Lee')
    expect(samRow).toContain('sam.l@example.org')
    expect(samRow).toContain('(706) 555-7781')

    // Each missing detail is simply absent, and the first-time note is the Pair page's.
    const anaRow = rowFor(popup, ana)
    expect(anaRow).toContain('New to this')
    expect(anaRow).not.toContain(' · New')
    expect(anaRow).not.toContain('>-<')

    // In a group: listed, open, and the row names the group.
    const rosaRow = rowFor(popup, rosa)
    expect(rosaRow).toContain('in Grace’s Group')
    expect(rosaRow.match(/<input[^>]*>/)![0]).not.toMatch(/\sdisabled=""/)

    // In a one-to-one, and of another gender: listed, and greyed with the reason.
    expectGreyed(popup, brianna, 'Already in a 1:1 with David Chen')
    expectGreyed(popup, tom, 'Women’s only: a 1:1 is same-gender')

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
    await pool.query(
      `insert into consent_record
         (ministry_id, person_id, consent, granted, version, source, decided_at, intake_path, declared_side)
       values ($1, $2, 'sms', true, '2026-09-v1', 'pastor_link', now(), 'discipleship', 'mentor')`,
      [relaxed.id, lead],
    )
    const man = await addPerson(relaxed, 'Tom Wilson', { answers: { gender: 'male' } })

    const { html } = await getPage(`/roster?${new URLSearchParams({ list: 'disciplers', pair: lead })}`, theirCookie)
    expect(rowFor(popupIn(html)!, man).match(/<input[^>]*>/)![0]).not.toMatch(/\sdisabled=""/)
  })

  it('says what one tick makes, and that the choice of shape is coming for two', async () => {
    const one = popupIn((await popupAt('disciplers', claire, [['with', sam]])).html)!
    expect(rowFor(one, sam)).toMatch(/checked=""/)
    expect(one.match(/checked=""/g)).toHaveLength(1)
    expect(one).toContain('Claire Martinez will disciple Sam Lee in a one-on-one.')
    expect(one).toMatch(/<button[^>]*type="submit"[^>]*>Create 1:1 pair<\/button>/)
    expect(one).not.toContain('is coming')

    // Two ticked has no shape to become in this ticket: no sentence, a line saying
    // so, and a button that is disabled as the server sends it.
    const two = popupIn((await popupAt('disciplers', claire, [['with', sam], ['with', ana]])).html)!
    expect(two.match(/checked=""/g)).toHaveLength(2)
    expect(two).not.toContain('in a one-on-one.')
    expect(two).toContain('Pairing two or more at once is coming. Tick one for now.')
    expect(two).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Pair<\/button>|<button[^>]*disabled=""[^>]*type="submit"[^>]*>Pair<\/button>/)
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
    expectGreyed(refused, tom, 'Women’s only: a 1:1 is same-gender')
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
})
