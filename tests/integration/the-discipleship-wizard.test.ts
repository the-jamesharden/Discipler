import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { IdSource } from '~/domain/ids'
import type { IntakeFormFields } from '~/domain/intake'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * What the discipleship wizard records, and what the Roster then derives from it.
 *
 * The wizard's screens are HTTP; this is everything underneath them -- one whole
 * form arriving at the boundary, the two columns beside `source`, the column on the
 * submission, and the signal the Roster row reads back.
 */
describe('the discipleship wizard', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const firstGoalId = async (): Promise<string> => {
    const { rows } = await pool.query(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )
    return rows[0].id as string
  }

  const form = async (overrides: Partial<IntakeFormFields> = {}): Promise<IntakeFormFields> => ({
    fullName: 'Emily Johnson',
    phone: '5552340001',
    email: null,
    ageBand: '25-34',
    gender: 'female',
    goalId: await firstGoalId(),
    availability: ['monday:midday'],
    smsConsent: true,
    contactSharing: 'granted',
    source: 'pastor_link',
    intakePath: 'discipleship',
    declaredSide: 'mentee',
    experience: 'first_time',
    ...overrides,
  })

  const submit = async (overrides: Partial<IntakeFormFields> = {}) =>
    service().execute({
      type: 'intake.submit',
      ministryId: ministry.id,
      form: await form(overrides),
    })

  const consentRows = async (fullName: string) => {
    const { rows } = await pool.query(
      `select c.consent, c.source, c.intake_path, c.declared_side
         from consent_record c join person p on p.id = c.person_id
        where c.ministry_id = $1 and p.full_name = $2
        order by c.decided_at, c.consent`,
      [ministry.id, fullName],
    )
    return rows
  }

  const submissionRows = async (fullName: string) => {
    const { rows } = await pool.query(
      `select i.first_time
         from intake_submission i join person p on p.id = i.person_id
        where i.ministry_id = $1 and p.full_name = $2
        order by i.submitted_at`,
      [ministry.id, fullName],
    )
    return rows
  }

  it('records the path and the side on every consent record the submission writes', async () => {
    await submit({ fullName: 'Amara Boateng', phone: '5552341001', declaredSide: 'mentor' })

    const consents = await consentRows('Amara Boateng')
    expect(consents).toHaveLength(2)
    for (const row of consents) {
      expect(row.intake_path).toBe('discipleship')
      expect(row.declared_side).toBe('mentor')
      // Beside `source` and never folded into it: how they arrived is still its
      // own question, and this submission answers both.
      expect(row.source).toBe('pastor_link')
    }
  })

  it('records the first-time answer on the submission and not on the consent', async () => {
    await submit({
      fullName: 'Priya Raman',
      phone: '5552341002',
      experience: 'first_time',
    })
    await submit({
      fullName: 'Tom Whitfield',
      phone: '5552341003',
      experience: 'done_before',
    })

    expect((await submissionRows('Priya Raman'))[0].first_time).toBe(true)
    expect((await submissionRows('Tom Whitfield'))[0].first_time).toBe(false)
  })

  it('writes nulls for a form that did not ask, and backfills nothing', async () => {
    await submit({
      fullName: 'Grace Lindqvist',
      phone: '5552341004',
      intakePath: null,
      declaredSide: null,
      experience: null,
    })

    for (const row of await consentRows('Grace Lindqvist')) {
      expect(row.intake_path).toBeNull()
      expect(row.declared_side).toBeNull()
    }
    expect((await submissionRows('Grace Lindqvist'))[0].first_time).toBeNull()
  })

  it('refuses a consent record whose side and path disagree', async () => {
    const person = await addPerson(ministry, 'Idris Farah', { phone: '+15552341005' })

    const insert = (path: string | null, side: string | null) =>
      pool.query(
        `insert into consent_record
           (ministry_id, person_id, consent, granted, version, decided_at, source,
            intake_path, declared_side)
         values ($1, $2, 'sms', true, '2026-09-v1', now(), 'pastor_link', $3, $4)`,
        [ministry.id, person, path, side],
      )

    // A side with no path is a record that cannot say what question it answered.
    await expect(insert(null, 'mentor')).rejects.toThrow(
      /consent_record_declared_side_follows_the_path/,
    )
    // The discipleship path with no side is a wizard that skipped its first screen.
    await expect(insert('discipleship', null)).rejects.toThrow(
      /consent_record_declared_side_follows_the_path/,
    )
  })
})

