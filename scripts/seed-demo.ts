/**
 * Seeds two Ministries so the Roster can be looked at by hand, and so that
 * "scoped to their Ministry" is something a person can see rather than infer.
 * Development only.
 *
 * The Ministries come through `provisionMinistry` -- the product's own path, not a
 * test fixture wrapping it -- so what a developer signs in to is what a pilot Admin
 * would hold: a phone identity with a password and no email, and a Person row on
 * their own Roster. The number it prints is the credential; there is no email to
 * sign in with.
 *
 * `addPerson` is still a test helper, and that is the right way round: it puts one
 * more row on a Roster, which is seeding and not provisioning.
 */
import { ministryId } from '../src/domain/ids'
import { provisionMinistry } from '../src/platform/supabase/provisioning'
import { addPerson, publishSupabaseCredentials } from '../tests/support/local-supabase'

// The adapters read the environment the way the running app does, and a script run
// through `vite-node` is not the app.
publishSupabaseCredentials()

// Consecutive rather than random: a developer reading two Ministries out of this
// output wants to tell their numbers apart at a glance.
let nextNumber = 5_550_000
const aNumber = () => `+1555${String(nextNumber++).padStart(7, '0')}`

const seed = async (name: string, adminName: string) => {
  const adminPassword = 'correct-horse-battery-staple'

  const provisioned = await provisionMinistry({
    name,
    sendingNumber: aNumber(),
    admin: { fullName: adminName, phone: aNumber(), password: adminPassword },
  })

  return { name, adminName, adminPassword, ...provisioned }
}

const riverside = await seed('Riverside Chapel', 'Grace Adeyemi')
const northgate = await seed('Northgate Community Church', 'Tom Halloran')

await addPerson({ id: ministryId(northgate.ministryId) }, 'Ben Okafor')

console.log(JSON.stringify({ riverside, northgate }, null, 2))
