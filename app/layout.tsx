import type { ReactNode } from 'react'

export const metadata = {
  title: 'Discipler',
  description: 'The operating system around discipleship relationships.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          Linked from `public/` rather than imported into this file, which is a
          decision and not a preference. Two things render Discipler's HTML: every
          page, through this layout, and the reset result, which is a route handler
          because a browser refresh on it has to re-post rather than re-navigate --
          see `app/roster/reset/[personId]/done/route.ts`. An imported stylesheet is
          bundled under a hashed path only this layout is told, so the second of the
          two would have had either no styling or a second copy of the first one's.
          One file, one URL, both renderers.
        */}
        <link rel="stylesheet" href="/discipler.css" />
      </head>
      <body>{children}</body>
    </html>
  )
}
