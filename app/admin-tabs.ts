/**
 * The six Admin tabs, left to right and named as the prototype names them.
 * Materials was greyed out from ticket 31 until the tab was built
 * (`.scratch/materials/spec.md`); every tab is a link now.
 *
 * Three of them wear a painting behind the cards, each its own, and three wear
 * none (James, 2026-09-25): Blossom on the Overview, Trees where Care Needed is
 * worked, tulips on the Roster.
 *
 * In a file of its own so search, which runs in the browser, can list them without
 * bringing the page shell along (`./search/pages`).
 */
export const ADMIN_TABS = [
  { key: 'overview', href: '/overview', label: 'Overview', design: 'blossom' },
  { key: 'check-ins', href: '/check-ins', label: 'Check-Ins', design: null },
  { key: 'suggested-pairs', href: '/suggested-pairs', label: 'Suggested Pairs', design: null },
  { key: 'follow-up', href: '/follow-up', label: 'Follow-Up', design: 'trees' },
  { key: 'materials', href: '/materials', label: 'Materials', design: null },
  { key: 'roster', href: '/roster', label: 'Roster', design: 'tulips' },
] as const

export type AdminTab = (typeof ADMIN_TABS)[number]['key']
