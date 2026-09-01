import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { MinistrySettingsRefused } from '~/domain/errors'
import { createSequentialIds, ministryId } from '~/domain/ids'
import {
  QUIET_HOURS,
  readMinistrySettings,
  roleNoun,
  speakingName,
  type MinistrySettings,
  type MinistrySettingsFields,
} from '~/domain/ministry-settings'

/**
 * Everything a Ministry is allowed to vary about how Discipler runs for them, read
 * off one form.
 *
 * Every refusal here is also enforced somewhere it cannot be got round -- the
 * timezone by a trigger, the check-in hour by a check constraint, the nouns by a
 * non-blank check. That is deliberate and it is not duplication: pilot settings get
 * written by SQL as often as by a button, and what this module adds is the sentence
 * an Admin reads instead of a constraint violation.
 */

const filled: MinistrySettingsFields = {
  name: 'Riverside Chapel',
  fromName: 'Riverside',
  timezone: 'America/Chicago',
  leaderNoun: 'mentor',
  participantNoun: 'mentee',
  suggestGenderMatch: true,
  suggestMaxAgeBandGap: '1',
  checkinDay: '1',
  checkinHour: '9',
}

const readOrThrow = (fields: MinistrySettingsFields): MinistrySettings => {
  const reading = readMinistrySettings(fields)
  if ('refusals' in reading) {
    throw new Error(`These settings were refused: ${reading.refusals.join(', ')}`)
  }
  return reading.settings
}

const refusalsFrom = (fields: Partial<MinistrySettingsFields>) => {
  const reading = readMinistrySettings({ ...filled, ...fields })
  return 'refusals' in reading ? reading.refusals : []
}

describe('reading a Ministry’s settings off the form', () => {
  it('takes a filled form as it stands', () => {
    expect(readOrThrow(filled)).toEqual({
      name: 'Riverside Chapel',
      fromName: 'Riverside',
      timezone: 'America/Chicago',
      leaderNoun: 'mentor',
      participantNoun: 'mentee',
      suggestGenderMatch: true,
      suggestMaxAgeBandGap: 1,
      cadence: { day: 1, hour: 9 },
    })
  })

  it('reports every problem at once, rather than one round trip at a time', () => {
    expect(
      refusalsFrom({ name: '   ', leaderNoun: '', checkinHour: '6' }),
    ).toEqual([
      'settings.name_missing',
      'settings.leader_noun_missing',
      'settings.checkin_hour_outside_quiet_hours',
    ])
  })

  describe('the Ministry section', () => {
    it('refuses a Ministry with nothing written on it', () => {
      expect(refusalsFrom({ name: '  ' })).toContain('settings.name_missing')
    })

    it('collapses what was typed, so two spaces are a typo and not a second name', () => {
      expect(readOrThrow({ ...filled, name: '  Riverside   Chapel ' }).name).toBe(
        'Riverside Chapel',
      )
    })

    /**
     * A Ministry that has never set one speaks as its own display name. Null and
     * not the name copied into the column: a Ministry that renames itself has
     * renamed itself, and a copy would leave its messages speaking as whoever it
     * used to be until somebody noticed.
     */
    it('reads a blank sending name as none, and speaks as the display name', () => {
      const settings = readOrThrow({ ...filled, fromName: '   ' })

      expect(settings.fromName).toBeNull()
      expect(speakingName(settings)).toBe('Riverside Chapel')
    })

    it('speaks as the sending name when there is one', () => {
      expect(speakingName(readOrThrow(filled))).toBe('Riverside')
    })

    it('refuses a zone this platform could not resolve a week or a cadence against', () => {
      expect(refusalsFrom({ timezone: 'Mars/Olympus_Mons' })).toContain(
        'settings.timezone_unknown',
      )
      expect(refusalsFrom({ timezone: '' })).toContain('settings.timezone_unknown')
    })
  })

  describe('the Language section', () => {
    it('takes the nouns exactly as they were typed', () => {
      const settings = readOrThrow({
        ...filled,
        leaderNoun: 'discipleship coach',
        participantNoun: 'friend',
      })

      expect(settings.leaderNoun).toBe(roleNoun('discipleship coach'))
      expect(settings.participantNoun).toBe(roleNoun('friend'))
    })

    it('refuses a role with no word for it', () => {
      expect(refusalsFrom({ leaderNoun: ' ' })).toContain('settings.leader_noun_missing')
      expect(refusalsFrom({ participantNoun: '' })).toContain(
        'settings.participant_noun_missing',
      )
    })
  })

  describe('the Pairing section', () => {
    /**
     * The gender constraint is a safeguarding rule a Ministry turns off on purpose;
     * the age gap is a suggestion tuning dial. Only the first has a state worth
     * naming here, because an unchecked box is a decision and an absent one is not.
     */
    it('takes the gender rule as the deliberate answer it is', () => {
      expect(readOrThrow({ ...filled, suggestGenderMatch: false }).suggestGenderMatch).toBe(
        false,
      )
    })

    /**
     * Bands a Participant may be **above** their Leader, and nothing below. `0` is
     * a Ministry saying *never older than their Leader*, which is a setting and not
     * an absent one.
     */
    it('takes a gap of none, which is a Ministry that means it', () => {
      expect(readOrThrow({ ...filled, suggestMaxAgeBandGap: '0' }).suggestMaxAgeBandGap).toBe(
        0,
      )
    })

    it('refuses a gap that is not a whole number of bands, or wider than the ladder', () => {
      for (const gap of ['-1', '1.5', 'lots', '', '6']) {
        expect(refusalsFrom({ suggestMaxAgeBandGap: gap })).toContain(
          'settings.age_band_gap_unreadable',
        )
      }
    })

    it('takes every day of the week, Sunday as 0', () => {
      for (const day of [0, 1, 2, 3, 4, 5, 6]) {
        expect(readOrThrow({ ...filled, checkinDay: String(day) }).cadence.day).toBe(day)
      }
    })

    it('refuses a day that names none', () => {
      for (const day of ['7', '-1', 'Monday', '']) {
        expect(refusalsFrom({ checkinDay: day })).toContain('settings.checkin_day_unreadable')
      }
    })

    /**
     * The clamp, said here as a sentence and enforced by a check constraint that a
     * form cannot get round. A coordinator who innocently sets 6:30am creates a
     * compliance problem Discipler carries, not the ministry.
     */
    it('holds the check-in hour inside quiet hours', () => {
      expect(readOrThrow({ ...filled, checkinHour: '8' }).cadence.hour).toBe(
        QUIET_HOURS.earliest,
      )
      expect(readOrThrow({ ...filled, checkinHour: '21' }).cadence.hour).toBe(
        QUIET_HOURS.latest,
      )

      for (const hour of ['7', '22', '0']) {
        expect(refusalsFrom({ checkinHour: hour })).toContain(
          'settings.checkin_hour_outside_quiet_hours',
        )
      }
    })

    it('refuses an hour that is not a whole hour at all', () => {
      for (const hour of ['9.5', 'nine', '']) {
        expect(refusalsFrom({ checkinHour: hour })).toContain(
          'settings.checkin_hour_outside_quiet_hours',
        )
      }
    })
  })
})


