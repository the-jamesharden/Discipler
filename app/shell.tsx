import Link from 'next/link'
import type { ReactNode } from 'react'
import type { SignedInAdmin } from '~/service/ports'
import { CHANGE_YOUR_PASSWORD } from './account/copy'
import { BotanicalFrame } from './botanical'
import { ArrowLeft } from './icons'
import { INTAKE_FORMS } from './intake-forms/copy'

/**
 * The page shells every screen renders inside. Three shapes and no fourth: the
 * Admin surface with its tab bar, a plain page with a header for the screens a
 * Leader or an Admin reaches from it, and one card centred on the page for the
 * screens somebody reaches from a text message.
 *
 * Every control here is a link, a button or a form. The prototype's tabs are
 * JavaScript toggles over one page; here every tab is its own route, which is
 * what the app already has, and the current one is marked with `aria-current`.
 */

/**
 * The six Admin tabs, left to right and named as the prototype names them.
 * Materials was greyed out from ticket 31 until the tab was built
 * (`.scratch/materials/spec.md`); every tab is a link now.
 *
 * Three of them wear a painting behind the cards, each its own, and three wear
 * none (James, 2026-09-25): Blossom on the Overview, Trees where Care Needed is
 * worked, tulips on the Roster.
 */
export const ADMIN_TABS = [
  { key: 'overview', href: '/overview', label: 'Overview', design: 'blossom' },
  { key: 'check-ins', href: '/check-ins', label: 'Check-Ins', design: null },
  { key: 'suggested-pairs', href: '/suggested-pairs', label: 'Suggested Pairs', design: null },
  { key: 'follow-up', href: '/follow-up', label: 'Follow-Up', design: 'trees' },
  { key: 'materials', href: '/materials', label: 'Materials', design: null },
  { key: 'roster', href: '/roster', label: 'Roster', design: 'tulips' },
] as const

export type AdminTab = (typeof ADMIN_TABS)[number]['key']

export const SIGN_OUT = 'Sign out'

/** The sign-out control: a form, because signing out is a POST. */
export const SignOut = () => (
  <form method="post" action="/auth/sign-out">
    <button type="submit" className="ghost-btn">
      {SIGN_OUT}
    </button>
  </form>
)

export const ACCOUNT = 'Account'

/**
 * The one control every signed-in header carries besides its own way back: a menu
 * of the places that are not the page's own. Two groups, named for what they act
 * on. *This Ministry* -- Ministry settings and Intake forms -- is offered only to
 * somebody who administers one; *You* -- Change your password and Sign out -- is
 * everybody's, and goes unlabelled when it is the only group.
 *
 * A `details` element and nothing more (ticket 32, decision 2). It opens and closes
 * with no script, which keeps the shell's rule that nothing here depends on one; the
 * price is that it closes only when its summary is pressed again.
 *
 * The summary says *Account* and not the person's name: the signed-in Admin is a
 * Ministry and a person id, and putting a name here would add a read to every page.
 */
export const AccountMenu = ({ ministry }: { readonly ministry: boolean }) => (
  <details className="account">
    <summary>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
      {ACCOUNT}
      <svg
        className="chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </summary>
    <div className="account-menu">
      {ministry ? (
        <div className="account-group">
          <p className="account-label">This Ministry</p>
          <Link href="/settings">Ministry settings</Link>
          <Link href="/intake-forms">{INTAKE_FORMS}</Link>
        </div>
      ) : null}
      <div className="account-group">
        {ministry ? <p className="account-label">You</p> : null}
        <Link href="/account">{CHANGE_YOUR_PASSWORD}</Link>
        <SignOut />
      </div>
    </div>
  </details>
)

