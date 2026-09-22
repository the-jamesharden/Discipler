import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import { addPerson, aTestPhoneNumber, createMinistryWithAdmin, localSupabase, type MinistryFixture } from '../support/local-supabase'
import { chosenIn, offersToMentor, popupIn } from '../support/pair-popup'

/**
 * Manual pairing, recut ticket 05. The old Pair page is gone and `/roster/pair`
 * redirects into the popup, carrying its query, so a bookmark, an old text or a
 * refusal in flight still lands somewhere that reads. Each shape of old link, over
 * HTTP, and then where the app's own ways into pairing go now: every one straight
 * to the popup, so the redirect serves old links and not the app's.
 */

describe.skipIf(skipUnlessAppIsRunning)('the old Pair page’s address, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string
  let claire: string
  let sam: string
  let ana: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel, The Old Address')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
    const woman = (fullName: string) =>
      addPerson(ministry, fullName, { phone: aTestPhoneNumber(), answers: { gender: 'female' } })
    claire = await woman('Claire Martinez')
    await offersToMentor(pool, ministry, claire)
    sam = await woman('Sam Lee')
    ana = await woman('Ana Ruiz')
  })

  afterAll(async () => {
    await pool.end()
  })

  /** Where an old address sends the browser, as a path and query, and the popup that opens there. */
  const follow = async (query: string) => {
    const response = await fetch(`${baseUrl}/roster/pair${query}`, { redirect: 'manual', headers: { cookie } })
    expect(response.status).toBe(307)
    const to = new URL(response.headers.get('location') ?? '', baseUrl)
    const landed = `${to.pathname}${to.search}`
    return { landed, to, popup: popupIn((await getPage(landed, cookie)).html) }
  }

  it('opens a Discipler it named on the Discipler’s side', async () => {
    const { landed, popup } = await follow(`?leaderId=${claire}`)
    expect(landed).toBe(`/roster?list=disciplers&pair=${claire}`)
    expect(popup).toContain('Choose who Claire Martinez will disciple.')
  })

  it('opens it with every Disciple it named already ticked', async () => {
    const { landed, popup } = await follow(`?leaderId=${claire}&with=${sam}&with=${ana}`)
    expect(landed).toBe(`/roster?list=disciplers&pair=${claire}&with=${sam}&with=${ana}`)
    expect(chosenIn(popup!)).toEqual(expect.arrayContaining([sam, ana]))
  })

  it('opens a Disciple alone, the Follow-Up tab’s old link, on the Disciple’s side', async () => {
    const { landed, popup } = await follow(`?with=${sam}`)
    expect(landed).toBe(`/roster?list=disciples&pair=${sam}`)
    expect(popup).toContain('Choose who will disciple Sam Lee.')
  })

  it('carries a refusal’s error and every choice, so the refusal still reads', async () => {
    const refusal = new URLSearchParams([
      ['error', 'relationship.gender_does_not_match_the_declaration'],
      ['leaderId', claire],
      ['with', sam],
      ['with', ana],
      ['declaredGender', 'male'],
      ['name', 'The Tuesday Group'],
      ['joinRequiresApproval', 'yes'],
    ])
    const { to, popup } = await follow(`?${refusal}`)

    expect(to.pathname).toBe('/roster')
    expect([...to.searchParams]).toEqual([
      ['list', 'disciplers'],
      ['pair', claire],
      ...[...refusal].filter(([name]) => name !== 'leaderId'),
    ])
    expect(popup).toMatch(/role="alert"[^>]*>[^<]*declared/)
    expect(chosenIn(popup!)).toEqual(expect.arrayContaining([sam, ana]))
  })

  it('sends an address that names nobody to the Roster', async () => {
    expect((await follow('')).landed).toBe('/roster')
    expect((await follow('?error=relationship.needs_a_leader')).landed).toBe('/roster')
  })

  it('has the person page link to the popup directly, on the side each person is on', async () => {
    const pairOn = async (personId: string) =>
      (await getPage(`/roster/${personId}`, cookie)).html
        .match(/<a [^>]*href="([^"]*)"[^>]*>Pair<\/a>/)?.[1]
        ?.replace(/&amp;/g, '&')

    expect(await pairOn(claire)).toBe(`/roster?list=disciplers&pair=${claire}`)
    expect(await pairOn(sam)).toBe(`/roster?list=disciples&pair=${sam}`)
  })

  it('has the Follow-Up tab link to the popup directly, on the Disciple’s side', async () => {
    const taylor = await addPerson(ministry, 'Taylor Brooks', { phone: aTestPhoneNumber(), answers: { gender: 'female' } })
    await pool.query(
      `insert into follow_up_item (ministry_id, kind, person_id, relationship_id, raised_at, payload)
       values ($1, 'intended_pairing_refused', $2, null, now(),
               jsonb_build_object('intendedPairingId', $3::text, 'refusal', 'relationship.gender_must_match'))`,
      [ministry.id, taylor, crypto.randomUUID()],
    )

    const { html } = await getPage('/follow-up', cookie)
    expect(html).not.toContain('href="/roster/pair')
    const byHand = html.match(/<a [^>]*href="([^"]*)"[^>]*>Pair by hand<\/a>/)?.[1]?.replace(/&amp;/g, '&')
    expect(byHand).toBe(`/roster?list=disciples&pair=${taylor}`)
  })
})
