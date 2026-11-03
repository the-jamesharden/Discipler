import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OPENING_CHOICE } from '~/domain/growth'
import { upcomingOfficeHours } from '~/domain/office-hours'
import { whatsNewList } from '../../app/help/facts'
import { helpPage } from '../../app/help/library'
import { NEXT_OFFICE_HOURS, speakWithTheTeamLine } from '../../app/help/office-hours'
import { WHATS_NEW } from '../../app/help/whats-new'
import { NewsRow } from '../../app/overview/news-cards'

/**
 * The two cards and the files behind them (Exponential launch, ticket 30;
 * `.lavish/onboarding/s7-cards-top.html`).
 */

const UPCOMING = { date: 'Thursday, November 12', time: '12pm CT', link: 'https://example.com/the-call' }
const ENTRY = WHATS_NEW[0]!

const draw = (element: ReactElement) => renderToStaticMarkup(element)
const row = (props: Partial<Parameters<typeof NewsRow>[0]>) =>
  draw(createElement(NewsRow, { entry: null, officeHours: null, chart: OPENING_CHOICE, ...props }))

describe('the What’s new file', () => {
  it('ships the launch entry, in the ticket’s words', () => {
    expect(ENTRY).toMatchObject({
      title: 'Find anything with search',
      sentence:
        'Click Search at the end of the tabs, or press ⌘K, to jump to any person, relationship, material or help page.',
    })
  })

  it('gives every entry an id of its own and a real date', () => {
    expect(new Set(WHATS_NEW.map((entry) => entry.id)).size).toBe(WHATS_NEW.length)
    for (const entry of WHATS_NEW) {
      expect(entry.date, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(`${entry.date}T12:00:00Z`).toISOString().slice(0, 10), entry.id).toBe(entry.date)
    }
  })

  it('points every Read more at a Help page, and a part of it, that exists', () => {
    for (const { id, readMore } of WHATS_NEW) {
      if (!readMore) continue
      const [path, anchor] = readMore.split('#')
      const page = helpPage(path!.replace(/^\/help\//, ''))
      expect(page, id).not.toBeNull()
      if (anchor) expect(page!.headings.map((heading) => heading.anchor), id).toContain(anchor)
    }
  })

  it('reads as a Help page, newest first, each with its date and its Read more', () => {
    const list = whatsNewList([
      { id: 'a', date: '2026-11-03', title: 'The older one', sentence: 'Older words.' },
      { id: 'b', date: '2026-12-25', title: 'The newer one', sentence: 'Newer words.', readMore: '/help/overview' },
    ])

    expect(list).toBe(
      [
        '## The newer one',
        '',
        'December 25, 2026',
        '',
        'Newer words.',
        '',
        '[Read more](/help/overview)',
        '',
        '## The older one',
        '',
        'November 3, 2026',
        '',
        'Older words.',
      ].join('\n'),
    )
    expect(helpPage('whats-new')?.headings.map((heading) => heading.text)).toContain(ENTRY.title)
  })
})

describe('the office hours file', () => {
  // James has not given the Zoom link or the next date, and nothing here may invent
  // them. When he does, the file gets its four values and this test is deleted; the
  // over-HTTP suite goes on holding the page and the menu to whatever the file says.
  it('ships with no date and no link, so nothing shows', () => {
    expect(NEXT_OFFICE_HOURS).toBeNull()
    expect(upcomingOfficeHours(NEXT_OFFICE_HOURS, new Date())).toBeNull()
  })

  it('feeds the welcome window’s card, which leaves out its Next line when there is no date', () => {
    expect(speakWithTheTeamLine(UPCOMING)).toBe(
      'Office hours on Zoom every 2 weeks. Next: Thursday, November 12, at 12pm CT.',
    )
    expect(speakWithTheTeamLine(null)).toBe('Office hours on Zoom every 2 weeks.')
  })
})

describe('the cards at the top of Overview', () => {
  it('draw nothing at all when neither has anything to say', () => {
    expect(row({})).toBe('')
  })

  it('draw What’s new as the mock-up does, with a close button that works without script', () => {
    const html = row({
      entry: { id: 'search', date: '2026-10-30', title: 'A title', sentence: 'A sentence.', readMore: '/help/overview' },
    })

    expect(html).toContain('What&#x27;s new · Oct 30')
    expect(html).toContain('A title')
    expect(html).toContain('A sentence.')
    expect(html).toMatch(/<a [^>]*href="\/help\/overview"[^>]*>Read more<\/a>/)
    expect(html).toMatch(/<form [^>]*action="\/overview\/whats-new\/dismiss"[^>]*method="post">/)
    expect(html).toContain('name="entry" value="search"')
    expect(html).toMatch(/<button[^>]*class="x"[^>]*aria-label="Dismiss"/)
    expect(html).not.toContain('Office hours')
  })

  it('leave out Read more where an entry has none', () => {
    expect(row({ entry: { id: 'x', date: '2026-10-30', title: 'T', sentence: 'S.' } })).not.toContain('Read more')
  })

  it('draw office hours as the mock-up does, and it has no close button', () => {
    const html = row({ officeHours: UPCOMING })

    expect(html).toContain('id="office-hours"')
    expect(html).toContain('Office hours · every 2 weeks')
    expect(html).toContain('Thursday, November 12, 12pm CT')
    expect(html).toContain('Speak with the team directly on Zoom. Any Admin is welcome.')
    expect(html).toMatch(/<a [^>]*href="https:\/\/example\.com\/the-call"[^>]*>Join on Zoom<\/a>/)
    expect(html).toMatch(/target="_blank"/)
    expect(html).not.toContain('class="x"')
    expect(html).not.toContain('What&#x27;s new')
  })

  it('carry the growth chart’s choice through dismissing, so the Admin lands back on what they were reading', () => {
    const html = row({ entry: ENTRY, chart: { measure: 'groups', scale: 'months' } })

    expect(html).toContain('name="growth" value="groups"')
    expect(html).toContain('name="by" value="months"')
  })
})
