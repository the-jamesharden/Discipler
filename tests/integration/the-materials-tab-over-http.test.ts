import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock, weeks } from '~/domain/clock'
import { personId, type IdSource, type PersonId } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addMaterial,
  addPerson,
  assignMaterial,
  completeIntake,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * The Materials tab as an Admin reaches it: the folders, a folder's cards, and
 * the way back with the filter kept. The assertions that matter most are about
 * what is *not* on these pages: no Concern text and no phone number, on a
 * surface that lists every relationship in the Ministry.
 */

describe.skipIf(skipUnlessAppIsRunning)('the Materials tab', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  // Monday 24 August 2026, 8pm in London -- the Monday of ISO week 2026-W35.
  const firstWeek = new Date('2026-08-24T19:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const at = (week: number) => new Date(firstWeek.getTime() + weeks(week))

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  beforeAll(async () => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  /** One Ministry asking on Monday evenings in London, with the verbs a scenario needs. */
  const aMinistry = async (name: string) => {
    const ministry = await createMinistryWithAdmin(name)
    await pool.query(
      `update ministry set timezone = 'Europe/London', checkin_day = 1, checkin_hour = 20 where id = $1`,
      [ministry.id],
    )
    const serviceAt = (now: Date) =>
      createCommandService({ clock: createTestClock(now), ids, store, appBaseUrl: 'https://discipler.test' })
    const congregant = async (fullName: string, gender: 'male' | 'female') => {
      const id = personId(await addPerson(ministry, fullName, { phone: aNumber(), intake: false }))
      await completeIntake(ministry, id, ['sms', 'contact_sharing'], 'pastor_link', { gender })
      return id
    }
    return {
      ministry,
      congregant,
      tickAt: (now: Date) => serviceAt(now).execute({ type: 'scheduled.tick', ministryId: ministry.id }),
      replyAt: (now: Date, person: PersonId, body: string) =>
        serviceAt(now).execute({ type: 'sms.inbound', ministryId: ministry.id, personId: person, body }),
    }
  }

  describe('an empty Ministry', () => {
    let ministry: MinistryFixture
    let cookie: string

    beforeAll(async () => {
      ministry = await createMinistryWithAdmin('Empty Materials Chapel')
      cookie = (await signIn(ministry)).cookie
    })

    it('renders the tab with the filter, the empty line and no folder', async () => {
      const { response, html } = await getPage('/materials', cookie)
      expect(response.status).toBe(200)
      expect(html).toContain('href="/materials"')
      expect(html).toContain('aria-current="page"')
      expect(html).toContain('One material at a time, assigned to the relationship')
      expect(html).toContain('class="seg"')
      expect(html).toContain('No materials yet. Create one, then assign it from its folder')
      expect(html).not.toContain('mat-grid')
      expect(html).not.toContain('No material assigned')
    })

    it('answers 404 for a folder the Ministry does not hold', async () => {
      const { response } = await getPage(`/materials/${crypto.randomUUID()}`, cookie)
      expect(response.status).toBe(404)
    })

    it('renders the dashed folder page empty', async () => {
      const { response, html } = await getPage('/materials/none', cookie)
      expect(response.status).toBe(200)
      expect(html).toContain('0 relationships are not working through anything yet')
      expect(html).toContain('href="/materials"')
    })
  })

  describe('a Ministry with folders', () => {
    it('walks tab to folder and back with the filter kept, and shows no Concern text and no number', async () => {
      const church = await aMinistry('Folder Chapel')
      const { cookie } = await signIn(church.ministry)

      // Two men's one-to-ones, one on a Material and one on nothing, and one
      // relationship with a Concern raised at its first check-in.
      const david = await church.congregant('David Chen', 'male')
      const marcus = await church.congregant('Marcus Okafor', 'male')
      const formedAt = new Date(firstWeek.getTime() - weeks(2))
      const onPlan = await pairOneToOne(church.ministry, david, marcus, { createdAt: formedAt, acceptedAt: formedAt })

      const tyler = await church.congregant('Tyler Bennett', 'male')
      const caleb = await church.congregant('Caleb Reyes', 'male')
      await pairOneToOne(church.ministry, tyler, caleb, { createdAt: formedAt, acceptedAt: formedAt })

      const masterPlan = await addMaterial(church.ministry, 'The Master Plan of Evangelism')
      const assignedAt = new Date(firstWeek.getTime() - weeks(1))
      await assignMaterial(onPlan, masterPlan, church.ministry.adminUserId, assignedAt)

      await church.tickAt(at(0))
      const answering = new Date(at(0).getTime() + 60_000)
      await church.replyAt(answering, david, '1')
      await church.replyAt(new Date(answering.getTime() + 60_000), david, 'C')
      const words = 'He lost his job and did not want to talk long.'
      await church.replyAt(new Date(answering.getTime() + 120_000), david, words)

      // The tab: one folder with one relationship, the dashed folder with the other.
      const tab = await getPage('/materials', cookie)
      expect(tab.response.status).toBe(200)
      expect(tab.html).toContain('The Master Plan of Evangelism')
      expect(tab.html).toContain('1 relationship</div>')
      expect(tab.html).toContain('mat-tile unassigned')
      expect(tab.html).toContain('No material assigned')
      expect(tab.html).toContain('>DC</span>')
      expect(tab.html).toContain('>TB</span>')
      expect(tab.html).not.toContain(words)
      expect(tab.html).not.toMatch(/\+1\d{10}/)

      // Under Women's, both folders empty and the dashed one gone.
      const women = await getPage('/materials?gender=female', cookie)
      expect(women.html).toContain('Nobody working through it')
      expect(women.html).not.toContain('No material assigned')

      // Under Men's, the folder links carry the filter.
      const men = await getPage('/materials?gender=male', cookie)
      expect(men.html).toContain(`href="/materials/${masterPlan}?gender=male"`)
      expect(men.html).toContain('href="/materials/none?gender=male"')

      // Inside the folder: the card with its meta line, its history line, the
      // Concern as a flag and a link to Follow-Up on the Leader's name, and the way
      // back keeping the filter.
      const folder = await getPage(`/materials/${masterPlan}?gender=male`, cookie)
      expect(folder.response.status).toBe(200)
      expect(folder.html).toContain('href="/materials?gender=male"')
      expect(folder.html).toContain('← All materials')
      expect(folder.html).toContain('1 relationship working through it now')
      expect(folder.html).toContain('David Chen')
      expect(folder.html).toContain('with Marcus Okafor')
      expect(folder.html).toContain('One-to-one · since 17 Aug 2026')
      expect(folder.html).toContain('Previously: No material (10 Aug – 17 Aug 2026)')
      expect(folder.html).toContain('Concern')
      expect(folder.html).toContain(`href="/follow-up#relationship-${onPlan}"`)
      expect(folder.html).not.toContain(words)
      expect(folder.html).not.toMatch(/\+1\d{10}/)

      // The dashed folder: the other relationship, started at acceptance, no history line.
      const none = await getPage('/materials/none?gender=male', cookie)
      expect(none.response.status).toBe(200)
      expect(none.html).toContain('1 relationship is not working through anything yet')
      expect(none.html).toContain('Tyler Bennett')
      expect(none.html).toContain('One-to-one · started 10 Aug 2026')
      expect(none.html).not.toContain('Previously:')
      expect(none.html).not.toContain('David Chen')
      expect(none.html).not.toContain(words)
      expect(none.html).not.toMatch(/\+1\d{10}/)
    })
  })

  it('turns a visitor with no session away', async () => {
    for (const path of ['/materials', '/materials/none', `/materials/${crypto.randomUUID()}`]) {
      const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
      expect(response.status, path).toBe(307)
      expect(response.headers.get('location'), path).toContain('/login')
    }
  })
})
