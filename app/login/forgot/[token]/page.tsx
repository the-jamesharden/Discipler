import type { Metadata } from 'next'
import { SHORTEST_PASSWORD } from '~/domain/accounts'
import { getForgotPassword } from '~/service/container'
import { Centred } from '../../../shell'
import { BACK_TO_SIGN_IN, DEAD_LINK_PAGE, SUBTITLE } from '../copy'
import { NEW_PASSWORD_PAGE, newPasswordProblem } from './copy'
import { NewPasswordForm } from './new-password-form'

export const dynamic = 'force-dynamic'

type Params = Promise<{ token: string }>

export const generateMetadata = async ({ params }: { params: Params }): Promise<Metadata> => {
  const { token } = await params
  return { title: (await getForgotPassword().linkIsLive(token)) ? NEW_PASSWORD_PAGE.title : DEAD_LINK_PAGE.title }
}

/**
 * The link in the reset email (Exponential launch, ticket 22; mock-up 6's
 * `f3-new-password.html` and `f4-link-dead.html`). Opening it only shows a page and
 * spends nothing, so an email scanner following the link cannot use it up; the button
 * does. A link that ran out, was used, was replaced or never was all read alike.
 *
 * There is no session here and none is consulted, as with every link: possession of
 * this one is the whole of the authentication.
 */
export default async function NewPasswordPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error } = await searchParams

  if (!(await getForgotPassword().linkIsLive(token))) {
    return (
      <Centred subtitle={SUBTITLE} botanical>
        <p className="toast error" role="alert">
          {DEAD_LINK_PAGE.said}
        </p>
        <a className="btn full" href="/login/forgot">
          {DEAD_LINK_PAGE.again}
        </a>
        <p className="card-note">
          <a href="/login">{BACK_TO_SIGN_IN}</a>
        </p>
      </Centred>
    )
  }

  const problem = newPasswordProblem(error)

  return (
    <Centred subtitle={SUBTITLE} botanical>
      {problem ? (
        <p className="toast error" role="alert">
          {problem}
        </p>
      ) : null}
      <NewPasswordForm action={`/login/forgot/${encodeURIComponent(token)}/save`} submit={NEW_PASSWORD_PAGE.submit}>
        <div className="field">
          <label className="label" htmlFor="password">
            {NEW_PASSWORD_PAGE.label}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={SHORTEST_PASSWORD}
            autoComplete="new-password"
          />
          <p className="hint">{NEW_PASSWORD_PAGE.hint}</p>
        </div>
      </NewPasswordForm>
    </Centred>
  )
}
