import { describe, expect, it } from 'vitest'
import { networkOf } from '../../app/auth/network'

/**
 * Which network a sign-in came from, for the guessing limit's per-network count
 * (Exponential launch, ticket 13). Read from `x-forwarded-for`, which Vercel
 * overwrites with the address that reached it, so a client cannot choose it.
 */

const from = (forwardedFor?: string) =>
  networkOf(new Headers(forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor }))

describe('the network a sign-in came from', () => {
  it('is the IPv4 address Vercel reports', () => {
    expect(from('203.0.113.7')).toBe('203.0.113.7')
  })

  it('is the first address of a list, which is the client', () => {
    expect(from('203.0.113.7, 10.0.0.1')).toBe('203.0.113.7')
  })

  it('is the /64 an IPv6 address sits in, because one household holds all of it', () => {
    expect(from('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3:8d3::/64')
    expect(from('2001:db8:85a3:8d3::1')).toBe('2001:db8:85a3:8d3::/64')
  })

  it('is the same /64 however the address is written', () => {
    expect(from('2001:0DB8:0000:0001:0000:0000:0000:0001')).toBe(from('2001:db8:0:1::1'))
  })

  it('reads an IPv4 address wrapped in IPv6 as the IPv4 address', () => {
    expect(from('::ffff:198.51.100.4')).toBe('198.51.100.4')
  })

  it('is unknown when the header is missing or is not an address', () => {
    expect(from()).toBeNull()
    expect(from('')).toBeNull()
    expect(from('not-an-address')).toBeNull()
  })
})
