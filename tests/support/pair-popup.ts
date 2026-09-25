import type pg from 'pg'
import { expect } from 'vitest'
import { baseUrl } from './app'
import type { MinistryFixture } from './local-supabase'

/**
 * Reading the Pair popup out of the page an Admin's browser receives (Manual
 * pairing, tickets 12 and 23). Both sides of the popup are one shell with a row per
 * person, so the two over-HTTP suites read it the same way, from here.
 */

/** Numbers no other run has used: the tests never truncate, and a phone number is unique. */
export const freshPhoneNumbers = (): (() => string) => {
  let numbered = 0
  return () => `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`
}

/** What answering Mentor on the Intake form records: the fact that makes a Discipler of somebody who leads nobody. */
export const offersToMentor = (pool: pg.Pool, ministry: MinistryFixture, personId: string) =>
  pool.query(
    `insert into consent_record
       (ministry_id, person_id, consent, granted, version, source, decided_at, intake_path, declared_side)
     values ($1, $2, 'sms', true, '2026-09-v1', 'pastor_link', now(), 'discipleship', 'mentor')`,
    [ministry.id, personId],
  )

/** The popup's own markup and nothing of the Roster behind it, or null where there is none. */
export const popupIn = (html: string): string | null =>
  html.match(/<div[^>]*data-testid="pair-popup"[\s\S]*?<\/form>/)?.[0] ?? null

/** One person's row in the popup: its label, from the mark to the end of it. */
export const rowFor = (popup: string, personId: string): string => {
  const row = popup.split('<label').find((each) => each.includes(`value="${personId}"`))
  expect(row, `no row in the popup for ${personId}`).toBeDefined()
  return row!.split('</label>')[0]!
}

/**
 * What a row says beneath its name, as it reads: the details with a dot between
 * them. Each detail is a piece of markup of its own so that it wraps whole, and
 * what is asserted is the line an Admin reads, not how it is cut up.
 */
export const detailsOf = (row: string): string =>
  (row.match(/class="pair-sub"[^>]*>([\s\S]*?)<\/span><\/span>/)?.[1] ?? '').replace(/<[^>]*>/g, '')

/**
 * The sentence above the buttons, as it reads, or null where there is none. Who
 * will disciple whom is drawn in bold at its start (Roles per pairing, ticket 01),
 * and what is asserted is the sentence an Admin reads, not where the bold ends.
 */
