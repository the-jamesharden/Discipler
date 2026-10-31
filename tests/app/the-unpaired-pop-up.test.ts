import { describe, expect, it } from 'vitest'
import { theCard, WAITING_ON_YOU } from '../../app/overview/waiting-on-you'
import { isShown, viewIn } from '../../app/roster/menu'
import type { RosterEntry } from '~/service/ports'

/**
 * The unpaired pop-up's words and where its buttons go (Exponential launch,
 * ticket 29), as mock-up 3 draws them in `.lavish/onboarding/s6-popup.html` and
 * `s6-popup-one.html`: one line for each count above zero, each with its own
 * button, and the first button the primary one.
 */

describe('the unpaired pop-up', () => {
  it('is headed Waiting on you', () => {
    expect(WAITING_ON_YOU.head).toBe('Waiting on you')
  })

  it('says both counts, with both buttons, when both are above zero', () => {
    expect(theCard({ toPair: 3, awaitingIntake: 2 })).toEqual({
      lines: [
        { lead: '3 people are', rest: " ready to pair and aren't in a relationship yet." },
        { lead: "2 people haven't", rest: ' filled in their Intake form yet.' },
      ],
      actions: [
        { label: 'Pair them', href: '/suggested-pairs', primary: true },
        { label: 'Send Intake links', href: '/roster?pairings=awaiting-intake', primary: false },
      ],
    })
  })

  it('says only the count above zero, and its button is the primary one', () => {
    expect(theCard({ toPair: 0, awaitingIntake: 5 })).toEqual({
      lines: [{ lead: "5 people haven't", rest: ' filled in their Intake form yet.' }],
      actions: [{ label: 'Send Intake links', href: '/roster?pairings=awaiting-intake', primary: true }],
    })
    expect(theCard({ toPair: 4, awaitingIntake: 0 })).toEqual({
      lines: [{ lead: '4 people are', rest: " ready to pair and aren't in a relationship yet." }],
      actions: [{ label: 'Pair them', href: '/suggested-pairs', primary: true }],
    })
  })

  it('says one person in the singular', () => {
    expect(theCard({ toPair: 1, awaitingIntake: 1 }).lines).toEqual([
      { lead: '1 person is', rest: " ready to pair and isn't in a relationship yet." },
      { lead: "1 person hasn't", rest: ' filled in their Intake form yet.' },
    ])
  })

  it("sends Intake links to a Roster of only the people who haven't sent an Intake", () => {
    const [, intake] = theCard({ toPair: 1, awaitingIntake: 1 }).actions
    const address = new URL(intake!.href, 'https://app.trydiscipler.com')
    const view = viewIn((field) => address.searchParams.getAll(field))
    const somebody = (participationStatus: RosterEntry['participationStatus']) =>
      ({
        participationStatus,
        relationships: [],
        intendedPairings: [],
        declaredSide: null,
        gender: null,
        isAdmin: false,
      }) as unknown as RosterEntry

    expect(isShown(view, somebody('no_intake_submitted'))).toBe(true)
    expect(isShown(view, somebody('ready_to_pair'))).toBe(false)
    expect(isShown(view, somebody('paired'))).toBe(false)
    expect(isShown(view, somebody('opted_out'))).toBe(false)
  })
})
