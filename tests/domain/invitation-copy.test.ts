import { describe, expect, it } from 'vitest'
import { invitationToken } from '~/domain/invitations'
import { roleNoun } from '~/domain/ministry-settings'
import {
  acceptanceReminderMessage,
  invitationLink,
  invitationMessage,
  resumedMessage,
  starterMessageToLeader,
  starterMessageToParticipant,
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
    leaderNoun: roleNoun('mentor'),
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

  /**
   * The Ministry's own word for the role, in a message the Ministry sends. The
   * noun sits in noun position and never as a verb: *someone to mentor* reads
   * well and *someone to discipler* does not, and the word is whatever a Ministry
   * typed rather than one Discipler chose for them.
   */
  it('calls the role what this Ministry calls it', () => {
    expect(body).toContain('to be their mentor')

    expect(
      invitationMessage({
        ministryName: 'Riverside Chapel',
        fullName: 'David Ellis',
        leaderNoun: roleNoun('discipleship coach'),
        link,
      }),
    ).toContain('to be their discipleship coach')
  })
})

/** Where the Leader is sent to see who they are meeting with. */
const DASHBOARD = 'https://discipler.test/relationships'

describe('the Starter Message', () => {
  const toLeader = starterMessageToLeader({
    ministryName: 'Riverside Chapel',
    participantNames: ['Emily Johnson'],
    leaderNoun: roleNoun('mentor'),
    dashboardLink: DASHBOARD,
  })

  const toParticipant = starterMessageToParticipant({
    ministryName: 'Riverside Chapel',
    leaderNames: ['David Ellis'],
    participantNoun: roleNoun('mentee'),
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
      leaderNoun: roleNoun('mentor'),
      dashboardLink: DASHBOARD,
    })

    expect(group).toContain('Emily Johnson')
    expect(group).toContain('Sarah Kim')
    expect(group).toContain('Anna Reed')
  })

  /**
   * The reader's own role, so the noun is singular however many people are on the
   * other side of it. *David and Ruth is your mentor* is the sentence a group
   * would otherwise produce, and no amount of pluralising a word a Ministry typed
   * would fix it reliably.
   */
  it('calls each side what this Ministry calls it', () => {
    expect(toLeader).toContain('Emily Johnson\u2019s mentor')
    expect(toParticipant).toContain('David Ellis\u2019s mentee')

    expect(
      starterMessageToLeader({
        ministryName: 'Riverside Chapel',
        participantNames: ['Emily Johnson', 'Sarah Kim'],
        leaderNoun: roleNoun('discipleship coach'),
        dashboardLink: DASHBOARD,
      }),
    ).toContain('Emily Johnson and Sarah Kim\u2019s discipleship coach')
  })

  it('sends a Leader no phone number, ever', () => {
    expect(carriesAPhoneNumber(toLeader)).toBe(false)
  })

  /**
   * The link and not the numbers: the numbers are on the page it opens, behind
   * the sign-in the Leader just set and behind each Person's contact-sharing
   * decision, which is where a number is allowed to be.
   */
  it('points the Leader at the page that shows who they are meeting with', () => {
    expect(toLeader).toContain(
      'See who you’re meeting with and how to reach them at https://discipler.test/relationships.',
    )
  })

  it('names whoever is going to reach out', () => {
    // Somebody about to be contacted by a stranger is owed the stranger's name.
    // Without it a Participant cannot tell a discipleship leader from a wrong
    // number when the text arrives.
    expect(toParticipant).toContain('David Ellis')
  })

  it('names every Leader when the relationship is a group', () => {
    const group = starterMessageToParticipant({
      ministryName: 'Riverside Chapel',
      leaderNames: ['David Ellis', 'Ruth Adeyemi'],
      participantNoun: roleNoun('mentee'),
    })

    expect(group).toContain('David Ellis and Ruth Adeyemi')
  })

  it('sends a Participant no phone number either', () => {
    // The Leader reaches out, so a Participant has never needed one. The way an
    // Admin reaches a Participant is Nudge, which reveals a number to a person
    // rather than texting it to one.
    expect(carriesAPhoneNumber(toParticipant)).toBe(false)
  })

  it('reads as a whole message on its own', () => {
    // Nothing is appended to it at dispatch -- it discloses nobody -- so every
    // sentence in it has to stand as sent.
    expect(toParticipant.trimEnd().endsWith(':')).toBe(false)
    expect(toParticipant).toContain('they will reach out to you soon')
  })
})

describe('the message a resumed relationship sends', () => {
  const resumed = resumedMessage({
    ministryName: 'Riverside Chapel',
    withNames: ['David Ellis'],
  })

  it('says what actually happened, and not that they have been matched', () => {
    // *You have been paired* is true on the day the match is made. Sending it
    // again after a fortnight away would tell somebody they had been matched to
    // the person they have been meeting all year.
    expect(resumed).toContain('Your discipleship with David Ellis has been resumed!')
    expect(resumed).not.toContain('paired')
  })

  it('names the people on the other side of the relationship', () => {
    expect(
      resumedMessage({
        ministryName: 'Riverside Chapel',
        withNames: ['Emily Johnson', 'Sarah Kim'],
      }),
    ).toContain('Emily Johnson and Sarah Kim')
  })

  it('carries the opt-out disclosure, because a Pause can run twelve weeks', () => {
    // Longer than the thirty-day Silence Gap the disclosure exists for. Carried
    // on every resume rather than only the long ones: re-disclosing early is not
    // a compliance failure, and not disclosing late is.
    expect(resumed).toContain('Reply STOP to opt out')
  })

  it('carries no phone number', () => {
    expect(carriesAPhoneNumber(resumed)).toBe(false)
  })
})

describe('the reminder a Leader gets at two days', () => {
  const body = acceptanceReminderMessage({
    ministryName: 'Riverside Chapel',
    fullName: 'David Ellis',
    link,
  })

  it('speaks in the Ministry\'s voice and carries the link again', () => {
    expect(body.startsWith('Riverside Chapel: ')).toBe(true)
    // A reminder that made them go back and find the first text would cost more
    // than the thing it is reminding them of.
    expect(body).toContain(link)
  })

  it('still reveals nobody', () => {
    // The match is on the page, after the Leader chooses to open it. A name here
    // would say what the invitation deliberately did not.
    expect(body).not.toContain('Emily')
    expect(carriesAPhoneNumber(body)).toBe(false)
  })

  it('does not frame it as a failure', () => {
    for (const scolding of ['late', 'overdue', 'failed', 'still waiting for you']) {
      expect(body.toLowerCase()).not.toContain(scolding)
    }
  })

  it('re-discloses nothing, because it is neither first contact nor the Starter Message', () => {
    expect(body).not.toContain('Discipler:')
    expect(body).not.toContain('Reply STOP to opt out')
  })

  it('greets by first name, and manages without one', () => {
    expect(body).toContain('David,')
    expect(
      acceptanceReminderMessage({ ministryName: 'Riverside Chapel', fullName: '', link }),
    ).toContain('There’s still someone waiting')
  })
})
