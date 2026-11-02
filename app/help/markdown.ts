import MarkdownIt from 'markdown-it'

/**
 * Markdown to HTML for the help pages, with raw HTML off.
 *
 * `html: false` is markdown-it's default and is written out anyway, because it is
 * the whole of what makes the output safe to put into a page: a `<script>` in the
 * Markdown comes out as the text `&lt;script&gt;`, never as a tag. markdown-it also
 * refuses `javascript:`, `vbscript:`, `file:` and `data:` links by itself. The help
 * pages are the repo's own words, so this guards against a slip rather than an
 * attacker; ticket 31 renders words it did not write and turns images off as well.
 *
 * No linkify and no typographer: a page says exactly what its file says, and a bare
 * address in it is a link only where the file made it one.
 */
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false })

/**
 * The anchor a heading is linked by: `## When nobody answers` is
 * `#when-nobody-answers`. So a reply from the AI guide, or a search result, can
 * point at the part of a page it came from, not only the page.
 */
export const headingAnchor = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

markdown.core.ruler.push('heading_anchors', (state) => {
  state.tokens.forEach((token, index) => {
    if (token.type !== 'heading_open') return
    const inline = state.tokens[index + 1]
    if (inline?.type === 'inline') token.attrSet('id', headingAnchor(inline.content))
  })
})

export const renderMarkdown = (source: string): string => markdown.render(source)
