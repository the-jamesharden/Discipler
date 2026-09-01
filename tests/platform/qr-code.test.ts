import { describe, expect, it } from 'vitest'
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

const link = 'https://discipler.example/intake/9d1b0c44-2f5e-4a67-8c3d-71ea45b90f28?via=qr'

/** The grid the QR was drawn on, read back off the `viewBox`. */
const modulesAcross = (svg: string): number => {
  const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)
  if (!box) throw new Error('The QR code was drawn without a viewBox')
  expect(box[1]).toBe(box[2])
  return Number(box[1])
}

/** Every coordinate a dark module was drawn at. */
const darkCoordinates = (svg: string): readonly number[] =>
  [...svg.matchAll(/stroke="#000000" d="([^"]+)"/g)]
    .flatMap((match) => [...match[1]!.matchAll(/[ML](\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g)])
    .flatMap((point) => [Number(point[1]), Number(point[2])])

describe('the QR code Discipler draws', () => {
  it('is an SVG that scales, so one code serves a screen and a printed page', async () => {
    const svg = await renderQrCode(link)

    expect(svg.startsWith('<svg')).toBe(true)
    // A viewBox and nothing raster: the same file is read off a laptop at the front
    // of a room and printed at whatever size the paper is.
    expect(modulesAcross(svg)).toBeGreaterThan(0)
  })

  it('keeps a quiet zone on every side, which is what lets a phone find it', async () => {
    const svg = await renderQrCode(link)
    const size = modulesAcross(svg)
    const coordinates = darkCoordinates(svg)

    expect(coordinates.length).toBeGreaterThan(0)
    for (const coordinate of coordinates) {
      expect(coordinate).toBeGreaterThanOrEqual(QUIET_ZONE_MODULES)
      expect(coordinate).toBeLessThanOrEqual(size - QUIET_ZONE_MODULES)
    }
  })

  it('is dark on light in its own right, and never in the theme’s colours', async () => {
    const svg = await renderQrCode(link)

    // Every other surface in Discipler inherits `color-scheme: light dark`. A code
    // that inherited it would invert in dark mode, and an inverted QR code is one
    // most phones will not read.
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).toContain('stroke="#000000"')
    expect(svg).not.toContain('currentColor')
    expect(svg).not.toContain('var(--')
  })

  it('has a size of its own, which is what it is printed at as a file', async () => {
    const svg = await renderQrCode(link)

    // Not the size it appears at on a page -- a page says that for itself. This is
    // the size the file has when nothing else has an opinion, which is the case when
    // an Admin opens it on its own and prints it.
    const width = /width="(\d+)"/.exec(svg)
    expect(width).not.toBeNull()
    expect(Number(width![1])).toBeGreaterThanOrEqual(512)
  })

  it('draws a different code for a different Ministry', async () => {
    // The Ministry is in the link, so two Ministries that got the same square would
    // be one Ministry's people landing on another's Intake form.
    const mine = await renderQrCode(link)
    const theirs = await renderQrCode(link.replace('9d1b0c44', '11110000'))

    expect(theirs).not.toBe(mine)
  })

  it('draws the same code twice for the same link', async () => {
    expect(await renderQrCode(link)).toBe(await renderQrCode(link))
  })
})
