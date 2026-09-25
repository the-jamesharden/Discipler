import { Fragment, type ReactNode } from 'react'
import { fileTypeOf, linkAddress, linkHost } from '~/domain/materials'
import type { ItemToOpen } from '~/service/ports'
import { fileSize, LINK } from './copy'

/**
 * How a Material's files and links are drawn (Richer materials, ticket 01),
 * shared by the edit page, the Leader's Resources card and, later, a Disciple's
 * page. Not a client module, so a server page can import it: the edit page's
 * client component imports it too, and a constant a server page reads out of a
 * `'use client'` module renders as a stub that throws.
 */

/** One item as every screen describes it, whichever table or document it came from. */
export type DrawnItem =
  | {
      readonly kind: 'file'
      readonly filename: string
      readonly contentType: string
      readonly bytes: number
    }
  | { readonly kind: 'link'; readonly url: string; readonly label: string | null }

/** What an item is called on a screen: its filename, or its label, or the site it is on. */
export const itemName = (item: DrawnItem): string =>
  item.kind === 'file' ? item.filename : (item.label ?? linkHost(item.url))

/** The small line under the name on the edit page: the kind of file, or where the link goes. */
export const itemKind = (item: DrawnItem): string =>
  item.kind === 'file' ? (fileTypeOf(item.contentType)?.kind ?? 'File') : linkAddress(item.url)

/** The line under the name for someone opening it: *PDF · 1.8 MB*, or the site a link is on. */
export const itemMeta = (item: DrawnItem): string =>
  item.kind === 'file'
    ? `${fileTypeOf(item.contentType)?.kind ?? 'File'} · ${fileSize(item.bytes)}`
    : linkHost(item.url)

/** The right-hand column on the edit page: the size, or the word Link. */
export const itemSize = (item: DrawnItem): string =>
  item.kind === 'file' ? fileSize(item.bytes) : LINK

const Glyph = ({ children }: { readonly children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

const Page = ({ lines }: { readonly lines?: boolean }) => (
  <Glyph>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    {lines ? <path d="M8 13h8M8 17h5" /> : null}
  </Glyph>
)

/** A picture of what kind of thing an item is, by its file type or as a link. */
export const ItemGlyph = ({ item }: { readonly item: DrawnItem }) => {
  if (item.kind === 'link') {
    return (
      <Glyph>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </Glyph>
    )
  }
  const [family] = item.contentType.split('/')
  if (family === 'video') {
    return (
      <Glyph>
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </Glyph>
    )
  }
  if (family === 'audio') {
    return (
      <Glyph>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </Glyph>
    )
  }
  if (family === 'image') {
    return (
      <Glyph>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </Glyph>
    )
  }
  return <Page lines={item.contentType !== 'application/pdf'} />
}

/** The arrow at the end of a row: down for a file that downloads, out for a link that opens. */
export const ItemAction = ({ item }: { readonly item: DrawnItem }) =>
  item.kind === 'link' ? (
    <Glyph>
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Glyph>
  ) : (
    <Glyph>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </Glyph>
  )

/**
 * A Material's text as written, with every `http` or `https` address in it made
 * a link. Nothing else is read into it: no other markup, and an address has to
 * start with its scheme, so `www.example.com` stays words. A full stop after an
 * address belongs to the sentence, not the address, and so does a closing
 * bracket the address did not open: `(see https://a.org/x)` ends at `x`, and
 * `https://en.wikipedia.org/wiki/Grace_(theology)` keeps its own.
 */
export const LinkedText = ({ text }: { readonly text: string }) => (
  <>
    {textWithLinks(text).map((part, index) =>
      part.kind === 'link' ? (
        <a key={index} href={part.url} target="_blank" rel="noopener noreferrer">
          {part.url}
        </a>
      ) : (
        <Fragment key={index}>{part.text}</Fragment>
      ),
    )}
  </>
)

/**
 * An address as matched, less what trails it that belongs to the sentence: a
 * stop, a comma, a quote, and a closing bracket only where the address holds
 * more closing brackets than opening ones.
 */
const withoutTrailingPunctuation = (matched: string): string => {
  let url = matched.replace(/[.,;:!?'"]+$/, '')
  const count = (of: string) => url.split(of).length - 1
  while (
    (url.endsWith(')') && count(')') > count('(')) ||
    (url.endsWith(']') && count(']') > count('['))
  ) {
    url = url.slice(0, -1).replace(/[.,;:!?'"]+$/, '')
  }
  return url
}

/** The text split into its words and its addresses, in order. */
export const textWithLinks = (
  text: string,
): readonly ({ readonly kind: 'text'; readonly text: string } | { readonly kind: 'link'; readonly url: string })[] => {
  const parts: ({ kind: 'text'; text: string } | { kind: 'link'; url: string })[] = []
  let rest = 0
  for (const match of text.matchAll(/https?:\/\/[^\s<>"]+/gi)) {
    const url = withoutTrailingPunctuation(match[0])
    const at = match.index
    if (at > rest) parts.push({ kind: 'text', text: text.slice(rest, at) })
    parts.push({ kind: 'link', url })
    rest = at + url.length
  }
  if (rest < text.length) parts.push({ kind: 'text', text: text.slice(rest) })
  return parts
}

/**
 * A Material's files and links as somebody opening them sees them (M-2): one row
 * each, a file downloading under its own name and a link opening in a new tab.
 * A file whose link could not be minted is drawn without one rather than
 * dropped, so the list says what the Material holds either way.
 */
export const ItemsToOpen = ({ items }: { readonly items: readonly ItemToOpen[] }) =>
  items.length === 0 ? null : (
    <div className="res-list">
      {items.map((item) => {
        const inside = (
          <>
            <span className="ic">
              <ItemGlyph item={item} />
            </span>
            <span className="nm">
              {itemName(item)}
              <small>{itemMeta(item)}</small>
            </span>
            <span className="go">
              <ItemAction item={item} />
            </span>
          </>
        )
        if (item.kind === 'link') {
          return (
            <a key={item.id} className="res" href={item.url} target="_blank" rel="noopener noreferrer">
              {inside}
            </a>
          )
        }
        return item.url ? (
          <a key={item.id} className="res" href={item.url}>
            {inside}
          </a>
        ) : (
          <span key={item.id} className="res">
            {inside}
          </span>
        )
      })}
    </div>
  )
