import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HEADINGS } from '../../app/search/copy'
import { labelParts, rowMatches, termsOf, type DirectoryRow } from '../../app/search/match'
import { DIRECTORY_PAGES, directoryFor, type DirectoryPage, type SearchNames } from '../../app/search/pages'
import { HELP_PAGES, helpPage } from '../../app/help/library'

/**
 * What search lists and what a typed word finds (Exponential launch, ticket 24). Pure:
 * that it holds nothing a person wrote and only one church's names is proved over the
 * real read, in `tests/integration/search-over-http.test.ts`.
 */

const row = (label: string, over: Partial<DirectoryRow> = {}): DirectoryRow => ({
  label,
  href: `/${label}`,
  where: 'Somewhere',
  icon: 'page',
  ...over,
})

const NAMES: SearchNames = {
  people: [row('Grace Adeyemi'), row('Greg Lawson'), row('José Núñez'), row('Marcus Bell')],
  relationships: [
    row('Greg Lawson and Marcus Bell', { also: 'Greg Lawson Marcus Bell' }),
    row('Young adults group', { also: 'Hannah Stone' }),
  ],
  materials: [row('Growing in prayer')],
  help: [row('Groups and co-leaders')],
}

const labels = (query: string, names: SearchNames | null = NAMES, pages?: readonly DirectoryPage[]) =>
  directoryFor(query, names, pages).flatMap((group) => group.rows.map((each) => each.label))

const headings = (query: string) => directoryFor(query, NAMES).map((group) => group.heading)

describe('with nothing typed', () => {
  it('is the directory as drawn: the tabs, then Settings and more, then Help', () => {
    const directory = directoryFor('', NAMES)

    expect(directory.map((group) => group.heading)).toEqual([HEADINGS.goTo, HEADINGS.settings, HEADINGS.help])
    expect(directory[0]!.rows.map((each) => each.label)).toEqual([
      'Overview',
      'Check-Ins',
      'Suggested Pairs',
      'Follow-Up',
      'Materials',
      'Roster',
    ])
    expect(directory[1]!.rows.map((each) => each.label)).toEqual([
      'Settings',
      'Intake forms',
      'Change your password',
    ])
    expect(directory[2]!.rows.map((each) => each.label)).toContain('Help center')
  })

  it('lists no names, whatever has been read', () => {
    for (const name of ['Grace Adeyemi', 'Growing in prayer', 'Groups and co-leaders']) {
      expect(labels('')).not.toContain(name)
    }
    expect(labels('   ')).toEqual(labels(''))
  })

  it('is there before the names have arrived', () => {
    expect(labels('', null)).toEqual(labels('', NAMES))
  })
})

describe('a page that does not exist yet', () => {
  it.each(['Billing', 'Refer a church', 'Ask Discipler', "What's new", 'Office hours', 'Contact support'])(
    'is not listed: %s',
    (label) => {
      // Whichever of these another ticket has landed is the point of the next test.
      const entry = [...DIRECTORY_PAGES].find((page) => page.label === label)
      expect(entry, `${label} should be written in its place`).toBeDefined()
      if (entry!.href !== null) return

      expect(labels('')).not.toContain(label)
      expect(labels(label)).not.toContain(label)
    },
  )

  it('is listed the moment its entry has an address, with nothing else to change', () => {
    const billed = DIRECTORY_PAGES.map((page) =>
      page.label === 'Billing' ? { ...page, href: '/settings#billing' } : page,
    )

    expect(labels('', NAMES, billed)).toContain('Billing')
    expect(labels('bil', NAMES, billed)).toContain('Billing')
    expect(directoryFor('', NAMES, billed)[1]!.rows.map((each) => each.label).slice(0, 2)).toEqual([
      'Settings',
      'Billing',
    ])
  })

  it('never appears as a dead row: every address listed is a route the app has', () => {
    const app = fileURLToPath(new URL('../../app', import.meta.url))
    // A page of its own, or a page of the Help center's library behind `/help/[slug]`.
    const served = (path: string) =>
      existsSync(`${app}${path}/page.tsx`) ||
      (path.startsWith('/help/') && helpPage(path.slice('/help/'.length)) !== null)

    for (const page of DIRECTORY_PAGES) {
      if (page.href === null || page.newTab) continue
      expect(served(page.href.split('#')[0]!), page.href).toBe(true)
    }
  })
})

