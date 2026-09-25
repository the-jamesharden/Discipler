/**
 * The button on a Material's assign page, in words (Richer materials, ticket 02;
 * M-3 of `.lavish/richer-materials/mockup.html`).
 *
 * In a module of its own, and not in `./copy`, because the browser says it too:
 * the count follows the ticks as they are made, and a client component that read
 * `./copy` would carry every sentence on the tab into the browser to say one.
 */

/** *Assign Romans to 3 relationships*, or *to 1 relationship*: the count the ticks make. */
export const assignToCount = (title: string, count: number): string =>
  `Assign ${title} to ${count} ${count === 1 ? 'relationship' : 'relationships'}`

/**
 * The same button before script has counted anything, and where it never runs:
 * nothing is disabled then, so the words cannot promise a number.
 */
export const assignToTheTicked = (title: string): string =>
  `Assign ${title} to the ticked relationships`
