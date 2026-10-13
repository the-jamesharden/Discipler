import { NextResponse, type NextRequest } from 'next/server'
import {
  CancellationRefused,
  ConcernRefused,
  EndingRefused,
  FollowUpRefused,
  PauseRefused,
} from '~/domain/errors'
import type { CareOutcome } from './copy'

/**
 * What every Care Needed route handler shares: where it goes back to, how it says
 * what happened, and how a refusal travels. Codes on the query string and never
 * prose, so nothing a stranger types into `?error=` is rendered in the page's own
 * styling -- the same rule the Roster's routes follow.
 */

export const FOLLOW_UP = '/follow-up'

/**
 * Where a route returns to: Follow-Up, or the pair card a form was posted from
 * (Pastor feedback, ticket 07), which sends its own address as `back`. Only a
 * card's address is taken, matched whole, so a body cannot send an Admin
 * anywhere else; anything else is Follow-Up, as it always was.
 */
const A_CARD = /^\/overview\?card=[0-9a-f-]{36}$/i

export const backFrom = (form: FormData): string => {
  const back = field(form, 'back')
  return back !== null && A_CARD.test(back) ? back : FOLLOW_UP
}

export const backToFollowUp = (request: NextRequest, params?: URLSearchParams, to: string = FOLLOW_UP) => {
  const query = params && [...params].length > 0 ? `${to.includes('?') ? '&' : '?'}${params}` : ''
  return NextResponse.redirect(new URL(`${to}${query}`, request.url), { status: 303 })
}

export const done = (request: NextRequest, outcome: CareOutcome, to: string = FOLLOW_UP) =>
  backToFollowUp(request, new URLSearchParams({ done: outcome }), to)

export const refused = (request: NextRequest, code: string, to: string = FOLLOW_UP) =>
  backToFollowUp(request, new URLSearchParams({ error: code }), to)

/** A field as it arrived, or null for one the form did not send. */
export const field = (form: FormData, name: string): string | null => {
  const value = form.get(name)
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Every refusal the five commands can raise, as the code it carries. Anything
 * else is not a refusal and is rethrown.
 */
export const refusalCodeOf = (error: unknown): string | null =>
  error instanceof FollowUpRefused
  || error instanceof ConcernRefused
  || error instanceof CancellationRefused
  || error instanceof EndingRefused
  || error instanceof PauseRefused
    ? error.refusal
    : null
