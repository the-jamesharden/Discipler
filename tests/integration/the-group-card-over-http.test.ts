import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, weeks } from '~/domain/clock'
import { personId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import { displayPhone } from '../../app/roster/copy'
import {
  addMembership,
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  recordConsentDecision,
  type GroupPersonSeed,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * The group card (Pastor feedback, ticket 08) as an Admin reaches it: press a
 * Group on the Overview, and the pair card opens over it in its group form. The
 * Group's name, the gender it declared and since when, the leader in full, and a
 * row per Disciple with their name and phone that opens, without script, to the
 * rest. The band, the facts and the foot are the pair card's, and so are the
 * routes its forms post to.
 */

/** The card's own markup, short of the scripts after it, which carry the whole page's data again. */
const cardIn = (html: string): string => {
  const start = html.indexOf('data-testid="pair-card"')
  if (start < 0) return ''
  const end = html.indexOf('<script', start)
  return html.slice(start, end < 0 ? undefined : end)
}

/** One Disciple's row, from its opening tag to the next row or the end of the list. */
const rowOf = (card: string, fullName: string): string => {
  const name = card.indexOf(`<span class="pc-name">${fullName}</span>`)
  if (name < 0) return ''
  const start = card.lastIndexOf('class="pc-member"', name)
  const next = card.indexOf('class="pc-member"', name)
  const end = next < 0 ? card.indexOf('class="pc-facts"', name) : next
  return card.slice(start, end)
}

describe.skipIf(skipUnlessAppIsRunning)('the group card', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // Monday 24 August 2026, 8pm in London.
  const firstWeek = new Date('2026-08-24T19:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const at = (week: number) => new Date(firstWeek.getTime() + weeks(week))
  const minutesAfter = (instant: Date, n: number) => new Date(instant.getTime() + n * 60_000)
  const formedEarly = new Date(firstWeek.getTime() - weeks(1))

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

  const aMinistry = async (name: string) => {
    const ministry = await createMinistryWithAdmin(name, `Pastor of ${name}`)
    await pool.query(
      `update ministry set timezone = 'Europe/London', checkin_day = 1, checkin_hour = 20 where id = $1`,
      [ministry.id],
    )
    const serviceAt = (now: Date) =>
      createCommandService({ clock: createTestClock(now), ids, store, appBaseUrl: 'https://discipler.test' })
    return {
      ministry,
      tickAt: (now: Date) => serviceAt(now).execute({ type: 'scheduled.tick', ministryId: ministry.id }),
      replyAt: (now: Date, person: string, body: string) =>
        serviceAt(now).execute({ type: 'sms.inbound', ministryId: ministry.id, personId: personId(person), body }),
      emailOf: (person: string, email: string) => pool.query(`update person set email = $1 where id = $2`, [email, person]),
      phoneOf: async (person: string) =>
        (await pool.query<{ phone: string }>(`select phone from person where id = $1`, [person])).rows[0]!.phone,
    }
  }

  const woman = (name: string, phone: string | null = aNumber()): GroupPersonSeed => ({
    name,
    gender: 'female',
    ...(phone ? { phone } : {}),
  })

  it('opens from its card on the Overview, over the Overview, in its group form', async () => {
    const church = await aMinistry('Group Card Chapel')
    const { cookie } = await signIn(church.ministry)
    const group = await formGroup(church.ministry, {
      name: 'Tuesday Women',
      declaredGender: 'female',
      leader: woman('Lauren Lead'),
      disciples: [woman('Zoe Quiet', null), woman('Ava Row'), woman('Mia Row')],
    })
    const [, ava, mia] = group.disciples as [string, string, string]
    await church.emailOf(group.leader, 'lauren@example.com')
    await church.emailOf(ava, 'ava@example.com')

    const overview = await getPage('/overview', cookie)
    expect(overview.html).toContain(`href="/overview?card=${group.id}"`)
    expect(overview.html).not.toContain('data-testid="pair-card"')

    const opened = await getPage(`/overview?card=${group.id}`, cookie)
    expect(opened.response.status).toBe(200)
    expect(opened.html).toContain('All relationships')
    const card = cardIn(opened.html)

    // The head: Group, the gender it declared and since when, its name, its state.
    expect(card).toContain('Group · women · formed')
    expect(card).toMatch(/<h2 id="pc-title" class="card-title">Tuesday Women<\/h2>/)
    expect(card).toContain('<span class="pill healthy">Healthy</span>')

    // The leader in full, as a person is on a pair.
    expect(card).toMatch(/Lauren Lead<\/div><span class="pc-role">Discipler<\/span>/)
    expect(card).toContain('mailto:lauren@example.com')
    expect(card).toContain(displayPhone(await church.phoneOf(group.leader)))
    expect(card).toContain('Text Lauren')

    // A row per Disciple, by name, each with their phone where there is one.
    expect(card).toContain('Disciples · 3')
    expect(card.match(/class="pc-member"/g)).toHaveLength(3)
    expect(card.indexOf('Ava Row')).toBeLessThan(card.indexOf('Mia Row'))
    expect(card.indexOf('Mia Row')).toBeLessThan(card.indexOf('Zoe Quiet'))
    expect(card).not.toContain('pc-role">Disciple<')

    const avaRow = rowOf(card, 'Ava Row')
    expect(avaRow).toMatch(/^class="pc-member"/)
    expect(avaRow).toContain(`<span class="pc-row-phone">${displayPhone(await church.phoneOf(ava))}</span>`)
    // It opens without script, closed until pressed, to how to reach her and what she said.
    expect(card).toMatch(/<details class="pc-member"><summary class="pc-member-row">/)
    expect(card).not.toMatch(/<details class="pc-member" open/)
    expect(avaRow).toContain('mailto:ava@example.com')
    expect(avaRow).toContain('Call Ava')
    expect(avaRow).toContain('Text Ava')
    expect(avaRow).toContain('25-34')
    expect(avaRow).toContain('Growing in the basics of faith')

    // A missing email or phone is left out, not announced.
    const miaRow = rowOf(card, 'Mia Row')
    expect(miaRow).toContain(displayPhone(await church.phoneOf(mia)))
    expect(miaRow).not.toContain('mailto:')
    const zoeRow = rowOf(card, 'Zoe Quiet')
    expect(zoeRow).not.toContain('pc-row-phone')
    expect(zoeRow).not.toContain('tel:')
    expect(card).not.toMatch(/No phone|No email/)

    // The facts and the foot are the pair card's.
    expect(card).toContain('None answered yet')
    expect(card).toContain('No material yet')
    expect(card).toMatch(new RegExp(`class="modal-close"[^>]*href="/overview#rel-${group.id}"`))
    expect(card).toContain('End relationship…')
  })

  it('says mixed for a Group that declared nothing, shows a co-leader in full, and keeps a private number off it', async () => {
    const church = await aMinistry('Mixed Card Chapel')
    const { cookie } = await signIn(church.ministry)
    const group = await formGroup(church.ministry, {
      name: 'Young Adults',
      declaredGender: null,
      leader: woman('Grace First'),
      disciples: [woman('Pat Private'), { name: 'Sam Open', gender: 'male', phone: aNumber() }],
    })
    const coLeader = await addPerson(church.ministry, 'Henry Second', {
      phone: aNumber(),
      answers: { gender: 'male' },
    })
    await addMembership({
      ministry: church.ministry,
      relationshipId: group.id,
      kind: 'group',
      personId: coLeader,
      role: 'leader',
    })
    const [pat] = group.disciples as [string, string]
    await church.emailOf(pat, 'pat@example.com')
    await recordConsentDecision(church.ministry, pat, 'contact_sharing', false)

    const card = cardIn((await getPage(`/overview?card=${group.id}`, cookie)).html)
    expect(card).toContain('Group · mixed · formed')
    expect(card).toMatch(/Grace First<\/div><span class="pc-role">Discipler<\/span>/)
    expect(card).toMatch(/Henry Second<\/div><span class="pc-role">Discipler<\/span>/)
    expect(card).toContain('Disciples · 2')

    // Contact details reach the card only through the consent rule Nudge reads.
    expect(card).not.toContain(displayPhone(await church.phoneOf(pat)))
    expect(card).not.toContain('pat@example.com')
    expect(card).not.toContain('Text Pat')
    expect(rowOf(card, 'Sam Open')).toContain('pc-row-phone')
  })

  it('stays one card with a row for each of twelve Disciples', async () => {
    const church = await aMinistry('Twelve Chapel')
    const { cookie } = await signIn(church.ministry)
    const names = Array.from({ length: 12 }, (_, n) => `Disciple ${String.fromCharCode(65 + n)}`)
    const group = await formGroup(church.ministry, {
      name: 'The Twelve',
      declaredGender: 'female',
      leader: woman('Lydia Many'),
      disciples: names.map((name) => woman(name)),
    })

    const card = cardIn((await getPage(`/overview?card=${group.id}`, cookie)).html)
    expect(card).toContain('Disciples · 12')
    expect(card.match(/<details class="pc-member">/g)).toHaveLength(12)
    expect(card.match(/class="pc-row-phone"/g)).toHaveLength(12)
  })

  it('shows the Concern as it opens, records the reading, and resolves it back to the card', async () => {
    const church = await aMinistry('Worried Group Chapel')
    const { cookie } = await signIn(church.ministry)
    const group = await formGroup(church.ministry, {
      name: 'Thursday Women',
      declaredGender: 'female',
      leader: woman('Rachel Group'),
      disciples: [woman('Emily Group'), woman('Hannah Group')],
      createdAt: formedEarly,
      acceptedAt: formedEarly,
    })
    await church.tickAt(at(0))
    await church.replyAt(minutesAfter(at(0), 1), group.leader, '1')
    await church.replyAt(minutesAfter(at(0), 2), group.leader, 'D')
    const words = 'One of them has stopped coming and will not say why.'
    await church.replyAt(minutesAfter(at(0), 3), group.leader, words)

    const { rows: raised } = await pool.query<{ id: string }>(`select id from concern where relationship_id = $1`, [
      group.id,
    ])
    const concern = raised[0]!.id
    expect((await getPage('/overview', cookie)).html).not.toContain(words)

    const back = `/overview?card=${group.id}`
    const card = cardIn((await getPage(back, cookie)).html)
    expect(card).toContain(words)
    expect(card).toContain('Concern · raised by Rachel Group on Mon 24 Aug')
    expect(card).toContain('Read by Pastor of Worried Group Chapel at')
    expect(card).toContain('Mon 24 Aug · Met · D concern')
    // The band sits straight under the names, before the people.
    expect(card.indexOf(words)).toBeLessThan(card.indexOf('Rachel Group</div>'))

    const { rows: readings } = await pool.query(`select viewed_by from concern_viewing where concern_id = $1`, [concern])
    expect(readings.map((row) => row.viewed_by)).toEqual([church.ministry.adminUserId])

    const resolved = await post('/follow-up/concern/resolve', cookie, { concernId: concern, back })
    expect(resolved.location).toContain(`${back}&done=concern-resolved`)
    const after = cardIn((await getPage(`${back}&done=concern-resolved`, cookie)).html)
    expect(after).toContain('Concern resolved and its words cleared.')
    expect(after).not.toContain(words)
  })

  it('shows a stall with the condition that fired, naming the leader', async () => {
    const church = await aMinistry('Silent Group Chapel')
    const { cookie } = await signIn(church.ministry)
    const group = await formGroup(church.ministry, {
      name: 'Quiet Women',
      declaredGender: 'female',
      leader: woman('Mark Silent'),
      disciples: [woman('Jo Waiting'), woman('Kim Waiting')],
      createdAt: formedEarly,
      acceptedAt: formedEarly,
    })
    await church.tickAt(at(0))
    await church.tickAt(at(1))
    await church.tickAt(at(2))

    const card = cardIn((await getPage(`/overview?card=${group.id}`, cookie)).html)
    expect(card).toContain('Stalled · gone silent')
    expect(card).toMatch(/Mark Silent has stopped answering check-ins: <strong>\d+ days since last contact<\/strong>/)
  })

  it('ends the Group through the existing step, and lands on the Overview without it', async () => {
    const church = await aMinistry('Ending Group Chapel')
    const { cookie } = await signIn(church.ministry)
    const group = await formGroup(church.ministry, {
      name: 'Last Women',
      declaredGender: 'female',
      leader: woman('Ed Ender'),
      disciples: [woman('Fay Finished'), woman('Gil Finished')],
    })
    const back = `/overview?card=${group.id}`

    const ended = await post('/follow-up/relationship/end', cookie, {
      relationshipId: group.id,
      back,
      outcome: 'completed',
      reason: 'They finished the study together.',
    })
    expect(ended.location).toContain(`${back}&done=ended`)

    const { response, html } = await getPage(`${back}&done=ended`, cookie)
    expect(response.status).toBe(200)
    expect(html).not.toContain('data-testid="pair-card"')
    expect(html).toContain('Relationship ended.')
  })

  it('offers no End relationship on a Group still awaiting its leader', async () => {
    const church = await aMinistry('Waiting Group Chapel')
    const { cookie } = await signIn(church.ministry)
    const group = await formGroup(church.ministry, {
      name: 'New Women',
      declaredGender: 'female',
      leader: woman('Una Asked'),
      disciples: [woman('Vi Waiting'), woman('Wen Waiting')],
      acceptedAt: null,
    })

    const card = cardIn((await getPage(`/overview?card=${group.id}`, cookie)).html)
    expect(card).toContain('Awaiting acceptance')
    expect(card).not.toContain('End relationship…')
  })
})
