import { beforeAll, describe, expect, it } from 'vitest'
import type { AvailabilitySlot } from '~/domain/intake'
import {
  addMaterial,
  addMembership,
  addPerson,
  addPersonWithAccount,
  adminAsPerson,
  assignMaterial,
  completeIntake,
  createMinistryWithAdmin,
  createRelationship,
  pauseRelationship,
  recordConsentDecision,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'
import { getPage, signInAs, skipUnlessAppIsRunning } from '../support/app'

/**
 * The Leader Dashboard as a Leader actually reaches it: sign in with a phone number
 * and a password, and read the relationships you lead.
 *
 * Three things and nothing else are on this page, and the tests that matter most
 * here are the ones about what is *not*: no message history, no analytics, nobody
 * else's relationship, and no number belonging to somebody who did not agree to
 * share it.
 */

const slots = (...keys: string[]): readonly AvailabilitySlot[] =>
  keys.map((key) => {
    const [day, hour] = key.split(':')
    return { day, hour } as AvailabilitySlot
  })

describe.skipIf(skipUnlessAppIsRunning)('a Leader reading their own relationships', () => {
  let riverside: MinistryFixture

  let karen: AccountFixture
  let karensOneToOne: string
  let karensGroup: string
  let emily: string
  let marcus: string
  let dani: string

  // A Leader in her own right, and a Participant in Karen's group.
  let mo: AccountFixture
  let mosPausedGroup: string

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

  const dashboardFor = async (account: AccountFixture) => {
    const { cookie } = await signInAs(account)
    const { response, html } = await getPage('/relationships', cookie)
    expect(response.status).toBe(200)
    return html
  }

  beforeAll(async () => {
    riverside = await createMinistryWithAdmin('Riverside Chapel')

    karen = await addPersonWithAccount(riverside, 'Karen Whitfield', 'leader', {
      answers: { availability: slots('monday:12', 'wednesday:18') },
    })
    mo = await addPersonWithAccount(riverside, 'Mo Farah', 'leader', {
      answers: { availability: slots('monday:12') },
    })

    // Emily can meet when Karen can, and once when she cannot: green on Monday and
    // yellow on Thursday, which is the asymmetry the one-to-one overlay exists for.
    emily = await addPerson(riverside, 'Emily Johnson', {
      phone: '+15552349911',
      answers: { availability: slots('monday:12', 'thursday:09') },
    })
    marcus = await addPerson(riverside, 'Marcus Webb', {
      phone: '+15558110042',
      answers: { availability: slots('wednesday:18') },
    })
    dani = await addPerson(riverside, 'Dani Osei', {
      phone: '+15554472310',
      answers: { availability: slots('wednesday:18') },
    })

    karensOneToOne = await lead(karen.personId, 'one_to_one', [emily])
    karensGroup = await lead(karen.personId, 'group', [mo.personId, marcus, dani])
    mosPausedGroup = await lead(mo.personId, 'group', [])

    await assignMaterial(
      karensOneToOne,
      await addMaterial(riverside, 'Romans, weeks 1-6', { body: 'Read Romans 1 together.' }),
      riverside.adminUserId,
    )

    await pauseRelationship(riverside, mosPausedGroup, 4)
  })

  it('turns away a visitor with no session', async () => {
    const response = await fetch('http://127.0.0.1:3000/relationships', { redirect: 'manual' })
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })

  it('shows the relationships they lead, and names who is in each one', async () => {
    const html = await dashboardFor(karen)

    expect(html).toContain('Emily Johnson')
    expect(html).toContain('Marcus Webb')
    expect(html).toContain('Dani Osei')
  })

  it('shows nothing of a relationship they are only a Participant in', async () => {
    // Mo leads a group of his own and is discipled in Karen's. Being discipled
    // grants no surface at all -- not even the names of the people beside him.
    const html = await dashboardFor(mo)

    expect(html).not.toContain('Marcus Webb')
    expect(html).not.toContain('Dani Osei')
    expect(html).not.toContain('Karen Whitfield')
  })

  it('draws the grid with the days down and the hours across', async () => {
    const html = await dashboardFor(karen)

    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(html).toContain(day)
    }
    // The row headings are the days, which is what puts them on the vertical axis.
    expect(html).toContain('<th scope="row">Monday</th>')
    expect(html).toContain('<th scope="col">12pm</th>')
  })

  it('names the best overlap and says nothing about booking it', async () => {
    const html = await dashboardFor(karen)

    // Karen and Emily both marked Monday 12pm. It is a suggestion and the sentence
    // says whose decision the time is.
    expect(html).toContain('Monday 12pm')
    expect(html).toContain('You choose the time')
  })

  it('says plainly when no slot works for everyone including them', async () => {
    // Karen's group: Marcus and Dani can do Wednesday evening and so can she, but Mo
    // marked only Monday 12pm -- so nothing gathers all four.
    const html = await dashboardFor(karen)

    expect(html).toContain('no slot works for everyone including you')
  })

  it('shows the Material the relationship is working through', async () => {
    const html = await dashboardFor(karen)

    expect(html).toContain('Romans, weeks 1-6')
    expect(html).toContain('Read Romans 1 together.')
  })

  it('says so where no Material has been assigned yet', async () => {
    const html = await dashboardFor(karen)

    // Karen's group has only the period acceptance opened. "None" is a fact about
    // the relationship, not a gap in the page.
    expect(html).toContain('No material assigned yet')
  })

  it('shows the number of somebody who agreed to share it', async () => {
    const html = await dashboardFor(karen)

    expect(html).toContain('+15552349911')
  })

  it('withholds the number of somebody who has withdrawn that agreement', async () => {
    await recordConsentDecision(riverside, marcus, 'contact_sharing', false)
    try {
      const html = await dashboardFor(karen)

      // Checked at the moment of display, never assumed from enrolment. Marcus is
      // still in the group and still on the list; his number is not.
      expect(html).toContain('Marcus Webb')
      expect(html).not.toContain('+15558110042')
      expect(html).toContain('Number not shared')
    } finally {
      await recordConsentDecision(riverside, marcus, 'contact_sharing', true)
    }
  })

  it('marks a paused relationship as paused, and keeps it on the list', async () => {
    const html = await dashboardFor(mo)

    expect(html).toContain('Paused')
    // Pausing never removes, archives, ends or hides it.
    expect(html).toContain('Availability')
  })

  it('carries no message history and no analytics', async () => {
    const html = await dashboardFor(karen)

    // The three things and nothing else. `Stalled`, `Needs Care` and `Healthy` are
    // the Admin's reading of how a relationship is doing and live on Care Needed;
    // the Leader's surface says whether their own check-ins are paused and no more.
    for (const absent of ['Stalled', 'Needs Care', 'Healthy', 'Check-in', 'Care Needed']) {
      expect(html).not.toContain(absent)
    }
  })

  it('reaches both surfaces for an Admin who also leads, from one account', async () => {
    // One `ministry_member` row, and it says `admin`. The Leader surface is a live
    // query for open leader memberships, so a surface gated on the tier would hide
    // this person's own relationships from them.
    const church = await createMinistryWithAdmin('Two Hats Chapel', 'James Greaves')

    // The Ministry's own Admin, reached through provisioning rather than through a
    // fixture that hand-links a Person to somebody's account. That link is the whole
    // of what makes this case real: see `docs/adr/0009-one-account-per-human.md`.
    const greaves = adminAsPerson(church)
    await completeIntake(church, greaves.personId, ['sms', 'contact_sharing'], 'pastor_link', {
      availability: slots('tuesday:19'),
    })

    const ada = await addPerson(church, 'Ada Rowe', {
      answers: { availability: slots('tuesday:19') },
    })

    const relationshipId = await createRelationship(church, 'one_to_one')
    await addMembership({
      ministry: church,
      relationshipId,
      kind: 'one_to_one',
      personId: greaves.personId,
      role: 'leader',
    })
    await addMembership({
      ministry: church,
      relationshipId,
      kind: 'one_to_one',
      personId: ada,
      role: 'participant',
    })

    const { cookie } = await signInAs(greaves)

    const roster = await getPage('/roster', cookie)
    expect(roster.response.status).toBe(200)
    expect(roster.html).toContain('Two Hats Chapel')

    const dashboard = await getPage('/relationships', cookie)
    expect(dashboard.response.status).toBe(200)
    expect(dashboard.html).toContain('Ada Rowe')
  })

  it('says so, rather than failing, for somebody who leads nothing', async () => {
    const church = await createMinistryWithAdmin('Nobody Leads Here')
    const nobody = await addPersonWithAccount(church, 'Sam Ellery', 'leader')

    const { cookie } = await signInAs(nobody)
    const { response, html } = await getPage('/relationships', cookie)

    // Nothing was revoked and nothing is broken: the query simply stops matching,
    // which is the point of deriving the surface rather than storing who is a Leader.
    expect(response.status).toBe(200)
    expect(html).toContain('not currently leading any relationships')
  })

  it('draws a co-Leader on the grid and lists them among who is in it', async () => {
    // `one_to_one_one_open_leader` binds one-to-ones to a single Leader and leaves
    // groups alone, so a co-led group is an ordinary shape. A co-Leader drawn
    // nowhere would be missing from *the name and phone number of everyone in it*,
    // and missing from the count of who a slot gathers -- which would have the page
    // report a time as working for everyone when one of the two Leaders cannot come.
    const church = await createMinistryWithAdmin('Two Leaders Chapel')
    const first = await addPersonWithAccount(church, 'Nadia Reyes', 'leader', {
      answers: { availability: slots('monday:12') },
    })
    const second = await addPersonWithAccount(church, 'Priya Raman', 'leader', {
      answers: { availability: slots('friday:18') },
    })
    const participant = await addPerson(church, 'Tom Barrow', {
      phone: '+15557778888',
      answers: { availability: slots('monday:12') },
    })

    const relationshipId = await createRelationship(church, 'group')
    for (const [personId, role] of [
      [first.personId, 'leader'],
      [second.personId, 'leader'],
      [participant, 'participant'],
    ] as const) {
      await addMembership({ ministry: church, relationshipId, kind: 'group', personId, role })
    }

    const { cookie } = await signInAs(first)
    const { html } = await getPage('/relationships', cookie)

    expect(html).toContain('Tom Barrow')
    expect(html).toContain('Priya Raman')
    expect(html).toContain('co-leader')
    expect(html).toContain('+15557778888')

    // Monday gathers Nadia and Tom but not Priya, so it is the best overlap and it
    // is not a time everyone can make -- and the page says both.
    expect(html).toContain('Monday 12pm')
    expect(html).toContain('no slot works for everyone including you')
  })
})
