import { describe, expect, it } from 'vitest'
import { popupAddressFor, popupFor } from '../../app/roster/pair/popup-address'

/**
 * Manual pairing, recut ticket 05. The old Pair page is gone and its address opens
 * the popup: a Discipler it named on the Discipler's side with whoever it ticked, a
 * Disciple alone on the Disciple's side, and a refusal's every choice carried. The
 * rule is held here, on the one function the redirect and the pairing route read.
 */

const claire = '11111111-1111-1111-1111-111111111111'
const hana = '22222222-2222-2222-2222-222222222222'
const sam = '33333333-3333-3333-3333-333333333333'
const ana = '44444444-4444-4444-4444-444444444444'

const addressFor = (query: readonly (readonly [string, string])[]) => {
  const address = new URL(popupAddressFor(new URLSearchParams(query.map(([name, value]) => [name, value]))), 'http://x')
  return { pathname: address.pathname, query: [...address.searchParams] }
}

describe('where the old Pair address opens the popup', () => {
  // Roles per pairing, ticket 01: the side is in the address on its own, so the
  // popup opens on the side the old address named them on, over the whole Roster,
  // which is one list (ticket 02).
  it('opens a Discipler it named on the Discipler’s side', () => {
    expect(addressFor([['leaderId', claire]])).toEqual({
      pathname: '/roster',
      query: [
        ['pair', claire],
        ['side', 'discipler'],
      ],
    })
  })

  it('opens it with every Disciple it named already ticked', () => {
    expect(addressFor([['leaderId', claire], ['with', sam], ['with', ana]]).query).toEqual([
      ['pair', claire],
      ['side', 'discipler'],
      ['with', sam],
      ['with', ana],
    ])
  })

  it('opens a Disciple alone, the Follow-Up tab’s link, on the Disciple’s side', () => {
    expect(addressFor([['with', sam]])).toEqual({
      pathname: '/roster',
      query: [
        ['pair', sam],
        ['side', 'disciple'],
      ],
    })
  })

  it('carries a refusal’s error and every choice it restored', () => {
    const refusal: [string, string][] = [
      ['error', 'relationship.gender_does_not_match_the_declaration'],
      ['about', sam],
      ['mode', 'separate'],
      ['leaderId', claire],
      ['leaderId', hana],
      ['with', sam],
      ['with', ana],
      ['declaredGender', 'male'],
      ['name', 'The Tuesday Group'],
      ['joinRequiresApproval', 'yes'],
      ['materialId', 'm-1'],
      [`materialId.${sam}`, 'm-2'],
    ]

    expect(addressFor(refusal).query).toEqual([
      ['pair', claire],
      ['side', 'discipler'],
      // Everything else as it was, the second Discipler included: the popup is
      // one Discipler's, and what it cannot hold it leaves unread.
      ...refusal.filter(([name, value]) => !(name === 'leaderId' && value === claire)),
    ])
  })

  it('opens the first Discipler named, where it named several', () => {
    expect(addressFor([['leaderId', hana], ['leaderId', claire]]).query.slice(0, 2)).toEqual([
      ['pair', hana],
      ['side', 'discipler'],
    ])
  })

  it('reads an empty value as nobody named', () => {
    expect(addressFor([['leaderId', ''], ['with', sam]]).query.slice(0, 2)).toEqual([
      ['pair', sam],
      ['side', 'disciple'],
    ])
  })

  it('sends an address that names nobody to the Roster, with nothing of it', () => {
    expect(addressFor([])).toEqual({ pathname: '/roster', query: [] })
    expect(addressFor([['error', 'relationship.needs_a_leader']])).toEqual({ pathname: '/roster', query: [] })
  })

  it('never carries the retired list, a popup or a side of its own over the one it opens', () => {
    expect(addressFor([['list', 'all'], ['pair', ana], ['side', 'discipler'], ['with', sam]]).query).toEqual([
      ['pair', sam],
      ['side', 'disciple'],
    ])
  })
})

describe('whose popup a submission names nobody for returns to', () => {
  it('is its first Discipler’s', () => {
    expect(popupFor({ leaderIds: [claire, hana], participantIds: [sam] })).toEqual({ pair: claire, side: 'discipler' })
  })

  it('is its first Disciple’s, where it has no Discipler', () => {
    expect(popupFor({ leaderIds: [], participantIds: [sam, ana] })).toEqual({ pair: sam, side: 'disciple' })
  })

  it('is nobody’s where it names nobody', () => {
    expect(popupFor({ leaderIds: [], participantIds: [] })).toBeNull()
  })
})
