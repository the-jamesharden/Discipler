import Link from 'next/link'
import type { ComponentType } from 'react'
import { upcomingOfficeHours } from '~/domain/office-hours'
import { newestUndismissed } from '~/domain/whats-new'
import type { SignedInAdmin } from '~/service/ports'
import { CHANGE_YOUR_PASSWORD, SIGN_OUT } from './account/copy'
import { NEXT_OFFICE_HOURS } from './help/office-hours'
import { WHATS_NEW } from './help/whats-new'
import {
  Book,
  Calendar,
  Form,
  Gear,
  Gift,
  Key,
  LeaveDoor,
  Mail,
  Megaphone,
  Pen,
  People,
  Person,
  QuestionMark,
  Restart,
  Video,
} from './icons'
import { initialsOf } from './initials'
import { INTAKE_FORMS } from './intake-forms/copy'
import { TopNavMenusClose } from './top-nav-menus-close'
import { helpMenuFor, liveMenu, REFER_A_CHURCH, type TopNavIcon } from './top-nav-menus'

/**
 * The top nav: the buttons at the right of every Admin page's header (Exponential
 * launch, ticket 23; the layout is B in `.lavish/top-nav-search/`). Refer a church
 * once there is somewhere to send anybody, Help, the Settings gear, and a circle with
 * the Admin's initials.
 *
 * It reads nothing. The name arrives with the Admin, from the one read the page has
 * already made (`app.page_session()`, `docs/adr/0023-a-page-is-one-read.md`), and the
 * rest is links.
 *
 * Both menus are `details` elements sharing a `name`, so opening one closes the other
 * and neither needs a script. With a script they also close on a press elsewhere and
 * on Escape (`./top-nav-menus-close`).
 *
 * Admins only for now, so a Leader's pages keep `AccountMenu` (`./shell`).
 */

/** Native exclusive accordions: at most one `details` of this name is open. */
const MENU_GROUP = 'top-nav'

const ICONS: Readonly<Record<TopNavIcon, ComponentType>> = {
  book: Book,
  restart: Restart,
  megaphone: Megaphone,
  calendar: Calendar,
  mail: Mail,
  video: Video,
  pen: Pen,
}

const HelpMenu = ({ admin }: { readonly admin: SignedInAdmin }) => (
  <details className="top-menu" name={MENU_GROUP}>
    <summary className="icon-btn" aria-label="Help and feedback" title="Help">
      <QuestionMark />
    </summary>
    <div className="top-menu-panel">
      {liveMenu(
        helpMenuFor({
          whatsNewIsNew: newestUndismissed(WHATS_NEW, admin.whatsNewDismissed) !== null,
          officeHours: upcomingOfficeHours(NEXT_OFFICE_HOURS, new Date()),
        }),
      ).map((group) => (
        <div className="top-menu-group" key={group.label}>
          <p className="top-menu-label">{group.label}</p>
          {group.items.map((item) => {
            const Icon = ICONS[item.icon]
            return item.newTab ? (
              <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">
                <Icon />
                {item.label}
              </a>
            ) : (
              <Link key={item.label} href={item.href}>
                <Icon />
                {item.label}
                {item.tag ? <span className="top-menu-tag">{item.tag}</span> : null}
              </Link>
            )
          })}
        </div>
      ))}
    </div>
  </details>
)

const AccountCircle = ({ admin }: { readonly admin: SignedInAdmin }) => (
  <details className="top-menu" name={MENU_GROUP}>
    <summary className="initials-btn" aria-label="Your account">
      {admin.fullName ? initialsOf(admin.fullName) : <Person />}
    </summary>
    <div className="top-menu-panel">
      <div className="top-menu-who">
        {admin.fullName ? <strong>{admin.fullName}</strong> : null}
        <span>{`Admin, ${admin.ministryName}`}</span>
      </div>
      <div className="top-menu-group">
        {/* Both surfaces, in one session, from one `ministry_member` row that says
            `admin`. An Admin who also leads is the same person on both, and the
            Leader surface is a live query for open leader memberships -- so this
            link is offered unconditionally and answers honestly when they lead
            nothing. */}
        <Link href="/relationships">
          <People />
          The relationships you lead
        </Link>
        <Link href="/intake-forms">
          <Form />
          {INTAKE_FORMS}
        </Link>
      </div>
      <div className="top-menu-group">
        <Link href="/account">
          <Key />
          {CHANGE_YOUR_PASSWORD}
        </Link>
        {/* Signing out is a POST, and stays one inside the menu. */}
        <form method="post" action="/auth/sign-out">
          <button type="submit">
            <LeaveDoor />
            {SIGN_OUT}
          </button>
        </form>
      </div>
    </div>
  </details>
)

export const AdminNav = ({ admin }: { readonly admin: SignedInAdmin }) => (
  <div className="top-nav">
    {REFER_A_CHURCH.href ? (
      <Link className="refer" href={REFER_A_CHURCH.href}>
        <Gift />
        <span className="refer-text">{REFER_A_CHURCH.label}</span>
      </Link>
    ) : null}
    <HelpMenu admin={admin} />
    <Link className="icon-btn" href="/settings" aria-label="Settings" title="Settings">
      <Gear />
    </Link>
    <AccountCircle admin={admin} />
    <TopNavMenusClose />
  </div>
)
