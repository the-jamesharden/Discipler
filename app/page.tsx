import { redirect } from 'next/navigation'
import { getBillingReader } from '~/service/container'
import { paymentStepOf } from './signup/payment/standing'

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
  const resolution = await getBillingReader().readHomePage()

  if (resolution.status === 'signed-out') redirect('/login')
  if (resolution.status !== 'admin') redirect('/relationships')
  if (paymentStepOf(resolution.admin, resolution.page.signup)) redirect('/signup/payment')
  redirect('/overview')
}