export const summaryIn = (popup: string): string | null =>
  popup.match(/class="pair-summary"[^>]*>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]*>/g, '').replace(/&#x27;/g, "'") ?? null

export const attribute = (tag: string, name: string): string | undefined =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

export const inputsIn = (popup: string): readonly string[] => popup.match(/<input[^>]*>/g) ?? []

/** The mark on somebody's row: the round mark or the box. */
export const markOn = (popup: string, personId: string): string => rowFor(popup, personId).match(/<input[^>]*>/)![0]

/** Everybody the popup offers under one field, by the value their mark would post, in the order listed. */
export const offeredAs = (popup: string, field: string): readonly (string | undefined)[] =>
  inputsIn(popup)
    .filter((input) => attribute(input, 'name') === field && attribute(input, 'type') !== 'hidden')
    .map((input) => attribute(input, 'value'))

/**
 * Who and what is chosen in the list: every mark on a row that is ticked or pressed,
 * by the value it would post. The toggles beneath the list have a segment on at all
 * times, so what is chosen is read off the rows and never off the whole popup.
 */
export const chosenIn = (popup: string): readonly (string | undefined)[] =>
  inputsIn(popup)
    .filter((input) => ['participantId', 'leaderId', 'groupId'].includes(attribute(input, 'name') ?? ''))
    .filter((input) => /\schecked=""/.test(input))
    .map((input) => attribute(input, 'value'))

/**
 * The two sections of either side's list (Roles per pairing, ticket 01), by the
 * value each person's mark would post, in the order listed: the people the list
 * opens on, and everybody folded under Everyone else. Groups are neither.
 */
export const sectionsOf = (popup: string): { readonly first: readonly string[]; readonly everyoneElse: readonly string[] } => {
  const people = (html: string) =>
    inputsIn(html)
      .filter((input) => ['participantId', 'leaderId'].includes(attribute(input, 'name') ?? ''))
      .filter((input) => attribute(input, 'type') !== 'hidden')
      .map((input) => attribute(input, 'value')!)
  const fold = foldIn(popup) ?? ''
  return { first: people(popup.replace(fold, '')), everyoneElse: people(fold) }
}

/** The Everyone else fold, from its opening tag to its end, or null where there is none. */
export const foldIn = (popup: string): string | null =>
  popup.match(/<details class="pair-more"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? null

/** Whether the fold is open as the server sends it. */
export const foldIsOpen = (popup: string): boolean => /<details class="pair-more" open=""/.test(popup)

/** A row's second line, what the person does now, or null where it says nothing. */
export const doingNowOf = (row: string): string | null =>
  row.match(/class="pair-also"[^>]*>([^<]*)</)?.[1]?.replace(/&#x27;/g, "'") ?? null

/** What the form posts without being asked. */
export const hiddenIn = (popup: string): Record<string, string | undefined> =>
  Object.fromEntries(
    inputsIn(popup)
      .filter((input) => attribute(input, 'type') === 'hidden')
      .map((input) => [attribute(input, 'name'), attribute(input, 'value')]),
  )

/** The list the toggle says the Roster behind the popup is on. */
export const currentList = (html: string): string | undefined =>
  html.match(/<a[^>]*aria-current="true"[^>]*>([^<]*)<\/a>/)?.[1]

/** A greyed row: shown, its mark disabled and never chosen, and its reason tied to it for a screen reader. */
export const expectGreyed = (popup: string, personId: string, reason: string): void => {
  const row = rowFor(popup, personId)
  const mark = markOn(popup, personId)
  expect(mark, reason).toMatch(/\sdisabled=""/)
  expect(mark, reason).not.toMatch(/\schecked=""/)
  const described = attribute(mark, 'aria-describedby')
  expect(described, reason).toBeDefined()
  expect(row, reason).toMatch(new RegExp(`id="${described}"[^>]*>${reason}<`))
}

/**
 * Somebody who is not shown at all (James, 2026-09-21): whoever gender rules out of
 * what is being made, from either side of the popup. Not greyed with a reason: no
 * row, no mark, and so nothing a form could post.
 */
export const expectLeftOut = (popup: string, personId: string): void => {
  expect(popup, personId).not.toContain(`value="${personId}"`)
}

export const expectOpen = (popup: string, personId: string): void => {
  const mark = markOn(popup, personId)
  expect(mark).not.toMatch(/\sdisabled=""/)
  expect(mark).not.toContain('aria-describedby')
}

/**
 * A group that can be chosen, as the server sends it (Manual pairing, recut ticket
 * 03): not greyed, and giving no reason. Its mark waits for script, because choosing
 * it has to point the form at the route that joins, so until script runs it cannot
 * be pressed and no form posts it to the route that pairs. One the server sent
 * already chosen is open as it stands: the server pointed the form there too.
 */
export const expectOpenGroup = (popup: string, groupId: string): void => {
  const row = rowFor(popup, groupId)
  const mark = markOn(popup, groupId)
  expect(row).not.toMatch(/class="pair-opt[^"]* off/)
  expect(row).not.toContain('pair-why')
  expect(mark).not.toContain('aria-describedby')
  if (/\schecked=""/.test(mark)) expect(mark).not.toMatch(/\sdisabled=""/)
  else expect(mark).toMatch(/\sdisabled=""/)
}

/** Posts the popup's form as a browser would, and answers where it was sent. */
export const postPairing = async (cookie: string, fields: readonly (readonly [string, string])[]): Promise<URL> => {
  const response = await fetch(`${baseUrl}/roster/pair/create`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams(fields.map(([name, value]) => [name, value])),
  })
  return new URL(response.headers.get('location') ?? '', baseUrl)
}
