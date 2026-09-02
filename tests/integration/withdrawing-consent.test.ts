import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { IdSource } from '~/domain/ids'
import { personId } from '~/domain/ids'
import type { IntakeFormFields } from '~/domain/intake'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  recordConsentDecision,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * A consent record says what a Person decided, and the current decision is the latest
 * one. The case that matters is the second submission: before this, a decline wrote no
 * row at all, so a Person who granted contact sharing and later withdrew it left the
 * grant standing as the only record, and their Leader kept seeing the number.
 */
describe('A Person can change their mind about a consent', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let queue: ReturnType<typeof createPostgresOutboundQueue>
  let pool: pg.Pool
  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))
  const ids: IdSource = { next: () => crypto.randomUUID() }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Northgate Fellowship')
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
        fullName: 'Hannah Bell',
        phone: '5554440001',
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
      [ministry.id, `+1${overrides.phone ?? '5554440001'}`],
    )
    return rows[0].id as string
  }

  it('records a refusal as a decision rather than as an absent row', async () => {
    const person = await intake({
      fullName: 'Priya Raman',
      phone: '5554440002',
      contactSharing: 'declined',
    })

    const { rows } = await pool.query(
      `select consent, granted from consent_record
        where person_id = $1 order by consent`,
      [person],
    )

    // Two rows, not one. The refusal is on the record, which is what makes it
    // distinguishable later from never having been asked. Ordered by the enum's own
    // declaration order, which is `sms` then `contact_sharing`.
    expect(rows).toEqual([
      { consent: 'sms', granted: true },
      { consent: 'contact_sharing', granted: false },
    ])
  })

  it('shares the number of a Person who consented to sharing it', async () => {
    const person = await intake({ fullName: 'Grace Miller', phone: '5554440003' })

    const contact = await queue.contactToShare(ministry.id, personId(person))

    expect(contact?.phone).toBe('+15554440003')
  })

  it('stops sharing the number once the Person withdraws that consent', async () => {
    // The case ticket 16's re-submission produces, and the one that used to write
    // nothing at all: the earlier grant answered for a Person who had said no.
    const person = await intake({ fullName: 'Amara Osei', phone: '5554440004' })
    expect(await queue.contactToShare(ministry.id, personId(person))).not.toBeNull()

    await recordConsentDecision(
      ministry,
      person,
      'contact_sharing',
      false,
      new Date('2026-03-09T09:00:00Z'),
    )

    expect(await queue.contactToShare(ministry.id, personId(person))).toBeNull()
  })

  it('shares it again if the Person changes their mind back', async () => {
    // Proves the rule is "the latest decision wins" rather than a one-way latch that
    // any refusal closes permanently.
    const person = await intake({
      fullName: 'Ruth Adeyemi',
      phone: '5554440005',
      contactSharing: 'declined',
    })
    expect(await queue.contactToShare(ministry.id, personId(person))).toBeNull()

    await recordConsentDecision(
      ministry,
      person,
      'contact_sharing',
      true,
      new Date('2026-03-09T09:00:00Z'),
    )

    expect(await queue.contactToShare(ministry.id, personId(person))).not.toBeNull()
  })

  it('refuses to text a Person who withdraws SMS consent', async () => {
    // Not reachable through the Intake form, which refuses a submission without SMS
    // consent -- but the sending layer must read the same rule, because the moment a
    // second writer exists a stale grant would speak for someone who had said no.
    const person = await intake({ fullName: 'Chloe Barnes', phone: '5554440006' })

    await recordConsentDecision(
      ministry,
      person,
      'sms',
      false,
      new Date('2026-03-09T09:00:00Z'),
    )

    expect(await queue.mayReceive(ministry.id, personId(person))).toBe('recipient_has_no_sms_consent')
  })

  it('reads a Person who was never asked exactly as it reads a refusal', async () => {
    // NULL rather than false, and the callers test `is true` for that reason: never
    // asked and asked-and-refused must both come out as "do not", without a caller
    // having to remember a coalesce.
    const person = await addPerson(ministry, 'Never Asked', { intake: false })

    const { rows } = await pool.query<{ current: boolean | null }>(
      `select app.current_consent($1, 'contact_sharing') as current`,
      [person],
    )

    expect(rows[0]?.current).toBeNull()
  })
})
