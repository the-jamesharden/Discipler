import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { outboundMessageId, personId, type IdSource } from '~/domain/ids'
import type { IntakeFormFields } from '~/domain/intake'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createCommandService } from '~/service/command-service'
import { dispatchQueue, NoSendingNumber } from '~/service/outbound-dispatch'
import type { MessageTransport } from '~/service/ports'
import {
  addPerson,
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
  const sent: { from: string; to: string; body: string }[] = []
  const transport: MessageTransport = {
    async deliver(from, to, body) {
      sent.push({ from, to, body })
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
    const service = createCommandService({ clock, ids, store,   appBaseUrl: 'https://discipler.test', })
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
        availability: ['monday:12'],
        smsConsent: true,
        contactSharing: 'granted',
        source: 'pastor_link',
        intakePath: null,
        declaredSide: null,
        experience: null,
        groupId: null,
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

  it('answers only about its own Ministry, however the Person is named', async () => {
    // The sending layer drains the queue on a trusted connection with no session
    // behind it, which is the one place in Discipler a `person_id` arrives with
    // nothing to bound it. It must therefore declare which Ministry it is acting
    // for, or Ministry isolation is enforced nowhere on this path.
    const other = await createMinistryWithAdmin('Northgate Fellowship')
    const outsider = await addPerson(other, 'Sarah Delgado', { phone: '+15553339001' })

    // Everything about this Person says yes -- consented, not opted out, on a
    // Roster -- and the only thing wrong with the question is who is asking it.
    expect(await queue.mayReceive(other.id, personId(outsider))).toBeNull()
    expect(await queue.mayReceive(ministry.id, personId(outsider))).toBe(
      'recipient_has_no_sms_consent',
    )
    expect(await queue.contactToShare(other.id, personId(outsider))).not.toBeNull()
    expect(await queue.contactToShare(ministry.id, personId(outsider))).toBeNull()
  })

  it('does not let one Ministry mark another Ministry’s message sent', async () => {
    const other = await createMinistryWithAdmin('Eastbrook Chapel')
    const outsider = await addPerson(other, 'Iris Bantham', { phone: '+15553339002' })

    const { rows } = await pool.query<{ id: string }>(
      `insert into outbound_message
         (ministry_id, person_id, to_phone, body, enqueued_at, message_kind)
       values ($1, $2, $3, $4, $5, 'no_reply') returning id`,
      [other.id, outsider, '+15553339002', 'Northgate speaking.', clock.now()],
    )
    const enqueued = rows[0]?.id
    if (!enqueued) throw new Error('The message under test was not enqueued')
    const message = outboundMessageId(enqueued)

    await queue.markSent(ministry.id, message, clock.now())
    await queue.withhold(ministry.id, message, 'recipient_opted_out', clock.now())

    const { rows: after } = await pool.query(
      `select sent_at, withheld_at from outbound_message where id = $1`,
      [message],
    )
    expect(after[0].sent_at).toBeNull()
    expect(after[0].withheld_at).toBeNull()

    // And the queue does not hand another Ministry's message out to be drained.
    const due = await queue.due(ministry.id)
    expect(due.map((queued) => queued.id)).not.toContain(message)
  })

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
           (ministry_id, person_id, to_phone, body, enqueued_at, prompt_key,
            discloses_person_id, message_kind)
         values ($1, $2, '+15553330006', 'Your leader is:', now(), '+15553330006', $3,
                 'no_reply')`,
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

  it('sends as the Ministry, never as a number the deployment happens to hold', async () => {
    await intake({ fullName: 'Naomi Okafor', phone: '5553330008' })

    await run()

    const theirs = sent.filter((message) => message.to === '+15553330008')
    expect(theirs.length).toBeGreaterThan(0)
    // Read off the Ministry row, so a second Ministry onboarded tomorrow does not
    // text its people from this one's number. This is the assertion that fails the
    // day somebody moves the sender into an environment variable.
    for (const message of theirs) expect(message.from).toBe(ministry.sendingNumber)
  })

  it('refuses to drain a Ministry that has no number to send as', async () => {
    const unprovisioned = await createMinistryWithAdmin('Northgate Unprovisioned')
    await pool.query(`update ministry set sending_number = null where id = $1`, [
      unprovisioned.id,
    ])

    const { rows: goals } = await pool.query(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [unprovisioned.id],
    )
    const service = createCommandService({
      clock,
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    })
    await service.execute({
      type: 'intake.submit',
      ministryId: unprovisioned.id,
      form: {
        fullName: 'Ade Balogun',
        phone: '5553339001',
        email: null,
        ageBand: '25-34',
        gender: 'male',
        goalId: goals[0].id as string,
        availability: ['monday:12'],
        smsConsent: true,
        contactSharing: 'granted',
        source: 'pastor_link',
        intakePath: null,
        declaredSide: null,
        experience: null,
        groupId: null,
      },
    })

    // Raised, not withheld. A withholding is a fact about a recipient and this
    // recipient is fine -- what is missing is the Ministry's own identity, and
    // borrowing another Ministry's is the one outcome worse than not sending.
    await expect(
      dispatchQueue({ queue, transport, clock, ministryId: unprovisioned.id }),
    ).rejects.toThrow(NoSendingNumber)

    const { rows } = await pool.query(
      `select sent_at, withheld_at from outbound_message where ministry_id = $1`,
      [unprovisioned.id],
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.sent_at).toBeNull()
      // Not written off either. The message is still owed once a number exists.
      expect(row.withheld_at).toBeNull()
    }
  })

  it('lets the rest of the queue through when the vendor refuses one message', async () => {
    const refused = await intake({ fullName: 'Blocked Recipient', phone: '5553330009' })
    await intake({ fullName: 'Reachable Recipient', phone: '5553330010' })

    const failing: MessageTransport = {
      async deliver(from, to, body) {
        if (to === '+15553330009') throw new Error('the vendor refused this one')
        sent.push({ from, to, body })
      },
    }

    const outcome = await dispatchQueue({
      queue,
      transport: failing,
      clock,
      ministryId: ministry.id,
    })

    // The reachable Person still hears from their church. One mistyped number must
    // not cost a whole Ministry its week.
    expect(sent.map((message) => message.to)).toContain('+15553330010')
    expect(outcome.failed).toBeGreaterThan(0)

    // And the refused one is neither sent nor withheld, so the next drain retries
    // it -- a vendor having a bad day is not a Person who asked to be left alone,
    // and counting it as one would lose the message silently.
    const { rows } = await pool.query(
      `select sent_at, withheld_at from outbound_message where person_id = $1`,
      [refused],
    )
    for (const row of rows) {
      expect(row.sent_at).toBeNull()
      expect(row.withheld_at).toBeNull()
    }
  })
})
