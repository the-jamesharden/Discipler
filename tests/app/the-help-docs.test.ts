import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { dollars, duration, HELP_FACTS } from '../../app/help/facts'
import {
  fillPlaceholders,
  HELP_PAGES,
  HELP_SECTIONS,
  HELP_SOURCES,
  helpCenterAsText,
  helpPage,
  readHelpPage,
  type HelpPage,
} from '../../app/help/library'
import { renderMarkdown } from '../../app/help/markdown'

/**
 * Discipler's help docs (Exponential launch, ticket 34): one Markdown file per
 * page, every number filled from the constant that enforces it, served at `/help`
 * and read as text by search and the AI guide.
 */

const contentDirectory = fileURLToPath(new URL('../../app/help/content', import.meta.url))
const files = readdirSync(contentDirectory).filter((name) => name.endsWith('.md'))
const sourceOf = (slug: string): string => readFileSync(join(contentDirectory, `${slug}.md`), 'utf8')
const page = (slug: string) => {
  const found = helpPage(slug)
  if (!found) throw new Error(`No help page ${slug}`)
  return found
}

describe('the help pages', () => {
  it('lists every file in content/, each under its own name, once', () => {
    expect(HELP_SOURCES.map((source) => `${source.slug}.md`).sort()).toEqual([...files].sort())
    for (const { slug, source } of HELP_SOURCES) expect(source).toBe(sourceOf(slug))
  })

  it('covers at least the pages the ticket names', () => {
    for (const slug of [
      'getting-started',
      'roster-and-intake',
      'pairing',
      'check-ins',
      'follow-up',
      'materials',
      'settings',
      'billing',
      'referrals',
      'test-check-in',
      'texting',
    ]) {
      expect(helpPage(slug), slug).not.toBeNull()
    }
  })

  it('puts every page in a section the Help center shows', () => {
    const sections = new Set<string>(HELP_SECTIONS.map((section) => section.key))
    for (const help of HELP_PAGES) expect(sections.has(help.section), help.slug).toBe(true)
    for (const section of HELP_SECTIONS) {
      expect(HELP_PAGES.some((help) => help.section === section.key), section.key).toBe(true)
    }
  })

  it('gives every page a title, an address and a summary', () => {
    expect(page('check-ins')).toMatchObject({
      title: 'Check-ins and their rhythm',
      href: '/help/check-ins',
    })
    for (const help of HELP_PAGES) {
      expect(help.title, help.slug).not.toBe('')
      expect(help.summary.length, help.slug).toBeGreaterThan(20)
      expect(help.markdown.startsWith('# '), help.slug).toBe(false)
    }
  })

  it('leads the list with each page\'s first sentence', () => {
    expect(page('overview').lead).toBe('Overview answers one question at a glance: how is your ministry doing right now?')
    expect(page('check-ins').lead).toBe(
      'Once a week, on the day and hour you choose in Settings, Discipler texts each Discipler to ask how their week went.',
    )
    for (const help of HELP_PAGES) expect(help.summary.startsWith(help.lead), help.slug).toBe(true)
  })

  it('anchors each heading so a link can point at part of a page', () => {
    expect(page('check-ins').headings).toContainEqual({
      text: 'When nobody answers',
      anchor: 'when-nobody-answers',
    })
    expect(renderMarkdown('## When nobody answers')).toContain('<h2 id="when-nobody-answers">')
    for (const help of HELP_PAGES) {
      const anchors = help.headings.map((heading) => heading.anchor)
      expect(new Set(anchors).size, help.slug).toBe(anchors.length)
    }
  })
})

