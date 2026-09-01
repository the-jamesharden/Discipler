import pg from 'pg'
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
 * These writes record no history, and that is a gap rather than a decision. Every
 * other Person reaches the Roster through the command boundary and leaves a
 * `person.imported` or Intake event behind; this one runs beside that boundary
 * rather than through it, because there is no Ministry to scope a command to until
 * the row it would be scoped to exists. Whether a Ministry opening and its first
 * Admin arriving are ministry events in their own right is in
 * `docs/open-questions.md` and is deliberately not answered here.
 */

export interface NewMinistry {
  readonly name: string
  /**
   * The number this Ministry's messages are sent from. Provisioned with the
   * Ministry because a Ministry without one cannot send anything, and borrowing
   * another Ministry's identity is worse than refusing to send.
   */
  readonly sendingNumber: string
  readonly admin: NewAdmin
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
  constructor(readonly reason: string) {
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

  // The account first, and nothing written before it. It is the one step that can
  // be refused for a reason the operator caused -- a number that already signs
  // somebody in, a password too short to be worth having -- and a Ministry created
  // ahead of it would be a Ministry nobody can sign in to.
  //
  // The same mint Acceptance uses, so "a phone identity, no email" is decided once.
  const account = await supabaseAccounts.create(phone, ministry.admin.password)
  if ('refusal' in account) throw new MinistryNotProvisioned(account.refusal)

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
  const client = new pg.Client({ connectionString: commandDatabaseUrl() })
  await client.connect()

  try {
    await client.query('begin')

    const created = await client.query<{ id: string }>(
      `insert into ministry (name, sending_number) values ($1, $2) returning id`,
      [ministry.name, ministry.sendingNumber],
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

    await client.query('commit')

    return {
      ministryId,
      adminUserId: account.userId,
      adminPersonId: person.rows[0]!.id,
      adminPhone: phone,
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

    throw new MinistryNotProvisioned(failure)
  } finally {
    await client.end()
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
