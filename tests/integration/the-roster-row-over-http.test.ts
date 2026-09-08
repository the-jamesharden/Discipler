import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  optOut,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * What an Admin can do to one Person from their own row, driven the way an Admin
 * does it.
 *
 * The row is where the two remaining Roster gaps close. A man who leads two
 * relationships and is discipled by nobody reads `Ready to Pair`, and the general
 * sentence under the table is not enough on its own -- the Admin looking at *him*
 * has to be able to see *those two relationships*, or the status still reads as a
 * bug. And the plan an Admin records about him has to be recordable from the row
 * they are already looking at, before he has completed anything.
 */

describe.skipIf(skipUnlessAppIsRunning)('a Person’s row on the Roster', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  // E.164, because these go on the Person record directly rather than through the
  // import's own reading of a spreadsheet column.
  let numbered = 0
  const number = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const post = async (path: string, cookie: string, body: Record<string, string>) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  it('says which relationships they lead, beside the status that reads as a bug', async () => {
    const { cookie } = await signIn(ministry)

    const leader = await addPerson(ministry, 'Marcus Webb', { phone: number() })
    await pairOneToOne(ministry, leader, await addPerson(ministry, 'Ruth Adeyemi', { phone: number() }))
    await pairOneToOne(ministry, leader, await addPerson(ministry, 'Sam Doyle', { phone: number() }))

    const { html } = await getPage('/roster', cookie)

    // Both relationships, on his row, each said as a relationship rather than as a
    // run of names -- which is what stops `Ready to Pair` beside two names reading
    // as a mistake.
    expect(html).toContain('Leads Ruth Adeyemi')
    expect(html).toContain('Leads Sam Doyle')
    expect(html).toContain('Ready to Pair')
    // The name is the way to everything about one Person (ticket 36).
    expect(html).toContain(`href="/roster/${leader}"`)
  })

  it('says a Participant is in a relationship rather than leading one', async () => {
    const { cookie } = await signIn(ministry)

    const participant = await addPerson(ministry, 'Nadia Farouk', { phone: number() })
    await pairOneToOne(
      ministry,
      await addPerson(ministry, 'Omar Haddad', { phone: number() }),
      participant,
    )

    const { html } = await getPage('/roster', cookie)

    // Her row says she is in one; his says he leads it. Same relationship, two
    // rows, and the difference between them is the whole point of the column.
    expect(html).toContain('In a relationship with Omar Haddad')
    expect(html).toContain('Leads Nadia Farouk')
  })

  it('reads Opted Out and still lists the relationship they are in', async () => {
    // `Opted Out` outranks `Paired`: an Admin needs to see what the Person told the
    // Ministry before what the Ministry arranged for them. Nothing is hidden either
    // way, and that is what settles it -- opting out ends no relationship, and the
    // row still says which one they are in.
    const { cookie } = await signIn(ministry)

    const silent = await addPerson(ministry, 'Tomas Vidal', { phone: number() })
    await pairOneToOne(
      ministry,
      await addPerson(ministry, 'Uche Nwosu', { phone: number() }),
      silent,
    )
    await optOut(ministry, silent)

    const { html } = await getPage('/roster', cookie)
    const row = html.slice(html.indexOf('Tomas Vidal'))

    expect(row).toContain('Opted Out')
    expect(row).toContain('In a relationship with Uche Nwosu')
  })

  /**
   * One Person's row and nothing either side of it. The looser `slice(indexOf(name))`
   * the suites above use reads to the end of the table, which is enough to prove a
   * label is present and cannot prove one is absent -- and absence is half of what
   * Awaiting Leader Acceptance has to say.
   */
  const rowFor = (html: string, name: string): string => {
    // Matched on the name *cell*, not on the name. Every other Person in the
    // relationship is printed inside this row too, so searching the page for
    // "Ezra Kimani" finds whichever row mentions him first -- which is the row of
    // the man he leads.
    // The name cell is the first cell of the row and carries the avatar beside
    // the name, so the match is on the name inside that first cell -- keyed on a
    // test id rather than on the tag around the name, so the markup can change
    // around it (a link, a second line) without this helper following it.
    const row = html
      .split('<tr')
      .find((candidate) =>
        new RegExp(`data-testid="roster-name"[^>]*>${name}<`).test(
          candidate.slice(0, candidate.indexOf('</td>')),
        ),
      )
    expect(row, `no row on the Roster for ${name}`).toBeDefined()
    // Tags stripped, so the assertions read the sentence an Admin reads rather than
    // the markup it is carried in -- a label split across a `<span>` is the same
    // words on the screen, and a test that failed over it would be testing the
    // styling.
    return row!.replace(/<[^>]*>/g, '')
  }

  it('says on the row that a relationship is still awaiting its leader’s acceptance', async () => {
    // The state was derivable from `relationship.accepted_at` and was asserted once,
    // in the banner the pairing screen redirects to, and never again. An Admin who
    // came back a week later to ask which of their pairings had actually started had
    // nowhere on the Roster to read it.
    const { cookie } = await signIn(ministry)

    const leader = await addPerson(ministry, 'Ezra Kimani', { phone: number() })
    const participant = await addPerson(ministry, 'Dele Bakare', { phone: number() })
    await pairOneToOne(ministry, leader, participant, { acceptedAt: null })

    const { html } = await getPage('/roster', cookie)

    // On both rows, because it is one fact about the relationship and neither side
    // of it has started. The Participant has been told nothing yet either.
    expect(rowFor(html, 'Ezra Kimani')).toContain('Leads Dele Bakare — Awaiting Leader Acceptance')
    expect(rowFor(html, 'Dele Bakare')).toContain(
      'In a relationship with Ezra Kimani — Awaiting Leader Acceptance',
    )
  })

  it('stops saying it once that leader has accepted', async () => {
    const { cookie } = await signIn(ministry)

    const leader = await addPerson(ministry, 'Ines Ferreira', { phone: number() })
    const participant = await addPerson(ministry, 'Noor Haddad', { phone: number() })
    await pairOneToOne(ministry, leader, participant, { acceptedAt: new Date() })

    const { html } = await getPage('/roster', cookie)

    expect(rowFor(html, 'Ines Ferreira')).toContain('Leads Noor Haddad')
    // Scoped to her row rather than the page: other suites in this Ministry leave
    // unaccepted relationships behind, so a page-wide `not.toContain` would pass or
    // fail on their fixtures instead of on hers.
    expect(rowFor(html, 'Ines Ferreira')).not.toContain('Awaiting Leader Acceptance')
  })

})
