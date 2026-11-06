import MarkdownIt from 'markdown-it'
import { splitAnswerSource } from '~/domain/ask-discipler'
import { helpPage } from '../library'
import { sourceLabel } from './copy'

/**
 * A reply from the guide, made safe to draw (Exponential launch, ticket 31). The model's
 * words are text nobody vouched for, and what it may not show is enforced here rather
 * than asked of it, on every read, so a stored answer gets today's rule too.
 *
 * Raw HTML is off, and markdown-it escapes what it does not render. **An image is
 * removed, and a link stays a link only if it goes to a real Help center page.** A link
 * anywhere else keeps its words as plain text, and an address written as a link or out in
 * the words goes altogether, because its words are the address. An email address is not
 * one, and the Help center gives support@ as the way to reach a person.
 */
const replies = new MarkdownIt({ html: false, linkify: true, typographer: false }).disable(['table'])

replies.linkify.set({ fuzzyEmail: false })

type Token = ReturnType<typeof replies.parseInline>[number]

/** `/help`, or a page that exists, with or without the part of it. Nothing else, however it is spelled. */
const isHelpAddress = (href: unknown): href is string => {
  const found = typeof href === 'string' ? /^\/help(?:\/([a-z0-9-]+))?(?:#[a-z0-9-]+)?$/.exec(href) : null
  if (!found) return false
  return found[1] === undefined || helpPage(found[1]) !== null
}

const keepingOnlyHelpLinks = (tokens: readonly Token[]): Token[] => {
  const kept: Token[] = []
  // One entry per link being read: whether it stays, and whether its words go with it.
  const open: { readonly stays: boolean; readonly bare: boolean }[] = []

  for (const token of tokens) {
    if (token.type === 'image') continue

    if (token.type === 'link_open') {
      const href = token.attrGet('href')
      const stays = isHelpAddress(href)
      open.push({ stays, bare: token.markup === 'autolink' || token.markup === 'linkify' })
      if (stays) {
        // Rebuilt, so nothing but these reach the page. A new tab, so the chat stays where it is.
        token.attrs = [['href', href as string], ['target', '_blank'], ['rel', 'noopener']]
        kept.push(token)
      }
      continue
    }

    if (token.type === 'link_close') {
      if (open.pop()?.stays) kept.push(token)
      continue
    }

    const inside = open[open.length - 1]
    if (inside && !inside.stays && inside.bare) continue
    kept.push(token)
  }

  return kept
}

replies.core.ruler.push('only_help_links', (state) => {
  for (const block of state.tokens) {
    if (block.type === 'inline' && block.children) block.children = keepingOnlyHelpLinks(block.children)
  }
})

export interface GuideReply {
  readonly html: string
  /** The Help center page it came from, drawn last. Always somewhere real. */
  readonly source: { readonly label: string; readonly href: string }
}

/** The stored answer as the chat draws it. */
export const guideReply = (answer: string): GuideReply => {
  const { words, source } = splitAnswerSource(answer)
  const page = source === null ? null : helpPage(source.replace(/^\/help\/?/, ''))
  return {
    html: replies.render(words),
    source: page
      ? { label: sourceLabel(page.title), href: page.href }
      : { label: sourceLabel(null), href: '/help' },
  }
}
