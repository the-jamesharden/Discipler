import pg from 'pg'
import type { AccountCreationRefusal } from '~/domain/accounts'
import type { PlantAnswers } from '~/domain/church-plant'
import { SIGN_UP_CONSENT_VERSION, TERMS_VERSION } from '~/domain/consent'
import type { EmailAddress } from '~/domain/email'
import { MinistrySetupRefused } from '~/domain/errors'
import type { MinistrySetupToken } from '~/domain/ministry-setup'
import type { BillingCycle } from '~/domain/offers'
import { REFERRAL_EVENTS } from '~/domain/referral-credit'
import { readReferralCode } from '~/domain/referrals'
import { asPhoneNumber } from '~/domain/roster'
import type { HeardFrom } from '~/domain/sign-up-account'
import { isKnownTimezone } from '~/domain/week'
import type { ChurchOpener } from '~/service/opening-a-church'
import { supabaseAccounts } from './accounts'
import { commandDatabaseUrl } from './credentials'
import { spendPendingSignup } from './pending-signups'

/**
 * How a Ministry and its first Admin come into existence.
 *
 * It is product code rather than a script's private business because the decisions
 * that follow live here, and nothing else in the product could hold them.
 *
 * The first is the credential. The Admin gets a phone identity with a password, the
 * same mint a Leader gets at Acceptance. An Admin who signed up also has the address
 * they proved, and may sign in with either -- see
 * `docs/adr/0030-an-admin-signs-in-with-email-or-phone.md`, and ADR-0008 for everybody
 * without one.
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
 * Three things reach this. Self sign-up, where a church opens itself and spends its
 * proven attempt here (Exponential launch, ticket 17). The Ministry Setup Link, for a
 * church James chooses to comp: the operator mints the link and the Admin spends it
 * here, typing their own password. And the seed script and the test fixture, which
 * have neither and open Ministries directly. What opens a Ministry is spent inside the
 * same transaction that creates it, so neither is ever spent on a Ministry that was
 * not made, and a Ministry is never made on either while it stays live.
 */

export interface NewMinistry {
  readonly name: string
  /**
   * The clock this Ministry's check-in hour, week and quiet hours are read on.
   * Required, because the column's default is UTC, and every Ministry opened
   * before this was asked for kept it and was texted at hours nobody chose
   * (2026-09-25).
   */
  readonly timezone: string
  readonly admin: NewAdmin
  /**
   * The Ministry Setup Link this Ministry is being opened through, when there is
   * one. Refused, not faulted, when the link turns out to be spent or run out by
   * the time the transaction reaches it: the person in front of the page is the
   * one who needs to hear which.
   */
  readonly openedThrough?: MinistrySetupToken
  /**
   * Whether it keeps working with no subscription (Exponential launch, ticket 03).
   * Always so for a Ministry opened through a Setup Link, which is how a comped church
   * opens now that a church can sign itself up; the seed says so for its demo churches.
   * Self sign-up leaves it off.
   */
  readonly billedOutsideStripe?: boolean
  /** What a church signing itself up brings with it. Only self sign-up has one. */
  readonly signedUp?: SignedUpChurch
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
  /** The address a sign-up proved with a code. Every other Admin has none. */
  readonly email?: EmailAddress
}

/** What "Set up your account" adds to a Ministry's opening (ticket 17). */
export interface SignedUpChurch {
  /** The attempt it spends, in the same transaction. */
  readonly pendingSignupId: string
  /** When they pressed "Continue" for this phone, which is their consent's time. */
  readonly agreedAt: Date
  readonly cycle: BillingCycle
  /** As the address carried it, whether or not it applied, or null for none. */
  readonly carriedCode: string | null
  /** The referral code the address carried, as it came, or null for none (ticket 20). */
  readonly carriedRef: string | null
  readonly heardFrom: HeardFrom | null
  /** Its church-plant application, if it made one (ticket 19). */
  readonly plant?: PlantAnswers | null
}

