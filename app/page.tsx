import { redirect } from 'next/navigation'
import { resolveAdmin, type SignedInAdmin } from '~/platform/supabase/current-admin'
import { paymentStepOf } from './signup/payment/standing'

/**
 * Whether this Admin still has the payment step to do (Exponential launch, ticket 18).
 * A read that failed lands them on the Overview, where they would be anyway, with no
 * access and no texts: it is the one way nobody loses a page to a question about billing.
 */
const hasThePaymentStepToDo = async (admin: SignedInAdmin): Promise<boolean> => {
  try {
    return (await paymentStepOf(admin)) !== null
  } catch (error) {
    console.error(`Asking about the payment step failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return false
  }
}

/**
 * Which of the two surfaces this session opens on. There are two in V1 and no
 * third: Admin and Leader.
 *
 * An Admin lands on the Overview, the first of the six tabs. Everybody else lands
 * on their own relationships -- including an Admin who leads, who reaches theirs
 * from the link in the Admin shell rather than by being sent somewhere on the
 * strength of a tier.
 *
 * The one exception is an Admin of a church that signed itself up and left at the
 * payment step, which is where this sends them back to at their next sign-in. A typed
 * `/overview` is not sent anywhere, and that church has no access and sends no texts.
 */
export default async function Home() {
  const resolution = await resolveAdmin()

  if (resolution.status === 'signed-out') redirect('/login')
  if (resolution.status !== 'admin') redirect('/relationships')
  if (await hasThePaymentStepToDo(resolution.admin)) redirect('/signup/payment')
  redirect('/overview')
}
