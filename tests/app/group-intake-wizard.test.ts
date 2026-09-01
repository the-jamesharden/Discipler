import { describe, expect, it } from 'vitest'
import {
  joinedMessage,
  noGroupsMessage,
  refusalMessages,
  requestedMessage,
} from '../../app/intake/copy'
import {
  GROUP_AGE_AND_GENDER_STEP,
  GROUP_AVAILABILITY_STEP,
  GROUP_LAST_STEP,
  GROUP_STEP,
  groupWizard,
} from '../../app/intake/group-wizard-answers'

/**
 * The group form's two decisions that are not the domain's: which screen somebody
 * is entitled to see, and what the screens say.
 */

const offered = ['00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2']

describe('the list the group form steps through', () => {
  it('asks gender before the group, and the group before the name', () => {
    expect(GROUP_AGE_AND_GENDER_STEP).toBe(1)
    expect(GROUP_AVAILABILITY_STEP).toBe(2)
    expect(GROUP_STEP).toBe(3)
    expect(GROUP_LAST_STEP).toBe(4)
  })

  it('asks for every answer it carries between screens, and each of them once', () => {
    const carried = Object.keys(groupWizard.readAnswers({})).sort()
    const asked = groupWizard.SCREENS.flatMap((screen) => [...screen.asks]).sort()
    expect(asked).toEqual(carried)
  })

  it('asks no Goal and no side', () => {
    expect(groupWizard.CHOICE_FIELDS).toEqual(['ageBand', 'gender', 'groupId'])
  })

  /**
   * The list of groups is filtered on the gender, so re-answering the gender puts
   * a different list under the group already chosen. The first screen drops it
   * and the question is put again.
   */
  it('drops the group when the gender is re-answered, and carries everything else', () => {
    expect(groupWizard.notCarriedAt(GROUP_AGE_AND_GENDER_STEP)).toEqual([
      'ageBand',
      'gender',
      'groupId',
    ])
    expect(groupWizard.notCarriedAt(GROUP_AVAILABILITY_STEP)).toEqual(['availability'])
    expect(groupWizard.notCarriedAt(GROUP_STEP)).toEqual(['groupId'])
    expect(groupWizard.notCarriedAt(GROUP_LAST_STEP)).toEqual([])
  })
})

describe('what the group form reads back off its own URL', () => {
  it('keeps a group only when it was one of the ones offered', () => {
    const answers = groupWizard.readAnswers(
      { ageBand: '25-34', gender: 'female', groupId: offered[0], availability: ['monday:midday'] },
      { groupId: offered },
    )
    expect(answers.groupId).toBe(offered[0])

    const notOffered = groupWizard.readAnswers(
      { ageBand: '25-34', gender: 'female', groupId: offered[0] },
      { groupId: [offered[1]!] },
    )
    expect(notOffered.groupId).toBeNull()
  })

  it('keeps no group at all when it was handed no list', () => {
    expect(groupWizard.readAnswers({ groupId: offered[0] }).groupId).toBeNull()
  })

  it('drops anything a hand-written URL invented rather than rendering it back', () => {
    expect(
      groupWizard.readAnswers(
        { ageBand: '12', gender: '<script>', groupId: 'anything', availability: ['funday:midday'] },
        { groupId: offered },
      ),
    ).toEqual({ ageBand: null, gender: null, groupId: null, availability: [] })
  })
})

describe('which screen somebody is entitled to see', () => {
  it('opens one screen at a time as the answers arrive', () => {
    const read = (query: Record<string, string | string[]>) =>
      groupWizard.furthestStep(groupWizard.readAnswers(query, { groupId: offered }))

    expect(read({})).toBe(GROUP_AGE_AND_GENDER_STEP)
    expect(read({ ageBand: '25-34', gender: 'female' })).toBe(GROUP_AVAILABILITY_STEP)
    expect(read({ ageBand: '25-34', gender: 'female', availability: 'monday:midday' })).toBe(
      GROUP_STEP,
    )
    expect(
      read({ ageBand: '25-34', gender: 'female', availability: 'monday:midday', groupId: offered[0]! }),
    ).toBe(GROUP_LAST_STEP)
  })

  it('never shows a later screen than the answers reach, however the URL is edited', () => {
    const halfway = groupWizard.readAnswers({ ageBand: '25-34', gender: 'female' })
    expect(groupWizard.stepToShow('4', halfway)).toBe(GROUP_AVAILABILITY_STEP)
    expect(groupWizard.stepToShow('99', halfway)).toBe(GROUP_AVAILABILITY_STEP)
    expect(groupWizard.stepToShow('-3', halfway)).toBe(GROUP_AGE_AND_GENDER_STEP)
  })

  it('says why the grid would not move on', () => {
    const upToTheGrid = groupWizard.readAnswers({ ageBand: '25-34', gender: 'female' })
    expect(groupWizard.stuckOnAvailability('3', upToTheGrid)).toBe(true)
    expect(groupWizard.stuckOnAvailability('2', upToTheGrid)).toBe(false)
  })

  it('goes back with the answers still in hand', () => {
    const answers = groupWizard.readAnswers(
      { ageBand: '45-54', gender: 'male', groupId: offered[1]!, availability: ['tuesday:morning'] },
      { groupId: offered },
    )
    const back = groupWizard.answersAsQuery(answers, 'qr', GROUP_STEP)
    expect(back.get('step')).toBe(String(GROUP_STEP))
    expect(back.get('groupId')).toBe(offered[1])
    expect(back.get('via')).toBe('qr')
    expect(back.getAll('availability')).toEqual(['tuesday:morning'])
  })
})

describe('what the group form says', () => {
  it('has a sentence for each of the three things only it can refuse', () => {
    expect(refusalMessages('intake.group_not_selected')).toEqual([
      'Please choose which group you would like to join.',
    ])
    expect(refusalMessages('intake.group_unavailable')[0]).toContain('no longer open to join')
    expect(refusalMessages('intake.group_not_open_to_you')[0]).toContain('not open to you')
  })

  it('names the Leader on the way in, and nobody on the way to a decision', () => {
    expect(joinedMessage('Tuesday Men’s Group', ['David'])).toBe(
      'You’re in Tuesday Men’s Group. Your leader is David, who will be in touch.',
    )
    expect(joinedMessage('Tuesday Men’s Group', ['David', 'Sam'])).toContain('David and Sam')
    expect(joinedMessage('Tuesday Men’s Group', [])).toBe(
      'You’re in Tuesday Men’s Group. Your leader will be in touch.',
    )
    expect(requestedMessage('Riverside Chapel', 'Tuesday Men’s Group')).toBe(
      'Riverside Chapel will be in touch about Tuesday Men’s Group.',
    )
  })

  it('says plainly when there is nothing to join', () => {
    expect(noGroupsMessage('Riverside Chapel')).toContain('isn’t taking group sign-ups')
  })
})
