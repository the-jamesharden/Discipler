import { SHORTEST_PASSWORD } from '~/domain/accounts'
import { offerFor } from '~/domain/offers'
import { HEARD_ABOUT_US, heardFromCarried } from '~/domain/sign-up-account'
import { HUMAN_CHECK_ACTIONS } from '~/domain/sign-up-attempt'
import { Centred } from '../../shell'
import { ACCOUNT_PAGE, accountPrices, CREATE_AN_ACCOUNT } from '../copy'
import { carriedFrom, carriedValue } from '../flow'
import { SignUpProgress, type SearchParams } from '../parts'
import { standingOnPage, titleWhileOpen } from '../standing'
import { AccountForm } from './form'

export const dynamic = 'force-dynamic'

export const generateMetadata = titleWhileOpen(ACCOUNT_PAGE.title)

/**
 * "Set up your account" (Exponential launch, ticket 17; mock-up 1's `s4-account.html`):
 * the one place sign-up names a price, and what opens the church.
 *
 * The login email is the attempt's, from here on the server, so the page shows it and
 * the form does not send it. What the address carries decides only what this page says
 * and what it preselects; the payment step checks the code again when it is used.
 */
export default async function SetUpYourAccountPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const carried = carriedFrom(params)
  const standing = await standingOnPage('account', carried)

  const code = carriedValue(params.code)
  const { offer } = offerFor({ code: code ?? '', invited: false, at: new Date() })

  return (
    <Centred subtitle={CREATE_AN_ACCOUNT} botanical>
      <SignUpProgress step={ACCOUNT_PAGE.step} name={ACCOUNT_PAGE.stepName} percent={66} />
      <h2 className="req-heading">{ACCOUNT_PAGE.title}</h2>
      <p className="req-note">
        <span className="req">*</span> {ACCOUNT_PAGE.requiredNote}
      </p>
      <AccountForm
        email={standing.email}
        heardChoices={HEARD_ABOUT_US}
        heardFromLink={heardFromCarried({ code, ref: carriedValue(params.ref) })}
        shortestPassword={SHORTEST_PASSWORD}
        prices={accountPrices(offer)}
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}
        action={HUMAN_CHECK_ACTIONS.openChurch}
        code={code}
        referral={carriedValue(params.ref)}
        carried={carried}
      />
    </Centred>
  )
}
