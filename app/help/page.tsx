import Link from 'next/link'
import { PageShell } from '../shell'
import { BACK_TO_DISCIPLER, HELP_CENTER, HELP_CENTER_LEAD, helpPageTitle } from './copy'
import { HELP_SECTIONS, helpPagesHere } from './library'
import { StillStuck } from './still-stuck'

/**
 * The Help center: every help page, in its section, with the sentence that says what
 * it covers (Exponential launch, ticket 34).
 *
 * **Public, with no sign-in** (decided on the ticket, 2026-10-31): a pastor
 * deciding whether to sign up may read it, and nothing on it is any church's. So it
 * reads no session and nothing from the database, and is built once, at build
 * time, from the Markdown in `content/`.
 */
export const metadata = { title: helpPageTitle(HELP_CENTER) }

export default function HelpCenterPage() {
  const pages = helpPagesHere()
  return (
    <PageShell
      title={HELP_CENTER}
      subtitle={HELP_CENTER_LEAD}
      back={{ href: '/', label: BACK_TO_DISCIPLER }}
    >
      {HELP_SECTIONS.map((section) => (
        <section key={section.key} className="card help-section" aria-labelledby={`help-${section.key}`}>
          <h2 className="card-title" id={`help-${section.key}`}>
            {section.title}
          </h2>
          <ul className="help-list">
            {pages.filter((page) => page.section === section.key).map((page) => (
              <li key={page.slug}>
                <Link href={page.href}>
                  <span className="help-list-title">{page.title}</span>
                  <span className="help-list-summary">{page.lead}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <StillStuck />
    </PageShell>
  )
}
