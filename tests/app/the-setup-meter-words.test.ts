import { describe, expect, it } from 'vitest'
import { SETUP_STEPS, type SetupStep } from '~/domain/setup-meter'
import { setupMeterView } from '../../app/setup-meter-copy'

/**
 * What the setup bar says and where its buttons go (Exponential launch, ticket 26),
 * with the words of `.lavish/onboarding/build.mjs`.
 */

const view = (done: readonly SetupStep[], checkIn = { day: 1, hour: 9 }) =>
  setupMeterView({ shown: true, done, unseen: [], checkIn }, 'Riverside Chapel')

describe('the setup meter words', () => {
  it('counts as the mock-ups draw it', () => {
    expect(view([]).count).toBe('0% complete · 0 of 7')
    expect(view(SETUP_STEPS.slice(0, 2)).count).toBe('29% complete · 2 of 7')
    expect(view(SETUP_STEPS.slice(0, 3)).count).toBe('43% complete · 3 of 7')
    expect(view(SETUP_STEPS.slice(0, 4)).count).toBe('57% complete · 4 of 7')
    expect(view(SETUP_STEPS).count).toBe('100% complete · 7 of 7')
  })

  it('names the seven steps in order', () => {
    expect(view([]).steps.map(({ words }) => words)).toEqual([
      'Confirm your check-in time',
      'Take the 2-minute tour',
      'Send yourself a test check-in',
      'Add people to your Roster',
      'Get your first Intake back',
      'Create your first relationship',
      'First relationship accepted',
    ])
  })

  it('gives each step that can be done its button, and a done step none', () => {
    const actions = Object.fromEntries(view(['roster']).steps.map(({ step, action }) => [step, action]))

    expect(actions.check_in_time).toEqual({ button: 'Edit settings', href: '/settings#check-in' })
    expect(actions.roster).toBeNull()
    expect(actions.intake).toEqual({ button: 'Share your link', href: '/intake-forms' })
    expect(actions.relationship).toEqual({ button: 'Pair someone', href: '/roster' })
    expect(actions.accepted).toEqual({ button: 'See who is waiting', href: '/roster' })
    expect(view([]).steps.find(({ step }) => step === 'roster')?.action).toEqual({
      button: 'Add people',
      href: '/roster#import',
    })
  })

  /**
   * Tickets 27 and 28 are not built, and no control goes nowhere. Each sets one line,
   * and this test is the one that then tells them to change it.
   */
  it('offers no button for the test check-in while there is nowhere to go', () => {
    const steps = view([]).steps

    expect(steps.find(({ step }) => step === 'test_check_in')?.action).toBeNull()
  })

  it('sends Start the tour to the tour', () => {
    const steps = view([]).steps

    expect(steps.find(({ step }) => step === 'tour')?.action).toEqual({
      button: 'Start the tour',
      href: '/overview/tour',
    })
  })

  it('passes over a step nobody can do yet when it says what is next', () => {
    expect(view([]).next).toBe('check_in_time')
    expect(view(['check_in_time']).next).toBe('tour')
    expect(view(['check_in_time', 'tour']).next).toBe('roster')
    expect(view(['check_in_time', 'tour', 'roster']).next).toBe('intake')
  })

  it('takes the first step not done, whatever order they were done in', () => {
    expect(view(['roster', 'intake', 'relationship', 'accepted']).next).toBe('check_in_time')
  })

  it('says nothing is next when only the step nobody can do yet is left', () => {
    expect(
      view(['check_in_time', 'tour', 'roster', 'intake', 'relationship', 'accepted']).next,
    ).toBeNull()
  })

  it('has a badge only at 100%, with the church, its day and its hour', () => {
    expect(view(SETUP_STEPS.slice(0, 6)).badge).toBeNull()
    expect(view(SETUP_STEPS, { day: 4, hour: 19 }).badge).toEqual({
      title: 'Riverside Chapel is up and running',
      body: 'All seven steps are done, and your first relationship has been accepted. Check-ins go out every Thursday at 7pm.',
      thanks: 'Thank you!',
    })
  })
})
