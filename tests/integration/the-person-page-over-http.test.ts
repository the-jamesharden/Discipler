import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * One Person's own page, driven the way an Admin reaches it: from the name on the
 * Roster. Everything the row used to carry about one Person lives here since
 * ticket 36 -- the Intake link and its result, a new invitation, the password
 * reset -- and the routes that used to send an Admin back to the Roster after any
 * of those send them here, so the result lands beside the act.
 */

describe.skipIf(skipUnlessAppIsRunning)('a Person’s own page', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel', 'Grace Okonkwo')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

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

  /** The path a redirect points at, without the host. */
  const pathOf = (location: string): string => location.replace(/^https?:\/\/[^/]+/, '')

  it('shows the Person, their contact details and what they are on the Roster', async () => {
    const { cookie } = await signIn(ministry)

    const phone = number()
    const person = await addPerson(ministry, 'Quinn Alvarez', { phone })
    await pool.query(`update person set email = 'quinn@example.org' where id = $1`, [person])

    const { response, html } = await getPage(`/roster/${person}`, cookie)
    expect(response.status).toBe(200)

    expect(html).toContain('Quinn Alvarez')
    // Every row shows contact details to an Admin since ticket 36 (ADR-0021), and
    // so does the page behind it.
    expect(html).toContain(phone)
    expect(html).toContain('quinn@example.org')
    expect(html).toContain('Ready to Pair')
    // Somebody who leads nobody and offered nothing on the form is a Disciple.
    expect(html).toContain('A Disciple — not yet paired')
    expect(html).toContain('Back to the Roster')
  })

  it('says why somebody is a Discipler', async () => {
    const { cookie } = await signIn(ministry)

    // Leads somebody, so a Discipler on that fact alone.
    const leader = await addPerson(ministry, 'Marcus Webb', { phone: number() })
    await pairOneToOne(ministry, leader, await addPerson(ministry, 'Ruth Adeyemi', { phone: number() }))

    const led = await getPage(`/roster/${leader}`, cookie)
    expect(led.html).toContain('A Discipler — disciples somebody')
    expect(led.html).toContain('Discipling Ruth Adeyemi')
    expect(led.html).toContain('1:1')

    // Offered on the form and leads nobody yet: a Discipler on the strength of the
    // offer, which is the fact that puts them on that list ahead of any pairing.
    // Consent records are append-only, so the answer is a record of its own, as
    // the discipleship wizard writes one: the latest record that asked is what the
    // Roster reads the side from.
    const offered = await addPerson(ministry, 'Priya Raman', { phone: number() })
    await pool.query(
      `insert into consent_record
         (ministry_id, person_id, consent, granted, version, source, decided_at,
          intake_path, declared_side)
       values ($1, $2, 'sms', true, '2026-09-v1', 'pastor_link', now(), 'discipleship', 'mentor')`,
      [ministry.id, offered],
    )

    const page = await getPage(`/roster/${offered}`, cookie)
    expect(page.html).toContain('offered to on their Intake form, and disciples nobody yet')
  })

  it('is not a page for a Person of another Ministry, or for nobody', async () => {
    const { cookie } = await signIn(ministry)

    const elsewhere = await createMinistryWithAdmin('Another Chapel')
    const theirs = await addPerson(elsewhere, 'Nadia Farouk', { phone: number() })

    // Not found rather than refused: the Roster's own read is scoped to the Admin's
    // Ministry, so there is no such Person as far as this Admin is concerned.
    expect((await getPage(`/roster/${theirs}`, cookie)).response.status).toBe(404)
    expect((await getPage('/roster/00000000-0000-0000-0000-000000000000', cookie)).response.status).toBe(404)
  })

  it('turns a visitor with no session away', async () => {
    const person = await addPerson(ministry, 'Omar Haddad', { phone: number() })
    const { response } = await getPage(`/roster/${person}`, '')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })

  it('sends a Discipler a fresh invitation from the pairing that says they have not accepted', async () => {
    // The condition the tick escalates to an Admin, with the act that answers it
    // beside it. Paired through the real route rather than seeded, because the act
    // under test replaces a link: a fixture that writes the membership rows directly
    // issues no invitation, and the command reads the Leader out of a snapshot that
    // has none. Same gender, since a one-to-one that crosses it is refused.
    const { cookie } = await signIn(ministry)

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

    const before = await getPage(`/roster/${leader}`, cookie)
    expect(before.html).toContain('awaiting acceptance')
    expect(before.html).toContain('Send a new invitation')

    const { response, location } = await post('/roster/reinvite', cookie, {
      relationshipId: relationship!,
      personId: leader,
    })
    expect(response.status).toBe(303)
    // Back to this Person's page, with the receipt.
    expect(pathOf(location)).toBe(`/roster/${leader}?reinvited=1`)

    const after = await getPage(pathOf(location), cookie)
    expect(after.html).toContain('A new invitation has been sent to Malachi Reinvite.')

    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at`,
      [leader],
    )
    // The invitation the pairing sent, and the one the Admin just sent again.
    expect(rows).toHaveLength(2)
    expect(rows[1]?.body).toContain('/invitation/')
  })

  it('claims nothing was sent when nothing was sent', async () => {
    // The receipt is claimed from what happened and never from having asked. Driven
    // through a relationship seeded with no invitation, which is a state the command
    // finds nothing to act on.
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
    expect(pathOf(location)).toBe(`/roster/${leader}`)

    const { html } = await getPage(pathOf(location), cookie)
    expect(html).not.toContain('A new invitation has been sent to Perpetua Silent')
  })

  it('offers no new invitation on a pairing that has been accepted', async () => {
    const { cookie } = await signIn(ministry)

    const leader = await addPerson(ministry, 'Nkechi Settled', { phone: number() })
    await pairOneToOne(
      ministry,
      leader,
      await addPerson(ministry, 'Bo Settled', { phone: number() }),
      { acceptedAt: new Date() },
    )

    const { html } = await getPage(`/roster/${leader}`, cookie)
    // Nothing to re-send. The button belongs to the state, not to the role.
    expect(html).toContain('Discipling Bo Settled')
    expect(html).not.toContain('awaiting acceptance')
    expect(html).not.toContain('Send a new invitation')
  })

  it('offers no new invitation to somebody who is only the Disciple in it', async () => {
    // A Disciple is sent no link at all, per ADR-0011, so there is nothing to
    // re-issue to them -- and an affordance here would be an Admin sending a
    // Disciple a link the product deliberately does not give them.
    const { cookie } = await signIn(ministry)

    const participant = await addPerson(ministry, 'Odile Waiting', { phone: number() })
    await pairOneToOne(
      ministry,
      await addPerson(ministry, 'Caleb Waiting', { phone: number() }),
      participant,
      { acceptedAt: null },
    )

    const { html } = await getPage(`/roster/${participant}`, cookie)
    expect(html).toContain('Discipled by Caleb Waiting')
    expect(html).toContain('awaiting acceptance')
    expect(html).not.toContain('Send a new invitation')
  })

  it('hands the Admin a link that reopens that Person’s own Intake, on their page', async () => {
    const { cookie } = await signIn(ministry)

    const person = await addPerson(ministry, 'Yusuf Kaya', { phone: number() })

    const { response, location } = await post('/roster/intake-link', cookie, {
      personId: person,
    })
    expect(response.status).toBe(303)
    // The Person in the path, the token nowhere in the URL.
    expect(pathOf(location)).toBe(`/roster/${person}?intakeLink=1`)

    const { html } = await getPage(pathOf(location), cookie)

    // Shown, not sent. The Admin passes it on however they are already in touch --
    // texting it to the number on file would reach whoever holds the wrong one.
    expect(html).toContain('Send this to Yusuf Kaya')
    const shown = html.match(/value="[^"]*\/intake\/reopen\/([0-9a-f-]{36})"/)
    expect(shown).not.toBeNull()

    // And it is the token that was just issued to this Person, not somebody else's.
    const { rows } = await pool.query<{ person_id: string }>(
      `select person_id from intake_link where token = $1`,
      [shown![1]!],
    )
    expect(rows[0]?.person_id).toBe(person)
  })

  it('offers no link once the one on file has run out', async () => {
    // `intake_link` is replaced on re-issue rather than deleted, so the row an
    // expired link left behind is still the row this Person holds. Reading it as a
    // live link would put *works until* a date already past in front of an Admin.
    // Reachable because the query string carries the fact that a link was asked
    // for and not the token: the Admin who bookmarks the page, or comes back a
    // fortnight later, asks for the link again without minting one.
    const { cookie } = await signIn(ministry)

    const person = await addPerson(ministry, 'Zara Okafor', { phone: number() })

    const { location } = await post('/roster/intake-link', cookie, { personId: person })

    const live = await getPage(pathOf(location), cookie)
    expect(live.html).toContain('Send this to Zara Okafor')

    // Aged rather than deleted, because a deleted row would prove the null and
    // not the expiry; both dates move because the row checks one against the other.
    await pool.query(
      `update intake_link
          set created_at = now() - interval '15 days',
              expires_at = now() - interval '1 day'
        where person_id = $1`,
      [person],
    )

    const expired = await getPage(pathOf(location), cookie)
    expect(expired.html).not.toContain('Send this to Zara Okafor')
    expect(expired.html).not.toContain('/intake/reopen/')
    expect(expired.html).toContain('has run out')
    // The act is still offered; only the stale result is gone.
    expect(expired.html).toContain('Intake link')
  })

  it('offers a password reset only to somebody who holds an account', async () => {
    const { cookie } = await signIn(ministry)

    const leader = await addPersonWithAccount(ministry, 'Sam Doyle', 'leader', { phone: number() })
    const imported = await addPerson(ministry, 'Esther Ellis', { phone: number() })

    const withAccount = await getPage(`/roster/${leader.personId}`, cookie)
    expect(withAccount.html).toContain(`/roster/reset/${leader.personId}`)
    expect(withAccount.html).toContain('Reset password')

    const without = await getPage(`/roster/${imported}`, cookie)
    expect(without.html).not.toContain('/roster/reset/')
    expect(without.html).not.toContain('Reset password')
    expect(without.html).toContain('No account')
  })

  it('offers the Admin their own change instead of a reset on their own page', async () => {
    const { cookie } = await signIn(ministry)
    const { html } = await getPage(`/roster/${ministry.adminPersonId}`, cookie)

    // Resetting your own password is not a recovery, because you are holding a
    // session as you ask. The page carries the one act that applies instead.
    expect(html).not.toContain(`/roster/reset/${ministry.adminPersonId}`)
    expect(html).toContain('href="/account"')
    expect(html).toContain('Change your password')
  })
})
