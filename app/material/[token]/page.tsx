import { notFound } from 'next/navigation'
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
  const page = await getMaterialPageReader().readMaterialPage(token)
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
