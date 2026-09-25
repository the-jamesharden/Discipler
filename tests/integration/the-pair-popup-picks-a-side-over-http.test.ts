import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  aTestPhoneNumber,
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'
import {
  attribute,
  chosenIn,
  detailsOf,
  doingNowOf,
  expectGreyed,
  expectLeftOut,
  expectOpen,
  foldIn,
  foldIsOpen,
  hiddenIn,
  offeredAs,
  offersToMentor,
  popupIn,
  postPairing,
  rowFor,
  sectionsOf,
  summaryIn,
} from '../support/pair-popup'

/**
 * Roles per pairing, ticket 01: the Pair popup picks a side, then a person. Nobody
 * is a Discipler or a Disciple; the popup asks which side of this one pairing the
 * person is on, and anybody who has completed Intake can be picked on either side.
 * This is the bug fix: Emily, who finished Intake and said nothing about mentoring,
 * could not be picked to disciple Sarah from anywhere.
 *
 * Seeded as the mock-ups James approved on 2026-09-24 (`.lavish/roles-per-pairing/`,
 * `mock-pair-emily.html` and `mock-pair-sarah.html`): Grace disciples Emily and
 * leads Tuesday Women's, Rachel disciples Hannah, who is in Tuesday Women's with
 * Lily, David leads Men's Thursday, and Sarah, Chloe and Jacob are unpaired. Mia
 * has not completed Intake. What needs script is the same component, rendered by
 * the server from the same address, so a restored choice shows it here.
 */
