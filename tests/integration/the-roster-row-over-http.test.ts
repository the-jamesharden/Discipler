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

  it('says which relationships they lead, and no status under the name', async () => {
    const { cookie } = await signIn(ministry)

    const leader = await addPerson(ministry, 'Marcus Webb', { phone: number() })
    await pairOneToOne(ministry, leader, await addPerson(ministry, 'Ruth Adeyemi', { phone: number() }))
    await pairOneToOne(ministry, leader, await addPerson(ministry, 'Sam Doyle', { phone: number() }))

    const { html } = await getPage('/roster?list=disciplers', cookie)

    // Both pairings, on his row on the Disciplers list, each naming who he
    // disciples with the size beside it. The chip that read `Ready to Pair` beside
    // two names, and looked like a mistake, is gone (Manual pairing, ticket 07).
    const row = rowFor(html, 'Marcus Webb')
    expect(row).toContain('Ruth Adeyemi 1:1')
    expect(row).toContain('Sam Doyle 1:1')
    expect(row).not.toContain('Ready to Pair')
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

    const disciplers = await getPage('/roster?list=disciplers', cookie)
    expect(rowFor(disciplers.html, 'Omar Haddad')).toContain('Nadia Farouk 1:1')
    expect(disciplers.html).not.toMatch(/roster-name"[^>]*>Nadia Farouk</)
  })

  it('reads Opted out and still lists the relationship they are in', async () => {
    // An Admin needs to see what the Person told the Ministry as well as what the
    // Ministry arranged for them. Nothing is hidden either way -- opting out ends
    // no relationship, and the row still says which one they are in. The chip said
    // it until Manual pairing, ticket 07; the Paired with cell says it now, where
    // Pair would have been.
    const { cookie } = await signIn(ministry)

    const silent = await addPerson(ministry, 'Tomas Vidal', { phone: number() })
    await pairOneToOne(
      ministry,
      await addPerson(ministry, 'Uche Nwosu', { phone: number() }),
      silent,
    )
    await optOut(ministry, silent)

    for (const list of ['disciples', 'all']) {
      const { html } = await getPage(`/roster?list=${list}`, cookie)
      const row = rowFor(html, 'Tomas Vidal')
      expect(row).toContain('Uche Nwosu 1:1')
      expect(row).toContain('Opted out')
      expect(row).not.toContain('Opted Out')
      expect(pairLinkFor(html, 'Tomas Vidal')).toBeNull()
    }
  })

  /**
   * What each kind of row offers (Manual pairing, ticket 07): five people, each on
   * their side's list and on All. The same answer on both, because a Person is one
   * row on All and the rule is about the Person.
   */
  describe('what a row offers', () => {
    const onTheirListAndOnAll = async (
      cookie: string,
      side: 'disciplers' | 'disciples',
      check: (html: string, list: string) => void,
    ) => {
      for (const list of [side, 'all']) check((await getPage(`/roster?list=${list}`, cookie)).html, list)
    }

    it('tags the name Awaiting Intake, and offers nothing to press, for somebody who has not completed Intake', async () => {
      const { cookie } = await signIn(ministry)
      await addPerson(ministry, 'Jo Okafor', { phone: number(), intake: false })

      await onTheirListAndOnAll(cookie, 'disciples', (html) => {
        // Beside the name, where an Admin reads down the people (James, 2026-09-21).
        expect(tagFor(html, 'Jo Okafor')).toBe('Awaiting Intake')
        // Said once: the Paired with cell is left with the fact, and nothing to press.
        const row = rowFor(html, 'Jo Okafor')
        expect(row.split('Awaiting Intake')).toHaveLength(2)
        expect(row).toContain('Unpaired')
        expect(row).not.toContain('No Intake Submitted')
        expect(pairLinkFor(html, 'Jo Okafor')).toBeNull()
      })
    })

    it('says Opted out, and offers nothing to press, for somebody who has opted out', async () => {
      const { cookie } = await signIn(ministry)
      const gone = await addPerson(ministry, 'Lena Brandt', { phone: number() })
      await optOut(ministry, gone)

      await onTheirListAndOnAll(cookie, 'disciples', (html) => {
        const row = rowFor(html, 'Lena Brandt')
        expect(tagFor(html, 'Lena Brandt')).toBeNull()
        expect(row).toContain('Opted out')
        expect(row).not.toContain('Unpaired')
        expect(pairLinkFor(html, 'Lena Brandt')).toBeNull()
      })
    })

    it('offers Pair to a Disciple who has completed Intake, opening the popup over the list it is on', async () => {
      const { cookie } = await signIn(ministry)
      const sam = await addPerson(ministry, 'Sam Lee', { phone: number() })

      // The popup, from a Disciple, on Disciples and on All (Manual pairing, ticket 12).
      await onTheirListAndOnAll(cookie, 'disciples', (html, list) => {
        expect(tagFor(html, 'Sam Lee')).toBeNull()
        expect(rowFor(html, 'Sam Lee')).toContain('Unpaired')
        expect(pairLinkFor(html, 'Sam Lee')).toBe(`/roster?list=${list}&pair=${sam}`)
      })
    })

    it('keeps Pair on a Disciple who is already discipled, because they may still join a group', async () => {
      const { cookie } = await signIn(ministry)
      const emily = await addPerson(ministry, 'Emily Davis', { phone: number() })
      await pairOneToOne(ministry, await addPerson(ministry, 'Grace Lee', { phone: number() }), emily)

      await onTheirListAndOnAll(cookie, 'disciples', (html, list) => {
        expect(rowFor(html, 'Emily Davis')).toContain('Grace Lee 1:1')
        expect(pairLinkFor(html, 'Emily Davis')).toBe(`/roster?list=${list}&pair=${emily}`)
      })
    })

    it('offers Pair to a Discipler who leads nobody, preselected as the Discipler', async () => {
      const { cookie } = await signIn(ministry)
      const claire = await addPerson(ministry, 'Claire Martinez', { phone: number() })
      // What answering Mentor on the Intake form records, as the three-lists suite
      // writes it.
      await pool.query(
        `insert into consent_record
           (ministry_id, person_id, consent, granted, version, source, decided_at, intake_path, declared_side)
         values ($1, $2, 'sms', true, '2026-09-v1', 'pastor_link', now(), 'discipleship', 'mentor')`,
        [ministry.id, claire],
      )

      await onTheirListAndOnAll(cookie, 'disciplers', (html, list) => {
        const row = rowFor(html, 'Claire Martinez')
        expect(row).toContain('Unpaired')
        // The tag went with the chip: the Disciplers list already says it.
        expect(row).not.toContain('Offered to mentor')
        expect(pairLinkFor(html, 'Claire Martinez')).toBe(`/roster?list=${list}&pair=${claire}`)
      })
    })

    it('keeps Pair on a Discipler who already leads somebody', async () => {
      const { cookie } = await signIn(ministry)
      const hana = await addPerson(ministry, 'Hana Sato', { phone: number() })
      await pairOneToOne(ministry, hana, await addPerson(ministry, 'Ivy Moreau', { phone: number() }))

      await onTheirListAndOnAll(cookie, 'disciplers', (html, list) => {
        expect(rowFor(html, 'Hana Sato')).toContain('Ivy Moreau 1:1')
        expect(pairLinkFor(html, 'Hana Sato')).toBe(`/roster?list=${list}&pair=${hana}`)
      })
    })

    it('says Opted out, and offers no Pair, for a Discipler who has opted out', async () => {
      // The reason wins over the side (James, 2026-09-19): *Pair on every Discipler
      // row* means a Discipler keeps it when they already lead somebody, and not
      // that one the database would refuse to pair is offered a button. The
      // Discipler who was imported as one and has not completed Intake is in the
      // three-lists suite, beside the plan that makes them one.
      const { cookie } = await signIn(ministry)
      const mentor = await addPerson(ministry, 'Petra Novak', { phone: number() })
      await pool.query(
        `insert into consent_record
           (ministry_id, person_id, consent, granted, version, source, decided_at, intake_path, declared_side)
         values ($1, $2, 'sms', true, '2026-09-v1', 'pastor_link', now(), 'discipleship', 'mentor')`,
        [ministry.id, mentor],
      )
      await optOut(ministry, mentor)

      await onTheirListAndOnAll(cookie, 'disciplers', (html) => {
        const row = rowFor(html, 'Petra Novak')
        expect(row).toContain('Opted out')
        expect(row).not.toContain('Unpaired')
        expect(pairLinkFor(html, 'Petra Novak')).toBeNull()
      })
    })

    it('never says Eligible to lead, a status, or the footnote, on any of the three lists', async () => {
      // *Eligible to lead* left the app on 2026-09-07 and survives only in a design
      // prototype. Pinned, so it cannot come back unnoticed.
      const { cookie } = await signIn(ministry)
      for (const list of ['all', 'disciplers', 'disciples']) {
        const { html } = await getPage(`/roster?list=${list}`, cookie)
        const table = html.match(/<table>[\s\S]*?<\/table>/)?.[0] ?? ''
        expect(table, `the ${list} table`).not.toBe('')
        expect(html).not.toMatch(/eligible to lead/i)
        expect(html).not.toContain('Status says whether')
        // In the table and not the page: the import dialog still says how an
        // imported Person lands, in its own sentence.
        for (const chip of ['Ready to Pair', 'No Intake Submitted', 'Opted Out', 'Offered to mentor']) {
          expect(table).not.toContain(chip)
        }
        expect(table).not.toContain('class="rs ')
        // One tag came back beside a name (James, 2026-09-21), and it is the only one.
        const tags = [...table.matchAll(/data-testid="roster-tag"[^>]*>([^<]*)</g)].map((tag) => tag[1])
        expect(tags.filter((tag) => tag !== 'Awaiting Intake')).toEqual([])
      }
    })
  })

  /** Where Pair on one Person's row goes, or null when the row offers none. */
  /** The tag beside a name, in the name's own cell and directly after it, or null. */
  const tagFor = (html: string, name: string): string | null => {
    const tag = html.match(
      new RegExp(`data-testid="roster-name"[^>]*>${name}</a><span [^>]*data-testid="roster-tag"[^>]*>([^<]*)</span>`),
    )
    return tag ? tag[1]! : null
  }

  const pairLinkFor = (html: string, name: string): string | null => {
    const row = html
      .split('<tr')
      .find((candidate) => new RegExp(`data-testid="roster-name"[^>]*>${name}<`).test(candidate))
    expect(row, `no row on the Roster for ${name}`).toBeDefined()
    // The popup over the Roster, from a Disciple and from a Discipler (Manual pairing, recut ticket 05).
    const link = row!.split('</tr>')[0]!.match(/<a [^>]*href="(\/roster[^"]*)"[^>]*>Pair<\/a>/)
    return link ? link[1]!.replace(/&amp;/g, '&') : null
  }

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
    return row!.split('</tr>')[0]!.replace(/<[^>]*>/g, '')
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
    const disciplers = await getPage('/roster?list=disciplers', cookie)
    expect(rowFor(disciplers.html, 'Ezra Kimani')).toContain('Dele Bakare 1:1 - awaiting acceptance')
    const disciples = await getPage('/roster?list=disciples', cookie)
    expect(rowFor(disciples.html, 'Dele Bakare')).toContain('Ezra Kimani 1:1 - awaiting acceptance')
  })

  it('stops saying it once that leader has accepted', async () => {
    const { cookie } = await signIn(ministry)

    const leader = await addPerson(ministry, 'Ines Ferreira', { phone: number() })
    const participant = await addPerson(ministry, 'Noor Haddad', { phone: number() })
    await pairOneToOne(ministry, leader, participant, { acceptedAt: new Date() })

    const { html } = await getPage('/roster?list=disciplers', cookie)

    expect(rowFor(html, 'Ines Ferreira')).toContain('Noor Haddad 1:1')
    // Scoped to her row rather than the page: other suites in this Ministry leave
    // unaccepted pairings behind, so a page-wide `not.toContain` would pass or
    // fail on their fixtures instead of on hers.
    expect(rowFor(html, 'Ines Ferreira')).not.toContain('awaiting acceptance')
  })

})
