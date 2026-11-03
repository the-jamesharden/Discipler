/**
 * Which deployment this process is, and what it refuses to run with
 * (Exponential launch, ticket 02).
 *
 * Staging is a copy of Discipler with its own database, Stripe in test mode and no
 * real texting, where every billing and sign-up change is tried first. That promise
 * rests entirely on the environment a staging deployment is given, and an
 * environment is typed by hand into a dashboard: one pasted production value and
 * staging writes to real churches' rows, texts real phones or takes real money,
 * with nothing on the screen to say so. So a deployment reads its own environment
 * before it serves anything, at build in `next.config.ts` and again at start in
 * `instrumentation.ts`, and refuses to run on a wrong one.
 *
 * **No imports**, deliberately: `next.config.ts` loads this before anything is
 * compiled, and `instrumentation.ts` runs it on the edge runtime as well as Node.
 *
 * Every function takes the environment as an argument rather than reading
 * `process.env`, so the tests can say what went in.
 */

export type Environment = Readonly<Record<string, string | undefined>>

export type Deployment = 'production' | 'staging' | 'other'

export type MessageTransportKind = 'twilio' | 'record'

/**
 * The production Supabase project, `discipler-production`. Not a secret: it is the
 * host in production's public `NEXT_PUBLIC_SUPABASE_URL`, which every browser sees.
 * It appears in every way of reaching that project -- the API URL, the direct
 * database host, the pooler's user name and a legacy key's payload -- so it is the
 * one thing to look for, rather than a list of addresses that would go stale.
 */
const PRODUCTION_SUPABASE_REF = 'vmdiddtxvmaflmrrqwmo'

/** Where production serves, and so where production's links point. */
const PRODUCTION_APP_HOST = 'app.trydiscipler.com'

/**
 * The prefixes Stripe gives a live-mode key: secret, restricted and publishable.
 * Matched in every variable rather than in the names the billing tickets chose,
 * because a live key pasted under any name is the same mistake.
 */
const STRIPE_LIVE_KEY = /\b(sk|rk|pk)_live_/

/**
 * Staging when the environment says so, or when Vercel deploys it to the custom
 * environment named `staging`. Either is enough, and that is the safe way round: a
 * staging deployment whose `DISCIPLER_ENVIRONMENT` was forgotten is still staging,
 * and a value set by hand on a laptop makes a local server behave as staging does.
 *
 * Production is Vercel's word for it. `VERCEL_TARGET_ENV` names custom environments
 * too, so it is preferred, with `VERCEL_ENV` for a deployment that predates it.
 */
export const deploymentOf = (env: Environment): Deployment => {
  if (env.DISCIPLER_ENVIRONMENT === 'staging' || env.VERCEL_TARGET_ENV === 'staging') {
    return 'staging'
  }
  return isVercelProduction(env) ? 'production' : 'other'
}

const isVercelProduction = (env: Environment): boolean =>
  env.VERCEL_TARGET_ENV ? env.VERCEL_TARGET_ENV === 'production' : env.VERCEL_ENV === 'production'

/**
 * How a text leaves: through Twilio, or written to the log and sent nowhere.
 *
 * `MESSAGE_TRANSPORT=record` chooses recording, and staging always records whatever
 * the variable says. The startup guard already refuses a staging deployment that
 * does not say `record`; this is the second line, for a process that got past it,
 * so no path through staging ends at Twilio.
 */
export const messageTransportKind = (env: Environment): MessageTransportKind => {
  const named = env.MESSAGE_TRANSPORT || 'twilio'
  if (named !== 'twilio' && named !== 'record') {
    throw new Error(`MESSAGE_TRANSPORT must be "twilio" or "record", not "${named}".`)
  }
  return deploymentOf(env) === 'staging' ? 'record' : named
}

/**
 * Whether a Stripe event sent here should be a live-mode one. Production takes live
 * mode and nothing else does: staging is a Stripe sandbox, and a developer's machine
 * has no business with real money. A test-mode event at production, or the reverse,
 * is an endpoint or a secret pointed at the wrong deployment.
 */
export const stripeTakesLiveEvents = (env: Environment): boolean =>
  deploymentOf(env) === 'production'

