import { describe, expect, it } from 'vitest'
import type { RelationshipState } from '~/domain/relationship-state'
import { cardPill, needOf } from '../../app/overview/need'

/**
 * What colours an Overview card (Pastor feedback, ticket 02): green when
 * healthy, yellow when stalled, red while it carries an unresolved Concern,
 * grey when paused or awaiting acceptance. And the word on it, so no meaning
 * rests on the colour alone.
 */

const card = (state: RelationshipState, openConcerns = 0) => ({ state, openConcerns })

describe('the colour of a card', () => {
  it('is green for a healthy relationship', () => {
    expect(needOf(card('healthy'))).toBe('healthy')
  })

  it('is yellow for a stalled one', () => {
    expect(needOf(card('stalled'))).toBe('stalled')
  })

  it('is red in the week a Concern is raised', () => {
    expect(needOf(card('needs_care', 1))).toBe('concern')
  })

  it('stays red after that week, for as long as the Concern is unresolved', () => {
    // Needs Care lasts the week; the badge lasts until an Admin resolves it, and
    // the colour goes with the badge.
    expect(needOf(card('healthy', 1))).toBe('concern')
  })

  it('is red, not yellow, on a stalled relationship that carries a Concern', () => {
    expect(needOf(card('stalled', 2))).toBe('concern')
  })

  it('is grey for a paused relationship and for one awaiting acceptance', () => {
    expect(needOf(card('paused'))).toBe('inactive')
    expect(needOf(card('awaiting_leader_acceptance'))).toBe('inactive')
  })

  it('is red on a paused relationship that still carries a Concern', () => {
    // Pausing does not resolve a Concern, and grey would hide the one thing on
    // the card that still needs an Admin.
    expect(needOf(card('paused', 1))).toBe('concern')
  })
})

describe('the word on a card', () => {
  it('names every state, Healthy included', () => {
    expect(cardPill(card('healthy'))).toEqual({ state: 'healthy', label: 'Healthy' })
    expect(cardPill(card('stalled'))).toEqual({ state: 'stalled', label: 'Stalled' })
    expect(cardPill(card('needs_care', 1))).toEqual({ state: 'needs_care', label: 'Needs care' })
    expect(cardPill(card('paused'))).toEqual({ state: 'paused', label: 'Paused' })
    expect(cardPill(card('awaiting_leader_acceptance'))).toEqual({
      state: 'awaiting_leader_acceptance',
      label: 'Awaiting acceptance',
    })
  })

  it('says nothing of Healthy on a card that is red, whose flag line says Concern', () => {
    expect(cardPill(card('healthy', 1))).toBeNull()
  })

  it('keeps the state on a red card whose state is something besides healthy', () => {
    expect(cardPill(card('stalled', 1))).toEqual({ state: 'stalled', label: 'Stalled' })
    expect(cardPill(card('paused', 1))).toEqual({ state: 'paused', label: 'Paused' })
  })
})
