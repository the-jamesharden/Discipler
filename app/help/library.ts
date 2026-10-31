import askDiscipler from './content/ask-discipler.md?raw'
import billing from './content/billing.md?raw'
import checkIns from './content/check-ins.md?raw'
import followUp from './content/follow-up.md?raw'
import forDisciplers from './content/for-disciplers.md?raw'
import gettingHelp from './content/getting-help.md?raw'
import gettingStarted from './content/getting-started.md?raw'
import materials from './content/materials.md?raw'
import overview from './content/overview.md?raw'
import pairing from './content/pairing.md?raw'
import referrals from './content/referrals.md?raw'
import rosterAndIntake from './content/roster-and-intake.md?raw'
import settings from './content/settings.md?raw'
import setupVideos from './content/setup-videos.md?raw'
import signingIn from './content/signing-in.md?raw'
import testCheckIn from './content/test-check-in.md?raw'
import texting from './content/texting.md?raw'
import { HELP_FACTS } from './facts'
import { headingAnchor } from './markdown'

/**
 * Discipler's help docs: one Markdown file per page in `content/`, listed here in
 * the order the Help center shows them (Exponential launch, ticket 34).
 *
 * Everything that reads the help docs reads them from here, as text: the pages at
 * `/help`, search (ticket 24) and the AI guide, which answers from them and from
 * nothing else (ticket 31). So the three can never disagree about what a page says.
 *
 * Each file is imported as its text (`?raw`, which `next.config.ts` and Vite both
 * understand), so the words are bundled with whatever reads them and no server
 * reads a file at run time. A file starts with its title as `# Title`, and its
 * first paragraph is its summary.
 *
 * **No number is typed in a file.** Each is a placeholder, `{{name}}`, filled from
 * `HELP_FACTS`, which reads the constant that enforces it. A placeholder with no
 * fact throws, so a misspelt one fails the build and the tests rather than reaching
 * a pastor as braces.
 */

export const HELP_SECTIONS = [
  { key: 'start', title: 'Start here' },
  { key: 'week', title: 'Week to week' },
  { key: 'texts', title: 'Texts and settings' },
  { key: 'account', title: 'Your account' },
  { key: 'help', title: 'More help' },
] as const

export type HelpSectionKey = (typeof HELP_SECTIONS)[number]['key']

/** The files, in order, with the section each sits in. `slug` is the file's name and the page's address. */
export const HELP_SOURCES: readonly {
  readonly slug: string
  readonly section: HelpSectionKey
  readonly source: string
}[] = [
  { slug: 'getting-started', section: 'start', source: gettingStarted },
  { slug: 'test-check-in', section: 'start', source: testCheckIn },
  { slug: 'roster-and-intake', section: 'start', source: rosterAndIntake },
  { slug: 'pairing', section: 'start', source: pairing },
  { slug: 'check-ins', section: 'week', source: checkIns },
  { slug: 'overview', section: 'week', source: overview },
  { slug: 'follow-up', section: 'week', source: followUp },
  { slug: 'materials', section: 'week', source: materials },
  { slug: 'for-disciplers', section: 'week', source: forDisciplers },
  { slug: 'texting', section: 'texts', source: texting },
  { slug: 'settings', section: 'texts', source: settings },
  { slug: 'billing', section: 'account', source: billing },
  { slug: 'referrals', section: 'account', source: referrals },
  { slug: 'signing-in', section: 'account', source: signingIn },
  { slug: 'ask-discipler', section: 'help', source: askDiscipler },
  { slug: 'getting-help', section: 'help', source: gettingHelp },
  { slug: 'setup-videos', section: 'help', source: setupVideos },
]

export interface HelpHeading {
  readonly text: string
  /** The heading's anchor on its page, without the `#`. */
  readonly anchor: string
}

export interface HelpPage {
  readonly slug: string
  /** Where the page is: `/help/<slug>`. */
  readonly href: string
  readonly section: HelpSectionKey
  readonly title: string
  /** The first paragraph, as plain words: the line under the title in a list or a search result. */
  readonly summary: string
  /** The page's Markdown after its title, every placeholder filled. What the page renders and the AI guide reads. */
  readonly markdown: string
  /** Its `##` headings, in order, for a link to one part of the page. */
  readonly headings: readonly HelpHeading[]
}

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g

/** A file's words with every `{{name}}` filled. Throws on a name with no fact. */
export const fillPlaceholders = (
  source: string,
  facts: Readonly<Record<string, string>>,
  where: string,
): string =>
  source.replace(PLACEHOLDER, (_whole, name: string) => {
    const fact = Object.hasOwn(facts, name) ? facts[name] : undefined
    if (fact === undefined) throw new Error(`The help page ${where} has a placeholder with no fact: {{${name}}}`)
    return fact
  })

/** Markdown's inline marks taken off, for a summary shown as plain words. */
const plainWords = (markdown: string): string =>
  markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** One file, read into a page. Exported for the tests, which read pages built from other facts. */
export const readHelpPage = (
  { slug, section, source }: (typeof HELP_SOURCES)[number],
  facts: Readonly<Record<string, string>> = HELP_FACTS,
): HelpPage => {
  const filled = fillPlaceholders(source, facts, slug)
  const title = /^# (.+)\n/.exec(filled)?.[1]?.trim()
  if (!title) throw new Error(`The help page ${slug} does not start with its title as "# Title"`)

  const markdown = filled.slice(filled.indexOf('\n') + 1).trim()
  const summary = plainWords(markdown.split(/\n\s*\n/)[0] ?? '')
  const headings = [...markdown.matchAll(/^## (.+)$/gm)].map(([, text]) => ({
    text: text!.trim(),
    anchor: headingAnchor(text!),
  }))

  return { slug, href: `/help/${slug}`, section, title, summary, markdown, headings }
}

/** Every help page, in the Help center's order. */
export const HELP_PAGES: readonly HelpPage[] = HELP_SOURCES.map((source) => readHelpPage(source))

export const helpPage = (slug: string): HelpPage | null =>
  HELP_PAGES.find((page) => page.slug === slug) ?? null

/**
 * The whole Help center as one text, page after page, each headed by its title
 * and its address. What the AI guide is given to answer from (ticket 31), so an
 * answer can end with the address of the page it came from.
 */
export const helpCenterAsText = (): string =>
  HELP_PAGES.map((page) => `# ${page.title}\nAddress: ${page.href}\n\n${page.markdown}`).join('\n\n---\n\n')
