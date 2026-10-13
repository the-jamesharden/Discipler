import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { ministryId, personId, type IdSource } from '~/domain/ids'
import type { IntakeFormFields } from '~/domain/intake'
import { isOwnQuestion, ownQuestionsOf, questionOn, type IntakeForm, type OwnQuestion } from '~/domain/intake-form'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresIntakeReader } from '~/platform/supabase/intake-reader'
import { readPageDocument } from '~/platform/supabase/page'
import { pairCardFrom } from '~/platform/supabase/pair-card-reader'
import { personPageFrom } from '~/platform/supabase/person-page-reader'
import { historyOf } from '~/platform/supabase/relationship-history'
import { createCommandService } from '~/service/command-service'
import {
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * A Ministry's own Intake questions against the real database (Pastor feedback,
 * ticket 12): added to the stored form, answered on a submission, kept one row per
 * answer, shown on the person page and the pair card under the person they belong
 * to, offered back on the reopened page, and never read by anything that pairs
 * people.
 */
describe('a Ministry’s own Intake questions', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let reader: ReturnType<typeof createPostgresIntakeReader>
  let pool: pg.Pool

  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock: createTestClock(new Date()), ids, store, appBaseUrl: 'https://discipler.test' })

  let form: IntakeForm
  let member: OwnQuestion
  let help: OwnQuestion
  let story: OwnQuestion
  let ana: string
  let ben: string

  const add = async (pageId: string, kind: string, wording: string, required: boolean, choices: string[] = []) => {
    await service().execute({
      type: 'intake_form.add_question',
      ministryId: ministryId(ministry.id),
      form: 'discipleship',
      pageId,
      kind,
      wording,
      hint: '',
      required,
      choices,
      editedBy: ministry.adminUserId,
    })
  }

  const fields = (fullName: string, phone: string, side: 'mentor' | 'mentee', own: Record<string, string[]>): IntakeFormFields => ({
    fullName,
    phone,
    email: null,
    ageBand: '25-34',
    gender: 'female',
    goalId: null,
    goalOther: null,
    availability: ['monday:12'],
    smsConsent: true,
    contactSharing: 'granted',
    source: 'pastor_link',
    intakePath: 'discipleship',
    declaredSide: side,
    experience: 'first_time',
    groupId: null,
    own,
  })

  const personNamed = async (fullName: string): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `select id from person where ministry_id = $1 and full_name = $2`,
      [ministry.id, fullName],
    )
    return rows[0]!.id
  }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Own Questions Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    reader = createPostgresIntakeReader(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    await add('about-you', 'yes_no', 'Are you a member here?', true)
    await add('about-you', 'several_choices', 'Where could you help?', false, ['Music', 'Kids', 'Welcome'])
    await add('last', 'long_text', 'Anything else you would like us to know?', false)

    form = (await reader.readIntakePage(ministry.id))!.form
    const own = ownQuestionsOf(form)
    ;[member, help, story] = own as [OwnQuestion, OwnQuestion, OwnQuestion]

    const goal = (await reader.readIntakePage(ministry.id))!.goals[0]!.id
    await service().execute({
      type: 'intake.submit',
      ministryId: ministryId(ministry.id),
      form: {
        ...fields('Ana Ortiz', '555 610 0001', 'mentee', {
          [member.key]: ['yes'],
          [help.key]: [help.choices[2]!.id, help.choices[0]!.id],
          [story.key]: ['Pray for my mum.\nShe is unwell.'],
        }),
        goalId: goal,
      },
      formVersion: form.version,
    })
    await service().execute({
      type: 'intake.submit',
      ministryId: ministryId(ministry.id),
      form: { ...fields('Ben Cole', '555 610 0002', 'mentor', { [member.key]: ['no'] }), goalId: goal },
      formVersion: form.version,
    })
    ana = await personNamed('Ana Ortiz')
    ben = await personNamed('Ben Cole')
  })

  afterAll(async () => {
    await store.close()
    await reader.close()
    await pool.end()
  })

  it('stores each question the Ministry added with its kind and its choices', () => {
    expect(ownQuestionsOf(form).map((question) => [question.kind, question.wording, question.choices.length])).toEqual([
      ['yes_no', 'Are you a member here?', 0],
      ['several_choices', 'Where could you help?', 3],
      ['long_text', 'Anything else you would like us to know?', 0],
    ])
    expect(member.key).toMatch(/^custom:[0-9a-f-]{36}$/)
  })

  it('keeps one row per answer beside the submission, each in the shape its kind stores', async () => {
    const { rows } = await pool.query<{ question_key: string; answer: unknown }>(
      `select a.question_key, a.answer
         from intake_answer a
         join intake_submission s on s.id = a.intake_submission_id
        where s.person_id = $1
        order by a.question_key`,
      [ana],
    )
    expect(Object.fromEntries(rows.map((row) => [row.question_key, row.answer]))).toEqual({
      [member.key]: true,
      [help.key]: [help.choices[0]!.id, help.choices[2]!.id],
      [story.key]: 'Pray for my mum.\nShe is unwell.',
    })
  })

  it('never rewrites an answer', async () => {
    await expect(
      pool.query(`update intake_answer set answer = '"changed"' where ministry_id = $1`, [ministry.id]),
    ).rejects.toThrow(/intake_answer is what somebody said/)
  })

  it('records in history which questions were answered, and not what was said', async () => {
    const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event where ministry_id = $1 and type = 'intake.submitted' and subject_id = $2`,
      [ministry.id, ana],
    )
    expect(rows[0]!.payload.ownQuestionsAnswered).toEqual([member.key, help.key, story.key])
    expect(JSON.stringify(rows[0]!.payload)).not.toContain('Pray for my mum')
  })

  it('shows them on the person page, under the questions as the form words them, in its order', async () => {
    const client = await signInAs(ministry)
    const doc = await readPageDocument(client, 'person_intake_page', { intake_person_id: ana })
    const page = personPageFrom(doc, createTestClock(new Date()))
    expect(page.ownAnswers.map(({ question, value }) => [question.wording, value])).toEqual([
      ['Are you a member here?', true],
      ['Where could you help?', [help.choices[0]!.id, help.choices[2]!.id]],
      ['Anything else you would like us to know?', 'Pray for my mum.\nShe is unwell.'],
    ])
    // The Roster's own rows are what they were: the person page's document is
    // the Roster's, with the one Person's answers beside it.
    expect(JSON.stringify(doc.roster)).not.toContain('Pray for my mum')
  })

  it('shows them on the pair card under the person they belong to, in the words a choice carries now', async () => {
    const relationship = await pairOneToOne(ministry, ben, ana)
    await service().execute({
      type: 'intake_form.edit_question',
      ministryId: ministryId(ministry.id),
      form: 'discipleship',
      key: help.key,
      wording: 'Where would you like to serve?',
      menteeWording: null,
      hint: '',
      required: false,
      choices: {
        kept: help.choices.map((choice) => ({
          id: choice.id,
          wording: choice.wording === 'Music' ? 'Worship team' : choice.wording,
        })),
        added: [],
      },
      editedBy: ministry.adminUserId,
    })

    const client = await signInAs(ministry)
    const doc = await readPageDocument(client, 'overview_card_page', { card_relationship_id: relationship })
    const card = pairCardFrom(doc, historyOf(doc), createTestClock(new Date()))!
    const answersOf = (fullName: string) =>
      card.people
        .find((person) => person.fullName === fullName)!
        .ownAnswers.map(({ question, value }) => [question.wording, value])

    expect(answersOf('Ana Ortiz')).toEqual([
      ['Are you a member here?', true],
      ['Where would you like to serve?', [help.choices[0]!.id, help.choices[2]!.id]],
      ['Anything else you would like us to know?', 'Pray for my mum.\nShe is unwell.'],
    ])
    expect(answersOf('Ben Cole')).toEqual([['Are you a member here?', false]])

    const reworded = card.people.find((person) => person.fullName === 'Ana Ortiz')!.ownAnswers[1]!.question
    expect(isOwnQuestion(reworded) && reworded.choices.map((choice) => choice.wording)).toEqual([
      'Worship team',
      'Kids',
      'Welcome',
    ])

    // Check-Ins composes the same card.
    const checkIns = await readPageDocument(client, 'check_ins_card_page', { card_relationship_id: relationship })
    expect(pairCardFrom(checkIns, historyOf(checkIns), createTestClock(new Date()))!.people.map((person) => person.ownAnswers.length)).toEqual([1, 3])
  })

  it('offers them back on the reopened page, in the form they were given on', async () => {
    const { effects } = await service().execute({
      type: 'intake.reopen',
      ministryId: ministryId(ministry.id),
      personId: personId(ana),
    })
    const token = effects.flatMap((effect) => (effect.kind === 'intake_link.issue' ? [effect.link.token] : []))[0]!
    const page = (await reader.readReopenedIntakePage(token))!
    expect(page.form.name).toBe('discipleship')
    expect(questionOn(page.form, member.key)).toBeTruthy()
    expect(page.prefill.own).toEqual({
      [member.key]: ['yes'],
      [help.key]: [help.choices[0]!.id, help.choices[2]!.id],
      [story.key]: ['Pray for my mum.\nShe is unwell.'],
    })
  })

  it('is never read by Suggested Pairs, the Roster or any pairing rule', async () => {
    // What the database's pairing reads are, as they stand: none names the table.
    const { rows } = await pool.query<{ name: string; body: string }>(
      `select p.proname as name, pg_get_functiondef(p.oid) as body
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app')
          and p.proname in ('suggestion_inputs', 'roster', 'suggested_pairs_page', 'roster_page', 'pair_page')`,
    )
    expect(rows.map((row) => row.name).sort()).toEqual([
      'pair_page',
      'roster',
      'roster_page',
      'suggested_pairs_page',
      'suggestion_inputs',
    ])
    for (const row of rows) expect(row.body, row.name).not.toMatch(/intake_answer|own_answers/)

    // And what they hand back carries none of what was said.
    const client = await signInAs(ministry)
    for (const page of ['suggested_pairs_page', 'roster_page', 'pair_page']) {
      const doc = JSON.stringify(await readPageDocument(client, page))
      expect(doc, page).not.toContain('Pray for my mum')
      expect(doc, page).not.toContain(member.key)
    }
  })

  it('is read by an Admin of this Ministry and nobody else', async () => {
    const other = await createMinistryWithAdmin('Elsewhere Chapel')
    const { data, error } = await (await signInAs(other)).from('intake_answer').select('id').eq('ministry_id', ministry.id)
    expect(error).toBeNull()
    expect(data).toEqual([])
    const { data: own } = await (await signInAs(ministry)).from('intake_answer').select('id').eq('ministry_id', ministry.id)
    expect(own).toHaveLength(4)
  })
})
