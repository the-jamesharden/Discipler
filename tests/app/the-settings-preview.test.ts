import { describe, expect, it } from 'vitest'
import { carriesRatesLine, invitationMessage } from '~/domain/outbound-copy'
import { messagePreviews } from '../../app/settings/copy'

/**
 * The Ministry settings preview shows a message as it reads when it carries the
 * rates line, if it is one that may (Text wording, ticket 01).
 *
 * It is composed by the same function that composes the text, and those compose a
 * message with the line wherever it may carry it: the once-a-month rule takes the
 * line off later, at the queue, and never here. So the preview shows each message
 * at its fullest, which is how it reads on the first text of a month.
 */
describe('the Ministry settings preview', () => {
  const [invitation] = messagePreviews()

  const reads = (name: string, noun: string) =>
    `${invitation!.opening}${name}${invitation!.middle}${noun}${invitation!.closing}`

  it('reads word for word as the text a leader is sent', () => {
    expect(reads('ABC Church', 'mentor')).toBe(
      invitationMessage({
        ministryName: 'ABC Church',
        fullName: 'David Ellis',
        leaderNoun: 'mentor',
        link: 'discipler.example/invitation/…',
      }),
    )
  })

  it('shows no rates line on the invitation, which never carries one', () => {
    // The invitation is the one message previewed today, and it is sent without
    // the line on every occasion. Showing it there would be showing an Admin a text
    // nobody receives.
    expect(carriesRatesLine(reads('ABC Church', 'mentor'))).toBe(false)
  })
})
