import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETUP_HISTORY } from '~/domain/setup-meter'
import { twilioSignature } from '~/platform/twilio/inbound-signature'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning, twilioAuthToken } from '../support/app'
import {
  createMinistryWithAdmin,
  localSupabase,
  publishSupabaseCredentials,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The test check-in as an Admin meets it (Exponential launch, ticket 28): the card over
 * the Overview, its routes, the webhook a reply comes in on, and what Check-Ins and the
 * bar show afterwards. `scripts/locked-tests.sh` serves with `MESSAGE_TRANSPORT=record`,
 * so the texts and the Verify code are written down and no phone is reached, and the code
 * that verifier takes is `000000`. The rules are in `tests/integration/the-test-check-in.test.ts`.
 */

const SEND = '/overview/test-check-in/send'
const CONFIRM = '/overview/test-check-in/confirm'
const CARD = 'id="test-check-in"'

const clean = (html: string) => html.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

describe.skipIf(skipUnlessAppIsRunning)('the test check-in', () => {
  let pool: pg.Pool
  let ministry: MinistryFixture
  let cookie: string

  beforeAll(() => {
    publishSupabaseCredentials()
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl, max: 2 })
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    await pool.query(`update ministry set leader_noun = 'mentor', participant_noun = 'mentee' where id = $1`, [ministry.id])
    cookie = (await signIn(ministry)).cookie
  })

  const press = (path: string, fields: Record<string, string> = {}, as: string = cookie) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: as, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    })

  const sentIt = async () => {
    expect((await press(SEND, { agreed: 'yes' })).status).toBe(200)
    const response = await press(CONFIRM, { code: '000000' })
    expect(response.status).toBe(200)
    return (await response.json()) as { sent: true; left: number }
  }

  const texts = (body: string) => {
    const webhook = `${baseUrl}/sms/inbound`
    const form = { From: ministry.adminPhone, Body: body }
    return fetch(webhook, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': twilioSignature(twilioAuthToken!, webhook, form),
      },
      body: new URLSearchParams(form),
    })
  }

  const inbox = async (): Promise<string[]> => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where ministry_id = $1 and person_id = $2 order by enqueued_at, created_at`,
      [ministry.id, ministry.adminPersonId],
    )
    return rows.map((row) => row.body)
  }

  const sentOnes = async (): Promise<number> => {
    const { rows } = await pool.query<{ sent: number }>(
      `select count(*)::int as sent from outbound_message where ministry_id = $1 and sent_at is not null`,
      [ministry.id],
    )
    return rows[0]!.sent
  }

  describe('the card', () => {
    it('opens on the Overview with their own phone, the agreement, the first text and the button', async () => {
      const { html } = await getPage('/overview', cookie)
      const words = clean(html)

      expect(html).toContain(CARD)
      expect(words).toContain(
        'Riverside Chapel via Discipler: This is your test check-in, the same one your mentors get. Did you meet with your mentee this week? Reply 1 for yes, 2 for no.',
      )
      expect(words).toContain('the questions your mentors get each week.')
      expect(words).toContain('By sending, you agree to receive texts from Discipler at this number')
      expect(words).toContain('Send test')
    })

    it('is not read on a page where the modal is not opening', async () => {
      await press('/settings/setup-seen', { onboarding: 'yes', stay: 'yes' })
      const { html } = await getPage('/overview', cookie)
      expect(html).not.toContain(CARD)
    })

    it('is what Send test on the bar opens', async () => {
      const { html } = await getPage('/overview?onboarding=cards', cookie)
      expect(html).toContain(CARD)
    })
  })

  describe('sending one', () => {
    it('asks for a code, sends with it, and the first text goes by the record transport', async () => {
      const first = await press(SEND, { agreed: 'yes' })
      expect(first.status).toBe(200)
      expect(await first.json()).toMatchObject({ verify: true })
      expect(await inbox()).toEqual([])

      const answer = await press(CONFIRM, { code: '000000' })
      expect(answer.status).toBe(200)
      expect(await answer.json()).toEqual({ sent: true, left: 2 })

      const [text] = await inbox()
      expect(text).toContain('This is your test check-in')
      await vi.waitFor(async () => expect(await sentOnes()).toBe(1), { timeout: 15_000, interval: 200 })
    })

    it('says a wrong code with how many tries are left', async () => {
      await press(SEND, { agreed: 'yes' })
      const answer = await press(CONFIRM, { code: '111111' })

      expect(answer.status).toBe(422)
      expect(await answer.json()).toMatchObject({
        refusal: 'phone_check.wrong_code',
        triesLeft: 4,
        message: "That code doesn't match. Please check the text and try again. You have 4 more tries.",
      })
    })

    it('refuses an agreement that was not on the screen', async () => {
      const answer = await press(SEND)
      expect(answer.status).toBe(422)
      expect(await answer.json()).toMatchObject({ refusal: 'test_check_in.agreement_needed' })
    })

    it('refuses the fourth in a day in James\'s words, and opens the card that way', async () => {
      await sentIt()
      expect((await press(SEND)).status).toBe(200)
      expect((await press(SEND)).status).toBe(200)

      const fourth = await press(SEND)
      expect(fourth.status).toBe(429)
      const said =
        "You've sent three test check-ins today. Please try again tomorrow. If something isn't working, please email support@trydiscipler.com and we'll help. Thank you!"
      expect(await fourth.json()).toMatchObject({ refusal: 'test_check_in.limit_reached', message: said })

      expect(clean((await getPage('/overview?onboarding=cards', cookie)).html)).toContain(said)
    })

    it('answers somebody signed out with nothing sent', async () => {
      const answer = await press(SEND, { agreed: 'yes' }, '')
      expect(answer.status).toBe(401)
      expect(await inbox()).toEqual([])
    })
  })

  describe('a reply', () => {
    it('comes in on the webhook, walks the test and thanks them', async () => {
      await sentIt()

      expect((await texts('1')).status).toBe(200)
      expect((await inbox()).at(-1)).toContain('How did the meeting go?')

      expect((await texts('A')).status).toBe(200)
      expect((await inbox()).at(-1)).toContain(
        'Thank you! Glad you are getting to experience what Discipler can do for your ministry!!',
      )
    })
  })

  describe('what the pages say after', () => {
    it('ticks the bar for the church, and moves Next on', async () => {
      await sentIt()
      const { rows } = await pool.query(`select 1 from ministry_event where ministry_id = $1 and type = $2`, [
        ministry.id,
        SETUP_HISTORY.testCheckInSent,
      ])
      expect(rows).toHaveLength(1)

      expect(clean((await getPage('/roster', cookie)).html)).toContain('14% complete · 1 of 7')
    })

    it('shows on Check-Ins with a Test tag, and in none of its counts', async () => {
      await sentIt()
      await texts('1')
      await texts('D')
      await texts('He is struggling')

      const { html } = await getPage('/check-ins', cookie)
      const words = clean(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

      expect(words).toContain('Test check-ins')
      expect(words).toContain(`${ministry.adminName} Test Met, concern`)
      expect(words).toContain('0 Completed 0 Pending 0 Concerns')
      expect(words).toContain('Nothing sent yet this week')
      expect(words).not.toContain('struggling')
    })

    it('leaves Check-Ins with no such list before any test', async () => {
      expect(clean((await getPage('/check-ins', cookie)).html)).not.toContain('Test check-ins')
    })

    it('leaves the Overview and Follow-Up as they were', async () => {
      const followUpBefore = (await getPage('/follow-up', cookie)).html.includes('fu-list')
      await sentIt()
      await texts('1')
      await texts('D')
      await texts('He is struggling')
      expect((await getPage('/follow-up', cookie)).html.includes('fu-list')).toBe(followUpBefore)
      expect(clean((await getPage('/overview', cookie)).html)).not.toContain('He is struggling')
    })
  })
})
