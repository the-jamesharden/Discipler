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

    // Both pairings, on his row on the Disciplers list, each naming who he
    // disciples with the size beside it -- which is what stops `Ready to Pair`
    // beside two names reading as a mistake.
    const row = rowFor(html, 'Marcus Webb')
    expect(row).toContain('Ruth Adeyemi 1:1')
    expect(row).toContain('Sam Doyle 1:1')
    expect(row).toContain('Ready to Pair')
    // The name is the way to everything about one Person (ticket 36).
    expect(html).toContain(`href="/roster/${leader}"`)
  })

  it('names the other side on each list: who a Disciple is discipled by, who a Discipler disciples', async () => {
    const { cookie } = await signIn(ministry)

    const participant = await addPerson(ministry, 'Nadia Farouk', { phone: number() })
    await pairOneToOne(
      ministry,
      await addPerson(ministry, 'Omar Haddad', { phone: number() }),
      participant,
    )

    // Same pairing, two lists: her row on the Disciples list names him, his row on
    // the Disciplers list names her, and neither is on the other list.
    const disciples = await getPage('/roster?list=disciples', cookie)
    expect(rowFor(disciples.html, 'Nadia Farouk')).toContain('Omar Haddad 1:1')
    expect(disciples.html).not.toMatch(/roster-name"[^>]*>Omar Haddad</)

    const disciplers = await getPage('/roster', cookie)
    expect(rowFor(disciplers.html, 'Omar Haddad')).toContain('Nadia Farouk 1:1')
    expect(disciplers.html).not.toMatch(/roster-name"[^>]*>Nadia Farouk</)
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

    const { html } = await getPage('/roster?list=disciples', cookie)
    const row = rowFor(html, 'Tomas Vidal')

    expect(row).toContain('Opted Out')
    expect(row).toContain('Uche Nwosu 1:1')
  })

  /**
   * One Person's row and nothing either side of it. The looser `slice(indexOf(name))`
   * the suites above use reads to the end of the table, which is enough to prove a
   * label is present and cannot prove one is absent -- and absence is half of what
   * *awaiting acceptance* has to say.
   */
  const rowFor = (html: string, name: string): string => {
    // Matched on the name *cell*, not on the name. Every other Person in the
    // relationship is printed inside this row too, so searching the page for
    // "Ezra Kimani" finds whichever row mentions him first -- which is the row of
    // the man he leads.
    // Keyed on the test id the name carries and nothing else about the markup,
    // so a link around the name, a second line under it or a column before it
    // change nothing here. Only the name cell carries the id, so a Person named
    // in somebody else's Paired with cell is not found by it.
    const row = html
      .split('<tr')
      .find((candidate) => new RegExp(`data-testid="roster-name"[^>]*>${name}<`).test(candidate))
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

    // On both rows, because it is one fact about the pairing and neither side of
    // it has started. The Disciple has been told nothing yet either.
    const disciplers = await getPage('/roster', cookie)
    expect(rowFor(disciplers.html, 'Ezra Kimani')).toContain('Dele Bakare 1:1 - awaiting acceptance')
    const disciples = await getPage('/roster?list=disciples', cookie)
    expect(rowFor(disciples.html, 'Dele Bakare')).toContain('Ezra Kimani 1:1 - awaiting acceptance')
  })

  it('stops saying it once that leader has accepted', async () => {
    const { cookie } = await signIn(ministry)

    const leader = await addPerson(ministry, 'Ines Ferreira', { phone: number() })
    const participant = await addPerson(ministry, 'Noor Haddad', { phone: number() })
    await pairOneToOne(ministry, leader, participant, { acceptedAt: new Date() })

    const { html } = await getPage('/roster', cookie)

    expect(rowFor(html, 'Ines Ferreira')).toContain('Noor Haddad 1:1')
    // Scoped to her row rather than the page: other suites in this Ministry leave
    // unaccepted pairings behind, so a page-wide `not.toContain` would pass or
    // fail on their fixtures instead of on hers.
    expect(rowFor(html, 'Ines Ferreira')).not.toContain('awaiting acceptance')
  })

})
