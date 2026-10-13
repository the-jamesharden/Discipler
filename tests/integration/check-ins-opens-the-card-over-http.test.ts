import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, weeks } from '~/domain/clock'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  pairOneToOne,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * Check-Ins opens the card (Pastor feedback, ticket 09) as an Admin reaches it:
 * every row in the four columns, D concern included, is a link to the same page
 * at `?card=`, which comes back with the pair card over the tab and this week's
 * answer in its band. Without script, as the Overview's card is.
 *
 * The tab is *this* week by the server's own clock, which a test cannot pin. So
 * the conversations here are opened a few minutes ago, at a cadence set to the
 * hour they open in, in a zone where that hour is one the cadence may take:
 * never a date that can pass.
 */

/** The card's own markup, short of the scripts after it, which carry the page's data again. */
const cardIn = (html: string): string => {
  const start = html.indexOf('data-testid="pair-card"')
  if (start < 0) return ''
  const end = html.indexOf('<script', start)
  return html.slice(start, end < 0 ? undefined : end)
}

/** Every band label on the card, as it reads: its parts are drawn apart so a narrow card wraps between them. */
const bandsOf = (html: string): string[] =>
  [...html.matchAll(/<p class="pc-band-label">(.*?)<\/p>/g)].map((match) => match[1]!.replace(/<[^>]*>/g, ''))

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Zones far enough apart that one of them is always inside the cadence's waking hours. */
const ZONES = [
  'Pacific/Honolulu',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Pacific/Auckland',
]

