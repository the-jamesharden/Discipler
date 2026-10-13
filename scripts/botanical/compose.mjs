/**
 * Paints `public/botanical/<design>-<shape>.webp`, the frames behind sign-in and the
 * Admin surface (`.botanical-frame` in `public/discipler.css`), from the paintings
 * beside this script. Each design is one painting: a spray in the top-right and
 * bottom-left corners (Blossom), or a strip down each side (Tulips, Trees). Only the
 * margins outside the content column show them (the frame's mask in the stylesheet),
 * so the middle of every composition is bare paper; Blossom's sprays were once joined
 * by a vine across it, which sat behind the cards (Pastor feedback 2026-10, ticket 01).
 * Run it after changing anything here, and look at the pages before committing what
 * it writes:
 *
 *   node scripts/botanical/compose.mjs           every design
 *   node scripts/botanical/compose.mjs trees     one
 *
 * `sharp` comes with Next and is not a dependency of its own; this script is the
 * only thing outside Next that uses it.
 */
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = (name) => fileURLToPath(new URL(name, import.meta.url))
const OUT = fileURLToPath(new URL('../../public/botanical/', import.meta.url))

// Every layer is the painting divided by its paper (so paper is white) and
// multiplied in, and the whole is multiplied onto --bg at the end, so the paper
// vanishes and overlaps darken the way washes do.
const BG = [0xf5, 0xf1, 0xeb]
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const lerp = (a, b, t) => a + (b - a) * t
const toImage = (buf, w, h) => sharp(buf, { raw: { width: w, height: h, channels: 3 } })

const painting = async (file) => {
  const src = await sharp(here(file)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const SW = src.info.width
  // The middle of every painting is bare paper.
  const PAPER = [0, 1, 2].map((c) => src.data[(485 * SW + 1000) * 3 + c])
  // A crop of the painting as a multiply layer, with `keep(x, y)` in [0, 1] saying
  // how much of each pixel stays (the rest goes to white).
  return (left, top, w, h, keep) => {
    const out = Buffer.alloc(w * h * 3)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = keep(x, y), s = ((top + y) * SW + left + x) * 3, o = (y * w + x) * 3
        for (let c = 0; c < 3; c++) {
          const f = Math.min(1, src.data[s + c] / PAPER[c])
          out[o + c] = Math.round(255 * (1 - k * (1 - f)))
        }
      }
    return out
  }
}

const compose = async ({ layerFrom, W, H, sprays, file }) => {
  const M = new Float32Array(W * H * 3).fill(1)
  const place = (buf, w, h, left, top) => {
    for (let y = 0; y < h; y++) {
      const Y = top + y; if (Y < 0 || Y >= H) continue
      for (let x = 0; x < w; x++) {
        const X = left + x; if (X < 0 || X >= W) continue
        const i = (Y * W + X) * 3, j = (y * w + x) * 3
        for (let c = 0; c < 3; c++) M[i + c] *= buf[j + c] / 255
      }
    }
  }

  // The sprays or strips, faded to paper on the sides that face the page.
  for (const { crop: [l, t, w, h], fade, scale, at } of sprays) {
    const ramp = (d, n) => (n ? smooth(0, n, d) : 1)
    const buf = layerFrom(l, t, w, h, (x, y) => ramp(x, fade.left) * ramp(w - 1 - x, fade.right) * ramp(y, fade.top) * ramp(h - 1 - y, fade.bottom))
    const rw = Math.round(w * scale), rh = Math.round(h * scale)
    const r = await toImage(buf, w, h).resize(rw, rh).raw().toBuffer()
    place(r, rw, rh, at[0], at[1])
  }

  const out = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H * 3; i++) out[i] = Math.round(BG[i % 3] * M[i])
  const info = await toImage(out, W, H).webp({ quality: 80, effort: 6 }).toFile(OUT + file)
  console.log(file, W, H, Math.round(info.size / 1024) + ' KB')
}

// A corner design: `tr` and `bl` are its sprays, cropped from the painting, each
// sized from the window (`width`).
const DESIGNS = {
  blossom: {
    painting: 'blossom.webp',
    tr: { crop: [1040, 0, 960, 250], fade: { left: 80, bottom: 50 }, width: (W, H) => Math.min(0.8 * W, 0.76 * H) },
    bl: { crop: [0, 250, 1070, 720], fade: { top: 60, right: 80 }, width: (W, H) => Math.min(1.0 * W, 0.83 * H) },
  },
  // Tulips (Roster) and Trees (Follow-Up) frame the sides rather than the corners:
  // each strip the window's height, no wider than a laptop's margin beside the
  // content, cut and faded on the side that faces it, so no heading has a leaf
  // behind it.
  tulips: {
    painting: 'tulips.webp',
    strips: { left: [0, 0, 320, 968], right: [1710, 0, 290, 968] },
  },
  trees: {
    painting: 'trees.webp',
    strips: { left: [0, 0, 400, 993], right: [1630, 0, 370, 993] },
  },
}

// One composition per window shape, from a phone on end (0.46) to an ultrawide
// (2.2), each drawn with `cover`. Sizes follow the window's short side.
const SHAPES = [0.46, 0.6, 0.75, 1, 1.33, 1.6, 1.78, 2.2]
const only = process.argv[2]
for (const [name, design] of Object.entries(DESIGNS)) {
  if (only && name !== only) continue
  const layerFrom = await painting(design.painting)
  for (const aspect of SHAPES) {
    const W = aspect >= 1 ? 2560 : Math.round(2560 * aspect), H = aspect >= 1 ? Math.round(2560 / aspect) : 2560
    const t = Math.min(1, Math.max(0, (aspect - 0.46) / (1.78 - 0.46)))
    const file = `${name}-${String(aspect).replace('.', '')}.webp`
    if (design.strips) {
      const { left: [ll, lt, lw, lh], right: [rl, rt, rw, rh] } = design.strips
      const scale = H / lh, keep = Math.round((lerp(0.14, 0.085, t) * W) / scale)
      await compose({
        layerFrom, W, H, file,
        sprays: [
          { crop: [ll, lt, Math.min(lw, keep), lh], fade: { right: Math.round(keep * 0.7) }, scale, at: [0, 0] },
          { crop: [rl + rw - Math.min(rw, keep), rt, Math.min(rw, keep), rh], fade: { left: Math.round(keep * 0.7) }, scale, at: [W - Math.round(Math.min(rw, keep) * scale), 0] },
        ],
      })
      continue
    }
    const { tr, bl } = design
    const Tw = Math.round(tr.width(W, H)), Ts = Tw / tr.crop[2]
    const Bw = Math.round(bl.width(W, H)), Bs = Bw / bl.crop[2], Bh = Math.round(bl.crop[3] * Bs)
    await compose({
      layerFrom, W, H, file,
      sprays: [
        { crop: tr.crop, fade: tr.fade, scale: Ts, at: [W - Tw, 0] },
        { crop: bl.crop, fade: bl.fade, scale: Bs, at: [0, H - Bh] },
      ],
    })
  }
}
