/**
 * How many wrong passwords Discipler lets anybody try before it stops asking
 * Supabase Auth (Exponential launch, ticket 13; Q34).
 *
 * Discipler's own, because Supabase's is no use from here. Sign-in runs on the
 * server, so the address Supabase Auth rate-limits is the Vercel function's, not
 * the person's: every guesser in the world shares one bucket with every Admin, and
 * none of them is ever held back on their own. Ticket 13's comments record how
 * that was established.
 *
 * Counted per account and per network, so neither one guesser trying many
 * accounts nor many networks trying one account gets further than ten. The
 * counting is in Postgres (`sign_in_attempt`), never in memory: a serverless
 * function holds nothing between requests, and two of them hold nothing in common.
 */

/** Failed sign-ins allowed per account, and per network, inside the window. */
export const FAILED_SIGN_INS_ALLOWED = 10

/** How far back a failed sign-in still counts. A rolling window, not a lockout clock. */
export const SIGN_IN_WINDOW_MINUTES = 15

/** Failures inside the window, on the account being tried and from the network trying it. */
export interface RecentFailures {
  readonly forAccount: number
  readonly forNetwork: number
}

/**
 * Whether the next try is refused before Supabase Auth is asked. The same answer
 * whether or not the account exists, because a failure against a number nobody
 * holds is counted exactly like one against a number somebody does.
 */
export const signInIsHeldBack = ({ forAccount, forNetwork }: RecentFailures): boolean =>
  forAccount >= FAILED_SIGN_INS_ALLOWED || forNetwork >= FAILED_SIGN_INS_ALLOWED
