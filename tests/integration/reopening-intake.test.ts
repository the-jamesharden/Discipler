import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTestClock } from '~/domain/clock'
import { IntakeRefused } from '~/domain/errors'
import { personId, type IdSource, type MinistryId } from '~/domain/ids'
import type { IntakeFormFields } from '~/domain/intake'
import { intakeLinkToken } from '~/domain/intake-link'
import { readContactToShare } from '~/platform/supabase/contact-to-share'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresIntakeReader } from '~/platform/supabase/intake-reader'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The link an Admin sends a Person so they can correct their own Intake, and what
 * submitting it again does.
 *
 * The whole point of the token is *who*. On the Ministry-wide form a Person is
 * recognised by the name and number they typed, which is precisely what somebody
 * correcting their number cannot be -- recognising them that way would file a
 * second Person and leave the first one holding the wrong number forever.
 *
 * The consent side is the half that cannot be fixed after the fact. A Person who
 * granted contact sharing and later declines it must stop having their number shown
 * to their Leader, and the only thing that can make that true is a record carrying
 * the decision rather than merely existing.
 */

describe('reopening a Person’s Intake', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let reader: ReturnType<typeof createPostgresIntakeReader>
  let admin: SupabaseClient
  let pool: pg.Pool

  const at = new Date('2026-09-14T10:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const clock = createTestClock(at)
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    reader = createPostgresIntakeReader(localSupabase().databaseUrl)
    admin = await signInAs(ministry)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await admin.auth.signOut()
    await store.close()
    await reader.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const firstGoalId = async (): Promise<string> => {
    const { rows } = await pool.query(
      `select id from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )
    return rows[0].id as string
  }

  /** The link as an Admin issues it, then read back the way the page reads it. */
  const linkFor = async (person: string): Promise<string> => {
    await service().execute({
      type: 'intake.reopen',
      ministryId: ministry.id,
      personId: personId(person),
    })
    const { rows } = await pool.query<{ token: string }>(
      `select token from intake_link where person_id = $1`,
      [person],
    )
    const token = rows[0]?.token
    if (!token) throw new Error('no link was issued')
    return token
  }

  const resubmit = async (token: string, overrides: Partial<IntakeFormFields> = {}) =>
    service().execute({
      type: 'intake.submit',
      ministryId: ministry.id,
      token: intakeLinkToken(token),
      form: {
        fullName: 'Emily Johnson',
        phone: aNumber(),
        email: 'emily@example.test',
        ageBand: '25-34',
        gender: 'female',
        goalId: await firstGoalId(),
        availability: ['monday:midday'],
        smsConsent: true,
        contactSharing: 'granted',
        source: 'pastor_link',
        ...overrides,
      },
    })

  const peopleNamed = async (fullName: string) => {
    const { rows } = await pool.query<{ id: string }>(
      `select id from person where ministry_id = $1 and full_name = $2`,
      [ministry.id, fullName],
    )
    return rows
  }

  const contactOf = async (person: string) => {
    const { rows } = await pool.query<{ phone: string | null; email: string | null }>(
      `select phone, email from person where id = $1`,
      [person],
    )
    return rows[0]
  }

  /** The latest submission's slots, which is what "their availability" means. */
  const availabilityOf = async (person: string) => {
    const { rows } = await pool.query<{ day: string; block: string }>(
      `select a.day, a.block
         from intake_availability a
        where a.intake_submission_id = (
          select s.id from intake_submission s
           where s.person_id = $1
           order by s.submitted_at desc, s.created_at desc
           limit 1
        )
        order by a.day, a.block`,
      [person],
    )
    return rows.map((row) => `${row.day}:${row.block}`)
  }

  it('gives the form back with what the Person already told this Ministry', async () => {
    const person = await addPerson(ministry, 'Ada Bello', { phone: aNumber() })
    const token = await linkFor(person)

    const page = await reader.readReopenedIntakePage(token)

    expect(page?.state).toBe('live')
    expect(page?.personId).toBe(person)
    expect(page?.ministryName).toBe('Riverside Chapel')
    expect(page?.prefill).toMatchObject({
      fullName: 'Ada Bello',
      ageBand: '25-34',
      gender: 'female',
      availability: ['monday:midday'],
      // The decision that currently stands, so the Person can see what they are
      // changing rather than being asked as if for the first time.
      contactSharing: 'granted',
    })
  })

  it('corrects the number on the Person rather than filing a second one', async () => {
    const person = await addPerson(ministry, 'Emily Johnson', { phone: aNumber() })
    const token = await linkFor(person)
    const corrected = aNumber()

    await resubmit(token, { phone: corrected, email: 'emily.new@example.test' })

    expect(await peopleNamed('Emily Johnson')).toHaveLength(1)
    expect(await contactOf(person)).toEqual({
      phone: corrected,
      email: 'emily.new@example.test',
    })
  })

  it('takes the new availability without touching what they answered before', async () => {
    const person = await addPerson(ministry, 'Femi Balogun', { phone: aNumber() })
    const token = await linkFor(person)

    await resubmit(token, {
      fullName: 'Femi Balogun',
      availability: ['thursday:evening', 'saturday:morning'],
    })

    // In weekday order, which is what the enum orders by.
    expect(await availabilityOf(person)).toEqual([
      'thursday:evening',
      'saturday:morning',
    ])

    // Both submissions stand. History is append-only, and what somebody said in
    // September is not rewritten by what they said in October.
    const { rows } = await pool.query(
      `select id from intake_submission where person_id = $1`,
      [person],
    )
    expect(rows).toHaveLength(2)
  })

  it('records a fresh consent record rather than overwriting the earlier one', async () => {
    const person = await addPerson(ministry, 'Grace Miller', { phone: aNumber() })
    const token = await linkFor(person)

    await resubmit(token, { fullName: 'Grace Miller' })

    const { rows } = await pool.query<{ granted: boolean }>(
      `select granted from consent_record
        where person_id = $1 and consent = 'sms' order by decided_at`,
      [person],
    )
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.granted)).toEqual([true, true])
  })

  it('stops the number reaching a Leader once contact sharing is declined', async () => {
    // The one thing here that cannot be fixed after the fact. A decline that wrote
    // no row would leave the earlier grant standing as the only record, and this
    // Person's Leader would keep seeing their number -- which ticket 15 checks at
    // display time precisely so that it can be withdrawn.
    const person = await addPerson(ministry, 'Hana Ito', { phone: aNumber() })
    const revealed = () =>
      readContactToShare(admin, ministry.id as MinistryId, personId(person))

    expect(await revealed()).not.toBeNull()

    const token = await linkFor(person)
    await resubmit(token, { fullName: 'Hana Ito', contactSharing: 'declined' })

    expect(await revealed()).toBeNull()
  })

  it('refuses a re-submission with SMS consent unticked, naming STOP', async () => {
    // The form grants consent and never withdraws it. Withdrawal is `STOP`, which is
    // dated, reversible and person-level; a prefilled link an Admin sent producing a
    // withdrawal that reads as the Person's own act is the wrong shape entirely.
    const person = await addPerson(ministry, 'Idris Karim', { phone: aNumber() })
    const token = await linkFor(person)

    await expect(
      resubmit(token, { fullName: 'Idris Karim', smsConsent: false }),
    ).rejects.toThrow(IntakeRefused)
  })

  it('refuses a link that has run out, without saying anything about the form', async () => {
    const person = await addPerson(ministry, 'Jo Nakamura', { phone: aNumber() })
    const token = await linkFor(person)

    await pool.query(
      `update intake_link set created_at = $2, expires_at = $3 where person_id = $1`,
      [person, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-15T00:00:00Z')],
    )

    await expect(resubmit(token, { fullName: 'Jo Nakamura' })).rejects.toMatchObject({
      refusals: ['intake.link_expired'],
    })

    // And the page says so rather than rendering a form nothing will accept.
    expect((await reader.readReopenedIntakePage(token))?.state).toBe('expired')
  })

  it('gives back the same link when an Admin asks a second time', async () => {
    // An Admin who closed the tab and came back is asking to see the link, not to
    // break the one they already sent. One row per Person means a second token would
    // replace the first, so asking twice has to be asking once.
    const person = await addPerson(ministry, 'Kemi Oyelaran', { phone: aNumber() })
    const first = await linkFor(person)
    const second = await linkFor(person)

    expect(second).toBe(first)
    expect((await reader.readReopenedIntakePage(first))?.personId).toBe(person)
  })

  it('mints a new link once the one they hold has run out', async () => {
    const person = await addPerson(ministry, 'Lin Zhao', { phone: aNumber() })
    const expired = await linkFor(person)

    await pool.query(
      `update intake_link
          set created_at = now() - interval '60 days',
              expires_at = now() - interval '46 days'
        where person_id = $1`,
      [person],
    )

    const replacement = await linkFor(person)

    expect(replacement).not.toBe(expired)
    // And the one that ran out stops working, because one Person holds one link.
    expect(await reader.readReopenedIntakePage(expired)).toBeNull()
  })

  it('refuses a correction that would make this Person somebody already here', async () => {
    // A name and a number together are who a Person is within a Ministry. Two
    // things look like this and Discipler cannot tell them apart, so it refuses and
    // an Admin decides -- exactly as an import does with the same collision.
    const taken = aNumber()
    await addPerson(ministry, 'Lara Mensah', { phone: taken })
    const person = await addPerson(ministry, 'Lara Mensah', { phone: aNumber() })

    await expect(
      resubmit(await linkFor(person), { fullName: 'Lara Mensah', phone: taken }),
    ).rejects.toMatchObject({ refusals: ['intake.details_belong_to_someone_else'] })
  })
})