describe.skipIf(skipUnlessAppIsRunning)('the Pair popup picks a side', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string
  const id: Record<string, string> = {}
  let tuesday: string
  let mensThursday: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel, Roles Per Pairing')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie

    const women = await formGroup(ministry, {
      name: 'Tuesday Women’s',
      declaredGender: 'female',
      leader: { name: 'Grace Lee', gender: 'female', phone: aTestPhoneNumber() },
      disciples: [
        { name: 'Hannah Brooks', gender: 'female', phone: aTestPhoneNumber() },
        { name: 'Lily Evans', gender: 'female', phone: aTestPhoneNumber() },
      ],
    })
    tuesday = women.id
    id.grace = women.leader
    ;[id.hannah, id.lily] = women.disciples as [string, string]
    const men = await formGroup(ministry, {
      name: 'Men’s Thursday',
      declaredGender: 'male',
      leader: { name: 'David Morris', gender: 'male', phone: aTestPhoneNumber() },
      disciples: [
        { name: 'Noah Reed', gender: 'male', phone: aTestPhoneNumber() },
        { name: 'Ben Carter', gender: 'male', phone: aTestPhoneNumber() },
      ],
    })
    mensThursday = men.id
    id.david = men.leader
    ;[id.noah, id.ben] = men.disciples as [string, string]

    const woman = (fullName: string) => addPerson(ministry, fullName, { phone: aTestPhoneNumber(), answers: { gender: 'female' } })
    id.emily = await woman('Emily Davis')
    id.chloe = await woman('Chloe Park')
    await pool.query(`update intake_submission set first_time = true where person_id = $1`, [id.chloe])
    id.rachel = await woman('Rachel Adams')
    id.sarah = await woman('Sarah Kim')
    id.jacob = await addPerson(ministry, 'Jacob Hill', { phone: aTestPhoneNumber(), answers: { gender: 'male' } })
    id.mia = await addPerson(ministry, 'Mia Chen', { phone: aTestPhoneNumber(), intake: false })

    await pairOneToOne(ministry, id.grace, id.emily)
    await pairOneToOne(ministry, id.rachel, id.hannah)
    await offersToMentor(pool, ministry, id.grace)
  })

  afterAll(async () => {
    await pool.end()
  })

  const popupAt = async (query: readonly (readonly [string, string])[]) => {
    const page = await getPage(`/roster?${new URLSearchParams(query.map(([name, value]) => [name, value]))}`, cookie)
    return { ...page, popup: popupIn(page.html)! }
  }

  /** The side chooser's two links, by the words on them, and which is current. */
  const chooserIn = (popup: string) => {
    const nav = popup.match(/<nav class="seg-radio"[\s\S]*?<\/nav>/)?.[0] ?? ''
    return [...nav.matchAll(/<a([^>]*)>([^<]*)<\/a>/g)].map(([, attributes, says]) => ({
      says,
      href: attribute(attributes!, 'href')?.replace(/&amp;/g, '&'),
      current: attribute(attributes!, 'aria-current') === 'true',
    }))
  }

  describe('the side chooser', () => {
    it('sits directly under the title, and says who by first name', async () => {
      const { popup } = await popupAt([['list', 'all'], ['pair', id.emily!]])
      const head = popup.indexOf('Pair Emily Davis')
      const chooser = popup.indexOf('In this pairing, Emily')
      const intro = popup.indexOf('Choose who will disciple Emily Davis.')
      expect(head).toBeGreaterThan(-1)
      expect(chooser).toBeGreaterThan(head)
      expect(intro).toBeGreaterThan(chooser)
      // Nothing between the head's end and the chooser.
      expect(popup.slice(popup.indexOf('</div>', head) + '</div>'.length, chooser)).toMatch(/^<div class="pair-side"><span class="pair-side-who" id="pair-side-label">$/)
      expect(chooserIn(popup).map(({ says, current }) => [says, current])).toEqual([
        ['Disciples somebody', false],
        ['Is discipled', true],
      ])
    })

    it('switches with one press, keeping everything else in the address and leaving a refusal behind', async () => {
      const { popup } = await popupAt([
        ['list', 'all'],
        ['pair', id.emily!],
        ['leaderId', id.grace!],
        ['error', 'relationship.person_already_in_this_relationship'],
      ])
      const [disciples, discipled] = chooserIn(popup)
      expect(disciples!.href).toBe(`/roster?list=all&pair=${id.emily}&leaderId=${id.grace}&side=discipler`)
      expect(discipled!.href).toBe(`/roster?list=all&pair=${id.emily}&leaderId=${id.grace}&side=disciple`)

      // Pressed, it is the other side, over the same list, with nothing refused.
      const switched = await getPage(disciples!.href!, cookie)
      const other = popupIn(switched.html)!
      expect(other).toContain('Choose who Emily Davis will disciple.')
      expect(other).not.toMatch(/role="alert"/)
      expect(chooserIn(other).find(({ current }) => current)?.says).toBe('Disciples somebody')
      expect(hiddenIn(other)).toMatchObject({ pair: id.emily, list: 'all', side: 'discipler', leaderId: id.emily })
    })
  })

  describe('the side it opens on', () => {
    it('is Is discipled for Emily, who leads nobody and said nothing about mentoring', async () => {
      const { popup } = await popupAt([['list', 'all'], ['pair', id.emily!]])
      expect(popup).toContain('Choose who will disciple Emily Davis.')
      expect(hiddenIn(popup)).toMatchObject({ side: 'disciple', participantId: id.emily })
    })

    it('is Disciples somebody for Grace, who leads, and for Rachel, who leads, whatever list', async () => {
      for (const list of ['all', 'disciples', 'disciplers']) {
        for (const who of [id.grace!, id.rachel!]) {
          const { popup } = await popupAt([['list', list], ['pair', who]])
          expect(hiddenIn(popup), list).toMatchObject({ side: 'discipler', leaderId: who })
        }
      }
    })

    it('is whatever the address says, which never limits who can be picked', async () => {
      const { popup } = await popupAt([['list', 'all'], ['pair', id.emily!], ['side', 'discipler']])
      expect(popup).toContain('Choose who Emily Davis will disciple.')
      // Sarah can be ticked: this is the bug fix.
      expectOpen(popup, id.sarah!)
      const grace = await popupAt([['list', 'all'], ['pair', id.grace!], ['side', 'disciple']])
      expect(grace.popup).toContain('Choose who will disciple Grace Lee.')
    })
  })

  describe('Emily, on Disciples somebody (mock-pair-emily.html)', () => {
    const emilys = () => popupAt([['list', 'all'], ['pair', id.emily!], ['side', 'discipler']])

    it('opens on who asked to be discipled, and folds everybody else under Everyone else', async () => {
      const { popup } = await emilys()
      const { first, everyoneElse } = sectionsOf(popup)
      expect(first).toEqual([id.chloe, id.sarah])
      expect(popup).toMatch(/<p class="pair-group-head">Asked to be discipled<\/p>/)
      for (const other of [id.grace, id.hannah, id.lily, id.rachel, id.mia, ministry.adminPersonId]) {
        expect(everyoneElse).toContain(other)
      }
      // Closed as the server sends it: the browser's own disclosure, one press to open
      // with script or without, its count in the summary.
      expect(foldIsOpen(popup)).toBe(false)
      expect(foldIn(popup)).toContain(`<summary>Everyone else <span>· ${everyoneElse.length}</span></summary>`)
      expect(popup).toContain(`>2 asked · ${everyoneElse.length} more · 1 group<`)
    })

    it('says on a second line what each of everybody else does now', async () => {
      const { popup } = await emilys()
      expect(doingNowOf(rowFor(popup, id.lily!))).toBe('In Tuesday Women’s')
      expect(doingNowOf(rowFor(popup, id.rachel!))).toBe('Disciples Hannah Brooks')
      expect(doingNowOf(rowFor(popup, id.grace!))).toBe('Disciples Emily Davis · Leads Tuesday Women’s')
      // And nothing where there is nothing, and the first-time note stays a detail.
      expect(doingNowOf(rowFor(popup, id.chloe!))).toBeNull()
      expect(detailsOf(rowFor(popup, id.chloe!))).toMatch(/New to this$/)
    })

    it('greys who cannot be chosen with the reason, and draws neither Emily nor the men', async () => {
      const { popup } = await emilys()
      expectGreyed(popup, id.hannah!, 'Already in a 1:1 with Rachel Adams')
      expectGreyed(popup, id.mia!, 'Awaiting Intake')
      expectOpen(popup, id.lily!)
      expectOpen(popup, id.rachel!)
      expectOpen(popup, id.grace!)
      for (const nobody of [id.jacob!, id.noah!, id.ben!, id.david!]) expectLeftOut(popup, nobody)
      // Emily herself is only who the form is for, never a row.
      expect(offeredAs(popup, 'participantId')).not.toContain(id.emily)
      // The women's group is hers to co-lead; the men's is not drawn.
      expect(offeredAs(popup, 'groupId')).toEqual([tuesday])
      expect(popup).not.toContain(mensThursday)
    })

    it('says both sides and what Emily goes on doing, in the ticket’s words', async () => {
      const { popup } = await popupAt([['list', 'all'], ['pair', id.emily!], ['side', 'discipler'], ['with', id.chloe!]])
      expect(chosenIn(popup)).toEqual([id.chloe])
      expect(summaryIn(popup)).toBe(
        'Emily Davis will disciple Chloe Park, one to one. Emily is sent an invitation to accept, and goes on being discipled by Grace Lee.',
      )
      expect(popup).toContain('<b>Emily Davis will disciple Chloe Park</b>, one to one.')
      expect(popup).toMatch(/<button[^>]*type="submit"[^>]*>Create 1:1 pair<\/button>/)
    })

    it('opens the fold where a refusal restored a tick in it', async () => {
      const { popup } = await popupAt([['list', 'all'], ['pair', id.emily!], ['side', 'discipler'], ['with', id.lily!]])
      expect(foldIsOpen(popup)).toBe(true)
      expect(chosenIn(popup)).toEqual([id.lily])
    })
  })

  describe('Sarah, on Is discipled (mock-pair-sarah.html)', () => {
    const sarahs = (more: readonly (readonly [string, string])[] = []) =>
      popupAt([['list', 'all'], ['pair', id.sarah!], ...more])

    it('opens on who disciples somebody already, or offered to, with leads N', async () => {
      const { popup } = await sarahs()
      const { first, everyoneElse } = sectionsOf(popup)
      expect(first).toEqual(expect.arrayContaining([id.grace, id.rachel]))
      expect(first).not.toContain(id.emily)
      expect(popup).toMatch(/<p class="pair-group-head">Disciples somebody already, or offered to<\/p>/)
      expect(detailsOf(rowFor(popup, id.grace!))).toMatch(/leads 3$/)
      expect(detailsOf(rowFor(popup, id.rachel!))).toMatch(/leads 1$/)
      // What they lead is their *leads N*, and said nowhere else on the row.
      expect(doingNowOf(rowFor(popup, id.grace!))).toBeNull()

      for (const other of [id.emily, id.hannah, id.lily, id.chloe, id.mia]) expect(everyoneElse).toContain(other)
      expect(foldIsOpen(popup)).toBe(false)
      expect(popup).toContain(`>${first.length} lead or offered · ${everyoneElse.length} more · 1 group<`)
      expect(doingNowOf(rowFor(popup, id.emily!))).toBe('Discipled by Grace Lee')
      expect(doingNowOf(rowFor(popup, id.hannah!))).toBe('Discipled by Rachel Adams · In Tuesday Women’s')
      expect(detailsOf(rowFor(popup, id.hannah!))).toMatch(/leads nobody yet$/)
      expectGreyed(popup, id.mia!, 'Awaiting Intake')
      for (const nobody of [id.jacob!, id.noah!, id.ben!, id.david!]) expectLeftOut(popup, nobody)
      expect(offeredAs(popup, 'leaderId')).not.toContain(id.sarah)
    })

    it('opens the fold on a choice restored in it, and says what Hannah goes on doing', async () => {
      const { popup } = await sarahs([['leaderId', id.hannah!]])
      expect(foldIsOpen(popup)).toBe(true)
      expect(chosenIn(popup)).toEqual([id.hannah])
      expect(summaryIn(popup)).toBe(
        'Hannah Brooks will disciple Sarah Kim, one to one. Hannah is sent an invitation to accept, '
        + 'and goes on being discipled by Rachel Adams and in Tuesday Women’s.',
      )
    })
  })

  describe('a refusal', () => {
    it('reopens on the side it was posted from, and not on the preset', async () => {
      // Emily would open on Is discipled; posted from Disciples somebody, with Hannah,
      // who is in a one-to-one already, the database refuses it.
      const location = await postPairing(cookie, [
        ['pair', id.emily!],
        ['list', 'all'],
        ['side', 'discipler'],
        ['leaderId', id.emily!],
        ['participantId', id.hannah!],
      ])
      expect(location.pathname).toBe('/roster')
      expect(location.searchParams.get('side')).toBe('discipler')
      expect(location.searchParams.get('error')).toBeTruthy()
      const { html } = await getPage(`${location.pathname}${location.search}`, cookie)
      const popup = popupIn(html)!
      expect(popup).toMatch(/role="alert"/)
      expect(popup).toContain('Choose who Emily Davis will disciple.')
      expect(hiddenIn(popup)).toMatchObject({ side: 'discipler' })
    })

    it('from the route that joins a group, too', async () => {
      const response = await fetch(`${baseUrl}/roster/pair/join`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
        body: new URLSearchParams({ pair: id.jacob!, list: 'all', side: 'discipler', personId: id.jacob!, groupId: tuesday, as: 'leader' }),
      })
      const location = new URL(response.headers.get('location') ?? '', baseUrl)
      expect(location.searchParams.get('side')).toBe('discipler')
      expect(location.searchParams.get('error')).toBeTruthy()
    })
  })

  it('pairs Emily to disciple Sarah through the real route: Emily is invited and gains an account by accepting, and Sarah hears nothing until then', async () => {
    const chapel = await createMinistryWithAdmin('Riverside Chapel, Emily Disciples Sarah')
    const theirCookie = (await signIn(chapel)).cookie
    const woman = (fullName: string) => addPerson(chapel, fullName, { phone: aTestPhoneNumber(), answers: { gender: 'female' } })
    const grace = await woman('Grace Lee')
    const emily = await woman('Emily Davis')
    const sarah = await woman('Sarah Kim')
    await pairOneToOne(chapel, grace, emily)

    // The popup as the Admin reaches it: Emily's row, then one press to her other side.
    const opened = popupIn((await getPage(`/roster?list=all&pair=${emily}`, theirCookie)).html)!
    const onTheOtherSide = chooserIn(opened).find(({ says }) => says === 'Disciples somebody')!.href!
    const popup = popupIn((await getPage(onTheOtherSide, theirCookie)).html)!
    expect(sectionsOf(popup).first).toContain(sarah)
    expectOpen(popup, sarah)

    // Exactly what its form posts, with Sarah ticked.
    const posted = Object.entries(hiddenIn(popup) as Record<string, string>)
    const location = await postPairing(theirCookie, [...posted, ['participantId', sarah]])
    expect(location.pathname).toBe('/roster')
    expect(Object.fromEntries(location.searchParams)).toEqual({ list: 'all', paired: '1' })

    const formed = await pool.query<{ role: string; person_id: string; accepted_at: Date | null; id: string }>(
      `select m.role, m.person_id, r.accepted_at, r.id
         from relationship r
         join relationship_member m on m.relationship_id = r.id
        where r.id in (select relationship_id from relationship_member where person_id = $1 and role = 'participant')`,
      [sarah],
    )
    expect(formed.rows.map(({ role, person_id }) => [role, person_id]).sort()).toEqual([
      ['leader', emily],
      ['participant', sarah],
    ])
    expect(formed.rows[0]!.accepted_at).toBeNull()

    // Emily is invited as any Discipler is; Sarah hears nothing.
    const textsTo = async (person: string) =>
      (await pool.query<{ body: string }>(`select body from outbound_message where person_id = $1 order by enqueued_at`, [person])).rows.map(
        ({ body }) => body,
      )
    expect((await textsTo(emily)).filter((body) => body.includes('Have a look and let us know'))).toHaveLength(1)
    expect(await textsTo(sarah)).toEqual([])

    // Emily accepts on her link and gains an account.
    const { rows: invitation } = await pool.query<{ token: string }>(
      `select token from invitation where person_id = $1 and relationship_id = $2 and consumed_at is null`,
      [emily, formed.rows[0]!.id],
    )
    expect(invitation).toHaveLength(1)
    const accepted = await fetch(`${baseUrl}/invitation/${invitation[0]!.token}/accept`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ fullName: 'Emily Davis', password: 'a-long-enough-password' }),
    })
    expect(accepted.headers.get('location')).toContain('done=accepted')
    const { rows: after } = await pool.query<{ user_id: string | null; accepted_at: Date | null }>(
      `select p.user_id, r.accepted_at from person p, relationship r where p.id = $1 and r.id = $2`,
      [emily, formed.rows[0]!.id],
    )
    expect(after[0]!.user_id).not.toBeNull()
    expect(after[0]!.accepted_at).not.toBeNull()

    // And only now is Sarah told, with who.
    const toSarah = await textsTo(sarah)
    expect(toSarah).toHaveLength(1)
    expect(toSarah[0]).toContain('Emily Davis')
  }, 20_000)
})
