'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { referralLinkCopied } from '~/domain/referrals'
import { CopyPages, Tick } from '../icons'
import { REFER, referralNote } from './copy'

/** How long Copy reads "Copied", and how long a new link glows. */
const COPIED_MS = 1800
const FRESH_MS = 900

/**
 * For a browser that refuses the clipboard's own call: a page not served over https, or a
 * permission said no. Answers whether the words went.
 */
const copiedTheOldWay = (words: string): boolean => {
  const scratch = document.createElement('textarea')
  scratch.value = words
  scratch.setAttribute('readonly', '')
  scratch.style.position = 'fixed'
  scratch.style.opacity = '0'
  document.body.append(scratch)
  scratch.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    scratch.remove()
  }
}

/**
 * The link, the one Copy button and "Get a new link".
 *
 * "Get a new link" is a form, so that it works with no script at all, reloading the page.
 * With one it replaces the link in place, at once and with no question. Copy needs a
 * script, as a clipboard does, and says "Copied" only once the words have gone.
 */
export const YourLink = ({
  church,
  initialLink,
}: {
  readonly church: string
  readonly initialLink: string
}) => {
  const [link, setLink] = useState(initialLink)
  const [copied, setCopied] = useState(false)
  const [fresh, setFresh] = useState(false)
  const timers = useRef<{ copied?: number; fresh?: number }>({})

  useEffect(() => {
    const held = timers.current
    return () => {
      window.clearTimeout(held.copied)
      window.clearTimeout(held.fresh)
    }
  }, [])

  const copy = async () => {
    const words = referralNote(church, referralLinkCopied(link))
    const went = await navigator.clipboard
      ?.writeText(words)
      .then(() => true)
      .catch(() => false)
    if (!went && !copiedTheOldWay(words)) return

    setCopied(true)
    window.clearTimeout(timers.current.copied)
    timers.current.copied = window.setTimeout(() => setCopied(false), COPIED_MS)
  }

  const getANewLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const response = await fetch(event.currentTarget.action, {
      method: 'POST',
      headers: { accept: 'application/json' },
    }).catch(() => null)
    if (!response?.ok) {
      // A session that ended, or a fault: the page says which when it loads again.
      window.location.reload()
      return
    }
    const answer = (await response.json()) as { readonly link: string }
    setLink(answer.link)
    setFresh(true)
    window.clearTimeout(timers.current.fresh)
    timers.current.fresh = window.setTimeout(() => setFresh(false), FRESH_MS)
  }

  return (
    <>
      <div className="linkrow">
        <input
          type="text"
          readOnly
          value={link}
          aria-label={REFER.yourLinkLabel}
          className={fresh ? 'fresh' : undefined}
        />
        <button type="button" className={copied ? 'btn did-copy' : 'btn'} onClick={copy}>
          {copied ? <Tick /> : <CopyPages />}
          {copied ? REFER.copied : REFER.copy}
        </button>
      </div>
      <p className="copy-says" aria-live="polite">
        {REFER.copySays}
      </p>
      <form method="post" action="/refer/new-link" onSubmit={getANewLink}>
        <button type="submit" className="new-link">
          {REFER.newLink}
        </button>
      </form>
    </>
  )
}
