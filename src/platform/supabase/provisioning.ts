import pg from 'pg'
import type { AccountCreationRefusal } from '~/domain/accounts'
import { MinistrySetupRefused } from '~/domain/errors'
import type { MinistrySetupToken } from '~/domain/ministry-setup'
import { asPhoneNumber } from '~/domain/roster'
import { supabaseAccounts } from './accounts'
import { commandDatabaseUrl } from './credentials'

/**
 * How a Ministry and its first Admin come into existence.
 *
 * There is no surface for this and there is not meant to be one: a Ministry is
 * created by whoever runs Discipler, not by anybody signing up. It is product code
 * rather than a script's private business because two decisions live here that
 * nothing else in the product could hold.
 *
 * The first is the credential. The Admin gets a phone identity with a password and
 * no email, the same mint a Leader gets at Acceptance, because the credential is
 * the same for every user -- see
 * `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.
 *
 * The second is the link. The Admin is given a Person row in their own Ministry
 * with `person.user_id` set, so they are a Person like everybody else and one human
 * holds one login. `docs/adr/0009-one-account-per-human.md` places the link here and
 * nowhere else: Acceptance already reuses `person.user_id` where it finds one, so an
 * Admin who is later invited to lead reuses the account they already have rather
 * than minting a second one. Making the link at Acceptance instead would mean
 * consulting a session that acceptance deliberately does not have.
 *
 * The third is the history. A Ministry opening is a ministry event -- the first
 * one, `ministry.opened`, with the Ministry as its subject and its first Admin's
 * arrival inside it, because the transaction below makes them one act and a
 * Ministry with no Admin is not a state the product has. It is written here,
 * beside the command boundary rather than through it, because there is no
 * Ministry to scope a command to until the row it would be scoped to exists.
 * `docs/adr/0019-a-ministry-opens-from-a-link.md` records the decision.
 *
 * Two things reach this. The Ministry Setup Link, which is how a real Ministry is
 * opened: the operator mints the link and the Admin spends it here, typing their
 * own password. And the seed script and the test fixture, which have no link and
 * open Ministries directly. The link is spent inside the same transaction that
 * creates the Ministry, so a link is never spent on a Ministry that was not made
 * and a Ministry is never made on a link that stays live.
 */

export interface NewMinistry {
  readonly name: string
  /**
   * The number this Ministry's messages are sent from. Provisioned with the
   * Ministry because a Ministry without one cannot send anything, and borrowing
   * another Ministry's identity is worse than refusing to send.
   *
   * Read through `asPhoneNumber` like the Admin's, and typed however an operator
   * would type it.
   */
  readonly sendingNumber: string
  readonly admin: NewAdmin
  /**
   * The Ministry Setup Link this Ministry is being opened through, when there is
   * one. Refused, not faulted, when the link turns out to be spent or run out by
   * the time the transaction reaches it: the person in front of the page is the
   * one who needs to hear which.
   */
  readonly openedThrough?: MinistrySetupToken
  /**
   * When the Ministry opens: the moment its first event occurred and the moment
   * the link, if there is one, is spent. The caller's clock and never the
   * database's, so the page that read the link as live and the transaction that
   * spends it agree about what time it is.
   */
  readonly at?: Date
}

export interface NewAdmin {
  readonly fullName: string
  /**
   * What they sign in with, and the number on their Person record: one fact, read
   * once through `asPhoneNumber` so it cannot become two. Typed however an operator
   * would type it; it does not have to arrive in E.164.
   */
  readonly phone: string
  readonly password: string
}

export interface ProvisionedMinistry {
  readonly ministryId: string
  readonly adminUserId: string
  /** The Admin's own row on their Ministry's Roster. */
  readonly adminPersonId: string
  /** The number as it was stored, which is what they sign in with. */
  readonly adminPhone: string
  /** Likewise as stored: what a caller asserting on the sender should assert on. */
  readonly sendingNumber: string
}

/**
 * Thrown rather than refused, unlike the mint it wraps. Acceptance turns a refusal
 * into wording on a page because a Leader is standing in front of it; there is
 * nobody in front of this, so a refusal code would only ever be printed.
 *
 * `reason` is prose for an operator, not a code to branch on -- sometimes it is a
 * refusal code (`account.already_exists`, which is the answer they most often
 * need), sometimes a constraint's complaint. Anything wanting to branch should be
 * given a field of its own rather than parsing this one.
 */
export class MinistryNotProvisioned extends Error {
  constructor(
    readonly reason: string,
    /**
     * The account's refusal, when that is what this is: the one field a caller
     * may branch on. A Ministry Setup Link's page turns it into a sentence for
     * the person who typed the password; the seed and the fixture never see it.
     */
    readonly refusal?: AccountCreationRefusal,
  ) {
    super(`Could not provision the Ministry: ${reason}`)
    this.name = 'MinistryNotProvisioned'
  }
}