describe('typing', () => {
  it('finds a person by the start of any word of their name', () => {
    expect(labels('marcus')).toContain('Marcus Bell')
    expect(labels('bel')).toContain('Marcus Bell')
    expect(labels('arcus')).not.toContain('Marcus Bell')
  })

  it('needs every word typed, in any order', () => {
    expect(labels('law gr')).toContain('Greg Lawson')
    expect(labels('law grace')).not.toContain('Greg Lawson')
  })

  it('ignores case and accents, both ways', () => {
    expect(labels('JOSE')).toContain('José Núñez')
    expect(labels('núñ')).toContain('José Núñez')
  })

  it('finds a named group by somebody in it', () => {
    expect(labels('hannah')).toEqual(['Young adults group'])
  })

  it('groups results under People, Relationships, Materials and Help, in that order', () => {
    expect(headings('gr')).toEqual([HEADINGS.people, HEADINGS.relationships, HEADINGS.materials, HEADINGS.help])
    expect(labels('gr')).toEqual([
      'Grace Adeyemi',
      'Greg Lawson',
      'Greg Lawson and Marcus Bell',
      'Young adults group',
      'Growing in prayer',
      'Groups and co-leaders',
    ])
  })

  it('finds a page, and each section of Settings, under the heading it has', () => {
    expect(labels('rost')).toEqual(['Roster'])
    expect(labels('language')).toEqual(['Language'])
    expect(headings('language')).toEqual([HEADINGS.settings])
    expect(directoryFor('language', NAMES)[0]!.rows[0]!.href).toBe('/settings#language')
    expect(labels('pairing')).toEqual(['Pairing'])
    expect(labels('check-in')).toEqual(['Check-Ins', 'Check-in'])
    expect(labels('password')).toEqual(['Change your password'])
    expect(labels('account')).toEqual(['Change your password'])
  })

  it('lists a Help page once, even when the Help menu offers it too', () => {
    const names = { ...NAMES, help: [row('Help center', { href: '/help' })] }
    expect(labels('help', names)).toEqual(['Help center'])
  })

  it('finds nothing for what only punctuation or an unknown word says', () => {
    expect(labels('???')).toEqual([])
    expect(labels('zzzz')).toEqual([])
  })

  it('finds the real Help pages by title', () => {
    expect(HELP_PAGES.length).toBeGreaterThan(5)
    const names = { ...NAMES, help: HELP_PAGES.map((page) => row(page.title, { href: page.href })) }
    expect(labels(HELP_PAGES[0]!.title, names)).toContain(HELP_PAGES[0]!.title)
  })
})

describe('a row', () => {
  it('answers only to its label and the names it carries, never its smaller line', () => {
    const terms = termsOf('sofa')
    expect(rowMatches(row('Greg Lawson', { sub: 'Sleeping on the sofa' }), terms)).toBe(false)
    expect(rowMatches(row('Greg Lawson', { also: 'Sofa Lawson' }), terms)).toBe(true)
  })
})

describe('the highlight', () => {
  const marked = (label: string, query: string) =>
    labelParts(label, termsOf(query))
      .filter((part) => part.marked)
      .map((part) => part.text)

  it('marks the start of each word a typed word found, as drawn', () => {
    expect(marked('Young adults group', 'gr')).toEqual(['gr'])
    expect(marked('Greg Lawson and Marcus Bell', 'gr')).toEqual(['Gr'])
    expect(marked('Greg Lawson', 'law gr')).toEqual(['Gr', 'Law'])
  })

  it('marks an accented name by its own letters', () => {
    expect(marked('José Núñez', 'jose nun')).toEqual(['José', 'Nuñ'.replace('u', 'ú')])
  })

  it('loses nothing of the label', () => {
    for (const [label, query] of [
      ['Greg Lawson and Marcus Bell', 'gr bell'],
      ['St. Mark’s Church', 'mark'],
      ['José Núñez', 'jo'],
      ['No match here', 'zzz'],
    ] as const) {
      expect(
        labelParts(label, termsOf(query))
          .map((part) => part.text)
          .join(''),
      ).toBe(label)
    }
  })
})
