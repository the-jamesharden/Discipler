import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { IntakeFormRefused, IntakeRefused } from '~/domain/errors'
import { ministryId, type IdSource } from '~/domain/ids'
import type { IntakeFormFields } from '~/domain/intake'
import { layoutOf, presetForm, questionOn } from '~/domain/intake-form'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { intakeFormsPageFrom } from '~/platform/supabase/intake-forms-reader'
import { createPostgresIntakeReader } from '~/platform/supabase/intake-reader'
import { list, readPageDocument } from '~/platform/supabase/page'
import { createCommandService } from '~/service/command-service'
import {
  createMinistryWithAdmin,
  localSupabase,
  serviceRoleClient,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * A Ministry's Intake forms, edited against the real database (Pastor feedback,
 * ticket 11). The facts that matter here are facts about rows: each save is a new
 * version and never an update, a Ministry that never edited holds no version and
 * is served the preset, the wizard is served the version a Person opened, the
 * submission records which version it answered, and every edit is in history.
 */
describe('a Ministry’s Intake forms', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let reader: ReturnType<typeof createPostgresIntakeReader>
  let pool: pg.Pool

  const at = new Date('2026-10-14T10:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock: createTestClock(at), ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Form Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    reader = createPostgresIntakeReader(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await reader.close()
    await pool.end()
  })

  const reword = (key: string, wording: string, extra: { required?: boolean; hint?: string } = {}) =>
    service().execute({
      type: 'intake_form.edit_question',
      ministryId: ministryId(ministry.id),
      form: 'discipleship',
      key,
      wording,
      menteeWording: null,
      hint: extra.hint ?? '',
      required: extra.required ?? true,
      editedBy: ministry.adminUserId,
    })

  const versions = async () => {
    const { rows } = await pool.query<{ form: string; version: number }>(
      `select form, version from intake_form_version where ministry_id = $1 order by form, version`,
      [ministry.id],
    )
    return rows.map((row) => `${row.form}:${row.version}`)
  }

  it('serves today’s form to a Ministry that has never edited, and stores nothing for it', async () => {
    expect(await versions()).toEqual([])

    const page = await reader.readIntakePage(ministry.id)
    expect(page?.form).toEqual(presetForm('discipleship'))
    const groups = await reader.readGroupIntakePage(ministry.id)
    expect(groups?.form).toEqual(presetForm('group'))

    const doc = await readPageDocument(await signInAs(ministry), 'intake_forms_page')
    expect(list(doc, 'intake_forms')).toEqual([])
    expect(intakeFormsPageFrom(doc).forms).toEqual({
      discipleship: presetForm('discipleship'),
      group: presetForm('group'),
    })
  })

  it('saves each edit as the next version, live at once, and records it in history', async () => {
    await reword('gender', 'Are you a man or a woman?')
    await reword('ageBand', 'How old are you?', { hint: 'A range is enough.' })

    expect(await versions()).toEqual(['discipleship:1', 'discipleship:2'])

    const served = await reader.readIntakePage(ministry.id)
    expect(served?.form.version).toBe(2)
    expect(questionOn(served!.form, 'gender')?.wording).toBe('Are you a man or a woman?')
    expect(questionOn(served!.form, 'ageBand')).toMatchObject({ wording: 'How old are you?', hint: 'A range is enough.' })
    // The groups form is its own, and untouched.
    expect((await reader.readGroupIntakePage(ministry.id))?.form).toEqual(presetForm('group'))

    const { rows } = await pool.query<{ type: string; payload: Record<string, unknown> }>(
      `select type, payload from ministry_event
        where ministry_id = $1 and type like 'intake_form.%'
        order by occurred_at, recorded_at`,
      [ministry.id],
    )
    expect(rows.map((row) => row.type)).toEqual(['intake_form.question_edited', 'intake_form.question_edited'])
    expect(rows[0]!.payload).toMatchObject({
      form: 'discipleship',
      version: 1,
      key: 'gender',
      editedBy: ministry.adminUserId,
      from: { wording: 'Gender' },
      to: { wording: 'Are you a man or a woman?' },
    })

    const doc = await readPageDocument(await signInAs(ministry), 'intake_forms_page')
    expect(intakeFormsPageFrom(doc).forms.discipleship.version).toBe(2)
  })

  it('serves somebody part-way through the version they opened', async () => {
    const opened = await reader.readIntakePage(ministry.id, 1)
    expect(opened?.form.version).toBe(1)
    expect(questionOn(opened!.form, 'ageBand')?.wording).toBe('Age range')

    expect((await reader.readIntakePage(ministry.id, 0))?.form).toEqual(presetForm('discipleship'))
    // A version this Ministry never saved is the form as it stands.
    expect((await reader.readIntakePage(ministry.id, 99))?.form.version).toBe(2)
  })

  it('hands the groups form the mentor and mentee form as it stands, for the switch to it', async () => {
    // Group form exits, ticket 02: the group step links across carrying only what
    // the other form still asks, so it is read as it stands now, whichever
    // version of the groups form somebody opened.
    const groups = await reader.readGroupIntakePage(ministry.id, 0)
    expect(groups?.form).toEqual(presetForm('group'))
    expect(groups?.discipleshipForm.version).toBe(2)
    expect(groups?.discipleshipForm).toEqual((await reader.readIntakePage(ministry.id))?.form)
  })

  it('never rewrites a version', async () => {
    await expect(
      pool.query(
        `update intake_form_version set definition = '{}'::jsonb where ministry_id = $1`,
        [ministry.id],
      ),
    ).rejects.toThrow(/is what somebody was asked/)
  })

  it('never deletes a version while its Ministry stands', async () => {
    await expect(
      pool.query(`delete from intake_form_version where ministry_id = $1`, [ministry.id]),
    ).rejects.toThrow(/is what somebody was asked/)
    const { error } = await serviceRoleClient().from('intake_form_version').delete().eq('ministry_id', ministry.id)
    expect(error).not.toBeNull()
  })

  it('refuses an edit the form does not allow, and saves nothing', async () => {
    await expect(reword('phone', 'Mobile number', { required: false })).rejects.toBeInstanceOf(IntakeFormRefused)

    const form = (await reader.readIntakePage(ministry.id))!.form
    const layout = layoutOf(form).map((page) => ({ ...page, keys: [...page.keys] }))
    const last = layout[layout.length - 1]!
    last.keys = last.keys.filter((key) => key !== 'fullName')
    layout[0]!.keys.push('fullName')
    await expect(
      service().execute({
        type: 'intake_form.arrange',
        ministryId: ministryId(ministry.id),
        form: 'discipleship',
        layout,
        editedBy: ministry.adminUserId,
      }),
    ).rejects.toMatchObject({ refusal: 'intake_form.stays_on_the_last_page' })

    expect(await versions()).toEqual(['discipleship:1', 'discipleship:2'])
  })

  it('records which version a submission answered, and reads it against that version', async () => {
    await reword('goalId', 'What are you hoping for?', { required: false, hint: 'Choose the one that fits best.' })
    const optional = (await reader.readIntakePage(ministry.id))!.form
    expect(optional.version).toBe(3)

    const form: IntakeFormFields = {
      fullName: 'Hana Ito',
      phone: '555 330 4411',
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
      declaredSide: 'mentee',
      experience: 'first_time',
      oneToTwo: 'open_to_one_to_two',
      groupId: null,
    }

    // Against version 2, which still asked for a goal, it is refused.
    await expect(
      service().execute({ type: 'intake.submit', ministryId: ministryId(ministry.id), form, formVersion: 2 }),
    ).rejects.toBeInstanceOf(IntakeRefused)

    await service().execute({ type: 'intake.submit', ministryId: ministryId(ministry.id), form, formVersion: 3 })

    const { rows } = await pool.query<{ form_version: number; discipleship_goal_id: string | null }>(
      `select i.form_version, i.discipleship_goal_id
         from intake_submission i join person p on p.id = i.person_id
        where p.ministry_id = $1 and p.full_name = 'Hana Ito'`,
      [ministry.id],
    )
    expect(rows).toEqual([{ form_version: 3, discipleship_goal_id: null }])

    const { rows: events } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event where ministry_id = $1 and type = 'intake.submitted'`,
      [ministry.id],
    )
    expect(events.map((event) => event.payload.formVersion)).toEqual([3])
  })

  it('shows one Ministry’s forms to nobody else', async () => {
    const other = await createMinistryWithAdmin('Other Chapel')
    const doc = await readPageDocument(await signInAs(other), 'intake_forms_page')
    expect(list(doc, 'intake_forms')).toEqual([])

    const { data } = await serviceRoleClient()
      .from('intake_form_version')
      .select('version')
      .eq('ministry_id', ministry.id)
    expect(data?.length).toBe(3)
  })
})
