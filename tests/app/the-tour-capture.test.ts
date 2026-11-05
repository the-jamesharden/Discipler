import { describe, expect, it } from 'vitest'
import { cleanCapture, tourPageOf, withQrSquares } from '../../scripts/capture-tour-clean'
import { TOUR_PAGES, TOUR_PHONE } from '../../app/overview/tour/pages.generated'
import { TOUR_STEPS } from '../../app/overview/tour/copy'

/**
 * What the tour keeps of a page (Exponential launch, ticket 27): real screens, from which
 * nothing can be clicked, and nothing reaches anywhere.
 */

const page = (main: string) =>
  `<html><script>evil()</script><!-- note --><body><div class="container"><header class="header"><h1>Example Ministry</h1><a href="/settings">Settings</a></header><nav aria-label="Admin surfaces"><a class="tab" href="/roster">Roster</a></nav><main>${main}</main></div></body></html>`

describe('cleaning a captured page', () => {
  it('takes out scripts, comments, addresses and where forms go', () => {
    const clean = cleanCapture(
      page(
        '<form action="/roster/pair" method="post"><a href="/roster/1" target="_blank" rel="x">One</a><button formAction="/x">Go</button></form>',
      ),
      'example-ministry-7',
    )
    expect(clean).not.toContain('evil')
    expect(clean).not.toContain('note')
    expect(clean).not.toContain('/roster')
    expect(clean).not.toContain('action')
    expect(clean).not.toContain('target')
  })

  it('shows the links on the live address, under the name the church goes by', () => {
    const clean = cleanCapture(
      page('<input value="http://127.0.0.1:3127/join/example-ministry-7"><code>127.0.0.1:3127/join/<b>example-ministry-7</b></code>'),
      'example-ministry-7',
    )
    expect(clean).toContain('value="https://app.trydiscipler.com/join/example-ministry"')
    expect(clean).toContain('<code>app.trydiscipler.com/join/<b>example-ministry</b></code>')
  })
})

describe('the QR codes', () => {
  it('replaces each square, in order, so they scan to the live address', () => {
    const html = withQrSquares(
      '<img class="qr" src="data:old1" alt="a"/><img class="qr" src="data:old2" alt="b"/>',
      ['<svg>1</svg>', '<svg>2</svg>'],
    )
    expect(html).not.toContain('old')
    expect(html).toContain(encodeURIComponent('<svg>1</svg>'))
    expect(html.indexOf(encodeURIComponent('<svg>1</svg>'))).toBeLessThan(html.indexOf(encodeURIComponent('<svg>2</svg>')))
  })
})

describe('putting the pages together', () => {
  const pages = (overviewMain: string, rosterMain = '<p>roster</p>') =>
    tourPageOf({
      overview: page(overviewMain),
      roster: page(rosterMain),
      pairing: page(
        '<div class="modal-bg open" role="dialog" aria-modal="true" aria-labelledby="pair-title"><div class="modal">pair</div></div>',
      ),
      checkIns: page('<p>check-ins</p>'),
      followUp: page('<p>follow-up</p>'),
      intake: page('<p>intake</p>'),
    })

  it('makes one shell, five panes with only Overview showing, and the Pair pop-up closed', () => {
    const { shell, panes, pairModal } = pages('<p>overview</p>')
    expect(shell).toContain('<h1>Example Ministry</h1>')
    expect(shell).toContain('aria-label="Admin surfaces"')
    expect(panes).toContain('<div class="tour-pane" data-pane="overview">')
    for (const name of ['roster', 'checkins', 'followup', 'intake']) {
      expect(panes).toContain(`<div class="tour-pane" data-pane="${name}" hidden>`)
    }
    expect(pairModal).toContain('id="tour-pair"')
    expect(pairModal).not.toContain('modal-bg open')
  })

  it("leaves out the news cards, which are about this week and not Example Ministry", () => {
    const { panes } = pages('<div class="news-row"><article>news</article></div><p>overview</p>')
    expect(panes).not.toContain('news')
    expect(panes).toContain('<p>overview</p>')
  })

  it("leaves out the Roster's import dialog, and keeps what follows it", () => {
    const { panes } = pages(
      '<p>overview</p>',
      '<p>roster</p><div id="import" class="modal-bg"><div class="modal">import</div></div><p>after</p>',
    )
    expect(panes).not.toContain('import')
    expect(panes).toContain('<p>after</p>')
  })
})

describe('the pages in the repo', () => {
  it('hold nothing that runs or goes anywhere', () => {
    const html = TOUR_PAGES.shell + TOUR_PAGES.panes + TOUR_PAGES.pairModal
    expect(html).toContain('Example Ministry')
    expect(html).not.toMatch(/<script\b/)
    expect(html).not.toMatch(/\saction="/)
    expect(html).not.toMatch(/href="(?!#)/)
    expect(html).not.toMatch(/localhost|127\.0\.0\.1/)
  })

  it('are not drawn behind the onboarding modal or the setup bar', () => {
    const html = TOUR_PAGES.shell + TOUR_PAGES.panes
    expect(html).not.toContain('onb-')
    expect(html).not.toContain('setup-line')
  })

  it('hold everything the steps point at', () => {
    for (const piece of ['stats-line', 'ci-col-head a', 'fu fu-open care-concern', 'form-tile', 'Copy link']) {
      expect(TOUR_PAGES.panes).toContain(piece)
    }
    expect(TOUR_PAGES.pairModal).toContain('pair-opt')
  })

  it('hold every person the steps play', () => {
    for (const name of ['Grace Lee', 'Emily Davis', 'Mark Wilson', 'Jordan Ellis']) {
      expect(TOUR_PAGES.panes).toContain(name)
    }
    expect(TOUR_PAGES.pairModal).toContain('Emily Davis')
  })

  it('hold the real texts on Mark Wilson’s phone, one each way', () => {
    expect(TOUR_PHONE).toHaveLength(5)
    expect(TOUR_PHONE[0]).toContain('Example Ministry via Discipler: Did you meet with Jordan Ellis this week?')
    expect(TOUR_PHONE[1]).toBe('1')
    expect(TOUR_PHONE[3]).toBe('A')
  })

  it('have seven steps', () => {
    expect(TOUR_STEPS).toHaveLength(7)
  })
})
