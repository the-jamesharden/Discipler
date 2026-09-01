/**
 * Seeds two Ministries so the Roster can be looked at by hand, and so that
 * "scoped to their Ministry" is something a person can see rather than infer.
 * Development only.
 *
 * `createMinistryWithAdmin` runs the product's own provisioning, so what a
 * developer signs in to is what a pilot Admin would hold: a phone identity with a
 * password and no email, and a Person row on their own Roster. The number it
 * prints is the credential -- there is no email to sign in with.
 */
import { addPerson, createMinistryWithAdmin } from '../tests/support/local-supabase'

const riverside = await createMinistryWithAdmin('Riverside Chapel', 'Grace Adeyemi')
const northgate = await createMinistryWithAdmin('Northgate Community Church', 'Tom Halloran')

await addPerson(northgate, 'Ben Okafor')

console.log(JSON.stringify({ riverside, northgate }, null, 2))
