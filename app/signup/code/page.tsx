import { Centred } from '../../shell'
import { CODE_PAGE, CREATE_AN_ACCOUNT, signUpRefusalMessage } from '../copy'
import { carriedFrom } from '../flow'
import { SignUpProgress, type SearchParams } from '../parts'
import { standingOnPage, titleWhileOpen } from '../standing'
import { CodeForm } from './form'

export const dynamic = 'force-dynamic'

export const generateMetadata = titleWhileOpen(CODE_PAGE.title)

/** What the page says on arriving, about a code that can no longer work. */
const STANDING_REFUSAL = {
  live: null,
  expired: 'signup.code_expired',
  tries_used: 'signup.too_many_tries',
} as const

/**
 * Sign-up's third page: the 6-digit code emailed to them, in one box (Exponential
 * launch, ticket 16; mock-up 1's `s3-code.html`). An address with an account gets a
 * notice and not a code, and this page reads the same for it (ticket 11).
 */
export default async function CodePage({ searchParams }: { searchParams: SearchParams }) {
  const carried = carriedFrom(await searchParams)
  const standing = await standingOnPage('code', carried)
  const refusal = STANDING_REFUSAL[standing.code]

  return (
    <Centred subtitle={CREATE_AN_ACCOUNT} botanical>
      <SignUpProgress step={CODE_PAGE.step} name={CODE_PAGE.stepName} percent={33} />
      <div className="sent-to">
        {CODE_PAGE.sentBefore}
        <strong>{standing.email}</strong>
        {CODE_PAGE.sentAfter}
      </div>
      <CodeForm
        email={standing.email}
        resendInSeconds={standing.resendInSeconds}
        refusedOnArrival={refusal ? signUpRefusalMessage(refusal) : null}
        carried={carried}
      />
      <p className="card-note">{CODE_PAGE.cantFindIt}</p>
    </Centred>
  )
}
