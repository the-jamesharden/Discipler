import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AI_GUIDE_QUESTIONS_PER_DAY } from '~/domain/launch-terms'
import {
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  enoughForATick,
  localSupabase,
  pairOneToOne,
  publishSupabaseCredentials,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, cronSecret, getPage, signIn, signInAs, skipUnlessAppIsRunning } from '../support/app'

/**
 * Ask Discipler through a built server (Exponential launch, ticket 31): who it is drawn
 * for, what it is drawn with, and the routes up to the model's door. **Nothing here asks
 * the model anything**: the only question that gets past the limit in this file would be
 * a real call, so none does. What the model is handed and says is `ask-discipler.test.ts`.
 */

/** Everything the server drew for the bubble, or null where it drew none. */
const bubbleIn = (html: string): boolean => html.includes('class="ask-bubble"') || html.includes('class="ask-tab"')

/** The tick runs every Ministry in the database, so its time is counted from them. */
const enoughForEveryMinistry = await enoughForATick()

const post = (path: string, cookie: string, fields: Record<string, string>) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  })

describe.skipIf(skipUnlessAppIsRunning)('Ask Discipler over HTTP', () => {
  let pool: pg.Pool

  beforeAll(() => {
    publishSupabaseCredentials()
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl, max: 2 })
  })

  afterAll(async () => {
    await pool.end()
  })

  const askedToday = async (ministry: MinistryFixture, count: number, sessionId = crypto.randomUUID()) => {
    await pool.query(
      `insert into ask_discipler_question (ministry_id, user_id, session_id, question, answer, asked_at, answered_at)
       select $1, $2, $3, 'Asked ' || n, E'Answered ' || n || E'\n\nSource: /help/settings', now(), now()
         from generate_series(1, $4::int) n`,
      [ministry.id, ministry.adminUserId, sessionId, count],
    )
  }

  const sessionIdOf = async (userId: string): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `select id from auth.sessions where user_id = $1 order by created_at desc limit 1`,
      [userId],
    )
    return rows[0]!.id
  }

  describe('who it is drawn for', () => {
    it.each(['/overview', '/roster', '/check-ins', '/follow-up', '/materials', '/settings', '/account'])(
      'is on an Admin’s %s',
      async (path) => {
        const ministry = await createMinistryWithAdmin(`Every page ${path}`)
        const { cookie } = await signIn(ministry)
        const { response, html } = await getPage(path, cookie)
        expect(response.status).toBe(200)
        expect(bubbleIn(html)).toBe(true)
      },
    )

    it('is never on sign-in', async () => {
      const { html } = await getPage('/login', '')
      expect(bubbleIn(html)).toBe(false)
    })

    it('is never on a Leader’s page', async () => {
      const ministry = await createMinistryWithAdmin('A Leader’s page')
      const leader = await addPersonWithAccount(ministry, 'Lena Leader', 'leader')
      await pairOneToOne(ministry, leader.personId, await addPerson(ministry, 'Paul Disciple'))
      const { cookie } = await signInAs(leader)
      const { response, html } = await getPage('/relationships', cookie)
      expect(response.status).toBe(200)
      expect(bubbleIn(html)).toBe(false)
    })

    it('is not on the public help pages, which have no session', async () => {
      const { html } = await getPage('/help', '')
      expect(bubbleIn(html)).toBe(false)
    })
  })

  describe('its label', () => {
    it('invites onboarding until setup reaches 100%', async () => {
      const ministry = await createMinistryWithAdmin('Label before')
      const { cookie } = await signIn(ministry)
      const { html } = await getPage('/overview', cookie)
      expect(html).toContain('Start your onboarding here!')
    })

    it('reads Ask Discipler, on hover, once the Admin is past setup', async () => {
      const ministry = await createMinistryWithAdmin('Label after')
      const { cookie } = await signIn(ministry)
      expect((await post('/settings/setup-seen', cookie, { badge: 'yes', stay: 'yes' })).status).toBe(204)

      const { html } = await getPage('/overview', cookie)

      expect(html).not.toContain('Start your onboarding here!')
      expect(html).toContain('class="ask-label hover"')
    })
  })

  describe('tucking it away', () => {
    it('stays tucked on every page until the tab is pressed', async () => {
      const ministry = await createMinistryWithAdmin('Tuck over HTTP')
      const { cookie } = await signIn(ministry)

      expect((await post('/help/ask/tuck', cookie, { tucked: 'true' })).status).toBe(204)
      for (const path of ['/overview', '/settings']) {
        const { html } = await getPage(path, cookie)
        expect(html).toContain('class="ask-tab"')
        expect(html).not.toContain('class="ask-bubble"')
      }

      expect((await post('/help/ask/tuck', cookie, { tucked: 'false' })).status).toBe(204)
      expect((await getPage('/overview', cookie)).html).toContain('class="ask-bubble"')
    })

    it('needs a session', async () => {
      expect((await post('/help/ask/tuck', '', { tucked: 'true' })).status).toBe(401)
    })
  })

  describe('the chat', () => {
    const readChat = async (cookie: string) => {
      const response = await fetch(`${baseUrl}/help/ask/chat`, { headers: { cookie } })
      return { response, body: await response.json() }
    }

    it('opens empty on a new sign-in, with the day’s count, and carries on in the same one', async () => {
      const ministry = await createMinistryWithAdmin('A chat over HTTP')
      const { cookie } = await signIn(ministry)
      const sessionId = await sessionIdOf(ministry.adminUserId)
      await askedToday(ministry, 2, sessionId)

      const { response, body } = await readChat(cookie)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(body.questionsLeft).toBe(AI_GUIDE_QUESTIONS_PER_DAY - 2)
      expect(body.exchanges.map((one: { question: string }) => one.question).sort()).toEqual(['Asked 1', 'Asked 2'])
      expect(body.exchanges[0].reply.source).toMatchObject({ href: '/help/settings' })
      expect(body.exchanges[0].reply.html).not.toContain('Source')

      const again = await signIn(ministry)
      const fresh = await readChat(again.cookie)
      expect(fresh.body.exchanges).toEqual([])
      expect(fresh.body.questionsLeft).toBe(AI_GUIDE_QUESTIONS_PER_DAY - 2)
    })

    it('needs a session', async () => {
      expect((await readChat('')).response.status).toBe(401)
    })
  })

  describe('asking', () => {
    it('refuses the thirty-first with JSON the chat can read', async () => {
      const ministry = await createMinistryWithAdmin('The thirty-first over HTTP')
      const { cookie } = await signIn(ministry)
      await askedToday(ministry, AI_GUIDE_QUESTIONS_PER_DAY)

      const response = await post('/help/ask/question', cookie, { question: 'One more?' })

      expect(response.status).toBe(429)
      expect(await response.json()).toEqual({ kind: 'limit', questionsLeft: 0 })
      const { rows } = await pool.query<{ n: number }>(
        `select count(*)::int as n from ask_discipler_question where ministry_id = $1`,
        [ministry.id],
      )
      expect(rows[0]!.n).toBe(AI_GUIDE_QUESTIONS_PER_DAY)
    })

    it('says sorry, in JSON, for a question there is nothing in', async () => {
      const ministry = await createMinistryWithAdmin('Nothing in it')
      const { cookie } = await signIn(ministry)

      const response = await post('/help/ask/question', cookie, { question: '   ' })

      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ kind: 'failed', questionsLeft: null })
    })

    it('needs a session', async () => {
      const response = await post('/help/ask/question', '', { question: 'Who is this?' })
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ kind: 'signed-out' })
    })
  })

  describe('the tick', () => {
    it('deletes a chat older than it may be kept', { timeout: enoughForEveryMinistry }, async () => {
      const ministry = await createMinistryWithAdmin('The tick deletes')
      await pool.query(
        `insert into ask_discipler_question (ministry_id, user_id, session_id, question, answer, asked_at, answered_at)
         values ($1, $2, $3, 'From long ago', 'An answer', now() - interval '91 days', now() - interval '91 days')`,
        [ministry.id, ministry.adminUserId, crypto.randomUUID()],
      )

      const response = await fetch(`${baseUrl}/cron/tick`, { headers: { authorization: `Bearer ${cronSecret}` } })
      expect(response.status).toBe(200)
      const outcome = (await response.json()) as { askDisciplerChats: number | 'failed' }
      expect(outcome.askDisciplerChats).toBeGreaterThanOrEqual(1)

      const { rows } = await pool.query(`select 1 from ask_discipler_question where ministry_id = $1`, [ministry.id])
      expect(rows).toEqual([])
    })
  })
})
