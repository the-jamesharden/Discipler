import { describe, expect, it } from 'vitest'
import { invitationToken } from '~/domain/invitations'
import {
  invitationLink,
  invitationMessage,
  starterMessageToLeader,
  starterMessageToParticipant,
  withSharedContact,
} from '~/domain/outbound-copy'

const token = invitationToken('7c3f9a21-4e6b-4d18-9f52-a0b3c8d51e77')
const baseUrl = 'https://discipler.example'
const link = invitationLink(baseUrl, token)

/**
 * A number in a Leader's message is the failure this rule exists to prevent, and
 * "no phone number" is not a thing prose can be trusted to keep saying. Anything
 * with enough digits in a row to be dialled counts.
 *
 * Links are taken out first. A token is opaque and may hold any run of characters
 * at all, so leaving it in would make this assert something about the id
 * generator rather than about the wording.
 */
const carriesAPhoneNumber = (body: string): boolean =>
  /\+?\d[\d ()-]{6,}/.test(body.replace(/https?:\/\/\S+/g, ''))

describe('the Invitation Link in a message', () => {
  it('is the base URL and the token, and the token is the whole of it', () => {
    expect(link).toBe(`${baseUrl}/invitation/${token}`)
  })

  it('does not care whether the base URL was given with a trailing slash', () => {
    expect(invitationLink('https://discipler.example/', token)).toBe(link)
  })
})

describe('the message that carries the Invitation Link', () => {
  const body = invitationMessage({
    ministryName: 'Riverside Chapel',
    fullName: 'David Ellis',
    link,
  })

  it('speaks in the Ministry’s voice and carries the link', () => {
    expect(body.startsWith('Riverside Chapel:')).toBe(true)
    expect(body).toContain(link)
  })

  it('invites rather than assigns, and does not say who the match is', () => {
    // The match is revealed on the page, after they have chosen to look. A name
    // in the text would have told them before they opened anything.
    expect(body).toMatch(/have a look|take a look/i)
    expect(body).not.toContain('Emily')
  })

  it('greets the Leader by their first name', () => {
    expect(body).toContain('David')
    expect(body).not.toContain('Ellis')
  })

  it('carries no phone number', () => {
    expect(carriesAPhoneNumber(body)).toBe(false)
  })
})

describe('the Starter Message', () => {
  const toLeader = starterMessageToLeader({
    ministryName: 'Riverside Chapel',
    participantNames: ['Emily Johnson'],
  })

  const toParticipant = starterMessageToParticipant({
    ministryName: 'Riverside Chapel',
    fullName: 'Emily Johnson',
    declineLink: link,
  })

  it('carries the opt-out and rate disclosure to everyone in the relationship', () => {
    expect(toLeader).toContain('Reply STOP to opt out')
    expect(toParticipant).toContain('Reply STOP to opt out')
  })

  it('tells the Leader who they are now meeting with', () => {
    expect(toLeader).toContain('Emily Johnson')
  })

  it('names every Participant when the relationship is a group', () => {
    const group = starterMessageToLeader({
      ministryName: 'Riverside Chapel',
      participantNames: ['Emily Johnson', 'Sarah Kim', 'Anna Reed'],
    })

    expect(group).toContain('Emily Johnson')
    expect(group).toContain('Sarah Kim')
    expect(group).toContain('Anna Reed')
  })

  it('sends a Leader no phone number, ever', () => {
    expect(carriesAPhoneNumber(toLeader)).toBe(false)
  })

  it('leaves the Leader’s name and number to the sending layer', () => {
    // Contact sharing is checked at send time and appended there. A body that
    // already carried the number would leave the check nothing to withhold, so
    // this one ends where the disclosure begins.
    expect(carriesAPhoneNumber(toParticipant)).toBe(false)
  })

  it('gives the Participant a way to say the match is not right', () => {
    expect(toParticipant).toContain(link)
  })

  it('reads as a whole message when the sending layer appends nothing', () => {
    // Contact sharing may be declined, and this is what the Participant then
    // gets. No sentence may depend on details that were withheld.
    expect(toParticipant.trimEnd().endsWith(':')).toBe(false)
    expect(toParticipant).toContain('Your leader will text you')
  })

  it('reads as a whole message when it does append the contact', () => {
    // The disclosure lands before the contact, because `composeMessage` runs at
    // enqueue and `withSharedContact` at dispatch. Anything the body promised
    // about "this number" would be interrupted by compliance text.
    const dispatched = withSharedContact(toParticipant, {
      fullName: 'David Ellis',
      phone: '+15550100',
    })

    expect(dispatched).toContain('Reply STOP to opt out, HELP for help. David Ellis: +15550100')
    expect(dispatched).not.toContain('number: Msg')
  })
})
