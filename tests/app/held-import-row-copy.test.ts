import { describe, expect, it } from 'vitest'
import {
  HELD_ROWS_EXPLANATION,
  importRowRefusalMessage,
  samePersonAnswer,
  samePersonConsequence,
  SOMEONE_ELSE_ANSWER,
  SOMEONE_ELSE_CONSEQUENCE,
} from '../../app/roster/copy'

/**
 * What the Roster says about a row the importer would not guess about. The wording
 * carries the ticket's hardest constraint: neither answer may be a default and
 * neither may be inferred, which on a screen means the question has to be legible
 * enough that an Admin does not simply click the first button.
 */

describe('the words a held import row is offered in', () => {
  it('names both readings, so the question is answerable without knowing the schema', () => {
    expect(HELD_ROWS_EXPLANATION).toMatch(/same person/i)
    expect(HELD_ROWS_EXPLANATION).toMatch(/shares the phone/i)
  })

  it('says outright that Discipler does not know', () => {
    // The whole point of the row is that the product has no opinion. Copy that
    // sounded confident would invite an Admin to accept whatever it seemed to
    // suggest, which is the guess the importer refused to make.
    expect(HELD_ROWS_EXPLANATION).toMatch(/cannot tell/i)
    expect(HELD_ROWS_EXPLANATION).toMatch(/will not guess/i)
  })

  it('names whose name is about to change, rather than saying "the same person"', () => {
    // A number may reach two people. An answer that did not say which of them it
    // meant would put the ambiguity back on the Admin at the moment of clicking.
    expect(samePersonAnswer('Emily Johnson')).toBe('Same person as Emily Johnson')
  })

  it('says what each answer will do before it is clicked', () => {
    const renaming = samePersonConsequence('Emily Johnson', 'Em Johnson')
    expect(renaming).toContain('Emily Johnson')
    expect(renaming).toContain('Em Johnson')
    // The reassurance that makes a rename safe to choose: it is not a merge and
    // nothing is lost.
    expect(renaming).toMatch(/keeps their history/i)

    expect(SOMEONE_ELSE_ANSWER).toMatch(/someone else/i)
    expect(SOMEONE_ELSE_CONSEQUENCE).toMatch(/nobody already on the roster changes/i)
  })

  it('words every refusal, and says nothing for a code it does not know', () => {
    expect(importRowRefusalMessage('import_row.already_answered')).toMatch(/before you did/i)
    expect(importRowRefusalMessage('import_row.person_is_not_on_this_number')).toMatch(
      /not on the phone number/i,
    )
    expect(importRowRefusalMessage('import_row.name_is_already_on_this_number')).toMatch(
      /left as it was/i,
    )
    expect(importRowRefusalMessage(undefined)).toBeUndefined()
    // Whatever somebody puts in the query string, the screen says its own words.
    expect(importRowRefusalMessage('<script>')).toBe('That row could not be answered.')
  })
})
