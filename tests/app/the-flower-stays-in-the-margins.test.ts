import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

/**
 * The watercolour behind sign-in and the Admin tabs (`public/botanical/`, painted by
 * `scripts/botanical/compose.mjs`). Pastor feedback, ticket 01: the painting frames
 * the content and never sits behind it, so Blossom keeps its two corner sprays and
 * loses the vine that ran between them across the middle of the window.
 *
 * The stylesheet keeps the content column clear whatever the painting holds; this
 * is the painting's own half of the rule, for every design at every window shape.
 */
const DIR = fileURLToPath(new URL('../../public/botanical/', import.meta.url))
const PAPER = [0xf5, 0xf1, 0xeb] // --bg, which every composition is painted onto

const files = readdirSync(DIR).filter((file) => file.endsWith('.webp'))

describe('the flower stays in the margins', () => {
  it('has a painting for every design at every window shape', () => {
    for (const design of ['blossom', 'tulips', 'trees'])
      expect(files.filter((file) => file.startsWith(`${design}-`))).toHaveLength(8)
  })

  // The middle of the window, between the sprays at every shape from a phone on end
  // to an ultrawide: where the vine ran, and where the content column always is.
  it.each(files)('%s is bare paper across the middle', async (file) => {
    const { data, info } = await sharp(DIR + file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const { width: W, height: H } = info
    let painted = 0
    for (let y = Math.round(0.2 * H); y < 0.42 * H; y++)
      for (let x = Math.round(0.3 * W); x < 0.7 * W; x++) {
        const i = (y * W + x) * 3
        if ([0, 1, 2].some((c) => Math.abs(data[i + c]! - PAPER[c]!) > 3)) painted++
      }
    expect(painted).toBe(0)
  })
})
