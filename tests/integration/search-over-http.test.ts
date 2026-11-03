import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createTestClock, days, weeks } from '~/domain/clock'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { readPageDocument } from '~/platform/supabase/page'
import { createCommandService } from '~/service/command-service'
import { directoryFor, type SearchNames } from '../../app/search/pages'
import { HEADINGS } from '../../app/search/copy'
import {
  addMaterial,
  addPerson,
  addPersonWithAccount,
  completeIntake,
  createMinistryWithAdmin,
  formGroup,
  localSupabase,
  pairOneToOne,
  signInAs as signInClientAs,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, signInAs, skipUnlessAppIsRunning } from '../support/app'

/**
 * Search (Exponential launch, ticket 24), over the same read and the same route the
 * browser uses. The two things it must never do are proved here against real rows made
 * by the real commands: a Concern's words and a reply's text find nothing, and one
 * church's Admin never sees another church's names.
 *
 * Every refusal first proves the words are really in the database, so a test that finds
 * nothing is a test of search and not of an empty table.
 */

// Monday 24 August 2026, 2pm in Chicago, which is when this church's check-in is due.
const firstWeek = new Date('2026-08-24T19:00:00Z')

/** Words no fixture, name or Help page holds, so finding them can only mean one thing. */
const CONCERN_WORDS = 'Marigold quietly confessed drinking'
const REPLY_WORDS = 'Thistlewood rescheduled because grandmother hospitalized'

