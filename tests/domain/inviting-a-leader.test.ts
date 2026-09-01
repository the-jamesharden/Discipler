import { describe, expect, it } from 'vitest'
import { roleNoun } from '~/domain/ministry-settings'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { createSequentialIds, ministryId, personId } from '~/domain/ids'
import { INVITATION_LIFETIME_DAYS } from '~/domain/invitations'

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const david = personId('00000000-0000-4000-8000-0000000000d1')
const sarah = personId('00000000-0000-4000-8000-0000000000d2')
const emily = personId('00000000-0000-4000-8000-0000000000e1')
const anna = personId('00000000-0000-4000-8000-0000000000e2')

const now = new Date('2026-03-02T09:00:00Z')

const context = (): CommandContext => ({
  ministryId: ministry,
  clock: createTestClock(now),
  ids: createSequentialIds(),
  ministryName: 'Riverside Chapel',
  language: { leaderNoun: roleNoun('mentor'), participantNoun: roleNoun('mentee') },
  appBaseUrl: 'https://discipler.example',
  contacts: {
    people: new Map([
      [david, { fullName: 'David Ellis', phone: '+15550100' }],
      [sarah, { fullName: 'Sarah Kim', phone: '+15550101' }],
      [emily, { fullName: 'Emily Johnson', phone: '+15550102' }],
      [anna, { fullName: 'Anna Reed', phone: '+15550103' }],
    ]),
  },
})

const pair = (leaderIds = [david], participantIds = [emily]) =>
  handleCommand(
    { type: 'relationship.create', ministryId: ministry, leaderIds, participantIds },
    context(),
  )

const invitations = (result: ReturnType<typeof pair>) =>
  result.effects.flatMap((effect) =>
    effect.kind === 'invitation.issue' ? [effect.invitation] : [],
  )

const messages = (result: ReturnType<typeof pair>) =>
  result.effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message] : []))

describe('creating a relationship invites its Leaders', () => {
  it('issues one Invitation Link per Leader, bound to that Person', () => {
    const issued = invitations(pair([david, sarah], [emily, anna]))

    expect(issued.map((invitation) => invitation.personId).sort()).toEqual(
      [david, sarah].sort(),
    )
  })

  it('issues nothing to a Participant: they hear nothing until a Leader has agreed', () => {
    const issued = invitations(pair([david], [emily, anna]))

    expect(issued).toHaveLength(1)
    expect(issued[0]?.personId).toBe(david)
    expect(messages(pair()).map((message) => message.personId)).toEqual([david])
  })

  it('gives every Leader their own token', () => {
    const issued = invitations(pair([david, sarah], [emily]))
    const tokens = new Set(issued.map((invitation) => invitation.token))

    expect(tokens.size).toBe(2)
  })

  it('dates the link off the clock, not off system time', () => {
    const [invitation] = invitations(pair())

    expect(invitation?.createdAt).toEqual(now)
    expect(invitation?.expiresAt).toEqual(
      new Date(now.getTime() + INVITATION_LIFETIME_DAYS * 86_400_000),
    )
  })

  it('texts each Leader a link to their own invitation and nobody else’s', () => {
    const result = pair([david, sarah], [emily])
    const issued = invitations(result)
    const sent = messages(result)

    for (const invitation of issued) {
      const theirs = sent.find((message) => message.personId === invitation.personId)
      expect(theirs?.body).toContain(invitation.token)
      const others = sent.filter((message) => message.personId !== invitation.personId)
      for (const other of others) expect(other.body).not.toContain(invitation.token)
    }
  })

  it('sends the Leader nothing that could disclose a phone number', () => {
    expect(messages(pair()).every((message) => message.disclosesPersonId === null)).toBe(true)
  })

  it('does not activate what it created', () => {
    const result = pair()
    expect(result.effects.some((effect) => effect.kind === 'invitation.accept')).toBe(false)
  })
})
