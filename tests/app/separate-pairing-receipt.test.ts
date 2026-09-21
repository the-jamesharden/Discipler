import { describe, expect, it } from 'vitest'
import { personId } from '~/domain/ids'
import {
  decodeSeparateReceipt,
  encodeSeparateReceipt,
} from '../../app/roster/pair/receipt'

/**
 * Manual pairing, ticket 21. What a set of separate one-to-ones did, carried from
 * the pairing route to the Roster in the address. A set stopped partway cannot be
 * arranged over HTTP without two Admins racing, so the rule that it never reports
 * the number asked for is held here, on the one function that writes the number.
 */

const sam = personId('33333333-3333-3333-3333-333333333333')
const ana = personId('44444444-4444-4444-4444-444444444444')
const ruth = personId('55555555-5555-5555-5555-555555555555')

const through = (params: URLSearchParams) =>
  decodeSeparateReceipt({
    pairs: params.get('pairs') ?? undefined,
    notPaired: params.getAll('notPaired'),
    pairError: params.get('pairError') ?? undefined,
  })

describe('the receipt for a set of separate one-to-ones', () => {
  it('counts the one-to-ones formed', () => {
    const params = encodeSeparateReceipt({ status: 'formed', formed: 3 })

    expect([...params.keys()]).toEqual(['pairs'])
    expect(through(params)).toEqual({ formed: 3, notPaired: [], refusal: undefined })
  })

  it('reports two when two of four landed, and who was not, and why', () => {
    const params = encodeSeparateReceipt({
      status: 'partly_formed',
      formed: [sam, ana],
      notFormed: [ruth, personId('66666666-6666-6666-6666-666666666666')],
      refusal: 'relationship.participant_has_opted_out',
      about: ruth,
    })

    expect(params.get('pairs')).toBe('2')
    expect(through(params)).toEqual({
      formed: 2,
      notPaired: [ruth, '66666666-6666-6666-6666-666666666666'],
      refusal: 'relationship.participant_has_opted_out',
    })
  })

  it('carries no code where what stopped it was not a refusal', () => {
    const params = encodeSeparateReceipt({
      status: 'partly_formed',
      formed: [sam],
      notFormed: [ana],
      refusal: null,
      fault: new Error('the connection was lost'),
      about: ana,
    })

    expect(params.has('pairError')).toBe(false)
    // Nothing of the fault reaches an address, which is logged, shared and kept.
    expect(params.toString()).not.toContain('connection')
    expect(through(params)).toEqual({ formed: 1, notPaired: [ana], refusal: undefined })
  })

  it('is no receipt at all without a count of one or more', () => {
    expect(decodeSeparateReceipt({})).toBeUndefined()
    expect(decodeSeparateReceipt({ pairs: '0', notPaired: [ana] })).toBeUndefined()
    expect(decodeSeparateReceipt({ pairs: 'three' })).toBeUndefined()
  })

  it('reads one person not paired as one, however the address carried them', () => {
    expect(decodeSeparateReceipt({ pairs: '1', notPaired: ana })?.notPaired).toEqual([ana])
  })
})
