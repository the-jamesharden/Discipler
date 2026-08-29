import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { PairingRefused } from '~/domain/errors'
import { personId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addMembership,
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  optOut,
  pairOneToOne,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Intake stands between the Roster and a relationship, on both sides of it.
 *
 * The flow is import, then Intake, then pairing. A Person who has not completed
 * Intake is an ordinary thing to find on a Roster -- an import puts a whole
 * congregation there in one go -- and that is a fact about the Roster, not a licence
 * to pair them. Ticket 02 held Participants to this and left Leaders alone; the two
 * are held to it here, in the database, because an application-side check holds only
 * until the first write path that forgets it.
 */

describe('pairing somebody who has not completed Intake', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const clock = createTestClock(new Date('2026-03-02T09:00:00Z'))
  // Real identifiers: these rows outlive the test file, so a second run against the
  // same stack would collide with the first on a deterministic id.
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

  /** The membership insert on its own, so the trigger is what refuses and not the caps. */
  const addAsLeader = async (personId: string) => {
    const relationshipId = await createRelationship(ministry, 'one_to_one')
    return addMembership({
      ministry,
      relationshipId,
      kind: 'one_to_one',
      personId,
      role: 'leader',
    })
  }

  describe('as a Leader', () => {
    it('refuses somebody who has opted out', async () => {
      // The case the ticket-02 trigger let through: `role <> 'participant'` returned
      // early, so a Person who had said STOP could still be made to lead.
      const optedOut = await addPerson(ministry, 'Said Stop Then Asked To Lead')
      await optOut(ministry, optedOut)

      await expect(addAsLeader(optedOut)).rejects.toThrow(/opted out/)
    })

    it('refuses somebody who has only been imported', async () => {
      const imported = await addPerson(ministry, 'Only On The Roster', { intake: false })

      await expect(addAsLeader(imported)).rejects.toThrow(/has not completed Intake/)
    })

    it('refuses a submission that carried no SMS consent', async () => {
      // Intake is one act producing two facts and the pool requires both. A form
      // filled in without the SMS box ticked is not a completed Intake, and the
      // Leader is the one Discipler texts an Invitation Link to.
      const partial = await addPerson(ministry, 'Ticked Neither Box', { intake: false })
      await completeIntake(ministry, partial, ['contact_sharing'])

      await expect(addAsLeader(partial)).rejects.toThrow(/has not completed Intake/)
    })

    it('allows somebody who is being discipled by somebody else', async () => {
      // `paired` passes, and that is the point of reading the derivation rather than
      // the tables under it. Participation Status says whether a Person is being
      // discipled; it has never said what they are allowed to do.
      const theirLeader = await addPerson(ministry, 'Disciples The Next One')
      const both = await addPerson(ministry, 'Led And Leading')
      await pairOneToOne(ministry, theirLeader, both)

      await expect(addAsLeader(both)).resolves.toBeDefined()
    })

    it('allows somebody who completed Intake and never opted out', async () => {
      const ready = await addPerson(ministry, 'Ready To Lead')

      await expect(addAsLeader(ready)).resolves.toBeDefined()
    })

    it('lets a Leader who has opted out stay in the relationship they already lead', async () => {
      // Opting out stops what Discipler sends. It does not reach back and end a
      // relationship, and the trigger fires on insert for exactly that reason.
      const leader = await addPerson(ministry, 'Opted Out While Leading')
      const participant = await addPerson(ministry, 'Still Being Led')
      await pairOneToOne(ministry, leader, participant)

      await optOut(ministry, leader)

      const { rows } = await pool.query(
        `select count(*)::int as open from relationship_member
          where person_id = $1 and role = 'leader' and ended_at is null`,
        [leader],
      )
      expect(rows[0].open).toBe(1)
    })
  })

  describe('through the command boundary', () => {
    const pairing = (leaderId: string, participantId: string) =>
      service().execute({
        type: 'relationship.create',
        ministryId: ministry.id,
        leaderIds: [personId(leaderId)],
        participantIds: [personId(participantId)],
      })

    it('tells the Admin it was the Leader who has not completed Intake', async () => {
      const leader = await addPerson(ministry, 'Leader Not Yet Asked', { intake: false })
      const participant = await addPerson(ministry, 'Willing Participant')

      await expect(pairing(leader, participant)).rejects.toThrow(
        new PairingRefused('relationship.leader_has_not_completed_intake'),
      )
    })

    it('tells the Admin it was the Leader who opted out', async () => {
      const leader = await addPerson(ministry, 'Leader Who Said Stop')
      await optOut(ministry, leader)
      const participant = await addPerson(ministry, 'Another Willing Participant')

      await expect(pairing(leader, participant)).rejects.toThrow(
        new PairingRefused('relationship.leader_has_opted_out'),
      )
    })

    it('still names the Participant when it is the Participant who is not ready', async () => {
      // The reason the two roles get their own trigger: the Admin is being told a
      // different thing, and a single function answering both would have to work out
      // which it was in order to say so.
      const leader = await addPerson(ministry, 'Perfectly Ready Leader')
      const participant = await addPerson(ministry, 'Participant Not Yet Asked', {
        intake: false,
      })

      await expect(pairing(leader, participant)).rejects.toThrow(
        new PairingRefused('relationship.participant_has_not_completed_intake'),
      )
    })

    it('writes no relationship at all when the Leader is refused', async () => {
      const leader = await addPerson(ministry, 'Refused Leader', { intake: false })
      const participant = await addPerson(ministry, 'Never Paired With Them')

      await expect(pairing(leader, participant)).rejects.toThrow(PairingRefused)

      const { rows } = await pool.query(
        `select count(*)::int as memberships from relationship_member where person_id = $1`,
        [participant],
      )
      expect(rows[0].memberships).toBe(0)
    })
  })
})

