import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AvailabilitySlot } from '~/domain/intake'
import {
  addMaterial,
  completeIntake,
  addMembership,
  addPerson,
  addPersonWithAccount,
  assignMaterial,
  createMinistryWithAdmin,
  createRelationship,
  pauseRelationship,
  recordConsentDecision,
  serviceRoleClient,
  signInAs,
  signInWith,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * What the database will show a Leader, which is the half of the Leader Dashboard
 * that cannot be proved by rendering a page. The screen shows three things -- the
 * availability overlay, the Material, and the names and numbers -- and each of them
 * is a widening this ticket made. Each is checked here from both sides: that the
 * Leader it was written for can reach it, and that somebody standing one step away
 * cannot.
 *
 * The step away is always the same person. Mo leads a group of his own and is a
 * Participant in Karen's, and being discipled grants him nothing anywhere: not the
 * relationship, not its Material, not anybody's availability, not a number.
 */

const slots = (...keys: string[]): readonly AvailabilitySlot[] =>
  keys.map((key) => {
    const [day, hour] = key.split(':')
    return { day, hour } as AvailabilitySlot
  })

interface AvailabilityRow {
  person_id: string
  day: string
  hour: string
}

describe('what the Leader Dashboard may read', () => {
  let riverside: MinistryFixture
  let admin: SupabaseClient

  // Karen leads a one-to-one with Ada and a group holding Mo and Ben.
  let karen: AccountFixture
  let karensOneToOne: string
  let karensGroup: string
  let ada: string
  let ben: string

  // Mo leads a group of his own, and is a Participant in Karen's.
  let mo: AccountFixture
  let mosGroup: string

  let asKaren: SupabaseClient
  let asMo: SupabaseClient

  const availabilityFor = async (client: SupabaseClient, relationship: string) => {
    const { data, error } = await client.rpc('relationship_availability', {
      target_relationship_id: relationship,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as AvailabilityRow[]
  }

  const slotsOf = (rows: readonly AvailabilityRow[], person: string) =>
    rows
      .filter((row) => row.person_id === person)
      .map((row) => `${row.day}:${row.hour}`)
      .sort()

  beforeAll(async () => {
    riverside = await createMinistryWithAdmin('Riverside Chapel')

    karen = await addPersonWithAccount(riverside, 'Karen Whitfield', 'leader', {
      answers: { availability: slots('monday:12', 'wednesday:18') },
    })
    mo = await addPersonWithAccount(riverside, 'Mo Farah', 'leader', {
      answers: { availability: slots('monday:12') },
    })
    ada = await addPerson(riverside, 'Ada Rowe', {
      phone: '+15552349911',
      answers: { availability: slots('monday:12', 'thursday:09') },
    })
    ben = await addPerson(riverside, 'Ben Okafor', {
      phone: '+15558110042',
      answers: { availability: slots('wednesday:18') },
    })

    const lead = async (
      leaderId: string,
      kind: 'one_to_one' | 'group',
      participants: readonly string[],
    ) => {
      const relationshipId = await createRelationship(riverside, kind)
      await addMembership({
        ministry: riverside,
        relationshipId,
        kind,
        personId: leaderId,
        role: 'leader',
      })
      for (const participant of participants) {
        await addMembership({
          ministry: riverside,
          relationshipId,
          kind,
          personId: participant,
          role: 'participant',
        })
      }
      return relationshipId
    }

    karensOneToOne = await lead(karen.personId, 'one_to_one', [ada])
    karensGroup = await lead(karen.personId, 'group', [mo.personId, ben])
    mosGroup = await lead(mo.personId, 'group', [])

    admin = await signInAs(riverside)
    asKaren = await signInWith(karen)
    asMo = await signInWith(mo)
  })

  describe('the availability overlay', () => {
    it('gives a Leader everyone in a relationship they lead, themselves included', async () => {
      const rows = await availabilityFor(asKaren, karensOneToOne)

      expect(slotsOf(rows, karen.personId)).toEqual(['monday:12', 'wednesday:18'])
      expect(slotsOf(rows, ada)).toEqual(['monday:12', 'thursday:09'])
      expect([...new Set(rows.map((row) => row.person_id))].sort()).toEqual(
        [karen.personId, ada].sort(),
      )
    })

    it('gives an Admin the same grid for any relationship in their Ministry', async () => {
      const rows = await availabilityFor(admin, karensGroup)

      expect([...new Set(rows.map((row) => row.person_id))].sort()).toEqual(
        [karen.personId, mo.personId, ben].sort(),
      )
    })

    it('gives a Participant with an account nothing about the relationship discipling them', async () => {
      // Mo is in Karen's group. His own group is his; hers grants him nothing, and
      // that includes the availability of the people he is being discipled with.
      expect(await availabilityFor(asMo, karensGroup)).toEqual([])
      expect(await availabilityFor(asMo, karensOneToOne)).toEqual([])
    })

    it('gives a Leader nothing for a relationship in another Ministry', async () => {
      const northgate = await createMinistryWithAdmin('Northgate Community Church')
      const theirLeader = await addPerson(northgate, 'Jonah Park')
      const theirs = await createRelationship(northgate, 'one_to_one')
      await addMembership({
        ministry: northgate,
        relationshipId: theirs,
        kind: 'one_to_one',
        personId: theirLeader,
        role: 'leader',
      })

      expect(await availabilityFor(asKaren, theirs)).toEqual([])
    })

    it('draws the answers a Person gave most recently, not every answer they ever gave', async () => {
      // An Admin can send somebody a tokenized link that reopens their Intake form,
      // so a second submission is ordinary. Unioning the two would leave a Person
      // permanently available at a time they went back and unticked.
      const church = await createMinistryWithAdmin('Second Thoughts Chapel')
      const leader = await addPersonWithAccount(church, 'Nadia Reyes', 'leader', {
        answers: { availability: slots('monday:12') },
      })
      const changed = await addPerson(church, 'Tom Barrow', {
        answers: { availability: slots('friday:18') },
      })

      const relationship = await createRelationship(church, 'one_to_one')
      await addMembership({
        ministry: church,
        relationshipId: relationship,
        kind: 'one_to_one',
        personId: leader.personId,
        role: 'leader',
      })
      await addMembership({
        ministry: church,
        relationshipId: relationship,
        kind: 'one_to_one',
        personId: changed,
        role: 'participant',
      })

      await completeIntake(church, changed, ['sms', 'contact_sharing'], 'pastor_link', {
        availability: slots('saturday:09'),
      })

      const rows = await availabilityFor(await signInWith(leader), relationship)
      expect(slotsOf(rows, changed)).toEqual(['saturday:09'])
    })

    it('leaves the availability table itself shut to a Leader', async () => {
      // The function is the widening, and it is the whole of it. Without this the
      // grid would be reachable one REST call at a time for the whole congregation.
      const { data } = await asKaren.from('intake_availability').select('day, hour')
      expect(data).toEqual([])
    })
  })

  describe('the Material', () => {
    let romans: string

    beforeAll(async () => {
      romans = await addMaterial(riverside, 'Romans, weeks 1-6')
      await assignMaterial(karensOneToOne, romans, riverside.adminUserId)
    })

    const periodsFor = async (client: SupabaseClient, relationship: string) => {
      const { data, error } = await client.rpc('material_periods', {
        target_ministry_id: riverside.id,
      })
      if (error) throw new Error(error.message)
      return ((data ?? []) as { relationship_id: string }[]).filter(
        (period) => period.relationship_id === relationship,
      )
    }

    it('gives a Leader the Material their relationship is working through', async () => {
      expect(await periodsFor(asKaren, karensOneToOne)).toEqual([
        expect.objectContaining({
          relationship_id: karensOneToOne,
          material_id: romans,
          title: 'Romans, weeks 1-6',
        }),
      ])
    })

    it('says "none" as a period rather than as an absence, on one nothing is assigned to', async () => {
      // Karen's group has only the period acceptance opened. A row with a null
      // Material is the fact that nothing is in use; no row at all would be
      // indistinguishable from a relationship this Leader cannot see.
      expect(await periodsFor(asKaren, karensGroup)).toEqual([
        expect.objectContaining({ material_id: null, title: null, ended_at: null }),
      ])
    })

    it('gives a Leader the period that is running and not the ones that closed', async () => {
      // The screen shows what they are working through now. The stretch before an
      // Admin assigned anything is the relationship's history, and this surface
      // carries none: three things and nothing else.
      const { data } = await asKaren
        .from('material_assignment')
        .select('material_id, ended_at')
        .eq('relationship_id', karensOneToOne)

      expect(data).toEqual([{ material_id: romans, ended_at: null }])
    })

    it('gives a Participant with an account nothing of their relationship’s Material', async () => {
      const mark = await addMaterial(riverside, 'Mark, weeks 1-8')
      await assignMaterial(karensGroup, mark, riverside.adminUserId)

      // Mo is a Participant in Karen's group. He leads a group of his own, which is
      // why this asks about hers by name rather than for an empty list.
      expect(await periodsFor(asMo, karensGroup)).toEqual([])

      const { data: materials } = await asMo.from('material').select('id')
      expect((materials ?? []).map((row) => row.id)).not.toContain(mark)
    })

    it('lets a Leader open the PDF of the Material they were assigned, and nobody else', async () => {
      // The bucket is where row-level security cannot reach, so the object key is
      // the claim and a storage policy is what reads it. Ticket 14 wrote the Admin's
      // half and left this one for the screen that needed it.
      const pdfPath = `${riverside.id}/${crypto.randomUUID()}.pdf`
      const store = serviceRoleClient().storage.from('material')
      const uploaded = await store.upload(pdfPath, new Blob(['%PDF-1.4 a study'], {
        type: 'application/pdf',
      }))
      if (uploaded.error) throw new Error(uploaded.error.message)

      const withPdf = await addMaterial(riverside, 'Galatians, weeks 1-5', {
        body: null,
        pdfPath,
        pdfFilename: 'galatians.pdf',
      })
      await assignMaterial(karensGroup, withPdf, riverside.adminUserId)

      const hers = await asKaren.storage.from('material').download(pdfPath)
      expect(hers.error).toBeNull()

      // Mo is a Participant in that same group. The bucket answers him the way
      // every other read in Discipler does: not for you.
      const his = await asMo.storage.from('material').download(pdfPath)
      expect(his.error).not.toBeNull()
    })

    it('takes a Leader’s sight of a Material away when the Admin assigns the next one', async () => {
      const later = await addMaterial(riverside, 'Philippians, weeks 1-4')
      await assignMaterial(karensOneToOne, later, riverside.adminUserId)

      const { data } = await asKaren.from('material').select('id')
      const visible = (data ?? []).map((row) => row.id)

      expect(visible).toContain(later)
      expect(visible).not.toContain(romans)
    })
  })

  describe('the names and the numbers', () => {
    it('no longer lets any browser session read the number off the row', async () => {
      // The gap ticket 02 recorded when it added the column. Row-level security is
      // row-level: the policies let a Leader read a Person they lead, and the number
      // came with everything else on the row, consent or no consent.
      const asLeader = await asKaren.from('person').select('phone')
      const asAdministrator = await admin.from('person').select('phone')

      expect(asLeader.error?.code).toBe('42501')
      expect(asAdministrator.error?.code).toBe('42501')
    })

    it('still lets a Leader read the names of the people they lead', async () => {
      const { data } = await asKaren.from('person').select('id, full_name')

      expect((data ?? []).map((row) => row.id).sort()).toEqual(
        [karen.personId, mo.personId, ada, ben].sort(),
      )
    })

    it('gives a Leader a number where the Person currently agrees to share it', async () => {
      const { data, error } = await asKaren.rpc('contact_to_share', {
        target_ministry_id: riverside.id,
        target_person_id: ada,
      })
      if (error) throw new Error(error.message)

      expect(data).toEqual([{ full_name: 'Ada Rowe', phone: '+15552349911' }])
    })

    it('stops giving it the moment that Person withdraws the consent', async () => {
      // Checked at the moment of display, never assumed from enrolment. Ada agreed
      // at Intake and the relationship has not changed; the answer has.
      await recordConsentDecision(riverside, ada, 'contact_sharing', false)

      const { data } = await asKaren.rpc('contact_to_share', {
        target_ministry_id: riverside.id,
        target_person_id: ada,
      })
      expect(data).toEqual([])

      await recordConsentDecision(riverside, ada, 'contact_sharing', true)
    })

    it('refuses a Leader the number of somebody they do not lead', async () => {
      // Ben is in Karen's group, so she may ask about him. The question is what a
      // Leader may ask about somebody they have nothing to do with -- and until this
      // ticket the test was Ministry membership, which every Leader passes.
      const stranger = await addPerson(riverside, 'Priya Raman', { phone: '+15559990001' })

      const mine = await asKaren.rpc('contact_to_share', {
        target_ministry_id: riverside.id,
        target_person_id: ben,
      })
      const theirs = await asKaren.rpc('contact_to_share', {
        target_ministry_id: riverside.id,
        target_person_id: stranger,
      })

      expect(mine.data).toEqual([{ full_name: 'Ben Okafor', phone: '+15558110042' }])
      expect(theirs.data).toEqual([])
    })

    it('refuses a Participant with an account the number of anybody at all', async () => {
      const theirs = await asMo.rpc('contact_to_share', {
        target_ministry_id: riverside.id,
        target_person_id: ben,
      })

      // Ben is in the group Mo is being discipled in. A Participant's membership
      // grants them sight of nobody, the other Participants included.
      expect(theirs.data).toEqual([])
    })
  })

  describe('a Pause', () => {
    it('is visible to the Leader whose relationship it stands on', async () => {
      await pauseRelationship(riverside, mosGroup, 4)

      const { data, error } = await asMo.rpc('relationship_pauses', {
        target_ministry_id: riverside.id,
      })
      if (error) throw new Error(error.message)

      expect(data).toEqual([
        expect.objectContaining({ relationship_id: mosGroup, period_weeks: 4 }),
      ])
    })

    it('is not visible to a Leader it does not belong to', async () => {
      const { data } = await asKaren.rpc('relationship_pauses', {
        target_ministry_id: riverside.id,
      })

      expect((data ?? []).map((row: { relationship_id: string }) => row.relationship_id)).not.toContain(
        mosGroup,
      )
    })

    it('is visible to the Admin, who sees every Pause in the Ministry', async () => {
      const { data } = await admin.rpc('relationship_pauses', {
        target_ministry_id: riverside.id,
      })

      expect(
        (data ?? []).map((row: { relationship_id: string }) => row.relationship_id),
      ).toContain(mosGroup)
    })

    it('reaches a Leader without opening the history it is recorded in', async () => {
      // A Pause is two events in `ministry_event`, and that table stays the Admin's.
      // The Leader Dashboard carries no message history and no ministry-wide record;
      // what it carries is the one fact that its own check-ins have stopped.
      const { data } = await asMo.from('ministry_event').select('id')
      expect(data).toEqual([])
    })
  })
})
