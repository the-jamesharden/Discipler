import { describe, expect, it } from 'vitest'
import { DAY_BLOCKS, WEEKDAYS, readIntakeForm, type IntakeFormFields } from '~/domain/intake'

/**
 * The grid is seven days by five blocks -- thirty-five slots. Suggestion tiers are
 * absolute counts against this grid (4+ across two days, 2-3, exactly 1), so the
 * denominator is load-bearing: 4 of 35 is a different claim from 4 of 28. A change
 * here is a change to every availability already collected and to every tier those
 * counts produce. See `docs/adr/0006-the-availability-grid.md`.
 */
describe('The availability grid', () => {
  it('is seven days by five named blocks', () => {
    expect(WEEKDAYS).toHaveLength(7)
    expect(DAY_BLOCKS).toEqual([
      'early_morning',
      'morning',
      'midday',
      'afternoon',
      'evening',
    ])
    expect(WEEKDAYS.length * DAY_BLOCKS.length).toBe(35)
  })

  it('draws the blocks in the order of the day', () => {
    // The form renders this order, the Leader Dashboard overlay draws it, and the
    // database enum is declared in it. Mid-morning sits before midday or the grid
    // reads as a shuffled list rather than a day.
    expect(DAY_BLOCKS.indexOf('early_morning')).toBeLessThan(DAY_BLOCKS.indexOf('morning'))
    expect(DAY_BLOCKS.indexOf('morning')).toBeLessThan(DAY_BLOCKS.indexOf('midday'))
    expect(DAY_BLOCKS.indexOf('midday')).toBeLessThan(DAY_BLOCKS.indexOf('afternoon'))
    expect(DAY_BLOCKS.indexOf('afternoon')).toBeLessThan(DAY_BLOCKS.indexOf('evening'))
  })

  it('accepts a selection in every block of every day', () => {
    const everySlot = WEEKDAYS.flatMap((day) => DAY_BLOCKS.map((block) => `${day}:${block}`))
    const form: IntakeFormFields = {
      fullName: 'Emily Johnson',
      phone: '(555) 234-9911',
      email: 'emily@example.test',
      ageBand: '25-34',
      gender: 'female',
      goalId: '00000000-0000-4000-8000-000000000009',
      availability: everySlot,
      smsConsent: true,
      contactSharing: 'granted',
      source: 'pastor_link',
      intakePath: null,
      declaredSide: null,
      experience: null,
      groupId: null,
    }

    const result = readIntakeForm(form)

    expect('refusals' in result).toBe(false)
    expect(everySlot).toHaveLength(35)
  })
})
