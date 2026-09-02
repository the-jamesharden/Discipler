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

export const backToFollowUp = (request: NextRequest, params?: URLSearchParams) =>
  NextResponse.redirect(
    new URL(params && [...params].length > 0 ? `${FOLLOW_UP}?${params}` : FOLLOW_UP, request.url),
    { status: 303 },
  )

export const done = (request: NextRequest, outcome: CareOutcome) =>
  backToFollowUp(request, new URLSearchParams({ done: outcome }))

export const refused = (request: NextRequest, code: string) =>
  backToFollowUp(request, new URLSearchParams({ error: code }))

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
