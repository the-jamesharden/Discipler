import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { IntakeFormRefused } from '~/domain/errors'
import { ministryId, type IdSource } from '~/domain/ids'
import type { IntakeFormFields } from '~/domain/intake'
import { ownQuestionsOf, questionOn } from '~/domain/intake-form'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { intakeFormsPageFrom } from '~/platform/supabase/intake-forms-reader'
import { createPostgresIntakeReader } from '~/platform/supabase/intake-reader'
import { readPageDocument } from '~/platform/supabase/page'
import { suggestedPairsPageFrom } from '~/platform/supabase/suggested-pairs-reader'
import { createCommandService } from '~/service/command-service'
import { aTestPhoneNumber, createMinistryWithAdmin, localSupabase, signInAs, type MinistryFixture } from '../support/local-supabase'

/**
 * Removing a question against the real database (Pastor feedback, ticket 13):
 * the form's next version no longer asks it, every answer given to it on that
 * form is deleted -- in its column, its rows, or on the consent records the
 * matching question is kept on -- and history keeps what they said. The other
 * form's answers stand, a consent record changes in nothing but its side, and a
 * submission to the new form records the question as unanswered.
 */
describe('removing a question from an Intake form', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let reader: ReturnType<typeof createPostgresIntakeReader>
  let pool: pg.Pool

  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock: createTestClock(new Date()), ids, store, appBaseUrl: 'https://discipler.test' })

  const names = { ana: 'Ana Ortiz', ben: 'Ben Cole', cara: 'Cara Diaz', dev: 'Dev Rao' }
  const phones = { ana: aTestPhoneNumber(), ben: aTestPhoneNumber(), cara: aTestPhoneNumber(), dev: aTestPhoneNumber() }
  let anythingElse: string

  const answered = (fullName: string, phone: string, extra: Partial<IntakeFormFields> = {}): IntakeFormFields => ({
    fullName,
    phone,
    email: null,
    ageBand: '25-34',
    gender: 'female',
    goalId: 'other',
    goalOther: 'Prayer',
    availability: ['monday:12', 'tuesday:18'],
    smsConsent: true,
    contactSharing: 'granted',
    source: 'pastor_link',
    intakePath: 'discipleship',
    declaredSide: 'mentee',
    experience: 'first_time',
    groupId: null,
    ...extra,
  })

  const submit = async (fields: IntakeFormFields) => {
    const form = fields.intakePath === 'group' ? 'group' : 'discipleship'
    const page = form === 'group' ? await reader.readGroupIntakePage(ministry.id) : await reader.readIntakePage(ministry.id)
    await service().execute({
      type: 'intake.submit',
      ministryId: ministryId(ministry.id),
      form: fields,
      formVersion: page!.form.version,
    })
  }

  const remove = (key: string, form: 'discipleship' | 'group' = 'discipleship') =>
    service().execute({
      type: 'intake_form.remove_question',
      ministryId: ministryId(ministry.id),
      form,
      key,
      editedBy: ministry.adminUserId,
    })

  const counts = async () => {
    const client = await signInAs(ministry)
    return intakeFormsPageFrom(await readPageDocument(client, 'intake_forms_page')).answerCounts
  }

  const submissionsOf = async (fullName: string) => {
    const { rows } = await pool.query<{
      id: string
      age_band: string | null
      gender: string | null
      first_time: boolean | null
      discipleship_goal_other: string | null
      slots: number
    }>(
      `select i.id, i.age_band, i.gender, i.first_time, i.discipleship_goal_other,
              (select count(*)::int from intake_availability a where a.intake_submission_id = i.id) as slots
         from intake_submission i
         join person p on p.id = i.person_id
        where p.ministry_id = $1 and p.full_name = $2
        order by i.submitted_at, i.id`,
      [ministry.id, fullName],
    )
    return rows
  }

  const removalEvent = async (key: string) => {
    const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event
        where ministry_id = $1 and type = 'intake_form.question_removed' and payload ->> 'key' = $2`,
      [ministry.id, key],
    )
    return rows[0]?.payload
  }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Removal Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    reader = createPostgresIntakeReader(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    await service().execute({
      type: 'intake_form.add_question',
      ministryId: ministryId(ministry.id),
      form: 'discipleship',
      pageId: 'last',
      kind: 'long_text',
      wording: 'Anything else?',
      hint: '',
      required: false,
      choices: [],
      editedBy: ministry.adminUserId,
    })
    anythingElse = ownQuestionsOf((await reader.readIntakePage(ministry.id))!.form)[0]!.key

    // Ana twice, so a superseded submission is deleted from too; Ben once; Cara
    // on the groups form, whose answers no removal from the other form touches.
    await submit({ ...answered(names.ana, phones.ana), own: { [anythingElse]: ['Pray for my mum.'] } })
    await submit(answered(names.ana, phones.ana, { availability: ['friday:09'] }))
    await submit(answered(names.ben, phones.ben, { declaredSide: 'mentor', gender: 'male', experience: 'done_before' }))
    await submit(
      answered(names.cara, phones.cara, {
        intakePath: 'group',
        declaredSide: null,
        experience: null,
        goalId: null,
        goalOther: null,
        groupId: 'none',
      }),
    )
  })

  afterAll(async () => {
    await store.close()
    await reader.close()
    await pool.end()
  })

  it('counts, per form, the people whose answers a removal would delete', async () => {
    const { discipleship, group } = await counts()
    expect(discipleship).toMatchObject({
      availability: 2,
      gender: 2,
      ageBand: 2,
      experience: 2,
      goalId: 2,
      side: 2,
      [anythingElse]: 1,
    })
    expect(group).toMatchObject({ availability: 1, gender: 1, ageBand: 1 })
    expect(group.side).toBeUndefined()
  })

  it('deletes the hours ticked on that form, superseded ones too, and history keeps them', async () => {
    await remove('availability')

    const form = (await reader.readIntakePage(ministry.id))!.form
    expect(questionOn(form, 'availability')).toBeUndefined()
    expect((await submissionsOf(names.ana)).map((row) => row.slots)).toEqual([0, 0])
    expect((await submissionsOf(names.ben)).map((row) => row.slots)).toEqual([0])
    expect((await submissionsOf(names.cara)).map((row) => row.slots)).toEqual([2])

    const event = (await removalEvent('availability'))!
    expect(event).toMatchObject({ form: 'discipleship', answersLost: 2, question: { wording: 'When could you meet?' } })
    expect((event.deletedAnswers as { answer: unknown }[]).map((each) => each.answer)).toEqual([
      ['monday:12', 'tuesday:18'],
      ['friday:09'],
      ['monday:12', 'tuesday:18'],
    ])
    expect((await counts()).discipleship.availability).toBeUndefined()
  })

  it('blanks the gender and the age band on that form’s submissions and no other’s', async () => {
    await remove('gender')
    await remove('ageBand')

    expect((await submissionsOf(names.ana)).map((row) => [row.gender, row.age_band])).toEqual([
      [null, null],
      [null, null],
    ])
    expect((await submissionsOf(names.cara)).map((row) => [row.gender, row.age_band])).toEqual([['female', '25-34']])
    expect(((await removalEvent('gender'))!.deletedAnswers as { answer: unknown }[]).map((each) => each.answer)).toEqual([
      'female',
      'female',
      'male',
    ])
  })

  it('takes the side off the consent records, and nothing else on them', async () => {
    await expect(remove('side')).rejects.toThrow(IntakeFormRefused)
    await remove('experience')
    await remove('side')

    const { rows } = await pool.query<{ declared_side: string | null; granted: boolean; intake_path: string | null }>(
      `select c.declared_side, c.granted, c.intake_path
         from consent_record c
        where c.ministry_id = $1
        order by c.decided_at, c.consent`,
      [ministry.id],
    )
    expect(rows.length).toBe(8)
    expect(rows.every((row) => row.declared_side === null && row.granted)).toBe(true)
    expect(rows.map((row) => row.intake_path)).toEqual([...Array(6).fill('discipleship'), 'group', 'group'])
    expect((await submissionsOf(names.ben)).map((row) => row.first_time)).toEqual([null])
    expect((await removalEvent('side'))!.answersLost).toBe(2)
  })

  it('still refuses every other change to a consent record', async () => {
    await expect(
      pool.query(`update consent_record set granted = false where ministry_id = $1`, [ministry.id]),
    ).rejects.toThrow(/consent_record records what a Person agreed to/)
    await expect(
      pool.query(`update consent_record set declared_side = 'mentor' where ministry_id = $1`, [ministry.id]),
    ).rejects.toThrow(/consent_record records what a Person agreed to/)
  })

  it('deletes the goal, and a Ministry’s own question’s answers', async () => {
    await remove('goalId')
    await remove(anythingElse)

    expect((await submissionsOf(names.ana)).map((row) => row.discipleship_goal_other)).toEqual([null, null])
    const { rows } = await pool.query(`select 1 from intake_answer where ministry_id = $1`, [ministry.id])
    expect(rows).toEqual([])
    expect(((await removalEvent(anythingElse))!.deletedAnswers as { answer: unknown }[])[0]!.answer).toBe(
      'Pray for my mum.',
    )
  })

  it('takes a submission to the form as it now stands, recording what it no longer asks as unanswered', async () => {
    await submit(
      answered(names.dev, phones.dev, {
        ageBand: null,
        gender: null,
        availability: [],
        declaredSide: null,
        experience: null,
        goalId: null,
        goalOther: null,
      }),
    )
    expect(await submissionsOf(names.dev)).toEqual([
      expect.objectContaining({ age_band: null, gender: null, first_time: null, slots: 0 }),
    ])
    const { rows } = await pool.query<{ declared_side: string | null; intake_path: string }>(
      `select c.declared_side, c.intake_path
         from consent_record c join person p on p.id = c.person_id
        where p.full_name = $1 and p.ministry_id = $2`,
      [names.dev, ministry.id],
    )
    expect(rows).toEqual([
      { declared_side: null, intake_path: 'discipleship' },
      { declared_side: null, intake_path: 'discipleship' },
    ])
  })

  it('tells Suggested Pairs what the mentor and mentee form no longer asks', async () => {
    const client = await signInAs(ministry)
    const page = suggestedPairsPageFrom(await readPageDocument(client, 'suggested_pairs_page'), createTestClock(new Date()))
    expect(page.unasked).toEqual(['availability', 'gender', 'ageBand', 'goalId', 'side'])
    expect(page.suggestions).toEqual({ pairs: [], noScheduleOverlap: [] })
  })

  it('adds a removed question back with none of its old answers', async () => {
    await service().execute({
      type: 'intake_form.add_back_question',
      ministryId: ministryId(ministry.id),
      form: 'discipleship',
      pageId: 'about-you',
      key: 'gender',
      editedBy: ministry.adminUserId,
    })
    const form = (await reader.readIntakePage(ministry.id))!.form
    expect(questionOn(form, 'gender')?.wording).toBe('Gender')
    expect((await counts()).discipleship.gender).toBeUndefined()
  })
})
