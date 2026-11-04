import type { WhatsNewEntry } from '~/domain/whats-new'

/**
 * The What's new entries (`.scratch/exponential-launch/spec.md`, "Help, What's new and
 * office hours"). Adding one is adding an entry here; the newest an Admin has not
 * dismissed shows on their Overview, and all of them are listed at `/help/whats-new`.
 *
 * An entry's `id` is what each Admin's dismissal is stored against, so it is never
 * reused and never changed once shipped. `readMore`, where there is one, is a Help page.
 */
export const WHATS_NEW: readonly WhatsNewEntry[] = [
  {
    id: 'search',
    date: '2026-11-03',
    title: 'Find anything with search',
    sentence:
      'Click Search at the end of the tabs, or press ⌘K, to jump to any person, relationship, material or help page.',
    readMore: '/help/getting-started#find-anything-with-search',
  },
]
