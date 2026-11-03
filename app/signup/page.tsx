import { HUMAN_CHECK_ACTIONS } from '~/domain/sign-up-attempt'
import { Centred } from '../shell'
import { CREATE_AN_ACCOUNT, EMAIL_PAGE, signUpRefusalMessage } from './copy'
import { carriedFrom, signUpHref } from './flow'
import { HumanCheck } from './human-check'
import { AlreadyHaveAnAccount, type SearchParams } from './parts'
import { holdWhileSignUpIsShut, standingOnPage } from './standing'

export const dynamic = 'force-dynamic'

export const metadata = { title: EMAIL_PAGE.title }

/**
 * Sign-up's first page, at the address the booth's QR code and the marketing site
 * open (Exponential launch, ticket 15; mock-up 1's `s1-human.html`). Somebody already
 * part way through is sent to the page they stand on, unless they have come back here
 * on purpose to put another address on a new attempt (`again`).
 *
 * The mock-up draws a line above the widget, and the review took it out, so there is
 * no explanatory line (spec, decided in the mock-up 1 review).
 */
export default async function HumanCheckPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const carried = carriedFrom(params)

  if (params.again === undefined) await standingOnPage('human_check', carried)
  else holdWhileSignUpIsShut()

  return (
    <Centred subtitle={CREATE_AN_ACCOUNT} botanical>
      <HumanCheck
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}
        action={HUMAN_CHECK_ACTIONS.startSignUp}
        next={signUpHref('email_and_phone', carried)}
        couldNotPass={signUpRefusalMessage('signup.not_human')}
      />
      <AlreadyHaveAnAccount />
    </Centred>
  )
}
