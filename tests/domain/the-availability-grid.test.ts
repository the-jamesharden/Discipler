import { describe, expect, it } from 'vitest'
import {
  FIRST_HOUR,
  LAST_HOUR,
  SLOT_HOURS,
  WEEKDAYS,
  readIntakeForm,
  type IntakeFormFields,
} from '~/domain/intake'

/**
 * The grid is seven days by twelve one-hour slots, 8am to 8pm -- eighty-four slots.
 * Suggestion tiers are absolute counts against this grid, so the denominator is
 * load-bearing: 4 of 84 is a different claim from 4 of 35, which is why the cutoffs
 * set against the five-block grid are reopened rather than carried over. A change
 * here is a change to every availability already collected and to every tier those
 * counts produce. See `docs/adr/0018-the-hourly-grid.md`.
 */
describe('The availability grid', () => {
  it('is seven days by twelve hours', () => {
    expect(WEEKDAYS).toHaveLength(7)
    expect(SLOT_HOURS).toEqual([
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
    ])
    expect(WEEKDAYS.length * SLOT_HOURS.length).toBe(84)
  })

  it('draws the hours in the order of the day, from 8am to the slot that ends at 8pm', () => {
    // The form renders this order, the Leader Dashboard overlay draws it, and the
    // database enum is declared in it. Each value is the hour a slot starts, so the
    // last one starts at 7pm and ends at the grid's closing hour.
    expect(SLOT_HOURS).toHaveLength(LAST_HOUR - FIRST_HOUR)
    expect(SLOT_HOURS[0]).toBe(String(FIRST_HOUR).padStart(2, '0'))
    expect(SLOT_HOURS[SLOT_HOURS.length - 1]).toBe(String(LAST_HOUR - 1).padStart(2, '0'))

    // Zero-padded so the text sorts the way the day runs: a key has to read the
    // same in a URL, a hidden input and a database row, and none of those sorts
    // numerically.
    expect([...SLOT_HOURS].sort()).toEqual([...SLOT_HOURS])
  })

  it('accepts a selection in every hour of every day', () => {
    const everySlot = WEEKDAYS.flatMap((day) => SLOT_HOURS.map((hour) => `${day}:${hour}`))
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
    expect(everySlot).toHaveLength(84)
  })
})
