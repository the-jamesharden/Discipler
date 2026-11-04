/**
 * Approves or declines a church-plant application, for whoever runs Discipler
 * (Exponential launch, ticket 19; Q27). There is no approve link anywhere, because
 * whoever can read the inbox the application goes to could then approve plants.
 *
 * It reads the same environment the running app reads, so it is pointed at a deployment
 * by exporting those for the one command, never by editing a file. `list` and a plain
 * `decline` need only `DATABASE_URL`; an approval also needs `STRIPE_SECRET_KEY`, and
 * anything that emails needs `RESEND_API_KEY` and `RESEND_EMAIL_DOMAIN`.
 *
 *   DATABASE_URL=... npm run church-plant -- list
 *   DATABASE_URL=... STRIPE_SECRET_KEY=... RESEND_API_KEY=... RESEND_EMAIL_DOMAIN=... \
 *     npm run church-plant -- approve <id>
 *   DATABASE_URL=... npm run church-plant -- decline <id> [--email]
 *
 * Exits 0 when the decision stands, a second run of one included, 1 when it was refused
 * or failed, and 2 when it was mistyped.
 */

const USAGE = 'Usage: church-plant.ts list | approve <id> | decline <id> [--email]'

const [command, id, ...rest] = process.argv.slice(2)
const emailing = rest.includes('--email')

const mistyped =
  (command === 'list' && (id !== undefined || rest.length > 0)) ||
  (command === 'approve' && (!id || rest.length > 0)) ||
  (command === 'decline' && (!id || rest.some((word) => word !== '--email'))) ||
  !['list', 'approve', 'decline'].includes(command ?? '')

if (mistyped) {
  console.error(USAGE)
  process.exit(2)
}

// Loaded only now, so a mistyped invocation is refused before the platform modules and
// their credentials are touched at all.
const [
  { commandDatabaseUrl },
  { createPostgresBilling },
  { createPostgresChurchPlantApplications },
  { createStripeBilling },
  { createStripeTrials },
  { createResendTransport },
  { createEmailSender },
  decisions,
  { systemClock },
] = await Promise.all([
  import('../src/platform/supabase/credentials'),
  import('../src/platform/supabase/billing'),
  import('../src/platform/supabase/church-plant-applications'),
  import('../src/platform/stripe/billing'),
  import('../src/platform/stripe/trials'),
  import('../src/platform/resend/email-transport'),
  import('../src/service/email-sender'),
  import('../src/service/church-plant-decisions'),
  import('../src/domain/clock'),
])

const applications = createPostgresChurchPlantApplications(commandDatabaseUrl())
const billing = createPostgresBilling(commandDatabaseUrl())

const work = {
  applications,
  records: billing.records,
  stripe: createStripeBilling(),
  trials: createStripeTrials(),
  sender: createEmailSender(createResendTransport()),
  clock: systemClock,
}

try {
  if (command === 'list') {
    console.log(JSON.stringify(await applications.undecided(), null, 2))
  } else {
    const outcome =
      command === 'approve'
        ? await decisions.approvePlantApplication(work, id!)
        : await decisions.declinePlantApplication(work, id!, { email: emailing })
    console.log(decisions.plantOutcomeSentences(outcome).join('\n'))
    if (decisions.refusedAPlant(outcome)) process.exitCode = 1
  }
} catch (error) {
  // Nothing was recorded: the lock's transaction rolled back, and the claim on the card
  // with it. Running it again finishes it.
  console.error(`Nothing was recorded. ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await billing.close()
  await applications.close()
}