describe.skipIf(skipUnlessAppIsRunning)('search', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  let riverside: MinistryFixture
  let cedar: MinistryFixture
  let cookie: string
  let names: SearchNames
  let raw: string
  let client: SupabaseClient

  const ids: IdSource = { next: () => crypto.randomUUID() }
  const minutesAfter = (instant: Date, n: number) => new Date(instant.getTime() + n * 60_000)
  let numbered = 0
  const aNumber = () => `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  const congregant = async (ministry: MinistryFixture, fullName: string): Promise<PersonId> => {
    const id = personId(await addPerson(ministry, fullName, { phone: aNumber() }))
    await completeIntake(ministry, id)
    return id
  }

  const fetchNames = async (from: string): Promise<{ response: Response; body: string }> => {
    const response = await fetch(`${baseUrl}/search`, { headers: { cookie: from }, redirect: 'manual' })
    return { response, body: await response.text() }
  }

  const found = (query: string, heading?: string) =>
    directoryFor(query, names)
      .filter((group) => (heading ? group.heading === heading : true))
      .flatMap((group) => group.rows)

  let leader: PersonId
  let disciple: PersonId
  let materialId: string
  let pairId: string

  beforeAll(async () => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    riverside = await createMinistryWithAdmin('Riverside Chapel', 'Grace Adeyemi')
    cedar = await createMinistryWithAdmin('Cedar Fellowship', 'Oluwaseun Cedarwood')
    await pool.query(
      `update ministry set timezone = 'America/Chicago', checkin_day = 1, checkin_hour = 14 where id = $1`,
      [riverside.id],
    )

    leader = await congregant(riverside, 'Greg Lawson')
    disciple = await congregant(riverside, 'Marcus Bell')
    await addPerson(riverside, 'Nia Unpaired', { phone: aNumber(), intake: false })
    materialId = await addMaterial(riverside, 'Growing in prayer')

    const formedAt = new Date(firstWeek.getTime() - weeks(1))
    pairId = await pairOneToOne(riverside, leader, disciple, { createdAt: formedAt, acceptedAt: formedAt })
    const replier = await congregant(riverside, 'Dora Fields')
    await pairOneToOne(riverside, replier, await congregant(riverside, 'Eli Quiet'), {
      createdAt: formedAt,
      acceptedAt: formedAt,
    })

    await formGroup(riverside, {
      name: 'Young adults group',
      declaredGender: 'female',
      leader: { name: 'Hannah Stone', gender: 'female' },
      disciples: [
        { name: 'Ivy Moss', gender: 'female' },
        { name: 'June Reed', gender: 'female' },
      ],
    })

    // A Concern in words, and a reply kept as it arrived, through the same commands a
    // real text runs.
    const serviceAt = (now: Date) =>
      createCommandService({ clock: createTestClock(now), ids, store, appBaseUrl: 'https://discipler.test' })
    const replyAt = (now: Date, who: PersonId, body: string) =>
      serviceAt(now).execute({ type: 'sms.inbound', ministryId: riverside.id, personId: who, body })
    await serviceAt(firstWeek).execute({ type: 'scheduled.tick', ministryId: riverside.id })
    for (const [minute, [who, body]] of [
      [leader, '1'],
      [leader, 'D'],
      [leader, CONCERN_WORDS],
      [replier, '1'],
      [replier, 'D'],
      [replier, REPLY_WORDS],
    ].entries()) {
      await replyAt(minutesAfter(firstWeek, minute + 1), who as PersonId, body as string)
    }

    // The other church, with people and a Material of its own.
    const cedarLeader = await congregant(cedar, 'Bartholomew Cedarwood')
    await pairOneToOne(cedar, cedarLeader, await congregant(cedar, 'Philippa Cedarwood'))
    await addMaterial(cedar, 'Cedarwood devotional')

    cookie = (await signIn(riverside)).cookie
    client = await signInClientAs(riverside)
    const answer = await fetchNames(cookie)
    expect(answer.response.status).toBe(200)
    raw = answer.body
    names = JSON.parse(raw) as SearchNames
  }, 120_000)

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  describe('finds', () => {
    it('a person by name, saying who they are and that they open on the Roster', () => {
      expect(found('marcus', HEADINGS.people)).toEqual([
        {
          label: 'Marcus Bell',
          sub: 'Discipled by Greg Lawson',
          href: `/roster/${disciple}`,
          where: 'Roster',
          icon: 'people',
          initials: 'MB',
        },
      ])
      expect(found('greg', HEADINGS.people)[0]!.sub).toBe('Disciples Marcus Bell')
      expect(found('nia', HEADINGS.people)[0]!.sub).toBe('Awaiting Intake')
      expect(found('grace', HEADINGS.people)[0]!.sub).toBe('Admin, you')
    })

    it('a relationship by anybody in it, opening on its card without reading its Concerns', () => {
      const [pair] = found('marcus', HEADINGS.relationships)
      expect(pair).toMatchObject({
        label: 'Greg Lawson and Marcus Bell',
        // The year joins it once this calendar year is over, so it is not asserted.
        sub: expect.stringMatching(/^Pair, started August 17/),
        href: `/overview#rel-${pairId}`,
        where: 'Overview',
      })

      const [group] = found('ivy', HEADINGS.relationships)
      expect(group).toMatchObject({ label: 'Young adults group', sub: 'Group, 3 people', where: 'Overview' })
    })

    it('a card that is really on the Overview at that address', async () => {
      const { html } = await getPage('/overview', cookie)
      expect(html).toContain(`id="rel-${pairId}"`)
    })

    it('an unaccepted relationship on its Leader\'s page while the Overview draws no card', async () => {
      const waiting = await congregant(riverside, 'Wanda Waiting')
      const asked = await congregant(riverside, 'Abby Asked')
      await createCommandService({
        clock: createTestClock(new Date(Date.now() - days(1))),
        ids,
        store,
        appBaseUrl: 'https://discipler.test',
      }).execute({
        type: 'relationship.create',
        ministryId: riverside.id,
        leaderIds: [waiting],
        participantIds: [asked],
      })

      const fresh = JSON.parse((await fetchNames(cookie)).body) as SearchNames
      const [row] = directoryFor('wanda', fresh).filter((group) => group.heading === HEADINGS.relationships)
      expect(row!.rows[0]).toMatchObject({
        label: 'Wanda Waiting and Abby Asked',
        sub: 'Pair, awaiting acceptance',
        href: `/roster/${waiting}`,
        where: 'Roster',
      })
    })

    it('a Material by title, opening its page', async () => {
      expect(found('prayer', HEADINGS.materials)).toEqual([
        { label: 'Growing in prayer', href: `/materials/${materialId}`, where: 'Materials', icon: 'material' },
      ])
      expect((await getPage(`/materials/${materialId}`, cookie)).response.status).toBe(200)
    })

    it('every address it lists answers', async () => {
      const everything = [...names.people, ...names.relationships, ...names.materials, ...names.help]
      const addresses = new Set(everything.map((row) => row.href.split('#')[0]!))
      expect(addresses.size).toBeGreaterThan(10)
      for (const address of addresses) {
        expect((await getPage(address, cookie)).response.status, address).toBe(200)
      }
    })

    it('leaves out somebody removed from the Roster', async () => {
      const gone = personId(await addPerson(riverside, 'Rowan Removed', { phone: aNumber() }))
      expect(JSON.parse((await fetchNames(cookie)).body).people.map((row: { label: string }) => row.label)).toContain(
        'Rowan Removed',
      )

      await createCommandService({
        clock: createTestClock(new Date()),
        ids,
        store,
        appBaseUrl: 'https://discipler.test',
      }).execute({
        type: 'person.remove',
        ministryId: riverside.id,
        personId: gone,
        removedBy: riverside.adminUserId,
      })

      expect((await fetchNames(cookie)).body).not.toContain('Rowan Removed')
    })
  })

  describe('never finds what somebody wrote', () => {
    it('with the words really in the database, as a Concern and as a reply kept as it arrived', async () => {
      const concerns = await pool.query(
        `select 1 from concern where ministry_id = $1 and detail = $2`,
        [riverside.id, CONCERN_WORDS],
      )
      expect(concerns.rowCount).toBe(1)

      const replies = await pool.query(
        `select 1 from checkin_prompt where ministry_id = $1 and detail = $2`,
        [riverside.id, REPLY_WORDS],
      )
      expect(replies.rowCount).toBe(1)
    })

    it.each([...CONCERN_WORDS.split(' '), CONCERN_WORDS])('a Concern\'s words find nothing: %s', (words) => {
      expect(found(words)).toEqual([])
    })

    it.each([...REPLY_WORDS.split(' '), REPLY_WORDS])('a reply\'s text finds nothing: %s', (words) => {
      expect(found(words)).toEqual([])
    })

    it('is not sent them at all: not in the answer, and not in the document it is made from', async () => {
      for (const word of [...CONCERN_WORDS.split(' '), ...REPLY_WORDS.split(' ')]) {
        expect(raw.toLowerCase()).not.toContain(word.toLowerCase())
      }

      const doc = JSON.stringify(await readPageDocument(client, 'search_page')).toLowerCase()
      for (const word of [...CONCERN_WORDS.split(' '), ...REPLY_WORDS.split(' ')]) {
        expect(doc).not.toContain(word.toLowerCase())
      }
    })

    it('reads only what it needs: names, and no phone or email', async () => {
      const doc = await readPageDocument(client, 'search_page')
      const keysOf = (key: string) =>
        [...new Set((doc[key] as Record<string, unknown>[]).flatMap((row) => Object.keys(row)))].sort()

      expect(keysOf('people')).toEqual(['full_name', 'is_admin', 'participation_status', 'person_id'])
      expect(keysOf('relationships')).toEqual(['accepted_at', 'created_at', 'id', 'name'])
      expect(keysOf('members')).toEqual(['accepted_at', 'person_id', 'relationship_id', 'role'])
      expect(keysOf('materials')).toEqual(['id', 'title'])
      expect(Object.keys(doc).sort()).toEqual([
        'admin',
        'billing',
        'materials',
        'members',
        'people',
        'relationships',
        'session',
        'timezone',
        'user_id',
      ])

      const { rows } = await pool.query<{ phone: string }>(
        `select phone from person where ministry_id = $1 and phone is not null`,
        [riverside.id],
      )
      expect(rows.length).toBeGreaterThan(2)
      for (const { phone } of rows) expect(raw).not.toContain(phone)
    })
  })

  describe('one church at a time', () => {
    const THEIRS = [
      'Oluwaseun Cedarwood',
      'Bartholomew Cedarwood',
      'Philippa Cedarwood',
      'Cedarwood devotional',
    ]

    it('with the other church\'s names really there, to its own Admin', async () => {
      const theirs = (await fetchNames((await signIn(cedar)).cookie)).body
      for (const name of THEIRS) expect(theirs).toContain(name)
      expect(theirs).not.toContain('Marcus Bell')
      expect(theirs).not.toContain('Growing in prayer')
    })

    it.each(THEIRS)('never shows this church\'s Admin the other\'s: %s', (name) => {
      expect(raw).not.toContain(name)
      expect(found(name)).toEqual([])
    })

    it('finds nothing of theirs through the read itself, as a signed-in Admin', async () => {
      const doc = JSON.stringify(await readPageDocument(client, 'search_page'))
      for (const name of THEIRS) expect(doc).not.toContain(name)
      expect(doc).not.toContain(cedar.id)
    })

    it('tells a Leader nothing: refused, with no names', async () => {
      const account = await addPersonWithAccount(riverside, 'Leah Leader', 'leader')
      const { response, body } = await fetchNames((await signInAs(account)).cookie)
      expect(response.status).toBe(403)
      expect(JSON.parse(body)).toEqual({ refused: 'not-an-admin' })
    })

    it('tells somebody signed out nothing', async () => {
      const { response, body } = await fetchNames('')
      expect(response.status).toBe(401)
      expect(JSON.parse(body)).toEqual({ refused: 'signed-out' })
    })

    it('refuses the read to anybody without a session', async () => {
      const { apiUrl, anonKey } = localSupabase()
      const anon = createClient(apiUrl, anonKey, { auth: { persistSession: false } })
      const { data, error } = await anon.rpc('search_page')
      expect(data).toBeNull()
      expect(error).not.toBeNull()
    })

    it('asks nothing between here and the browser to keep it', async () => {
      const { response } = await fetchNames(cookie)
      const said = response.headers.get('cache-control') ?? ''
      expect(said).toContain('no-store')
      expect(said).toContain('private')
    })
  })

  describe('on the page', () => {
    const header = (html: string) => html.slice(0, html.indexOf('<main'))

    it('puts the bar at the end of the tab row on every tab', async () => {
      for (const path of ['/overview', '/check-ins', '/suggested-pairs', '/follow-up', '/materials', '/roster']) {
        const { html } = await getPage(path, cookie)
        expect(header(html), path).toMatch(/<\/ul>.*class="search-bar"/s)
        expect(header(html), path).toContain('aria-haspopup="dialog"')
      }
    })

    it('has search on an Admin page with no tab row, with no bar', async () => {
      for (const path of ['/settings', '/intake-forms', '/account']) {
        const { html } = await getPage(path, cookie)
        expect(header(html), path).toContain('<dialog class="palette"')
        expect(header(html), path).not.toContain('class="search-bar"')
      }
    })

    it('holds no name until it is opened', async () => {
      const { html } = await getPage('/settings', cookie)
      expect(html).not.toContain('Marcus Bell')
    })

    it('leaves a Leader\'s page alone', async () => {
      const account = await addPersonWithAccount(riverside, 'Lena Leader', 'leader')
      const { html } = await getPage('/relationships', (await signInAs(account)).cookie)
      expect(html).not.toContain('class="palette"')
      expect(html).not.toContain('class="search-bar"')
    })
  })
})
