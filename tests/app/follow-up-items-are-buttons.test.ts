import { describe, expect, it } from 'vitest'
import { FOLLOW_UP_KINDS, type FollowUpPayload } from '~/domain/follow-up'
import { concernId, followUpItemId, intendedPairingId, personId, relationshipId } from '~/domain/ids'
import type { CareMember, CareNeededItem, FollowUpCareItem } from '~/service/ports'
import {
  followUpLine,
  followUpParts,
  happeningLine,
  heldFor,
  itemBandLabel,
  itemCardLine,
  placementLine,
  placementParts,
  stallHeld,
  stalledLine,
  whoIsInIt,
} from '../../app/follow-up/copy'
import { anchorOf, cardOf, frontOf } from '../../app/follow-up/front'

/**
 * Follow-Up's items as buttons (Pastor feedback, ticket 10): what each says on
 * the list, which card it opens, and what *What has happened* says, worded off
 * the reader's own types with no database near it.
 */

const zone = 'America/New_York'
// Monday 12 October 2026, 11pm in New York.
const now = new Date('2026-10-13T03:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

const pair = relationshipId('00000000-0000-4000-8000-0000000000a1')
const ended = relationshipId('00000000-0000-4000-8000-0000000000a2')
const live = new Set<string>([pair])

const ben: CareMember = { personId: personId('00000000-0000-4000-8000-0000000000b1'), fullName: 'Ben Carter', role: 'leader' }
const noah: CareMember = { personId: personId('00000000-0000-4000-8000-0000000000b2'), fullName: 'Noah Fields', role: 'participant' }
const claire = personId('00000000-0000-4000-8000-0000000000b3')

const payloadOf = (kind: FollowUpPayload['kind']): FollowUpPayload => {
  switch (kind) {
    case 'pause_expired':
      return { kind, periodWeeks: 2 }
    case 'swap_requested':
      return { kind, requestedBy: 'leader' }
    case 'participant_keyword':
      return { kind, keyword: 'HELP' }
    case 'intended_pairing_refused':
      return { kind, intendedPairingId: intendedPairingId('plan-1'), refusal: 'relationship.gender_must_match' }
    default:
      return { kind }
  }
}

const anItem = (
  over: Partial<FollowUpCareItem> & { payload: FollowUpPayload },
): { readonly source: 'follow_up' } & FollowUpCareItem => ({
  source: 'follow_up',
  id: followUpItemId('00000000-0000-4000-8000-0000000000c1'),
  raisedAt: daysAgo(12),
  relationshipId: pair,
  personId: null,
  personName: null,
  members: [ben, noah],
  relationshipCreatedAt: daysAgo(40),
  waitedDays: 40,
  awaiting: null,
  invited: null,
  placement: null,
  ...over,
})

describe('the sentence on an item, in two', () => {
  it('is the same sentence it always was, said whole on the card', () => {
    for (const kind of FOLLOW_UP_KINDS) {
      const { reason, more } = followUpParts(payloadOf(kind), 'Emily Johnson', 5)
      expect(followUpLine(payloadOf(kind), 'Emily Johnson', 5), kind).toBe(more === null ? reason : `${reason} ${more}`)
      expect(reason, kind).toMatch(/\.$/)
    }
  })

  it('puts only why it is here on the list', () => {
    expect(followUpParts({ kind: 'pause_expired', periodWeeks: 2 }, null, null)).toEqual({
      reason: 'Paused for 2 weeks; that period has elapsed and the relationship has not resumed.',
      more: 'Still paused, and nobody has moved.',
    })
    expect(followUpParts({ kind: 'relationship_unaccepted' }, null, 6, { names: ['Ben Carter'], running: false }).reason).toBe(
      'Ben Carter has not accepted this relationship; it has waited 6 days.',
    )
    expect(followUpParts({ kind: 'participant_keyword', keyword: 'HELP' }, 'Liam Okafor', null)).toEqual({
      reason: 'Liam Okafor texted HELP.',
      more: 'Nothing was changed on their behalf; it is yours to answer.',
    })
  })

  it('says when somebody signed up for a group on the list, and the rest on the card', () => {
    const placement = {
      gender: 'male' as const,
      ageBand: '25-34' as const,
      availability: [{ day: 'tuesday' as const, hour: '18' as const }],
      groups: [],
      timeZone: zone,
    }
    const parts = placementParts(new Date('2026-09-09T16:00:00Z'), placement)
    expect(parts.reason).toBe('Signed up on the group link on 9 Sep with no group in mind.')
    expect(placementLine(new Date('2026-09-09T16:00:00Z'), placement)).toBe(
      `${parts.reason} ${parts.more}`,
    )
    expect(parts.more).toBe("Men's, 25 to 34, available Tuesday evenings. No group is open to them right now.")
  })
})

describe('the words on the list', () => {
  it('names the pair as the list James settled draws it', () => {
    expect(whoIsInIt(['Rachel Adams'], ['Emily Davis'])).toBe('Rachel Adams → Emily Davis')
    expect(whoIsInIt([], ['Ana Ruiz', 'Beth Shaw'])).toBe('Nobody leading → Ana Ruiz, Beth Shaw')
  })

  it('says a stall in its own unit, with no dash', () => {
    expect(stalledLine({ kind: 'gone_silent', days: 22 })).toBe('Gone silent: 22 days since last contact.')
    expect(stalledLine({ kind: 'not_meeting', weeks: 3 })).toBe('Answering, not meeting: 3 weeks reported as no meeting.')
    expect(stallHeld({ kind: 'gone_silent', days: 22 })).toBe('22 days')
    expect(stallHeld({ kind: 'not_meeting', weeks: 1 })).toBe('1 week')
  })

  it('says how long an item has held on the pair card’s own steps', () => {
    expect(heldFor(now, now)).toBe('today')
    expect(heldFor(daysAgo(1), now)).toBe('1 day')
    expect(heldFor(daysAgo(12), now)).toBe('12 days')
    expect(heldFor(daysAgo(35), now)).toBe('5 weeks')
    expect(heldFor(daysAgo(70), now)).toBe('2 months')
  })
})

describe('an item as a button', () => {
  it('opens its live relationship’s card, named by the pair, with its reason and how long it has held', () => {
    const item = anItem({ payload: { kind: 'pause_expired', periodWeeks: 2 } })
    expect(frontOf(item, [item], live, now)).toEqual({
      card: pair,
      tone: 'review',
      tagTone: 'review',
      tag: 'Pause expired',
      who: 'Ben Carter → Noah Fields',
      line: 'Paused for 2 weeks; that period has elapsed and the relationship has not resumed.',
      held: '12 days',
    })
  })

  it('opens a card of its own for an item about a Person alone, or a relationship that has ended', () => {
    const alone = anItem({
      relationshipId: null,
      members: [],
      personId: claire,
      personName: 'Claire Martinez',
      payload: { kind: 'participant_keyword', keyword: 'HELP' },
    })
    expect(frontOf(alone, [alone], live, now)).toMatchObject({ card: alone.id, who: 'Claire Martinez' })
    const gone = anItem({ relationshipId: ended, payload: { kind: 'pause_expired', periodWeeks: 1 } })
    expect(cardOf(gone, live)).toBe(gone.id)
    expect(anchorOf(gone.id, true)).toBe(`item-${gone.id}`)
    expect(anchorOf(pair, false)).toBe(`relationship-${pair}`)
  })

  it('names who an item is about where they are not one of the pair, and keeps James’s title for a decline', () => {
    const joining = anItem({ personId: claire, personName: 'Claire Martinez', payload: { kind: 'group_join_requested' } })
    expect(frontOf(joining, [joining], live, now).who).toBe('Claire Martinez')
    const declined = anItem({
      personId: claire,
      personName: 'Claire Martinez',
      invited: { leadsAGroup: true, running: true, ledByNobody: false },
      payload: { kind: 'match_declined' },
    })
    expect(frontOf(declined, [declined], live, now)).toMatchObject({
      who: 'Group leader Claire Martinez Declined',
      tone: 'care-concern',
      tagTone: 'concern',
      line: 'Invited to help lead this group.',
    })
  })

  it('reads a stall amber in its own unit, a Concern red for as long as the oldest has stood, and never its words', () => {
    const stalled: CareNeededItem = {
      source: 'relationship',
      relationshipId: pair,
      state: 'stalled',
      reasons: [{ kind: 'gone_silent', days: 22 }],
      leaderNames: ['Mark Wilson'],
      participantNames: ['Jordan Ellis'],
      members: [],
      openConcerns: 0,
    }
    expect(frontOf(stalled, [stalled], live, now)).toEqual({
      card: pair,
      tone: 'care-stalled',
      tagTone: 'stalled',
      tag: 'Stalled',
      who: 'Mark Wilson → Jordan Ellis',
      line: 'Gone silent: 22 days since last contact.',
      held: '22 days',
    })

    const badge: CareNeededItem = {
      source: 'concern',
      relationshipId: pair,
      concerns: [
        { id: concernId('c2'), raisedAt: daysAgo(0), raisedBy: ben.personId, raisedByName: 'Ben Carter' },
        { id: concernId('c1'), raisedAt: daysAgo(15), raisedBy: ben.personId, raisedByName: 'Ben Carter' },
      ],
      participantNames: ['Noah Fields'],
      members: [ben, noah],
    }
    expect(frontOf(badge, [badge], live, now)).toMatchObject({
      tag: '2 concerns',
      line: '2 concerns raised and not yet resolved.',
      held: '2 weeks',
    })

    const needsCare: CareNeededItem = { ...stalled, state: 'needs_care', reasons: [] }
    expect(frontOf(needsCare, [needsCare, badge], live, now)).toMatchObject({
      tag: 'Needs care',
      tone: 'care-concern',
      held: 'today',
    })
  })
})

describe('the card of an item', () => {
  it('labels a band with who it is about, where the card does not show them', () => {
    expect(itemBandLabel('match_declined', 'Claire Martinez')).toBe('Invitation declined · Claire Martinez')
    expect(itemBandLabel('swap_requested', null)).toBe('Swap requested')
  })

  it('says over an item’s own card when it was raised', () => {
    expect(itemCardLine(daysAgo(3), now, zone)).toBe('Follow-Up · raised 9 Oct, 3 days ago')
  })
})

describe('what has happened, in words', () => {
  const at = new Date('2026-10-12T22:41:00Z')
  const said = (entry: Parameters<typeof happeningLine>[0]) => happeningLine(entry, now, zone)

  it('says each thing the history holds, and never the words of a Concern', () => {
    const item = anItem({ payload: { kind: 'swap_requested', requestedBy: 'leader' }, personName: 'Ben Carter' })
    expect(said({ kind: 'item_raised', at, item })).toBe(
      'Raised: Ben Carter asked to be matched with a different participant.',
    )
    const declined = anItem({
      payload: { kind: 'match_declined' },
      personId: claire,
      personName: 'Claire Martinez',
      invited: { leadsAGroup: true, running: true, ledByNobody: false },
    })
    expect(said({ kind: 'item_raised', at, item: declined })).toBe(
      'Raised about Claire Martinez: Invited to help lead this group.',
    )
    expect(said({ kind: 'concern_raised', at, by: 'Rachel Adams' })).toBe(
      'Rachel Adams raised a concern in the weekly check-in.',
    )
    expect(said({ kind: 'stalled', at, reason: 'gone_silent', weeks: 2 })).toBe(
      'Stalled: 2 check-ins in a row went unanswered.',
    )
    expect(said({ kind: 'stalled', at, reason: 'not_meeting', weeks: 3 })).toBe(
      'Stalled: 3 weeks running reported as no meeting.',
    )
    expect(said({ kind: 'check_in', at, outcome: 'unanswered' })).toBe('Check-in not answered.')
    expect(said({ kind: 'check_in', at, outcome: 'did_not_meet' })).toBe('Check-in answered: did not meet.')
    expect(said({ kind: 'check_in', at, outcome: 'concern' })).toBe('Check-in answered: D concern.')
    expect(said({ kind: 'concern_read', at, by: 'Pastor Dan Reyes' })).toBe('Pastor Dan Reyes read the concern at 6:41pm.')
    expect(said({ kind: 'concern_read', at, by: null })).toBe('An Admin read the concern at 6:41pm.')
    expect(
      said({
        kind: 'earlier_item',
        at,
        itemKind: 'swap_requested',
        personName: 'Ben Carter',
        resolvedAt: new Date('2026-10-01T15:00:00Z'),
        resolvedBy: 'Pastor Dan Reyes',
      }),
    ).toBe('Swap requested (Ben Carter), resolved by Pastor Dan Reyes on Thu 1 Oct.')
    expect(
      said({
        kind: 'earlier_concern',
        at,
        raisedBy: 'Rachel Adams',
        resolvedAt: new Date('2026-10-12T15:00:00Z'),
        resolvedBy: null,
      }),
    ).toBe('Concern raised by Rachel Adams, resolved today and its words cleared.')
  })
})
