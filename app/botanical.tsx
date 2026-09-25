'use client'

import { useLayoutEffect, useState } from 'react'

/**
 * The watercolour behind sign-in and the Admin surface (`.botanical-frame` in
 * `public/discipler.css`, painted by `scripts/botanical/compose.mjs`). Three Admin
 * tabs wear one each and the other three wear none (`ADMIN_TABS` in `./shell`).
 */
export type BotanicalDesign = 'blossom' | 'tulips' | 'trees'

/**
 * The painting on screen, or `null` for none, kept across client-side navigations:
 * every tab is its own route, so the frame is a new component on each, and this is
 * how the new one knows what it replaces. `undefined` until the first page has
 * drawn, which is what a full page load starts from.
 */
let onScreen: BotanicalDesign | null | undefined

/**
 * One layer of painting, fixed to the window behind everything. The server renders
 * it, so without script every page still wears its painting.
 *
 * With script, reached by pressing a tab whose painting differs from the one on
 * screen, the old painting is drawn once more and drifts out past the window's
 * edges while the new one drifts in; to or from a tab with none, only the one that
 * exists moves. The cards and the text never move. A full page load, and a window
 * set to reduce motion, just shows the painting.
 */
export const BotanicalFrame = ({ design }: { readonly design: BotanicalDesign | null }) => {
  const [leaving, setLeaving] = useState<BotanicalDesign | null>(null)
  const [arriving, setArriving] = useState(false)

  // Before the first paint, so the new painting never shows at rest and then jumps.
  useLayoutEffect(() => {
    const previous = onScreen
    onScreen = design
    if (previous === undefined || previous === design) return
    setLeaving(previous)
    setArriving(design !== null)
  }, [design])

  return (
    <>
      {leaving ? (
        <div
          aria-hidden="true"
          className="botanical-frame leaving"
          data-design={leaving}
          onAnimationEnd={() => setLeaving(null)}
        />
      ) : null}
      {design ? (
        <div
          aria-hidden="true"
          className={arriving ? 'botanical-frame arriving' : 'botanical-frame'}
          data-design={design}
          onAnimationEnd={() => setArriving(false)}
        />
      ) : null}
    </>
  )
}
