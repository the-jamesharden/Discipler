/**
 * Seeds two Ministries so the Roster can be looked at by hand, and so that
 * "scoped to their Ministry" is something a person can see rather than infer.
 * Development only.
 */
import { addPerson, createMinistryWithAdmin } from '../tests/support/local-supabase'

const riverside = await createMinistryWithAdmin('Riverside Chapel')
const northgate = await createMinistryWithAdmin('Northgate Community Church')

await addPerson(northgate, 'Ben Okafor')

console.log(JSON.stringify({ riverside, northgate }, null, 2))
