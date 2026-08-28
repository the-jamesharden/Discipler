import { describe, expect, it } from 'vitest'
import { composeMessage, welcomeMessage } from '~/domain/outbound-copy'

describe('Every message is the Ministry’s voice', () => {
  it('carries the Ministry name as a prefix', () => {
    const text = composeMessage({
      ministryName: 'Riverside Chapel',
      body: 'You are all set.',
      identifyDelivery: false,
      discloseOptOut: false,
    })

    expect(text).toBe('Riverside Chapel: You are all set.')
  })

  it('stacks the compliance prefix in front of the Ministry rather than replacing it', () => {
    const text = composeMessage({
      ministryName: 'Riverside Chapel',
      body: 'You are all set.',
      identifyDelivery: true,
      discloseOptOut: false,
    })

    expect(text).toBe('Discipler: Riverside Chapel: You are all set.')
  })
})

describe('Opt-out and rate disclosure', () => {
  it('is appended when the message has to carry it', () => {
    const text = composeMessage({
      ministryName: 'Riverside Chapel',
      body: 'You are all set.',
      identifyDelivery: false,
      discloseOptOut: true,
    })

    expect(text).toBe(
      'Riverside Chapel: You are all set. Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    )
  })

  it('is left off a message that does not have to carry it', () => {
    const text = composeMessage({
      ministryName: 'Riverside Chapel',
      body: 'You are all set.',
      identifyDelivery: false,
      discloseOptOut: false,
    })

    expect(text).not.toContain('STOP')
  })
})

describe('The Welcome Message', () => {
  it('is first contact, so it identifies delivery and discloses opt-out', () => {
    const text = welcomeMessage({ ministryName: 'Riverside Chapel', fullName: 'Emily Johnson' })

    expect(text).toBe(
      'Discipler: Riverside Chapel: Thanks, Emily — you’re all set. ' +
        'We’ll text you once you’ve been matched with someone to meet with. ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    )
  })

  it('greets a one-word name without mangling it', () => {
    expect(welcomeMessage({ ministryName: 'Riverside Chapel', fullName: 'Emily' })).toContain(
      'Thanks, Emily —',
    )
  })

  it('names nobody it cannot name rather than greeting an empty string', () => {
    expect(welcomeMessage({ ministryName: 'Riverside Chapel', fullName: '   ' })).toContain(
      'Riverside Chapel: You’re all set.',
    )
  })
})
