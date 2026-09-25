import Link from 'next/link'
import type { RosterEntry } from '~/service/ports'
import { ROSTER_MENU } from './copy'
import { theMenu, type MenuSection, type RosterView } from './menu'

/**
 * The Everyone menu over the Roster (Roles per pairing, ticket 02), in place of the
 * All / Disciplers / Disciples toggle. A details element like the Account menu,
 * open and closed by its button, and every option a plain link to the Roster with
 * that one option changed: it works before any script and after none, and what is
 * ticked is in the address, so a refresh keeps it.
 *
 * The button never says *Filter* (James, 2026-09-24). It reads **Everyone** with
 * nothing ticked and names what is shown otherwise, so no chips sit beside it. An
 * option's link keeps the menu open on the page it lands on, so several can be
 * ticked in a row; **Everyone** clears it and leaves it closed.
 */
export const RosterMenu = ({
  view,
  roster,
  open,
}: {
  readonly view: RosterView
  readonly roster: readonly RosterEntry[]
  /** Whether the address asked for it open: an option's link just landed here. */
  readonly open: boolean
}) => {
  const menu = theMenu(view, roster)
  return (
    <div className="roster-tools">
      <details className="roster-menu" open={open} data-testid="roster-menu">
        <summary>
          {menu.button}
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
        <nav className="roster-menu-panel" aria-label={ROSTER_MENU.named}>
          <div className="menu-group">
            <Link
              className="opt everyone"
              href={menu.everyone.href}
              scroll={false}
              aria-current={menu.everyone.ticked ? 'true' : undefined}
            >
              {menu.everyone.label}
              <span className="n">{menu.everyone.count}</span>
            </Link>
          </div>
          {menu.sections.map((section) => (
            <Section key={section.heading} section={section} />
          ))}
        </nav>
      </details>
    </div>
  )
}

/**
 * One section: its heading, and each option with the box or round it is ticked in
 * and its count. A box for *tick any*, a round for *pick one*, as the mock-ups
 * draw them with checkboxes and radios; here they are marks inside a link, since
 * a link is what works without script.
 */
const Section = ({ section }: { readonly section: MenuSection }) => (
  <div className="menu-group">
    <p className="menu-label">{section.heading}</p>
    {section.options.map((option) => (
      <Link
        key={option.label}
        className="opt"
        href={option.href}
        scroll={false}
        aria-current={option.ticked ? 'true' : undefined}
      >
        <span className={section.pick === 'one' ? 'opt-mark round' : 'opt-mark'} aria-hidden="true">
          {option.ticked && section.pick === 'any' ? (
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.2l2.3 2.3 4.7-5" />
            </svg>
          ) : null}
        </span>
        {option.label}
        <span className="n">{option.count}</span>
      </Link>
    ))}
  </div>
)
