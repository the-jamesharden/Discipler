import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { AvailabilitySlot } from '~/domain/intake'
import { suggestedPairsPageFrom } from '~/platform/supabase/suggested-pairs-reader'
import {
  addPerson,
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  optOut,
  pairOneToOne,
  recordConsentDecision,
  signInAs,
  signInWith,
  type MinistryFixture,
} from '../support/local-supabase'
import { asDocument, asRows } from '../support/page-document'
import { offersToMentor } from '../support/pair-popup'

/**
 * Suggested Pairs as a signed-in Admin reads it (core operating loop, ticket 04):
 * the page's one document, through `suggestion_inputs` and the Roster, into the
 * ranking. The ranking's own rules are pinned in `tests/domain/suggested-pairs.test.ts`;
 * these prove the document feeds it what the database holds, and nobody else.
 */

const clock = createTestClock(new Date('2026-09-22T12:00:00Z'))

const slots = (...keys: string[]): AvailabilitySlot[] =>
  keys.map((key) => {
    const [day, hour] = key.split(':') as [AvailabilitySlot['day'], AvailabilitySlot['hour']]
    return { day, hour }
  })

const FOUR_ACROSS_TWO_DAYS = slots('monday:18', 'monday:19', 'thursday:18', 'thursday:19')

describe('Suggested Pairs, read as the Admin', () => {
  let pool: pg.Pool
  let ministry: MinistryFixture
  let grace: string
  let ana: string
  let zoe: string
  let james: string

  const read = async () => {
    const admin = await signInAs(ministry)
    const { data, error } = await admin.rpc('suggested_pairs_page')
    expect(error).toBeNull()
    return suggestedPairsPageFrom(asDocument(data), clock)
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    ministry = await createMinistryWithAdmin('Suggestion Chapel')

    grace = await addPerson(ministry, 'Grace Lee', { answers: { availability: FOUR_ACROSS_TWO_DAYS } })
    await offersToMentor(pool, ministry, grace)
    ana = await addPerson(ministry, 'Ana Ruiz', { answers: { availability: FOUR_ACROSS_TWO_DAYS } })
    zoe = await addPerson(ministry, 'Zoe Park', { answers: { availability: slots('sunday:08') } })
    james = await addPerson(ministry, 'James Park', {
      answers: { gender: 'male', availability: FOUR_ACROSS_TWO_DAYS },
    })
  })

  afterAll(async () => {
    await pool.end()
  })

  it('suggests a Discipler for a Disciple with a label, a reason and no number', async () => {
    const { suggestions } = await read()
    const goal = await pool.query<{ label: string }>(
      `select label from discipleship_goal where ministry_id = $1 order by position limit 1`,
      [ministry.id],
    )

    expect(suggestions.pairs.map((pair) => [pair.leader.fullName, pair.participant.fullName, pair.tier])).toEqual([
      ['Grace Lee', 'Ana Ruiz', 'excellent'],
    ])
    expect(suggestions.pairs[0]!.reason).toBe(`Four shared time slots. You both selected ${goal.rows[0]!.label}.`)
    expect(suggestions.pairs[0]!.participant.ageBand).toBe('25-34')
  })

  it('lists who shares no time with any Discipler separately, and never the gender rule as the reason', async () => {
    const { suggestions } = await read()
    // Zoe overlaps nobody; James overlaps Grace but the gender match removes her.
    expect(suggestions.noScheduleOverlap.map((person) => person.fullName).sort()).toEqual(['James Park', 'Zoe Park'])
    expect(JSON.stringify(suggestions)).not.toMatch(/gender|male/i)
  })

  it('reads the gender match and the age band gap off the Ministry, not constants', async () => {
    await pool.query(`update ministry set suggest_gender_match = false where id = $1`, [ministry.id])
    try {
      const { suggestions } = await read()
      expect(suggestions.pairs.map((pair) => pair.participant.fullName).sort()).toEqual(['Ana Ruiz', 'James Park'])
    } finally {
      await pool.query(`update ministry set suggest_gender_match = true where id = $1`, [ministry.id])
    }

    await pool.query(
      `update intake_submission set age_band = '35-44' where person_id = $1`,
      [ana],
    )
    await pool.query(`update ministry set suggest_max_age_band_gap = 0 where id = $1`, [ministry.id])
    try {
      expect((await read()).suggestions.pairs).toEqual([])
    } finally {
      await pool.query(`update ministry set suggest_max_age_band_gap = 1 where id = $1`, [ministry.id])
      await pool.query(`update intake_submission set age_band = '25-34' where person_id = $1`, [ana])
    }
    expect((await read()).suggestions.pairs).toHaveLength(1)
  })

  it('leaves out somebody who opted out, and somebody whose latest decision on texts is no', async () => {
    const other = await createMinistryWithAdmin('Suggestion Chapel Two')
    const ruth = await addPerson(other, 'Ruth Obi', { answers: { availability: FOUR_ACROSS_TWO_DAYS } })
    await offersToMentor(pool, other, ruth)
    const mia = await addPerson(other, 'Mia Chen', { answers: { availability: FOUR_ACROSS_TWO_DAYS } })
    const eve = await addPerson(other, 'Eve Stone', { answers: { availability: FOUR_ACROSS_TWO_DAYS } })
    await optOut(other, mia)
    // Stamped by this process's clock, as her Intake's grant was: the database's
    // `now()` can sit behind it, and then the grant would read as her latest decision.
    await recordConsentDecision(other, eve, 'sms', false)

    const admin = await signInAs(other)
    const { suggestions } = suggestedPairsPageFrom(asDocument((await admin.rpc('suggested_pairs_page')).data), clock)
    expect(suggestions.pairs).toEqual([])
    expect(suggestions.noScheduleOverlap).toEqual([])
  })

  it('recalculates the moment a pairing takes somebody out of the pool', async () => {
    const other = await createMinistryWithAdmin('Suggestion Chapel Three')
    const ruth = await addPerson(other, 'Ruth Obi', { answers: { availability: FOUR_ACROSS_TWO_DAYS } })
    await offersToMentor(pool, other, ruth)
    const leader = await addPerson(other, 'Lydia Grant', { answers: { availability: slots('friday:08') } })
    const mia = await addPerson(other, 'Mia Chen', { answers: { availability: FOUR_ACROSS_TWO_DAYS } })

    const admin = await signInAs(other)
    const before = suggestedPairsPageFrom(asDocument((await admin.rpc('suggested_pairs_page')).data), clock)
    expect(before.suggestions.pairs.map((pair) => pair.participant.fullName)).toEqual(['Mia Chen'])

    await pairOneToOne(other, leader, mia)
    const after = suggestedPairsPageFrom(asDocument((await admin.rpc('suggested_pairs_page')).data), clock)
    expect(after.suggestions.pairs.map((pair) => pair.participant.fullName)).not.toContain('Mia Chen')
    // Lydia leads now, so she is a Discipler and not somebody nobody can place.
    expect(after.suggestions.noScheduleOverlap.map((person) => person.fullName)).not.toContain('Lydia Grant')
  })

  it('carries the inputs of this Ministry to its Admin and to nobody else', async () => {
    const admin = await signInAs(ministry)
    const rows = asRows(
      (await admin.rpc('suggestion_inputs', { target_ministry_id: ministry.id })).data,
    )
    expect(rows.map((row) => row.person_id).sort()).toEqual([grace, ana, zoe, james].sort())
    const anas = rows.find((row) => row.person_id === ana)!
    expect(anas.availability).toEqual(['monday:18', 'monday:19', 'thursday:18', 'thursday:19'])
    expect(anas.consents_to_texts).toBe(true)

    // Another Ministry's Admin, asking about this one by name.
    const other = await createMinistryWithAdmin('The Chapel Next Door')
    const theirs = await signInAs(other)
    const across = await theirs.rpc('suggestion_inputs', { target_ministry_id: ministry.id })
    expect(asRows(across.data)).toEqual([])

    // A Leader of this Ministry, who reads the people they lead and never their answers.
    const leader = await addPersonWithAccount(ministry, 'Lee Leader', 'leader')
    const led = await signInWith(leader)
    expect(asRows((await led.rpc('suggestion_inputs', { target_ministry_id: ministry.id })).data)).toEqual([])
  })

  it('is not executable by somebody with no session', async () => {
    const { apiUrl, anonKey } = localSupabase()
    const anon = createClient(apiUrl, anonKey, { auth: { persistSession: false } })
    const { error } = await anon.rpc('suggestion_inputs', { target_ministry_id: ministry.id })
    expect(error).not.toBeNull()
  })
})