describe('a consent record', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Northgate Community Church')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  const consentsFor = async (personId: string) => {
    const { rows } = await pool.query(
      `select consent, source, version from consent_record where person_id = $1 order by consent`,
      [personId],
    )
    return rows
  }

  it('records which route brought the Person to the Intake form', async () => {
    const person = await addPerson(ministry, 'Came By The Link', { intake: false })
    await completeIntake(ministry, person, ['sms'], 'pastor_link')

    expect(await consentsFor(person)).toEqual([
      { consent: 'sms', source: 'pastor_link', version: '2026-09-v1' },
    ])
  })

  it('records the QR code as the same consent reached a different way', async () => {
    // A pastor sending the link and a QR code opening it are two ways to the one
    // form. Same record, same wording, same version -- only the route differs.
    const person = await addPerson(ministry, 'Scanned At The Meeting', { intake: false })
    await completeIntake(ministry, person, ['sms'], 'qr_code')

    expect(await consentsFor(person)).toEqual([
      { consent: 'sms', source: 'qr_code', version: '2026-09-v1' },
    ])
  })

  it('refuses to be written without saying where it came from', async () => {
    // Not a defaulted column. A write that cannot say how the Person reached the
    // form does not know whether they reached it at all.
    const person = await addPerson(ministry, 'Sourceless Consent', { intake: false })

    const { error } = await serviceRoleClient().from('consent_record').insert({
      ministry_id: ministry.id,
      person_id: person,
      consent: 'sms',
      version: '2026-09-v1',
      granted: true,
      decided_at: new Date().toISOString(),
    })

    expect(error?.message).toMatch(/source/)
  })

  it('cannot have its source rewritten afterwards', async () => {
    // Each record keeps pointing at what the Person actually saw and how they got
    // there. Correcting it later is indistinguishable from inventing it.
    const person = await addPerson(ministry, 'Fixed Consent', { intake: false })
    await completeIntake(ministry, person, ['sms'], 'qr_code')

    await expect(
      pool.query(`update consent_record set source = 'pastor_link' where person_id = $1`, [
        person,
      ]),
    ).rejects.toThrow(/not permitted/)
  })
})
