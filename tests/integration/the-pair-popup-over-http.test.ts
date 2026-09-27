import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  optOut,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'
import {
  shownBehind,
  detailsOf,
  expectGreyed,
  expectOpen,
  freshPhoneNumbers,
  hiddenIn,
  offeredAs,
  offersToMentor as recordMentorOffer,
  popupIn,
  postPairing,
  rowFor,
  doingNowOf,
  sectionsOf,
  summaryIn,
} from '../support/pair-popup'

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

  const number = freshPhoneNumbers()

  const offersToMentor = (personId: string, inMinistry: MinistryFixture = ministry) =>
    recordMentorOffer(pool, inMinistry, personId)

  /** The popup over the Roster showing what `shows` ticks in the Everyone menu (Roles per pairing, ticket 02). */
  const popupAt = (shows: string, personId: string, more: Record<string, string> = {}) =>
    getPage(`/roster?${new URLSearchParams([...new URLSearchParams(shows), ['pair', personId], ...Object.entries(more)])}`, cookie)

  /** Everybody the popup offers as the Discipler, by the value its round mark would post. */
  const chosenFrom = (popup: string) => offeredAs(popup, 'leaderId')

  const submit = (fields: Record<string, string>) => postPairing(cookie, Object.entries(fields))

  it('is drawn over what the Roster showed, and is not there without `pair`', async () => {
    const sam = await addPerson(ministry, 'Sam Lee', { phone: number() })
    const claire = await addPerson(ministry, 'Claire Martinez', { phone: '+17065550142' })
    await offersToMentor(claire)

    const without = await getPage('/roster?pairings=unpaired', cookie)
    expect(popupIn(without.html)).toBeNull()

    const { response, html } = await popupAt('pairings=unpaired', sam)
    expect(response.status).toBe(200)
    const popup = popupIn(html)
    expect(popup).not.toBeNull()
    // Open as the server sends it, so a refresh keeps it open and nothing waits on script.
    expect(popup).toMatch(/class="modal-bg open"/)
    expect(popup).toContain('role="dialog"')

    // The Roster behind it shows the Unpaired: the menu's button says so, and
    // Sam's row is in the table under the popup.
    expect(shownBehind(html)).toBe('Unpaired')
    expect(html).toMatch(/data-testid="roster-name"[^>]*>Sam Lee</)

    // The X, Cancel and the backdrop: three ways out, all to the Roster as it was.
    const waysOut = popup!.match(/href="\/roster\?pairings=unpaired"/g) ?? []
    expect(waysOut).toHaveLength(3)

    // And over Everyone the same.
    const overEveryone = await popupAt('', sam)
    expect(popupIn(overEveryone.html)).not.toBeNull()
    expect(shownBehind(overEveryone.html)).toBe('Everyone')
    expect(popupIn(overEveryone.html)!.match(/href="\/roster"/g)).toHaveLength(3)
  })

  it('is titled Pair {name}, says who the list is for, and lists everybody with a round mark', async () => {
    const dana = await addPerson(ministry, 'Dana Whitfield', { phone: number() })
    const grace = await addPerson(ministry, 'Grace Lee', { phone: '+17065559638' })
    await pool.query(`update person set email = 'grace@example.org' where id = $1`, [grace])
    const emily = await addPerson(ministry, 'Emily Davis', { phone: number() })
    await pairOneToOne(ministry, grace, emily)
    // No number and no address: each missing detail is simply absent.
    const bare = await addPerson(ministry, 'Noor Haddad')
    await offersToMentor(bare)

    const popup = popupIn((await popupAt('pairings=unpaired', dana)).html)!
    expect(popup).toContain('Pair Dana Whitfield')
    expect(popup).toContain('Choose who will disciple Dana Whitfield.')

    const graceRow = rowFor(popup, grace)
    expect(graceRow).toMatch(/type="radio"[^>]*name="leaderId"|name="leaderId"[^>]*type="radio"/)
    expect(graceRow).toContain('GL')
    expect(graceRow).toContain('Grace Lee')
    expect(graceRow).toContain('grace@example.org')
    expect(graceRow).toContain('(706) 555-9638')
    expect(graceRow).toContain('leads 1')

    const bareRow = rowFor(popup, bare)
    expect(bareRow).toContain('Noor Haddad')
    expect(detailsOf(bareRow)).toBe('leads nobody yet')
    expect(detailsOf(graceRow)).toBe('grace@example.org · (706) 555-9638 · leads 1')
    expect(bareRow).not.toContain('>-<')

    // Exactly one can be chosen, and nothing else is asked: no boxes, no shape, no
    // gender, no name, no Material.
    expect(popup).not.toContain('type="checkbox"')
    expect(popup).not.toMatch(/name="(declaredGender|name|materialId|joinRequiresApproval)"/)
    // Anybody can be chosen to disciple her (Roles per pairing, ticket 01): somebody
    // who only is discipled is on the list, folded under Everyone else and saying
    // what she does now. Never Dana herself.
    expect(chosenFrom(popup)).toEqual(expect.arrayContaining([grace, bare, emily]))
    expect(chosenFrom(popup)).not.toContain(dana)
    const { first, everyoneElse } = sectionsOf(popup)
    expect(first).toEqual(expect.arrayContaining([grace, bare]))
    expect(everyoneElse).toContain(emily)
    expect(doingNowOf(rowFor(popup, emily))).toBe('Discipled by Grace Lee')
    expect(detailsOf(rowFor(popup, emily))).toMatch(/leads nobody yet$/)
    // Grace's leading is her *leads 1*, and said nowhere else on her row.
    expect(doingNowOf(graceRow)).toBeNull()

    // Nothing chosen: no sentence, and the button reads Pair. The form is an
    // ordinary one, to the existing route, carrying who it is for, what the Roster
    // showed behind it, and the side.
    expect(summaryIn(popup)).toBeNull()
    expect(popup).toMatch(/<button[^>]*type="submit"[^>]*>Pair<\/button>/)
    expect(popup).toMatch(/<form[^>]*method="post"[^>]*action="\/roster\/pair\/create"|<form[^>]*action="\/roster\/pair\/create"[^>]*method="post"/)
    expect(hiddenIn(popup)).toEqual({ pair: dana, pairings: 'unpaired', side: 'disciple', participantId: dana })
  })

  it('opens nothing for a `pair` that names nobody here, or somebody who cannot be paired', async () => {
    const waiting = await addPerson(ministry, 'Jo Okafor', { intake: false })
    const elsewhere = await createMinistryWithAdmin('The Chapel Next Door')
    const theirs = await addPerson(elsewhere, 'Not Ours')

    for (const pair of ['nobody-at-all', waiting, theirs]) {
      const { response, html } = await popupAt('pairings=unpaired', pair)
      expect(response.status, pair).toBe(200)
      expect(popupIn(html), pair).toBeNull()
      expect(shownBehind(html), pair).toBe('Unpaired')
      // And an error in the address is not the import's: its dialog stays shut.
      const withError = await popupAt('pairings=unpaired', pair, { error: 'relationship.gender_must_match' })
      expect(withError.html, pair).not.toMatch(/class="modal-bg open"/)
    }
  })

  // Roles per pairing, ticket 01: nothing on the Roster decides the side. The popup
  // opens preset by who would be a Discipler, and the address says the side on its
  // own, which one press of the side chooser switches.
  it('opens somebody on both sides on Disciples somebody, whatever the Roster shows, and on Is discipled where the address says', async () => {
    // Discipled by somebody and discipling somebody.
    const both = await addPerson(ministry, 'Hana Sato', { phone: number() })
    await pairOneToOne(ministry, both, await addPerson(ministry, 'Ivy Moreau', { phone: number() }))
    await pairOneToOne(ministry, await addPerson(ministry, 'Ruth Adeyemi', { phone: number() }), both)

    for (const shows of ['', 'pairings=disciples-somebody', 'pairings=being-discipled']) {
      // Her row opens the popup with no side in its address, and it opens preset.
      const { html } = await getPage(`/roster?${shows}`, cookie)
      expect(html, shows).toContain(`href="/roster?${shows === '' ? '' : `${shows}&amp;`}pair=${both}"`)
      expect(html, shows).not.toContain('href="/roster/pair')

      const asDiscipler = popupIn((await popupAt(shows, both)).html)!
      expect(asDiscipler, shows).toContain('Choose who Hana Sato will disciple.')
      expect(asDiscipler, shows).not.toContain(`name="participantId" value="${both}"`)
      expect(asDiscipler, shows).not.toContain(`value="${both}" name="participantId"`)
    }

    // On Is discipled where the address says so, and her own name is not on its list.
    const asDisciple = popupIn((await popupAt('', both, { side: 'disciple' })).html)!
    expect(asDisciple).toContain('Pair Hana Sato')
    expect(asDisciple).toContain('Choose who will disciple Hana Sato.')
    expect(chosenFrom(asDisciple)).not.toContain(both)
  })

  it('forms a one-to-one awaiting acceptance, and the receipt is over what the Roster showed', async () => {
    const disciple = await addPerson(ministry, 'Lena Brandt', { phone: number() })
    const discipler = await addPerson(ministry, 'Marta Koch', { phone: number() })
    await offersToMentor(discipler)

    const location = await submit({ pair: disciple, pairings: 'being-discipled', participantId: disciple, leaderId: discipler })
    expect(location.pathname).toBe('/roster')
    expect(Object.fromEntries(location.searchParams)).toEqual({ pairings: 'being-discipled', paired: '1' })

    const { html } = await getPage(`${location.pathname}${location.search}`, cookie)
    expect(popupIn(html)).toBeNull()
    expect(shownBehind(html)).toBe('Being discipled')
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
    const { html } = await popupAt('', disciple, {
      error: 'relationship.person_already_in_this_relationship',
      leaderId: discipler,
    })
    const popup = popupIn(html)!
    expect(popup).toContain('Pair Tom Wilson')
    expect(popup).toMatch(/role="alert"/)
    expect(popup).not.toContain('relationship.person_already_in_this_relationship')
    expect(rowFor(popup, discipler)).toMatch(/checked=""/)
    expect(popup.match(/checked=""/g)).toHaveLength(1)
    expect(summaryIn(popup)).toBe(
      'Rafael Delgado will disciple Tom Wilson, one to one. Rafael is sent an invitation to accept.',
    )
    expect(popup).toContain('<b>Rafael Delgado will disciple Tom Wilson</b>, one to one.')
    expect(popup).toMatch(/<button[^>]*type="submit"[^>]*>Create 1:1 pair<\/button>/)
    // Over Everyone, where it was pressed; and the refusal is the popup's, so the
    // import dialog behind it is shut.
    expect(shownBehind(html)).toBe('Everyone')
    expect(html.match(/class="modal-bg open"/g)).toHaveLength(1)
  })

  /**
   * Who is greyed for a Disciple (Manual pairing, ticket 23, stage 1). A greyed row
   * is shown with its reason, holds a round mark nobody can press and no form
   * posts, and the database underneath still refuses what it refused before.
   */
  describe('who is greyed', () => {
    // Decided by James on 2026-09-21: from a Disciple, somebody gender rules out is
    // not shown at all, in place of a greyed row. Every other reason is still greyed.
    it('leaves out a Discipler of another gender, never one with no gender on file, and the database still refuses', async () => {
      const tom = await addPerson(ministry, 'Tom Wilson', { phone: number(), answers: { gender: 'male' } })
      const rosa = await addPerson(ministry, 'Rosa Delgado', { phone: number(), answers: { gender: 'female' } })
      // A gender is asked on every Intake form, so nobody who has completed Intake
      // is without one: no gender on file is somebody who never has. They are not
      // greyed for gender, whoever the popup is for; what their row says is the
      // thing an Admin can act on. Open against every declaration is the pure
      // rule's to prove, in tests/app/who-is-greyed.test.ts.
      const unasked = await addPerson(ministry, 'Pat Unasked', { phone: number(), intake: false })
      await Promise.all([offersToMentor(rosa), offersToMentor(unasked)])

      const popup = popupIn((await popupAt('', tom)).html)!
      expect(chosenFrom(popup)).not.toContain(rosa)
      expect(popup).not.toContain('Rosa Delgado')
      expect(popup).not.toContain('same-gender')
      // Somebody who cannot be chosen for another reason is shown, greyed, and
      // counted; she is not.
      expectGreyed(popup, unasked, 'Awaiting Intake')
      const { first, everyoneElse } = sectionsOf(popup)
      expect(first.length + everyoneElse.length).toBe(chosenFrom(popup).length)
      expect(popup).toContain(`${first.length} lead or offered · ${everyoneElse.length} more`)

      // Leaving her out removed no rule underneath: posted anyway, the database
      // refuses it as it always did, and the popup comes back with the reason. The
      // choice is not on the list, so nothing is restored as chosen.
      const location = await submit({ pair: tom, participantId: tom, leaderId: rosa })
      expect(Object.fromEntries(location.searchParams)).toEqual({
        pair: tom,
        error: 'relationship.gender_must_match',
        leaderId: rosa,
      })
      const refused = popupIn((await getPage(`${location.pathname}${location.search}`, cookie)).html)!
      expect(refused).toMatch(/role="alert"[^>]*>[^<]*gender/i)
      expect(chosenFrom(refused)).not.toContain(rosa)
      expect(refused).not.toMatch(/checked=""/)
      expect(summaryIn(refused)).toBeNull()
      expect(refused).toMatch(/<button[^>]*type="submit"[^>]*>Pair<\/button>/)
      const formed = await pool.query(`select 1 from relationship_member where person_id = $1`, [tom])
      expect(formed.rows).toEqual([])
    })

    it('leaves nobody out, and greys nobody, for gender in a Ministry that does not enforce the match', async () => {
      const relaxed = await createMinistryWithAdmin('The Chapel That Does Not Enforce')
      await pool.query(`update ministry set suggest_gender_match = false where id = $1`, [relaxed.id])
      const theirCookie = (await signIn(relaxed)).cookie
      const tom = await addPerson(relaxed, 'Tom Wilson', { phone: number(), answers: { gender: 'male' } })
      const rosa = await addPerson(relaxed, 'Rosa Delgado', { phone: number(), answers: { gender: 'female' } })
      await offersToMentor(rosa, relaxed)

      const { html } = await getPage(`/roster?${new URLSearchParams({ pair: tom })}`, theirCookie)
      expectOpen(popupIn(html)!, rosa)
    })

    it('greys every Discipler for a Disciple already in a one-to-one, naming who with', async () => {
      const david = await addPerson(ministry, 'David Chen', { phone: number() })
      const brianna = await addPerson(ministry, 'Brianna Frazier', { phone: number() })
      await pairOneToOne(ministry, david, brianna)
      const other = await addPerson(ministry, 'Another Discipler', { phone: number() })
      await offersToMentor(other)

      const popup = popupIn((await popupAt('', brianna)).html)!
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

      const popup = popupIn((await popupAt('', disciple)).html)!
      expectGreyed(popup, waiting, 'Awaiting Intake')
      expectGreyed(popup, left, 'Opted out')
    })
  })

  it('restores nobody for a `leaderId` that is not on the popup’s list', async () => {
    const disciple = await addPerson(ministry, 'Una Petrov', { phone: number() })
    // Everybody on this Roster is on the list now (Roles per pairing, ticket 01), so
    // the stranger is somebody on another Ministry's.
    const elsewhere = await createMinistryWithAdmin('The Chapel Across The Road')
    const stranger = await addPerson(elsewhere, 'Not On This Roster', { phone: number() })

    const { html } = await popupAt('', disciple, { leaderId: stranger })
    const popup = popupIn(html)!
    expect(popup).not.toMatch(/checked=""/)
    expect(summaryIn(popup)).toBeNull()
  })

  it('returns a refusal of a form with no popup of its own to its Discipler’s popup', async () => {
    // Manual pairing, recut ticket 05: the old Pair page is gone, and every refusal
    // returns to the popup. No `pair` field, as the old page's form posted.
    const disciple = await addPerson(ministry, 'Vera Lindqvist', { phone: number(), answers: { gender: 'female' } })
    const discipler = await addPerson(ministry, 'Walt Brenner', { phone: number(), answers: { gender: 'male' } })

    const location = await submit({ participantId: disciple, leaderId: discipler })
    expect(location.pathname).toBe('/roster')
    expect(location.searchParams.has('list')).toBe(false)
    expect(location.searchParams.get('pair')).toBe(discipler)
    expect(location.searchParams.get('side')).toBe('discipler')
    expect(location.searchParams.getAll('with')).toEqual([disciple])
    expect(location.searchParams.get('error')).toBe('relationship.gender_must_match')

    // And to the Disciple's, where it names no Discipler.
    const alone = await submit({ participantId: disciple })
    expect(alone.pathname).toBe('/roster')
    expect(alone.searchParams.has('list')).toBe(false)
    expect(alone.searchParams.get('pair')).toBe(disciple)
    expect(alone.searchParams.get('side')).toBe('disciple')
    expect(alone.searchParams.get('error')).toBe('relationship.needs_a_leader')
    const popup = popupIn((await getPage(`${alone.pathname}${alone.search}`, cookie)).html)!
    expect(popup).toContain('Pair Vera Lindqvist')
    expect(popup).toMatch(/role="alert"/)
  })
})
