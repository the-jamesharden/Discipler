import Link from 'next/link'
import { ALREADY_HAVE_AN_ACCOUNT, SIGN_IN } from './copy'

/** What a query string looks like to a page under `/signup`. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The wizard's progress bar, as mock-up 1 draws it. */
export const SignUpProgress = ({
  step,
  name,
  percent,
}: {
  readonly step: string
  readonly name: string
  readonly percent: number
}) => (
  <div className="progress">
    <div className="progress-labels">
      <strong>{step}</strong>
      <span>{name}</span>
    </div>
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  </div>
)

export const AlreadyHaveAnAccount = () => (
  <p className="card-note">
    {ALREADY_HAVE_AN_ACCOUNT} <Link href="/login">{SIGN_IN}</Link>
  </p>
)