export interface ProvisionedMinistry {
  readonly ministryId: string
  readonly adminUserId: string
  /** The Admin's own row on their Ministry's Roster. */
  readonly adminPersonId: string
  /** The number as it was stored, which is what they sign in with. */
  readonly adminPhone: string
  /**
   * The short name the Ministry was given from its name as it opened, which its
   * readable links are built from (Pastor feedback, ticket 04).
   */
  readonly shortName: string
  /** The church-plant application opened with it, or null for none. */
  readonly plantApplicationId: string | null
  /** Whether a live referral code brought it, and so a `referral` row was written. */
  readonly invited: boolean
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

/**
 * The attempt turned out to be spent inside the transaction, so nothing was opened and
 * the account is taken back. Under the lock `PendingSignups.opening` holds this should
 * not happen; it is what stands behind that lock if it ever does.
 */
export class SignUpAttemptAlreadySpent extends Error {
  constructor() {
    super('This sign-up attempt has already opened a church.')
    this.name = 'SignUpAttemptAlreadySpent'
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

  // No number is provisioned: a Ministry sends from the shared set the moment it
  // exists (Exponential launch, ticket 06).

  // The clock, read before anything exists to undo: a zone the database's check
  // would refuse three statements later is an account minted for a Ministry that
  // never opens.
  if (!isKnownTimezone(ministry.timezone)) {
    throw new MinistryNotProvisioned(`unknown timezone: ${ministry.timezone}`)
  }

  // The account first, and nothing written before it. It is the one step that can
  // be refused for a reason the operator caused -- a number that already signs
  // somebody in, a password too short to be worth having -- and a Ministry created
  // ahead of it would be a Ministry nobody can sign in to.
  //
  // The same mint Acceptance uses, so what an account is made of is decided once.
  const account = await supabaseAccounts.create(phone, ministry.admin.password, ministry.admin.email)
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

  try {
    // Inside, because the account exists by now, and a connection that fails must take it
    // back like anything else that fails: signup.not_opened tells the person to ask again.
    await client.connect()
    await client.query('begin')

    // First, so an attempt that has already opened a church goes no further.
    if (ministry.signedUp && !(await spendPendingSignup(client, ministry.signedUp.pendingSignupId, at))) {
      throw new SignUpAttemptAlreadySpent()
    }

    // The short name is not named here. The database gives it, from the name, in
    // the same statement, because only it can see which names every other
    // Ministry has ever held (`20261014000400_a_readable_link_per_church.sql`).
    const created = await client.query<{ id: string; short_name: string }>(
      `insert into ministry (name, timezone) values ($1, $2)
       returning id, short_name`,
      [ministry.name, ministry.timezone],
    )
    const ministryId = created.rows[0]!.id
    const shortName = created.rows[0]!.short_name

    // Its billing row, there from the first moment so the webhook only ever fills it in.
    await client.query(
      `insert into ministry_billing (ministry_id, billed_outside_stripe) values ($1, $2)`,
      [ministryId, ministry.openedThrough !== undefined || ministry.billedOutsideStripe === true],
    )

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

    // The first event in this Ministry's history, with the short name it opened
    // under: a later rename records what it changed from, and this is where the
    // first one is written down.
    await client.query(
      `insert into ministry_event
         (ministry_id, occurred_at, type, subject_type, subject_id, payload)
       values ($1, $2, 'ministry.opened', 'ministry', $1, $3)`,
      [
        ministryId,
        at,
        JSON.stringify({ name: ministry.name, adminPersonId: person.rows[0]!.id, shortName }),
      ],
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

    let plantApplicationId: string | null = null
    let invited = false

    if (ministry.signedUp) {
      const { agreedAt, cycle, carriedCode, carriedRef, heardFrom, plant } = ministry.signedUp

      await client.query(
        `insert into church_signup (ministry_id, billing_cycle, carried_code, heard_from)
         values ($1, $2, $3, $4)`,
        [ministryId, cycle, carriedCode, heardFrom],
      )

      // `sms`, because the outbound trigger asks `app.current_consent(person, 'sms')`
      // before the test check-in, and that function ignores the source. It stops short
      // of the Check-In Rhythm because being in a relationship takes an Intake, whose own
      // decision comes later and wins. It is not an Intake: `participation_status` still
      // reads this Admin as having none. `docs/consent-language.md`.
      await client.query(
        `insert into consent_record
           (ministry_id, person_id, consent, granted, version, source, decided_at)
         values ($1, $2, 'sms', true, $3, 'ministry_setup', $4)`,
        [ministryId, person.rows[0]!.id, SIGN_UP_CONSENT_VERSION, agreedAt],
      )

      await client.query(
        `insert into ministry_event
           (ministry_id, occurred_at, type, subject_type, subject_id, payload)
         values ($1, $2, 'ministry.terms_accepted', 'ministry', $1, $3)`,
        [ministryId, at, JSON.stringify({ termsVersion: TERMS_VERSION, adminPersonId: person.rows[0]!.id })],
      )

      // Here, so a church is never opened with its application lost: ticket 19. The email
      // about it goes after the commit, and is not what keeps it.
      if (plant) {
        const application = await client.query<{ id: string }>(
          `insert into church_plant_application
             (ministry_id, launch_date, sending_church, average_attendance, lead_pastor, anything_else, applied_at)
           values ($1, $2, $3, $4, $5, $6, $7)
           returning id`,
          [
            ministryId,
            plant.launchDate,
            plant.sendingChurch,
            plant.averageAttendance,
            plant.leadPastor,
            plant.anythingElse,
            at,
          ],
        )
        plantApplicationId = application.rows[0]!.id
      }

      // Only a live code, read here and not on the page, so a code retired while the form
      // sat open invites nobody. A referral is written even beside `EXPO26`, because the
      // inviting church earns its credit whichever offer this church got (ticket 32). The
      // row is the whole of what a church's free month rests on: `wasInvited` reads it.
      const code = readReferralCode(carriedRef)
      if (code) {
        const recorded = await client.query(
          `insert into referral (invited_church, inviting_church, referral_code, invited_at)
           select $1::uuid, held.ministry_id, held.id, $3::timestamptz
             from referral_code held
            where held.code = $2 and held.retired_at is null`,
          [ministryId, code, at],
        )
        invited = recorded.rowCount === 1

        // On the inviting church's own history, with an ID that opens nothing it can read.
        await client.query(
          `insert into ministry_event (ministry_id, occurred_at, type, subject_type, subject_id)
           select inviting_church, $2::timestamptz, $3, 'referral', id
             from referral
            where invited_church = $1 and inviting_church is not null`,
          [ministryId, at, REFERRAL_EVENTS.signedUp],
        )
      }
    }

    await client.query('commit')

    return {
      ministryId,
      adminUserId: account.userId,
      adminPersonId: person.rows[0]!.id,
      adminPhone: phone,
      shortName,
      plantApplicationId,
      invited,
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
    if (error instanceof MinistrySetupRefused || error instanceof SignUpAttemptAlreadySpent) throw error
    throw new MinistryNotProvisioned(failure)
  } finally {
    await client.end()
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * `provisionMinistry` as "Set up your account" asks for it, with its throws turned into
 * answers (Exponential launch, ticket 17). A fault still throws, and `reason`, which is
 * prose for an operator and can hold a phone, is never read here.
 */
export const openSignedUpChurch: ChurchOpener = async (church) => {
  try {
    const provisioned = await provisionMinistry({
      name: church.churchName,
      timezone: church.timezone,
      at: church.at,
      admin: church.admin,
      signedUp: {
        pendingSignupId: church.pendingSignupId,
        agreedAt: church.agreedAt,
        cycle: church.cycle,
        carriedCode: church.carriedCode,
        carriedRef: church.carriedRef,
        heardFrom: church.heardFrom,
        plant: church.plant ?? null,
      },
    })
    return {
      ministryId: provisioned.ministryId,
      plantApplicationId: provisioned.plantApplicationId,
      invited: provisioned.invited,
    }
  } catch (error) {
    if (error instanceof SignUpAttemptAlreadySpent) return { alreadyOpened: true }
    if (error instanceof MinistryNotProvisioned && error.refusal) return { refusal: error.refusal }
    throw error
  }
}
