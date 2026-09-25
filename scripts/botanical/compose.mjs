/**
 * Paints `public/botanical/blossom-*.webp`, the frame behind sign-in and the Admin
 * surface (`.botanical` in `public/discipler.css`), from `blossom.webp` beside this
 * script: the Blossom painting chosen on 2026-09-24, its two corner sprays joined by
 * a vine strung from pieces of the same painting. Run it after changing anything
 * here, and look at the pages before committing what it writes:
 *
 *   node scripts/botanical/compose.mjs
 *
 * `sharp` comes with Next and is not a dependency of its own; this script is the
 * only thing outside Next that uses it.
 */
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = (name) => fileURLToPath(new URL(name, import.meta.url))
const OUT = fileURLToPath(new URL('../../public/botanical/', import.meta.url))

// The pieces of the Blossom painting the vine is strung from: a crop of the source
// [x, y, w, h]; an oval that keeps the piece and lets the rest fall to paper
// [cx, cy, rx, ry, degrees]; where its own stem starts [x, y] and which way it grows
// from there (degrees, y down), all in crop pixels. A flower has no stem of its own.
const SPRITES = {
  sprigRight: { crop: [850, 855, 198, 95], oval: [99, 47, 104, 52, 0], base: [6, 84], grows: -15 },
  sprigUp: { crop: [592, 728, 158, 100], oval: [79, 50, 84, 56, 0], base: [10, 96], grows: -50 },
  bigLeaf: { crop: [688, 788, 167, 160], oval: [84, 80, 120, 40, -44], base: [12, 150], grows: -44 },
  leafA: { crop: [192, 428, 124, 144], oval: [58, 70, 100, 36, -48], base: [4, 138], grows: -48 },
  leafB: { crop: [228, 645, 154, 107], oval: [74, 54, 98, 32, -32], base: [3, 101], grows: -32 },
  flower: { crop: [22, 636, 204, 206], oval: [102, 104, 96, 96, 0] },
  sprigTall: { crop: [60, 268, 190, 187], oval: [95, 93, 98, 98, 0], base: [92, 184], grows: -90 },
  hangBuds: { crop: [1712, 50, 88, 165], oval: [44, 82, 48, 86, 0], base: [38, 2], grows: 90 },
}


