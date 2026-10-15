import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, systemClock } from '~/domain/clock'
import { IntakeRefused } from '~/domain/errors'
import type { IdSource } from '~/domain/ids'
import { OTHER_GOAL, type AvailabilitySlot, type IntakeFormFields } from '~/domain/intake'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresIntakeReader } from '~/platform/supabase/intake-reader'
import { rosterPageFrom } from '~/platform/supabase/roster-reader'
import { suggestedPairsPageFrom } from '~/platform/supabase/suggested-pairs-reader'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'
import { asDocument } from '../support/page-document'
import { offersToMentor } from '../support/pair-popup'

/**
 * Other on the Intake goal (Pastor feedback 2026-10, ticket 06), everything under
 * the wizard's screens: the words typed after Other landing on the submission and
 * in history, the database holding the goal to one choice, the reopened form
 * offering the words back, the person page's reader carrying them, and Suggested
 * Pairs counting two equal texts as a shared goal. What counts as equal is pinned
 * in `tests/domain/suggested-pairs.test.ts`; this proves the database feeds it.
 */
describe('Other on the Intake goal', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let reader: ReturnType<typeof createPostgresIntakeReader>
  let pool: pg.Pool

  const ids: IdSource = { next: () => crypto.randomUUID() }
  // The real clock: a fixture stamps its submissions with wall-clock time, and
  // *latest* is read across both.
  const service = () =>
    createCommandService({ clock: systemClock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Other Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    reader = createPostgresIntakeReader(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await reader.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () => `555${String((Date.now() % 10_000) * 100 + ++numbered).padStart(7, '0')}`

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
        fullName: 'Emily Johnson',
        phone: aNumber(),
        email: null,
        ageBand: '25-34',
        gender: 'female',
        goalId: OTHER_GOAL,
        goalOther: 'Grief',
        availability: ['monday:12'],
        smsConsent: true,
        contactSharing: 'granted',
        source: 'pastor_link',
        intakePath: 'discipleship',
        declaredSide: 'mentee',
        experience: 'first_time',
        oneToTwo: 'open_to_one_to_two',
        groupId: null,
        ...overrides,
      },
    })

  const submissionOf = async (fullName: string) => {
    const { rows } = await pool.query<{
      person_id: string
      discipleship_goal_id: string | null
      discipleship_goal_other: string | null
    }>(
      `select i.person_id, i.discipleship_goal_id, i.discipleship_goal_other
         from intake_submission i join person p on p.id = i.person_id
        where i.ministry_id = $1 and p.full_name = $2
        order by i.submitted_at desc, i.created_at desc, i.id desc`,
      [ministry.id, fullName],
    )
    return rows[0]!
  }

  it('records the words typed after Other on the submission, in place of an option', async () => {
    await submit({ fullName: 'Hana Sato', goalOther: '  Grief   and loss ' })

    const submission = await submissionOf('Hana Sato')
    expect(submission.discipleship_goal_id).toBeNull()
    expect(submission.discipleship_goal_other).toBe('Grief and loss')
  })

  it('writes the words into history, where no edit to the Ministry’s list can blank them', async () => {
    await submit({ fullName: 'Ines Duarte', goalOther: 'Learning to pray out loud' })
    const { person_id: person } = await submissionOf('Ines Duarte')

    const { rows } = await pool.query(
      `select payload from ministry_event
        where ministry_id = $1 and type = 'intake.submitted' and subject_id = $2`,
      [ministry.id, person],
    )
    expect(rows[0].payload).toMatchObject({ goalId: null, goalOther: 'Learning to pray out loud' })
  })

  it('refuses Other with an empty box, and records nothing', async () => {
    const refused = submit({ fullName: 'Jade Wu', goalOther: '   ' })
    await expect(refused).rejects.toBeInstanceOf(IntakeRefused)
    await expect(refused).rejects.toMatchObject({ refusals: ['intake.goal_other_missing'] })
    const { rows } = await pool.query(
      `select count(*)::int as n from person where ministry_id = $1 and full_name = 'Jade Wu'`,
      [ministry.id],
    )
    expect(rows[0].n).toBe(0)
  })

  it('keeps an option as the answer when words were left in the box beside it', async () => {
    const option = await firstGoalId()
    await submit({ fullName: 'Kemi Ade', goalId: option, goalOther: 'grief' })

    const submission = await submissionOf('Kemi Ade')
    expect(submission.discipleship_goal_id).toBe(option)
    expect(submission.discipleship_goal_other).toBeNull()
  })

  it('holds the goal to one choice in the database, and refuses an empty or padded text', async () => {
    const { person_id: person } = await submissionOf('Hana Sato')
    const insert = (goalId: string | null, other: string) =>
      pool.query(
        `insert into intake_submission
           (ministry_id, person_id, submitted_at, age_band, gender, discipleship_goal_id,
            discipleship_goal_other)
         values ($1, $2, now(), '25-34', 'female', $3, $4)`,
        [ministry.id, person, goalId, other],
      )

    await expect(insert(await firstGoalId(), 'grief')).rejects.toThrow(/intake_submission_goal_is_one_choice/)
    await expect(insert(null, '')).rejects.toThrow(/intake_submission_goal_other_is_wording/)
    await expect(insert(null, ' grief')).rejects.toThrow(/intake_submission_goal_other_is_wording/)
  })

  it('offers the words back when the Person reopens their Intake', async () => {
    const { person_id: person } = await submissionOf('Ines Duarte')
    const token = crypto.randomUUID()
    await pool.query(
      `insert into intake_link (ministry_id, person_id, token, created_at, expires_at)
       values ($1, $2, $3, now(), now() + interval '14 days')`,
      [ministry.id, person, token],
    )

    const page = await reader.readReopenedIntakePage(token)
    expect(page?.state).toBe('live')
    expect(page?.prefill.goalId).toBeNull()
    expect(page?.prefill.goalOther).toBe('Learning to pray out loud')
  })

  it('carries the goal on the person page’s reader: the option’s wording, or the words typed', async () => {
    const admin = await signInAs(ministry)
    const page = rosterPageFrom(
      asDocument((await admin.rpc('person_page')).data),
      createTestClock(new Date()),
      'person',
    )
    const { rows } = await pool.query<{ label: string }>(
      `select label from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )

    const entry = (name: string) => page.roster.find((person) => person.fullName === name)
    expect(entry('Ines Duarte')).toMatchObject({ goal: null, goalOther: 'Learning to pray out loud' })
    expect(entry('Kemi Ade')).toMatchObject({ goal: rows[0]!.label, goalOther: null })
  })
})

describe('Suggested Pairs on a goal typed after Other', () => {
  let pool: pg.Pool
  let ministry: MinistryFixture
  const clock = createTestClock(new Date('2026-10-12T12:00:00Z'))

  const slots = (...keys: string[]): AvailabilitySlot[] =>
    keys.map((key) => {
      const [day, hour] = key.split(':') as [AvailabilitySlot['day'], AvailabilitySlot['hour']]
      return { day, hour }
    })
  const FOUR_ACROSS_TWO_DAYS = slots('monday:18', 'monday:19', 'thursday:18', 'thursday:19')

  const read = async () => {
    const admin = await signInAs(ministry)
    const { data, error } = await admin.rpc('suggested_pairs_page')
    expect(error).toBeNull()
    return suggestedPairsPageFrom(asDocument(data), clock).suggestions
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    ministry = await createMinistryWithAdmin('Other Suggestion Chapel')
  })

  afterAll(async () => {
    await pool.end()
  })

  it('says two equal texts in the reason, in the Disciple’s own words, and shows each beside the name', async () => {
    const grace = await addPerson(ministry, 'Grace Lee', {
      answers: { availability: FOUR_ACROSS_TWO_DAYS, goalOther: 'Grief' },
    })
    await offersToMentor(pool, ministry, grace)
    await addPerson(ministry, 'Ana Ruiz', {
      answers: { availability: FOUR_ACROSS_TWO_DAYS, goalOther: 'grief.' },
    })

    const suggestions = await read()
    expect(suggestions.pairs).toHaveLength(1)
    expect(suggestions.pairs[0]!.reason).toBe('Four shared time slots. You both wrote "grief.".')
    expect(suggestions.pairs[0]!.leader.goal).toBe('Other: "Grief"')
    expect(suggestions.pairs[0]!.participant.goal).toBe('Other: "grief."')
  })

  it('names no goal where the texts differ, or where one is an option worded alike', async () => {
    const other = await createMinistryWithAdmin('Other Suggestion Chapel Two')
    const { rows } = await pool.query<{ label: string }>(
      `select label from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [other.id],
    )
    const ruth = await addPerson(other, 'Ruth Obi', { answers: { availability: FOUR_ACROSS_TWO_DAYS } })
    await offersToMentor(pool, other, ruth)
    await addPerson(other, 'Mia Chen', {
      answers: { availability: FOUR_ACROSS_TWO_DAYS, goalOther: rows[0]!.label },
    })

    const admin = await signInAs(other)
    const { data } = await admin.rpc('suggested_pairs_page')
    const { suggestions } = suggestedPairsPageFrom(asDocument(data), clock)
    expect(suggestions.pairs[0]!.reason).toBe('Four shared time slots.')
  })
})
