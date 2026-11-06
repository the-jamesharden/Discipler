import { getReferralCodes } from '~/service/container'
import { Centred } from '../../shell'
import { CREATE_AN_ACCOUNT, EMAIL_PAGE } from '../copy'
import { carriedFrom, carriedValue, emailPageArrival } from '../flow'
import { AlreadyHaveAnAccount, SignUpProgress, type SearchParams } from '../parts'
import { codeRefusalMessage } from '../payment/copy'
import { standingOnPage, titleWhileOpen } from '../standing'
import { EmailAndPhoneStep } from './step'

export const dynamic = 'force-dynamic'

export const generateMetadata = titleWhileOpen(EMAIL_PAGE.title)

/**
 * Sign-up's second page: one form, an email and a mobile phone (Exponential launch,
 * ticket 15; mock-up 1's `s2-email-phone.html`), with what the address carried decided
 * here and drawn by `./step` (ticket 20; mock-up 6's `c1-have-a-code.html`).
 *
 * A referral code is asked about whatever else the address holds, so the page takes the
 * same time for a live code, an unknown one and a retired one. Whether it is live is the
 * banner and nothing else, and the church is never named.
 */
export default async function EmailAndPhonePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const carried = carriedFrom(params)
  const standing = await standingOnPage('email_and_phone', carried)

  const ref = carriedValue(params.ref)
  const arrival = emailPageArrival({
    code: carriedValue(params.code),
    claimed: carriedValue(params.claimed) !== null,
    refIsLive: ref !== null && (await getReferralCodes().isLive(ref)),
    at: new Date(),
  })

  return (
    <Centred subtitle={CREATE_AN_ACCOUNT} botanical>
      <SignUpProgress step={EMAIL_PAGE.step} name={EMAIL_PAGE.stepName} percent={33} />
      <EmailAndPhoneStep
        triedEmail={standing.email}
        carried={carried}
        offerScreen={arrival.offerScreen}
        invited={arrival.invited}
        codeRefused={arrival.codeRefusal ? codeRefusalMessage(arrival.codeRefusal) : null}
        canTypeACode={arrival.canTypeACode}
      />
      <AlreadyHaveAnAccount />
    </Centred>
  )
}
