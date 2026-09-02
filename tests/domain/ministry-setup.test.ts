import { describe, expect, it } from 'vitest'
import { INVITATION_LIFETIME_DAYS } from '~/domain/invitations'
import {
  MINISTRY_SETUP_LIFETIME_DAYS,
  issueMinistrySetup,
  ministrySetupState,
  ministrySetupToken,
} from '~/domain/ministry-setup'

const issuedAt = new Date('2026-03-02T09:00:00Z')

const aLink = () =>
  issueMinistrySetup({
    token: ministrySetupToken('a-token'),
    ministryName: 'Anthem Church',
    sendingNumber: '+15550100',
    adminPhone: '+15550101',
    at: issuedAt,
  })

describe('issuing a Ministry Setup Link', () => {
  it('runs out on the same window as an Invitation Link', () => {
    const { createdAt, expiresAt } = aLink()
    const days = (expiresAt.getTime() - createdAt.getTime()) / 86_400_000

    expect(days).toBe(MINISTRY_SETUP_LIFETIME_DAYS)
    expect(days).toBe(INVITATION_LIFETIME_DAYS)
  })

  it('carries the church and both numbers, so the Admin types neither', () => {
    expect(aLink()).toMatchObject({
      token: 'a-token',
      ministryName: 'Anthem Church',
      sendingNumber: '+15550100',
      adminPhone: '+15550101',
    })
  })
})

describe('what a Ministry Setup Link is worth when it is opened', () => {
  const live = aLink()

  it('is live from the moment it is issued to the moment it runs out', () => {
    expect(ministrySetupState({ ...live, consumedAt: null }, issuedAt)).toBe('live')
    expect(ministrySetupState({ ...live, consumedAt: null }, live.expiresAt)).toBe('live')
  })

  it('expires once the window has passed', () => {
    const after = new Date(live.expiresAt.getTime() + 1)
    expect(ministrySetupState({ ...live, consumedAt: null }, after)).toBe('expired')
  })

  it('reads as spent once a Ministry was opened on it, even after it would have run out', () => {
    const after = new Date(live.expiresAt.getTime() + 1)
    expect(ministrySetupState({ ...live, consumedAt: issuedAt }, after)).toBe('consumed')
  })
})