describe('the numbers in a help page', () => {
  /** Every fact in words with no digit, so any digit left on a page was typed there. */
  const FACTS_WITH_NO_DIGITS = Object.fromEntries(
    Object.keys(HELP_FACTS).map((name) => [name, 'a fact']),
  )

  /**
   * What a page may say with a digit of its own: nothing, except an ordered list's
   * numbering and the two shapes the Pair popup names, 1:1 and 1:2.
   */
  const typedNumbers = ({ title, markdown }: HelpPage): string[] =>
    `${title}\n${markdown}`
      .replace(/^\s*\d+\.\s/gm, '')
      .replace(/\b1:[12]\b/g, '')
      .split('\n')
      .filter((line) => /\d/.test(line))

  it.each(HELP_SOURCES.map((source) => [source.slug, source] as const))(
    'are never typed by hand: %s',
    (_slug, source) => {
      expect(typedNumbers(readHelpPage(source, FACTS_WITH_NO_DIGITS))).toEqual([])
    },
  )

  it('come from the constants that enforce them', () => {
    expect(page('check-ins').markdown).toContain('sends it again after 24 hours')
    expect(page('check-ins').markdown).toContain('no answer for 2 weeks in a row')
    expect(page('test-check-in').markdown).toContain('up to 3 test check-ins a day')
    expect(page('test-check-in').markdown).toContain('ends after an hour')
    expect(page('signing-in').markdown).toContain('at least 8 characters and no more than 72.')
    expect(page('settings').markdown).toContain('between 8am and 9pm')
  })

  it('state the prices and the offers as the spec sets them', () => {
    const billing = page('billing').markdown
    expect(billing).toContain('Every church starts with 30 days free.')
    expect(billing).toContain('$97 a month for up to 200 people')
    expect(billing).toContain('$147 a month above 200')
    expect(billing).toContain('$931.20 a year for up to 200 people, or $1,411.20 a year above')
    expect(billing).toContain('the code EXPO26 for 60 days free instead of 30 days, then 20% off your first year')
    expect(billing).toContain('until the end of December 11, 2026, Pacific time')
    expect(page('referrals').markdown).toContain('waits 30 days after their first payment')
  })

  it('quote texts word for word from the composers that send them', () => {
    expect(page('check-ins').markdown).toContain(
      'Did you meet with Jordan this week? Reply 1 for yes, 2 for no.',
    )
    expect(page('check-ins').markdown).toContain(
      'How did the meeting go? Reply A for outstanding, B for good, C for okay, D for concern.',
    )
  })

  it('leave no placeholder unfilled and no fact unused', () => {
    for (const help of HELP_PAGES) expect(help.markdown, help.slug).not.toMatch(/\{\{|\}\}/)
    const words = ({ title, markdown }: HelpPage) => `${title}\n${markdown}`
    for (const name of Object.keys(HELP_FACTS)) {
      const changed = { ...HELP_FACTS, [name]: 'a changed fact' }
      const shows = HELP_SOURCES.some(
        (source) => words(readHelpPage(source, changed)) !== words(readHelpPage(source)),
      )
      expect(shows, name).toBe(true)
    }
  })

  it('refuse a placeholder with no fact rather than show braces', () => {
    expect(() => fillPlaceholders('Wait {{nothingCalledThis}}.', HELP_FACTS, 'a test')).toThrow(
      /nothingCalledThis/,
    )
  })

  it('are said in words a sentence can hold', () => {
    expect(duration(24, 'hour')).toBe('24 hours')
    expect(duration(1, 'hour')).toBe('an hour')
    expect(duration(1, 'week')).toBe('a week')
    expect(dollars(9_700)).toBe('$97')
    expect(dollars(93_120)).toBe('$931.20')
    expect(dollars(141_120)).toBe('$1,411.20')
    expect(dollars(7_760)).toBe('$77.60')
  })
})

describe('the words in a help page', () => {
  it.each(HELP_PAGES.map((help) => [help.slug, help] as const))(
    'use no em dash: %s',
    (_slug, { title, markdown }) => {
      expect(`${title}\n${markdown}`).not.toContain('\u2014')
    },
  )

  it('link only to help pages and parts of them that exist', () => {
    for (const help of HELP_PAGES) {
      for (const [, target] of help.markdown.matchAll(/\]\((\/help[^)]*)\)/g)) {
        const [path, anchor] = target!.split('#')
        const linked = helpPage(path!.replace(/^\/help\/?/, ''))
        expect(linked, `${help.slug} links to ${target}`).not.toBeNull()
        if (anchor) {
          expect(linked!.headings.map((heading) => heading.anchor), `${help.slug} links to ${target}`).toContain(anchor)
        }
      }
    }
  })

  it('name nobody from a real church', () => {
    const everything = HELP_PAGES.map((help) => help.markdown).join('\n')
    for (const name of ['SAU', 'BCM', 'Anthem', 'Lerone']) expect(everything).not.toContain(name)
  })
})

describe('rendering a help page', () => {
  it('shows raw HTML as text and never as a tag', () => {
    const html = renderMarkdown('Hello <script>alert("x")</script> and <img src=x onerror=y>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
  })

  it('makes no link of a script address', () => {
    expect(renderMarkdown('[press me](javascript:alert(1))')).not.toContain('href')
  })

  it('renders every page', () => {
    for (const help of HELP_PAGES) expect(renderMarkdown(help.markdown), help.slug).toContain('<p>')
  })
})

describe('the Help center as text', () => {
  it('holds every page under its title and address, for the AI guide to answer from', () => {
    const text = helpCenterAsText()
    for (const help of HELP_PAGES) {
      expect(text).toContain(`# ${help.title}\nAddress: ${help.href}\n\n${help.markdown}`)
    }
  })
})
