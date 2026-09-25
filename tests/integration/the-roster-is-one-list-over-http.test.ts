import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  aTestPhoneNumber,
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import { attribute, hiddenIn, offersToMentor, popupIn } from '../support/pair-popup'

/**
 * The Roster as one list, driven the way an Admin reads it (Roles per pairing,
 * ticket 02): the Everyone menu where the All / Disciplers / Disciples toggle was,
 * the numbers under it, the five columns, and the direction of every pairing in
 * the Paired with cell. Two lists in ticket 36, All as the default in Manual
 * pairing, ticket 06, and one list since.
 *
 * Seeded as the mock-ups James approved on 2026-09-24 (`.lavish/roles-per-pairing/`,
 * `mock-roster-all.html` and `mock-roster-b.html`): Grace disciples Emily and
 * leads Tuesday Women's, Emily disciples Chloe, Rachel disciples Hannah, who is in
 * Tuesday Women's with Lily, David leads Men's Thursday with Noah and Ben, Jacob
 * offered to disciple, Sarah asked to be discipled, and Mia has not completed
 * Intake. The Admin the Ministry is provisioned with is a thirteenth, on the
 * Roster without Intake.
 */

describe.skipIf(skipUnlessAppIsRunning)('the Roster is one list', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string
  const id: Record<string, string> = {}

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel, One List')
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
    id.david = men.leader

    const woman = (fullName: string) => addPerson(ministry, fullName, { phone: aTestPhoneNumber(), answers: { gender: 'female' } })
    id.emily = await woman('Emily Davis')
    await pool.query(`update person set email = 'emily.d@example.org' where id = $1`, [id.emily])
    id.chloe = await woman('Chloe Park')
    id.rachel = await woman('Rachel Adams')
    id.sarah = await woman('Sarah Kim')
    id.jacob = await addPerson(ministry, 'Jacob Hill', { phone: aTestPhoneNumber(), answers: { gender: 'male' } })
    id.mia = await addPerson(ministry, 'Mia Chen', { phone: aTestPhoneNumber(), intake: false })

    await pairOneToOne(ministry, id.grace, id.emily)
    await pairOneToOne(ministry, id.emily, id.chloe)
    await pairOneToOne(ministry, id.rachel, id.hannah)
    await offersToMentor(pool, ministry, id.jacob)
  })

  afterAll(async () => {
    await pool.end()
  })

  const roster = (query = '') => getPage(`/roster${query}`, cookie)

  /** The name cell, in the table's order. */
  const names = (html: string): string[] =>
    [...html.matchAll(/data-testid="roster-name"[^>]*>([^<]+)</g)].map((match) => match[1]!)
  const shownIn = (html: string): Set<string> => new Set(names(html))

  const textOf = (markup: string): string =>
    markup.replace(/<!-- -->/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  /** One Person's row, found by the test id the name carries, as it reads. */
  const rowMarkup = (html: string, name: string): string | undefined =>
    html
      .split('<tr')
      .find((candidate) => new RegExp(`data-testid="roster-name"[^>]*>${name}<`).test(candidate))
      ?.split('</tr>')[0]
  const rowOf = (html: string, name: string): string => {
    const row = rowMarkup(html, name)
    expect(row, `no row for ${name}`).toBeDefined()
    return textOf(row!)
  }

  /** Where Pair on a row goes, or null where the row offers none. */
  const pairLinkOf = (html: string, name: string): string | null =>
    rowMarkup(html, name)?.match(/<a [^>]*href="(\/roster[^"]*)"[^>]*>Pair<\/a>/)?.[1]?.replace(/&amp;/g, '&') ?? null

  const statsLine = (html: string): string => textOf(html.match(/<p class="stats-line">([\s\S]*?)<\/p>/)?.[1] ?? '')

  /** The Everyone menu: whether it is open, its button, its headings, and each option. */
  const menuIn = (html: string) => {
    const details = html.match(/<details class="roster-menu"[^>]*>[\s\S]*?<\/details>/)?.[0]
    expect(details, 'the Everyone menu').toBeDefined()
    return {
      markup: details!,
      open: /\sopen=""/.test(details!.match(/^<details[^>]*>/)![0]),
      button: textOf(details!.match(/<summary>([\s\S]*?)<\/summary>/)![1]!),
      headings: [...details!.matchAll(/<p class="menu-label">([^<]*)<\/p>/g)].map(([, heading]) => heading),
      options: [...details!.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, inner]) => ({
        label: textOf(inner!.replace(/<span class="n">[^<]*<\/span>/, '')),
        count: Number(inner!.match(/<span class="n">(\d+)<\/span>/)?.[1]),
        href: attribute(attributes!, 'href')?.replace(/&amp;/g, '&'),
        ticked: attribute(attributes!, 'aria-current') === 'true',
      })),
    }
  }

  describe('the Everyone menu, where the toggle was', () => {
    it('opens on Everyone, a closed menu directly under the title, and never says Filter', async () => {
      const { html } = await roster()

      const menu = menuIn(html)
      expect(menu.open).toBe(false)
      expect(menu.button).toBe('Everyone')
      expect(menu.markup).not.toMatch(/filter/i)
      // Directly under the word Roster: the card's head holds the title and its
      // actions and nothing else, and the menu is the very next thing after it.
      const head = html.match(/<div class="card-head"><h2 class="card-title">Roster<\/h2><div class="actions"[^>]*>(?:(?!<div|<\/div>)[\s\S])*<\/div><\/div>(<[a-z]+[^>]*>)/)
      expect(head, 'the Roster card head, then what follows it').not.toBeNull()
      expect(head![1]).toBe('<div class="roster-tools">')
      // The toggle is gone, and so is every word it said.
      expect(html).not.toContain('class="seg"')
      expect(html).not.toMatch(/>(All|Disciplers|Disciples)</)
      // One list: everybody, once each, under a column headed for people.
      expect(names(html)).toHaveLength(13)
      expect(shownIn(html).size).toBe(13)
      expect(html).toContain('<th>Name</th>')
      expect(html).toContain('13 people total')
    })

    it('has Everyone at the top, then Pairings, Gender and Access, each option counted over the whole Roster', async () => {
      const menu = menuIn((await roster()).html)
      expect(menu.headings).toEqual(['Pairings', 'Gender', 'Access'])
      expect(menu.options.map(({ label, count }) => [label, count])).toEqual([
        ['Everyone', 13],
        ['Disciples somebody', 4],
        ['Being discipled', 6],
        ['In a group', 6],
        // Sarah, Jacob, Mia, and the Admin provisioned without Intake.
        ['Unpaired', 4],
        ['Offered to disciple, not yet discipling', 1],
        ['Awaiting Intake', 2],
        ['Men and women', 13],
        ['Men', 4],
        // Mia has not completed Intake, so no gender is on file for her, and nor is
        // one for the Admin: both are under Men and women only.
        ['Women', 7],
        ['Admins', 1],
      ])
      // Nothing ticked: Everyone, and Men and women, the default of pick one.
      expect(menu.options.filter(({ ticked }) => ticked).map(({ label }) => label)).toEqual(['Everyone', 'Men and women'])
      expect(menu.options[0]!.href).toBe('/roster')
    })

    it('shows the mock-up’s Being discipled · Women from the address alone, and a refresh keeps it', async () => {
      for (const load of [1, 2]) {
        const { html } = await roster('?pairings=being-discipled&gender=women')
        const menu = menuIn(html)
        expect(menu.button, `load ${load}`).toBe('Being discipled · Women')
        expect(menu.options.filter(({ ticked }) => ticked).map(({ label }) => label)).toEqual(['Being discipled', 'Women'])
        expect(shownIn(html)).toEqual(new Set(['Emily Davis', 'Chloe Park', 'Hannah Brooks', 'Lily Evans']))
        // Counted over the whole Roster, not narrowed by what is ticked.
        expect(menu.options.find(({ label }) => label === 'Men')!.count).toBe(4)
        expect(menu.options.find(({ label }) => label === 'Disciples somebody')!.count).toBe(4)
        expect(statsLine(html)).toBe('4 shown 13 on the Roster')
        // No chips beside the button: it says the same thing, once, in what is
        // drawn and not the payload after it.
        expect(html.replace(/<script[\s\S]*?<\/script>/g, '').match(/Being discipled · Women/g)).toHaveLength(1)
      }
    })

    it('links every option to the address with that one option changed, keeping the menu open', async () => {
      const { html } = await roster('?pairings=being-discipled&gender=women')
      const href = (label: string) => menuIn(html).options.find((option) => option.label === label)!.href
      expect(href('Everyone')).toBe('/roster')
      expect(href('In a group')).toBe('/roster?pairings=being-discipled&pairings=in-a-group&gender=women&menu=open')
      expect(href('Being discipled')).toBe('/roster?gender=women&menu=open')
      expect(href('Men')).toBe('/roster?pairings=being-discipled&gender=men&menu=open')
      expect(href('Men and women')).toBe('/roster?pairings=being-discipled&menu=open')
      expect(href('Admins')).toBe('/roster?pairings=being-discipled&gender=women&access=admins&menu=open')

      // And the page an option lands on has the menu open.
      const landed = await roster('?pairings=being-discipled&pairings=in-a-group&gender=women&menu=open')
      expect(menuIn(landed.html).open).toBe(true)
      expect(menuIn(landed.html).button).toBe('Being discipled · In a group · Women')
      expect(shownIn(landed.html)).toEqual(new Set(['Hannah Brooks', 'Lily Evans']))
    })

    it('means what the spec says by each option', async () => {
      const shownBy = async (query: string) => shownIn((await roster(query)).html)
      expect(await shownBy('?pairings=disciples-somebody')).toEqual(new Set(['David Morris', 'Grace Lee', 'Emily Davis', 'Rachel Adams']))
      expect(await shownBy('?pairings=being-discipled')).toEqual(
        new Set(['Emily Davis', 'Chloe Park', 'Hannah Brooks', 'Lily Evans', 'Noah Reed', 'Ben Carter']),
      )
      expect(await shownBy('?pairings=in-a-group')).toEqual(
        new Set(['David Morris', 'Grace Lee', 'Hannah Brooks', 'Lily Evans', 'Noah Reed', 'Ben Carter']),
      )
      expect(await shownBy('?pairings=unpaired')).toEqual(new Set(['Sarah Kim', 'Jacob Hill', 'Mia Chen', ministry.adminName]))
      expect(await shownBy('?pairings=offered-to-disciple')).toEqual(new Set(['Jacob Hill']))
      expect(await shownBy('?pairings=awaiting-intake')).toEqual(new Set(['Mia Chen', ministry.adminName]))
      // Every one ticked must match: somebody on both sides.
      expect(await shownBy('?pairings=disciples-somebody&pairings=being-discipled')).toEqual(new Set(['Emily Davis']))
      expect(await shownBy('?gender=men')).toEqual(new Set(['David Morris', 'Noah Reed', 'Ben Carter', 'Jacob Hill']))
      expect(await shownBy('?access=admins')).toEqual(new Set([ministry.adminName]))
    })

    it('says so where nobody matches, and keeps the menu to change it', async () => {
      const { html } = await roster('?pairings=unpaired&pairings=disciples-somebody')
      expect(names(html)).toEqual([])
      expect(html).toContain('Nobody on the Roster matches what is ticked.')
      expect(menuIn(html).button).toBe('Disciples somebody · Unpaired')
      expect(statsLine(html)).toBe('0 shown 13 on the Roster')
    })

    it('still opens an old address that carries list=, on Everyone', async () => {
      for (const list of ['all', 'disciplers', 'disciples', 'everyone', '']) {
        const { response, html } = await roster(`?list=${list}`)
        expect(response.status, list).toBe(200)
        expect(menuIn(html).button, list).toBe('Everyone')
        expect(names(html), list).toHaveLength(13)
      }
    })
  })

  describe('the numbers under the menu', () => {
    it('reads total, paired and unpaired with nothing ticked, and never says in groups', async () => {
      const { html } = await roster()
      // Paired is an open pairing in either role: all but Sarah, Jacob, Mia and the Admin.
      expect(statsLine(html)).toBe('13 total 9 paired 4 unpaired')
      expect(html).not.toContain('in groups')
    })
  })

  describe('the Paired with cell', () => {
    it('names the direction of every pairing, leading first, a one-to-one before a group, with its size tag', async () => {
      const { html } = await roster()
      expect(rowOf(html, 'Grace Lee')).toContain('disciples Emily Davis 1:1 leads Tuesday Women’s 2 members')
      expect(rowOf(html, 'Emily Davis')).toContain('disciples Chloe Park 1:1 discipled by Grace Lee 1:1')
      expect(rowOf(html, 'Hannah Brooks')).toContain('discipled by Rachel Adams 1:1 in Tuesday Women’s 2 members')
      expect(rowOf(html, 'Lily Evans')).toContain('in Tuesday Women’s 2 members')
      expect(rowOf(html, 'David Morris')).toContain('leads Men’s Thursday 2 members')
      expect(rowOf(html, 'Chloe Park')).toContain('discipled by Emily Davis 1:1')
      // The direction is drawn apart from who, as the mock-ups draw it.
      expect(rowMarkup(html, 'Emily Davis')).toContain('<span class="dir">discipled by</span>')
    })

    it('keeps the five columns and the contact details on every row', async () => {
      const { html } = await roster()
      for (const heading of ['Name', 'Email', 'Phone', 'Paired with']) expect(html).toContain(`<th>${heading}</th>`)
      expect(rowOf(html, 'Emily Davis')).toContain('emily.d@example.org')
      expect(rowOf(html, 'Emily Davis')).toMatch(/\(555\) \d{3}-\d{4}/)
    })

    it('reads Unpaired, with Pair, for somebody who offered to disciple and leads nobody', async () => {
      const { html } = await roster()
      expect(rowOf(html, 'Jacob Hill')).toContain('Unpaired')
      expect(rowOf(html, 'Jacob Hill')).not.toContain('Offered to mentor')
      expect(pairLinkOf(html, 'Jacob Hill')).toBe(`/roster?pair=${id.jacob}`)
    })

    it('has no footnote explaining a status, because no row prints one', async () => {
      // The sentence under the table explained the chip under every name. Both went
      // with Manual pairing, ticket 07.
      for (const query of ['', '?pairings=being-discipled', '?gender=men']) {
        const { html } = await roster(query)
        expect(html).not.toContain('Status says whether a person is being discipled')
        expect(html).not.toContain('reads Ready to Pair')
      }
    })
  })

  describe('Pair on a row', () => {
    it('opens the popup over what the Roster shows, on the side ticket 01 presets, and every way out returns to it', async () => {
      const { html } = await roster('?pairings=being-discipled&gender=women&menu=open')
      // No side and no open menu: the preset picks the side, and the popup is what is open.
      const href = pairLinkOf(html, 'Emily Davis')
      expect(href).toBe(`/roster?pairings=being-discipled&gender=women&pair=${id.emily}`)

      const opened = await getPage(href!, cookie)
      const popup = popupIn(opened.html)
      expect(popup).not.toBeNull()
      // Emily disciples Chloe, so the preset opens her on Disciples somebody.
      expect(popup!).toMatch(/<a[^>]*aria-current="true"[^>]*>Disciples somebody<\/a>/)
      // Behind it, the same four people, and the menu closed.
      expect(shownIn(opened.html)).toEqual(new Set(['Emily Davis', 'Chloe Park', 'Hannah Brooks', 'Lily Evans']))
      expect(menuIn(opened.html).open).toBe(false)
      // Close lands back on them, and the form carries them to the route.
      expect(popup!).toMatch(/<a class="modal-close"[^>]*href="\/roster\?pairings=being-discipled&amp;gender=women"/)
      expect(hiddenIn(popup!)).toMatchObject({ pair: id.emily, pairings: 'being-discipled', gender: 'women', side: 'discipler' })
      expect(hiddenIn(popup!)).not.toHaveProperty('list')
    })

    it('comes back from a refusal over the same people', async () => {
      const response = await fetch(`${baseUrl}/roster/pair/create`, {
        method: 'POST',
        redirect: 'manual',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        // Sarah's popup on Is discipled, with nobody chosen to disciple her.
        body: new URLSearchParams([
          ['pair', id.sarah!],
          ['side', 'disciple'],
          ['pairings', 'unpaired'],
          ['gender', 'women'],
          ['participantId', id.sarah!],
        ]),
      })
      expect(response.status).toBe(303)
      const location = new URL(response.headers.get('location')!)
      expect([...location.searchParams].slice(0, 4)).toEqual([
        ['pairings', 'unpaired'],
        ['gender', 'women'],
        ['pair', id.sarah],
        ['side', 'disciple'],
      ])
      expect(location.searchParams.get('error')).not.toBeNull()
      expect(location.searchParams.has('list')).toBe(false)
    })
  })

  it('shows a pairing an import planned on both rows, with its direction, and says not made once it is refused', async () => {
    // A Ministry of its own, so the numbers are these two people and the Admin.
    const own = await createMinistryWithAdmin('Planned Chapel, One List')
    const { cookie: theirs } = await signIn(own)

    // Two people an import brought in paired, neither past Intake yet. Each row
    // names the other, which way it would run, and that it is planned and waiting.
    const sam = await addPerson(own, 'Sam Rivera', { phone: aTestPhoneNumber(), intake: false })
    const taylor = await addPerson(own, 'Taylor Brooks', { phone: aTestPhoneNumber(), intake: false })
    const plan = crypto.randomUUID()
    await pool.query(
      `insert into intended_pairing (id, ministry_id, leader_id, participant_id, planned_at)
       values ($1, $2, $3, $4, now())`,
      [plan, own.id, sam, taylor],
    )

    const all = await getPage('/roster', theirs)
    const samsRow = rowOf(all.html, 'Sam Rivera')
    expect(samsRow).toContain('disciples Taylor Brooks planned - awaiting Intake')
    const taylorsRow = rowOf(all.html, 'Taylor Brooks')
    expect(taylorsRow).toContain('discipled by Sam Rivera planned - awaiting Intake')
    // Nobody who has not completed Intake is offered anything to press (James,
    // 2026-09-19). The tag beside the name says why (James, 2026-09-21), and the
    // Paired with cell does not say it again.
    expect(samsRow.split('Awaiting Intake')).toHaveLength(2)
    expect(taylorsRow.split('Awaiting Intake')).toHaveLength(2)
    expect(all.html).not.toContain(`pair=${sam}`)
    expect(all.html).not.toContain(`pair=${taylor}`)
    // A plan is not a pairing: neither is paired, and neither is Unpaired in the
    // menu's sense, which the cell does not say of them either.
    expect(statsLine(all.html)).toBe('3 total 0 paired 3 unpaired')
    expect(menuIn(all.html).options.find(({ label }) => label === 'Unpaired')!.count).toBe(1)

    // Refused, with its Follow-Up Item still open: the row says not made and
    // points at the tab where the Admin acts on it.
    await pool.query(
      `update intended_pairing
          set closed_at = now(), outcome = 'refused', refusal = 'relationship.gender_must_match'
        where id = $1`,
      [plan],
    )
    await pool.query(
      `insert into follow_up_item (ministry_id, kind, person_id, relationship_id, raised_at, payload)
       values ($1, 'intended_pairing_refused', $2, null, now(),
               jsonb_build_object('intendedPairingId', $3::text, 'refusal', 'relationship.gender_must_match'))`,
      [own.id, taylor, plan],
    )
    const refused = await getPage('/roster', theirs)
    expect(rowOf(refused.html, 'Taylor Brooks')).toContain('discipled by Sam Rivera not made - see Follow-Up')
    expect(rowOf(refused.html, 'Taylor Brooks').split('Awaiting Intake')).toHaveLength(2)
    expect(refused.html).toContain('href="/follow-up"')

    // Resolved, and the plan is gone from the row.
    await pool.query(`update follow_up_item set resolved_at = now() where payload ->> 'intendedPairingId' = $1`, [plan])
    const after = await getPage('/roster', theirs)
    expect(rowOf(after.html, 'Taylor Brooks')).not.toContain('not made')
    expect(rowOf(after.html, 'Taylor Brooks')).toContain('Unpaired')
  })
})