/**
 * Everything wrong with this environment for the deployment it is, as sentences a
 * person can act on, all at once so a dashboard is fixed in one pass. Empty means
 * it may run.
 *
 * A refusal names the variable and never quotes its value: these are printed in a
 * build log, and the values worth refusing are the ones that must not be printed.
 */
export const deploymentRefusals = (env: Environment): string[] => {
  const refusals: string[] = []

  if (env.DISCIPLER_ENVIRONMENT && env.DISCIPLER_ENVIRONMENT !== 'staging') {
    refusals.push('DISCIPLER_ENVIRONMENT must be "staging" or unset.')
  }

  const transport = env.MESSAGE_TRANSPORT
  if (transport && transport !== 'twilio' && transport !== 'record') {
    refusals.push('MESSAGE_TRANSPORT must be "twilio" or "record".')
  }

  const deployment = deploymentOf(env)

  if (deployment === 'production' && transport === 'record') {
    refusals.push(
      'MESSAGE_TRANSPORT is "record" on production, which would drop every text without a word.',
    )
  } else if (deployment !== 'staging' && transport === 'record' && reachesProduction(env)) {
    // Preview runs on production's database: recording there would mark real texts
    // sent and let the recorded Verify code check a real Admin's phone.
    refusals.push(
      'MESSAGE_TRANSPORT is "record" on a deployment that reaches production\'s Supabase project, whose texts and phone checks are real.',
    )
  }

  if (deployment === 'staging') refusals.push(...stagingRefusals(env))

  return refusals
}

const stagingRefusals = (env: Environment): string[] => {
  const refusals: string[] = []
  const set = Object.entries(env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
  )

  if (isVercelProduction(env)) {
    refusals.push('This is a staging environment being deployed as production.')
  }

  if (env.MESSAGE_TRANSPORT !== 'record') {
    refusals.push('Staging records texts and sends none: set MESSAGE_TRANSPORT=record.')
  }

  for (const [name, value] of set) {
    if (reachesProductionSupabase(value)) {
      refusals.push(`${name} points at production's Supabase project.`)
    }
    if (STRIPE_LIVE_KEY.test(value)) {
      refusals.push(`${name} is a Stripe live-mode key; staging takes test-mode keys only.`)
    }
    // Every Twilio variable, not only the two the transport reads. Staging has no
    // number and sends nothing, so any Twilio value there is production's.
    if (name.startsWith('TWILIO_')) {
      refusals.push(`${name} is set; staging carries no Twilio credentials.`)
    }
  }

  if (hostOf(env.NEXT_PUBLIC_APP_URL) === PRODUCTION_APP_HOST) {
    refusals.push(
      `NEXT_PUBLIC_APP_URL is production's address, so staging's links would open production.`,
    )
  }

  return refusals
}

const reachesProduction = (env: Environment): boolean =>
  Object.values(env).some((value) => typeof value === 'string' && reachesProductionSupabase(value))

/**
 * Whether a value reaches the production project: by its ref in plain text (an API
 * URL, a database host, a pooler user name), or inside a key, whose JWT payload
 * names the project it belongs to.
 */
export const reachesProductionSupabase = (value: string): boolean =>
  value.includes(PRODUCTION_SUPABASE_REF) || jwtProjectRef(value) === PRODUCTION_SUPABASE_REF

const jwtProjectRef = (value: string): string | null => {
  const parts = value.split('.')
  if (parts.length !== 3) return null
  try {
    // `atob` rather than `Buffer`, which the edge runtime does not have.
    const json = atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))
    const payload: unknown = JSON.parse(json)
    return typeof payload === 'object' && payload !== null && 'ref' in payload
      ? String((payload as { ref: unknown }).ref)
      : null
  } catch {
    return null
  }
}

const hostOf = (url: string | undefined): string | null => {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** Refuses to go on, naming every reason, when this environment is wrong for its deployment. */
export const assertDeploymentIsSafe = (env: Environment): void => {
  const refusals = deploymentRefusals(env)
  if (refusals.length === 0) return

  throw new Error(
    `Discipler refuses to run as ${deploymentOf(env)} on this environment:\n` +
      refusals.map((refusal) => `  - ${refusal}`).join('\n'),
  )
}
