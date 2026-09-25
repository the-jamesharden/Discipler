import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { materialId, personId, relationshipId, type IdSource } from '~/domain/ids'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addMaterial,
  addPerson,
  addPersonWithAccount,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  serviceRoleClient,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, skipUnlessAppIsRunning } from '../support/app'

/**
 * A Disciple's Material page, from the text that links it to the file it hands
 * down (Richer materials, ticket 04): an Admin assigns, the tick texts the
 * Disciple a link, the link opens the Material with no sign-in and names nobody,
 * a file downloads through a link minted on the spot, a guess is not found, a
 * move to no Material says so, and an ended relationship's link says it has
 * ended. A reply to the text gets the ordinary acknowledgement.
 */
describe.skipIf(skipUnlessAppIsRunning)('a Disciple’s Material page', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool
  let grace: AccountFixture
  let emily: string
  let emilysPhone: string
  let relationship: string
  let romans: string
  let token: string
  let guideId: string

  const ids: IdSource = { next: () => crypto.randomUUID() }
  const serviceAt = (at: Date) =>
    createCommandService({ clock: createTestClock(at), ids, store, appBaseUrl: baseUrl })
  const nineAm = new Date('2026-08-19T14:00:00Z')
  const at = (minutes: number) => new Date(nineAm.getTime() + minutes * 60_000)

  const textsTo = async (person: string) => {
    const { rows } = await pool.query<{ body: string }>(
      `select body from outbound_message where person_id = $1 order by enqueued_at, created_at`,
      [person],
    )
    return rows.map((row) => row.body)
  }

  const open = (path: string) => fetch(`${baseUrl}${path}`, { redirect: 'manual' })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    await pool.query(`update ministry set timezone = 'America/Chicago' where id = $1`, [ministry.id])
    grace = await addPersonWithAccount(ministry, 'Grace Lee', 'leader')
    emilysPhone = aTestPhoneNumber()
    emily = await addPerson(ministry, 'Emily Davis', { phone: emilysPhone })
    relationship = await pairOneToOne(ministry, grace.personId, emily, {
      createdAt: new Date('2026-08-01T15:00:00Z'),
      acceptedAt: new Date('2026-08-01T15:00:00Z'),
      joinedAt: new Date('2026-08-01T15:00:00Z'),
    })

    const guidePath = `${ministry.id}/${crypto.randomUUID()}.pdf`
    const uploaded = await serviceRoleClient()
      .storage.from('material')
      .upload(guidePath, new Blob(['%PDF-1.4 the Romans guide'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      })
    if (uploaded.error) throw new Error(uploaded.error.message)
    romans = await addMaterial(ministry, 'Romans: Life in the Spirit', {
      body: 'Read one chapter before you meet. The plan is at https://bible.com/plans/romans',
      files: [{ path: guidePath, filename: 'Romans guide.pdf', bytes: 25 }],
      links: [{ url: 'https://bibleproject.com/romans', label: 'Romans overview' }],
    })
    const { rows } = await pool.query<{ id: string }>(`select id from material_item where material_id = $1 and kind = 'file'`, [romans])
    guideId = rows[0]!.id

    await serviceAt(at(0)).execute({
      type: 'relationship.assign_material',
      ministryId: ministry.id,
      relationshipId: relationshipId(relationship),
      materialId: materialId(romans),
      assignedBy: ministry.adminUserId,
    })
    await serviceAt(at(90)).execute({ type: 'scheduled.tick', ministryId: ministry.id })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  it('texts the Disciple a link to their page, naming their Leader and the Material', async () => {
    const texts = await textsTo(emily)
    const text = texts.find((body) => body.includes('Open it here'))
    expect(text).toMatch(
      new RegExp(
        `^Riverside Chapel: Your discipleship material with Grace Lee is now Romans: Life in the Spirit\\. Open it here: ${baseUrl.replace(/[.:/]/g, '\\$&')}/material/[0-9a-f-]{36}`,
      ),
    )
    token = /\/material\/([0-9a-f-]{36})/.exec(text!)![1]!
  })

  it('opens the Material with no sign-in, and names nobody', async () => {
    const response = await open(`/material/${token}`)
    expect(response.status).toBe(200)
    const html = await response.text()
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
    expect(main).toContain('Riverside Chapel')
    expect(main).toContain('Romans: Life in the Spirit')
    expect(main).toContain('Your discipleship material')
    expect(main).toContain('<a href="https://bible.com/plans/romans" target="_blank" rel="noopener noreferrer">')
    expect(main).toContain('Romans guide.pdf')
    expect(main).toContain(`href="/material/${token}/file/${guideId}"`)
    expect(main).toContain('href="https://bibleproject.com/romans"')
    for (const nobody of ['Grace', 'Emily', emilysPhone, grace.phone]) expect(main).not.toContain(nobody)
  })

  it('hands a file down through a link that lasts minutes, under its own name', async () => {
    const response = await open(`/material/${token}/file/${guideId}`)
    expect(response.status).toBe(303)
    const signed = response.headers.get('location')!
    expect(signed).toContain('/storage/v1/object/sign/material/')
    const download = await fetch(signed)
    expect(download.status).toBe(200)
    expect(await download.text()).toBe('%PDF-1.4 the Romans guide')
    expect(decodeURIComponent(download.headers.get('content-disposition') ?? '')).toContain('Romans guide.pdf')
  })

  it('answers a guess and a mangled link as not found, and sends a file it cannot hand down back to the page', async () => {
    expect((await open(`/material/${crypto.randomUUID()}`)).status).toBe(404)
    expect((await open('/material/not-a-token')).status).toBe(404)
    // An item that is not a file on the Material running now: back to the page,
    // which says what there is, rather than a bare *not found*.
    const { rows } = await pool.query<{ id: string }>(`select id from material_item where material_id = $1 and kind = 'link'`, [romans])
    for (const item of [crypto.randomUUID(), rows[0]!.id]) {
      const response = await open(`/material/${token}/file/${item}`)
      expect(response.status).toBe(303)
      expect(new URL(response.headers.get('location')!).pathname).toBe(`/material/${token}`)
    }
  })

  it('gives a reply to the text the ordinary acknowledgement', async () => {
    await serviceAt(at(120)).execute({
      type: 'sms.inbound',
      ministryId: ministry.id,
      personId: personId(emily),
      body: 'Thank you!',
    })
    const texts = await textsTo(emily)
    expect(texts.at(-1)).toContain("Thanks for your message. We can't reply to texts here")
  })

  it('says there is no material right now once the relationship is taken off it, and texts the Disciple nothing', async () => {
    const before = (await textsTo(emily)).length
    await serviceAt(at(180)).execute({
      type: 'relationship.assign_material',
      ministryId: ministry.id,
      relationshipId: relationshipId(relationship),
      materialId: null,
      assignedBy: ministry.adminUserId,
    })
    await serviceAt(new Date('2026-08-20T15:00:00Z')).execute({ type: 'scheduled.tick', ministryId: ministry.id })
    expect(await textsTo(emily)).toHaveLength(before)

    const html = await (await open(`/material/${token}`)).text()
    expect(html).toContain('No material right now')
    const file = await open(`/material/${token}/file/${guideId}`)
    expect(file.status).toBe(303)
    expect(new URL(file.headers.get('location')!).pathname).toBe(`/material/${token}`)
  })

  it('says the link has ended once the relationship has', async () => {
    // Now, not the story's August: the fixture opened the memberships at the real
    // time, and an ending has to come after them.
    await serviceAt(new Date()).execute({
      type: 'relationship.end',
      ministryId: ministry.id,
      relationshipId: relationshipId(relationship),
      reason: 'Finished the study.',
      outcome: 'completed',
      endedBy: ministry.adminUserId,
    })
    const response = await open(`/material/${token}`)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('This link has ended')
    expect(html).toContain('contact Riverside Chapel')
  })
})
