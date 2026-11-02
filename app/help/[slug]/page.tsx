import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from '../../icons'
import { PageShell } from '../../shell'
import { ALL_HELP_PAGES, HELP_CENTER, NEXT_PAGE, PREVIOUS_PAGE, helpPageTitle } from '../copy'
import { HELP_PAGES, helpPage } from '../library'
import { renderMarkdown } from '../markdown'
import { StillStuck } from '../still-stuck'

/**
 * One help page, rendered from its Markdown (Exponential launch, ticket 34).
 *
 * Public and built at build time, like the list: every slug is known from
 * `HELP_PAGES`, and any other address is a 404 rather than a page rendered on
 * demand. The Markdown is rendered with raw HTML off (`../markdown.ts`), which is
 * what makes setting it as the article's HTML safe.
 */
export const dynamicParams = false

export const generateStaticParams = () => HELP_PAGES.map((page) => ({ slug: page.slug }))

export const generateMetadata = async ({ params }: { params: Promise<{ slug: string }> }) => {
  const page = helpPage((await params).slug)
  return { title: helpPageTitle(page?.title ?? HELP_CENTER), description: page?.summary }
}

export default async function HelpPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = helpPage((await params).slug)
  if (!page) notFound()

  const index = HELP_PAGES.indexOf(page)
  const previous = HELP_PAGES[index - 1]
  const next = HELP_PAGES[index + 1]

  return (
    <PageShell title={page.title} subtitle={HELP_CENTER} back={{ href: '/help', label: ALL_HELP_PAGES }}>
      <article
        className="card help-article"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(page.markdown) }}
      />
      <nav className="help-pager" aria-label="More help pages">
        {previous ? (
          <Link href={previous.href} className="help-pager-previous">
            <span className="help-pager-label">
              <ArrowLeft />
              {PREVIOUS_PAGE}
            </span>
            {previous.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={next.href} className="help-pager-next">
            <span className="help-pager-label">
              {NEXT_PAGE}
              <ArrowRight />
            </span>
            {next.title}
          </Link>
        ) : null}
      </nav>
      <StillStuck />
    </PageShell>
  )
}
