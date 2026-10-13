import { expect } from 'vitest'
import { getPage } from './app'

/**
 * Reading Follow-Up out of the page an Admin's browser receives (Pastor
 * feedback, ticket 10). Each item on the list is one button that opens its card
 * at `?card=`, and the card is where everything an item offers now is, so the
 * suites that press an item's actions open its card the way an Admin does: from
 * the item's own link.
 */

/** The page as it reads, without the comment markers React puts between words. */
export const words = (html: string): string => html.replace(/<!-- -->/g, '')

/** The list's item about one name, as markup: from its `<li` to the next. */
export const itemAbout = (html: string, name: string): string | undefined => {
  // The list only, never a card open over it.
  const card = html.indexOf('data-testid="pair-card"')
  return words(card < 0 ? html : html.slice(0, card))
    .split('<li')
    .slice(1)
    .find((candidate) => candidate.includes(name))
}

/** Where an item on the list goes when it is pressed. */
export const cardAddressOf = (item: string): string | undefined =>
  item.match(/href="(\/follow-up\?card=[0-9a-f-]{36})"/)?.[1]

/**
 * The card's own markup: from the dialog to the end of the drawn page, short of
 * the scripts after it, which carry the whole page's data again.
 */
export const cardIn = (html: string): string => {
  const start = html.indexOf('data-testid="pair-card"')
  if (start < 0) return ''
  const end = html.indexOf('<script', start)
  return words(html.slice(start, end < 0 ? undefined : end))
}

/**
 * Open the card of the item about one name, as an Admin does: find it on the
 * list and follow its link. The card's markup, and its address, which is what
 * every form on it sends as `back`.
 */
export const openTheCardAbout = async (cookie: string, name: string) => {
  const list = await getPage('/follow-up', cookie)
  const item = itemAbout(list.html, name)
  expect(item, `no Follow-Up item about ${name}`).toBeDefined()
  const address = cardAddressOf(item!)
  expect(address, `the item about ${name} opens no card`).toBeDefined()
  const opened = await getPage(address!, cookie)
  expect(opened.response.status).toBe(200)
  return { item: item!, address: address!, card: cardIn(opened.html), html: opened.html }
}
