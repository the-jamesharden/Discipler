import { describe, expect, it } from 'vitest'
import { handleCommand } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { createSequentialIds, ministryId } from '~/domain/ids'
import { newestUndismissed, type WhatsNewEntry } from '~/domain/whats-new'

/**
 * What's new (Exponential launch, ticket 30): the card shows the newest entry this
 * Admin has not dismissed, and dismissing one is theirs alone.
 */

const entry = (id: string, date: string): WhatsNewEntry => ({
  id,
  date,
  title: `The ${id} entry`,
  sentence: `What ${id} is about.`,
})

const older = entry('older', '2026-11-01')
const newer = entry('newer', '2026-12-01')

describe('the entry the card shows', () => {
  it('is the newest, wherever it sits in the file', () => {
    expect(newestUndismissed([older, newer], [])).toEqual(newer)
    expect(newestUndismissed([newer, older], [])).toEqual(newer)
  })

  it('falls back to the next newest once the newest is dismissed', () => {
    expect(newestUndismissed([older, newer], ['newer'])).toEqual(older)
  })

  it('is nothing once this Admin has dismissed them all', () => {
    expect(newestUndismissed([older, newer], ['older', 'newer'])).toBeNull()
  })

  it('is nothing when the file holds none, and ignores a dismissal of an entry since taken out', () => {
    expect(newestUndismissed([], ['gone'])).toBeNull()
    expect(newestUndismissed([older], ['gone'])).toEqual(older)
  })
})

describe('whats_new.dismiss', () => {
  const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
  const now = new Date('2026-11-04T15:00:00Z')

  it('records the dismissal against the Admin, and writes no history', () => {
    const result = handleCommand(
      { type: 'whats_new.dismiss', ministryId: ministry, entryId: 'search', dismissedBy: 'admin-user-1' },
      { ministryId: ministry, clock: createTestClock(now), ids: createSequentialIds() },
    )

    expect(result.rejections).toEqual([])
    expect(result.effects).toEqual([
      {
        kind: 'whatsNew.dismiss',
        dismissal: { ministryId: ministry, userId: 'admin-user-1', entryId: 'search', dismissedAt: now },
      },
    ])
  })
})
