/**
 * Seeds two Ministries so the Roster can be looked at by hand, and so that
 * "scoped to their Ministry" is something a person can see rather than infer.
 * Development and staging only.
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
 *
 * Against the local stack by default. Against staging by exporting its four
 * Supabase values for the one command (Exponential launch, ticket 02); see
 * `docs/agents/test-environment.md`. Never against production, which it refuses.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... npm run seed
 */
import { reachesProductionSupabase } from '../src/platform/deployment'
import { provisionMinistry } from '../src/platform/supabase/provisioning'
import { serviceRoleClient } from '../src/platform/supabase/credentials'
import {
  ACCOUNT_PASSWORD,
  aTestPhoneNumber,
  addASharedNumber,
  publishSupabaseCredentials,
} from '../tests/support/local-supabase'

// The adapters read the environment the way the running app does, and a script run
// through `vite-node` is not the app.
publishSupabaseCredentials()

// Demo churches with a published password, on real churches' database, is the one
// outcome worse than not seeding at all.
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL']) {
  if (reachesProductionSupabase(process.env[name] ?? '')) {
    console.error(`Refused: ${name} points at production. Seed the local stack or staging.`)
    process.exit(2)
  }
}

const seed = async (name: string, adminName: string) => {
  // The suites' generator, not one of this script's own. It starts from a block
  // picked at random per process and walks from there: consecutive within a run, so
  // a developer can tell two Ministries apart at a glance, and different between
  // runs, which is the part that matters here. `auth.users` holds a number for the
  // life of the local stack, so a fixed start meant seeding a second time against
  // the same stack was refused for `account.already_exists`.
  const provisioned = await provisionMinistry({
    name,
    timezone: 'America/New_York',
    admin: { fullName: adminName, phone: aTestPhoneNumber(), password: ACCOUNT_PASSWORD },
  })

  // A number in the shared set for each, so a drain on this stack has something to
  // send from: every church sends from the shared numbers (Exponential launch,
  // ticket 06), and a fresh stack has none.
  const sharedNumber = await addASharedNumber()

  return { name, adminName, adminPassword: ACCOUNT_PASSWORD, sharedNumber, ...provisioned }
}

const riverside = await seed('Riverside Chapel', 'Grace Adeyemi')
const northgate = await seed('Northgate Community Church', 'Tom Halloran')

// Through the environment's own service role rather than the suites' `addPerson`,
// which always reaches the local stack and would put Ben on a Roster elsewhere.
const { error } = await serviceRoleClient()
  .from('person')
  .insert({ ministry_id: northgate.ministryId, full_name: 'Ben Okafor', phone: null })
if (error) throw new Error(`Could not add Ben Okafor to the Roster: ${error.message}`)

console.log(JSON.stringify({ riverside, northgate }, null, 2))
