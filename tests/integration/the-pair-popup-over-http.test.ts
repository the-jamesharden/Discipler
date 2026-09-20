import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  optOut,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The Pair popup over the Roster, opened from a Disciple's row (Manual pairing,
 * ticket 12), as an Admin's browser receives it. The popup is the Roster's own
 * page at `?pair=`, fed from the document the Roster already read, so what is
 * proved here is the markup: present with `pair`, absent without, over the list
 * the Admin was on, and a refusal that comes back with the choice restored.
 *
 * What needs script (the sentence appearing as a round mark is pressed, the
 * disabled button) is looked at in a browser; the server renders the same
 * component, so a restored choice shows both here.
 */

describe.skipIf(skipUnlessAppIsRunning)('the Pair popup, from a Disciple', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Popup Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  let numbered = 0
  const number = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  /** What answering Mentor on the Intake form records: the fact that makes a Discipler of somebody who leads nobody. */
  const offersToMentor = (personId: string, of: MinistryFixture = ministry) =>
    pool.query(
      `insert into consent_record
         (ministry_id, person_id, consent, granted, version, source, decided_at, intake_path, declared_side)
       values ($1, $2, 'sms', true, '2026-09-v1', 'pastor_link', now(), 'discipleship', 'mentor')`,
      [of.id, personId],
    )

  const popupAt = (list: string, personId: string, more: Record<string, string> = {}) =>
    getPage(`/roster?${new URLSearchParams({ list, pair: personId, ...more })}`, cookie)

  /** The popup's own markup and nothing of the Roster behind it, or null where there is none. */
  const popupIn = (html: string): string | null =>
    html.match(/<div[^>]*data-testid="pair-popup"[\s\S]*?<\/form>/)?.[0] ?? null

  /** One Discipler's row in the popup: its label, from the round mark to the end of it. */
  const optionFor = (popup: string, personId: string): string => {
    const option = popup.split('<label').find((each) => each.includes(`value="${personId}"`))
    expect(option, `no row in the popup for ${personId}`).toBeDefined()
    return option!.split('</label>')[0]!
  }

  const attribute = (tag: string, name: string): string | undefined =>
    tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

  const inputsIn = (popup: string): readonly string[] => popup.match(/<input[^>]*>/g) ?? []

  /** Everybody the popup offers as the Discipler, by the value its round mark would post. */
  const chosenFrom = (popup: string): readonly (string | undefined)[] =>
    inputsIn(popup)
      .filter((input) => attribute(input, 'name') === 'leaderId')
      .map((input) => attribute(input, 'value'))

  /** What the form posts without being asked: who the popup is for, the list behind it, and the Disciple. */
  const hiddenIn = (popup: string): Record<string, string | undefined> =>
    Object.fromEntries(
      inputsIn(popup)
        .filter((input) => attribute(input, 'type') === 'hidden')
        .map((input) => [attribute(input, 'name'), attribute(input, 'value')]),
    )

  const currentList =(html: string): string | undefined =>
    html.match(/<a[^>]*aria-current="true"[^>]*>([^<]*)<\/a>/)?.[1]

  const submit = async (fields: Record<string, string>) => {
    const response = await fetch(`${baseUrl}/roster/pair/create`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams(fields),
    })
    return new URL(response.headers.get('location') ?? '', baseUrl)
  }

  it('is drawn over the list the Admin was on, and is not there without `pair`', async () => {
    const sam = await addPerson(ministry, 'Sam Lee', { phone: number() })
    const claire = await addPerson(ministry, 'Claire Martinez', { phone: '+17065550142' })
    await offersToMentor(claire)

    const without = await getPage('/roster?list=disciples', cookie)
    expect(popupIn(without.html)).toBeNull()

    const { response, html } = await popupAt('disciples', sam)
    expect(response.status).toBe(200)
    const popup = popupIn(html)
    expect(popup).not.toBeNull()
    // Open as the server sends it, so a refresh keeps it open and nothing waits on script.
    expect(popup).toMatch(/class="modal-bg open"/)
    expect(popup).toContain('role="dialog"')

    // The Roster behind it is the Disciples list: the toggle says so, and Sam's
    // row is in the table under the popup.
    expect(currentList(html)).toBe('Disciples')
    expect(html).toMatch(/data-testid="roster-name"[^>]*>Sam Lee</)

    // The X, Cancel and the backdrop: three ways out, all to the Roster as it was.
    const waysOut = popup!.match(/href="\/roster\?list=disciples"/g) ?? []
    expect(waysOut).toHaveLength(3)

    // And on All the same, over All.
    const onAll = await popupAt('all', sam)
    expect(popupIn(onAll.html)).not.toBeNull()
    expect(currentList(onAll.html)).toBe('All')
    expect(popupIn(onAll.html)!.match(/href="\/roster\?list=all"/g)).toHaveLength(3)
  })

  it('is titled Pair {name}, says who the list is for, and lists every Discipler with a round mark', async () => {
    const dana = await addPerson(ministry, 'Dana Whitfield', { phone: number() })
    const grace = await addPerson(ministry, 'Grace Lee', { phone: '+17065559638' })
    await pool.query(`update person set email = 'grace@example.org' where id = $1`, [grace])
    await pairOneToOne(ministry, grace, await addPerson(ministry, 'Emily Davis', { phone: number() }))
    // No number and no address: each missing detail is simply absent.
    const bare = await addPerson(ministry, 'Noor Haddad')
    await offersToMentor(bare)

    const popup = popupIn((await popupAt('disciples', dana)).html)!
    expect(popup).toContain('Pair Dana Whitfield')
    expect(popup).toContain('Choose who will disciple Dana Whitfield.')

    const graceRow = optionFor(popup, grace)
    expect(graceRow).toMatch(/type="radio"[^>]*name="leaderId"|name="leaderId"[^>]*type="radio"/)
    expect(graceRow).toContain('GL')
    expect(graceRow).toContain('Grace Lee')
    expect(graceRow).toContain('grace@example.org')
    expect(graceRow).toContain('(706) 555-9638')
    expect(graceRow).toContain('leads 1')

    const bareRow = optionFor(popup, bare)
    expect(bareRow).toContain('Noor Haddad')
    expect(bareRow).toContain('leads nobody yet')
    expect(bareRow).not.toContain(' · leads')
    expect(bareRow).not.toContain('>-<')

    // Exactly one can be chosen, and nothing else is asked: no boxes, no shape, no
    // gender, no name, no Material.
    expect(popup).not.toContain('type="checkbox"')
    expect(popup).not.toMatch(/name="(declaredGender|name|materialId|joinRequiresApproval)"/)
    // Somebody who is only a Disciple is not on the list, and neither is Dana.
    expect(popup).not.toContain('Emily Davis')
    expect(chosenFrom(popup)).toEqual(expect.arrayContaining([grace, bare]))
    expect(chosenFrom(popup)).not.toContain(dana)

    // Nothing chosen: no sentence, and the button reads Pair. The form is an
    // ordinary one, to the existing route, carrying who it is for and the list.
    expect(popup).not.toContain('will disciple Dana Whitfield in a one-on-one')
    expect(popup).toMatch(/<button[^>]*type="submit"[^>]*>Pair<\/button>/)
    expect(popup).toMatch(/<form[^>]*method="post"[^>]*action="\/roster\/pair\/create"|<form[^>]*action="\/roster\/pair\/create"[^>]*method="post"/)
    expect(hiddenIn(popup)).toEqual({ pair: dana, list: 'disciples', participantId: dana })
  })

  it('opens nothing for a `pair` that names nobody here, or somebody who cannot be paired', async () => {
    const waiting = await addPerson(ministry, 'Jo Okafor', { intake: false })
    const elsewhere = await createMinistryWithAdmin('The Chapel Next Door')
    const theirs = await addPerson(elsewhere, 'Not Ours')

    for (const pair of ['nobody-at-all', waiting, theirs]) {
      const { response, html } = await popupAt('disciples', pair)
      expect(response.status, pair).toBe(200)
      expect(popupIn(html), pair).toBeNull()
      expect(currentList(html), pair).toBe('Disciples')
      // And an error in the address is not the import's: its dialog stays shut.
      const withError = await popupAt('disciples', pair, { error: 'relationship.gender_must_match' })
      expect(withError.html, pair).not.toMatch(/class="modal-bg open"/)
    }
  })

  it('lets the toggle decide the side for somebody on both lists', async () => {
    // Discipled by somebody and discipling somebody: on both lists.
    const both = await addPerson(ministry, 'Hana Sato', { phone: number() })
    await pairOneToOne(ministry, both, await addPerson(ministry, 'Ivy Moreau', { phone: number() }))
    await pairOneToOne(ministry, await addPerson(ministry, 'Ruth Adeyemi', { phone: number() }), both)

    // As a Disciple on Disciples: the popup, and her own name is not on its list.
    const asDisciple = await popupAt('disciples', both)
    const popup = popupIn(asDisciple.html)
    expect(popup).toContain('Pair Hana Sato')
    expect(chosenFrom(popup!)).not.toContain(both)
    expect(asDisciple.html).toContain(`href="/roster?list=disciples&amp;pair=${both}"`)

    // As a Discipler on Disciplers and on All. Her row still goes to the old Pair
    // page until ticket 27 links this side; by its address the popup opens on the
    // Discipler's side (Manual pairing, ticket 23), and never lists her own name.
    for (const list of ['disciplers', 'all']) {
      const { html } = await getPage(`/roster?list=${list}`, cookie)
      expect(html, list).toContain(`href="/roster/pair?leaderId=${both}"`)
      expect(html, list).not.toContain(`pair=${both}`)

      const asDiscipler = await popupAt(list, both)
      expect(asDiscipler.response.status, list).toBe(200)
      const theirs = popupIn(asDiscipler.html)!
      expect(theirs, list).toContain('Choose who Hana Sato will disciple.')
      expect(theirs, list).not.toContain(`name="participantId" value="${both}"`)
      expect(theirs, list).not.toContain(`value="${both}" name="participantId"`)
    }
  })

  it('forms a one-to-one awaiting acceptance, and the receipt is on the list the Admin was on', async () => {
    const disciple = await addPerson(ministry, 'Lena Brandt', { phone: number() })
    const discipler = await addPerson(ministry, 'Marta Koch', { phone: number() })
    await offersToMentor(discipler)

    const location = await submit({ pair: disciple, list: 'disciples', participantId: disciple, leaderId: discipler })
    expect(location.pathname).toBe('/roster')
    expect(Object.fromEntries(location.searchParams)).toEqual({ list: 'disciples', paired: '1' })

    const { html } = await getPage(`${location.pathname}${location.search}`, cookie)
    expect(popupIn(html)).toBeNull()
    expect(currentList(html)).toBe('Disciples')
    expect(html).toContain('They are paired.')
    expect(html).toMatch(/Marta Koch[\s\S]{0,200}awaiting acceptance/)

    const formed = await pool.query(
      `select r.kind, r.accepted_at
         from relationship r
         join relationship_member m on m.relationship_id = r.id
        where m.person_id = $1 and m.role = 'participant'`,
      [disciple],
    )
    expect(formed.rows).toEqual([{ kind: 'one_to_one', accepted_at: null }])
  })

  it('reopens on a refusal with the reason and the chosen Discipler restored', async () => {
    const disciple = await addPerson(ministry, 'Tom Wilson', { phone: number(), answers: { gender: 'male' } })
    const discipler = await addPerson(ministry, 'Rafael Delgado', { phone: number(), answers: { gender: 'male' } })
    await offersToMentor(discipler)

    // Whatever was refused, the address carries the code and who was chosen. A
    // choice that can still be made comes back chosen.
    const { html } = await popupAt('all', disciple, {
      error: 'relationship.person_already_in_this_relationship',
      leaderId: discipler,
    })
    const popup = popupIn(html)!
    expect(popup).toContain('Pair Tom Wilson')
    expect(popup).toMatch(/role="alert"/)
    expect(popup).not.toContain('relationship.person_already_in_this_relationship')
    expect(optionFor(popup, discipler)).toMatch(/checked=""/)
    expect(popup.match(/checked=""/g)).toHaveLength(1)
    expect(popup).toContain('Rafael Delgado will disciple Tom Wilson in a one-on-one.')
    expect(popup).toMatch(/<button[^>]*type="submit"[^>]*>Create 1:1 pair<\/button>/)
    // Over All, where it was pressed; and the refusal is the popup's, so the
    // import dialog behind it is shut.
    expect(currentList(html)).toBe('All')
    expect(html.match(/class="modal-bg open"/g)).toHaveLength(1)
  })

  /**
   * Who is greyed for a Disciple (Manual pairing, ticket 23, stage 1). A greyed row
   * is shown with its reason, holds a round mark nobody can press and no form
   * posts, and the database underneath still refuses what it refused before.
   */
  describe('who is greyed', () => {
    /** A greyed row: shown, its round mark disabled, and its reason tied to it for a screen reader. */
    const expectGreyed = (popup: string, personId: string, reason: string) => {
      const row = optionFor(popup, personId)
      const mark = row.match(/<input[^>]*>/)![0]
      expect(mark, reason).toMatch(/\sdisabled=""/)
      expect(mark, reason).not.toMatch(/\schecked=""/)
      const described = attribute(mark, 'aria-describedby')
      expect(described, reason).toBeDefined()
      expect(row, reason).toMatch(new RegExp(`id="${described}"[^>]*>${reason}<`))
    }

    const expectOpen = (popup: string, personId: string) => {
      const mark = optionFor(popup, personId).match(/<input[^>]*>/)![0]
      expect(mark).not.toMatch(/\sdisabled=""/)
      expect(mark).not.toContain('aria-describedby')
    }

    it('greys a Discipler of another gender, never one with no gender on file for gender, and the database still refuses', async () => {
      const tom = await addPerson(ministry, 'Tom Wilson', { phone: number(), answers: { gender: 'male' } })
      const rosa = await addPerson(ministry, 'Rosa Delgado', { phone: number(), answers: { gender: 'female' } })
      // A gender is asked on every Intake form, so nobody who has completed Intake
      // is without one: no gender on file is somebody who never has. They are not
      // greyed for gender, whoever the popup is for; what their row says is the
      // thing an Admin can act on. Open against every declaration is the pure
      // rule's to prove, in tests/app/who-is-greyed.test.ts.
      const unasked = await addPerson(ministry, 'Pat Unasked', { phone: number(), intake: false })
      await Promise.all([offersToMentor(rosa), offersToMentor(unasked)])

      const popup = popupIn((await popupAt('disciples', tom)).html)!
      expectGreyed(popup, rosa, 'Men’s only: a 1:1 is same-gender')
      // Greyed is shown, not hidden, and she still reads as who she is.
      expect(optionFor(popup, rosa)).toContain('Rosa Delgado')
      expectGreyed(popup, unasked, 'Awaiting Intake')
      expect(optionFor(popup, unasked)).not.toContain('same-gender')

      // The greying removed no rule underneath: posted anyway, the database refuses
      // it as it always did, and the popup comes back with the reason. The choice is
      // a greyed row now, so it is not restored as chosen.
      const location = await submit({ pair: tom, list: 'all', participantId: tom, leaderId: rosa })
      expect(Object.fromEntries(location.searchParams)).toEqual({
        list: 'all',
        pair: tom,
        error: 'relationship.gender_must_match',
        leaderId: rosa,
      })
      const refused = popupIn((await getPage(`${location.pathname}${location.search}`, cookie)).html)!
      expect(refused).toMatch(/role="alert"[^>]*>[^<]*gender/i)
      expectGreyed(refused, rosa, 'Men’s only: a 1:1 is same-gender')
      expect(refused).not.toMatch(/checked=""/)
      expect(refused).not.toContain('in a one-on-one.')
      expect(refused).toMatch(/<button[^>]*type="submit"[^>]*>Pair<\/button>/)
      const formed = await pool.query(`select 1 from relationship_member where person_id = $1`, [tom])
      expect(formed.rows).toEqual([])
    })

    it('greys nobody for gender in a Ministry that does not enforce the match', async () => {
      const relaxed = await createMinistryWithAdmin('The Chapel That Does Not Enforce')
      await pool.query(`update ministry set suggest_gender_match = false where id = $1`, [relaxed.id])
      const theirCookie = (await signIn(relaxed)).cookie
      const tom = await addPerson(relaxed, 'Tom Wilson', { phone: number(), answers: { gender: 'male' } })
      const rosa = await addPerson(relaxed, 'Rosa Delgado', { phone: number(), answers: { gender: 'female' } })
      await offersToMentor(rosa, relaxed)

      const { html } = await getPage(`/roster?${new URLSearchParams({ list: 'disciples', pair: tom })}`, theirCookie)
      expectOpen(popupIn(html)!, rosa)
    })

    it('greys every Discipler for a Disciple already in a one-to-one, naming who with', async () => {
      const david = await addPerson(ministry, 'David Chen', { phone: number() })
      const brianna = await addPerson(ministry, 'Brianna Frazier', { phone: number() })
      await pairOneToOne(ministry, david, brianna)
      const other = await addPerson(ministry, 'Another Discipler', { phone: number() })
      await offersToMentor(other)

      const popup = popupIn((await popupAt('disciples', brianna)).html)!
      const offered = chosenFrom(popup)
      expect(offered).toEqual(expect.arrayContaining([david, other]))
      for (const discipler of offered) expectGreyed(popup, discipler!, 'Already in a 1:1 with David Chen')
    })

    it('greys a Discipler who has not completed Intake, and one who has opted out, in their Roster row’s words', async () => {
      const disciple = await addPerson(ministry, 'Wendy Okoye', { phone: number() })
      const waiting = await addPerson(ministry, 'Still Waiting', { phone: number(), intake: false })
      const left = await addPerson(ministry, 'Opted Outerson', { phone: number() })
      await Promise.all([offersToMentor(waiting), offersToMentor(left)])
      await optOut(ministry, left)

      const popup = popupIn((await popupAt('disciples', disciple)).html)!
      expectGreyed(popup, waiting, 'Awaiting Intake')
      expectGreyed(popup, left, 'Opted out')
    })
  })

  it('restores nobody for a `leaderId` that is not on the popup’s list', async () => {
    const disciple = await addPerson(ministry, 'Una Petrov', { phone: number() })
    const stranger = await addPerson(ministry, 'Only A Disciple', { phone: number() })

    const { html } = await popupAt('disciples', disciple, { leaderId: stranger })
    const popup = popupIn(html)!
    expect(popup).not.toMatch(/checked=""/)
    expect(popup).not.toContain('in a one-on-one')
  })

  it('leaves the old Pair page’s refusals on the old Pair page', async () => {
    const disciple = await addPerson(ministry, 'Vera Lindqvist', { phone: number(), answers: { gender: 'female' } })
    const discipler = await addPerson(ministry, 'Walt Brenner', { phone: number(), answers: { gender: 'male' } })

    // No `pair` field: this is the old page's own form.
    const location = await submit({ participantId: disciple, leaderId: discipler })
    expect(location.pathname).toBe('/roster/pair')
    expect(location.searchParams.get('error')).toBe('relationship.gender_must_match')
  })
})
