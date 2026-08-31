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
    const row = html
      .split('<tr')
      .find((candidate) => candidate.startsWith(`><td>${name}</td>`))
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

  it('sends a leader a fresh invitation from the row that says they have not accepted', async () => {
    // The condition the tick escalates to an Admin, with the act that answers it on
    // the same row. Before this the Admin was told a relationship had not been
    // accepted and had no way to do anything about it.
    const { cookie } = await signIn(ministry)

    // Paired through the real route rather than seeded, because the act under test
    // re-sends a link: a fixture that writes the membership rows directly issues no
    // invitation, and there would be nothing to send again. Same gender, since a
    // one-to-one that crosses it is refused.
    const leader = await addPerson(ministry, 'Malachi Reinvite', {
      phone: number(),
      answers: { gender: 'male' },
    })
    const participant = await addPerson(ministry, 'Ari Reinvite', {
      phone: number(),
      answers: { gender: 'male' },
    })
    const paired = await post('/roster/pair/create', cookie, {
      leaderId: leader,
      participantId: participant,
    })
    expect(paired.response.status).toBe(303)
    expect(paired.location).not.toContain('refused')

    const { rows: created } = await pool.query<{ relationship_id: string }>(
      `select relationship_id from relationship_member where person_id = $1`,
      [leader],
    )
    const relationship = created[0]?.relationship_id
    expect(relationship).toBeDefined()

    const before = await getPage('/roster', cookie)
    expect(rowFor(before.html, 'Malachi Reinvite')).toContain('Send a new invitation')

    const { response } = await post('/roster/reinvite', cookie, {
      relationshipId: relationship!,
      personId: leader,
    })
    expect(response.status).toBe(303)

    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at`,
      [leader],
    )
    // The invitation the pairing sent, and the one the Admin just sent again.
    expect(rows).toHaveLength(2)
    expect(rows[1]?.body).toContain('/invitation/')
  })

  it('claims nothing was sent when nothing was sent', async () => {
    // The receipt used to be claimed from having asked rather than from what
    // happened. Every no-op path leaves the Leader on the Roster under their own
    // name, so a confirmation keyed on the id alone told an Admin a text had gone
    // out when none had. Driven here through a relationship seeded with no
    // invitation, which is a state the command finds nothing to act on.
    const { cookie } = await signIn(ministry)

    const leader = await addPerson(ministry, 'Perpetua Silent', { phone: number() })
    const relationship = await pairOneToOne(
      ministry,
      leader,
      await addPerson(ministry, 'Quill Silent', { phone: number() }),
      { acceptedAt: null },
    )

    const { response, location } = await post('/roster/reinvite', cookie, {
      relationshipId: relationship,
      personId: leader,
    })
    expect(response.status).toBe(303)
    expect(location).not.toContain('reinvited')

    const { html } = await getPage(location.replace(/^https?:\/\/[^/]+/, ''), cookie)
    expect(html).not.toContain('A new invitation has been sent to Perpetua Silent')
  })

  it('offers no new invitation on a relationship that has been accepted', async () => {
    const { cookie } = await signIn(ministry)

    const leader = await addPerson(ministry, 'Nkechi Settled', { phone: number() })
    await pairOneToOne(
      ministry,
      leader,
      await addPerson(ministry, 'Bo Settled', { phone: number() }),
      { acceptedAt: new Date() },
    )

    const { html } = await getPage('/roster', cookie)
    // Nothing to re-send. The button belongs to the state, not to the role.
    expect(rowFor(html, 'Nkechi Settled')).not.toContain('Send a new invitation')
  })

  it('offers no new invitation to somebody who is only a participant in it', async () => {
    // A Participant is sent no link at all, per ADR-0011, so there is nothing to
    // re-issue to them -- and an affordance here would be an Admin sending a
    // Participant a link the product deliberately does not give them.
    const { cookie } = await signIn(ministry)

    const participant = await addPerson(ministry, 'Odile Waiting', { phone: number() })
    await pairOneToOne(
      ministry,
      await addPerson(ministry, 'Caleb Waiting', { phone: number() }),
      participant,
      { acceptedAt: null },
    )

    const { html } = await getPage('/roster', cookie)
    expect(rowFor(html, 'Odile Waiting')).toContain('Awaiting Leader Acceptance')
    expect(rowFor(html, 'Odile Waiting')).not.toContain('Send a new invitation')
  })

  it('marks somebody eligible to lead before they have completed Intake', async () => {
    const { cookie } = await signIn(ministry)

    await addPerson(ministry, 'Priya Raman', { intake: false, phone: number() })

    const before = await getPage('/roster', cookie)
    expect(before.html).toContain('No — mark eligible')

    const person = before.html.match(
      /name="personId" value="([0-9a-f-]{36})"[\s\S]{0,200}?value="yes"/,
    )
    expect(person).not.toBeNull()

    const { response } = await post('/roster/eligibility', cookie, {
      personId: person![1]!,
      eligible: 'yes',
    })
    expect(response.status).toBe(303)

    const after = await getPage('/roster', cookie)
    expect(after.html).toContain('Yes — withdraw')
  })

  it('hands the Admin a link that reopens that Person’s own Intake', async () => {
    const { cookie } = await signIn(ministry)

    const person = await addPerson(ministry, 'Quinn Alvarez', { phone: number() })

    const { response, location } = await post('/roster/intake-link', cookie, {
      personId: person,
    })
    expect(response.status).toBe(303)
    expect(location).toContain(`intakeLinkFor=${person}`)

    const { html } = await getPage(`/roster?${location.split('?')[1] ?? ''}`, cookie)

    // Shown, not sent. The Admin passes it on however they are already in touch --
    // texting it to the number on file would reach whoever holds the wrong one.
    expect(html).toContain('Send this to')
    const shown = html.match(/value="[^"]*\/intake\/reopen\/([0-9a-f-]{36})"/)
    expect(shown).not.toBeNull()

    // And it is the token that was just issued to this Person, not somebody
    // else's: one row's link at a time, read back under the Admin's own session.
    const { rows } = await pool.query<{ person_id: string }>(
      `select person_id from intake_link where token = $1`,
      [shown![1]!],
    )
    expect(rows[0]?.person_id).toBe(person)
  })

  it('offers no link once the one on file has run out', async () => {
    // `intake_link` is replaced on re-issue rather than deleted, so the row an
    // expired link left behind is still the row this Person holds. Reading it as a
    // live link would put *works until* a date already past in front of an Admin and
    // send the Person to the page that tells them to ask for a link they were just
    // given.
    //
    // Reachable because the Person is in the query string and the token is not: the
    // Admin who bookmarks the confirmation, or comes back to the tab a fortnight
    // later, asks this page for the link again without going through the act that
    // mints one.
    const { cookie } = await signIn(ministry)

    const person = await addPerson(ministry, 'Yusuf Kaya', { phone: number() })

    const { location } = await post('/roster/intake-link', cookie, { personId: person })
    const query = location.split('?')[1] ?? ''

    const live = await getPage(`/roster?${query}`, cookie)
    expect(live.html).toContain('Send this to')

    // The same row, a fortnight and a day older. Aged in place rather than deleted,
    // because a deleted row would prove the null and not the expiry.
    await pool.query(
      `update intake_link
          set created_at = now() - interval '15 days',
              expires_at = now() - interval '1 day'
        where person_id = $1`,
      [person],
    )

    const expired = await getPage(`/roster?${query}`, cookie)
    expect(expired.html).not.toContain('Send this to')
    expect(expired.html).not.toContain('/intake/reopen/')

    // And the control that mints a replacement is still on the row, which is what
    // makes the absence recoverable rather than a dead end.
    expect(expired.html).toContain('Intake link')
  })
})
