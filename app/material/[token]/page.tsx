import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getMaterialPageReader } from '~/service/container'
import { ItemsToOpen, LinkedText } from '../../materials/items'
import {
  ALWAYS_TODAYS,
  ENDED_HEADING,
  endedLine,
  JUST_FOR_YOU,
  NONE_HEADING,
  noneLine,
  YOUR_MATERIAL,
} from '../copy'

export const dynamic = 'force-dynamic'

/**
 * The page's one read, shared by its title and its body: asked twice in one
 * request, it is read once.
 */
const pageFor = cache((token: string) => getMaterialPageReader().readMaterialPage(token))

/**
 * What the browser tab says: the Material, or what the page says instead of one.
 * A Disciple keeps this open beside a video or a PDF, and the tab should say
 * which page it is.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const page = await pageFor((await params).token)
  if (!page) return {}
  return {
    title: page.status === 'open' ? page.title : page.status === 'ended' ? ENDED_HEADING : NONE_HEADING,
  }
}

/**
 * A Disciple's Material page (Richer materials, ticket 04; M-4 of
 * `.lavish/richer-materials/mockup.html`), opened from the text that told them
 * their Material changed. No sign-in: the link is the whole of it, and it shows
 * the Ministry's name and the Material and nothing about anybody.
 *
 * Always today's Material, so every text a Disciple has had opens the same page.
 * A file downloads through `/material/<token>/file/<item>`, which checks the link
 * again and hands back a link that lasts minutes, so nothing on this page is an
 * address a file can be fetched from later.
 */
export default async function DisciplesMaterialPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const page = await pageFor(token)
  // The same answer for a token that was never real and one somebody guessed.
  if (!page) notFound()

  if (page.status !== 'open') {
    return (
      <main className="dpage">
        <header className="dpage-head">
          <p className="dpage-ministry">{page.ministryName}</p>
          <h1>{page.status === 'ended' ? ENDED_HEADING : NONE_HEADING}</h1>
          <p>{page.status === 'ended' ? endedLine(page.ministryName) : noneLine(page.ministryName)}</p>
        </header>
      </main>
    )
  }

  return (
    <main className="dpage">
      <header className="dpage-head">
        <p className="dpage-ministry">{page.ministryName}</p>
        <h1>{page.title}</h1>
        <p>{YOUR_MATERIAL}</p>
      </header>
      <div className="mat-panel">
        {page.body ? (
          <p className="material-body">
            <LinkedText text={page.body} />
          </p>
        ) : null}
        <ItemsToOpen
          items={page.items.map((item) =>
            item.kind === 'file'
              ? {
                  kind: 'file',
                  id: item.id,
                  filename: item.filename,
                  contentType: item.contentType,
                  bytes: item.bytes,
                  url: `/material/${token}/file/${item.id}`,
                }
              : { kind: 'link', id: item.id, url: item.url, label: item.label },
          )}
        />
      </div>
      <p className="dpage-foot">
        {ALWAYS_TODAYS}
        <br />
        {JUST_FOR_YOU}
      </p>
    </main>
  )
}
