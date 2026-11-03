'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { pageAddressOf } from '~/domain/support-form'
import { FROM_PAGE } from './copy'

/**
 * The Help menu's link to the support form, naming the page the menu was opened on, so
 * a bug report can attach it (Exponential launch, ticket 25). The header is a server
 * component and does not know its own address, and neither `Referer` nor
 * `document.referrer` follows a client navigation.
 *
 * `usePathname` holds no query string, and the address is cleaned before it goes in the
 * link, so a person's ID never reaches the form's address either.
 *
 * Not prefetched: the form reads the session, and a menu's links must not add a read to
 * the page they are on (`docs/adr/0023-a-page-is-one-read.md`).
 */
export const FromThisPageLink = ({
  href,
  children,
}: {
  readonly href: string
  readonly children: ReactNode
}) => {
  const address = pageAddressOf(usePathname())
  return (
    <Link href={address ? `${href}?${new URLSearchParams({ [FROM_PAGE]: address })}` : href} prefetch={false}>
      {children}
    </Link>
  )
}
