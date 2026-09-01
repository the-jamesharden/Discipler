import { describe, expect, it } from 'vitest'
import { DECLARED_SIDES } from '~/domain/intake'
import {
  DONE_BEFORE_ANSWER,
  FIRST_TIME_ANSWER,
  doneMessage,
  firstTimeQuestion,
  refusalMessages,
  sideHint,
  sideLabel,
} from '../../app/intake/copy'
import {
  answersAsQuery,
  furthestStep,
  LAST_STEP,
  readWizardAnswers,
  stepToShow,
  stuckOnAvailability,
} from '../../app/intake/wizard-answers'

/**
 * The wizard's two decisions that are not the domain's: which screen somebody is
 * entitled to see, and what each screen says once the side is known.
 */

describe('what the wizard says', () => {
  it('words every side-dependent line for both sides', () => {
    for (const side of DECLARED_SIDES) {
      expect(sideLabel[side]).toBeTruthy()
      expect(sideHint[side]).toBeTruthy()
      expect(firstTimeQuestion[side]).toBeTruthy()
      expect(doneMessage[side]('Riverside Chapel')).toContain('Riverside Chapel')
    }
  })

  it('asks the first-time question in the words of the side', () => {
    expect(firstTimeQuestion.mentor).toBe('Have you mentored someone before?')
    expect(firstTimeQuestion.mentee).toBe('Have you been discipled by a mentor before?')
  })

  /**
   * The answers are statements, not yes and no, so the answer is legible without
   * the question above it. Asserted because it is the wording that makes
   * `first_time` easy to invert, and the reason the values on the wire are words.
   */
  it('offers two answers that read as sentences on their own', () => {
    expect(FIRST_TIME_ANSWER).toBe('No, this is my first time')
    expect(DONE_BEFORE_ANSWER).toBe('Yes, I’ve done this before')
  })

  it('tells each side what it is they are waiting for', () => {
    expect(doneMessage.mentee('Riverside Chapel')).toContain('a mentor for you')
    expect(doneMessage.mentor('Riverside Chapel')).toContain('someone for you to mentor')
  })

  it('has a sentence for each of the three things the wizard can refuse', () => {
    expect(refusalMessages('intake.side_unknown')).toEqual([
      'Please tell us whether you are joining as a mentor or as someone to be mentored.',
    ])
    expect(refusalMessages('intake.first_time_unanswered')).toEqual([
      'Please tell us whether this is your first time.',
    ])
    expect(refusalMessages('intake.path_unknown')).toEqual([
      'This link is incomplete. Please ask for a new one.',
    ])
  })
})

describe('what the wizard reads back off its own URL', () => {
  const answered = {
    step: '5',
    side: 'mentor',
    ageBand: '35-44',
    gender: 'male',
    experience: 'done_before',
    availability: ['monday:midday', 'friday:evening'],
  }

  it('keeps only the answers it actually offered', () => {
    expect(readWizardAnswers(answered)).toEqual({
      side: 'mentor',
      ageBand: '35-44',
      gender: 'male',
      experience: 'done_before',
      availability: ['monday:midday', 'friday:evening'],
    })
  })

  it('drops anything a hand-written URL invented rather than rendering it back', () => {
    expect(
      readWizardAnswers({
        side: '<script>',
        ageBand: '12',
        gender: 'unspecified',
        experience: 'sometimes',
        availability: ['monday:midday', 'funday:midday', 'monday:teatime'],
      }),
    ).toEqual({
      side: null,
      ageBand: null,
      gender: null,
      experience: null,
      availability: ['monday:midday'],
    })
  })
})

describe('which screen somebody is entitled to see', () => {
  const nothing = readWizardAnswers({})

  it('starts on the side question, whatever step was asked for', () => {
    expect(stepToShow('4', nothing)).toBe(1)
    expect(stepToShow(undefined, nothing)).toBe(1)
    expect(furthestStep(nothing)).toBe(1)
  })

  it('opens one screen at a time as the answers arrive', () => {
    expect(furthestStep(readWizardAnswers({ side: 'mentee' }))).toBe(2)
    expect(
      furthestStep(readWizardAnswers({ side: 'mentee', ageBand: '25-34', gender: 'female' })),
    ).toBe(3)
    expect(
      furthestStep(
        readWizardAnswers({
          side: 'mentee',
          ageBand: '25-34',
          gender: 'female',
          experience: 'first_time',
        }),
      ),
    ).toBe(4)
    expect(
      furthestStep(
        readWizardAnswers({
          side: 'mentee',
          ageBand: '25-34',
          gender: 'female',
          experience: 'first_time',
          availability: 'monday:midday',
        }),
      ),
    ).toBe(LAST_STEP)
  })

  it('never shows a later screen than the answers reach, however the URL is edited', () => {
    const halfway = readWizardAnswers({ side: 'mentee' })
    expect(stepToShow('5', halfway)).toBe(2)
    expect(stepToShow('99', halfway)).toBe(2)
    expect(stepToShow('-3', halfway)).toBe(1)
  })

  it('goes back with the answers still in hand', () => {
    const answers = readWizardAnswers({
      side: 'mentor',
      ageBand: '45-54',
      gender: 'male',
      experience: 'first_time',
      availability: ['tuesday:morning'],
    })
    const back = answersAsQuery(answers, 'qr', 3)

    expect(back.get('step')).toBe('3')
    expect(back.get('side')).toBe('mentor')
    expect(back.get('via')).toBe('qr')
    expect(back.getAll('availability')).toEqual(['tuesday:morning'])
  })
})

describe('the one screen a browser will not stop somebody leaving unanswered', () => {
  const upToTheGrid = readWizardAnswers({
    side: 'mentee',
    ageBand: '25-34',
    gender: 'female',
    experience: 'first_time',
  })

  it('says why the grid would not move on, rather than silently redrawing it', () => {
    expect(stuckOnAvailability('5', upToTheGrid)).toBe(true)
  })

  it('says nothing on the way in, when nobody has pressed Continue yet', () => {
    expect(stuckOnAvailability('4', upToTheGrid)).toBe(false)
  })

  it('says nothing on the screens whose own fields are required', () => {
    expect(stuckOnAvailability('4', readWizardAnswers({ side: 'mentee' }))).toBe(false)
    expect(
      stuckOnAvailability('5', {
        ...upToTheGrid,
        availability: ['monday:midday'],
      }),
    ).toBe(false)
  })
})
