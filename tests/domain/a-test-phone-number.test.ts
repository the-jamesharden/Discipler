import { afterEach, describe, expect, it, vi } from 'vitest'
import { isUsPhone } from '~/domain/phone-check'
import { phoneNumber } from '~/domain/roster'

/**
 * The fixture's numbers have to be ones the product would text. It picks a random
 * block once per process, so a block `isUsPhone` refuses fails only the runs that
 * land on it. Each case below pins the pick, and imports the fixture afresh to make
 * it pick again.
 */

const numbersFromAStartOf = async (random: number, count: number) => {
  vi.resetModules()
  vi.spyOn(Math, 'random').mockReturnValue(random)
  const { aTestPhoneNumber } = await import('../support/local-supabase')
  return Array.from({ length: count }, () => aTestPhoneNumber())
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a test phone number', () => {
  it.each([
    ['the lowest block', 0],
    ['a block that once began with a 0 exchange', 0.06],
    ['a block that once began with a 1 exchange', 0.15],
    ['the highest block, walking past its end', 0.999_999_9],
  ])('is a US number from %s', async (_name, random) => {
    const numbers = await numbersFromAStartOf(random, 3)

    expect(new Set(numbers).size).toBe(3)
    expect(numbers.filter((number) => !isUsPhone(phoneNumber(number)))).toEqual([])
  })
})
