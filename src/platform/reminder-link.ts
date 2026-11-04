import { createHmac, timingSafeEqual } from 'node:crypto'
import { ministryId, type MinistryId } from '~/domain/ids'
import { signUpCodeSecret } from './sign-up-code-keeper'

/**
 * The address behind "Don't send me reminders" (Exponential launch, ticket 18), which
 * works signed out and so has to prove on its own which church it speaks for.
 *
 * Signed with sign-up's own secret rather than a new one to configure. What is signed
 * starts with a word no sign-up code's ever does, so one can never pass for the other.
 * Changing the secret ends every link already sent, and the worst of that is one more
 * page saying the link does not work.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SIGNATURE = /^[0-9a-f]{64}$/

const signatureOf = (church: string): string =>
  createHmac('sha256', signUpCodeSecret()).update(`reminders-off:${church}`).digest('hex')

export const remindersOffToken = (church: MinistryId): string => `${church}.${signatureOf(church)}`

/**
 * The church a token speaks for, or null for anything else: a token that is not one,
 * one that was changed, or any at all where the secret is not set.
 */
export const churchOfRemindersOffToken = (token: string | null | undefined): MinistryId | null => {
  const [church, signature, ...rest] = (token ?? '').split('.')
  if (!church || !signature || rest.length > 0 || !UUID.test(church) || !SIGNATURE.test(signature)) return null

  let expected: string
  try {
    expected = signatureOf(church)
  } catch {
    return null
  }
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex')) ? ministryId(church) : null
}
