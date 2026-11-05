import { NextRequest } from 'next/server'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestClock, type Clock } from '~/domain/clock'
import { AI_GUIDE_CHAT_KEPT_DAYS, AI_GUIDE_QUESTIONS_PER_DAY } from '~/domain/launch-terms'
import { createGatewayGuideModel } from '~/platform/ai-gateway/guide-model'
import { createPostgresAskDisciplerStore, type PostgresAskDisciplerStore } from '~/platform/supabase/ask-discipler-store'
import { createAskDiscipler, type AskDiscipler } from '~/service/ask-discipler'
import { createEmailSender } from '~/service/email-sender'
import type { EmailTransport, GuideModel, GuideModelAnswer, SignedInAdmin } from '~/service/ports'
import { createEmailSupportAlerts } from '~/service/support-alerts'
import { POST as ask } from '../../app/help/ask/question/route'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  publishSupabaseCredentials,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Ask Discipler (Exponential launch, ticket 31), with the real tables and sessions behind
 * it and the model as a stand-in, because no test calls a provider. What a built server
 * draws is `ask-discipler-over-http.test.ts`, which asks no model anything.
 */

let routeGuide: AskDiscipler
let routeAdmin: SignedInAdmin | null

vi.mock('~/service/container', () => ({ getAskDiscipler: () => routeGuide }))
vi.mock('~/platform/supabase/current-admin', () => ({
  currentAdmin: async () => routeAdmin,
  signInFromToken: async () => SESSION_ON_THE_ROUTE,
}))

const SESSION_ON_THE_ROUTE = '00000000-0000-4000-8000-000000003101'

const INSTRUCTIONS = 'The instructions.'

const ANSWERED: GuideModelAnswer = {
  outcome: 'answered',
  text: 'Open Settings.\n\nSource: /help/settings',
  usage: { inputTokens: 900, cachedInputTokens: 800, outputTokens: 40 },
}

/** What the model was handed, and whatever it should say next. */
const aModel = () => {
  const seen: Parameters<GuideModel['answer']>[0][] = []
  let saying: GuideModelAnswer = ANSWERED
  const model: GuideModel = {
    async answer(request) {
      seen.push(request)
      return saying
    },
  }
  return { model, seen, say: (next: GuideModelAnswer) => (saying = next) }
}

const claimsOf = async (client: Awaited<ReturnType<typeof signInAs>>) => {
  const { data } = await client.auth.getClaims()
  return data!.claims as { session_id: string; sub: string }
}

