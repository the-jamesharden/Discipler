/**
 * Lists the referral credits waiting for James, and marks one settled once he has dealt
 * with it by hand (Exponential launch, ticket 32). It changes only Discipler's record:
 * any credit is given in Stripe, by hand, as the review email says.
 *
 * It needs only `DATABASE_URL`, exported for the one command, never written to a file.
 *
 *   DATABASE_URL=... npm run referral-review -- list
 *   DATABASE_URL=... npm run referral-review -- settle <credit id> credited
 *   DATABASE_URL=... npm run referral-review -- settle <credit id> not-credited
 *
 * Exits 0 when it stands, a second run of one included, 1 when it was refused or failed,
 * and 2 when it was mistyped.
 */

const USAGE = 'Usage: referral-review.ts list | settle <credit id> credited|not-credited'

const SETTLED_AS = { credited: 'credited', 'not-credited': 'not_credited' } as const

const [command, id, outcome, ...rest] = process.argv.slice(2)
const settledAs = outcome === 'credited' || outcome === 'not-credited' ? SETTLED_AS[outcome] : null

const listing = command === 'list' && id === undefined
const settling = command === 'settle' && Boolean(id) && settledAs !== null && rest.length === 0

if (!listing && !settling) {
  console.error(USAGE)
  process.exit(2)
}

// Loaded only now, so a mistyped invocation is refused before anything reads a credential.
const [{ commandDatabaseUrl }, { createPostgresReferralCredits }, { systemClock }] = await Promise.all([
  import('../src/platform/supabase/credentials'),
  import('../src/platform/supabase/referral-credits'),
  import('../src/domain/clock'),
])

const credits = createPostgresReferralCredits(commandDatabaseUrl())

try {
  if (listing) {
    console.log(JSON.stringify(await credits.underReview(), null, 2))
  } else {
    const answer = await credits.settleReview(id!, settledAs!, systemClock.now())
    if (answer === 'not_under_review') {
      console.error('Nothing was recorded: no credit with that ID is waiting for review.')
      process.exitCode = 1
    } else {
      console.log(answer === 'settled' ? 'Marked settled.' : 'It was already settled, and keeps its first answer.')
    }
  }
} catch (error) {
  console.error(`Nothing was recorded. ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await credits.close()
}
