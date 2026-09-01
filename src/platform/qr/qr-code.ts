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

export const renderQrCode = (text: string): Promise<string> =>
  QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: ERROR_CORRECTION,
    margin: QUIET_ZONE_MODULES,
    width: INTRINSIC_WIDTH,
    color: { dark: DARK, light: LIGHT },
  })
