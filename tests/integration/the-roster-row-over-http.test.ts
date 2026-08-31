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
})
