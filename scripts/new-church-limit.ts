/**
 * Lists the churches held to the limits on a new church's first weeks, and lifts them for
 * one, for whoever runs Discipler (Exponential launch, ticket 37). The sentence an Admin is
 * refused with asks them to email support@, and this is what support@ then does.
 *
 * It reads the same environment the running app reads, so it is pointed at a deployment by
 * exporting `DATABASE_URL` for the one command, never by editing a file.
 *
 *   DATABASE_URL=... npm run new-church-limit -- list
 *   DATABASE_URL=... npm run new-church-limit -- lift <church id>
 *
 * A lift stands for good, and a second one changes nothing. Exits 0 when it stands, 1 when
 * there is no such church, and 2 when it was mistyped.
 */

const USAGE = 'Usage: new-church-limit.ts list | lift <church id>'

const [command, id, ...rest] = process.argv.slice(2)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const mistyped =
  rest.length > 0 ||
  (command === 'list' && id !== undefined) ||
  (command === 'lift' && !UUID.test(id ?? '')) ||
  !['list', 'lift'].includes(command ?? '')

if (mistyped) {
  console.error(USAGE)
  process.exit(2)
}

// Loaded only now, so a mistyped invocation is refused before the platform modules and
// their credentials are touched at all.
const [{ commandDatabaseUrl }, { createPostgresNewChurchLimits }, { systemClock }, { ministryId }] = await Promise.all([
  import('../src/platform/supabase/credentials'),
  import('../src/platform/supabase/new-church-limits'),
  import('../src/domain/clock'),
  import('../src/domain/ids'),
])

const limits = createPostgresNewChurchLimits(commandDatabaseUrl())

try {
  if (command === 'list') {
    for (const { church, name, openedAt, people, textsThisWeek } of await limits.standings(systemClock.now())) {
      console.log(`${church}  ${name}  opened ${openedAt.toISOString().slice(0, 10)}  ${people} people  ${textsThisWeek} texts this week`)
    }
  } else if (await limits.lift(ministryId(id ?? ''), systemClock.now())) {
    console.log(`The limits on ${id} are lifted.`)
  } else {
    console.error(`There is no church ${id}.`)
    process.exitCode = 1
  }
} finally {
  await limits.close()
}