describe('Ask Discipler', () => {
  let pool: pg.Pool
  let store: PostgresAskDisciplerStore
  const delivered: { kind: string; to: readonly string[]; text: string }[] = []
  const transport: EmailTransport = {
    async deliver(envelope) {
      delivered.push({ kind: envelope.kind, to: envelope.to, text: envelope.text })
    },
  }
  const alerts = createEmailSupportAlerts(createEmailSender(transport))

  const guideWith = (model: GuideModel, clock: Clock = createTestClock(new Date())) =>
    createAskDiscipler({ store, model, alerts, clock })

  const asking = (ministry: MinistryFixture, typed = 'How do check-ins work?', sessionId = crypto.randomUUID()) => ({
    ministryId: ministry.id,
    userId: ministry.adminUserId,
    sessionId,
    typed,
    instructions: INSTRUCTIONS,
  })

  /** Questions already asked, as the store's rows, for the limit and the deleting. */
  const alreadyAsked = async (ministry: MinistryFixture, count: number, at: Date, sessionId = crypto.randomUUID()) => {
    await pool.query(
      `insert into ask_discipler_question (ministry_id, user_id, session_id, question, answer, asked_at, answered_at)
       select $1, $2, $3, 'Asked ' || n, 'Answered ' || n, $4, $4 from generate_series(1, $5::int) n`,
      [ministry.id, ministry.adminUserId, sessionId, at, count],
    )
  }

  const countFor = async (ministry: MinistryFixture): Promise<number> => {
    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from ask_discipler_question where ministry_id = $1`,
      [ministry.id],
    )
    return rows[0]!.n
  }

  beforeAll(() => {
    publishSupabaseCredentials()
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl, max: 2 })
    store = createPostgresAskDisciplerStore(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  beforeEach(() => {
    delivered.length = 0
  })

  describe('the thirty a day', () => {
    it('refuses the thirty-first and does not ask the model', async () => {
      const ministry = await createMinistryWithAdmin('Thirty a day')
      const { model, seen } = aModel()
      await alreadyAsked(ministry, AI_GUIDE_QUESTIONS_PER_DAY - 1, new Date())

      const thirtieth = await guideWith(model).ask(asking(ministry))
      expect(thirtieth).toMatchObject({ kind: 'answered', questionsLeft: 0 })

      const thirtyFirst = await guideWith(model).ask(asking(ministry))
      expect(thirtyFirst).toEqual({ kind: 'limit' })
      expect(seen).toHaveLength(1)
      expect(await countFor(ministry)).toBe(AI_GUIDE_QUESTIONS_PER_DAY)
    })

    it('holds at thirty when many arrive at once', async () => {
      const ministry = await createMinistryWithAdmin('Many at once')
      const { model } = aModel()
      await alreadyAsked(ministry, AI_GUIDE_QUESTIONS_PER_DAY - 2, new Date())

      const answers = await Promise.all(
        Array.from({ length: 6 }, () => guideWith(model).ask(asking(ministry))),
      )

      expect(answers.filter((answer) => answer.kind === 'answered')).toHaveLength(2)
      expect(answers.filter((answer) => answer.kind === 'limit')).toHaveLength(4)
      expect(await countFor(ministry)).toBe(AI_GUIDE_QUESTIONS_PER_DAY)
    })

    it('counts each Admin on their own', async () => {
      const ministry = await createMinistryWithAdmin('Each on their own')
      const other = await addPersonWithAccount(ministry, 'Ben Second', 'admin')
      const { model } = aModel()
      await alreadyAsked(ministry, AI_GUIDE_QUESTIONS_PER_DAY, new Date())

      expect(await guideWith(model).ask(asking(ministry))).toEqual({ kind: 'limit' })
      expect(await guideWith(model).ask({ ...asking(ministry), userId: other.userId })).toMatchObject({
        kind: 'answered',
        questionsLeft: AI_GUIDE_QUESTIONS_PER_DAY - 1,
      })
    })

    it('starts again at midnight in the church’s own zone', async () => {
      const ministry = await createMinistryWithAdmin('Its own midnight')
      await pool.query(`update ministry set timezone = 'America/Los_Angeles' where id = $1`, [ministry.id])
      const { model } = aModel()

      // 11pm on the 3rd in Los Angeles, which is already the 4th in UTC.
      await alreadyAsked(ministry, AI_GUIDE_QUESTIONS_PER_DAY, new Date('2026-11-04T07:00:00Z'))

      const stillTheThird = createTestClock(new Date('2026-11-04T07:30:00Z'))
      expect(await guideWith(model, stillTheThird).ask(asking(ministry))).toEqual({ kind: 'limit' })

      // Just past midnight there, an hour after the question above.
      const theFourth = createTestClock(new Date('2026-11-04T08:01:00Z'))
      expect(await guideWith(model, theFourth).ask(asking(ministry))).toMatchObject({ kind: 'answered' })
    })
  })

  describe('a failed answer', () => {
    it('does not count, and the row is gone', async () => {
      const ministry = await createMinistryWithAdmin('A failed answer')
      const { model, say } = aModel()
      say({ outcome: 'failed' })

      const answer = await guideWith(model).ask(asking(ministry))

      expect(answer).toEqual({ kind: 'failed', questionsLeft: AI_GUIDE_QUESTIONS_PER_DAY })
      expect(await countFor(ministry)).toBe(0)
      expect(delivered).toEqual([])
    })

    it('does not use up the last place', async () => {
      const ministry = await createMinistryWithAdmin('The last place')
      const { model, say } = aModel()
      await alreadyAsked(ministry, AI_GUIDE_QUESTIONS_PER_DAY - 1, new Date())

      say({ outcome: 'failed' })
      expect(await guideWith(model).ask(asking(ministry))).toEqual({ kind: 'failed', questionsLeft: 1 })

      say(ANSWERED)
      expect(await guideWith(model).ask(asking(ministry))).toMatchObject({ kind: 'answered', questionsLeft: 0 })
    })

    it('asks nothing of the model for nothing typed, or too much', async () => {
      const ministry = await createMinistryWithAdmin('Nothing typed')
      const { model, seen } = aModel()

      expect((await guideWith(model).ask(asking(ministry, '   '))).kind).toBe('failed')
      expect((await guideWith(model).ask(asking(ministry, 'x'.repeat(1001)))).kind).toBe('failed')
      expect(seen).toEqual([])
    })
  })

  describe('past the spend cap', () => {
    const SPENT_BODY = { error: { type: 'quota_for_entity_exceeded', message: 'Budget exceeded.' } }

    /** The real gateway provider, refused at the door. */
    const refused = () =>
      createGatewayGuideModel({
        apiKey: 'a-stand-in-not-a-key',
        fetch: async () =>
          new Response(JSON.stringify(SPENT_BODY), { status: 402, headers: { 'content-type': 'application/json' } }),
      })

    // A month of its own per run, since the record of it outlives the test.
    const aMonthOfItsOwn = async (): Promise<Date> => {
      const { rows } = await pool.query<{ next: Date }>(
        `select coalesce(max(to_date(month, 'YYYY-MM')), date '2090-01-01') + interval '1 month' as next
           from ask_discipler_spend_stop where month >= '2090-01'`,
      )
      return new Date(new Date(rows[0]!.next).getTime() + 3 * 24 * 60 * 60 * 1000)
    }

    it('shows the failed-answer message as JSON and never an error page, through the route', async () => {
      const ministry = await createMinistryWithAdmin('The route past the cap')
      routeGuide = guideWith(refused(), createTestClock(await aMonthOfItsOwn()))
      routeAdmin = { ministryId: ministry.id, userId: ministry.adminUserId } as SignedInAdmin
      const was = process.env.ASK_DISCIPLER_ON
      process.env.ASK_DISCIPLER_ON = 'true'
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      try {
        const response = await ask(
          new NextRequest('http://127.0.0.1:3346/help/ask/question', {
            method: 'POST',
            body: new URLSearchParams({ question: 'How do check-ins work?' }),
          }),
        )

        expect(response.status).toBe(503)
        expect(response.headers.get('content-type')).toContain('application/json')
        expect(await response.json()).toEqual({ kind: 'failed', questionsLeft: AI_GUIDE_QUESTIONS_PER_DAY })
        expect(await countFor(ministry)).toBe(0)
      } finally {
        process.env.ASK_DISCIPLER_ON = was
        vi.restoreAllMocks()
      }
    })

    it('emails support@ once in a month, however many go on asking', async () => {
      const ministry = await createMinistryWithAdmin('Told once')
      const at = await aMonthOfItsOwn()
      const guide = guideWith(refused(), createTestClock(at))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      try {
        await guide.ask(asking(ministry))
        await guide.ask(asking(ministry))
        await Promise.all([guide.ask(asking(ministry)), guide.ask(asking(ministry))])
      } finally {
        vi.restoreAllMocks()
      }

      expect(delivered.map((email) => email.kind)).toEqual(['askDisciplerSpendStopped'])
      expect(delivered[0]!.to).toEqual(['support@trydiscipler.com'])
      expect(delivered[0]!.text).not.toContain(ministry.name)
    })

    it('tries again on the next question where the email did not go', async () => {
      const ministry = await createMinistryWithAdmin('Told after a failure')
      const at = await aMonthOfItsOwn()
      let vendorIsDown = true
      const flaky = createEmailSupportAlerts(
        createEmailSender({
          async deliver(envelope) {
            if (vendorIsDown) throw new Error('Resend is down')
            delivered.push({ kind: envelope.kind, to: envelope.to, text: envelope.text })
          },
        }),
      )
      const guide = createAskDiscipler({ store, model: refused(), alerts: flaky, clock: createTestClock(at) })
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      try {
        expect((await guide.ask(asking(ministry))).kind).toBe('failed')
        expect(delivered).toEqual([])

        vendorIsDown = false
        expect((await guide.ask(asking(ministry))).kind).toBe('failed')
        expect(delivered.map((email) => email.kind)).toEqual(['askDisciplerSpendStopped'])
      } finally {
        vi.restoreAllMocks()
      }
    })
  })

  describe('what reaches the model', () => {
    it('is the instructions, the Admin’s own chat and the question, and nobody’s name', async () => {
      const ministry = await createMinistryWithAdmin('Grace Fellowship Church', 'Pastor Gideon Marsh')
      const { model, seen } = aModel()
      const sessionId = crypto.randomUUID()

      await guideWith(model).ask(asking(ministry, 'First question', sessionId))
      await guideWith(model).ask(asking(ministry, 'Second question', sessionId))

      expect(seen[1]).toEqual({
        instructions: INSTRUCTIONS,
        history: [{ question: 'First question', answer: ANSWERED.outcome === 'answered' ? ANSWERED.text : '' }],
        question: 'Second question',
      })

      const everything = JSON.stringify(seen)
      expect(everything).not.toContain('Grace Fellowship')
      expect(everything).not.toContain('Gideon')
      expect(everything).not.toContain(ministry.id)
      expect(everything).not.toContain(ministry.adminUserId)
    })

    it('does not carry another sign-in’s chat', async () => {
      const ministry = await createMinistryWithAdmin('Another sign-in')
      const { model, seen } = aModel()

      await guideWith(model).ask(asking(ministry, 'From last week'))
      await guideWith(model).ask(asking(ministry, 'From today'))

      expect(seen[1]!.history).toEqual([])
    })

    it('remembers only the last ten of a long chat, oldest first', async () => {
      const ministry = await createMinistryWithAdmin('A long chat')
      const { model, seen } = aModel()
      const sessionId = crypto.randomUUID()
      for (let asked = 1; asked <= 12; asked += 1) {
        await pool.query(
          `insert into ask_discipler_question (ministry_id, user_id, session_id, question, answer, asked_at, answered_at)
           values ($1, $2, $3, $4, 'An answer', now() - make_interval(hours => 50 - $5::int), now())`,
          [ministry.id, ministry.adminUserId, sessionId, `Asked ${asked}`, asked],
        )
      }

      await guideWith(model).ask(asking(ministry, 'And one more', sessionId))

      expect(seen[0]!.history.map((exchange) => exchange.question)).toEqual(
        Array.from({ length: 10 }, (_, index) => `Asked ${index + 3}`),
      )
    })

    it('logs counts and token use, and no word of it', async () => {
      const ministry = await createMinistryWithAdmin('Counts in the log')
      const { model } = aModel()
      const logged = vi.spyOn(console, 'info').mockImplementation(() => undefined)

      try {
        await guideWith(model).ask(asking(ministry, 'A private question'))
        const said = JSON.stringify(logged.mock.calls)
        expect(said).toContain('900 tokens in (800 cached), 40 out')
        expect(said).not.toContain('A private question')
        expect(said).not.toContain('Open Settings')
      } finally {
        vi.restoreAllMocks()
      }
    })
  })

  describe('the chat', () => {
    const readChat = async (client: Awaited<ReturnType<typeof signInAs>>) => {
      const { data, error } = await client.rpc('ask_discipler_page')
      if (error) throw new Error(error.message)
      return data as { session: string; chat: { question: string; answer: string }[]; asked_today: { asked_at: string }[] }
    }

    it('carries on while the Admin stays signed in, and a new sign-in opens an empty one', async () => {
      const ministry = await createMinistryWithAdmin('A fresh chat')
      const { model } = aModel()
      const first = await signInAs(ministry)
      const { session_id: sessionId } = await claimsOf(first)

      await guideWith(model).ask(asking(ministry, 'Asked in the first sign-in', sessionId))

      const read = await readChat(first)
      expect(read.chat.map((one) => one.question)).toEqual(['Asked in the first sign-in'])
      expect(read.asked_today).toHaveLength(1)

      const second = await signInAs(ministry)
      const fresh = await readChat(second)
      expect(fresh.chat).toEqual([])
      // A fresh chat is not a fresh day.
      expect(fresh.asked_today).toHaveLength(1)

      // And the first is still there for the sign-in that holds it.
      expect((await readChat(first)).chat).toHaveLength(1)
    })

    it('holds no question still being answered', async () => {
      const ministry = await createMinistryWithAdmin('Being answered')
      const client = await signInAs(ministry)
      const { session_id: sessionId } = await claimsOf(client)
      await store.holdAPlace({
        ministryId: ministry.id,
        userId: ministry.adminUserId,
        sessionId,
        question: 'Not yet answered',
        at: new Date(),
        most: AI_GUIDE_QUESTIONS_PER_DAY,
        remembering: 10,
      })

      const read = await readChat(client)
      expect(read.chat).toEqual([])
      expect(read.asked_today).toHaveLength(1)
    })

    it('is readable only by its author, even in the same church', async () => {
      const ministry = await createMinistryWithAdmin('Only its author')
      const other = await addPersonWithAccount(ministry, 'Ben Second', 'admin')
      const { model } = aModel()
      const author = await signInAs(ministry)
      const { session_id: sessionId } = await claimsOf(author)
      await guideWith(model).ask(asking(ministry, 'Mine alone', sessionId))

      const { apiUrl, anonKey } = localSupabase()
      const { createClient } = await import('@supabase/supabase-js')
      const secondAdmin = createClient(apiUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
      await secondAdmin.auth.signInWithPassword({ phone: other.phone, password: other.password })

      const { data: theirs } = await secondAdmin.from('ask_discipler_question').select('question')
      expect(theirs).toEqual([])
      expect((await readChat(secondAdmin as never)).chat).toEqual([])

      const { data: mine } = await author.from('ask_discipler_question').select('question')
      expect(mine).toEqual([{ question: 'Mine alone' }])
    })

    it('cannot be written or changed through the browser’s connection', async () => {
      const ministry = await createMinistryWithAdmin('No browser writes')
      const { model } = aModel()
      const client = await signInAs(ministry)
      const { session_id: sessionId } = await claimsOf(client)
      await guideWith(model).ask(asking(ministry, 'Stays as it was', sessionId))

      const { error: added } = await client.from('ask_discipler_question').insert({
        ministry_id: ministry.id,
        user_id: ministry.adminUserId,
        session_id: sessionId,
        question: 'Added by hand',
        asked_at: new Date().toISOString(),
      })
      expect(added).not.toBeNull()

      await client.from('ask_discipler_question').update({ answer: 'Changed' }).eq('session_id', sessionId)
      await client.from('ask_discipler_question').delete().eq('session_id', sessionId)

      const { rows } = await pool.query(`select question, answer from ask_discipler_question where session_id = $1`, [sessionId])
      expect(rows).toEqual([{ question: 'Stays as it was', answer: ANSWERED.outcome === 'answered' ? ANSWERED.text : '' }])
    })

    it('holds the command connection to one church', async () => {
      const ministry = await createMinistryWithAdmin('One church')
      const other = await createMinistryWithAdmin('Another church')

      await expect(
        store.holdAPlace({
          ministryId: other.id,
          userId: ministry.adminUserId,
          sessionId: crypto.randomUUID(),
          question: 'Into another church',
          at: new Date(),
          most: AI_GUIDE_QUESTIONS_PER_DAY,
          remembering: 10,
        }),
      ).rejects.toThrow()
    })

    it('is gone once it is older than it may be kept, and the rest stays', async () => {
      const ministry = await createMinistryWithAdmin('Kept for ninety days')
      const { model } = aModel()
      const now = new Date()
      const day = 24 * 60 * 60 * 1000
      const old = crypto.randomUUID()
      const recent = crypto.randomUUID()
      await alreadyAsked(ministry, 2, new Date(now.getTime() - (AI_GUIDE_CHAT_KEPT_DAYS + 1) * day), old)
      await alreadyAsked(ministry, 3, new Date(now.getTime() - (AI_GUIDE_CHAT_KEPT_DAYS - 1) * day), recent)

      const deleted = await guideWith(model, createTestClock(now)).sweep()

      expect(deleted).toBeGreaterThanOrEqual(2)
      const { rows } = await pool.query<{ session_id: string }>(
        `select session_id from ask_discipler_question where ministry_id = $1`,
        [ministry.id],
      )
      expect(rows).toHaveLength(3)
      expect(new Set(rows.map((row) => row.session_id))).toEqual(new Set([recent]))
    })
  })

  describe('tucking it away', () => {
    it('is stored on this Admin and read through the page session', async () => {
      const ministry = await createMinistryWithAdmin('Tucked away')
      const other = await addPersonWithAccount(ministry, 'Ben Second', 'admin')
      const { model } = aModel()
      const client = await signInAs(ministry)
      const tucked = async () => {
        const { data } = await client.rpc('signed_in_admin')
        return (data as { admin: { ask_discipler_tucked: boolean } }).admin.ask_discipler_tucked
      }

      expect(await tucked()).toBe(false)

      await guideWith(model).setTucked({ ministryId: ministry.id, userId: ministry.adminUserId, tucked: true })
      expect(await tucked()).toBe(true)

      const { rows } = await pool.query(`select ask_discipler_tucked from ministry_member where user_id = $1`, [other.userId])
      expect(rows).toEqual([{ ask_discipler_tucked: false }])

      await guideWith(model).setTucked({ ministryId: ministry.id, userId: ministry.adminUserId, tucked: false })
      expect(await tucked()).toBe(false)
    })

    it('cannot make anybody an Admin', async () => {
      const ministry = await createMinistryWithAdmin('Column by column')
      const client = new pg.Client({ connectionString: localSupabase().databaseUrl })
      await client.connect()
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministry.id])
        await expect(
          client.query(`update ministry_member set tier = 'leader' where user_id = $1`, [ministry.adminUserId]),
        ).rejects.toThrow(/permission denied/)
      } finally {
        await client.query('rollback').catch(() => undefined)
        await client.end()
      }
    })
  })
})
