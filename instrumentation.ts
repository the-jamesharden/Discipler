import { assertDeploymentIsSafe } from '~/platform/deployment'

/**
 * Runs once as each server instance starts, before it answers anything: a staging
 * deployment carrying production's database, Twilio credentials or a Stripe live
 * key, or a production one set to record its texts, stops here (Exponential launch,
 * ticket 02).
 *
 * `next.config.ts` makes the same check at build, which is the one that matters on
 * Vercel: a build that fails never takes traffic, and the deployment before it goes
 * on serving. This is the second line, for an environment changed after the build
 * -- on Vercel that needs a redeploy anyway, but a `next start` reads `.env` files
 * afresh each time.
 */
export function register() {
  assertDeploymentIsSafe(process.env)
}
