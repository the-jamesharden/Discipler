/**
 * Adds a number to the shared set every church sends from (Exponential launch,
 * ticket 06), for whoever runs Discipler.
 *
 * Run it only once the number is bought and in the Messaging Service `discipler-sms`
 * with its inbound webhook at `/sms/inbound`: from the moment it is added, the next
 * person a church texts for the first time may be given it, and a number Twilio
 * does not hold is a text that fails.
 *
 * It reads the same environment the running app reads and nothing else, so it is
 * pointed at a deployment by exporting the command connection string for the one
 * command, never by editing a file.
 *
 *   DATABASE_URL=... npm run shared-number -- "+15551234567"
 *
 * Adding a number already in the set changes nothing. There is no removing one: a
 * person keeps the number they hear from, so a number taken out of the Messaging
 * Service would leave its people unreachable.
 */

const [phone] = process.argv.slice(2)

if (!phone) {
  console.error('Usage: shared-number.ts <number, as bought>')
  process.exit(2)
}

// Loaded only now, so a mistyped invocation is refused before the platform
// modules and their credentials are touched at all.
const [{ createPostgresSharedNumbers }, { commandDatabaseUrl }] = await Promise.all([
  import('../src/platform/supabase/shared-numbers'),
  import('../src/platform/supabase/credentials'),
])

const numbers = createPostgresSharedNumbers(commandDatabaseUrl())

try {
  const added = await numbers.add(phone, new Date())
  const load = await numbers.load()

  console.log(JSON.stringify({ added, ...load }, null, 2))
} finally {
  await numbers.close()
}
