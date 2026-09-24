import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { personId } from '~/domain/ids'
import { baseUrl, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  aTestPhoneNumber,
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * A text a Person's or an Admin's own act produced goes out while they are still
 * looking at the page, not at the top of the next hour. Nothing sends the queue but
 * a drain, so each route that can enqueue has to run one after it answers, the way
 * the inbound webhook does (ADR-0020).
 *
 * The running app has no vendor account, so a message reaching Twilio is not what
 * these look for. A message with nobody to send it to is withheld by a drain before
 * the vendor is asked, and only a drain ever writes that -- so a stray row withheld
 * after the request is the proof the request ran one.
 */
describe.skipIf(skipUnlessAppIsRunning)('a pairing is texted at once', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  const aStrayMessage = async (): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into outbound_message
         (ministry_id, carries_rates_line, person_id, to_phone, body, enqueued_at, message_kind)
       values ($1, false, null, null, 'Riverside Chapel: a message with nobody to send it to', now(), 'no_reply')
       returning id`,
      [ministry.id],
    )
    return rows[0]!.id
  }

  /** Polled, because the drain runs after the response rather than before it. */
  const drained = async (stray: string): Promise<boolean> => {
    for (let attempt = 0; attempt < 500; attempt++) {
      const { rows } = await pool.query<{ withheld_reason: string | null }>(
        `select withheld_reason from outbound_message where id = $1`,
        [stray],
      )
      if (rows[0]?.withheld_reason) return true
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    return false
  }

  const invitationsTo = async (id: string): Promise<string[]> => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at`,
      [id],
    )
    // The Invitation, and not the Welcome Message, which promises to text once they
    // have been paired.
    return rows.map((row) => row.body).filter((body) => body.includes('Have a look and let us know'))
  }

  const goalId = async (): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )
    return rows[0]!.id
  }

  it('texts the Discipler of an imported pair the moment their Intake completes it', async () => {
    const { cookie } = await signIn(ministry)
    const disciplerPhone = aTestPhoneNumber()
    const disciplePhone = aTestPhoneNumber()

    const imported = await fetch(`${baseUrl}/roster/import`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        mode: 'already_paired',
        rows: [
          'Discipler\tDiscipler Phone\tDiscipler Email\tDisciple\tDisciple Phone\tDisciple Email',
          `Isaac Planned\t${disciplerPhone}\t\tJonah Planned\t${disciplePhone}\t`,
        ].join('\n'),
      }),
    })
    expect(imported.headers.get('location')).toContain('planned=1')

    const { rows } = await pool.query<{ id: string; full_name: string }>(
      `select id, full_name from person where ministry_id = $1 and full_name in ('Isaac Planned', 'Jonah Planned')`,
      [ministry.id],
    )
    const idOf = (name: string) => rows.find((row) => row.full_name === name)!.id
    await completeIntake(ministry, idOf('Jonah Planned'), undefined, undefined, { gender: 'male' })

    const stray = await aStrayMessage()

    // The Discipler fills in the discipleship form with the number the import holds.
    const body = new URLSearchParams({
      via: 'qr',
      side: 'mentor',
      ageBand: '45-54',
      gender: 'male',
      experience: 'done_before',
      fullName: 'Isaac Planned',
      phone: disciplerPhone,
      goalId: await goalId(),
      smsConsent: 'yes',
      contactSharing: 'granted',
    })
    body.append('availability', 'tuesday:09')
    const submitted = await fetch(`${baseUrl}/intake/${ministry.id}/discipleship/submit`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    expect(submitted.headers.get('location')).toContain('/discipleship/done')

    // The plan became a pairing, and the text saying so was queued for Isaac...
    expect(await invitationsTo(idOf('Isaac Planned'))).toHaveLength(1)
    // ...and sent by a drain the submission ran, not left for the hour.
    expect(await drained(stray)).toBe(true)
  }, 15_000)

  it('texts the Discipler an Admin pairs by hand the moment the Admin presses Pair', async () => {
    const { cookie } = await signIn(ministry)
    const leader = personId(await addPerson(ministry, 'Kofi Paired', { phone: aTestPhoneNumber() }))
    const participant = personId(
      await addPerson(ministry, 'Luke Paired', { phone: aTestPhoneNumber() }),
    )
    await completeIntake(ministry, leader, undefined, undefined, { gender: 'male' })
    await completeIntake(ministry, participant, undefined, undefined, { gender: 'male' })

    const stray = await aStrayMessage()

    const response = await fetch(`${baseUrl}/roster/pair/create`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        leaderId: leader,
        participantId: participant,
        pair: participant,
        list: 'disciples',
      }),
    })
    expect(response.headers.get('location')).toContain('paired=1')

    expect(await invitationsTo(leader)).toHaveLength(1)
    expect(await drained(stray)).toBe(true)
  }, 15_000)
})
