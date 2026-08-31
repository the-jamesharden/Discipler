import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { personId, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import { twilioSignature } from '~/platform/twilio/inbound-signature'
import { baseUrl, skipUnlessAppIsRunning, twilioAuthToken } from '../support/app'
import {
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The webhook, driven the way the delivery vendor drives it: a form post carrying
 * a number and a body, and nothing else. Over HTTP because that is the whole
 * point of this surface -- it is reached with no session, no cookie and no token,
 * and only the number in the payload says who is speaking.
 */
describe.skipIf(skipUnlessAppIsRunning)('the inbound webhook', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('ABC Church')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const congregant = async (fullName: string) => {
    const phone = aNumber()
    const id = personId(await addPerson(ministry, fullName, { phone }))
    await completeIntake(ministry, id)
    return { id, phone }
  }

  // Signed the way the vendor signs, because the route refuses anything else. The
  // token is the running app's, discovered rather than chosen, for the reason
  // `cronSecret` gives -- a test that picked its own would prove the route agrees
  // with itself and nothing about whether Twilio can reach it.
  const webhook = `${baseUrl}/sms/inbound`

  const signingToken = () => {
    if (!twilioAuthToken) {
      throw new Error('TWILIO_AUTH_TOKEN is not set, so the webhook cannot be exercised')
    }
    return twilioAuthToken
  }

  /**
   * One POST to the webhook. The signature is passed in rather than derived here, so
   * a test that sends the wrong one -- or none -- goes through the same assembly a
   * genuine call does, instead of rebuilding the request beside it and proving the
   * two agree about nothing.
   */
  const posts = (form: Readonly<Record<string, string>>, signature: string | null) =>
    fetch(webhook, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(signature === null ? {} : { 'x-twilio-signature': signature }),
      },
      body: new URLSearchParams(form),
    })

  const texts = (from: string, body: string) => {
    const form = { From: from, Body: body }
    return posts(form, twilioSignature(signingToken(), webhook, form))
  }

  const inbox = async (person: PersonId): Promise<string[]> => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message
        where person_id = $1 order by enqueued_at, created_at`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  it('refuses a caller who did not sign, which is anybody who knows a number', async () => {
    // The state this route was in until the signature check landed: a number is
    // public, and `STOP`, `PAUSE` and a forged Concern were all reachable with it.
    const response = await posts({ From: '+15550100001', Body: 'STOP' }, null)

    expect(response.status).toBe(403)
  })

  it('refuses a body edited after it was signed', async () => {
    // A genuine callback replayed with `STOP` in it. The signature is over the form
    // Twilio sent, so the edit is what breaks it.
    const signed = { From: '+15550100001', Body: 'hello' }

    const response = await posts(
      { ...signed, Body: 'STOP' },
      twilioSignature(signingToken(), webhook, signed),
    )

    expect(response.status).toBe(403)
  })

  it('resolves the sender’s number to the question awaiting a reply', async () => {
    const leader = await congregant('Ruth Callan')
    const participant = await congregant('Nina Adeyemi')
    await pairOneToOne(ministry, leader.id, participant.id, {
      createdAt: new Date('2026-04-01T09:00:00Z'),
    })

    await createCommandService({
      clock: createTestClock(new Date()),
      ids: { next: () => crypto.randomUUID() },
      store,
      appBaseUrl: baseUrl,
    }).execute({ type: 'checkin.start', ministryId: ministry.id, personId: leader.id })

    const response = await texts(leader.phone, '1')
    expect(response.status).toBe(200)

    // The satisfaction question, sent because a `1` answered the question their
    // sequence was on -- resolved from the number alone.
    expect((await inbox(leader.id)).at(-1)).toBe(
      'ABC Church: How did the meeting go? Reply A for outstanding, B for good, C for concern.',
    )
  })

  it('opts a Person out on STOP', async () => {
    const leader = await congregant('Rob Tiller')

    expect((await texts(leader.phone, 'STOP')).status).toBe(200)

    const { rows } = await pool.query(
      `select 1 from person_opt_out where person_id = $1 and ended_at is null`,
      [leader.id],
    )
    expect(rows).toHaveLength(1)
  })

  it('acknowledges a number nobody on any Roster holds, rather than failing', async () => {
    // A wrong number, or somebody forwarded a text. The vendor retries a failure,
    // and there would be nothing to succeed at on the second attempt.
    const response = await texts('+19995550000', '1')
    expect(response.status).toBe(200)
  })
})
