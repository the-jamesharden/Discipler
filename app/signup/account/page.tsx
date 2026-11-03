import { Centred } from '../../shell'
import { CREATE_AN_ACCOUNT, STOPPING_POINT } from '../copy'
import { carriedFrom } from '../flow'
import { SignUpProgress, type SearchParams } from '../parts'
import { standingOnPage, titleWhileOpen } from '../standing'

export const dynamic = 'force-dynamic'

export const generateMetadata = titleWhileOpen(STOPPING_POINT.title)

/**
 * Where sign-up stops until ticket 17 replaces this page with "Set up your account"
 * (Exponential launch, ticket 16). The email is proven and nothing else has happened:
 * no account, no church, no consent, and the attempt lapses by itself.
 *
 * Production never shows it, because `SIGN_UP_OPEN` stays off there until ticket 17
 * and the legal pages are live; it is what staging shows in the meantime.
 */
export default async function SetUpYourAccountPage({ searchParams }: { searchParams: SearchParams }) {
  const standing = await standingOnPage('account', carriedFrom(await searchParams))

  return (
    <Centred subtitle={CREATE_AN_ACCOUNT} botanical>
      <SignUpProgress step={STOPPING_POINT.step} name={STOPPING_POINT.stepName} percent={66} />
      <div className="sent-to">
        {STOPPING_POINT.confirmedBefore}
        <strong>{standing.email}</strong>
        {STOPPING_POINT.confirmedAfter}
      </div>
      <p className="subtle">{STOPPING_POINT.notOpenYet}</p>
    </Centred>
  )
}
