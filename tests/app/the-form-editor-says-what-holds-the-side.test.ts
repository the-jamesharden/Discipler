import { describe, expect, it } from 'vitest'
import { neededBy, presetForm, removeQuestion, type IntakeForm } from '~/domain/intake-form'
import { formRefusalMessage, neededFirst } from '../../app/intake-forms/form/copy'

/**
 * What the form editor's second press says about the side while a question worded
 * from it is still asked (Pastor feedback, ticket 13). Since Suggestions beyond the
 * one-to-one, ticket 01, there are two such questions, and it names whichever are
 * still on the form, in the order the form asks them.
 */

const without = (form: IntakeForm, key: string): IntakeForm => {
  const edit = removeQuestion(form, key)
  if (edit === null || 'refusal' in edit) throw new Error(`Expected ${key} to be removed`)
  return edit.form
}

const holding = (form: IntakeForm) => neededFirst(neededBy(form, 'side').map((question) => question.key))

describe('the side, held by what is worded from it', () => {
  const preset = presetForm('discipleship')

  it('names both questions on the preset, which asks both', () => {
    expect(holding(preset)).toBe(
      'The first-time question and the one-to-two question are worded from this answer, so neither can be asked without it. Remove them first.',
    )
  })

  it('names the one still asked once the other has gone', () => {
    expect(holding(without(preset, 'experience'))).toBe(
      'The one-to-two question is worded from this answer, so it cannot be asked without it. Remove the one-to-two question first.',
    )
    expect(holding(without(preset, 'oneToTwo'))).toBe(
      'The first-time question is worded from this answer, so it cannot be asked without it. Remove the first-time question first.',
    )
  })

  it('says why a move or an add-back is refused in words naming both', () => {
    expect(formRefusalMessage('intake_form.asked_too_soon')).toContain('the first-time and one-to-two questions')
    expect(formRefusalMessage('intake_form.worded_from_it')).toContain('The first-time and one-to-two questions')
  })
})