export const provisionMinistry = async (
  ministry: NewMinistry,
): Promise<ProvisionedMinistry> => {
  // The same reading of a phone number the Roster, the Intake form and the sign-in
  // form use. Read once and then used for both the credential and the Person row,
  // so an operator typing `(555) 123-4567` cannot end up with an account normalised
  // one way and a record written the other -- which is the failure
  // `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md` warns about, a
  // number that is load-bearing in three separate ways.
  const phone = asPhoneNumber(ministry.admin.phone)
  if (!phone) throw new MinistryNotProvisioned(`unreadable phone number: ${ministry.admin.phone}`)

  // The Ministry's own number, read the same way and refused the same way. It is
  // subject to `ministry_sending_number_is_e164` regardless, so an unreadable one
  // was never going to be stored -- but it would have failed two statements later,
  // inside the transaction and after the account was minted, which turns an
  // operator's typo into a Postgres constraint message and a compensating discard.
  // Read here, both numbers are known good before anything exists to undo.
  const sendingNumber = asPhoneNumber(ministry.sendingNumber)
  if (!sendingNumber) {
    throw new MinistryNotProvisioned(`unreadable sending number: ${ministry.sendingNumber}`)
  }

  // The account first, and nothing written before it. It is the one step that can
  // be refused for a reason the operator caused -- a number that already signs
  // somebody in, a password too short to be worth having -- and a Ministry created
  // ahead of it would be a Ministry nobody can sign in to.
  //
  // The same mint Acceptance uses, so "a phone identity, no email" is decided once.
  const account = await supabaseAccounts.create(phone, ministry.admin.password)
  if ('refusal' in account) throw new MinistryNotProvisioned(account.refusal, account.refusal)

  /**
   * The three rows go in one transaction, on the connection the command boundary
   * uses -- and deliberately without `set local role discipler_command`, which is
   * the first thing every other write on it does. That role holds `select` on
   * `ministry` and `ministry_member` and nothing more
   * (`20260825000100_ministry_isolation_and_history.sql:249`), because no command
   * has ever needed to create a Ministry. This is the one write that comes before
   * there is a Ministry to scope a command to, so it is the one write that cannot
   * be one.
   *
   * A transaction rather than three writes and a cleanup: Postgres takes the rows
   * back for nothing, which leaves exactly one thing that can be half-done -- the
   * account, which no database can roll back.
   */
  const at = ministry.at ?? new Date()
  const client = new pg.Client({ connectionString: commandDatabaseUrl() })
  await client.connect()

  try {
    await client.query('begin')

    const created = await client.query<{ id: string }>(
      `insert into ministry (name, sending_number) values ($1, $2) returning id`,
      [ministry.name, sendingNumber],
    )
    const ministryId = created.rows[0]!.id

    // The link, and the whole reason this is a product path rather than a fixture.
    // An Admin who is later sent an Invitation Link is found here by Acceptance and
    // reuses this account instead of gaining a second one.
    const person = await client.query<{ id: string }>(
      `insert into person (ministry_id, full_name, phone, user_id)
       values ($1, $2, $3, $4) returning id`,
      [ministryId, ministry.admin.fullName, phone, account.userId],
    )

    // Admin access is this row and nothing else. `unique (ministry_id, user_id)`
    // permits no second one, which is what makes an Admin who leads hold a single
    // row that says `admin`.
    await client.query(
      `insert into ministry_member (ministry_id, user_id, tier) values ($1, $2, 'admin')`,
      [ministryId, account.userId],
    )

    // The first event in this Ministry's history.
    await client.query(
      `insert into ministry_event
         (ministry_id, occurred_at, type, subject_type, subject_id, payload)
       values ($1, $2, 'ministry.opened', 'ministry', $1, $3)`,
      [ministryId, at, JSON.stringify({ name: ministry.name, adminPersonId: person.rows[0]!.id })],
    )

    if (ministry.openedThrough) {
      // Spent only if it is still live *now*, inside the transaction. The page
      // read it as live a moment ago, and a second submit racing this one -- or a
      // link that ran out between the read and the click -- must not open a
      // second Ministry or one on a dead link.
      const spent = await client.query(
        `update ministry_setup
            set consumed_at = $3, opened_ministry_id = $1
          where token = $2 and consumed_at is null and expires_at >= $3
          returning id`,
        [ministryId, ministry.openedThrough, at],
      )
      if (spent.rowCount === 0) {
        const { rows } = await client.query<{ consumed_at: Date | null }>(
          `select consumed_at from ministry_setup where token = $1`,
          [ministry.openedThrough],
        )
        throw new MinistrySetupRefused(
          !rows[0] ? 'setup.not_found' : rows[0].consumed_at ? 'setup.already_used' : 'setup.expired',
        )
      }
    }

    await client.query('commit')

    return {
      ministryId,
      adminUserId: account.userId,
      adminPersonId: person.rows[0]!.id,
      adminPhone: phone,
      sendingNumber,
    }
  } catch (error) {
    await client.query('rollback').catch(() => undefined)

    // The rollback took every row back, so the account is the only thing left --
    // and nothing holds it any more, which is precisely what lets `discard` have
    // it: it refuses an account a Person still points at.
    const failure = messageOf(error)
    try {
      await supabaseAccounts.discard(account.userId)
    } catch (undiscarded) {
      // The one outcome that needs a human, so it is said rather than swallowed.
      // The retry an operator reaches for next is the thing it breaks.
      throw new MinistryNotProvisioned(
        `${failure} -- and the account on ${phone} could not be removed either ` +
          `(${messageOf(undiscarded)}), so that number is taken and provisioning ` +
          `it again will be refused until somebody removes it by hand`,
      )
    }

    // A link's refusal is an answer for the page, not a fault for an operator, and
    // it travels as itself once the account is taken back.
    if (error instanceof MinistrySetupRefused) throw error
    throw new MinistryNotProvisioned(failure)
  } finally {
    await client.end()
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
