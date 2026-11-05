import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestClock, hours, type TestClock } from '~/domain/clock'
import { TEST_CARD_CONSENT_VERSION } from '~/domain/consent'
import { TestCheckInRefused } from '~/domain/errors'
import { SETUP_HISTORY } from '~/domain/setup-meter'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { TEST_CHECK_IN_OPEN_HOURS } from '~/domain/launch-terms'
import { createPostgresEffectStore, createPostgresInboundReader } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createPostgresPhoneChecks, type PostgresPhoneChecks } from '~/platform/supabase/phone-checks'
import { createCommandService } from '~/service/command-service'
import { dispatchQueue } from '~/service/outbound-dispatch'
import { createPhoneCheck } from '~/service/phone-check'
import type { MessageTransport } from '~/service/ports'
import { createTestCheckIn } from '~/service/test-check-in'
import { noDailyCap } from '../support/daily-cap'
import {
  addPerson,
  aTestPhoneNumber,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  optOut,
  pairOneToOne,
  recordConsentDecision,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'
import { createScriptedVerifier } from '../support/phone-verifier'

/**
 * The test check-in against the real tables (Exponential launch, ticket 28): the reply
 * router, the queue, the consent, the phone check and what it does not touch. The first
 * text is asserted as James's words; what a Leader's week looks like is asserted by
 * reading what a page reads, so the "counted nowhere" claim is about the product and not
 * about a table this suite happens to look at. Twilio is the scripted stand-in, and the
 * transport writes down what it would have sent.
 */

const THE_FIRST_TEXT =
  'Riverside Chapel via Discipler: This is your test check-in, the same one your mentors get. Did you meet with your mentee this week? Reply 1 for yes, 2 for no.'

describe('the test check-in', { timeout: 60_000 }, () => {
  const ids: IdSource = { next: () => crypto.randomUUID() }
  let pool: pg.Pool
  let store: ReturnType<typeof createPostgresEffectStore>
  let queue: ReturnType<typeof createPostgresOutboundQueue>
  let inbound: ReturnType<typeof createPostgresInboundReader>
  let checks: PostgresPhoneChecks

  let clock: TestClock
  let twilio: ReturnType<typeof createScriptedVerifier>
  let ministry: MinistryFixture
  let admin: { userId: string; ministryId: MinistryFixture['id'] }
  let person: PersonId
  let delivered: { to: string; body: string }[]

  const transport: MessageTransport = {
    async deliver(_from, to, body) {
      delivered.push({ to, body })
    },
  }

  const service = () => createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  const tests = () =>
    createTestCheckIn({
      commands: service(),
      phoneCheck: createPhoneCheck({ checks, verifier: twilio.verifier, clock }),
      clock,
    })

  const drain = () =>
    dispatchQueue({ queue, transport, clock, ministryId: ministry.id, dailyCap: noDailyCap })

  /** As `app/sms/inbound/route.ts` does: who it is from, then the command, then the send. */
  const texts = async (body: string, from: string = ministry.adminPhone) => {
    const sender = await inbound.resolveSender(from, null)
    if (!sender) throw new Error(`Nobody resolved for ${from}`)
    await service().execute({ type: 'sms.inbound', ministryId: sender.ministryId, personId: sender.personId, body })
    await drain()
  }

  const verified = async () => {
    await tests().press(admin, { agreed: true })
    return tests().confirm(admin, '123456')
  }

  const row = async () => {
    const { rows } = await pool.query(
      `select id, question, met, satisfaction, ended_how, ended_at
         from test_check_in where ministry_id = $1 order by opened_at desc, id limit 1`,
      [ministry.id],
    )
    return rows[0]
  }

  const queued = async () => {
    const { rows } = await pool.query<{ body: string; message_kind: string; sent_at: Date | null; withheld_reason: string | null }>(
      `select body, message_kind, sent_at, withheld_reason
         from outbound_message where ministry_id = $1 order by enqueued_at, created_at`,
      [ministry.id],
    )
    return rows
  }

  /** What Overview and Check-Ins read, as the signed-in Admin reads it, but for the bar. */
  const whatThePagesRead = async () => {
    const client = await signInAs(ministry)
    const [overview, checkIns] = await Promise.all([client.rpc('overview_page'), client.rpc('check_ins_page')])
    return {
      overview: (overview.data as { history: unknown }).history,
      checkIns: (checkIns.data as { history: unknown }).history,
    }
  }

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    queue = createPostgresOutboundQueue(localSupabase().databaseUrl)
    inbound = createPostgresInboundReader(localSupabase().databaseUrl)
    checks = createPostgresPhoneChecks(localSupabase().databaseUrl)
  })

  afterAll(async () => {
    await store.close()
    await queue.close()
    await inbound.close()
    await checks.close()
    await pool.end()
  })

  beforeEach(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    admin = { userId: ministry.adminUserId, ministryId: ministry.id }
    person = personId(ministry.adminPersonId)
    clock = createTestClock(new Date())
    twilio = createScriptedVerifier()
    delivered = []
    await pool.query(`update ministry set leader_noun = 'mentor', participant_noun = 'mentee' where id = $1`, [ministry.id])
  })

  describe('pressing the button', () => {
    it('asks for a code first, and sends the test once it is typed', async () => {
      expect(await tests().press(admin, { agreed: true })).toEqual({ verify: true, phone: ministry.adminPhone })
      expect(twilio.sent).toEqual([ministry.adminPhone])
      expect(await queued()).toEqual([])

      expect(await tests().confirm(admin, '123456')).toEqual({ sent: true, left: 2 })
      await drain()

      expect(delivered.map(({ to }) => to)).toEqual([ministry.adminPhone])
      expect(delivered[0]!.body).toContain(THE_FIRST_TEXT)
    })

    it('never asks for a code again on that phone', async () => {
      await verified()
      expect(await tests().press(admin, { agreed: false })).toEqual({ sent: true, left: 1 })
      expect(twilio.sent).toHaveLength(1)
    })

    it('says a wrong code and sends nothing', async () => {
      await tests().press(admin, { agreed: true })
      expect(await tests().confirm(admin, '000000')).toEqual({ refusal: 'phone_check.wrong_code', triesLeft: 4 })
      expect(await queued()).toEqual([])
    })

    it('refuses a number Verify cannot reach before anything is asked or kept', async () => {
      await pool.query(`update person set phone = '+14165550142' where id = $1`, [person])

      expect(await tests().press(admin, { agreed: true })).toEqual({ refusal: 'phone_check.not_us' })

      expect(twilio.sent).toEqual([])
      const { rows } = await pool.query(`select 1 from consent_record where person_id = $1 and source = 'ministry_setup'`, [person])
      expect(rows).toEqual([])
    })

    it('spends no code on a test that would be refused', async () => {
      await optOut(ministry, person)
      expect(await tests().press(admin, { agreed: true })).toEqual({ refusal: 'test_check_in.opted_out' })
      expect(twilio.sent).toEqual([])
    })

    it('answers an Admin with no Roster row with no phone to text', async () => {
      await pool.query(`update person set user_id = null where id = $1`, [person])
      expect(await tests().press(admin, { agreed: true })).toEqual({ refusal: 'test_check_in.no_phone' })
    })

    it('is refused for a church with no access to texting', async () => {
      ministry = await createMinistryWithAdmin('Riverside Chapel', undefined, { billedOutsideStripe: false })
      admin = { userId: ministry.adminUserId, ministryId: ministry.id }
      expect(await tests().press(admin, { agreed: true })).toEqual({ refusal: 'test_check_in.church_has_no_access' })
      expect(twilio.sent).toEqual([])
    })
  })

  describe('the agreement', () => {
    it('is asked of an Admin from before sign-up', async () => {
      const card = await tests().card(admin)
      expect(card.needsAgreement).toBe(true)
      expect(await tests().press(admin, { agreed: false })).toEqual({ refusal: 'test_check_in.agreement_needed' })
      expect(twilio.sent, 'no text, not even a code, before they agree').toEqual([])
    })

    it('is kept as their consent, in the wording they saw, before the code goes', async () => {
      await tests().press(admin, { agreed: true })

      const { rows } = await pool.query(
        `select consent, granted, version, source from consent_record where person_id = $1 order by decided_at desc limit 1`,
        [person],
      )
      expect(rows).toEqual([
        { consent: 'sms', granted: true, version: TEST_CARD_CONSENT_VERSION, source: 'ministry_setup' },
      ])
      expect((await tests().card(admin)).needsAgreement).toBe(false)
    })

    it('is kept once, however many they send', async () => {
      await verified()
      await tests().press(admin, { agreed: false })
      const { rows } = await pool.query(`select 1 from consent_record where person_id = $1 and source = 'ministry_setup'`, [person])
      expect(rows).toHaveLength(1)
    })

    it('does not overturn a later no to texts', async () => {
      await verified()
      clock.advanceBy(1000)
      await recordConsentDecision(ministry, person, 'sms', false, clock.now())
      expect(await tests().press(admin, { agreed: true })).toEqual({ refusal: 'test_check_in.declined' })
    })

    it('is refused by the command too, whatever a route was told', async () => {
      await expect(
        service().execute({ type: 'test_check_in.send', ministryId: ministry.id, sentBy: ministry.adminUserId }),
      ).rejects.toThrow(new TestCheckInRefused('test_check_in.agreement_needed'))
    })
  })

  describe('the first text', () => {
    it('carries the rates line the once a month it should', async () => {
      await verified()
      await drain()
      await tests().press(admin, { agreed: false })
      const [first, second] = await queued()

      expect(first!.body).toBe(`${THE_FIRST_TEXT} Msg & data rates may apply. Reply STOP to opt out, HELP for help.`)
      expect(second!.body).toBe(THE_FIRST_TEXT)
    })

    it('is a text that holds nothing up', async () => {
      await verified()
      expect((await queued())[0]!.message_kind).toBe('no_reply')
    })

    it('is drawn on the card as it would go, without the rates line', async () => {
      expect((await tests().card(admin)).firstText).toBe(THE_FIRST_TEXT)
    })

    it("uses the church's words, through the same composer, and keeps them for its life", async () => {
      await pool.query(
        `update ministry set checkin_question_sentence = 'Did you get together with [name] lately?' where id = $1`,
        [ministry.id],
      )
      await verified()
      expect((await queued())[0]!.body).toContain(
        'Riverside Chapel via Discipler: This is your test check-in, the same one your mentors get. Did you get together with your mentee lately? Reply 1 for yes, 2 for no.',
      )
      await pool.query(`update ministry set checkin_rating_sentence = 'So how was it?' where id = $1`, [ministry.id])
      await texts('1')
      expect((await queued()).at(-1)!.body).toBe(
        'Riverside Chapel via Discipler: How did the meeting go? Reply A for outstanding, B for good, C for okay, D for concern.',
      )
    })

    it('ticks the setup step, the one thing about it that is kept as history', async () => {
      await verified()
      const { rows } = await pool.query(
        `select type from ministry_event where ministry_id = $1 and type = $2`,
        [ministry.id, SETUP_HISTORY.testCheckInSent],
      )
      expect(rows).toHaveLength(1)
    })
  })

  describe('the replies', () => {
    beforeEach(async () => {
      await verified()
      await drain()
      delivered = []
    })

    it('walks the same three questions as a real check-in, then thanks them', async () => {
      await texts('1')
      await texts('D')
      await texts('He is struggling')

      expect(delivered.map(({ body }) => body)).toEqual([
        'Riverside Chapel via Discipler: How did the meeting go? Reply A for outstanding, B for good, C for okay, D for concern.',
        'Riverside Chapel via Discipler: Please tell us more about the concern.',
        'Riverside Chapel via Discipler: Thank you! Glad you are getting to experience what Discipler can do for your ministry!!',
      ])
      expect(await row()).toMatchObject({ met: true, satisfaction: 'concern', ended_how: 'completed' })
    })

    it('finishes after a no', async () => {
      await texts('2')
      expect(await row()).toMatchObject({ met: false, ended_how: 'completed' })
      expect(delivered.at(-1)!.body).toContain('Thank you! Glad you are getting')
    })

    it('reads a reply it cannot read as a real check-in does', async () => {
      await texts('maybe')
      expect(await row()).toMatchObject({ question: 'met', ended_how: null })
      expect(delivered.at(-1)!.body).toContain('Sorry, we didn’t catch that.')
    })

    it('counts in nothing an Admin is shown', async () => {
      const before = await whatThePagesRead()

      await texts('1')
      await texts('D')
      await texts('He is struggling')

      expect(await whatThePagesRead()).toEqual(before)

      const answered = await pool.query(`select 1 from checkin_prompt p join checkin_sequence s on s.id = p.sequence_id where s.ministry_id = $1`, [ministry.id])
      const concerns = await pool.query(`select 1 from concern where ministry_id = $1`, [ministry.id])
      const followUps = await pool.query(`select 1 from follow_up_item where ministry_id = $1`, [ministry.id])
      expect([answered.rows, concerns.rows, followUps.rows]).toEqual([[], [], []])
      const { rows: kept } = await pool.query(`select to_jsonb(t) as test from test_check_in t where ministry_id = $1`, [ministry.id])
      expect(JSON.stringify(kept), 'what a concern said is not kept').not.toContain('struggling')
    })

    it('answers STOP as ever, and the test is over', async () => {
      await texts('STOP')
      expect(await row()).toMatchObject({ ended_how: 'opted_out' })
      expect(await tests().press(admin, { agreed: false })).toEqual({ refusal: 'test_check_in.opted_out' })
    })

    it('answers HELP, and asks nothing of a person or of Follow-Up', async () => {
      await texts('HELP')
      expect(await row()).toMatchObject({ question: 'met', ended_how: null })
      const { rows } = await pool.query(`select 1 from follow_up_item where ministry_id = $1`, [ministry.id])
      expect(rows).toEqual([])
    })

    it('reads PAUSE as a reply to it, not as a keyword, while it is open', async () => {
      await texts('PAUSE')
      expect(await row()).toMatchObject({ question: 'met', ended_how: null })
      expect(delivered.at(-1)!.body).toContain('Sorry, we didn’t catch that.')
    })
  })

  describe('its hour', () => {
    beforeEach(async () => {
      await verified()
      await drain()
      delivered = []
    })

    it('closes on the tick, with nothing texted', async () => {
      clock.advanceBy(hours(TEST_CHECK_IN_OPEN_HOURS))
      await service().execute({ type: 'scheduled.tick', ministryId: ministry.id })
      await drain()

      expect(await row()).toMatchObject({ ended_how: 'timed_out' })
      expect(delivered).toEqual([])
    })

    it('runs from the question last asked', async () => {
      clock.advanceBy(hours(TEST_CHECK_IN_OPEN_HOURS) - 1000)
      await texts('1')
      clock.advanceBy(hours(TEST_CHECK_IN_OPEN_HOURS) - 1000)
      await texts('B')
      expect(await row()).toMatchObject({ satisfaction: 'good', ended_how: 'completed' })
    })

    it('is exact, so a 1 just past it is handled as if there were no test', async () => {
      clock.advanceBy(hours(TEST_CHECK_IN_OPEN_HOURS))
      await texts('1')

      expect(await row()).toMatchObject({ question: 'met', met: null, ended_how: 'timed_out' })
      expect(delivered.map(({ body }) => body).join()).not.toContain('How did the meeting go?')
    })

    it('takes with it a question still on the queue', async () => {
      await texts('1')
      await pool.query(
        `update outbound_message set sent_at = null where ministry_id = $1 and body like '%How did the meeting go?%'`,
        [ministry.id],
      )
      clock.advanceBy(hours(TEST_CHECK_IN_OPEN_HOURS))
      await service().execute({ type: 'scheduled.tick', ministryId: ministry.id })

      expect((await queued()).at(-1)).toMatchObject({ sent_at: null, withheld_reason: 'test_check_in_ended' })
    })
  })

  describe('a real check-in', () => {
    const anAdminWhoLeads = async () => {
      await completeIntake(ministry, person)
      const disciple = personId(await addPerson(ministry, 'Emily Shaw', { phone: aTestPhoneNumber() }))
      await completeIntake(ministry, disciple)
      await pairOneToOne(ministry, person, disciple)
    }

    it('closes the test as it opens, and the reply lands on it', async () => {
      await anAdminWhoLeads()
      await verified()
      await drain()

      await service().execute({ type: 'checkin.start', ministryId: ministry.id, personId: person })
      expect(await row()).toMatchObject({ ended_how: 'gave_way' })
      await drain()

      await texts('1')

      const { rows } = await pool.query(
        `select p.met from checkin_prompt p join checkin_sequence s on s.id = p.sequence_id where s.person_id = $1`,
        [person],
      )
      expect(rows[0]).toEqual({ met: true })
      expect(await row()).toMatchObject({ met: null })
    })

    it('refuses a test with it open on the phone, in James\'s words on the card', async () => {
      await anAdminWhoLeads()
      await tests().press(admin, { agreed: true })
      await tests().confirm(admin, '123456')
      await service().execute({ type: 'checkin.start', ministryId: ministry.id, personId: person })
      await drain()

      expect(await tests().press(admin, { agreed: false })).toEqual({ refusal: 'test_check_in.real_question_open' })
    })

    it('counts a question on the phone that is for somebody else who shares it', async () => {
      await verified()
      await drain()
      await texts('2')
      const sharer = personId(await addPerson(ministry, 'Sam Shared', { phone: ministry.adminPhone }))
      await completeIntake(ministry, sharer)
      const disciple = personId(await addPerson(ministry, 'Ade Okafor', { phone: aTestPhoneNumber() }))
      await completeIntake(ministry, disciple)
      await pairOneToOne(ministry, sharer, disciple)
      await service().execute({ type: 'checkin.start', ministryId: ministry.id, personId: sharer })

      expect(await tests().press(admin, { agreed: false })).toEqual({ refusal: 'test_check_in.real_question_open' })
    })
  })

  describe('the limit and Send another', () => {
    it('refuses the fourth in a day, in that church\'s day', async () => {
      await verified()
      await tests().press(admin, { agreed: false })
      expect(await tests().press(admin, { agreed: false })).toEqual({ sent: true, left: 0 })

      expect(await tests().press(admin, { agreed: false })).toEqual({ refusal: 'test_check_in.limit_reached' })
      expect(await queued()).toHaveLength(3)
      expect(await tests().card(admin)).toMatchObject({ refusal: 'test_check_in.limit_reached', left: 0, sentToday: 3 })

      clock.advanceBy(hours(24))
      expect(await tests().press(admin, { agreed: false })).toEqual({ sent: true, left: 2 })
    })

    it('counts per Admin, not per church', async () => {
      await verified()
      await tests().press(admin, { agreed: false })
      await tests().press(admin, { agreed: false })
      await pool.query(`update test_check_in set sent_by = (select id from auth.users where id <> $1 limit 1) where ministry_id = $2`, [ministry.adminUserId, ministry.id])
      expect((await tests().card(admin)).sentToday).toBe(0)
    })

    it('replaces the one still open, and takes back what it had still to say', async () => {
      await verified()
      await tests().press(admin, { agreed: false })

      const { rows } = await pool.query(
        `select ended_how, count(*)::int as tests from test_check_in where ministry_id = $1 group by ended_how order by ended_how`,
        [ministry.id],
      )
      expect(rows).toEqual([
        { ended_how: 'replaced', tests: 1 },
        { ended_how: null, tests: 1 },
      ])
      const [first, second] = await queued()
      expect(first!.withheld_reason).toBe('test_check_in_ended')
      expect(second!.withheld_reason).toBeNull()
    })
  })

  describe('whose reply it is', () => {
    it('finds the test on a phone two people on the Roster share, which resolves to nobody else', async () => {
      await addPerson(ministry, 'Sam Shared', { phone: ministry.adminPhone })
      expect(await inbound.resolveSender(ministry.adminPhone, null), 'as it was before').toBeNull()

      await verified()
      await drain()
      expect(await inbound.resolveSender(ministry.adminPhone, null)).toEqual({ ministryId: ministry.id, personId: person })

      await texts('2')
      expect(await inbound.resolveSender(ministry.adminPhone, null), 'and as it is after').toBeNull()
    })

    it('looks to the number texted when a phone has a test open in two churches', async () => {
      await verified()
      await drain()
      const { rows: firsts } = await pool.query<{ sending_number: string }>(
        `select sending_number from sending_number_assignment where ministry_id = $1 and phone = $2`,
        [ministry.id, ministry.adminPhone],
      )
      const first = firsts[0]!.sending_number

      const phone = ministry.adminPhone
      const other = await createMinistryWithAdmin('Second Chapel')
      await pool.query(`update person set phone = $2 where id = $1`, [other.adminPersonId, phone])
      await pool.query(
        `insert into test_check_in (id, ministry_id, person_id, sent_by, phone, opened_at, question, asked_at, subject, words)
         select gen_random_uuid(), $1, $2, $3, $4, now(), 'met', now(), 'your mentee', words from test_check_in where ministry_id = $5`,
        [other.id, other.adminPersonId, other.adminUserId, phone, ministry.id],
      )

      expect(await inbound.resolveSender(phone, first)).toEqual({ ministryId: ministry.id, personId: person })
      expect(await inbound.resolveSender(phone, null), 'no way to tell which').toBeNull()
    })
  })

  describe('Check-Ins', () => {
    it('lists it apart, and the week is as it was', async () => {
      const client = await signInAs(ministry)
      await verified()

      const { data } = await client.rpc('check_ins_page')
      expect((data as { test_check_ins: unknown[] }).test_check_ins).toEqual([
        expect.objectContaining({ full_name: ministry.adminName, ended_how: null, met: null }),
      ])
    })

    it('is another church\'s to see only', async () => {
      await verified()
      const other = await createMinistryWithAdmin('Second Chapel')
      const client = await signInAs(other)

      const { data } = await client.rpc('check_ins_page')
      expect((data as { test_check_ins: unknown[] }).test_check_ins).toEqual([])
      const { data: rows } = await client.from('test_check_in').select('id')
      expect(rows).toEqual([])
    })
  })
})