export const TabBar = ({
  current,
  followUpCount,
}: {
  readonly current: AdminTab | null
  readonly followUpCount: number
}) => (
  <nav aria-label="Admin surfaces">
    <ul className="tabs">
      {ADMIN_TABS.map((tab) => (
        <li key={tab.key}>
          <Link
            href={tab.href}
            className="tab"
            aria-current={tab.key === current ? 'page' : undefined}
          >
            {tab.label}
            {tab.key === 'follow-up' && followUpCount > 0 ? (
              <span className="tab-badge" aria-label={`${followUpCount} needing attention`}>
                {followUpCount}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  </nav>
)

/**
 * The Admin shell: the Ministry's name in the header, the way to the Leader
 * surface, the Account menu, and the six tabs with the current one marked.
 *
 * The Follow-Up badge is the length of Care Needed, which is the same number the
 * Overview's Needs Follow-Up tile shows. Every page hands the count in, because a
 * page is one read (`docs/adr/0023-a-page-is-one-read.md`): the number derives
 * from the same document the page was drawn from, and the shell reads nothing of
 * its own -- which is what keeps the badge from being a second read again.
 */
export const AdminShell = ({
  admin,
  current,
  title,
  subtitle,
  followUpCount,
  children,
}: {
  readonly admin: SignedInAdmin
  readonly current: AdminTab | null
  readonly title?: string
  readonly subtitle?: string
  readonly followUpCount: number
  readonly children: ReactNode
}) => {
  const badge = followUpCount
  // A page off the tab bar wears the Overview's.
  const design = current ? ADMIN_TABS.find((tab) => tab.key === current)!.design : 'blossom'

  return (
    <div className="container botanical">
      <BotanicalFrame design={design} />
      <header className="header">
        <div>
          <h1>{title ?? admin.ministryName}</h1>
          <p>{subtitle ?? (title ? admin.ministryName : 'Discipleship relationships, week by week')}</p>
        </div>
        <div className="header-actions">
          {/* Both surfaces, in one session, from one `ministry_member` row that says
              `admin`. An Admin who also leads is the same person on both, and the
              Leader surface is a live query for open leader memberships -- so this
              link is offered unconditionally and answers honestly when they lead
              nothing. Visible beside the menu rather than inside it, because it is
              a place and not a setting (ticket 32, decision 1). */}
          <Link href="/relationships" className="ghost-btn">
            The relationships you lead
          </Link>
          <AccountMenu ministry />
        </div>
      </header>

      <TabBar current={current} followUpCount={badge} />

      <main>{children}</main>
    </div>
  )
}

/**
 * The way back to the page this one was reached from. An outlined button with an
 * arrow, like the header's other controls, and never a bare link: standing on its
 * own beside *Account*, underlined text read as words rather than as a way out.
 * `small` for inside a card, and `className` for where it sits.
 */
export const BackLink = ({
  href,
  label,
  small = false,
  className,
}: {
  readonly href: string
  readonly label: string
  readonly small?: boolean
  readonly className?: string
}) => (
  <Link className={['ghost-btn', small ? 'small' : null, className].filter(Boolean).join(' ')} href={href}>
    <ArrowLeft />
    {label}
  </Link>
)

/**
 * A page with a header and no tab bar: the Leader Dashboard, the settings
 * screens, the pairing form, the reset screen. `back` is the way to the surface
 * it was reached from.
 */
export const PageShell = ({
  title,
  subtitle,
  back,
  actions,
  wide = false,
  children,
}: {
  readonly title: string
  readonly subtitle?: string
  readonly back?: { readonly href: string; readonly label: string }
  readonly actions?: ReactNode
  /** The Leader Dashboard's two-column layout needs the whole width. */
  readonly wide?: boolean
  readonly children: ReactNode
}) => (
  <div className={wide ? 'container wide' : 'container narrow'}>
    <header className="header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="header-actions">
        {back ? <BackLink href={back.href} label={back.label} /> : null}
        {actions}
      </div>
    </header>
    <main>{children}</main>
  </div>
)

/**
 * One card centred on the page. Sign-in, every Intake screen, the Invitation
 * Link and the done pages: the screens somebody opens from a text message on a
 * phone, where one card is the whole of the design.
 *
 * A page opened on a Ministry's behalf -- every Intake screen -- carries that
 * Ministry's name at the top, because that is who the Person came to sign up
 * with, and Discipler's mark at the foot of the page, small. A page with no
 * Ministry in it, such as sign-in, is Discipler's own and keeps the wordmark.
 */
export const Centred = ({
  ministryName,
  subtitle,
  botanical = false,
  children,
}: {
  /** Whose page this is. Given, it heads the card and the wordmark moves to the foot. */
  readonly ministryName?: string
  readonly subtitle?: string
  /**
   * The watercolour frame the Admin surface wears. Sign-in only: every other
   * centred page is opened on a Ministry's behalf and is dressed as theirs.
   */
  readonly botanical?: boolean
  readonly children: ReactNode
}) => (
  <main className={botanical ? 'centred botanical' : 'centred'}>
    {botanical ? <BotanicalFrame design="blossom" /> : null}
    <div className="card">
      {ministryName ? (
        <h1 className="ministry-mark">{ministryName}</h1>
      ) : (
        <h1 className="wordmark">Discipler</h1>
      )}
      {subtitle ? <p className="sub">{subtitle}</p> : null}
      {children}
    </div>
    {ministryName ? (
      <p className="centred-brand">
        <img src="/discipler-logo.png" alt="Discipler" width={450} height={230} />
      </p>
    ) : null}
  </main>
)

/**
 * A signed-in page reached by somebody who administers nothing. Sending them back
 * to sign in would only loop, so it says what is wrong.
 */
export const NotAnAdmin = ({ title }: { readonly title: string }) => (
  <PageShell title={title} subtitle="Discipler" actions={<AccountMenu ministry={false} />}>
    <div className="card">
      <p className="empty">
        This account is not an Admin of a Ministry. Ask whoever invited you to add you
        to yours.
      </p>
      <p>
        <Link href="/relationships">The relationships you lead</Link>
      </p>
    </div>
  </PageShell>
)

export { initialsOf } from './initials'

/** `Sep 1`, the short date the prototype prints on cards. */
export const shortDate = (instant: Date): string =>
  instant.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
