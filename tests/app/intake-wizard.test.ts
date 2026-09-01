import { describe, expect, it } from 'vitest'
import { DECLARED_SIDES } from '~/domain/intake'
import {
  DONE_BEFORE_ANSWER,
  FIRST_TIME_ANSWER,
  doneMessage,
  firstTimeQuestion,
  refusalMessages,
  sideLabel,
} from '../../app/intake/copy'
import {
  answersAsQuery,
  asksAt,
  AVAILABILITY_STEP,
  FIRST_TIME_STEP,
  furthestStep,
  LAST_STEP,
  notCarriedAt,
  readWizardAnswers,
  SCREENS,
  SIDE_STEP,
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

  /**
   * The availability screen has two sources of problems at once: the codes a
   * refused submission came back with, and the one the screen raises itself when
   * Continue is pressed with nothing ticked. A submission refused for an
   * unreadable grid lands on exactly that screen still holding the rest of its
   * refusals, and *every problem is reported at once* has to survive it.
   */
  it('shows what the submission was refused for and what the screen itself raises', () => {
    expect(
      refusalMessages(
        'intake.name_missing intake.availability_unreadable',
        'intake.availability_not_selected',
      ),
    ).toEqual([
      'Please give your name.',
      'Something went wrong reading your times. Please try again.',
      'Please select at least one time that could work.',
    ])
  })

  it('says an overlapping problem once', () => {
    expect(
      refusalMessages('intake.availability_not_selected', 'intake.availability_not_selected'),
    ).toEqual(['Please select at least one time that could work.'])
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

/**
 * The screen list is the wizard's order, and everything else about stepping is
 * read off it. These assert the properties the rest depends on, rather than the
 * step numbers, which the tests below already pin.
 */
describe('the list the wizard steps through', () => {
  it('asks for every answer it carries between screens, and asks each of them once', () => {
    const carried = Object.keys(readWizardAnswers({})).sort()
    const asked = SCREENS.flatMap((screen) => [...screen.asks]).sort()

    // An answer carried but never asked could not be given; an answer asked on two
    // screens would be sent twice from the second -- once as its own control and
    // once as the hidden input carrying it forward.
    expect(asked).toEqual(carried)
  })

  it('ends on a screen that gates nothing, because it asks for none of them', () => {
    expect(asksAt(LAST_STEP)).toEqual([])
  })

  it('answers for a step outside itself rather than throwing', () => {
    expect(asksAt(0)).toEqual([])
    expect(asksAt(LAST_STEP + 1)).toEqual([])
    expect(notCarriedAt(0)).toEqual([])
    expect(notCarriedAt(LAST_STEP + 1)).toEqual([])
  })

  /**
   * The screens are told apart by name everywhere else, so the names have to be
   * the screens they say they are. Asserted here rather than in the component,
   * which is the point of them: nothing outside this module counts screens.
   */
  it('names its screens in the order it asks them', () => {
    expect(SIDE_STEP).toBe(1)
    expect(FIRST_TIME_STEP).toBe(3)
    expect(AVAILABILITY_STEP).toBe(4)
    expect(LAST_STEP).toBe(5)
  })

  /**
   * The first-time question is worded from the side, so re-answering the side puts
   * a different question above an answer already given. Carried forward, an *I have
   * mentored someone before* would arrive pre-selected under *have you been
   * discipled before* -- an answer nobody gave, in the one field the pairing surface
   * reads, and a first-timer recorded as experienced is a mistake nothing
   * downstream could notice.
   */
  it('drops the answer its own question rewords, and carries everything else', () => {
    expect(notCarriedAt(SIDE_STEP)).toEqual(['side', 'experience'])

    // Every other screen drops only what it is asking for. Somebody correcting
    // their age keeps the availability they gave after it.
    for (const step of [2, FIRST_TIME_STEP, AVAILABILITY_STEP, LAST_STEP]) {
      expect(notCarriedAt(step)).toEqual([...asksAt(step)])
    }
  })

  it('asks the first-time question again once the side has been re-answered', () => {
    const wholeForm = readWizardAnswers({
      side: 'mentee',
      ageBand: '25-34',
      gender: 'female',
      experience: 'done_before',
      availability: ['monday:midday'],
    })

    // What the side screen sends on: everything it neither asks for nor rewords.
    const dropped: readonly string[] = notCarriedAt(SIDE_STEP)
    const carriedOn = Object.fromEntries(
      Object.entries(wholeForm).filter(([field]) => !dropped.includes(field)),
    )
    const afterSwitchingSides = readWizardAnswers({ ...carriedOn, side: 'mentor' })

    expect(afterSwitchingSides.experience).toBeNull()
    // And nothing else is lost on the way: the age, the gender and the grid are
    // worded from nothing, so re-answering the side has no claim on them.
    expect(afterSwitchingSides.ageBand).toBe('25-34')
    expect(afterSwitchingSides.gender).toBe('female')
    expect(afterSwitchingSides.availability).toEqual(['monday:midday'])
    expect(furthestStep(afterSwitchingSides)).toBe(FIRST_TIME_STEP)
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
