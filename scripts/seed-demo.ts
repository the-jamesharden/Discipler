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
 * `addPerson`, `aTestPhoneNumber` and the fixture password are still test helpers,
 * and that is the right way round: they put one more row on a Roster and pick
 * numbers nothing else has taken, which is seeding and not provisioning.
 */
import { ministryId } from '../src/domain/ids'
import { provisionMinistry } from '../src/platform/supabase/provisioning'
import {
  ACCOUNT_PASSWORD,
  aTestPhoneNumber,
  addPerson,
  publishSupabaseCredentials,
} from '../tests/support/local-supabase'

// The adapters read the environment the way the running app does, and a script run
// through `vite-node` is not the app.
publishSupabaseCredentials()

const seed = async (name: string, adminName: string) => {
  // The suites' generator, not one of this script's own. It starts from a block
  // picked at random per process and walks from there: consecutive within a run, so
  // a developer can tell two Ministries apart at a glance, and different between
  // runs, which is the part that matters here. `auth.users` holds a number for the
  // life of the local stack, so a fixed start meant seeding a second time against
  // the same stack was refused for `account.already_exists`.
  const provisioned = await provisionMinistry({
    name,
    sendingNumber: aTestPhoneNumber(),
    admin: { fullName: adminName, phone: aTestPhoneNumber(), password: ACCOUNT_PASSWORD },
  })

  return { name, adminName, adminPassword: ACCOUNT_PASSWORD, ...provisioned }
}

const riverside = await seed('Riverside Chapel', 'Grace Adeyemi')
const northgate = await seed('Northgate Community Church', 'Tom Halloran')

await addPerson({ id: ministryId(northgate.ministryId) }, 'Ben Okafor')

console.log(JSON.stringify({ riverside, northgate }, null, 2))