// The Blossom frame with a vine between its corners, composed as watercolour: every
// layer is the painting divided by its paper (so paper is white) and multiplied in,
// and the whole is multiplied onto --bg at the end, so the paper vanishes and
// overlaps darken the way washes do.
const BG = [0xf5, 0xf1, 0xeb]
const src = await sharp(here('blossom.webp')).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const SW = src.info.width
const PAPER = [0, 1, 2].map((c) => src.data[(485 * SW + 1000) * 3 + c])
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// A crop of the painting as a multiply layer, with `keep(x, y)` in [0, 1] saying how
// much of each pixel stays (the rest goes to white).
const layerFrom = (left, top, w, h, keep) => {
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
const toImage = (buf, w, h) => sharp(buf, { raw: { width: w, height: h, channels: 3 } })

const compose = async ({ W, H, sprays, stem, sprites, stemScale, file }) => {
  const M = new Float32Array(W * H * 3).fill(1)
  const V = new Float32Array(W * H * 3).fill(1)
  const place = (into, buf, w, h, left, top) => {
    for (let y = 0; y < h; y++) {
      const Y = top + y; if (Y < 0 || Y >= H) continue
      for (let x = 0; x < w; x++) {
        const X = left + x; if (X < 0 || X >= W) continue
        const i = (Y * W + X) * 3, j = (y * w + x) * 3
        for (let c = 0; c < 3; c++) into[i + c] *= buf[j + c] / 255
      }
    }
  }

  // The two corner sprays, faded to paper on the sides that face the page.
  for (const { crop: [l, t, w, h], fade, scale, at } of sprays) {
    const ramp = (d, n) => (n ? smooth(0, n, d) : 1)
    const buf = layerFrom(l, t, w, h, (x, y) => ramp(x, fade.left) * ramp(w - 1 - x, fade.right) * ramp(y, fade.top) * ramp(h - 1 - y, fade.bottom))
    const rw = Math.round(w * scale), rh = Math.round(h * scale)
    const r = await toImage(buf, w, h).resize(rw, rh).raw().toBuffer()
    place(M, r, rw, rh, at[0], at[1])
  }

  // The stem: a cubic that wanders a little, a paler bleed under a darker core, and
  // a fine tendril winding round it.
  const [p0, p1, p2, p3] = stem
  const cubic = (t) => [0, 1].map((k) => (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * p1[k] + 3 * (1 - t) * t * t * p2[k] + t ** 3 * p3[k])
  const tangent = (t) => { const a = cubic(Math.max(0, t - 0.002)), b = cubic(Math.min(1, t + 0.002)); const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy); return [dx / n, dy / n] }
  const wander = (t) => (5 * Math.sin(t * 19) + 3 * Math.sin(t * 7 + 1)) * stemScale * Math.sin(Math.PI * t)
  const bez = (t) => { const [x, y] = cubic(t), [tx, ty] = tangent(t), w = wander(t); return [x - ty * w, y + tx * w] }
  const ribbon = (at, width) => {
    const N = 240, left = [], right = []
    for (let i = 0; i <= N; i++) {
      const t = i / N, [x, y] = at(t), [tx, ty] = tangent(t), w = width(t) / 2
      left.push(`${(x - ty * w).toFixed(1)},${(y + tx * w).toFixed(1)}`)
      right.unshift(`${(x + ty * w).toFixed(1)},${(y - tx * w).toFixed(1)}`)
    }
    return `M${left.join(' L')} L${right.join(' L')} Z`
  }
  const taper = (w) => (t) => w * stemScale * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.88)))
  const tendril = (t) => { const [x, y] = bez(t), [tx, ty] = tangent(t), a = 11 * stemScale * Math.sin(t * 38); return [x - ty * a, y + tx * a] }
  // A flower sits at the end of a short curved stalk of its own.
  const stalks = sprites.filter((s) => s.name === 'flower').map(({ t, side, reach }) => {
    const [x, y] = bez(t), [tx, ty] = tangent(t), n = [-ty * side, tx * side], r = reach * stemScale
    const ex = x + n[0] * r - tx * r * 0.4, ey = y + n[1] * r - ty * r * 0.4
    return `<path d="M${x.toFixed(1)},${y.toFixed(1)} Q${(x + n[0] * r * 0.2 - tx * r * 0.5).toFixed(1)},${(y + n[1] * r * 0.2 - ty * r * 0.5).toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}" fill="none" stroke="#7c6f3e" stroke-opacity="0.85" stroke-width="${(3 * stemScale).toFixed(1)}" stroke-linecap="round"/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>
    <path d="${ribbon(bez, taper(10))}" fill="#b49a62" fill-opacity="0.35"/>
    <path d="${ribbon(bez, taper(5))}" fill="#75693a" fill-opacity="0.85"/>
    <path d="${ribbon(tendril, taper(2))}" fill="#8f8048" fill-opacity="0.6"/>
    ${stalks}</svg>`
  const stemBuf = await sharp(Buffer.from(svg)).removeAlpha().blur(0.8).raw().toBuffer()
  place(V, stemBuf, W, H, 0, 0)

  // The pieces, each grown from the vine at its own stem, leaning the way the vine
  // grows (bottom left to top right) and out to one side.
  for (const { name, t, side, scale, lean = 45, reach = 0 } of sprites) {
    const sp = SPRITES[name]
    const { crop: [l, tp, w, h], oval: [cx, cy, rx, ry, deg] } = sp
    const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a)
    const buf = layerFrom(l, tp, w, h, (x, y) => {
      const u = ((x - cx) * cos + (y - cy) * sin) / rx, v = (-(x - cx) * sin + (y - cy) * cos) / ry
      return 1 - smooth(0.8, 1.05, Math.hypot(u, v))
    })
    const sw = Math.round(w * scale * stemScale), sh = Math.round(h * scale * stemScale)
    const [x, y] = bez(t), [tx, ty] = tangent(t)
    let rotate, base, flip = false
    if (sp.base) {
      // Up the vine is minus the tangent; lean out to `side`.
      const up = (Math.atan2(-ty, -tx) * 180) / Math.PI
      let want = name === 'hangBuds' ? 90 + 20 * side : up + lean * side
      let grows = sp.grows, bx = sp.base[0]
      // A piece that would come out upside down is mirrored instead.
      const turn = ((want - grows + 540) % 360) - 180
      if (Math.abs(turn) > 100 && name !== 'hangBuds') { flip = true; grows = 180 - grows; bx = w - bx }
      rotate = want - grows
      base = [bx * scale * stemScale, sp.base[1] * scale * stemScale]
    } else {
      rotate = 25 * side
      base = null
    }
    let img = toImage(buf, w, h)
    if (flip) img = img.flop()
    const { data, info } = await sharp(await img.resize(sw, sh).png().toBuffer()).rotate(rotate, { background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let left, top
    if (base) {
      const r = (rotate * Math.PI) / 180, bx = base[0] - sw / 2, by = base[1] - sh / 2
      const px = bx * Math.cos(r) - by * Math.sin(r) + info.width / 2, py = bx * Math.sin(r) + by * Math.cos(r) + info.height / 2
      left = Math.round(x - px); top = Math.round(y - py)
    } else {
      const n = [-ty * side, tx * side], rr = reach * stemScale
      left = Math.round(x + n[0] * rr - tx * rr * 0.4 - info.width / 2); top = Math.round(y + n[1] * rr - ty * rr * 0.4 - info.height / 2)
    }
    place(V, data, info.width, info.height, left, top)
  }

  // The vine is fainter than the sprays it joins.
  const out = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H * 3; i++) {
    const v = 1 - 0.8 * (1 - V[i])
    out[i] = Math.round(BG[i % 3] * M[i] * v)
  }
  const info = await toImage(out, W, H).webp({ quality: 80, effort: 6 }).toFile(OUT + file)
  console.log(file, W, H, Math.round(info.size / 1024) + ' KB')
}

const hang = () => [
  { name: 'hangBuds', t: 0.05, side: 1, scale: 0.9 },
  { name: 'leafB', t: 0.11, side: 1, scale: 0.8 },
  { name: 'leafA', t: 0.17, side: -1, scale: 0.85 },
  { name: 'sprigRight', t: 0.25, side: 1, scale: 0.75, lean: 35 },
  { name: 'leafA', t: 0.32, side: 1, scale: 0.75 },
  { name: 'flower', t: 0.39, side: -1, scale: 0.55, reach: 70 },
  { name: 'leafB', t: 0.46, side: 1, scale: 0.85 },
  { name: 'bigLeaf', t: 0.53, side: -1, scale: 0.65 },
  { name: 'sprigUp', t: 0.6, side: 1, scale: 0.75, lean: 30 },
  { name: 'leafA', t: 0.66, side: -1, scale: 0.8 },
  { name: 'sprigTall', t: 0.72, side: 1, scale: 0.6, lean: 20 },
  { name: 'leafB', t: 0.79, side: -1, scale: 0.8 },
  { name: 'flower', t: 0.85, side: 1, scale: 0.45, reach: 55 },
  { name: 'leafA', t: 0.91, side: -1, scale: 0.75 },
]

// One composition per window shape, from a phone on end (0.46) to an ultrawide
// (2.2), each drawn with `cover`. Sizes follow the window's short side; the stem's
// handles lie along the long one, so the vine sweeps across a wide window and down a
// tall one.
const lerp = (a, b, t) => a + (b - a) * t
for (const aspect of [0.46, 0.6, 0.75, 1, 1.33, 1.6, 1.78, 2.2]) {
  const W = aspect >= 1 ? 2560 : Math.round(2560 * aspect), H = aspect >= 1 ? Math.round(2560 / aspect) : 2560
  const t = Math.min(1, Math.max(0, (aspect - 0.46) / (1.78 - 0.46)))
  const Tw = Math.round(Math.min(0.8 * W, 0.76 * H)), Ts = Tw / 960
  const Bw = Math.round(Math.min(1.0 * W, 0.83 * H)), Bs = Bw / 1070, Bh = Math.round(720 * Bs)
  const start = [W - Tw + 260 * Ts, 40 * Ts], end = [598 * Bs, H - Bh + 635 * Bs]
  const p1 = [start[0] - lerp(0.29, 0.16, t) * W, start[1] + lerp(0.3, 0.07, t) * H]
  const p2 = [end[0] + lerp(0.34, 0.19, t) * W, end[1] - lerp(0.33, 0.03, t) * H]
  await compose({
    W, H, file: `blossom-${String(aspect).replace('.', '')}.webp`, stemScale: lerp(1.5, 1, t) * Math.min(W, H) / lerp(1182, 1440, t),
    sprays: [
      { crop: [1040, 0, 960, 250], fade: { left: 80, bottom: 50 }, scale: Ts, at: [W - Tw, 0] },
      { crop: [0, 250, 1070, 720], fade: { top: 60, right: 80 }, scale: Bs, at: [0, H - Bh] },
    ],
    stem: [start, p1, p2, end].map(([x, y]) => [Math.round(x), Math.round(y)]),
    sprites: hang(),
  })
}
