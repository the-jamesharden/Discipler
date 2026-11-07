import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HelpPage from '../../app/help/[slug]/page'
import { searchNames } from '../../app/search/names'

/**
 * A help page's Previous and Next, as the server renders them, and the Help pages search
 * finds, with Ask Discipler off and on (James, 2026-11-06: no AI for the launch). Off, the
 * pager and search step over the guide's page as though it were never there, and every
 * page the pager does show keeps its neighbours.
 */

const htmlOf = async (slug: string) => renderToStaticMarkup(await HelpPage({ params: Promise.resolve({ slug }) }))

/** The pager's links, each as its class and where it goes. */
const pagerOf = (html: string) => {
  const nav = /<nav class="help-pager"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? ''
  return Object.fromEntries(
    [...nav.matchAll(/<a class="help-pager-(previous|next)" href="([^"]+)"/g)].map(([, side, href]) => [side, href]),
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the help pager with Ask Discipler off', () => {
  it('goes from Signing in straight on to Getting help', async () => {
    vi.stubEnv('ASK_DISCIPLER_ON', '')
    expect(pagerOf(await htmlOf('signing-in'))).toEqual({
      previous: '/help/referrals',
      next: '/help/getting-help',
    })
  })

  it('keeps Getting help between Signing in and Setup videos, though a line of it was taken out', async () => {
    vi.stubEnv('ASK_DISCIPLER_ON', '')
    expect(pagerOf(await htmlOf('getting-help'))).toEqual({
      previous: '/help/signing-in',
      next: '/help/setup-videos',
    })
  })

  it('does not serve the guide page at all', async () => {
    vi.stubEnv('ASK_DISCIPLER_ON', '')
    await expect(htmlOf('ask-discipler')).rejects.toThrow()
  })
})

describe('the help pager with Ask Discipler on', () => {
  it('puts the guide page between Signing in and Getting help', async () => {
    vi.stubEnv('ASK_DISCIPLER_ON', 'true')
    expect(pagerOf(await htmlOf('signing-in')).next).toBe('/help/ask-discipler')
    expect(pagerOf(await htmlOf('ask-discipler'))).toEqual({
      previous: '/help/signing-in',
      next: '/help/getting-help',
    })
    expect(pagerOf(await htmlOf('getting-help'))).toEqual({
      previous: '/help/ask-discipler',
      next: '/help/setup-videos',
    })
  })
})

describe('search with Ask Discipler off and on', () => {
  const nothingElse = { timeZone: 'America/Chicago', people: [], relationships: [], materials: [] }
  const helpHrefs = () => searchNames(nothingElse, null, new Date()).help.map((row) => row.href)

  it('does not find the guide page while it is off, and finds every other page', () => {
    vi.stubEnv('ASK_DISCIPLER_ON', '')
    expect(helpHrefs()).not.toContain('/help/ask-discipler')
    expect(helpHrefs()).toContain('/help/getting-help')
  })

  it('finds it while it is on', () => {
    vi.stubEnv('ASK_DISCIPLER_ON', 'true')
    expect(helpHrefs()).toContain('/help/ask-discipler')
  })
})
