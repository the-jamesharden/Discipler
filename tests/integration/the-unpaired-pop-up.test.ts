import { describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { readWaitingOnYou } from '~/platform/supabase/overview-reader'
import {
  addPerson,
  createMinistryWithAdmin,
  optOut,
  pairOneToOne,
  serviceRoleClient,
  signInAs,
} from '../support/local-supabase'

/**
 * The unpaired pop-up's counts against the real database (Exponential launch,
 * ticket 29), read through a signed-in Admin's session out of the Overview's own
 * document: Ready to Pair people in no relationship, and No Intake Submitted
 * people, leaving out Admins, anyone opted out and anyone removed from the
 * Roster. Each scenario has a Ministry of its own.
 */

describe('the unpaired pop-up', () => {
  const clock = createTestClock(new Date('2026-11-02T15:00:00Z'))

  it('counts the people waiting on the Admin and nobody else', async () => {
    const ministry = await createMinistryWithAdmin('Waiting on you')

    // Waiting to be paired: Intake done, in nothing.
    await addPerson(ministry, 'Grace Lee')
    await addPerson(ministry, 'Emily Davis')
    // Waiting on their Intake.
    await addPerson(ministry, 'Mark Wilson', { intake: false })
    await addPerson(ministry, 'Ruth Park', { intake: false })
    await addPerson(ministry, 'Sam Okafor', { intake: false })

    // A pair: the Disciple is Paired, and the Leader is Ready to Pair but leads
    // somebody, so is in a relationship and waits on nobody.
    const leader = await addPerson(ministry, 'Peter Hall')
    const disciple = await addPerson(ministry, 'John Reed')
    await pairOneToOne(ministry, leader, disciple)

    // Opted out, with an Intake and without: counted in neither.
    await optOut(ministry, await addPerson(ministry, 'Anna Bell'))
    await optOut(ministry, await addPerson(ministry, 'Luke Gray', { intake: false }))

    // Removed from the Roster, so on it no longer.
    const removed = await addPerson(ministry, 'Tom Ash', { intake: false })
    const { error } = await serviceRoleClient().from('person_removal').insert({
      ministry_id: ministry.id,
      person_id: removed,
      removed_at: new Date().toISOString(),
    })
    if (error) throw new Error(`Could not remove Tom Ash: ${error.message}`)

    // The Admin is on the Roster with no Intake, which provisioning leaves them,
    // and is not counted as waiting on themselves.
    const admin = await signInAs(ministry)
    const read = await readWaitingOnYou(admin, ministry.id, clock)

    expect(read?.waiting).toEqual({ toPair: 2, awaitingIntake: 3 })
  })

  it("is shown once for each of the Admin's sign-ins on each of the church's days", async () => {
    const ministry = await createMinistryWithAdmin('Two sign-ins')

    const signedIn = await signInAs(ministry)
    const first = await readWaitingOnYou(signedIn, ministry.id, clock)
    const again = await readWaitingOnYou(signedIn, ministry.id, clock)
    const tomorrow = await readWaitingOnYou(signedIn, ministry.id, createTestClock(new Date('2026-11-03T15:00:00Z')))
    const signedInAgain = await readWaitingOnYou(await signInAs(ministry), ministry.id, clock)

    expect(first?.showing).toBeTruthy()
    expect(again?.showing).toBe(first?.showing)
    expect(tomorrow?.showing).not.toBe(first?.showing)
    expect(signedInAgain?.showing).not.toBe(first?.showing)
  })

  it('counts nothing in a Ministry the session does not administer', async () => {
    const theirs = await createMinistryWithAdmin('Theirs')
    await addPerson(theirs, 'Somebody Else', { intake: false })
    const ours = await createMinistryWithAdmin('Ours')

    expect(await readWaitingOnYou(await signInAs(ours), theirs.id, clock)).toBeNull()
  })
})
