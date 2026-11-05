import { resolveAdmin } from '~/platform/supabase/current-admin'
import { pageAddressOf } from '~/domain/support-form'
import { AccountMenu, PageShell } from '../../shell'
import { AdminNav } from '../../top-nav'
import { BACK_TO_DISCIPLER, HELP_CENTER, helpPageTitle } from '../copy'
import { ContactForm } from './contact-form'
import { CONTACT_SUBTITLE, CONTACT_SUPPORT, CONTACT_SUPPORT_PAGE, FORM_IS_SHUT, FROM_PAGE, NEEDS_A_SCRIPT } from './copy'

export const dynamic = 'force-dynamic'

export const metadata = { title: helpPageTitle(CONTACT_SUPPORT) }

/**
 * The one form for getting help, reporting a bug or asking for a feature (Exponential
 * launch, ticket 25). The Help menu opens it for an Admin, and the Help pages' "Still
 * stuck?" line for anybody.
 *
 * It is on the Help center's side of the door: open with no sign-in, and it asks
 * `resolveAdmin` only to decide which header to draw and whether a human check is
 * needed. Somebody with no session costs no read at all. Somebody signed in who
 * administers nothing, a Leader, is treated as signed out: the menu is Admins' only for
 * now, and this keeps a Leader's church from being looked up for a form they were not
 * offered.
 */
export default async function ContactSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ [FROM_PAGE]?: string | string[] }>
}) {
  const resolution = await resolveAdmin()
  const from = (await searchParams)[FROM_PAGE]
  const page = pageAddressOf(typeof from === 'string' ? from : null)

  const isAdmin = resolution.status === 'admin'
  const humanCheckKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null

  return (
    <PageShell
      title={CONTACT_SUPPORT}
      subtitle={CONTACT_SUBTITLE}
      back={isAdmin ? { href: '/', label: BACK_TO_DISCIPLER } : { href: '/help', label: HELP_CENTER }}
      {...(resolution.status === 'admin' ? { banners: resolution.admin } : {})}
      actions={
        resolution.status === 'admin' ? (
          <AdminNav admin={resolution.admin} />
        ) : resolution.status === 'not-an-admin' ? (
          <AccountMenu />
        ) : null
      }
    >
      <noscript>
        <p className="notice">{NEEDS_A_SCRIPT}</p>
      </noscript>
      {isAdmin || humanCheckKey ? (
        <ContactForm
          page={page}
          humanCheckKey={isAdmin ? null : humanCheckKey}
          action={`${CONTACT_SUPPORT_PAGE}/send`}
        />
      ) : (
        <p className="notice">
          {FORM_IS_SHUT.before}
          <a href={`mailto:${FORM_IS_SHUT.email}`}>{FORM_IS_SHUT.email}</a>
          {FORM_IS_SHUT.after}
        </p>
      )}
    </PageShell>
  )
}
