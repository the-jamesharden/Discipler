/**
 * What a Disciple's Material page says (Richer materials, ticket 04; M-4 of
 * `.lavish/richer-materials/mockup.html`). No names and no numbers anywhere on
 * it: a link can be forwarded (James, 2026-09-24, Q4).
 */

export const YOUR_MATERIAL = 'Your discipleship material'
export const ALWAYS_TODAYS = "Always shows what you're working through now."
export const JUST_FOR_YOU = 'This link is just for you.'

export const ENDED_HEADING = 'This link has ended'
export const endedLine = (ministryName: string): string =>
  `It was for a discipleship relationship that has finished. If you think that's a mistake, contact ${ministryName}.`

export const NONE_HEADING = 'No material right now'
export const noneLine = (ministryName: string): string =>
  `${ministryName} will put one here when there is one to work through.`
