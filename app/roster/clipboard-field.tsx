'use client'

import { useRef, useState } from 'react'

/**
 * A read-only field with a button that puts its contents on the clipboard.
 *
 * The one thing in Discipler that runs in the browser, and it is here because there
 * is no way to put something on a clipboard without script. It is written so the
 * script is the improvement and never the mechanism: the field is rendered on the
 * server and is a real field, so an Admin whose browser never runs this selects the
 * text and copies it exactly as they did before the button existed.
 *
 * Not named `copy`: in `./copy.ts` and everywhere else in this repo that word means
 * wording, and this file is about a clipboard.
 */

/**
 * How long the confirmation stays up. Long enough to read, short enough that a
 * second copy is not mistaken for the first still being acknowledged.
 */
const CONFIRMATION_MS = 2000

export const ClipboardField = ({
  id,
  value,
}: {
  readonly id: string
  readonly value: string
}) => {
  const field = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  const putOnClipboard = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), CONFIRMATION_MS)
    } catch {
      // Clipboard access can be refused -- an insecure origin, or a browser setting
      // -- and there is no recovery from that on this page. Selecting the field
      // leaves the Admin one keystroke from the same result, which is where they
      // were before the button existed.
      field.current?.select()
    }
  }

  return (
    <div className="copyable">
      <input id={id} ref={field} type="text" readOnly value={value} />
      <button type="button" onClick={putOnClipboard}>
        Copy
      </button>
      {/* Empty until it is not, so a screen reader announces the confirmation when
          it arrives rather than reading a blank one on load. */}
      <span className="copied" role="status">
        {copied ? 'Copied.' : ''}
      </span>
    </div>
  )
}