/**
 * The one save. Three sections of one form reach the boundary as one command,
 * because a Ministry whose timezone landed while its cadence was refused is a
 * Ministry with a check-in due at an hour nobody chose.
 */
describe('saving a Ministry’s settings', () => {
  const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
  const at = new Date('2026-09-15T10:00:00Z')

  const stood: MinistrySettings = {
    name: 'Riverside Chapel',
    fromName: null,
    timezone: 'UTC',
    leaderNoun: roleNoun('mentor'),
    participantNoun: roleNoun('mentee'),
    suggestGenderMatch: true,
    suggestMaxAgeBandGap: 1,
    cadence: { day: 1, hour: 9 },
  }

  const context: CommandContext = {
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    settings: stood,
  }

  const save = (fields: Partial<MinistrySettingsFields>): readonly Effect[] =>
    handleCommand(
      {
        type: 'settings.update',
        ministryId: ministry,
        changedBy: 'admin@riverside.test',
        fields: {
          name: stood.name,
          fromName: stood.fromName,
          timezone: stood.timezone,
          leaderNoun: stood.leaderNoun,
          participantNoun: stood.participantNoun,
          suggestGenderMatch: stood.suggestGenderMatch,
          suggestMaxAgeBandGap: String(stood.suggestMaxAgeBandGap),
          checkinDay: String(stood.cadence.day),
          checkinHour: String(stood.cadence.hour),
          ...fields,
        },
      },
      context,
    ).effects

  const savedBy = (effects: readonly Effect[]) =>
    effects.flatMap((effect) => (effect.kind === 'settings.save' ? [effect.saving] : []))

  const recordedBy = (effects: readonly Effect[]) =>
    effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))

  it('saves every field at once, because it is one form', () => {
    const effects = save({
      timezone: 'America/Chicago',
      leaderNoun: 'coach',
      checkinHour: '19',
    })

    expect(savedBy(effects)).toEqual([
      {
        ministryId: ministry,
        settings: {
          ...stood,
          timezone: 'America/Chicago',
          leaderNoun: 'coach',
          cadence: { day: 1, hour: 19 },
        },
      },
    ])
  })

  /**
   * What actually moved, and nothing that did not. An Admin who opened the form to
   * correct one noun has changed one thing, and a record claiming they set nine
   * would make the change that matters -- the day a Ministry turned the gender
   * rule off -- impossible to find by reading.
   */
  it('records what each field used to be, and only the fields that moved', () => {
    const [event] = recordedBy(save({ suggestGenderMatch: false, checkinDay: '4' }))

    expect(event).toMatchObject({
      ministryId: ministry,
      occurredAt: at,
      type: 'ministry.settings_changed',
      subjectType: 'ministry',
      subjectId: ministry,
      payload: {
        changedBy: 'admin@riverside.test',
        changes: {
          suggestGenderMatch: { from: true, to: false },
          checkinDay: { from: 1, to: 4 },
        },
      },
    })
  })

  /**
   * Nothing moved, so nothing happened. The same answer `goal.move` gives the
   * Admin who pressed *up* on the top option: they have asked for the settings
   * they are already looking at, and an event recording that they changed nothing
   * would be a diary entry in a record that is read for the changes that matter.
   */
  it('writes nothing at all for a form that changed nothing', () => {
    expect(save({})).toEqual([])
  })

  /**
   * Refused whole, and every problem at once. A save that took the Language and
   * dropped the Pairing would leave an Admin looking at a form that half worked.
   */
  it('refuses the whole form when any of it cannot be taken', () => {
    expect(() => save({ checkinHour: '6', participantNoun: '  ' })).toThrow(
      MinistrySettingsRefused,
    )

    try {
      save({ checkinHour: '6', participantNoun: '  ' })
    } catch (error) {
      expect((error as MinistrySettingsRefused).refusals).toEqual([
        'settings.participant_noun_missing',
        'settings.checkin_hour_outside_quiet_hours',
      ])
    }
  })
})
