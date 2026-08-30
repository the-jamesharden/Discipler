import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addMembership,
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  pairOneToOne,
  serviceRoleClient,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * One Leader's week, against the real database. The assertions are the messages
 * a Leader received, in the order they arrived, because that is the thing a
 * Ministry actually experiences -- the rows underneath are how it is remembered.
 */

describe('the check-in conversation', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const opened = new Date('2026-10-05T09:00:00Z')
  let clock = createTestClock(opened)
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('ABC Church')
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

  /** Someone who has completed Intake, so Discipler is permitted to text them. */
  const congregant = async (fullName: string) => {
    const id = personId(await addPerson(ministry, fullName, { phone: aNumber() }))
    await completeIntake(ministry, id)
    return id
  }

  const start = (person: PersonId) =>
    service().execute({ type: 'checkin.start', ministryId: ministry.id, personId: person })

  const texts = (person: PersonId, body: string) =>
    service().execute({ type: 'sms.inbound', ministryId: ministry.id, personId: person, body })

  /** Every message Discipler has queued for this Person, oldest first. */
  const inbox = async (person: PersonId): Promise<string[]> => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message
        where person_id = $1 order by enqueued_at, created_at`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  it('covers three relationships in one conversation, earliest first', async () => {
    const james = await congregant('James Harden')
    const emily = await congregant('Emily Shaw')
    const marcus = await congregant('Marcus Bell')
    const ade = await congregant('Ade Okafor')

    // Formed in June, March and September. The order they are asked in is the
    // order they started, never the order they were created in the database.
    await pairOneToOne(ministry, james, marcus, { createdAt: new Date('2026-06-01T09:00:00Z') })
    await pairOneToOne(ministry, james, emily, { createdAt: new Date('2026-03-02T09:00:00Z') })
    await pairOneToOne(ministry, james, ade, { createdAt: new Date('2026-09-07T09:00:00Z') })

    await start(james)
    // One conversation and one question. Three relationships do not mean three
    // threads, and the sequence advances only in response to a reply.
    expect(await inbox(james)).toEqual([
      'ABC Church: Did you meet with Emily Shaw this week? Reply 1 for yes, 2 for no. ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    ])

    // Emily: met, and a Concern.
    await texts(james, '1')
    await texts(james, 'C')
    await texts(james, 'He has lost his job.')
    // Marcus: did not meet. One reply, and straight on.
    await texts(james, '2')
    // Ade: met, and it went well.
    await texts(james, '1')
    await texts(james, 'A')

    expect((await inbox(james)).slice(1)).toEqual([
      'ABC Church: How did the meeting go? Reply A for outstanding, B for good, C for concern.',
      'ABC Church: Please tell us more about the concern.',
      'ABC Church: Did you meet with Marcus Bell this week? Reply 1 for yes, 2 for no.',
      'ABC Church: Did you meet with Ade Okafor this week? Reply 1 for yes, 2 for no.',
      'ABC Church: How did the meeting go? Reply A for outstanding, B for good, C for concern.',
      'ABC Church: Thank you. We’ll check in with you next week.',
    ])

    // Each answer against the relationship it was asked about, and against the
    // Person who sent it -- never the relationship alone.
    const { rows: answered } = await pool.query<{
      full_name: string
      question: string
      met: boolean | null
      satisfaction: string | null
      detail: string | null
      answered_by: string
      role: string
    }>(
      `select p.full_name, c.question, c.met, c.satisfaction, c.detail, c.answered_by, c.role
         from checkin_prompt c
         join checkin_sequence s on s.id = c.sequence_id
         join relationship_member m
           on m.relationship_id = c.relationship_id and m.role = 'participant'
         join person p on p.id = m.person_id
        where s.person_id = $1
        order by c.position, c.asked_at`,
      [james],
    )

    expect(answered).toEqual([
      { full_name: 'Emily Shaw', question: 'met', met: true, satisfaction: null, detail: null, answered_by: james, role: 'leader' },
      { full_name: 'Emily Shaw', question: 'satisfaction', met: null, satisfaction: 'concern', detail: null, answered_by: james, role: 'leader' },
      { full_name: 'Emily Shaw', question: 'concern_detail', met: null, satisfaction: null, detail: 'He has lost his job.', answered_by: james, role: 'leader' },
      { full_name: 'Marcus Bell', question: 'met', met: false, satisfaction: null, detail: null, answered_by: james, role: 'leader' },
      { full_name: 'Ade Okafor', question: 'met', met: true, satisfaction: null, detail: null, answered_by: james, role: 'leader' },
      { full_name: 'Ade Okafor', question: 'satisfaction', met: null, satisfaction: 'outstanding', detail: null, answered_by: james, role: 'leader' },
    ])

    const { rows: sequences } = await pool.query<{ outcome: string }>(
      `select outcome from checkin_sequence where person_id = $1`,
      [james],
    )
    expect(sequences).toEqual([{ outcome: 'completed' }])
  })

  it('clarifies twice, then keeps listening -- against the real cap', async () => {
    const leader = await congregant('Ivan Petrov')
    const participant = await congregant('Lena Vogt')
    await pairOneToOne(ministry, leader, participant)

    await start(leader)

    // Three replies Discipler cannot read. The third draws no clarification: the
    // cap is on what Discipler says, and both the command and the column enforce
    // it -- an increment past two lands on nothing rather than on a row claiming
    // Discipler spoke a third time.
    for (const body of ["it wasn't great", 'no concerns', '?']) {
      await texts(leader, body)
    }

    const clarification =
      'ABC Church: Sorry, we didn’t catch that. Reply 1 for yes, 2 for no.'
    expect(await inbox(leader)).toEqual([
      expect.stringContaining('Did you meet with Lena Vogt this week?'),
      clarification,
      clarification,
    ])

    const { rows: prompts } = await pool.query<{
      clarifications_sent: number
      answered_at: Date | null
    }>(
      `select p.clarifications_sent, p.answered_at
         from checkin_prompt p
         join checkin_sequence s on s.id = p.sequence_id
        where s.person_id = $1`,
      [leader],
    )
    expect(prompts).toEqual([{ clarifications_sent: 2, answered_at: null }])

    // Still listening. The question never closed, so the reply that finally makes
    // sense is heard and the conversation moves on.
    await texts(leader, 'Yes we did!')

    const { rows: answered } = await pool.query<{ met: boolean | null }>(
      `select p.met from checkin_prompt p
         join checkin_sequence s on s.id = p.sequence_id
        where s.person_id = $1 and p.question = 'met'`,
      [leader],
    )
    expect(answered).toEqual([{ met: true }])

    // And every unreadable reply is in history, verbatim, which is where the
    // enumerated list of synonyms and typos grows from.
    const { rows: unreadable } = await pool.query<{ body: string }>(
      `select payload->>'body' as body from ministry_event
        where type = 'checkin.reply_unreadable' and ministry_id = $1
        order by recorded_at`,
      [ministry.id],
    )
    expect(unreadable.map((row) => row.body)).toEqual([
      "it wasn't great",
      'no concerns',
      '?',
    ])
  })

  it('gives a Person who both leads and is discipled one sequence, covering what they lead', async () => {
    const priya = await congregant('Priya Raman')
    const one = await congregant('Nina Adeyemi')
    const two = await congregant('Tom Bright')
    const herLeader = await congregant('Ruth Callan')

    await pairOneToOne(ministry, priya, one, { createdAt: new Date('2026-04-01T09:00:00Z') })
    await pairOneToOne(ministry, priya, two, { createdAt: new Date('2026-05-01T09:00:00Z') })
    // She is discipled in this one. It is answered for by *its* Leader.
    await pairOneToOne(ministry, herLeader, priya, {
      createdAt: new Date('2026-02-01T09:00:00Z'),
    })

    await start(priya)

    const { rows } = await pool.query<{ covering: string[] }>(
      `select covering from checkin_sequence where person_id = $1`,
      [priya],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.covering).toHaveLength(2)

    // Two relationships, so two turns and one thank-you at the end of them.
    await texts(priya, '2')
    await texts(priya, '2')
    expect(await inbox(priya)).toEqual([
      'ABC Church: Did you meet with Nina Adeyemi this week? Reply 1 for yes, 2 for no. ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
      'ABC Church: Did you meet with Tom Bright this week? Reply 1 for yes, 2 for no.',
      'ABC Church: Thank you. We’ll check in with you next week.',
    ])
  })

  it('sends a Participant no check-in, and reads no Participant reply as an answer', async () => {
    const leader = await congregant('Grace Lin')
    const participant = await congregant('Sam Doyle')
    await pairOneToOne(ministry, leader, participant, {
      createdAt: new Date('2026-04-01T09:00:00Z'),
    })

    await start(leader)
    await start(participant)

    expect(await inbox(participant)).toEqual([])

    // Their Leader's question is open. A `1` from the Participant answers nothing:
    // resolution goes to *their* open sequence, and they have none.
    await texts(participant, '1')

    const { rows } = await pool.query<{ answered_at: Date | null }>(
      `select c.answered_at from checkin_prompt c
         join checkin_sequence s on s.id = c.sequence_id
        where s.person_id = $1`,
      [leader],
    )
    expect(rows).toEqual([{ answered_at: null }])
  })

  it('skips a relationship Awaiting Leader Acceptance and one that is Paused', async () => {
    const leader = await congregant('Owen Blake')
    const unaccepted = await congregant('Hana Sato')
    const paused = await congregant('Luis Ortiz')
    const asked = await congregant('Beth Nkomo')

    await pairOneToOne(ministry, leader, unaccepted, {
      createdAt: new Date('2026-01-01T09:00:00Z'),
      acceptedAt: null,
    })
    const pausedRelationship = await pairOneToOne(ministry, leader, paused, {
      createdAt: new Date('2026-02-01T09:00:00Z'),
    })
    await pairOneToOne(ministry, leader, asked, {
      createdAt: new Date('2026-03-01T09:00:00Z'),
    })

    // Pause lives in history rather than in a column. Ticket 12 is what writes
    // this event; appending it here is what lets the rule be proven before then.
    const { error } = await serviceRoleClient().from('ministry_event').insert({
      ministry_id: ministry.id,
      occurred_at: new Date('2026-09-01T09:00:00Z').toISOString(),
      type: 'relationship.paused',
      subject_type: 'relationship',
      subject_id: pausedRelationship,
      payload: {},
    })
    if (error) throw new Error(`Could not pause the relationship: ${error.message}`)

    await start(leader)

    // Only Beth's. Neither of the other two is asked about, so neither can accrue
    // an unanswered question against it.
    expect(await inbox(leader)).toEqual([
      'ABC Church: Did you meet with Beth Nkomo this week? Reply 1 for yes, 2 for no. ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    ])

    const { rows } = await pool.query<{ covering: string[] }>(
      `select covering from checkin_sequence where person_id = $1`,
      [leader],
    )
    expect(rows[0]?.covering).toHaveLength(1)
  })

  it('names everyone in a group rather than the relationship', async () => {
    const leader = await congregant('Nadia Rossi')
    const first = await congregant('Ken Amos')
    const second = await congregant('Ivy Chen')

    const group = await createRelationship(ministry, 'group', {
      createdAt: new Date('2026-04-01T09:00:00Z'),
    })
    await addMembership({ ministry, relationshipId: group, kind: 'group', personId: leader, role: 'leader' })
    for (const person of [first, second]) {
      await addMembership({ ministry, relationshipId: group, kind: 'group', personId: person, role: 'participant' })
    }

    await start(leader)
    expect((await inbox(leader))[0]).toContain('Did you meet with Ken Amos and Ivy Chen this week?')
  })

  it('opts a Person out on STOP, and stops texting them', async () => {
    const leader = await congregant('Rob Tiller')
    const participant = await congregant('Mia Frost')
    await pairOneToOne(ministry, leader, participant, {
      createdAt: new Date('2026-04-01T09:00:00Z'),
    })

    await start(leader)
    await texts(leader, 'STOP')

    const { rows } = await pool.query<{ person_id: string }>(
      `select person_id from person_opt_out where person_id = $1 and ended_at is null`,
      [leader],
    )
    expect(rows).toEqual([{ person_id: leader }])

    // The conversation ends with the opt-out, as abandoned: its unanswered
    // question stays unanswered, because an opt-out is not an answer.
    const { rows: sequences } = await pool.query<{ outcome: string | null }>(
      `select outcome from checkin_sequence where person_id = $1`,
      [leader],
    )
    expect(sequences).toEqual([{ outcome: 'abandoned' }])

    // A later text reaches no open question and asks nothing back, rather than
    // running into the outbound queue's refusal to text somebody who has opted out.
    await texts(leader, '1')
    expect(await inbox(leader)).toHaveLength(1)
  })

  it('carries the month’s opt-out language even when last month’s reply came in this one', async () => {
    // The conversation opened on 28 September; the Leader answered on 1 October,
    // which sent September's *next* question in October. October's own check-in is
    // still the first check-in of October and still carries the language.
    const leader = await congregant('Cara Wynn')
    const first = await congregant('Otis Bramble')
    const second = await congregant('Faye Underwood')
    await pairOneToOne(ministry, leader, first, { createdAt: new Date('2026-01-01T09:00:00Z') })
    await pairOneToOne(ministry, leader, second, { createdAt: new Date('2026-02-01T09:00:00Z') })

    const september = createTestClock(new Date('2026-09-28T09:00:00Z'))
    const on = (at: Date) => {
      september.advanceTo(at)
      return createCommandService({ clock: september, ids, store, appBaseUrl: 'https://discipler.test' })
    }

    await on(new Date('2026-09-28T09:00:00Z')).execute({
      type: 'checkin.start', ministryId: ministry.id, personId: leader,
    })
    // Answered on the 1st, which sends September's second question in October.
    await on(new Date('2026-10-01T09:00:00Z')).execute({
      type: 'sms.inbound', ministryId: ministry.id, personId: leader, body: '2',
    })
    await on(new Date('2026-10-05T09:00:00Z')).execute({
      type: 'checkin.start', ministryId: ministry.id, personId: leader,
    })

    expect((await inbox(leader)).at(-1)).toContain('Reply STOP to opt out')
  })

  it('binds an answer to the right relationship after an earlier one has ended', async () => {
    // The shape of a conversation is fixed when it opens. A relationship ending
    // mid-week must not shorten it: every question still to come is indexed by the
    // position stored against it, so a shortened list would file the next answer
    // against the wrong relationship.
    const leader = await congregant('Dev Anand')
    const leaving = await congregant('Tess Moreau')
    const staying = await congregant('Hugo Marsh')

    const ending = await pairOneToOne(ministry, leader, leaving, {
      createdAt: new Date('2026-01-01T09:00:00Z'),
    })
    const kept = await pairOneToOne(ministry, leader, staying, {
      createdAt: new Date('2026-02-01T09:00:00Z'),
    })

    await start(leader)

    // Tess's relationship ends between the question and the reply.
    const { error } = await serviceRoleClient()
      .from('relationship')
      .update({ ended_at: new Date().toISOString(), ended_reason: 'moved away' })
      .eq('id', ending)
    if (error) throw new Error(`Could not end the relationship: ${error.message}`)

    await texts(leader, '2')

    expect((await inbox(leader)).at(-1)).toBe(
      'ABC Church: Did you meet with Hugo Marsh this week? Reply 1 for yes, 2 for no.',
    )

    const { rows } = await pool.query<{ relationship_id: string; question: string }>(
      `select c.relationship_id, c.question from checkin_prompt c
         join checkin_sequence s on s.id = c.sequence_id
        where s.person_id = $1 order by c.step`,
      [leader],
    )
    expect(rows).toEqual([
      { relationship_id: ending, question: 'met' },
      { relationship_id: kept, question: 'met' },
    ])
  })

  it('runs one conversation at a time, and leaves the displaced one’s questions unanswered', async () => {
    const leader = await congregant('Ella Vance')
    const participant = await congregant('Josh Reid')
    await pairOneToOne(ministry, leader, participant, {
      createdAt: new Date('2026-04-01T09:00:00Z'),
    })

    await start(leader)
    clock.advanceTo(new Date('2026-10-12T09:00:00Z'))
    await start(leader)

    const { rows: sequences } = await pool.query<{ outcome: string | null }>(
      `select outcome from checkin_sequence where person_id = $1 order by started_at`,
      [leader],
    )
    expect(sequences).toEqual([{ outcome: 'abandoned' }, { outcome: null }])

    // The abandoned week's question stays unanswered. It is what the Stalled rule
    // reads, and answering it on the Leader's behalf would hide them going quiet.
    const { rows: unanswered } = await pool.query<{ count: string }>(
      `select count(*) from checkin_prompt c
         join checkin_sequence s on s.id = c.sequence_id
        where s.person_id = $1 and c.answered_at is null`,
      [leader],
    )
    expect(unanswered[0]?.count).toBe('2')
  })
})
