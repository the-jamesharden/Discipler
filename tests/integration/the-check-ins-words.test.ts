import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NO_SAVED_CHECK_IN_WORDS, type SubmittedCheckInWords } from '~/domain/check-in-words'
import { createTestClock } from '~/domain/clock'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * A church's own sentences in a real week (Exponential launch, ticket 40), against
 * the real database. The assertions are the texts a Leader was sent, and that they
 * stay as they went out after the church changes its words: a sent text is history.
 */

describe('the check-in’s words', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const opened = new Date('2026-10-05T09:00:00Z')
  let clock = createTestClock(opened)
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

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const congregant = async (fullName: string) => {
    const id = personId(await addPerson(ministry, fullName, { phone: aNumber() }))
    await completeIntake(ministry, id)
    return id
  }

  const save = (checkInWords: SubmittedCheckInWords) =>
    service().execute({
      type: 'settings.update',
      ministryId: ministry.id,
      changedBy: ministry.adminUserId,
      fields: {
        name: 'Riverside Chapel',
        fromName: null,
        timezone: 'UTC',
        leaderNoun: 'mentor',
        participantNoun: 'mentee',
        suggestGenderMatch: true,
        suggestMaxAgeBandGap: '1',
        checkinDay: '1',
        checkinHour: '9',
        checkInWords,
      },
    })

  const start = (person: PersonId) =>
    service().execute({ type: 'checkin.start', ministryId: ministry.id, personId: person })

  const texts = (person: PersonId, body: string) =>
    service().execute({ type: 'sms.inbound', ministryId: ministry.id, personId: person, body })

  const inbox = async (person: PersonId): Promise<string[]> => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message
        where person_id = $1 order by enqueued_at, created_at`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  const RATES = 'Msg & data rates may apply. Reply STOP to opt out, HELP for help.'

  const theirWords: SubmittedCheckInWords = {
    question: 'Did you get time with [name] this week?',
    rating: 'How was your time with [name]?',
    concern: 'What should we know about [name]?',
    thanks: 'Thanks for telling us about [name].',
  }

  it('sends a church with no words today’s texts, byte for byte', async () => {
    await save(NO_SAVED_CHECK_IN_WORDS)
    const leader = await congregant('Mark Wilson')
    const disciple = await congregant('Jordan Ellis')
    await pairOneToOne(ministry, leader, disciple)

    await start(leader)
    await texts(leader, '1')
    await texts(leader, 'D')
    await texts(leader, 'Work has been rough.')

    expect(await inbox(leader)).toEqual([
      `Riverside Chapel via Discipler: Did you meet with Jordan Ellis this week? Reply 1 for yes, 2 for no. ${RATES}`,
      'Riverside Chapel via Discipler: How did the meeting go? Reply A for outstanding, B for good, C for okay, D for concern.',
      'Riverside Chapel via Discipler: Please tell us more about the concern.',
      'Riverside Chapel via Discipler: Thank you. We’ll check in with you next week.',
    ])
  })

  it('sends a church’s sentences inside the frame, in every one of the four', async () => {
    await save(theirWords)
    const leader = await congregant('Ruth Avery')
    const disciple = await congregant('Tom Baker')
    await pairOneToOne(ministry, leader, disciple)

    await start(leader)
    await texts(leader, '1')
    await texts(leader, 'D')
    await texts(leader, 'Work has been rough.')

    expect(await inbox(leader)).toEqual([
      `Riverside Chapel via Discipler: Did you get time with Tom Baker this week? Reply 1 for yes, 2 for no. ${RATES}`,
      'Riverside Chapel via Discipler: How was your time with Tom Baker? Reply A for outstanding, B for good, C for okay, D for concern.',
      'Riverside Chapel via Discipler: What should we know about Tom Baker?',
      'Riverside Chapel via Discipler: Thanks for telling us about Tom Baker.',
    ])

    await save(NO_SAVED_CHECK_IN_WORDS)
  })

  it('keeps a conversation in the words it opened with, and changes the next one', async () => {
    await save(theirWords)
    const leader = await congregant('Naomi Hall')
    const disciple = await congregant('Iris Stone')
    await pairOneToOne(ministry, leader, disciple)

    clock = createTestClock(opened)
    await start(leader)

    const sentBefore = await inbox(leader)

    // The church changes its words with this conversation still open.
    await save({ ...NO_SAVED_CHECK_IN_WORDS, question: 'Have you seen [name]?', rating: 'And?' })

    // What was sent is as it went out.
    expect(await inbox(leader)).toEqual(sentBefore)

    // The rest of this conversation is in the words it opened with.
    await texts(leader, '1')
    expect((await inbox(leader)).at(-1)).toBe(
      'Riverside Chapel via Discipler: How was your time with Iris Stone? Reply A for outstanding, B for good, C for okay, D for concern.',
    )

    // Next week's is the next check-in sent, in the words in force, and the texts
    // sent so far still read as they did.
    const sentSoFar = await inbox(leader)
    clock = createTestClock(new Date('2026-10-12T09:00:00Z'))
    await start(leader)

    const after = await inbox(leader)
    expect(after.slice(0, sentSoFar.length)).toEqual(sentSoFar)
    expect(after.at(-1)).toContain('Have you seen Iris Stone? Reply 1 for yes, 2 for no.')

    clock = createTestClock(opened)
    await save(NO_SAVED_CHECK_IN_WORDS)
  })

  it('records what each sentence used to be', async () => {
    await save(NO_SAVED_CHECK_IN_WORDS)
    await save({ ...NO_SAVED_CHECK_IN_WORDS, thanks: 'Thanks!' })

    const { rows } = await pool.query<{ payload: { changes: Record<string, unknown> } }>(
      `select payload from ministry_event
        where ministry_id = $1 and type = 'ministry.settings_changed'
        order by occurred_at desc, id desc`,
      [ministry.id],
    )
    expect(rows.map((row) => row.payload.changes)).toContainEqual({
      checkInThanks: { from: null, to: 'Thanks!' },
    })

    await save(NO_SAVED_CHECK_IN_WORDS)
  })

  /**
   * Past every line of TypeScript, because pilot settings get written by SQL as often
   * as by a button and a rule only the form holds is a rule that is off wherever the
   * form is not.
   */
  describe('the columns hold the rules a form cannot be relied on for', () => {
    const write = (column: string, value: string) =>
      pool.query(`update ministry set ${column} = $2 where id = $1`, [ministry.id, value])

    const lines = [
      'checkin_question_sentence',
      'checkin_rating_sentence',
      'checkin_concern_sentence',
      'checkin_thanks_sentence',
    ]

    for (const column of lines) {
      it(`refuses a blank, an overlong and a control-charactered ${column}`, async () => {
        await expect(write(column, '   ')).rejects.toThrow(/_is_a_sentence/)
        await expect(write(column, `[name] ${'x'.repeat(154)}`)).rejects.toThrow(/_is_a_sentence/)
        await expect(write(column, '[name] \u0007 hello')).rejects.toThrow(/_is_a_sentence/)
        await expect(write(column, '[name]\nhello')).rejects.toThrow(/_is_a_sentence/)
      })
    }

    it('refuses a question that names nobody', async () => {
      await expect(write('checkin_question_sentence', 'Did you meet?')).rejects.toThrow(
        /_is_a_sentence/,
      )
    })

    it('counts an emoji as one character', async () => {
      await write('checkin_thanks_sentence', '🙏'.repeat(160))
      await expect(write('checkin_thanks_sentence', '🙏'.repeat(161))).rejects.toThrow(
        /_is_a_sentence/,
      )
      await pool.query(`update ministry set checkin_thanks_sentence = null where id = $1`, [
        ministry.id,
      ])
    })

    it('refuses a conversation’s words that are not the four sentences', async () => {
      await expect(
        pool.query(
          `insert into checkin_sequence (id, ministry_id, person_id, started_at, covering, words)
           values (gen_random_uuid(), $1, $2, now(), '{}', '{"question":"only one"}')`,
          [ministry.id, await congregant('Ada Lane')],
        ),
      ).rejects.toThrow(/checkin_sequence_words_are_the_four_sentences/)
    })
  })
})
