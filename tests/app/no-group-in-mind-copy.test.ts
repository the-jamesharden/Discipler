import { describe, expect, it } from 'vitest'
import { relationshipId } from '~/domain/ids'
import { NO_GROUP_IN_MIND, readSlot, type AvailabilitySlot } from '~/domain/intake'
import type { PlacementWanted } from '~/service/ports'
import {
  ageBandWords,
  availabilityWords,
  followUpTag,
  NO_GROUP_OPEN_TO_THEM,
  placementLine,
} from '../../app/follow-up/copy'
import {
  NO_GROUP_IN_MIND_ANSWER,
  noGroupInMindDescription,
  placementWantedMessage,
} from '../../app/intake/copy'
import { groupWizard } from '../../app/intake/group-wizard-answers'

/**
 * Group form exits, ticket 01: the words of the dashed option on step three
 * (S-7), the done page after it, and the *Wants a group* item (S-8).
 */

const slots = (...keys: string[]): AvailabilitySlot[] =>
  keys.map((key) => {
    const slot = readSlot(key)
    if (!slot) throw new Error(`not a slot: ${key}`)
    return slot
  })

const jonah = (over: Partial<PlacementWanted> = {}): PlacementWanted => ({
  gender: 'male',
  ageBand: '25-34',
  availability: slots('tuesday:18', 'tuesday:19', 'thursday:17'),
  groups: [{ relationshipId: relationshipId('00000000-0000-4000-8000-0000000000b1'), name: 'Tuesday men’s group' }],
  timeZone: 'America/Chicago',
  ...over,
})

describe('step three', () => {
  it('says the option and its line as S-7 draws them', () => {
    expect(NO_GROUP_IN_MIND_ANSWER).toBe('I don’t have a group in mind')
    expect(noGroupInMindDescription('Grace Fellowship')).toBe(
      'We’ll let Grace Fellowship know you’d like to be placed in one.',
    )
  })

  it('keeps the answer between screens, beside the groups it was offered with', () => {
    const answers = groupWizard.readAnswers(
      { groupId: NO_GROUP_IN_MIND },
      { groupId: ['00000000-0000-4000-8000-0000000000b1', NO_GROUP_IN_MIND] },
    )
    expect(answers.groupId).toBe(NO_GROUP_IN_MIND)
  })

  it('says on the done page that the Ministry was told, and not that a group was joined', () => {
    const message = placementWantedMessage('Grace Fellowship')
    expect(message).toContain('Grace Fellowship')
    expect(message).toContain('placed in a group')
    expect(message).not.toMatch(/you’re in/i)
  })
})

describe('the Wants a group item', () => {
  it('is tagged for the condition', () => {
    expect(followUpTag.group_placement_wanted).toBe('Wants a group')
  })

  it('says S-8’s line, in the Ministry’s own zone', () => {
    // Seven in the evening of the 8th in Chicago is the 9th in UTC.
    expect(placementLine(new Date('2026-09-09T00:30:00Z'), jonah())).toBe(
      "Signed up on the group link on 8 Sep with no group in mind. Men's, 25 to 34, available Tuesday and Thursday evenings.",
    )
  })

  it('leaves out whatever of the Intake is missing rather than guessing', () => {
    expect(
      placementLine(new Date('2026-09-09T15:00:00Z'), jonah({ gender: null, ageBand: null })),
    ).toBe('Signed up on the group link on 9 Sep with no group in mind. Available Tuesday and Thursday evenings.')
    expect(
      placementLine(
        new Date('2026-09-09T15:00:00Z'),
        jonah({ gender: null, ageBand: null, availability: [] }),
      ),
    ).toBe('Signed up on the group link on 9 Sep with no group in mind.')
  })

  it('says why there is nothing to choose from when no group is open to them', () => {
    expect(placementLine(new Date('2026-09-09T15:00:00Z'), jonah({ groups: [] }))).toMatch(
      new RegExp(`${NO_GROUP_OPEN_TO_THEM}$`),
    )
  })

  it('says an age band in words', () => {
    expect(ageBandWords('18-24')).toBe('18 to 24')
    expect(ageBandWords('65+')).toBe('65 and over')
  })
})

describe('availability in parts of the day', () => {
  it('gathers the days free in the same parts, in the order of the week', () => {
    expect(availabilityWords(slots('thursday:18', 'tuesday:19'))).toBe('Tuesday and Thursday evenings')
    expect(availabilityWords(slots('monday:08', 'tuesday:18', 'thursday:18'))).toBe(
      'Monday mornings, Tuesday and Thursday evenings',
    )
  })

  it('draws the parts at noon and five', () => {
    expect(availabilityWords(slots('saturday:11'))).toBe('Saturday mornings')
    expect(availabilityWords(slots('saturday:12'))).toBe('Saturday afternoons')
    expect(availabilityWords(slots('saturday:16'))).toBe('Saturday afternoons')
    expect(availabilityWords(slots('saturday:17'))).toBe('Saturday evenings')
  })

  it('says several parts of one day, and all of them as all day', () => {
    expect(availabilityWords(slots('sunday:09', 'sunday:14'))).toBe('Sunday mornings and afternoons')
    expect(availabilityWords(slots('sunday:09', 'sunday:14', 'sunday:19'))).toBe('Sunday all day')
  })

  it('names every day, the weekdays and the weekend as such', () => {
    const everyEvening = slots(
      'monday:18', 'tuesday:18', 'wednesday:18', 'thursday:18', 'friday:18', 'saturday:18', 'sunday:18',
    )
    expect(availabilityWords(everyEvening)).toBe('every evening')
    expect(availabilityWords(everyEvening.slice(0, 5))).toBe('weekday evenings')
    expect(availabilityWords(everyEvening.slice(5))).toBe('weekend evenings')
  })
})
