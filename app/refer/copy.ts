/**
 * The Refer page's words, James's own from mock-up 5 (`.lavish/refer-billing/refer.html`).
 * The link is the one thing changed from what is drawn: `app.trydiscipler.com/r/<code>`
 * (James, 2026-11-04).
 */
export const REFER = {
  title: 'Refer a church',
  lede: 'Know a church that would love Discipler? Share your link.',
  offer: ['Give a month free.', 'Get a month free.'],
  offerLine: 'Their first paid month is free, and when they pay their first bill, you get a month free too.',
  steps: [
    'Send your link to another church, by text or email.',
    'They sign up, get 30 days free, then their first paid month free.',
    '30 days after they pay their first bill, a month free is taken off your next bill.',
  ],
  yourLink: 'Your link',
  yourLinkLabel: 'Your referral link',
  copy: 'Copy',
  copied: 'Copied',
  copySays: 'Copy puts a short note and your link on your clipboard, ready to paste into a text or email.',
  newLink: 'Get a new link',
  fine: 'Your month free waits 30 days after their first payment, and is taken back if that payment is refunded. It shows on Billing when it is applied.',
} as const

/** The approved note, which Copy puts on the clipboard with the link. */
export const referralNote = (church: string, link: string): string =>
  `Hi! At ${church} we use Discipler to keep our discipleship relationships meeting week to week, and I think your church would love it. Sign up with our link and your first paid month is free: ${link}`