describe.skipIf(skipUnlessAppIsRunning)('Check-Ins opens the card', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const ids: IdSource = { next: () => crypto.randomUUID() }
  const secondsAfter = (instant: Date, n: number) => new Date(instant.getTime() + n * 1_000)

  beforeAll(async () => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () => `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const post = async (path: string, cookie: string, body: Record<string, string>) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  /**
   * A Ministry whose check-in opened five minutes ago, at a cadence set to that
   * day and hour, in a zone where it is a waking hour, as the cadence must be
   * (8am to 9pm). A week turns over at midnight, so five minutes ago at a waking
   * hour is always this week, wherever the server is.
   */
  const aMinistryAnsweringThisWeek = async (name: string) => {
    const opened = new Date(Date.now() - 5 * 60_000)
    const local = (zone: string) => {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
          .formatToParts(opened)
          .map((part) => [part.type, part.value]),
      )
      return { day: WEEKDAYS.indexOf(parts.weekday!), hour: Number(parts.hour) }
    }
    const zone = ZONES.find((each) => local(each).hour >= 8 && local(each).hour <= 21)!
    const ministry = await createMinistryWithAdmin(name, `Pastor of ${name}`)
    await pool.query(`update ministry set timezone = $2, checkin_day = $3, checkin_hour = $4 where id = $1`, [
      ministry.id,
      zone,
      local(zone).day,
      local(zone).hour,
    ])
    const formedAt = new Date(opened.getTime() - weeks(1))
    const serviceAt = (instant: Date) =>
      createCommandService({ clock: createTestClock(instant), ids, store, appBaseUrl: 'https://discipler.test' })
    const congregant = (fullName: string) => addPerson(ministry, fullName, { phone: aNumber() }).then(personId)
    let replies = 0
    const reply = (person: PersonId, body: string) =>
      serviceAt(secondsAfter(opened, ++replies)).execute({
        type: 'sms.inbound',
        ministryId: ministry.id,
        personId: person,
        body,
      })

    return {
      ministry,
      opened,
      reply,
      tick: () => serviceAt(opened).execute({ type: 'scheduled.tick', ministryId: ministry.id }),
      paired: async (leaderName: string, discipleName: string) => {
        const leader = await congregant(leaderName)
        const relationship = await pairOneToOne(ministry, leader, await congregant(discipleName), {
          createdAt: formedAt,
          acceptedAt: formedAt,
          joinedAt: formedAt,
        })
        return { leader, relationship }
      },
      group: async (groupName: string, leaderName: string) => {
        const group = await formGroup(ministry, {
          name: groupName,
          declaredGender: 'female',
          leader: { name: leaderName, gender: 'female', phone: aNumber() },
          disciples: [
            { name: 'Ava North', gender: 'female' },
            { name: 'Mia South', gender: 'female' },
          ],
          createdAt: formedAt,
          acceptedAt: formedAt,
        })
        return { leader: personId(group.leader), relationship: group.id }
      },
    }
  }

  /** One Ministry with an answer of each letter, a Group among them, and a Concern's words. */
  const aWeekOfEachLetter = async (name: string) => {
    const church = await aMinistryAnsweringThisWeek(name)
    const a = await church.group(`${name} Women`, 'Lauren Price')
    const b = await church.paired('Grace Lee', 'Rachel Adams')
    const c = await church.paired('Sarah Mitchell', 'Hannah Brooks')
    const d = await church.paired('Rachel Raise', 'Emily Quiet')
    await church.tick()
    for (const [pair, letter] of [
      [a, 'A'],
      [b, 'B'],
      [c, 'C'],
      [d, 'D'],
    ] as const) {
      await church.reply(pair.leader, '1')
      await church.reply(pair.leader, letter)
    }
    const words = 'Her father is in hospital and she has stopped sleeping.'
    await church.reply(d.leader, words)
    const { rows } = await pool.query<{ id: string }>(`select id from concern where relationship_id = $1`, [
      d.relationship,
    ])
    return { church, a, b, c, d, words, concern: rows[0]!.id }
  }

  it('lists every answer by name, D concern included, each row opening its card, and never the words', async () => {
    const { church, a, b, c, d, words } = await aWeekOfEachLetter('Lettered Chapel')
    const { cookie } = await signIn(church.ministry)

    const { response, html } = await getPage('/check-ins', cookie)
    expect(response.status).toBe(200)
    for (const pair of [a, b, c, d]) expect(html).toContain(`href="/check-ins?card=${pair.relationship}"`)
    expect(html).toContain('Rachel Raise → Emily Quiet')
    // Marked as still carrying its Concern, and nothing of what was said.
    expect(html).toMatch(new RegExp(`id="ci-${d.relationship}" class="ci-card d"`))
    expect(html).toMatch(new RegExp(`id="ci-${b.relationship}" class="ci-card"`))
    expect(html).not.toContain(words)
    expect(html).not.toContain('Go to Follow-Up')
    expect(html).not.toContain('data-testid="pair-card"')
  })

  it("opens the card over the tab with this week's answer in its band, and closes back to the row", async () => {
    const { church, a, b } = await aWeekOfEachLetter('Banded Chapel')
    const { cookie } = await signIn(church.ministry)

    const opened = await getPage(`/check-ins?card=${b.relationship}`, cookie)
    expect(opened.response.status).toBe(200)
    // Over Check-Ins, which is still drawn behind it.
    expect(opened.html).toContain(`id="ci-${b.relationship}"`)
    const card = cardIn(opened.html)
    expect(card).toContain('Grace Lee and Rachel Adams')
    expect(bandsOf(card)).toHaveLength(1)
    expect(bandsOf(card)[0]).toMatch(/^This week · Met · B good · answered \d{1,2}:\d{2}(am|pm)$/)
    expect(card).toContain('class="pc-band answer-b"')
    // The band says the answer; the facts do not say it again.
    expect(card).not.toContain('Last check-in')
    expect(card).toMatch(new RegExp(`class="modal-close"[^>]*href="/check-ins#ci-${b.relationship}"`))

    // A Group opens the same card in its group form.
    const group = cardIn((await getPage(`/check-ins?card=${a.relationship}`, cookie)).html)
    expect(group).toContain('Banded Chapel Women')
    expect(group).toContain('Disciples · 2')
    expect(bandsOf(group)[0]).toMatch(/^This week · Met · A outstanding · answered /)
  })

  it("shows this week's Concern in the same band as it opens, records the reading, and resolves it on the tab", async () => {
    const { church, d, words, concern } = await aWeekOfEachLetter('Concerned Card Chapel')
    const { cookie } = await signIn(church.ministry)

    const card = cardIn((await getPage(`/check-ins?card=${d.relationship}`, cookie)).html)
    expect(card).toContain(words)
    expect(bandsOf(card)).toHaveLength(1)
    expect(bandsOf(card)[0]).toMatch(/^This week · Met · D concern · answered /)
    expect(card).toContain('Read by Pastor of Concerned Card Chapel at')
    expect(card).toContain('Resolve and clear this text')

    // Recorded exactly as on the Overview: one viewing and its history event.
    const { rows: readings } = await pool.query(`select viewed_by from concern_viewing where concern_id = $1`, [
      concern,
    ])
    expect(readings.map((row) => row.viewed_by)).toEqual([church.ministry.adminUserId])
    const { rows: events } = await pool.query(
      `select 1 from ministry_event where type = 'concern.viewed' and subject_id = $1`,
      [concern],
    )
    expect(events).toHaveLength(1)

    const back = `/check-ins?card=${d.relationship}`
    const resolved = await post('/follow-up/concern/resolve', cookie, { concernId: concern, back })
    expect(resolved.location).toContain(`${back}&done=concern-resolved`)

    const after = await getPage(`${back}&done=concern-resolved`, cookie)
    const afterCard = cardIn(after.html)
    expect(afterCard).toContain('Concern resolved and its words cleared.')
    expect(after.html).not.toContain(words)
    expect(afterCard).not.toContain('Resolve and clear this text')
    // What was answered stands; the Concern is gone from the tab and from Follow-Up.
    expect(bandsOf(afterCard)[0]).toMatch(/^This week · Met · D concern · answered /)
    expect(after.html).toContain('<div class="ci-stat-val concern">0</div>')
    expect(after.html).toMatch(new RegExp(`id="ci-${d.relationship}" class="ci-card"`))
    expect((await getPage('/follow-up', cookie)).html).not.toContain('Read the concern')
  })

  it('ends a relationship from the card and says so on the tab, where the card has gone', async () => {
    const { church, c } = await aWeekOfEachLetter('Ending Card Chapel')
    const { cookie } = await signIn(church.ministry)

    const back = `/check-ins?card=${c.relationship}`
    const ended = await post('/follow-up/relationship/end', cookie, {
      relationshipId: c.relationship,
      outcome: 'completed',
      reason: 'Finished the reading plan together and closed well.',
      back,
    })
    expect(ended.location).toContain(`${back}&done=ended`)

    const { response, html } = await getPage(`${back}&done=ended`, cookie)
    expect(response.status).toBe(200)
    expect(html).toContain('Relationship ended.')
    expect(html).not.toContain('data-testid="pair-card"')
  })
})
