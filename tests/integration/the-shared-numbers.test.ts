import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { personId, type MinistryId, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore, createPostgresInboundReader } from '~/platform/supabase/effect-store'
import { createPostgresOutboundQueue } from '~/platform/supabase/outbound-queue'
import { createPostgresSharedNumbers } from '~/platform/supabase/shared-numbers'
import { createCommandService } from '~/service/command-service'
import {
  aTestPhoneNumber,
  addASharedNumber,
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * Every church sends from one shared set of Discipler numbers (Exponential launch,
 * ticket 06). Each (phone, church) pair is given one the first time that church texts
 * that phone and keeps it; a phone in two churches hears from a different number for
 * each, and the number a reply was sent to says which church it is for.
 *
 * The set here is the whole local one, which every suite adds to, so nothing below
 * asserts which number a pair is given: only that it is one of the set, that it is
 * kept, and that two churches never share one for a phone.
 */
describe('The shared numbers', () => {
  let riverside: MinistryFixture
  let northgate: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let queue: ReturnType<typeof createPostgresOutboundQueue>
  let inbound: ReturnType<typeof createPostgresInboundReader>
  let shared: ReturnType<typeof createPostgresSharedNumbers>
  let pool: pg.Pool
  const at = new Date('2026-11-09T15:00:00Z')

  beforeAll(async () => {
    riverside = await createMinistryWithAdmin('Riverside Chapel')
    northgate = await createMinistryWithAdmin('Northgate Fellowship')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    queue = createPostgresOutboundQueue(localSupabase().databaseUrl)
    inbound = createPostgresInboundReader(localSupabase().databaseUrl)
    shared = createPostgresSharedNumbers(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await queue.close()
    await inbound.close()
    await shared.close()
    await pool.end()
  })

  const isShared = async (number: string | null): Promise<boolean> => {
    const { rows } = await pool.query(`select 1 from shared_number where phone = $1`, [number])
    return rows.length === 1
  }

  /** The same phone on both Rosters: one human in two churches. */
  const inBothChurches = async (fullName: string) => {
    const phone = aTestPhoneNumber()
    return {
      phone,
      atRiverside: personId(await addPerson(riverside, fullName, { phone })),
      atNorthgate: personId(await addPerson(northgate, fullName, { phone })),
    }
  }

  const service = () =>
    createCommandService({
      clock: createTestClock(new Date()),
      ids: { next: () => crypto.randomUUID() },
      store,
      appBaseUrl: 'https://discipler.test',
    })

  const inbox = async (person: PersonId): Promise<string[]> => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at, created_at`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  it('gives a new church a shared number for its first person, with no operator step', async () => {
    const phone = aTestPhoneNumber()
    await addPerson(riverside, 'Emily Johnson', { phone })

    const number = await queue.sendingNumberFor(riverside.id, phone, at)

    expect(await isShared(number)).toBe(true)
  })

  it('keeps the number a pair was given, every time after', async () => {
    const phone = aTestPhoneNumber()
    await addPerson(riverside, 'Naomi Okafor', { phone })

    const first = await queue.sendingNumberFor(riverside.id, phone, at)
    const again = await queue.sendingNumberFor(riverside.id, phone, new Date('2026-11-16T15:00:00Z'))

    expect(again).toBe(first)
    const { rows } = await pool.query<{ assigned_at: Date }>(
      `select assigned_at from sending_number_assignment where ministry_id = $1 and phone = $2`,
      [riverside.id, phone],
    )
    // Given on the drain's clock the first time, and never re-given.
    expect(rows).toEqual([{ assigned_at: at }])
  })

  it('texts a person in two churches from a different number for each', async () => {
    const both = await inBothChurches('Grace Lee')

    const fromRiverside = await queue.sendingNumberFor(riverside.id, both.phone, at)
    const fromNorthgate = await queue.sendingNumberFor(northgate.id, both.phone, at)

    expect(await isShared(fromRiverside)).toBe(true)
    expect(await isShared(fromNorthgate)).toBe(true)
    expect(fromNorthgate).not.toBe(fromRiverside)
  })

  it('gives two churches texting one person for the first time at once two numbers', async () => {
    const both = await inBothChurches('Ada Mensah')

    const [fromRiverside, fromNorthgate] = await Promise.all([
      queue.sendingNumberFor(riverside.id, both.phone, at),
      queue.sendingNumberFor(northgate.id, both.phone, at),
    ])

    expect(fromRiverside).not.toBeNull()
    expect(fromNorthgate).not.toBe(fromRiverside)
  })

  it('places a reply from a phone in two churches by the number it was sent to', async () => {
    const both = await inBothChurches('Tom Hale')
    const fromRiverside = await queue.sendingNumberFor(riverside.id, both.phone, at)
    const fromNorthgate = await queue.sendingNumberFor(northgate.id, both.phone, at)

    expect(await inbound.resolveSender(both.phone, fromRiverside)).toEqual({
      ministryId: riverside.id,
      personId: both.atRiverside,
    })
    expect(await inbound.resolveSender(both.phone, fromNorthgate)).toEqual({
      ministryId: northgate.id,
      personId: both.atNorthgate,
    })
    // Nothing says which church a text to neither number, or to no number, is for.
    expect(await inbound.resolveSender(both.phone, await addASharedNumber())).toBeNull()
    expect(await inbound.resolveSender(both.phone, null)).toBeNull()
  })

  it('places a reply from a phone in one church whatever number it was sent to, as before', async () => {
    const phone = aTestPhoneNumber()
    const only = personId(await addPerson(riverside, 'Ruth Callan', { phone }))

    const expected = { ministryId: riverside.id, personId: only }
    expect(await inbound.resolveSender(phone, null)).toEqual(expected)
    expect(await inbound.resolveSender(phone, await addASharedNumber())).toEqual(expected)
  })

  it('leaves the other church’s texts running after a STOP to one church’s number', async () => {
    const both = await inBothChurches('Sam Doyle')
    const fromRiverside = await queue.sendingNumberFor(riverside.id, both.phone, at)
    await queue.sendingNumberFor(northgate.id, both.phone, at)

    const sender = await inbound.resolveSender(both.phone, fromRiverside)
    if (!sender) throw new Error('the STOP was placed with nobody')
    await service().execute({ type: 'sms.inbound', ...sender, body: 'STOP' })

    expect(await queue.mayReceive(riverside.id, both.atRiverside)).toBe('recipient_opted_out')
    expect(await queue.mayReceive(northgate.id, both.atNorthgate)).toBeNull()
  })

  it('counts a reply of 1 with the church whose question it answers, and leaves the other’s waiting', async () => {
    const leader = await inBothChurches('Hugo Marsh')
    const riversideParticipant = personId(
      await addPerson(riverside, 'Beth Nkomo', { phone: aTestPhoneNumber() }),
    )
    const northgateParticipant = personId(
      await addPerson(northgate, 'Nina Adeyemi', { phone: aTestPhoneNumber() }),
    )
    await pairOneToOne(riverside, leader.atRiverside, riversideParticipant, {
      createdAt: new Date('2026-04-01T09:00:00Z'),
    })
    await pairOneToOne(northgate, leader.atNorthgate, northgateParticipant, {
      createdAt: new Date('2026-04-01T09:00:00Z'),
    })
    await service().execute({ type: 'checkin.start', ministryId: riverside.id, personId: leader.atRiverside })
    await service().execute({ type: 'checkin.start', ministryId: northgate.id, personId: leader.atNorthgate })

    const fromRiverside = await queue.sendingNumberFor(riverside.id, leader.phone, at)
    await queue.sendingNumberFor(northgate.id, leader.phone, at)

    const sender = await inbound.resolveSender(leader.phone, fromRiverside)
    if (!sender) throw new Error('the reply was placed with nobody')
    await service().execute({ type: 'sms.inbound', ...sender, body: '1' })

    // Riverside asks how it went, inside Discipler's frame; Northgate's question is
    // still the last thing it said, unanswered.
    expect((await inbox(leader.atRiverside)).at(-1)).toBe(
      'Riverside Chapel via Discipler: How did the meeting go? ' +
        'Reply A for outstanding, B for good, C for okay, D for concern.',
    )
    expect((await inbox(leader.atNorthgate)).at(-1)).toMatch(
      /^Northgate Fellowship via Discipler: Did you meet with Nina Adeyemi this week\? Reply 1 for yes, 2 for no\./,
    )
  })

  it('keeps an existing pair on the number it hears from today', async () => {
    // The shape the migration leaves each church's people in: their pair already
    // on the number their church sent from before the shared numbers.
    const today = await addASharedNumber()
    const phone = aTestPhoneNumber()
    await addPerson(northgate, 'Existing Participant', { phone })
    await pool.query(
      `insert into sending_number_assignment (ministry_id, phone, sending_number, assigned_at)
       values ($1, $2, $3, $4)`,
      [northgate.id, phone, today, new Date('2026-09-02T05:42:27Z')],
    )

    expect(await queue.sendingNumberFor(northgate.id, phone, at)).toBe(today)
  })

  it('refuses two churches one number for the same phone, whoever writes it', async () => {
    const both = await inBothChurches('Iris Bantham')
    const fromRiverside = await queue.sendingNumberFor(riverside.id, both.phone, at)

    await expect(
      pool.query(
        `insert into sending_number_assignment (ministry_id, phone, sending_number, assigned_at)
         values ($1, $2, $3, $4)`,
        [northgate.id, both.phone, fromRiverside, at],
      ),
    ).rejects.toThrow(/sending_number_assignment_one_church_per_number_per_phone/)
  })

  it('shows the sending layer its own church’s pairs and nobody else’s', async () => {
    const both = await inBothChurches('Ben Okafor')
    await queue.sendingNumberFor(riverside.id, both.phone, at)
    await queue.sendingNumberFor(northgate.id, both.phone, at)

    const asTheCommandRole = async (ministry: MinistryId) => {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('set local role discipler_command')
        await client.query(`select set_config('discipler.ministry_id', $1, true)`, [ministry])
        const { rows } = await client.query<{ ministry_id: string }>(
          `select ministry_id from sending_number_assignment where phone = $1`,
          [both.phone],
        )
        return rows.map((row) => row.ministry_id)
      } finally {
        await client.query('rollback')
        client.release()
      }
    }

    expect(await asTheCommandRole(riverside.id)).toEqual([riverside.id])
    expect(await asTheCommandRole(northgate.id)).toEqual([northgate.id])
  })

  it('keeps the shared set and the capacity history from every session and the command role', async () => {
    const { rows } = await pool.query<{ table_name: string; grantee: string }>(
      `select table_name, grantee
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('shared_number', 'shared_number_capacity_alert')
          and grantee in ('anon', 'authenticated', 'service_role', 'discipler_command')`,
    )
    expect(rows).toEqual([])
  })

  describe('as the capacity watch reads it', () => {
    it('counts the numbers, the pairs and the most churches on one phone', async () => {
      const before = await shared.load()

      await addASharedNumber()
      const both = await inBothChurches('Counted Twice')
      await queue.sendingNumberFor(riverside.id, both.phone, at)
      await queue.sendingNumberFor(northgate.id, both.phone, at)

      const after = await shared.load()
      expect(after.numbers).toBe(before.numbers + 1)
      expect(after.recipients).toBeGreaterThanOrEqual(before.recipients + 2)
      expect(after.mostChurchesOnOnePhone).toBeGreaterThanOrEqual(2)
    })

    it('remembers an alert raised at one size of the set, and only that size', async () => {
      // A size no real set reaches, so a run does not meet an earlier one's record.
      const size = 1_000_000 + Math.floor(Math.random() * 1_000_000_000)
      const load = { numbers: size, recipients: 0, mostChurchesOnOnePhone: 1 }

      expect(await shared.alreadyRaised('recipients', size)).toBe(false)
      await shared.recordRaised('recipients', at, load)
      await shared.recordRaised('recipients', at, load)

      expect(await shared.alreadyRaised('recipients', size)).toBe(true)
      expect(await shared.alreadyRaised('one_phone', size)).toBe(false)
      expect(await shared.alreadyRaised('recipients', size + 1)).toBe(false)
    })

    it('adds a number typed the way an operator would type it, once', async () => {
      const typed = aTestPhoneNumber().replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')

      const added = await shared.add(typed, at)
      expect(added).toMatch(/^\+1\d{10}$/)
      expect(await shared.add(added, at)).toBe(added)
      expect(await isShared(added)).toBe(true)
      await expect(shared.add('the office', at)).rejects.toThrow(/unreadable number/)
    })
  })
})
