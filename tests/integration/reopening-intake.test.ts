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
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  signInAs,
  signInWith,
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
        intakePath: null,
        declaredSide: null,
        experience: null,
        groupId: null,
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
           order by s.submitted_at desc, s.created_at desc, s.id desc
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

  it('prefills the same submission the rest of the product reads as the latest', async () => {
    // Two submissions can share both timestamps -- a correction sent twice in the
    // same second, or a backfill that stamped a batch alike -- and then the ordering
    // is settled by the last term or by nothing at all.
    //
    // It has to be the same last term everywhere. `public.relationship_availability`
    // and the pairing gender read both break the tie on `id desc`; a form that broke
    // it differently would show a Person answers that are not the ones standing
    // against them, and they would correct the wrong ones.
    const person = await addPerson(ministry, 'Ines Duarte', { phone: aNumber() })
    await resubmit(await linkFor(person), { fullName: 'Ines Duarte', ageBand: '55-64' })

    const { rows: both } = await pool.query<{ id: string; age_band: string }>(
      `select id, age_band from intake_submission where person_id = $1`,
      [person],
    )
    expect(both).toHaveLength(2)
    // Two age bands, so which row was chosen is visible in the answer.
    expect(new Set(both.map((row) => row.age_band)).size).toBe(2)

    // The tie, made in place. Both rows now agree on every column the ordering
    // reads except the one that has to settle it.
    await pool.query(
      `update intake_submission
          set submitted_at = timestamptz '2026-08-20T09:00:00Z',
              created_at   = timestamptz '2026-08-20T09:00:00Z'
        where person_id = $1`,
      [person],
    )

    const canonical = [...both].sort((a, b) => (a.id < b.id ? 1 : -1))[0]!

    // The tie has to be *decided*, not merely present. With the timestamps equal,
    // an incomplete `order by` falls through to whatever order the scan hands up,
    // and on two rows that is physical order -- which an update rewrites. Touching
    // the row that should win moves it to the end, so the row that should lose is
    // read first and a query missing the last term returns it.
    await pool.query(
      `update intake_submission set submitted_at = submitted_at where id = $1`,
      [canonical.id],
    )

    const page = await reader.readReopenedIntakePage(await linkFor(person))
    expect(page?.prefill.ageBand).toBe(canonical.age_band)
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

  it('stops the Leader who leads them seeing the number, from their own form', async () => {
    // The criterion end to end, on the surface it is about. The test above proves
    // the consent gate flips; it asks as the *Admin*, about a Person in no
    // relationship, so no Leader and no Leader-facing read is exercised by it at
    // all -- and `contact_to_share` gates on `app.is_member_of`, which an Admin
    // passes for a different reason than a Leader does.
    //
    // What has to hold is the whole chain: a Person opens the link an Admin sent
    // them, unticks one box on their own form, and the number stops appearing on
    // their Leader's dashboard. Every link in it is a different mechanism -- the
    // token names them, the submission writes a second consent record, and the
    // dashboard resolves the latest decision at the moment it draws the row.
    const leader = await addPersonWithAccount(ministry, 'Karen Whitfield', 'leader', {
      phone: aNumber(),
    })
    const asLeader = await signInWith(leader)

    try {
      const person = await addPerson(ministry, 'Jonah Mbeki', { phone: aNumber() })
      await pairOneToOne(ministry, leader.personId, person)

      const seenByTheLeader = async () => {
        const { data, error } = await asLeader.rpc('contact_to_share', {
          target_ministry_id: ministry.id,
          target_person_id: person,
        })
        if (error) throw new Error(error.message)
        return (data ?? []) as { full_name: string; phone: string }[]
      }

      // Granted at Intake, and his Leader can see it. Asserted rather than assumed,
      // because a test whose "before" was already empty would pass on a decline that
      // did nothing.
      const before = await seenByTheLeader()
      expect(before).toHaveLength(1)
      expect(before[0]?.full_name).toBe('Jonah Mbeki')
      const number = before[0]!.phone

      // His own form, through the link, with the one box unticked. Nothing else
      // about the relationship changes: he is still in it, and still a Participant
      // his Leader is responsible for.
      await resubmit(await linkFor(person), {
        fullName: 'Jonah Mbeki',
        phone: number,
        contactSharing: 'declined',
      })

      expect(await seenByTheLeader()).toEqual([])

      // He is withheld, not removed. A Person who takes their number back is still
      // somebody their Leader leads, and a dashboard that dropped him would have
      // answered a different question than the one that was asked.
      const { rows: still } = await pool.query(
        `select 1 from relationship_member m
           join relationship r on r.id = m.relationship_id
          where m.person_id = $1 and m.ended_at is null and r.ended_at is null`,
        [person],
      )
      expect(still).toHaveLength(1)

      // And the decline is a record rather than an erasure: both decisions stand,
      // which is what makes it reversible and what the append-only table is for.
      const { rows: decisions } = await pool.query<{ granted: boolean }>(
        `select granted from consent_record
          where person_id = $1 and consent = 'contact_sharing' order by decided_at`,
        [person],
      )
      expect(decisions.map((row) => row.granted)).toEqual([true, false])
    } finally {
      await asLeader.auth.signOut()
    }
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
