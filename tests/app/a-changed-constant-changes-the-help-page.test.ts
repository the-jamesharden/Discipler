import { describe, expect, it, vi } from 'vitest'
import { helpPage } from '../../app/help/library'

/**
 * A help page states a number by naming the constant that enforces it, so a
 * changed constant changes the page (Exponential launch, ticket 34). Proved here
 * by changing two of them, one the product enforces today and one the launch
 * decided, and reading the pages that state them.
 *
 * Its own file, because `vi.mock` replaces a module for the whole file; it is
 * hoisted above the import, so the library is read with the changed constants.
 */

vi.mock('~/domain/check-in', async (original) => ({
  ...(await original<typeof import('~/domain/check-in')>()),
  REMINDER_AFTER_HOURS: 36,
}))

vi.mock('~/domain/launch-terms', async (original) => ({
  ...(await original<typeof import('~/domain/launch-terms')>()),
  TRIAL_DAYS: 45,
  TEST_CHECK_INS_PER_DAY: 5,
}))

describe('a help page', () => {
  it('says the reminder delay the check-in enforces', () => {
    const checkIns = helpPage('check-ins')!.markdown
    expect(checkIns).toContain('sends it again after 36 hours')
    expect(checkIns).not.toContain('24 hours')
  })

  it('says the trial and the test limit the launch terms set', () => {
    expect(helpPage('billing')!.markdown).toContain('Every church starts with 45 days free.')
    expect(helpPage('billing')!.markdown).not.toContain('30 days free')
    expect(helpPage('test-check-in')!.markdown).toContain('up to 5 test check-ins a day')
  })
})
