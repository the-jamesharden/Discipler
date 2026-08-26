import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'Discipler',
  description: 'The operating system around discipleship relationships.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
