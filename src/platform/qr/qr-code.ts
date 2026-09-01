import QRCode from 'qrcode'

/**
 * The one QR code Discipler draws: the Ministry's Intake link, in a square a room
 * can scan off a screen or off a printed page.
 *
 * A vendor rather than an encoder of our own. A QR code that does not scan fails
 * silently in the one place nobody can debug it -- in front of a room, on somebody
 * else's phone -- and the bit-level correctness of Reed-Solomon and mask selection
 * is not product logic. What is ours, and what this module is for, is everything
 * that decides whether the square survives being printed.
 */

/**
 * The blank border, in modules. Four is the specification's minimum and the
 * threshold below which readers start failing to locate the code at all, which is
 * exactly the failure that shows up on paper and not on a screen.
 */
export const QUIET_ZONE_MODULES = 4

/**
 * The intrinsic size in CSS pixels. The SVG scales, so this decides nothing about how
 * large the code appears where a page has said -- it is the size the file has on its
 * own, which is what a browser prints when the code is opened as a file and put on
 * paper for a room.
 */
const INTRINSIC_WIDTH = 640

/**
 * Error correction. `Q` recovers a quarter of the code, which is what a printed page
 * that gets folded, scuffed, or photographed at an angle needs. The link is short
 * enough that the extra correction costs a small grid rather than a dense one.
 */
const ERROR_CORRECTION = 'Q'

/**
 * Black on white, stated rather than inherited. Every other surface here runs under
 * `color-scheme: light dark`, and a code that took its colours from the page would
 * invert in dark mode -- which most phones will not read.
 */
const DARK = '#000000'
const LIGHT = '#ffffff'

/**
 * The caption band below the square, in modules, and the type set in it.
 *
 * Measured in modules rather than in pixels so the caption scales with the code:
 * the SVG has no fixed size on a page, and a caption sized in pixels would be
 * unreadable on a poster and enormous on a screen.
 *
 * The band sits entirely below the code's own quiet zone, which the encoder has
 * already drawn inside the square. Nothing here is allowed to encroach on it --
 * four modules of white is the threshold below which readers stop locating a code
 * at all, and that failure shows up on paper and not on a screen.
 */
const CAPTION_BAND_MODULES = 5
const CAPTION_TYPE_MODULES = 2.2
const CAPTION_BASELINE_MODULES = 3.4

/**
 * What one character costs, as a fraction of the type size, and how much of the
 * square's width the caption may take.
 *
 * Rough on purpose: an SVG has no way to measure text before it draws it, and this
 * only has to keep a long Ministry name inside the page. A caption that overflows
 * is clipped by the viewBox on both sides at once, which loses the beginning and
 * the end of exactly the name the label existed to say.
 */
const AVERAGE_GLYPH_WIDTH = 0.55
const CAPTION_WIDTH_SHARE = 0.94

/** The type size this caption fits in, never larger than the one it prefers. */
const captionTypeSize = (caption: string, modules: number): number =>
  Math.min(
    CAPTION_TYPE_MODULES,
    (modules * CAPTION_WIDTH_SHARE) / Math.max(caption.length * AVERAGE_GLYPH_WIDTH, 1),
  )

/** The five characters that cannot appear literally in XML text. */
const escapeXml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]
      ?? character,
  )

/**
 * One QR code, captioned with what it opens.
 *
 * The caption is not decoration and the parameter is not optional. A Ministry hands
 * out more than one link, each with its own square, and *which code did I print* is
 * a question the consent records are later read for -- an Admin holding two
 * unlabelled squares cannot answer it, and neither can the room they printed one
 * for. A third code added later cannot ship unlabelled by omission.
 *
 * Drawn by extending the encoder's own viewBox downwards rather than by wrapping
 * the file in HTML, because this is opened and printed as a file: whatever the
 * caption is not part of, an Admin does not print.
 */
export const renderQrCode = async (text: string, caption: string): Promise<string> => {
  const square = await QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: ERROR_CORRECTION,
    margin: QUIET_ZONE_MODULES,
    width: INTRINSIC_WIDTH,
    color: { dark: DARK, light: LIGHT },
  })

  // The encoder's grid, in modules. Read off the file it produced rather than
  // computed here: how many modules a link needs depends on its length and on the
  // error correction, and a second calculation of it would eventually disagree.
  const modules = Number(/viewBox="0 0 (\d+) \d+"/.exec(square)?.[1])
  const drawing = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(square)?.[1]
  if (!Number.isInteger(modules) || drawing === undefined) {
    throw new Error('The QR encoder returned an SVG this module cannot caption')
  }

  const height = modules + CAPTION_BAND_MODULES

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${INTRINSIC_WIDTH}" `
    + `height="${Math.round((INTRINSIC_WIDTH * height) / modules)}" `
    + `viewBox="0 0 ${modules} ${height}">`
    // Stated rather than inherited, for the reason the code's own colours are: every
    // surface here runs under `color-scheme: light dark`, and a caption that took its
    // colours from the page would vanish into a dark background on half of them.
    + `<path fill="${LIGHT}" d="M0 0h${modules}v${height}H0z"/>`
    + `<g shape-rendering="crispEdges">${drawing}</g>`
    + `<text x="${modules / 2}" y="${modules + CAPTION_BASELINE_MODULES}" `
    + `text-anchor="middle" fill="${DARK}" `
    + 'font-family="system-ui, sans-serif" '
    + `font-size="${captionTypeSize(caption, modules).toFixed(2)}">`
    + `${escapeXml(caption)}</text>`
    + '</svg>'
  )
}
