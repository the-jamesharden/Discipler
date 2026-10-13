import { notFound, redirect } from 'next/navigation'
import { shortNameInLink } from '~/domain/short-name'
import { getIntakeReader } from '~/service/container'

/**
 * Where a readable link goes (Pastor feedback, ticket 04): `/join/<short name>`
 * to the mentor and mentee form and `/join/<short name>/groups` to the groups
 * form, by any short name the Ministry has ever held -- a QR code printed on last
 * year's bulletin still carries the old one.
 *
 * A redirect to the forms where they already live, at `/intake/<ministry id>`,
 * rather than a second copy of every page, submit route and confirmation under a
 * second address. Everything a form does after its first screen is unchanged, and
 * the query string travels with it, so `?via=qr` still records a scan.
 *
 * Temporary, because where a name leads is the Ministry's to change: a permanent
 * redirect would be cached by every phone that ever scanned it.
 */

export type JoinQuery = Record<string, string | string[] | undefined>

export type JoinForm = 'mentor-and-mentee' | 'groups'

/** The form's own address for a Ministry, as the Intake pages are routed. */
const formAt = (ministry: string, form: JoinForm): string =>
  form === 'groups' ? `/intake/${ministry}` : `/intake/${ministry}/discipleship`

/** The query string as it arrived, every value of every key, in order. */
const carried = (query: JoinQuery): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    for (const each of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, each)
    }
  }
  const search = params.toString()
  return search === '' ? '' : `?${search}`
}

/**
 * The segment as it was typed, where Next hands it over still percent-encoded.
 * One that does not decode names nobody, rather than failing the request.
 */
const decoded = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return ''
  }
}

export const openTheForm = async (
  segment: string,
  query: JoinQuery,
  form: JoinForm,
): Promise<never> => {
  const name = shortNameInLink(decoded(segment))
  const found = name === null ? null : await getIntakeReader().ministryNamed(name)
  if (!found) notFound()

  redirect(`${formAt(found.ministryId, form)}${carried(query)}`)
}
