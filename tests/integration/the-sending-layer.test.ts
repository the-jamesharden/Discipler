import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { IdSource } from '~/domain/ids'
import type { IntakeFormFields } from '~/domain/intake'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createCommandService } from '~/service/command-service'
import { dispatchQueue, type MessageTransport } from '~/service/outbound-dispatch'
import {
  createMinistryWithAdmin,
  localSupabase,
  optOut,
  type MinistryFixture,
} from '../support/local-supabase'

describe('The sending layer checks every recipient', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let queue: ReturnType<typeof createPostgresOutboundQueue>
  let pool: pg.Pool
  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))
  const ids: IdSource = { next: () => crypto.randomUUID() }

  /** Records what actually left, so a test can tell "not sent" from "sent empty". */
  const sent: { to: string; body: string }[] = []
  const transport: MessageTransport = {
    async deliver(to, body) {
      sent.push({ to, body })
    },
  }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    queue = createPostgresOutboundQueue(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await queue.close()
    await pool.end()
  })

  const firstGoalId = async (): Promise<string> => {
    const { rows } = await pool.query(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )
    return rows[0].id as string
  }

  const intake = async (overrides: Partial<IntakeFormFields>): Promise<string> => {
    const service = createCommandService({ clock, ids, store })
    await service.execute({
      type: 'intake.submit',
      ministryId: ministry.id,
      form: {
        fullName: 'Emily Johnson',
        phone: '5553330001',
        email: null,
        ageBand: '25-34',
        gender: 'female',
        goalId: await firstGoalId(),
        availability: ['monday:midday'],
        smsConsent: true,
        contactSharing: 'granted',
        source: 'pastor_link',
        ...overrides,
      },
    })

    const { rows } = await pool.query(
      `select id from person where ministry_id = $1 and phone = $2`,
      [ministry.id, overrides.phone ? `+1${overrides.phone}` : '+15553330001'],
    )
    return rows[0].id as string
  }

  const run = () => dispatchQueue({ queue, transport, clock, ministryId: ministry.id })

  const stateOf = async (personId: string) => {
    const { rows } = await pool.query(
      `select sent_at, withheld_at, withheld_reason from outbound_message
        where person_id = $1 order by enqueued_at limit 1`,
      [personId],
    )
    return rows[0]
  }

  it('sends the Welcome Message that Intake enqueued', async () => {
    const person = await intake({ fullName: 'Emily Johnson', phone: '5553330001' })

    await run()

    expect(sent.map((message) => message.to)).toContain('+15553330001')
    const state = await stateOf(person)
    expect(state.sent_at).toBeInstanceOf(Date)
    expect(state.withheld_at).toBeNull()
  })

  it('refuses a message to a Person who opted out after it was enqueued', async () => {
    const person = await intake({ fullName: 'Daniel Okafor', phone: '5553330002' })

    // The consent was real when the message was queued. It is not now, and the
    // check that matters is the one at the moment of sending.
    await optOut(ministry, person)
    await run()

    expect(sent.map((message) => message.to)).not.toContain('+15553330002')
    const state = await stateOf(person)
    expect(state.sent_at).toBeNull()
    expect(state.withheld_reason).toBe('recipient_opted_out')
  })

  it('sends each message once, however many times the queue is drained', async () => {
    await intake({ fullName: 'Priya Raman', phone: '5553330003' })

    await run()
    const afterFirst = sent.filter((message) => message.to === '+15553330003').length
    await run()
    await run()

    expect(afterFirst).toBe(1)
    expect(sent.filter((message) => message.to === '+15553330003')).toHaveLength(1)
  })

  it('withholds a number the Person never agreed to share, and sends the rest', async () => {
    const shy = await intake({
      fullName: 'Ruth Adeyemi',
      phone: '5553330004',
      contactSharing: 'declined',
    })
    const willing = await intake({
      fullName: 'Sarah Mbeki',
      phone: '5553330005',
      contactSharing: 'granted',
    })
    const reader = await intake({ fullName: 'Tom Hale', phone: '5553330006' })

    // Two identical messages, differing only in whose details they would disclose.
    for (const discloses of [shy, willing]) {
      await pool.query(
        `insert into outbound_message
           (ministry_id, person_id, to_phone, body, enqueued_at, prompt_key, discloses_person_id)
         values ($1, $2, '+15553330006', 'Your leader is:', now(), '+15553330006', $3)`,
        [ministry.id, reader, discloses],
      )
    }

    await run()

    const bodies = sent.filter((message) => message.to === '+15553330006').map((m) => m.body)

    // Both arrive. Contact-sharing consent decides whether the number rides along,
    // never whether the Person hears from their church at all.
    expect(bodies).toContain('Your leader is: Sarah Mbeki: +15553330005')
    expect(bodies).toContain('Your leader is:')
    expect(bodies.join(' ')).not.toContain('+15553330004')
  })

  it('refuses a message to a Person whose SMS consent is no longer on file', async () => {
    const person = await intake({ fullName: 'Joel Amankwah', phone: '5553330007' })

    // Forged rather than reached through a write path, because no write path can
    // produce it: consent records are append-only and the queue refuses to enqueue
    // for anyone without one. The check still has to hold -- it is the floor under
    // every future sender, not a restatement of what the enqueue trigger already did.
    await pool.query(`delete from consent_record where person_id = $1 and consent = 'sms'`, [
      person,
    ])

    await run()

    expect(sent.map((message) => message.to)).not.toContain('+15553330007')
    const state = await stateOf(person)
    expect(state.sent_at).toBeNull()
    expect(state.withheld_reason).toBe('recipient_has_no_sms_consent')
  })
})
