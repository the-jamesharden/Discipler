import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, days, weeks } from '~/domain/clock'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  pauseRelationship,
  recordConsentDecision,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import { cardIn, itemAbout, openTheCardAbout, words } from '../support/follow-up'

/**
 * Follow-Up's items as buttons (Pastor feedback, ticket 10), as an Admin
 * reaches them: each item on the list is one link and nothing else to press,
 * and pressing it opens the pair card, or an item's own card, over the list at
 * `?card=`, with the item's actions in its band and *What has happened* under
 * the facts. Without script, because every part of it is a link or a form.
 */

describe.skipIf(skipUnlessAppIsRunning)('Follow-Up items are buttons', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // Monday 24 August 2026, 8pm in London.
  const firstWeek = new Date('2026-08-24T19:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const at = (week: number) => new Date(firstWeek.getTime() + weeks(week))
  const minutesAfter = (instant: Date, n: number) => new Date(instant.getTime() + n * 60_000)

  beforeAll(async () => {
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

  const post = async (path: string, cookie: string, body: Record<string, string>) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  /** The hidden fields of the one form on the card that posts to `action`. */
  const formOn = (card: string, action: string): Record<string, string> => {
    const form = card.match(new RegExp(`<form[^>]*action="${action}"[^>]*>(.*?)</form>`, 's'))?.[1]
    expect(form, `the card offers no form to ${action}`).toBeDefined()
    return Object.fromEntries(
      [...form!.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map((field) => [field[1]!, field[2]!]),
    )
  }

  const aMinistry = async (name: string) => {
    const ministry = await createMinistryWithAdmin(name, `Pastor of ${name}`)
    await pool.query(
      `update ministry set timezone = 'Europe/London', checkin_day = 1, checkin_hour = 20 where id = $1`,
      [ministry.id],
    )
    const serviceAt = (now: Date) =>
      createCommandService({ clock: createTestClock(now), ids, store, appBaseUrl: 'https://discipler.test' })
    const congregant = async (fullName: string, email?: string) => {
      const id = personId(await addPerson(ministry, fullName, { phone: aNumber() }))
      if (email) await pool.query(`update person set email = $1 where id = $2`, [email, id])
      return id
    }
    return {
      ministry,
      serviceAt,
      congregant,
      tickAt: (now: Date) => serviceAt(now).execute({ type: 'scheduled.tick', ministryId: ministry.id }),
      replyAt: (now: Date, person: PersonId, body: string) =>
        serviceAt(now).execute({ type: 'sms.inbound', ministryId: ministry.id, personId: person, body }),
      pairedEarly: (leader: PersonId, participant: PersonId) => {
        const formedAt = new Date(firstWeek.getTime() - weeks(1))
        return pairOneToOne(ministry, leader, participant, { createdAt: formedAt, acceptedAt: formedAt })
      },
      keyword: (person: PersonId, word = 'HELP') =>
        store.transact(ministry.id, (unit) =>
          unit.raiseFollowUp({
            ministryId: ministry.id,
            kind: 'participant_keyword',
            keyword: word,
            relationshipId: null,
            personId: person,
            raisedAt: new Date(),
          }),
        ),
    }
  }

  it('lists each item as one button: its tag, the names, one line, how long, an arrow, and nothing else to press', async () => {
    const church = await aMinistry('Buttons Chapel')
    const { cookie } = await signIn(church.ministry)
    // A Concern, a stall, an expired Pause and a keyword: one of each source.
    const rachel = await church.congregant('Rachel Raise')
    await church.pairedEarly(rachel, await church.congregant('Emily Quiet'))
    const mark = await church.congregant('Mark Silent')
    await church.pairedEarly(mark, await church.congregant('Jordan Waiting'))
    const resting = await church.pairedEarly(await church.congregant('Will Rest'), await church.congregant('Owen Rest'))
    await pauseRelationship(church.ministry, resting, 1, minutesAfter(at(0), -60))
    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), rachel, '1')
    await church.replyAt(minutesAfter(at(0), 2), rachel, 'D')
    const said = 'Her father is in hospital and she has stopped sleeping.'
    await church.replyAt(minutesAfter(at(0), 3), rachel, said)
    // Rachel goes on answering, so her pair is the Concern alone and not a stall too.
    for (const week of [1, 2]) {
      await church.tickAt(at(week))
      await church.replyAt(minutesAfter(at(week), 1), rachel, '1')
      await church.replyAt(minutesAfter(at(week), 2), rachel, 'B')
    }
    await church.keyword(await church.congregant('Liam Okafor'))

    const { html } = await getPage('/follow-up', cookie)
    expect(html).not.toContain(said)
    expect(html).not.toContain('End relationship')
    expect(html).not.toContain('See contact details')
    expect(html).not.toContain('Read the concern')
    expect(html).not.toContain('data-testid="pair-card"')

    for (const [name, tag] of [
      ['Rachel Raise', 'Concern'],
      ['Mark Silent', 'Stalled'],
      ['Will Rest', 'Pause expired'],
      ['Liam Okafor', 'Texted a keyword'],
    ] as const) {
      const item = itemAbout(html, name)
      expect(item, name).toBeDefined()
      // One link, and inside it nothing else to press.
      expect(item!.match(/<a /g), name).toHaveLength(1)
      expect(item, name).toMatch(/<a [^>]*href="\/follow-up\?card=[0-9a-f-]{36}"/)
      expect(item, name).not.toMatch(/<form|<button|<select/)
      expect(item, name).toContain(`>${tag}</span>`)
      expect(item, name).toContain('class="fu-line"')
      expect(item, name).toMatch(/class="fu-age">[^<]+</)
      expect(item, name).toContain('class="chev"')
    }
    expect(itemAbout(html, 'Mark Silent')).toContain('Mark Silent → Jordan Waiting')
    expect(itemAbout(html, 'Mark Silent')).toMatch(/Gone silent: \d+ days since last contact\./)
  })

  it('opens a Concern on the pair card with its words, records the reading, and says what has happened', async () => {
    const church = await aMinistry('Worried Follow Chapel')
    const { cookie } = await signIn(church.ministry)
    const rachel = await church.congregant('Rachel Raise')
    const relationship = await church.pairedEarly(rachel, await church.congregant('Emily Quiet'))
    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), rachel, '1')
    await church.replyAt(minutesAfter(at(0), 2), rachel, 'D')
    const said = 'Her father is in hospital and she has stopped sleeping.'
    await church.replyAt(minutesAfter(at(0), 3), rachel, said)

    const { address, card } = await openTheCardAbout(cookie, 'Rachel Raise')
    expect(address).toBe(`/follow-up?card=${relationship}`)
    expect(card).toContain('Rachel Raise and Emily Quiet')
    expect(card).toContain(said)
    expect(card).toContain('Resolve and clear this text')
    expect(card).toContain('What has happened')
    expect(card).toContain('Rachel Raise raised a concern in the weekly check-in.')
    expect(card).toContain('Check-in answered: D concern.')
    expect(card).toMatch(/Pastor of Worried Follow Chapel read the concern at \d{1,2}:\d{2}[ap]m\./)
    expect(card).toContain('End relationship…')

    const { rows: concerns } = await pool.query<{ id: string }>(
      `select id from concern where relationship_id = $1`,
      [relationship],
    )
    const { rows: readings } = await pool.query(`select viewed_by from concern_viewing where concern_id = $1`, [
      concerns[0]!.id,
    ])
    expect(readings.map((row) => row.viewed_by)).toEqual([church.ministry.adminUserId])

    // Resolving from the card returns to it, and the words are gone for good:
    // the history names the Concern and who resolved it, never what it said.
    const resolved = await post('/follow-up/concern/resolve', cookie, formOn(card, '/follow-up/concern/resolve'))
    expect(resolved.location).toContain(`/follow-up?card=${relationship}&done=concern-resolved`)
    const after = cardIn((await getPage(`/follow-up?card=${relationship}&done=concern-resolved`, cookie)).html)
    expect(after).toContain('Concern resolved and its words cleared.')
    expect(after).not.toContain(said)
    expect(after).toMatch(
      /Concern raised by Rachel Raise, resolved by Pastor of Worried Follow Chapel today and its words cleared\./,
    )
  })

  it('opens a stall with the condition that fired, the silent check-ins, and nothing to resolve', async () => {
    const church = await aMinistry('Silent Follow Chapel')
    const { cookie } = await signIn(church.ministry)
    const mark = await church.congregant('Mark Silent')
    await church.pairedEarly(mark, await church.congregant('Jordan Waiting'))
    await church.tickAt(at(0))
    await church.tickAt(at(1))
    await church.tickAt(at(2))

    const { card } = await openTheCardAbout(cookie, 'Mark Silent')
    expect(card).toContain('Stalled · gone silent')
    expect(card).toContain('Stalled: 2 check-ins in a row went unanswered.')
    expect(card.match(/Check-in not answered\./g)?.length).toBeGreaterThanOrEqual(2)
    expect(card).not.toContain('action="/follow-up/resolve"')
    expect(card).toContain('End relationship…')
  })

  it('puts Resume and Resolve in an expired Pause’s band, each returning to the card', async () => {
    const church = await aMinistry('Resting Follow Chapel')
    const { cookie } = await signIn(church.ministry)
    const relationship = await church.pairedEarly(
      await church.congregant('Will Rest'),
      await church.congregant('Owen Rest'),
    )
    await pauseRelationship(church.ministry, relationship, 1, minutesAfter(at(0), -60))
    await church.tickAt(at(1))

    const { address, card } = await openTheCardAbout(cookie, 'Will Rest')
    expect(card).toContain('Pause expired')
    expect(card).toContain('Paused for 1 week; that period has elapsed and the relationship has not resumed. Still paused, and nobody has moved.')
    expect(card).toContain('>Resume relationship</button>')
    expect(card).toContain('>Resolve</button>')
    // One band for it, not the pair card's own beside the item's.
    expect(card.match(/Pause expired/g)).toHaveLength(1)
    expect(card).toContain('Raised: Paused for 1 week')

    const resumed = await post('/follow-up/relationship/resume', cookie, formOn(card, '/follow-up/relationship/resume'))
    expect(resumed.location).toContain(`${address}&done=resumed`)
    // Resumed, the item stands until it is resolved, and Resume has gone.
    const standing = cardIn((await getPage(address, cookie)).html)
    expect(standing).not.toContain('Resume relationship')
    const resolve = formOn(standing, '/follow-up/resolve')
    expect(resolve.back).toBe(address)

    const resolved = await post('/follow-up/resolve', cookie, resolve)
    expect(resolved.location).toContain(`${address}&done=resolved`)
    const after = cardIn((await getPage(`${address}&done=resolved`, cookie)).html)
    expect(after).toContain('Item cleared.')
    expect(after).toContain('Pause expired, resolved by Pastor of Resting Follow Chapel today.')
    expect(after).not.toContain('action="/follow-up/resolve"')
  })

  it('puts Cancel relationship in the band of one nobody accepted, with no End, and closes when it is cancelled', async () => {
    const church = await aMinistry('Waiting Follow Chapel')
    const { cookie } = await signIn(church.ministry)
    const leader = await church.congregant('Isaac Prince')
    const participant = await church.congregant('Julia North')
    await completeIntake(church.ministry, leader)
    await completeIntake(church.ministry, participant)
    const formedAt = new Date(Date.now() - days(6))
    await church.serviceAt(formedAt).execute({
      type: 'relationship.create',
      ministryId: church.ministry.id,
      leaderIds: [leader],
      participantIds: [participant],
    })
    await church.tickAt(new Date(formedAt.getTime() + days(5)))

    const { address, card, item } = await openTheCardAbout(cookie, 'Isaac Prince')
    expect(item).toContain('Isaac Prince → Julia North')
    expect(card).toContain('Awaiting acceptance')
    expect(card).toContain('>Cancel relationship</button>')
    expect(card).not.toContain('End relationship')

    const cancelled = await post('/follow-up/relationship/cancel', cookie, formOn(card, '/follow-up/relationship/cancel'))
    expect(cancelled.location).toContain(`${address}&done=cancelled`)
    const { html } = await getPage(`${address}&done=cancelled`, cookie)
    expect(html).not.toContain('data-testid="pair-card"')
    expect(words(html)).toContain('Relationship cancelled.')
  })

  it('opens an item about a Person alone on a card of its own, with their details by consent, recording nothing', async () => {
    const church = await aMinistry('Keyword Follow Chapel')
    const { cookie } = await signIn(church.ministry)
    const liam = await church.congregant('Liam Okafor', 'liam@example.com')
    await church.keyword(liam)
    const { rows: numbers } = await pool.query<{ phone: string }>(`select phone from person where id = $1`, [liam])
    const { rows: before } = await pool.query(`select 1 from ministry_event where ministry_id = $1`, [church.ministry.id])

    const { address, card } = await openTheCardAbout(cookie, 'Liam Okafor')
    const { rows: item } = await pool.query<{ id: string }>(
      `select id from follow_up_item where person_id = $1 and resolved_at is null`,
      [liam],
    )
    expect(address).toBe(`/follow-up?card=${item[0]!.id}`)
    expect(card.replace(/<[^>]*>/g, '')).toContain('Follow-Up · raised')
    expect(card).toContain('Liam Okafor texted HELP. Nothing was changed on their behalf; it is yours to answer.')
    expect(card).toContain(`tel:${numbers[0]!.phone}`)
    expect(card).toContain('Text Liam')
    expect(card).toContain('mailto:liam@example.com')
    expect(card).toContain('25-34')
    expect(card).toContain('Raised: Liam Okafor texted HELP.')
    expect(card).not.toContain('End relationship')
    // Opening it is the reveal, and Nudge records nothing.
    const { rows: after } = await pool.query(`select 1 from ministry_event where ministry_id = $1`, [church.ministry.id])
    expect(after).toHaveLength(before.length)

    // Somebody who has not agreed to share them: left out, and not announced.
    const nia = await church.congregant('Nia Bello', 'nia@example.com')
    await recordConsentDecision(church.ministry, nia, 'contact_sharing', false)
    await church.keyword(nia)
    const withheld = (await openTheCardAbout(cookie, 'Nia Bello')).card
    const { rows: hers } = await pool.query<{ phone: string }>(`select phone from person where id = $1`, [nia])
    expect(withheld).not.toContain(hers[0]!.phone)
    expect(withheld).not.toContain('nia@example.com')
    expect(withheld).not.toContain('Text Nia')
    expect(withheld).not.toMatch(/No phone|No email|not agreed/)

    // Resolved from its own card, the card has nothing left to show and the list says so.
    const resolved = await post('/follow-up/resolve', cookie, formOn(card, '/follow-up/resolve'))
    expect(resolved.location).toContain(`${address}&done=resolved`)
    const { html } = await getPage(`${address}&done=resolved`, cookie)
    expect(html).not.toContain('data-testid="pair-card"')
    expect(words(html)).toContain('Item cleared.')
    expect(itemAbout(html, 'Liam Okafor')).toBeUndefined()
  })

  it('returns only to a card, on any of the three tabs, never to an address a form was given', async () => {
    const church = await aMinistry('Strict Follow Chapel')
    const { cookie } = await signIn(church.ministry)
    const relationship = await pairOneToOne(
      church.ministry,
      await church.congregant('Sal Strict'),
      await church.congregant('Tia Strict'),
    )
    for (const back of [`/follow-up?card=${relationship}`, `/check-ins?card=${relationship}`]) {
      const refused = await post('/follow-up/relationship/end', cookie, { relationshipId: relationship, back })
      expect(refused.location).toContain(`${back}&error=ending.outcome_not_recognised`)
    }
    for (const back of [`https://example.com/follow-up?card=${relationship}`, `/roster?card=${relationship}`]) {
      const elsewhere = await post('/follow-up/relationship/end', cookie, { relationshipId: relationship, back })
      expect(elsewhere.location).toMatch(/\/follow-up\?error=/)
    }
  })

  it('opens nothing for an address that names no card of this Ministry', async () => {
    const church = await aMinistry('Own Follow Chapel')
    const neighbour = await aMinistry('Neighbour Follow Chapel')
    const { cookie } = await signIn(church.ministry)
    const nell = await neighbour.congregant('Nell Next')
    await neighbour.keyword(nell)
    const theirs = await pairOneToOne(neighbour.ministry, await neighbour.congregant('Ned Next'), nell)
    const { rows } = await pool.query<{ id: string }>(`select id from follow_up_item where person_id = $1`, [nell])

    for (const path of [
      `/follow-up?card=${theirs}`,
      `/follow-up?card=${rows[0]!.id}`,
      '/follow-up?card=not-an-id',
      `/follow-up?card=${crypto.randomUUID()}`,
    ]) {
      const { response, html } = await getPage(path, cookie)
      expect(response.status).toBe(200)
      expect(html).not.toContain('data-testid="pair-card"')
      expect(html).not.toContain('Nell Next')
    }
  })
})
