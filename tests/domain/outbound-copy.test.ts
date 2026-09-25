import { describe, expect, it } from 'vitest'
import { relationshipId } from '~/domain/ids'
import { composeMessage, materialMessage, welcomeMessage } from '~/domain/outbound-copy'

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
    const text = welcomeMessage({
      ministryName: 'Riverside Chapel',
      fullName: 'Emily Johnson',
      promises: 'a_match',
    })

    expect(text).toBe(
      'Discipler: Riverside Chapel: Thanks, Emily — you’re all set. ' +
        'We’ll text you once you’ve been paired with someone to meet with. ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    )
  })

  /**
   * On the group path the Person has already said where they are going and hears
   * nothing about it by text. The Welcome there is the consent receipt and the
   * first contact, so it keeps both disclosures and promises nothing about a match.
   */
  it('promises no match to somebody who named a group', () => {
    const text = welcomeMessage({
      ministryName: 'Riverside Chapel',
      fullName: 'Emily Johnson',
      promises: 'nothing',
    })

    expect(text).toBe(
      'Discipler: Riverside Chapel: Thanks, Emily — you’re all set. ' +
        'Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    )
    expect(text).not.toContain('matched')
    expect(text).not.toContain('joined')
  })

  it('greets a one-word name without mangling it', () => {
    expect(
      welcomeMessage({ ministryName: 'Riverside Chapel', fullName: 'Emily', promises: 'a_match' }),
    ).toContain('Thanks, Emily —')
  })

  it('names nobody it cannot name rather than greeting an empty string', () => {
    expect(
      welcomeMessage({ ministryName: 'Riverside Chapel', fullName: '   ', promises: 'a_match' }),
    ).toContain('Riverside Chapel: You’re all set.')
  })
})

describe('The text when a Material changes (Richer materials, tickets 03 and 04)', () => {
  // Word for word as James approved them in M-5 on 2026-09-24, each with the
  // rates line it may carry.
  const RATES = ' Msg & data rates may apply. Reply STOP to opt out, HELP for help.'
  const dashboard = 'https://app.trydiscipler.com/relationships'
  const page = 'https://app.trydiscipler.com/material/3f2a'
  const withEmily = relationshipId('00000000-0000-4000-8000-0000000000d1')
  const say = (text: Parameters<typeof materialMessage>[0]['text'], link: string) =>
    materialMessage({ ministryName: 'Riverside Chapel', text, link })

  it('reads as drawn for each of a Leader’s four', () => {
    expect(say({ kind: 'leader_moved', title: 'Romans: Life in the Spirit' }, dashboard)).toBe(
      `Riverside Chapel: The material for your discipleship is now Romans: Life in the Spirit. See it at ${dashboard}${RATES}`,
    )
    expect(say({ kind: 'leader_updated', title: 'Romans: Life in the Spirit' }, dashboard)).toBe(
      `Riverside Chapel: Romans: Life in the Spirit, the material for your discipleship, has been updated. See it at ${dashboard}${RATES}`,
    )
    expect(say({ kind: 'leader_several', count: 3 }, dashboard)).toBe(
      `Riverside Chapel: The material has changed for 3 of your discipleship relationships. See them at ${dashboard}${RATES}`,
    )
    expect(say({ kind: 'leader_none' }, dashboard)).toBe(
      `Riverside Chapel: Your discipleship no longer has a material assigned. See it at ${dashboard}${RATES}`,
    )
  })

  it('reads as drawn for both of a Disciple’s', () => {
    expect(
      say(
        { kind: 'participant_moved', title: 'Romans: Life in the Spirit', leaderNames: ['Grace Lee'], relationshipId: withEmily },
        page,
      ),
    ).toBe(`Riverside Chapel: Your discipleship material with Grace Lee is now Romans: Life in the Spirit. Open it here: ${page}${RATES}`)
    expect(say({ kind: 'participant_updated', title: 'Romans: Life in the Spirit', relationshipId: withEmily }, page)).toBe(
      `Riverside Chapel: Your discipleship material, Romans: Life in the Spirit, has been updated. Open it here: ${page}${RATES}`,
    )
  })
})
