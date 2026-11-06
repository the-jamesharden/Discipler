import { describe, expect, it } from 'vitest'
import { GAP_EXAMPLE, gapLabel } from '../../app/settings/copy'

/**
 * Settings' age choice on a phone (James, 2026-11-06). The worked example sat inside
 * the first choice and ran past a phone's width, so the select showed "Up to 1 band
 * older (a 25-34 leader may b". Each choice is now short, and the example is said once
 * in the sentence above the box, where it wraps.
 */
describe('the age choice', () => {
  it('says each gap in a few words, with no example inside it', () => {
    expect([0, 1, 2, 3].map(gapLabel)).toEqual([
      'Never older than their leader',
      'Up to 1 band older',
      'Up to 2 bands older',
      'Up to 3 bands older',
    ])
  })

  it('works one band through in the sentence above', () => {
    expect(GAP_EXAMPLE).toBe(
      'At 1 band older, a 25-34 leader may be suggested a 35-44 participant.',
    )
  })
})
