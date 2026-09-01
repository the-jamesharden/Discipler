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
  type MinistryFixture,
} from '../support/local-supabase'

describe('Completing Intake', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))

  // Real identifiers, as the other integration tests use: the database is shared
  // across test files, so a sequential source would collide with another file's.
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () => createCommandService({ clock, ids, store,   appBaseUrl: 'https://discipler.test', })

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
    email: 'emily@example.test',
    ageBand: '25-34',
    gender: 'female',
    goalId: await firstGoalId(),
    availability: ['monday:midday', 'thursday:evening'],
    smsConsent: true,
    contactSharing: 'granted',
    source: 'pastor_link',
    ...overrides,
  })

  const statusOf = async (personId: string): Promise<string | null> => {
    const { rows } = await pool.query(
      `select participation_status(p) as status from person p where p.id = $1`,
      [personId],
    )
    return rows[0]?.status ?? null
  }

  const messagesTo = async (phone: string): Promise<string[]> => {
    const { rows } = await pool.query(
      `select body from outbound_message where ministry_id = $1 and to_phone = $2
        order by enqueued_at`,
      [ministry.id, phone],
    )
    return rows.map((row) => row.body as string)
  }

  it('moves a Person to Ready to Pair and sends them the Welcome Message', async () => {
    const person = await addPerson(ministry, 'Emily Johnson', {
      intake: false,
      phone: '+15552340001',
    })

    expect(await statusOf(person)).toBe('no_intake_submitted')
    expect(await messagesTo('+15552340001')).toEqual([])

    await service().execute({
      type: 'intake.submit',
      ministryId: ministry.id,
      form: await form(),
    })

    expect(await statusOf(person)).toBe('ready_to_pair')
    expect(await messagesTo('+15552340001')).toEqual([
      'Discipler: Riverside Chapel: Thanks, Emily — you’re all set. ' +
        'We’ll text you once you’ve been matched with someone to meet with. ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    ])
  })

  it('greets a Person once, however many times they submit the form', async () => {
    // One link serves a whole Ministry and nothing stops a Person opening it twice.
    // The Welcome Message is *first* contact, so the second submission is recorded
    // in full and greeted not at all -- a second welcome would be Discipler texting
    // somebody to welcome them to something they are already in. The deliberate
    // re-submission path is ticket 16's; this is the floor under it.
    const person = await addPerson(ministry, 'Noah Whitfield', {
      intake: false,
      phone: '+15552340009',
    })

    const submit = async () =>
      service().execute({
        type: 'intake.submit',
        ministryId: ministry.id,
        form: await form({ fullName: 'Noah Whitfield', phone: '5552340009' }),
      })

    await submit()
    await submit()

    expect(await messagesTo('+15552340009')).toHaveLength(1)

    // The submission itself is not swallowed: a re-submission is a real act and
    // leaves a real trail, which is what ticket 16 builds on.
    const { rows } = await pool.query(
      `select count(*)::int as submissions from intake_submission where person_id = $1`,
      [person],
    )
    expect(rows[0].submissions).toBe(2)
  })

  it('records the option they chose in history, where a removal cannot reach it', async () => {
    // `intake_submission.discipleship_goal_id` is blanked if the Ministry ever
    // removes this option, and the row is then the only place that said what they
    // picked. So the submission event says it too, the same way it records the name
    // they gave -- and ADR-0014's exemption stays bounded by what history keeps.
    //
    // The id and not the wording: the wording is the option's own and moves under a
    // rename, and `discipleship_goal.renamed` is what resolves an id to the words
    // that stood on a given date.
    const goal = await firstGoalId()
    const person = await addPerson(ministry, 'Hannah Beck', {
      intake: false,
      phone: '+15552340012',
    })

    await service().execute({
      type: 'intake.submit',
      ministryId: ministry.id,
      form: await form({ fullName: 'Hannah Beck', phone: '5552340012' }),
    })

    const { rows } = await pool.query(
      `select payload from ministry_event
        where subject_id = $1 and type = 'intake.submitted'`,
      [person],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].payload.goalId).toBe(goal)
  })

  it('records the two consents separately, each with its own version, time and route', async () => {
    await service().execute({
      type: 'intake.submit',
      ministryId: ministry.id,
      form: await form({ fullName: 'Daniel Okafor', phone: '5552340002', source: 'qr_code' }),
    })

    const { rows } = await pool.query(
      `select c.consent, c.granted, c.version, c.source, c.decided_at
         from consent_record c join person p on p.id = c.person_id
        where c.ministry_id = $1 and p.full_name = 'Daniel Okafor'
        order by c.consent`,
      [ministry.id],
    )

    expect(rows.map((row) => row.consent)).toEqual(['sms', 'contact_sharing'])
    expect(rows.every((row) => row.version === '2026-09-v1')).toBe(true)
    expect(rows.every((row) => row.source === 'qr_code')).toBe(true)
    expect(rows.every((row) => row.decided_at instanceof Date)).toBe(true)
  })

  it('lets a Person agree to be texted and refuse to have their number shared', async () => {
    await service().execute({
      type: 'intake.submit',
      ministryId: ministry.id,
      form: await form({
        fullName: 'Priya Raman',
        phone: '5552340003',
        contactSharing: 'declined',
      }),
    })

    const { rows } = await pool.query(
      `select c.consent, c.granted from consent_record c join person p on p.id = c.person_id
        where c.ministry_id = $1 and p.full_name = 'Priya Raman'
        order by c.consent`,
      [ministry.id],
    )

    // A refusal is a recorded decision, not a missing row. This test previously
    // asserted the opposite -- that absence was the refusal -- which reads a first
    // decline correctly and a later withdrawal not at all, because absence cannot
    // tell "never asked" from "asked and said no".
    expect(rows).toEqual([
      { consent: 'sms', granted: true },
      { consent: 'contact_sharing', granted: false },
    ])
    expect(await messagesTo('+15552340003')).toHaveLength(1)
  })

  it('puts a Person who was never imported onto the Roster', async () => {
    await service().execute({
      type: 'intake.submit',
      ministryId: ministry.id,
      form: await form({ fullName: 'Grace Whitfield', phone: '5552340004' }),
    })

    const { rows } = await pool.query(
      `select id, email from person where ministry_id = $1 and full_name = 'Grace Whitfield'`,
      [ministry.id],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('emily@example.test')
    expect(await statusOf(rows[0].id)).toBe('ready_to_pair')
  })

  it('records the availability grid as the slots the Person selected', async () => {
    await service().execute({
      type: 'intake.submit',
      ministryId: ministry.id,
      form: await form({
        fullName: 'Marcus Bell',
        phone: '5552340005',
        availability: ['tuesday:early_morning', 'saturday:afternoon', 'saturday:evening'],
      }),
    })

    const { rows } = await pool.query(
      `select a.day, a.block from intake_availability a
         join intake_submission i on i.id = a.intake_submission_id
         join person p on p.id = i.person_id
        where a.ministry_id = $1 and p.full_name = 'Marcus Bell'
        order by a.day, a.block`,
      [ministry.id],
    )

    expect(rows).toEqual([
      { day: 'tuesday', block: 'early_morning' },
      { day: 'saturday', block: 'afternoon' },
      { day: 'saturday', block: 'evening' },
    ])
  })

  it('writes nothing at all when the form is refused', async () => {
    const before = await pool.query(
      `select count(*)::int as n from person where ministry_id = $1`,
      [ministry.id],
    )

    await expect(
      service().execute({
        type: 'intake.submit',
        ministryId: ministry.id,
        form: await form({
          fullName: 'Nobody Atall',
          phone: '5552340006',
          smsConsent: false,
        }),
      }),
    ).rejects.toThrow('intake.sms_consent_required')

    const after = await pool.query(
      `select count(*)::int as n from person where ministry_id = $1`,
      [ministry.id],
    )
    expect(after.rows[0].n).toBe(before.rows[0].n)
    expect(await messagesTo('+15552340006')).toEqual([])
  })

  it('keys the Welcome Message on the phone and leaves it expecting no reply', async () => {
    const { rows } = await pool.query(
      `select prompt_key, prompt_state from outbound_message
        where ministry_id = $1 and to_phone = $2`,
      [ministry.id, '+15552340001'],
    )

    // Ticket 20 serialises on the phone, so the key is set whether or not this
    // message expects an answer. A Welcome Message expects none, so it holds up
    // nobody's queue.
    expect(rows[0]).toEqual({ prompt_key: '+15552340001', prompt_state: null })
  })
})
