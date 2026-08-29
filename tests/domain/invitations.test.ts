import { describe, expect, it } from 'vitest'
import {
  INVITATION_LIFETIME_DAYS,
  invitationState,
  issueInvitation,
  invitationToken,
} from '~/domain/invitations'
import { ministryId, personId, relationshipId } from '~/domain/ids'

const ministry = ministryId('00000000-0000-4000-8000-000000000001')
const relationship = relationshipId('00000000-0000-4000-8000-000000000002')
const person = personId('00000000-0000-4000-8000-000000000003')
const issuedAt = new Date('2026-03-02T09:00:00Z')

const anInvitation = () =>
  issueInvitation({
    ministryId: ministry,
    relationshipId: relationship,
    personId: person,
    token: invitationToken('a-token'),
    at: issuedAt,
  })

describe('issuing an Invitation Link', () => {
  it('expires within the seven-to-fourteen day window the spec allows', () => {
    const { createdAt, expiresAt } = anInvitation()
    const days = (expiresAt.getTime() - createdAt.getTime()) / 86_400_000

    expect(days).toBe(INVITATION_LIFETIME_DAYS)
    expect(days).toBeGreaterThanOrEqual(7)
    expect(days).toBeLessThanOrEqual(14)
  })

  it('binds the link to the Person and the relationship, and nothing else', () => {
    expect(anInvitation()).toMatchObject({
      ministryId: ministry,
      relationshipId: relationship,
      personId: person,
      token: 'a-token',
    })
  })
})

describe('what a token is worth when it is opened', () => {
  const live = anInvitation()

  it('is live the moment it is issued', () => {
    expect(invitationState({ ...live, consumedAt: null }, issuedAt)).toBe('live')
  })

  it('survives being opened and abandoned, right up to the expiry', () => {
    const aDayLater = new Date('2026-03-03T09:00:00Z')
    expect(invitationState({ ...live, consumedAt: null }, aDayLater)).toBe('live')
    expect(invitationState({ ...live, consumedAt: null }, live.expiresAt)).toBe('live')
  })

  it('expires once the window has passed', () => {
    const after = new Date(live.expiresAt.getTime() + 1)
    expect(invitationState({ ...live, consumedAt: null }, after)).toBe('expired')
  })

  it('is consumed by account creation, not by being opened', () => {
    const consumedAt = new Date('2026-03-03T09:00:00Z')
    expect(invitationState({ ...live, consumedAt }, consumedAt)).toBe('consumed')
  })

  it('reads as consumed rather than expired when it is both', () => {
    // The Leader made their account and the window then ran out. They are not
    // waiting on a re-issue; they have an account, and telling them the link
    // expired would send them back to an Admin for nothing.
    const consumedAt = new Date('2026-03-03T09:00:00Z')
    const longAfter = new Date('2027-01-01T09:00:00Z')
    expect(invitationState({ ...live, consumedAt }, longAfter)).toBe('consumed')
  })
})
