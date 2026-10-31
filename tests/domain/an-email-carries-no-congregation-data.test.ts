import { describe, expect, it } from 'vitest'
import { emailBody, EmailField } from '~/domain/email'
import { concernId, personId } from '~/domain/ids'
import { otherGoal } from '~/domain/intake'
import { phoneNumber } from '~/domain/roster'

/**
 * No email carries congregation names, phone numbers, Concerns or a referred
 * church's name (Exponential launch, ticket 10). A name is a plain string in the
 * domain, so what can be enforced is enforced here: the data the domain brands is
 * refused by the compiler, and a phone number is taken out of every field however
 * it reached it.
 */

describe('what the compiler refuses', () => {
  it('a phone number, a Person’s own goal, a Person or a Concern', () => {
    const phone = phoneNumber('+15551230000')
    const goal = otherGoal('Learn to pray with my wife')
    const person = personId('00000000-0000-4000-8000-0000000000d0')
    const concern = concernId('00000000-0000-4000-8000-0000000000c1')

    // @ts-expect-error -- a congregant's phone number never goes in an email.
    EmailField.line(phone)
    // @ts-expect-error -- nor does a Person's own words.
    EmailField.quoted(goal)
    // @ts-expect-error -- nor anything that names a Person.
    EmailField.line(person)
    // @ts-expect-error -- nor a Concern.
    EmailField.line(concern)

    // A church's own words are still welcome.
    expect(EmailField.line('Riverside Chapel').text).toBe('Riverside Chapel')
  })
})

describe('a phone number in any field', () => {
  it.each([
    ['+15551230000'],
    ['+447700900123'],
    ['5551230000'],
    ['555-123-0000'],
    ['555.123.0000'],
    ['(555) 123-0000'],
    ['1 555 123 0000'],
    ['+1 (555) 123-0000'],
  ])('is taken out when written %s', (written) => {
    expect(EmailField.line(`Call me on ${written} please`).text).toBe(
      'Call me on [phone number removed] please',
    )
  })

  it('is taken out of somebody’s typing too', () => {
    expect(EmailField.quoted('It broke.\nText me at 555 123 0000').text).toBe(
      '> It broke.\n> Text me at [phone number removed]',
    )
  })

  it.each([
    ['a code', '482913'],
    ['a date', '2026-11-08'],
    ['a time', '2026-11-08 09:00'],
    ['an amount', '$1,164.00'],
    ['a count', '12,345 people'],
    ['an ID', '12345678-1234-4123-8123-123456789012'],
    ['a Stripe ID', 'cus_N5551230000x'],
  ])('leaves %s alone', (_label, value) => {
    expect(EmailField.line(value).text).toBe(value)
  })

  it('cannot be smuggled in by splitting it across lines', () => {
    expect(EmailField.line('555\n123\n0000').text).toBe('[phone number removed]')
  })

  it('reaches no composed email', () => {
    const typed = EmailField.quoted('my number is +1 555 123 0000')
    expect(emailBody`They wrote:\n\n${typed}`.text).not.toMatch(/\d{4}/)
  })
})
