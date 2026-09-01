import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { MinistrySettingsRefused, PairingRefused } from '~/domain/errors'
import { personId, type IdSource } from '~/domain/ids'
import type { MinistrySettingsFields } from '~/domain/ministry-settings'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  signInAs,
  signInWith,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The settings a Ministry owns, against the real database, where the rules that
 * matter are the ones a form cannot get round.
 *
 * Two of them are the whole reason this suite exists rather than the boundary
 * tests alone. The check-in hour is clamped to 8am-9pm by a check constraint, and
 * it is proved here by writing 6:30am-shaped values *by SQL*, past every line of
 * TypeScript -- pilot settings get written that way, and a rule only the form
 * holds is a rule that is off wherever the form is not. And `suggest_gender_match`
 * is a safeguarding rule with a trigger behind it: turning it off has to actually
 * let a mixed one-to-one be formed, or the setting is a checkbox that lies.
 */

describe('what a Ministry may vary', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const at = new Date('2026-09-15T10:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({
      clock: createTestClock(at),
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    })

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

  interface SettingsRow {
    name: string
    from_name: string | null
    timezone: string
    leader_noun: string
    participant_noun: string
    suggest_gender_match: boolean
    suggest_max_age_band_gap: number
    checkin_day: number
    checkin_hour: number
  }

  const settingsOf = async (of: MinistryFixture = ministry) => {
    const { rows } = await pool.query<SettingsRow>(
      `select name, from_name, timezone, leader_noun, participant_noun,
              suggest_gender_match, suggest_max_age_band_gap, checkin_day, checkin_hour
         from ministry where id = $1`,
      [of.id],
    )
    return rows[0]!
  }

  const form = (fields: Partial<MinistrySettingsFields> = {}): MinistrySettingsFields => ({
    name: 'Riverside Chapel',
    fromName: 'Riverside',
    timezone: 'America/Chicago',
    leaderNoun: 'mentor',
    participantNoun: 'mentee',
    suggestGenderMatch: true,
    suggestMaxAgeBandGap: '1',
    checkinDay: '1',
    checkinHour: '9',
    ...fields,
  })

  const save = (fields: Partial<MinistrySettingsFields> = {}, of = ministry) =>
    service().execute({
      type: 'settings.update',
      ministryId: of.id,
      changedBy: of.adminEmail,
      fields: form(fields),
    })

  it('seeds a new Ministry with settings it can already run on', async () => {
    const seeded = await settingsOf()

    // A default has to be a real zone, and UTC is the one that is never anybody's
    // wrong local time by accident: it is visibly not set rather than plausibly
    // set to somewhere else.
    expect(seeded.timezone).toBe('UTC')
    // Monday 9am -- ADR-0007's own worked example.
    expect({ day: seeded.checkin_day, hour: seeded.checkin_hour }).toEqual({ day: 1, hour: 9 })
    // Discipler's words until a Ministry says otherwise, which is a real answer
    // and not an absent one.
    expect(seeded.leader_noun).toBe('mentor')
    expect(seeded.participant_noun).toBe('mentee')
    // The safe default for a safeguarding constraint is enforced, never absent.
    expect(seeded.suggest_gender_match).toBe(true)
    // ADR-0001's rule: a 25-34 Leader may be suggested a 35-44 Participant.
    expect(seeded.suggest_max_age_band_gap).toBe(1)
    // Nobody has bought this Ministry a sending name, so its messages speak as it.
    expect(seeded.from_name).toBeNull()
  })

  it('saves all three sections in one form', async () => {
    await save({
      name: 'Riverside Chapel',
      fromName: 'Riverside',
      timezone: 'America/Chicago',
      leaderNoun: 'discipleship coach',
      participantNoun: 'friend',
      suggestGenderMatch: false,
      suggestMaxAgeBandGap: '0',
      checkinDay: '4',
      checkinHour: '19',
    })

    expect(await settingsOf()).toEqual({
      name: 'Riverside Chapel',
      from_name: 'Riverside',
      timezone: 'America/Chicago',
      leader_noun: 'discipleship coach',
      participant_noun: 'friend',
      suggest_gender_match: false,
      suggest_max_age_band_gap: 0,
      checkin_day: 4,
      checkin_hour: 19,
    })
  })

  it('records what each field used to be, and who changed it', async () => {
    await save({ leaderNoun: 'mentor', participantNoun: 'mentee' })

    const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from ministry_event
        where ministry_id = $1 and type = 'ministry.settings_changed'
        order by recorded_at desc limit 1`,
      [ministry.id],
    )

    expect(rows[0]?.payload).toMatchObject({
      changedBy: ministry.adminEmail,
      changes: {
        leaderNoun: { from: 'discipleship coach', to: 'mentor' },
        participantNoun: { from: 'friend', to: 'mentee' },
      },
    })
  })

  /**
   * The clamp, written past the form entirely. This is the only proof that
   * matters for a rule the form is not the enforcer of: a coordinator who
   * innocently sets 6:30am creates a compliance problem Discipler carries, and
   * pilot settings get written by SQL as often as by a button.
   */
  it('refuses a check-in hour outside quiet hours, written by SQL', async () => {
    for (const hour of [0, 6, 7, 22, 23]) {
      await expect(
        pool.query(`update ministry set checkin_hour = $2 where id = $1`, [
          ministry.id,
          hour,
        ]),
      ).rejects.toThrow(/ministry_checkin_hour_is_within_quiet_hours/)
    }

    // The ends of the window are inside it: 8 is the first hour and 21 the last
    // that starts before 10pm.
    for (const hour of [8, 21]) {
      await pool.query(`update ministry set checkin_hour = $2 where id = $1`, [
        ministry.id,
        hour,
      ])
      expect((await settingsOf()).checkin_hour).toBe(hour)
    }

    await pool.query(`update ministry set checkin_hour = 9 where id = $1`, [ministry.id])
  })

  it('refuses a day that names none, written by SQL', async () => {
    for (const day of [-1, 7]) {
      await expect(
        pool.query(`update ministry set checkin_day = $2 where id = $1`, [ministry.id, day]),
      ).rejects.toThrow(/ministry_checkin_day_is_a_day_of_the_week/)
    }
  })

  /**
   * `pg_timezone_names` and not `now() at time zone`, which accepts a strict
   * superset -- and a Ministry saved as `CEST` would pass and then throw on every
   * tick, for everybody in it.
   */
  it('refuses a zone nothing could resolve a week against, written by SQL', async () => {
    await expect(
      pool.query(`update ministry set timezone = 'Mars/Olympus_Mons' where id = $1`, [
        ministry.id,
      ]),
    ).rejects.toThrow(/is not a known timezone/)
  })

  it('refuses a role with no word for it, and an age gap that names nothing', async () => {
    await expect(
      pool.query(`update ministry set leader_noun = '   ' where id = $1`, [ministry.id]),
    ).rejects.toThrow(/ministry_leader_noun_is_not_blank/)

    await expect(
      pool.query(`update ministry set participant_noun = '' where id = $1`, [ministry.id]),
    ).rejects.toThrow(/ministry_participant_noun_is_not_blank/)

    await expect(
      pool.query(`update ministry set suggest_max_age_band_gap = 6 where id = $1`, [
        ministry.id,
      ]),
    ).rejects.toThrow(/ministry_age_band_gap_is_a_number_of_bands/)
  })

  it('refuses the whole form when any of it cannot be taken', async () => {
    const before = await settingsOf()

    await expect(save({ checkinHour: '6', leaderNoun: 'coach' })).rejects.toThrow(
      MinistrySettingsRefused,
    )

    // Not half of it. One form, one transaction: the noun did not land either.
    expect(await settingsOf()).toEqual(before)
  })

  /**
   * Nullable, null on every row, and read by the dispatcher through a `coalesce`
   * from its first line of code -- so surfacing them later never rewrites the
   * query. ADR-0007.
   */
  it('leaves the per-relationship cadence override null on every row', async () => {
    const { rows } = await pool.query<{ set: string }>(
      `select count(*) as set from relationship
        where checkin_day is not null or checkin_hour is not null`,
    )

    expect(Number(rows[0]!.set)).toBe(0)

    const { rows: columns } = await pool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
        where table_name = 'relationship'
          and column_name in ('checkin_day', 'checkin_hour')
        order by column_name`,
    )

    expect(columns).toEqual([
      { column_name: 'checkin_day', is_nullable: 'YES' },
      { column_name: 'checkin_hour', is_nullable: 'YES' },
    ])
  })

  /**
   * Admin-only, and not merely member-only. What hour a whole Ministry is texted
   * at and whether the gender rule is enforced are the coordinator's to see; a
   * screen that only hid the form would still have handed the answers to anybody
   * signed in, because `ministry_settings` is what the page reads through.
   */
  it('answers the Admin who administers the Ministry, and nobody else', async () => {
    const leader = await addPersonWithAccount(ministry, 'David Ellis', 'leader')
    const other = await createMinistryWithAdmin('Grace Fellowship')

    const asTheAdmin = await signInAs(ministry)
    const { data: mine, error: mineFailed } = await asTheAdmin.rpc('ministry_settings', {
      target_ministry_id: ministry.id,
    })
    expect(mineFailed).toBeNull()
    expect(mine).toHaveLength(1)

    // A member of this Ministry, and not an Admin of it. No rows rather than an
    // error, which is what a definer function gated on `app.is_admin_of` gives
    // back -- and no row is what the reader turns into a refusal.
    const asALeader = await signInWith(leader)
    const { data: theirs } = await asALeader.rpc('ministry_settings', {
      target_ministry_id: ministry.id,
    })
    expect(theirs ?? []).toHaveLength(0)

    // An Admin of another Ministry, asking about this one.
    const asAnotherAdmin = await signInAs(other)
    const { data: elsewhere } = await asAnotherAdmin.rpc('ministry_settings', {
      target_ministry_id: ministry.id,
    })
    expect(elsewhere ?? []).toHaveLength(0)
  })

  it('is one Ministry’s settings and never another’s', async () => {
    const other = await createMinistryWithAdmin('Grace Fellowship')

    await save({ leaderNoun: 'shepherd' }, ministry)

    expect((await settingsOf(other)).leader_noun).toBe('mentor')
  })

  /**
   * The deliberate disable, doing the thing it exists to do. Gender is enforced by
   * a trigger rather than by the pairing command precisely so that manual pairing
   * cannot cross it -- so a setting that only greyed out a checkbox would be a
   * setting that changed nothing.
   */
  describe('the gender rule a Ministry turns off on purpose', () => {
    const aMixedOneToOne = async (of: MinistryFixture) => {
      const leader = await addPerson(of, 'David Ellis', {
        phone: aNumber(),
        answers: { gender: 'male' },
      })
      const participant = await addPerson(of, 'Emily Johnson', {
        phone: aNumber(),
        answers: { gender: 'female' },
      })

      return service().execute({
        type: 'relationship.create',
        ministryId: of.id,
        leaderIds: [personId(leader)],
        participantIds: [personId(participant)],
      })
    }

    it('refuses a mixed one-to-one while the rule is on', async () => {
      const on = await createMinistryWithAdmin('Northgate Church')

      // As the refusal an Admin reads, not as a constraint violation: the effect
      // store already translates the trigger into `relationship.gender_must_match`.
      await expect(aMixedOneToOne(on)).rejects.toThrow(PairingRefused)
    })

    it('permits one once the Ministry has turned the rule off', async () => {
      const off = await createMinistryWithAdmin('Southside Chapel')

      await save({ name: 'Southside Chapel', suggestGenderMatch: false }, off)

      await expect(aMixedOneToOne(off)).resolves.toBeDefined()
    })
  })
})
