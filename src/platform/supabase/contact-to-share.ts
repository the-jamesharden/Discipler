import type { SupabaseClient } from '@supabase/supabase-js'
import type { MinistryId, PersonId } from '~/domain/ids'
import { phoneNumber } from '~/domain/roster'
import type { ContactDetails } from '~/service/ports'
import { rows, text } from './rows'

/**
 * What `Nudge` reveals: the number, where the Person currently agrees to share it.
 *
 * The whole rule is inside `public.contact_to_share`, which is the only path to a
 * number a browser session has that consults consent at all. Both arguments are
 * load-bearing there: it answers about a Person in the named Ministry, and only for
 * a caller who belongs to it.
 */
export const readContactToShare = async (
  client: SupabaseClient,
  ministryId: MinistryId,
  person: PersonId,
): Promise<ContactDetails | null> => {
  const { data, error } = await client.rpc('contact_to_share', {
    target_ministry_id: ministryId,
    target_person_id: person,
  })

  // A refusal to answer is not an answer of "no". Withholding a number the Person
  // agreed to share is the same failure as disclosing one they did not, so a broken
  // read says so rather than resolving quietly to null.
  if (error) throw new Error(`Could not read contact details in ${ministryId}: ${error.message}`)

  const row = rows(data)[0]

  // No row is the answer, not a failure: the Person has not agreed to share, or has
  // no number, or is not somebody this caller may ask about. The function does not
  // distinguish them and neither may this -- an Admin who could tell "withheld" from
  // "no such Person" would be reading consent by inference.
  if (!row) return null

  const fullName = text(row.full_name)
  const phone = text(row.phone)

  // A row that came back malformed is a broken read like any other, and is thrown
  // rather than folded into the null above. Both mean "no number" to a caller that
  // cannot tell them apart, and the one that means a rule has stopped holding must
  // not hide inside the one that means the Person said no.
  if (!fullName || !phone) {
    throw new Error(`Contact details for ${person} came back without a name or a number`)
  }

  return { fullName, phone: phoneNumber(phone) }
}
