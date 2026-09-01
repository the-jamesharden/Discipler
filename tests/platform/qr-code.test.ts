import { describe, expect, it } from 'vitest'
import { ministryId } from '~/domain/ids'
import { ministryIntakeQrLink } from '~/domain/outbound-copy'
import { QUIET_ZONE_MODULES, renderQrCode } from '~/platform/qr/qr-code'

/**
 * The vendor boundary for the one QR code Discipler draws.
 *
 * What is worth asserting here is not that the encoder encodes -- that is the
 * library's job and it is the reason there is a library. It is the four things that
 * decide whether the printed square actually scans off a poster at the back of a
 * room: a quiet zone, dark-on-light regardless of the theme the page is in, a size
 * that survives paper, and a shape that scales rather than pixelates.
 */

/**
 * What this encoder is actually handed, asked of the domain rather than typed out
 * again here. `?via=qr` belongs to `outbound-copy` and is asserted there; a copy of
 * it in this file would be a second author of the one string a compliance review
 * ends up reading.
 */
const link = ministryIntakeQrLink(
  'https://discipler.example',
  ministryId('9d1b0c44-2f5e-4a67-8c3d-71ea45b90f28'),
)

/** What the caption under every square says, so the tests draw one the way a route does. */
const caption = 'Fairmount Church — Intake'

/**
 * The grid the QR was drawn on, read back off the `viewBox`.
 *
 * The viewBox is taller than it is wide, by exactly the caption band: the square
 * itself is the width, and asserting that is what keeps the caption from being
 * drawn over the code rather than under it.
 */
const modulesAcross = (svg: string): number => {
  const box = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg)
  if (!box) throw new Error('The QR code was drawn without a viewBox')
  expect(Number(box[2])).toBeGreaterThan(Number(box[1]))
  return Number(box[1])
}

/** The size the file has when nothing else has an opinion, off the `width`. */
const intrinsicWidth = (svg: string): number => {
  const found = /width="(\d+)"/.exec(svg)
  if (!found) throw new Error('The QR code was drawn without a width')
  return Number(found[1])
}

/** Every coordinate a dark module was drawn at. */
const darkCoordinates = (svg: string): readonly number[] =>
  [...svg.matchAll(/stroke="#000000" d="([^"]+)"/g)]
    .flatMap((match) => [...match[1]!.matchAll(/[ML](\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g)])
    .flatMap((point) => [Number(point[1]), Number(point[2])])

describe('the QR code Discipler draws', () => {
  it('is an SVG that scales, so one code serves a screen and a printed page', async () => {
    const svg = await renderQrCode(link, caption)

    expect(svg.startsWith('<svg')).toBe(true)
    // A viewBox and nothing raster: the same file is read off a laptop at the front
    // of a room and printed at whatever size the paper is.
    expect(modulesAcross(svg)).toBeGreaterThan(0)
  })

  it('keeps a quiet zone on every side, which is what lets a phone find it', async () => {
    const svg = await renderQrCode(link, caption)
    const size = modulesAcross(svg)
    const coordinates = darkCoordinates(svg)

    expect(coordinates.length).toBeGreaterThan(0)
    for (const coordinate of coordinates) {
      expect(coordinate).toBeGreaterThanOrEqual(QUIET_ZONE_MODULES)
      expect(coordinate).toBeLessThanOrEqual(size - QUIET_ZONE_MODULES)
    }
  })

  it('is dark on light in its own right, and never in the theme’s colours', async () => {
    const svg = await renderQrCode(link, caption)

    // Every other surface in Discipler inherits `color-scheme: light dark`. A code
    // that inherited it would invert in dark mode, and an inverted QR code is one
    // most phones will not read.
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).toContain('stroke="#000000"')
    expect(svg).not.toContain('currentColor')
    expect(svg).not.toContain('var(--')
  })

  it('has a size of its own, which is what it is printed at as a file', async () => {
    const svg = await renderQrCode(link, caption)

    // Not the size it appears at on a page -- a page says that for itself. This is
    // the size the file has when nothing else has an opinion, which is the case when
    // an Admin opens it on its own and prints it.
    expect(intrinsicWidth(svg)).toBeGreaterThanOrEqual(512)
  })

  it('draws a different code for a different Ministry', async () => {
    // The Ministry is in the link, so two Ministries that got the same square would
    // be one Ministry's people landing on another's Intake form.
    const mine = await renderQrCode(link, caption)
    const theirs = await renderQrCode(link.replace('9d1b0c44', '11110000'), caption)

    expect(theirs).not.toBe(mine)
  })

  /**
   * A Ministry hands out more than one link and each has its own square. *Which
   * code did I print* is a question the consent records are later read for, and an
   * Admin holding two unlabelled squares cannot answer it -- nor can the room one
   * of them got printed for. The label is in the file because the file is what
   * gets opened on its own and put on paper.
   */
  it('says what it opens, in the file rather than beside it', async () => {
    const svg = await renderQrCode(link, caption)

    expect(svg).toContain(caption)
    // Below the square, never over it. The dark modules stop at the width, and the
    // extra height is the band the caption is set in.
    const box = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg)!
    const baseline = /<text[^>]*\by="(\d+(?:\.\d+)?)"/.exec(svg)!
    expect(Number(baseline[1])).toBeGreaterThan(Number(box[1]))
    expect(Number(baseline[1])).toBeLessThan(Number(box[2]))
  })

  it('sets a long Ministry’s name smaller rather than off the edge of the page', async () => {
    const long = await renderQrCode(link, 'Fairmount Community Church of the Resurrection — Discipleship')
    const short = await renderQrCode(link, 'Hope — Intake')

    const typeSize = (svg: string) => Number(/<text[^>]*font-size="([\d.]+)"/.exec(svg)![1])

    // Clipped, a caption loses its beginning and its end at once -- the two halves
    // of exactly the name it existed to say.
    expect(typeSize(long)).toBeLessThan(typeSize(short))
    expect(typeSize(long)).toBeGreaterThan(0)
  })

  it('writes a Ministry’s own name into XML rather than into the middle of the file', async () => {
    // Ministry names are typed by people and this one is a file we hand a browser.
    // An unescaped ampersand is not a security question here so much as a square
    // that stops rendering at all, on the one surface that gets printed.
    const svg = await renderQrCode(link, 'Faith & Hope <Church>')

    expect(svg).toContain('Faith &amp; Hope &lt;Church&gt;')
    expect(svg).not.toContain('<Church>')
  })

  it('draws the same code twice for the same link', async () => {
    expect(await renderQrCode(link, caption)).toBe(await renderQrCode(link, caption))
  })
})
