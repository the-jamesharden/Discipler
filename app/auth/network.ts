import { isIPv4, isIPv6 } from 'node:net'

/**
 * Which network a request came from, for the sign-in guessing limit's count per
 * network (Exponential launch, ticket 13). Null when it cannot be told.
 *
 * Read from `x-forwarded-for` and nothing else, because that is the header Vercel
 * documents as *the public IP address of the client*, and it overwrites whatever
 * the client sent in it "to prevent IP spoofing"
 * (https://vercel.com/docs/headers/request-headers). Nothing sits in front of
 * Vercel here, so its value is the address that reached Vercel's edge and a client
 * cannot choose it. `x-real-ip` and `x-vercel-forwarded-for` carry the same address
 * and are not consulted: one header read is one header to reason about.
 *
 * Off Vercel -- `next start` on this machine -- Next fills the header from the
 * socket only when the request did not carry one, so a test can name its own
 * network. That is the point of reading it here rather than in a fixture.
 *
 * The first entry of a list is the client, in the header's own convention. An
 * IPv6 address counts as its /64: that is the block one household or one phone
 * is handed, and counting single addresses inside it would let one guesser
 * rotate through eighteen quintillion of them.
 */
export const networkOf = (headers: Headers): string | null => {
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''

  if (isIPv4(first)) return first
  if (!isIPv6(first)) return null

  // An IPv4 address carried in IPv6 is the IPv4 address it carries, so a client
  // reached over either is one network.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(first)?.[1]
  if (mapped && isIPv4(mapped)) return mapped

  return `${firstFourGroups(first).join(':')}::/64`
}

/**
 * The first four of the eight groups, each without leading zeros and in lower
 * case, so one /64 is one string however the address was written. Only ever given
 * what `isIPv6` accepted.
 */
const firstFourGroups = (address: string): string[] => {
  // A dotted IPv4 tail fills the last two groups, which a /64 never reaches, so
  // it is counted as two groups and its value is not needed.
  const plain = address.replace(/\d+\.\d+\.\d+\.\d+$/, '0:0')

  const [head = '', tail] = plain.split('::')
  const left = head === '' ? [] : head.split(':')
  const right = tail === undefined || tail === '' ? [] : tail.split(':')
  const missing = tail === undefined ? 0 : 8 - left.length - right.length

  return [...left, ...Array<string>(missing).fill('0'), ...right]
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16))
}