describe('what the Roster derives from the wizard', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Northgate Fellowship')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  const firstGoalId = async (): Promise<string> => {
    const { rows } = await pool.query(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )
    return rows[0].id as string
  }

  const submit = async (overrides: Partial<IntakeFormFields>) =>
    service().execute({
      type: 'intake.submit',
      ministryId: ministry.id,
      form: {
        fullName: 'Nobody',
        phone: '5552342000',
        email: null,
        ageBand: '25-34',
        gender: 'female',
        goalId: await firstGoalId(),
        availability: ['monday:midday'],
        smsConsent: true,
        contactSharing: 'granted',
        source: 'pastor_link',
        intakePath: 'discipleship',
        declaredSide: 'mentee',
        experience: 'first_time',
        ...overrides,
      },
    })

  const rosterRow = async (fullName: string) => {
    const admin = await signInAs(ministry)
    const { data, error } = await admin.rpc('roster', { target_ministry_id: ministry.id })
    if (error) throw new Error(`Could not read the Roster: ${error.message}`)
    const row = (data as Record<string, unknown>[]).find((one) => one.full_name === fullName)
    if (!row) throw new Error(`${fullName} is not on the Roster`)
    return row
  }

  it('shows the side a Person offered to stand on, and marks nobody eligible to lead', async () => {
    await submit({ fullName: 'Ruth Adeyemi', phone: '5552342001', declaredSide: 'mentor' })

    const row = await rosterRow('Ruth Adeyemi')
    expect(row.declared_side).toBe('mentor')
    // Ticket 16 made this a plan an Admin records, explicitly not self-declared.
    // Answering `mentor` on a form is not the Admin deciding anything.
    expect(row.eligible_to_lead).toBe(false)
  })

  it('changes the signal when the Person answers the other side', async () => {
    await submit({ fullName: 'Ben Osei', phone: '5552342002', declaredSide: 'mentee' })
    expect((await rosterRow('Ben Osei')).declared_side).toBe('mentee')

    clock.advanceTo(new Date('2026-04-02T09:00:00Z'))
    await submit({ fullName: 'Ben Osei', phone: '5552342002', declaredSide: 'mentor' })

    expect((await rosterRow('Ben Osei')).declared_side).toBe('mentor')
  })

  /**
   * Null on a consent record means *the form did not ask*, which is not the Person
   * withdrawing anything -- and the commonest later submission of all is the
   * tokenized link an Admin sends to correct a phone number, which asks nothing
   * about sides. So the row reads the latest record that asked.
   */
  it('leaves both answers standing when a later form asked neither question', async () => {
    await submit({
      fullName: 'Iris Kaminski',
      phone: '5552342003',
      declaredSide: 'mentor',
      experience: 'first_time',
    })

    clock.advanceTo(new Date('2026-05-02T09:00:00Z'))
    // The single-page form, which is what the tokenized link an Admin sends to
    // correct a phone number reopens. It asks neither question.
    await submit({
      fullName: 'Iris Kaminski',
      phone: '5552342003',
      intakePath: null,
      declaredSide: null,
      experience: null,
    })

    const row = await rosterRow('Iris Kaminski')
    expect(row.declared_side).toBe('mentor')
    // The same rule, on the column the pairing surface reads. Correcting somebody's
    // number is not them saying they have done this before.
    expect(row.first_time).toBe(true)
  })

  it('says nothing about a Person no form ever asked', async () => {
    // Added with the Intake the fixture writes: rows exactly like every consent
    // record that existed before this ticket, and nothing backfills them.
    await addPerson(ministry, 'Silent Sam', { phone: '+15552342004' })

    const row = await rosterRow('Silent Sam')
    expect(row.declared_side).toBeNull()
    expect(row.first_time).toBeNull()
  })

  it('carries the latest submission’s first-time answer to the pairing surface', async () => {
    await submit({
      fullName: 'Dee Okonkwo',
      phone: '5552342005',
      experience: 'first_time',
    })
    expect((await rosterRow('Dee Okonkwo')).first_time).toBe(true)

    clock.advanceTo(new Date('2026-06-02T09:00:00Z'))
    await submit({
      fullName: 'Dee Okonkwo',
      phone: '5552342005',
      experience: 'done_before',
    })
    expect((await rosterRow('Dee Okonkwo')).first_time).toBe(false)
  })
})
