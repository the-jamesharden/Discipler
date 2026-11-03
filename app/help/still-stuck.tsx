import Link from 'next/link'
import { CONTACT_SUPPORT_PAGE } from './contact/copy'
import { STILL_STUCK } from './copy'

/**
 * The line under every help page and the list: the form, which is the way in for
 * somebody not signed in, and the support address as a link. The form's page reads the
 * session, so it is not prefetched from pages that otherwise read nothing.
 */
export const StillStuck = () => (
  <p className="help-foot">
    {STILL_STUCK.before}
    <Link href={CONTACT_SUPPORT_PAGE} prefetch={false}>
      {STILL_STUCK.form}
    </Link>
    {STILL_STUCK.middle}
    <a href={`mailto:${STILL_STUCK.email}`}>{STILL_STUCK.email}</a>
    {STILL_STUCK.after}
  </p>
)
