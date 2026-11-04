import { Centred } from '../../shell'
import { CREATE_AN_ACCOUNT, EMAIL_PAGE } from '../copy'
import { carriedFrom } from '../flow'
import { AlreadyHaveAnAccount, SignUpProgress, type SearchParams } from '../parts'
import { standingOnPage, titleWhileOpen } from '../standing'
import { EmailAndPhoneForm } from './form'

export const dynamic = 'force-dynamic'

export const generateMetadata = titleWhileOpen(EMAIL_PAGE.title)

/**
 * Sign-up's second page: one form, an email and a mobile phone (Exponential launch,
 * ticket 15; mock-up 1's `s2-email-phone.html`). The Exponential special offer drawn
 * over this page in the mock-up is ticket 20's.
 */
export default async function EmailAndPhonePage({ searchParams }: { searchParams: SearchParams }) {
  const carried = carriedFrom(await searchParams)
  const standing = await standingOnPage('email_and_phone', carried)

  return (
    <Centred subtitle={CREATE_AN_ACCOUNT} botanical>
      <SignUpProgress step={EMAIL_PAGE.step} name={EMAIL_PAGE.stepName} percent={33} />
      <EmailAndPhoneForm triedEmail={standing.email} carried={carried} />
      <AlreadyHaveAnAccount />
    </Centred>
  )
}
