import { describe, expect, it } from 'vitest'
import { HELP_PAGES, helpPagesShown } from '../../app/help/library'

/**
 * No AI for the launch (James, 2026-11-06): while Ask Discipler is switched off, the
 * Help center does not describe a button that is not there. Its page is not listed or
 * served, and no other page links to it.
 */
describe('the help docs with Ask Discipler off', () => {
  const off = helpPagesShown(false)

  it('leaves its page out, and keeps every other page in order', () => {
    expect(off.map((page) => page.slug)).toEqual(
      HELP_PAGES.map((page) => page.slug).filter((slug) => slug !== 'ask-discipler'),
    )
  })

  it('takes out the line on Getting help that links to it, and only that line', () => {
    const before = HELP_PAGES.find((page) => page.slug === 'getting-help')!.markdown
    const after = off.find((page) => page.slug === 'getting-help')!.markdown
    expect(before).toContain('](/help/ask-discipler)')
    expect(after).not.toContain('/help/ask-discipler')
    expect(after).not.toMatch(/Ask Discipler/)
    expect(before.split('\n').length - after.split('\n').length).toBe(1)
    expect(after).toContain('**[Setup videos](/help/setup-videos)**')
  })

  it('mentions it nowhere else', () => {
    for (const page of off) expect(`${page.title}\n${page.markdown}`).not.toMatch(/Ask Discipler|ask-discipler/)
  })
})

describe('the help docs with Ask Discipler on', () => {
  it('shows every page as written', () => {
    expect(helpPagesShown(true)).toBe(HELP_PAGES)
  })
})
