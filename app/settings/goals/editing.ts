import { NextResponse, type NextRequest } from 'next/server'
import { GoalRefused } from '~/domain/errors'

/**
 * What the four edit routes share. Each of them is an ordinary form POST, like
 * the import and the pairing, so the whole screen works before JavaScript has
 * loaded -- and each of them ends in the same place, because the list is the only
 * thing an Admin is looking at.
 */

const LIST = '/settings/goals'

/** Back to the list, optionally saying what happened to the edit. */
export const backToTheList = (
  request: NextRequest,
  params?: Record<string, string>,
): NextResponse => {
  const query = params ? `?${new URLSearchParams(params)}` : ''
  return NextResponse.redirect(new URL(`${LIST}${query}`, request.url), { status: 303 })
}

/**
 * Runs one edit and lands the Admin back on the list either way.
 *
 * Every refusal an Admin can act on travels as a code and reaches them as a
 * sentence the screen owns. Anything else is thrown: a database that is down is
 * not something to render as *this ministry already offers that option*.
 */
export const applying = async (
  request: NextRequest,
  edit: () => Promise<unknown>,
): Promise<NextResponse> => {
  try {
    await edit()
  } catch (error) {
    if (error instanceof GoalRefused) {
      return backToTheList(request, { error: error.refusal })
    }
    throw error
  }

  return backToTheList(request)
}
