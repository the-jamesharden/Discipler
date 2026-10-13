import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, weeks } from '~/domain/clock'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addMaterial,
  addPerson,
  assignMaterial,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  pairOneToOne,
  pauseRelationship,
  recordConsentDecision,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * The pair card (Pastor feedback, ticket 07) as an Admin reaches it: press a
 * card on the Overview, and the same page comes back at `?card=` with the pair
 * over it. Without script, because every part of it is a link or a form.
 *
 * The Concern's words show as it opens, and the reading is recorded exactly as
 * *Read the concern* records it. The contact details reach it through the
 * consent rule Nudge reads. Its actions are the routes Follow-Up posts to, and
 * each returns to the card.
 */

/**
 * The card's own markup: from the dialog to the end of the drawn page, short of
 * the scripts after it, which carry the whole page's data again.
 */
const cardIn = (html: string): string => {
  const start = html.indexOf('data-testid="pair-card"')
  if (start < 0) return ''
  const end = html.indexOf('<script', start)
  return html.slice(start, end < 0 ? undefined : end)
}

describe.skipIf(skipUnlessAppIsRunning)('the pair card', () => {
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

  const aMinistry = async (name: string) => {
    const ministry = await createMinistryWithAdmin(name, `Pastor of ${name}`)
    await pool.query(
      `update ministry set timezone = 'Europe/London', checkin_day = 1, checkin_hour = 20 where id = $1`,
      [ministry.id],
    )
    const serviceAt = (now: Date) =>
      createCommandService({ clock: createTestClock(now), ids, store, appBaseUrl: 'https://discipler.test' })
    const congregant = async (fullName: string, email?: string, goalOther?: string) => {
      const id = personId(
        await addPerson(ministry, fullName, { phone: aNumber(), ...(goalOther ? { answers: { goalOther } } : {}) }),
      )
      if (email) await pool.query(`update person set email = $1 where id = $2`, [email, id])
      return id
    }
    const replyAt = (now: Date, person: PersonId, body: string) =>
      serviceAt(now).execute({ type: 'sms.inbound', ministryId: ministry.id, personId: person, body })
    return {
      ministry,
      congregant,
      tickAt: (now: Date) => serviceAt(now).execute({ type: 'scheduled.tick', ministryId: ministry.id }),
      replyAt,
      pairedEarly: (leader: PersonId, participant: PersonId) => {
        const formedAt = new Date(firstWeek.getTime() - weeks(1))
        return pairOneToOne(ministry, leader, participant, { createdAt: formedAt, acceptedAt: formedAt })
      },
    }
  }

  it('opens from its card on the Overview, over the Overview, and closes back to it', async () => {
    const church = await aMinistry('Card Chapel')
    const { cookie } = await signIn(church.ministry)
    const leader = await church.congregant('Grace Lead', 'grace@example.com')
    const disciple = await church.congregant('Chloe Follow', 'chloe@example.com', 'learning to pray out loud')
    const relationship = await pairOneToOne(church.ministry, leader, disciple)
    const plan = await addMaterial(church.ministry, 'The Master Plan of Evangelism')
    await assignMaterial(relationship, plan, church.ministry.adminUserId)

    const overview = await getPage('/overview', cookie)
    expect(overview.html).toContain(`href="/overview?card=${relationship}"`)
    expect(overview.html).not.toContain('data-testid="pair-card"')

    const opened = await getPage(`/overview?card=${relationship}`, cookie)
    expect(opened.response.status).toBe(200)
    // Over the Overview, which is still drawn behind it.
    expect(opened.html).toContain('All relationships')
    expect(opened.html).toContain(`id="rel-${relationship}"`)
    const html = cardIn(opened.html)
    expect(html).toContain('One to one · paired')
    expect(html).toContain('Grace Lead and Chloe Follow')
    expect(html).toContain('<span class="pc-role">Discipler</span>')
    expect(html).toContain('<span class="pc-role">Disciple</span>')
    expect(html.indexOf('Grace Lead</div>')).toBeLessThan(html.indexOf('Chloe Follow</div>'))
    expect(html).toContain('mailto:grace@example.com')
    expect(html).toContain('Text Chloe')
    expect(html).toContain('25-34')
    // The goal as chosen, and the words typed after Other as typed.
    expect(html).toContain('Growing in the basics of faith')
    expect(html).toContain('Other: &quot;learning to pray out loud&quot;')
    expect(html).toContain('The Master Plan of Evangelism, since')
    expect(html).toContain('None answered yet')
    // Every way out is the Overview behind it.
    expect(html).toMatch(new RegExp(`class="modal-close"[^>]*href="/overview#rel-${relationship}"`))
    expect(html).toContain('End relationship…')
  })

  it('leaves out the contact details of somebody who has not agreed to share them, and says nothing', async () => {
    const church = await aMinistry('Private Chapel')
    const { cookie } = await signIn(church.ministry)
    const leader = await church.congregant('Paula Open', 'paula@example.com')
    const disciple = await church.congregant('Quinn Private', 'quinn@example.com')
    await recordConsentDecision(church.ministry, disciple, 'contact_sharing', false)
    const relationship = await pairOneToOne(church.ministry, leader, disciple)

    const { html } = await getPage(`/overview?card=${relationship}`, cookie)
    expect(html).toContain('paula@example.com')
    expect(html).not.toContain('quinn@example.com')
    expect(html).not.toContain('Text Quinn')
    const { rows } = await pool.query<{ phone: string }>(`select phone from person where id = $1`, [disciple])
    expect(html).not.toContain(rows[0]!.phone)
    expect(html).not.toMatch(/No phone|No email/)
  })

  it('names somebody Discipler on the pair they lead and Disciple on the pair they are in', async () => {
    const church = await aMinistry('Both Sides Chapel')
    const { cookie } = await signIn(church.ministry)
    const middle = await church.congregant('Mona Middle')
    const leads = await pairOneToOne(church.ministry, middle, await church.congregant('Dina Down'))
    const isIn = await pairOneToOne(church.ministry, await church.congregant('Uma Up'), middle)

    const card = cardIn((await getPage(`/overview?card=${leads}`, cookie)).html)
    expect(card).toMatch(/Mona Middle<\/div><span class="pc-role">Discipler/)
    expect(card).not.toContain('Uma Up')

    const other = cardIn((await getPage(`/overview?card=${isIn}`, cookie)).html)
    expect(other).toMatch(/Mona Middle<\/div><span class="pc-role">Disciple</)
    expect(other).not.toContain('Dina Down')
  })

  it('shows the Concern as it opens, records the reading, and resolves it back to the card', async () => {
    const church = await aMinistry('Worried Chapel')
    const { cookie } = await signIn(church.ministry)
    const leader = await church.congregant('Rachel Raise')
    const relationship = await church.pairedEarly(leader, await church.congregant('Emily Quiet'))
    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), leader, '1')
    await church.replyAt(minutesAfter(at(0), 2), leader, 'D')
    const words = 'Her father is in hospital and she has stopped sleeping.'
    await church.replyAt(minutesAfter(at(0), 3), leader, words)

    const { rows: raised } = await pool.query<{ id: string }>(
      `select id from concern where relationship_id = $1`,
      [relationship],
    )
    const concern = raised[0]!.id

    // The Overview itself never carries the words.
    expect((await getPage('/overview', cookie)).html).not.toContain(words)

    const { html } = await getPage(`/overview?card=${relationship}`, cookie)
    expect(html).toContain(words)
    expect(html).toContain('Concern · raised by Rachel Raise on Mon 24 Aug')
    expect(html).toContain('Read by Pastor of Worried Chapel at')
    expect(html).toContain('Resolve and clear this text')
    // The last answer says the meeting and the letter, never the words.
    expect(html).toContain('Mon 24 Aug · Met · D\u00a0concern')

    const { rows: readings } = await pool.query(
      `select viewed_by from concern_viewing where concern_id = $1`,
      [concern],
    )
    expect(readings.map((row) => row.viewed_by)).toEqual([church.ministry.adminUserId])
    const { rows: events } = await pool.query(
      `select 1 from ministry_event where type = 'concern.viewed' and subject_id = $1`,
      [concern],
    )
    expect(events).toHaveLength(1)

    // A second opening is a second reading, and the line does not name this
    // Admin's own earlier reading back to them.
    const again = (await getPage(`/overview?card=${relationship}`, cookie)).html
    expect(again).not.toContain('and before that')
    const { rows: twice } = await pool.query(`select 1 from concern_viewing where concern_id = $1`, [concern])
    expect(twice).toHaveLength(2)

    // Somebody else's reading is named: here one whose account has since gone,
    // which the record keeps with nobody against it.
    await pool.query(
      `insert into concern_viewing (ministry_id, concern_id, viewed_by, viewed_at) values ($1, $2, null, $3)`,
      [church.ministry.id, concern, minutesAfter(at(0), 30).toISOString()],
    )
    const third = (await getPage(`/overview?card=${relationship}`, cookie)).html
    expect(third).toContain('and before that by an Admin on Mon 24 Aug at 8:30pm')

    const resolved = await post('/follow-up/concern/resolve', cookie, {
      concernId: concern,
      back: `/overview?card=${relationship}`,
    })
    expect(resolved.location).toContain(`/overview?card=${relationship}&done=concern-resolved`)

    const after = (await getPage(`/overview?card=${relationship}&done=concern-resolved`, cookie)).html
    expect(after).toContain('Concern resolved and its words cleared.')
    expect(after).not.toContain(words)
    expect(after).not.toContain('Resolve and clear this text')
  })

  it('shows a stall with the condition that fired, in its own unit', async () => {
    const church = await aMinistry('Silent Card Chapel')
    const { cookie } = await signIn(church.ministry)
    const leader = await church.congregant('Mark Silent')
    const relationship = await church.pairedEarly(leader, await church.congregant('Jordan Waiting'))
    await church.tickAt(at(0))
    await church.tickAt(at(1))
    await church.tickAt(at(2))

    const { html } = await getPage(`/overview?card=${relationship}`, cookie)
    expect(html).toContain('Stalled · gone silent')
    expect(html).toMatch(/Mark Silent has stopped answering check-ins: <strong>\d+ days since last contact<\/strong>/)
  })

  it('shows an expired Pause with Resume, which returns to the card', async () => {
    const church = await aMinistry('Resting Chapel')
    const { cookie } = await signIn(church.ministry)
    const relationship = await church.pairedEarly(
      await church.congregant('Will Rest'),
      await church.congregant('Owen Rest'),
    )
    await pauseRelationship(church.ministry, relationship, 1, minutesAfter(at(0), -60))
    await church.tickAt(at(1))

    const { html } = await getPage(`/overview?card=${relationship}`, cookie)
    expect(html).toContain('Pause expired')
    expect(html).toContain('Resume relationship')

    const resumed = await post('/follow-up/relationship/resume', cookie, {
      relationshipId: relationship,
      back: `/overview?card=${relationship}`,
    })
    expect(resumed.location).toContain(`/overview?card=${relationship}&done=resumed`)
    // The item stays on Follow-Up, where an Admin resolves it; the card has
    // nothing left to offer for it.
    const after = cardIn((await getPage(`/overview?card=${relationship}`, cookie)).html)
    expect(after).toContain('data-testid="pair-card"')
    expect(after).not.toContain('Pause expired')
  })

  it('ends the relationship through the existing step, and lands on the Overview without it', async () => {
    const church = await aMinistry('Ending Chapel')
    const { cookie } = await signIn(church.ministry)
    const relationship = await pairOneToOne(
      church.ministry,
      await church.congregant('Ed Ender'),
      await church.congregant('Fay Finished'),
    )
    const back = `/overview?card=${relationship}`

    const refused = await post('/follow-up/relationship/end', cookie, { relationshipId: relationship, back })
    expect(refused.location).toContain(`${back}&error=ending.outcome_not_recognised`)

    const ended = await post('/follow-up/relationship/end', cookie, {
      relationshipId: relationship,
      back,
      outcome: 'completed',
      reason: 'They finished the book together.',
    })
    expect(ended.location).toContain(`${back}&done=ended`)

    const { response, html } = await getPage(`${back}&done=ended`, cookie)
    expect(response.status).toBe(200)
    expect(html).not.toContain('data-testid="pair-card"')
    expect(html).toContain('Relationship ended.')
  })

  it('returns only to a card, never to an address a form was given', async () => {
    const church = await aMinistry('Strict Chapel')
    const { cookie } = await signIn(church.ministry)
    const relationship = await pairOneToOne(
      church.ministry,
      await church.congregant('Sal Strict'),
      await church.congregant('Tia Strict'),
    )
    const elsewhere = await post('/follow-up/relationship/end', cookie, {
      relationshipId: relationship,
      back: 'https://example.com/overview?card=x',
    })
    expect(elsewhere.location).toMatch(/\/follow-up\?error=/)
  })

  it('opens a 1:2 pair with both Disciples, and a Group of the same three in its group form', async () => {
    const church = await aMinistry('Shapes Chapel')
    const { cookie } = await signIn(church.ministry)
    const pair = await formGroup(church.ministry, {
      name: null,
      declaredGender: 'female',
      leader: { name: 'Claire Two', gender: 'female' },
      disciples: [
        { name: 'Ana Two', gender: 'female' },
        { name: 'Beth Two', gender: 'female' },
      ],
    })
    const group = await formGroup(church.ministry, {
      name: 'Thursday Women',
      declaredGender: 'female',
      leader: { name: 'Gina Group', gender: 'female' },
      disciples: [
        { name: 'Hana Group', gender: 'female' },
        { name: 'Ivy Group', gender: 'female' },
      ],
    })

    const overview = (await getPage('/overview', cookie)).html
    expect(overview).toContain(`href="/overview?card=${pair.id}"`)
    expect(overview).toContain(`href="/overview?card=${group.id}"`)

    const { html } = await getPage(`/overview?card=${pair.id}`, cookie)
    expect(html).toContain('1:2 pair · paired')
    expect(html).toContain('Claire Two, Ana Two and Beth Two')
    expect(cardIn(html)).not.toContain('pc-member')

    // The name is what tells them apart (ADR-0004), not the kind they share.
    const theGroup = cardIn((await getPage(`/overview?card=${group.id}`, cookie)).html)
    expect(theGroup).toContain('Group · women · formed')
    expect(theGroup).toContain('Thursday Women')
    expect(theGroup).toContain('Disciples · 2')
  })

  it('opens nothing for an address that names no card of this Ministry', async () => {
    const church = await aMinistry('Own Chapel')
    const neighbour = await aMinistry('Neighbour Chapel')
    const { cookie } = await signIn(church.ministry)
    const theirs = await pairOneToOne(
      neighbour.ministry,
      await neighbour.congregant('Nell Next'),
      await neighbour.congregant('Ned Next'),
    )

    for (const path of [`/overview?card=${theirs}`, '/overview?card=not-an-id', `/overview?card=${crypto.randomUUID()}`]) {
      const { response, html } = await getPage(path, cookie)
      expect(response.status).toBe(200)
      expect(html).not.toContain('data-testid="pair-card"')
      expect(html).not.toContain('Nell Next')
    }
  })
})
