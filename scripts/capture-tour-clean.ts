/**
 * What the capture keeps of a page, on its own so a test can hold it to what the tour
 * promises: nothing on the tour's pages can be clicked, or reach anything.
 */

export const EXAMPLE_LINK_HOST = 'https://app.trydiscipler.com'
export const EXAMPLE_SHORT_NAME = 'example-ministry'
export const CHROME_PATH_DEFAULT = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** The piece of a page from its opening tag to the matching close, counting nested ones. */
const element = (html: string, opening: RegExp, tag: string): string => {
  const start = html.search(opening)
  if (start === -1) throw new Error(`The page has nothing matching ${opening}`)
  const tags = new RegExp(`<${tag}\\b|</${tag}>`, 'g')
  tags.lastIndex = start
  let depth = 0
  for (let found = tags.exec(html); found; found = tags.exec(html)) {
    depth += found[0].startsWith('</') ? -1 : 1
    if (depth === 0) return html.slice(start, found.index + found[0].length)
  }
  throw new Error(`The page never closes what ${opening} opens`)
}

/**
 * The page with everything that could do something taken out: no script, no address, no
 * form that goes anywhere, and the church's address as the live one. The tour's camera is
 * `inert` as well, so this is what would reach a viewer if that ever went missing.
 */
export const cleanCapture = (html: string, shortName: string): string =>
  html
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/g, EXAMPLE_LINK_HOST)
    .replace(/(?:localhost|127\.0\.0\.1)(?::\d+)?/g, new URL(EXAMPLE_LINK_HOST).host)
    .replaceAll(shortName, EXAMPLE_SHORT_NAME)
    .replace(/\s(?:action|formaction|target|rel|download)="[^"]*"/gi, '')
    .replace(/\shref="(?!#)[^"]*"/g, ' href="#"')

/** The Intake forms page with each QR square replaced, in the order the tiles draw them. */
export const withQrSquares = (html: string, squares: readonly string[]): string => {
  let next = 0
  return html.replace(/(<img[^>]*class="qr"[^>]*src=")[^"]*"/g, (_found, before: string) => {
    const square = squares[next++]
    if (square === undefined) throw new Error('The Intake forms page draws more QR codes than the capture made')
    return `${before}data:image/svg+xml;charset=utf-8,${encodeURIComponent(square)}"`
  })
}

export const TOUR_PANES = ['overview', 'roster', 'checkins', 'followup', 'intake'] as const

/** The tour's pages, as one shell and the five panes it moves between. */
export const tourPageOf = ({
  overview,
  roster,
  pairing,
  checkIns,
  followUp,
  intake,
}: Readonly<Record<'overview' | 'roster' | 'pairing' | 'checkIns' | 'followUp' | 'intake', string>>) => {
  const mainOf = (html: string) => element(html, /<main\b/, 'main')
  const pane = (name: string, html: string, hidden: boolean) =>
    mainOf(html)
      .replace(/<main\b[^>]*>/, `<div class="tour-pane" data-pane="${name}"${hidden ? ' hidden' : ''}>`)
      .replace(/<\/main>$/, '</div>')
  // Not the What's new or office hours cards, which are about this week and not this church.
  const overviewPane = pane('overview', overview, false)
  const plainOverview = overviewPane.includes('class="news-row"')
    ? overviewPane.replace(element(overviewPane, /<div class="news-row"/, 'div'), '')
    : overviewPane

  // The Roster with its Import dialog left out, which is not part of any step.
  const rosterPane = pane('roster', roster, true)
  const plainRoster = rosterPane.includes('class="modal-bg"')
    ? rosterPane.replace(/<div[^>]*class="modal-bg"[^>]*>[\s\S]*$/, (rest) => {
        const dialog = element(rest, /<div[^>]*class="modal-bg"/, 'div')
        return rest.replace(dialog, '')
      })
    : rosterPane

  const shell =
    element(overview, /<header class="header"/, 'header') + element(overview, /<nav aria-label="Admin surfaces"/, 'nav')

  return {
    overview: plainOverview,
    shell,
    panes:
      plainOverview +
      plainRoster +
      pane('checkins', checkIns, true) +
      pane('followup', followUp, true) +
      pane('intake', intake, true),
    pairModal: element(pairing, /<div class="modal-bg open"[^>]*aria-labelledby="pair-title"/, 'div').replace(
      'class="modal-bg open"',
      'class="modal-bg" id="tour-pair"',
    ),
  }
}
