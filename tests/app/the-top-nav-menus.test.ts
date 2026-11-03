import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { helpPage } from '../../app/help/library'
import { HELP_MENU, helpMenuFor, liveMenu, REFER_A_CHURCH, type HelpMenuGroup } from '../../app/top-nav-menus'

/**
 * What the Help menu offers (Exponential launch, ticket 23).
 *
 * The rule under test is that no control goes nowhere: an item is written down with
 * its words, its icon and its place as soon as the spec names it, and is shown from
 * the moment it has an address.
 */

const labels = (groups: readonly HelpMenuGroup[]) =>
  groups.map((group) => ({ label: group.label, items: group.items.map((item) => item.label) }))

/** The page a path inside the app is served from. */
const hasAPage = (href: string) =>
  href.startsWith('/help/')
    ? helpPage(href.slice('/help/'.length)) !== null
    : existsSync(fileURLToPath(new URL(`../../app${href}/page.tsx`, import.meta.url)))

describe('the Help menu', () => {
  it('holds the spec’s items, in the spec’s order, and Ask Discipler is not one of them', () => {
    expect(labels(HELP_MENU)).toEqual([
      {
        label: 'Help and feedback',
        items: ['Help center', 'Restart onboarding', "What's new", 'Office hours', 'Contact support'],
      },
      { label: 'Learn', items: ['Setup videos', 'Blog'] },
    ])
  })

  it('shows only what works today: the Help center, What’s new and Contact support', () => {
    expect(labels(liveMenu(HELP_MENU))).toEqual([
      { label: 'Help and feedback', items: ['Help center', "What's new", 'Contact support'] },
    ])
  })

  it('sends every item it shows to a page that exists', () => {
    const shown = liveMenu(HELP_MENU).flatMap((group) => group.items)

    expect(shown.length).toBeGreaterThan(0)
    for (const item of shown) expect(hasAPage(item.href), item.href).toBe(true)
  })

  it('shows an item the moment it has an address, and a group only once it holds one', () => {
    const landed = HELP_MENU.map((group) => ({
      ...group,
      items: group.items.map((item) =>
        item.label === 'Blog' ? { ...item, href: 'https://trydiscipler.com/blog' } : item,
      ),
    }))

    expect(labels(liveMenu(landed))).toEqual([
      { label: 'Help and feedback', items: ['Help center', "What's new", 'Contact support'] },
      { label: 'Learn', items: ['Blog'] },
    ])
  })

  it('keeps the Blog hidden until that page exists, and opens it in a new tab when it does', () => {
    const blog = HELP_MENU.flatMap((group) => group.items).find((item) => item.label === 'Blog')

    expect(blog?.href).toBeNull()
    expect(blog?.newTab).toBe(true)
  })
})

describe('the Help menu for one Admin', () => {
  const NEXT_CALL = { date: 'Thursday, November 12', time: '12pm CT', link: 'https://example.com/the-call' }
  const item = (menu: readonly HelpMenuGroup[], label: string) =>
    menu.flatMap((group) => group.items).find((one) => one.label === label)

  it('tags What’s new while this Admin has an undismissed entry, and only then', () => {
    expect(item(helpMenuFor({ whatsNewIsNew: true, officeHours: null }), "What's new")?.tag).toBe('New')

    const seen = item(helpMenuFor({ whatsNewIsNew: false, officeHours: null }), "What's new")
    expect(seen?.tag).toBeUndefined()
    // It still opens the entries, which are still there to read.
    expect(seen?.href).toBe('/help/whats-new')
  })

  it('keeps Office hours off while there is no next call, and sends it to the card once there is', () => {
    expect(item(helpMenuFor({ whatsNewIsNew: true, officeHours: null }), 'Office hours')?.href).toBeNull()
    expect(item(helpMenuFor({ whatsNewIsNew: true, officeHours: NEXT_CALL }), 'Office hours')?.href).toBe(
      '/overview#office-hours',
    )
  })
})

describe('Refer a church', () => {
  it('is not offered until the Refer page exists', () => {
    expect(REFER_A_CHURCH.href).toBeNull()
    expect(hasAPage('/refer')).toBe(false)
  })
})
