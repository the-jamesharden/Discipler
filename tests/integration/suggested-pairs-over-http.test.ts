import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AvailabilitySlot } from '~/domain/intake'
import { getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import { addPerson, aTestPhoneNumber, createMinistryWithAdmin, localSupabase, type MinistryFixture } from '../support/local-supabase'
import { chosenIn, offersToMentor, popupIn } from '../support/pair-popup'

/**
 * The Suggested Pairs tab as an Admin's browser receives it (core operating loop,
 * ticket 04): a card per suggestion with its label and its one sentence, a way into
 * the Pair popup with both people chosen, and the people nobody's schedule meets
 * listed apart from them.
 */

const slots = (...keys: string[]): AvailabilitySlot[] =>
  keys.map((key) => {
    const [day, hour] = key.split(':') as [AvailabilitySlot['day'], AvailabilitySlot['hour']]
    return { day, hour }
  })

describe.skipIf(skipUnlessAppIsRunning)('Suggested Pairs, over HTTP', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let cookie: string
  let claire: string
  let sam: string
  let ana: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel, Suggested Pairs')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
    cookie = (await signIn(ministry)).cookie
    const woman = (fullName: string, availability: AvailabilitySlot[]) =>
      addPerson(ministry, fullName, { phone: aTestPhoneNumber(), answers: { gender: 'female', availability } })
    claire = await woman('Claire Martinez', slots('tuesday:18', 'tuesday:19', 'saturday:10'))
    await offersToMentor(pool, ministry, claire)
    sam = await woman('Sam Lee', slots('tuesday:18', 'tuesday:19'))
    ana = await woman('Ana Ruiz', slots('sunday:08'))
  })

  afterAll(async () => {
    await pool.end()
  })

  it('shows a suggestion with its label, its reason, and no number', async () => {
    const { response, html } = await getPage('/suggested-pairs', cookie)
    expect(response.status).toBe(200)

    const card = html.match(/<div class="sug">[\s\S]*?<\/a><\/div>/)?.[0]
    expect(card).toBeDefined()
    expect(card).toContain('Good fit')
    expect(card).toContain('Claire Martinez')
    expect(card).toContain('Sam Lee')
    expect(card).toMatch(/Two shared time slots\. You both selected [^<]+\./)
    // The age band is the only figure on a card, and it is a range, never a score.
    expect(card!.replace(/<[^>]*>/g, ' ').replace(/\d{2}-\d{2}/g, '')).not.toMatch(/\d/)
    // The placeholder's apology is gone.
    expect(html).not.toContain('not available yet')
  })

  it('opens the Pair popup from the Discipler with the Disciple already ticked', async () => {
    const { html } = await getPage('/suggested-pairs', cookie)
    const href = html.match(/<a class="btn" href="([^"]*)">Create relationship<\/a>/)?.[1]?.replace(/&amp;/g, '&')
    // On *Disciples somebody*, the side the suggestion puts them on (Roles per pairing, ticket 01).
    expect(href).toBe(`/roster?list=disciplers&pair=${claire}&side=discipler&with=${sam}`)

    const popup = popupIn((await getPage(href!, cookie)).html)
    expect(popup).toContain('Choose who Claire Martinez will disciple.')
    expect(chosenIn(popup!)).toEqual([sam])
  })

  it('lists who shares no time with any Discipler apart from the suggestions, with their own Pair', async () => {
    const { html } = await getPage('/suggested-pairs', cookie)
    // The section's own markup, and not the page data Next inlines after it, which repeats every card.
    const section = html.split('<div class="nso">')[1]?.split('<script')[0]
    expect(section).toBeDefined()
    expect(section).toContain('No Schedule Overlap')
    expect(section).toContain('Ana Ruiz')
    expect(section).not.toMatch(/Excellent fit|Good fit|Recommended/)
    // On *Is discipled*, whatever the preset would say (Roles per pairing, ticket 01).
    expect(section).toContain(`href="/roster?list=disciples&amp;pair=${ana}&amp;side=disciple"`)
    // Not a card: the section holds nobody who has a suggestion.
    expect(section).not.toContain('Sam Lee')
  })
})
