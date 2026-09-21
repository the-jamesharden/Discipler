import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, cronSecret, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import {
  aTestPhoneNumber,
  addPerson,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Manual pairing, recut ticket 06; decided by James on 2026-09-21. Driven end to
 * end against the running app, with no script anywhere: she declines through the
 * page her link opens and its one confirmation, the two items appear on Follow-Up
 * in red, **Resolve** clears each, **Contact info** opens her page, and **Copy
 * link to re-invite leader** invites her again.
 */
describe.skipIf(skipUnlessAppIsRunning)('declining, and the two weeks, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string
  let numbered = 0
  // Letters only after the first name: a name is matched in markup below, and a
  // digit run is what a phone number looks like.
  const letter = (n: number) => String.fromCharCode(97 + (n % 26))
  const named = (first: string) => {
    const n = numbered++
    return `${first} Httpdecline${letter(Math.floor(n / 26))}${letter(n)}`
  }

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
  })

  afterAll(async () => {
    await pool.end()
  })

  const form = { 'content-type': 'application/x-www-form-urlencoded' }
  const words = (html: string) => html.replace(/<!-- -->/g, '')

  /** Claire, invited by the Admin's own route to help lead a group already running. */
  const invitedToARunningGroup = async () => {
    const leaderName = named('Grace')
    const group = await formGroup(ministry, {
      name: `Thursday Table ${numbered}`,
      declaredGender: 'male',
      leader: { name: leaderName, phone: aTestPhoneNumber(), gender: 'male' },
      disciples: [named('Emil'), named('Felix')].map((name) => ({
        name,
        phone: aTestPhoneNumber(),
        gender: 'male' as const,
      })),
    })
    const name = named('Claire')
    const claire = await addPerson(ministry, name, { phone: aTestPhoneNumber(), answers: { gender: 'male' } })
    const added = await fetch(`${baseUrl}/roster/pair/join`, {
      method: 'POST',
      redirect: 'manual',
      headers: { ...form, cookie },
      body: new URLSearchParams({ personId: claire, groupId: group.id, as: 'leader' }),
    })
    expect(added.status).toBe(303)

    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at, created_at`,
      [claire],
    )
    const link = rows[0]?.body.match(/\/invitation\/[0-9a-f-]{36}/)?.[0]
    if (!link) throw new Error('her invitation carries no link')
    return { group, claire, name, link }
  }

  const post = (path: string, body: Record<string, string> = {}, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { ...form, ...headers },
      body: new URLSearchParams(body),
    })

  const textsTo = async (person: string) =>
    (await pool.query(`select 1 from outbound_message where person_id = $1`, [person])).rows.length

  const openMembership = async (group: string, person: string) =>
    (
      await pool.query<{ accepted: boolean }>(
        `select accepted_at is not null as accepted from relationship_member
          where relationship_id = $1 and person_id = $2 and role = 'leader' and ended_at is null`,
        [group, person],
      )
    ).rows

  /** The item about one Person, as markup: from its `<li` to the next. */
  const itemAbout = (html: string, name: string) =>
    words(html)
      .split('<li')
      .find((candidate) => candidate.includes(name))

  /** Pressed as the page offers it: the form's own action and its own hidden field. */
  const pressResolve = async (item: string) => {
    const offered = item.match(
      /<form[^>]*action="(\/follow-up\/resolve)"[^>]*>\s*<input[^>]*name="itemId"[^>]*value="([^"]+)"/,
    )
    expect(offered, 'the item offers no Resolve form').not.toBeNull()
    const pressed = await post(offered![1]!, { itemId: offered![2]! }, { cookie })
    expect(pressed.status).toBe(303)
    expect(pressed.headers.get('location')).toContain('done=resolved')
  }

  describe('declining', () => {
    it('offers Decline beside Accept, asks once, and Go back changes nothing', async () => {
      const { group, claire, link } = await invitedToARunningGroup()

      const page = words(await (await fetch(`${baseUrl}${link}`)).text())
      // One form, two buttons, and Decline posts to a route of its own without the
      // form's validation: somebody saying no is not asked for a password first.
      const row = page.match(/<div class="accept-row">(.*?)<\/div>/s)?.[1] ?? ''
      expect(row).toContain('>Accept and start</button>')
      expect(row).toMatch(
        new RegExp(`<button[^>]*class="decline"[^>]*formAction="${link}/decline"[^>]*>Decline</button>`, 'i'),
      )
      expect(row.toLowerCase()).toContain('formnovalidate')

      const pressed = await post(`${link}/decline`, { fullName: 'Whatever', password: '' })
      expect(pressed.status).toBe(303)
      expect(pressed.headers.get('location')).toContain(`${link}?decline=ask`)

      // The one confirmation, under the Ministry's name, and nothing else.
      const asked = words(await (await fetch(`${baseUrl}${link}?decline=ask`)).text())
      expect(asked).toContain('Riverside Chapel')
      expect(asked).toContain('Are you sure you want to decline this invitation?')
      expect(asked).toContain('>Yes, decline</button>')
      expect(asked).toMatch(new RegExp(`<a[^>]*href="${link}"[^>]*>Go back</a>`))
      expect(asked).not.toContain('name="password"')
      expect(asked).not.toContain('You’ve been paired with')

      // Go back is the page as it was, and nothing has changed.
      const back = words(await (await fetch(`${baseUrl}${link}`)).text())
      expect(back).toContain('>Accept and start</button>')
      expect(await openMembership(group.id, claire)).toEqual([{ accepted: false }])
    })

    it('withdraws her invitation, tells her the Ministry has been told, and sends her no text', async () => {
      const { group, claire, link } = await invitedToARunningGroup()
      const textsBefore = await textsTo(claire)

      const confirmed = await post(`${link}/decline/confirm`)
      expect(confirmed.status).toBe(303)
      // The link itself, with nothing in the address: what a declined link says is
      // drawn from the invitation.
      expect(new URL(confirmed.headers.get('location') ?? '', baseUrl).pathname).toBe(link)
      expect(new URL(confirmed.headers.get('location') ?? '', baseUrl).search).toBe('')

      const declined = words(await (await fetch(`${baseUrl}${link}`)).text())
      expect(declined).toContain('Thanks for letting us know')
      expect(declined).toContain(
        'We’ve told Riverside Chapel you won’t be leading this group. Nothing else is needed from you, and nobody else has been contacted.',
      )
      // Nothing but what a declined link says: no reveal, nothing to press.
      expect(declined).not.toContain('Accept and start')
      expect(declined).not.toContain('You’ve been paired with')
      expect(declined).not.toContain('<form')

      expect(await openMembership(group.id, claire)).toEqual([])
      expect(await textsTo(claire)).toBe(textsBefore)

      // A second press, from a tab left open, lands on the same page.
      const again = await post(`${link}/decline/confirm`)
      expect(new URL(again.headers.get('location') ?? '', baseUrl).search).toBe('')
      // And accepting on it is refused in words of its own.
      const accepting = await post(`${link}/accept`, { fullName: 'Too Late', password: 'a-long-enough-password' })
      expect(accepting.status).toBe(303)
    })

    it('tells the Admin in red, with Resolve and Contact info, and no number', async () => {
      const { claire, name, link } = await invitedToARunningGroup()
      await post(`${link}/decline/confirm`)

      const { html } = await getPage('/follow-up', cookie)
      const item = itemAbout(html, name)
      expect(item, 'no Follow-Up item about her').toBeDefined()

      // Red, with the left edge and the tag a Concern has, and not grey.
      expect(item).toContain('class="fu care-concern"')
      expect(item).toContain('class="fu-tag concern"')
      expect(item).not.toContain('review')
      expect(item).toContain(`Group leader ${name} Declined`)
      expect(item).toContain('The invitation has been withdrawn, and the group carries on.')

      // Resolve and Contact info, and nothing else to press.
      expect(item).toContain('>Resolve</button>')
      expect(item).toMatch(new RegExp(`<a[^>]*href="/roster/${claire}"[^>]*>Contact info</a>`))
      expect(item).not.toContain('See contact details')
      expect(item).not.toContain('End relationship')
      expect(item).not.toContain('Cancel relationship')
      // No number is shown on Follow-Up itself.
      expect(item).not.toMatch(/\+1\d{10}/)

      // Contact info opens her page from the Roster.
      const hers = await getPage(`/roster/${claire}`, cookie)
      expect(hers.response.status).toBe(200)
      expect(words(hers.html)).toContain(name)

      await pressResolve(item!)
      expect(itemAbout((await getPage('/follow-up', cookie)).html, name)).toBeUndefined()
    })
  })

  describe('the two weeks', () => {
    /** Her fortnight, over: the window moved into the past, and the scheduler run. */
    const twoWeeksLater = async (group: string, person: string) => {
      await pool.query(
        `update invitation
            set created_at = created_at - interval '15 days',
                expires_at = expires_at - interval '15 days'
          where relationship_id = $1 and person_id = $2`,
        [group, person],
      )
      const ticked = await fetch(`${baseUrl}/cron/tick`, {
        redirect: 'manual',
        headers: { authorization: `Bearer ${cronSecret}` },
      })
      expect(ticked.status).toBe(200)
    }

    /**
     * The route ticks every Ministry in the database in turn, and a local database
     * keeps a Ministry per fixture per run until it is reset, so one tick costs the
     * sum of them and outgrows the default five seconds in a full run. The allowance
     * and the reason are `the-scheduled-tick-over-http.test.ts`'s.
     */
    const enoughForEveryMinistry = 120_000

    it('tells the Admin in red, in James’s words, with Resolve and Copy link to re-invite leader', { timeout: enoughForEveryMinistry }, async () => {
      const { group, claire, name, link } = await invitedToARunningGroup()
      await twoWeeksLater(group.id, claire)

      expect(await openMembership(group.id, claire)).toEqual([])
      const { html } = await getPage('/follow-up', cookie)
      const item = itemAbout(html, name)
      expect(item, 'no Follow-Up item about her').toBeDefined()

      expect(item).toContain('class="fu care-concern"')
      expect(item).toContain('class="fu-tag concern"')
      expect(item).toContain('Invitation expired')
      expect(item).toContain(
        `Group leader ${name} has not responded in two weeks, their invite has expired.`,
      )
      expect(item).toContain('>Resolve</button>')
      expect(item).toContain('>Copy link to re-invite leader</button>')
      expect(item).not.toContain('End relationship')
      expect(item).not.toMatch(/\+1\d{10}/)

      // Her old link says what an expired link always said, and offers nothing.
      const expired = words(await (await fetch(`${baseUrl}${link}`)).text())
      expect(expired).toContain('This link has expired.')
      expect(expired).not.toContain('Accept and start')
      expect(expired).not.toContain('<form')

      await pressResolve(item!)
      expect(itemAbout((await getPage('/follow-up', cookie)).html, name)).toBeUndefined()
    })

    it('Copy link to re-invite leader invites her again with a link that works, and sends her nothing', { timeout: enoughForEveryMinistry }, async () => {
      const { group, claire, name } = await invitedToARunningGroup()
      await twoWeeksLater(group.id, claire)
      const textsBefore = await textsTo(claire)

      const item = itemAbout((await getPage('/follow-up', cookie)).html, name)
      const offered = item?.match(/<form[^>]*action="(\/follow-up\/reinvite)"[^>]*>(.*?)<\/form>/s)
      expect(offered, 'the item offers no re-invite form').toBeTruthy()
      const fields = Object.fromEntries(
        [...offered![2]!.matchAll(/name="([^"]+)"[^>]*value="([^"]+)"/g)].map((field) => [field[1]!, field[2]!]),
      )
      expect(fields).toEqual({ relationshipId: group.id, personId: claire })

      // As the button's script asks: the link as JSON, never in an address.
      const asked = await post('/follow-up/reinvite', fields, { cookie, accept: 'application/json' })
      expect(asked.status).toBe(200)
      const { link } = (await asked.json()) as { link: string }
      expect(link).toMatch(/\/invitation\/[0-9a-f-]{36}$/)

      expect(await openMembership(group.id, claire)).toEqual([{ accepted: false }])
      expect(await textsTo(claire)).toBe(textsBefore)

      // And as a browser with no script posts it: a page holding the link.
      const posted = await post('/follow-up/reinvite', fields, { cookie })
      expect(posted.status).toBe(200)
      const shown = (await posted.text()).match(/value="([^"]*\/invitation\/[0-9a-f-]{36})"/)?.[1]
      expect(shown, 'the page shows no link').toBeDefined()
      // A fresh one each time, and the newest is the one that works.
      expect(shown).not.toBe(link)

      const path = new URL(shown!).pathname
      const accepted = await post(`${path}/accept`, { fullName: name, password: 'a-long-enough-password' })
      expect(accepted.headers.get('location')).toContain('done=accepted')
      expect(await openMembership(group.id, claire)).toEqual([{ accepted: true }])

      // Every copy is in the Ministry's history with the Admin who made it.
      const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
        `select payload from ministry_event
          where subject_id = $1 and type = 'invitation.link_copied' order by recorded_at`,
        [group.id],
      )
      expect(rows.map((row) => [row.payload.copiedBy, row.payload.personId, row.payload.reinvited])).toEqual([
        [ministry.adminUserId, claire, true],
        [ministry.adminUserId, claire, false],
      ])

      // Pressed once she has accepted, it says so and invites nobody.
      const late = await post('/follow-up/reinvite', fields, { cookie, accept: 'application/json' })
      expect(late.status).toBe(409)
      expect(((await late.json()) as { error: string }).error).toContain('They have accepted since')
    })

    it('gives nobody a link without an Admin’s session', async () => {
      const { group, claire } = await invitedToARunningGroup()
      const fields = { relationshipId: group.id, personId: claire }

      const stranger = await post('/follow-up/reinvite', fields)
      expect(stranger.status).toBe(303)
      expect(stranger.headers.get('location')).toContain('/login')
      const asJson = await post('/follow-up/reinvite', fields, { accept: 'application/json' })
      expect(asJson.status).toBe(401)
    })
  })
})
