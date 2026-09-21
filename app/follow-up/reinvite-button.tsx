'use client'

import { useRef, useState, type FormEvent } from 'react'

/**
 * **Copy link to re-invite leader** (Manual pairing, recut ticket 06).
 *
 * A real form, so with no script it posts and the route answers with a page
 * holding the link. With script the same route is asked for the link as JSON and
 * it goes on the clipboard, which nothing but script can do; the link is never
 * put in an address either way.
 *
 * Its words arrive as props. `./copy` is the server's, and reading it from here
 * would carry every sentence on the tab into the browser.
 */
export const ReinviteButton = ({
  relationshipId,
  personId,
  label,
  copied,
  copyByHand,
}: {
  readonly relationshipId: string
  readonly personId: string
  readonly label: string
  /** Said once the link is on the clipboard. */
  readonly copied: string
  /** Said above the link itself, where the browser refused the clipboard. */
  readonly copyByHand: string
}) => {
  const field = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ readonly text: string; readonly link?: string } | null>(null)

  const reinvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setSaid(null)

    const asked = fetch('/follow-up/reinvite', {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: new FormData(event.currentTarget),
    }).then(async (response) => {
      const answer = (await response.json()) as { link?: string; error?: string }
      if (!response.ok || !answer.link) throw new Error(answer.error ?? 'That could not be done.')
      return answer.link
    })

    try {
      // Handed to the clipboard as a promise, inside the press itself. Safari
      // lets a page write only while the press is still being handled, and by
      // the time the link has come back it no longer is.
      let written = false
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/plain': asked.then((link) => new Blob([link], { type: 'text/plain' })),
            }),
          ])
          written = true
        } catch {
          // Refused, or a browser whose ClipboardItem takes no promise. The plain
          // write below is tried before anything is said.
        }
      }

      const link = await asked
      if (!written) {
        try {
          await navigator.clipboard.writeText(link)
          written = true
        } catch {
          // An insecure origin, or a browser setting. The link is shown instead,
          // selected, which leaves the Admin one keystroke from the same result.
        }
      }

      setSaid(written ? { text: copied } : { text: copyByHand, link })
      if (!written) window.setTimeout(() => field.current?.select(), 0)
    } catch (error) {
      setSaid({ text: error instanceof Error ? error.message : 'That could not be done.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form method="post" action="/follow-up/reinvite" onSubmit={reinvite}>
        <input type="hidden" name="relationshipId" value={relationshipId} />
        <input type="hidden" name="personId" value={personId} />
        <button type="submit" className="fu-btn" disabled={busy}>
          {label}
        </button>
      </form>
      {/* Empty until it is not, so a screen reader announces it when it arrives. */}
      <p className="fu-reveal fu-copied" role="status" hidden={said === null}>
        {said?.text}
        {said?.link ? (
          <input ref={field} type="text" readOnly value={said.link} aria-label="The invitation link" />
        ) : null}
      </p>
    </>
  )
}
