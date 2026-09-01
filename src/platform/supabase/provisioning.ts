import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { asPhoneNumber } from '~/domain/roster'
import { supabaseAccounts } from './accounts'
import { serviceRoleKey, supabaseCredentials } from './credentials'

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
 * `person.imported` or Intake event behind; this one is written on the service-role
 * connection because there is no Ministry to scope a command to until the row it
 * would be scoped to exists. Whether a Ministry opening and its first Admin
 * arriving are ministry events in their own right is in
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
 * nobody in front of this, so a refusal code would only ever be printed. The code
 * itself is carried through as the reason, because "that number already signs
 * somebody in" is the answer an operator most often needs.
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
  const admin = createClient(supabaseCredentials().url, serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

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

  let ministryId: string | undefined

  try {
    const { data: created, error: ministryError } = await admin
      .from('ministry')
      .insert({ name: ministry.name, sending_number: ministry.sendingNumber })
      .select('id')
      .single()
    if (ministryError) throw new MinistryNotProvisioned(ministryError.message)
    ministryId = created.id

    // The link, and the whole reason this is a product path rather than a fixture.
    // An Admin who is later sent an Invitation Link is found here by Acceptance and
    // reuses this account instead of gaining a second one.
    const { data: person, error: personError } = await admin
      .from('person')
      .insert({
        ministry_id: created.id,
        full_name: ministry.admin.fullName,
        phone,
        user_id: account.userId,
      })
      .select('id')
      .single()
    if (personError) throw new MinistryNotProvisioned(personError.message)

    // Admin access is this row and nothing else. `unique (ministry_id, user_id)`
    // permits no second one, which is what makes an Admin who leads hold a single
    // row that says `admin`.
    const { error: memberError } = await admin
      .from('ministry_member')
      .insert({ ministry_id: created.id, user_id: account.userId, tier: 'admin' })
    if (memberError) throw new MinistryNotProvisioned(memberError.message)

    return {
      ministryId: created.id,
      adminUserId: account.userId,
      adminPersonId: person.id,
      adminPhone: phone,
    }
  } catch (error) {
    // Four writes across two systems and no transaction spanning them, so a failure
    // part-way is cleaned up here. Best-effort, and said plainly rather than
    // promised: nothing above this line can roll back, and a cleanup that failed
    // must not replace the error the operator actually needs to read.
    //
    // The Ministry goes first and everything under it cascades, which is what frees
    // the account: `discard` refuses one a Person still holds, and until the Person
    // row is gone that is exactly what this is. So the delete failing means the
    // discard fails too, and what is left behind is a Ministry holding a number
    // nobody can sign in with. That state is reachable, and the operator is told
    // about it rather than left to find it -- because the retry they will reach for
    // is the thing it breaks.
    const left = await cleanUp(admin, ministryId, account.userId)
    if (left) {
      throw new MinistryNotProvisioned(
        `${left}. The original failure was: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    throw error
  }
}

/**
 * Undoes as much of a failed provisioning as it can, and reports what it could not.
 * A string back means something survives that needs a human; `undefined` means the
 * attempt left nothing behind and the caller may re-throw its own failure untouched.
 */
const cleanUp = async (
  admin: SupabaseClient,
  ministryId: string | undefined,
  userId: string,
): Promise<string | undefined> => {
  if (ministryId) {
    const { error } = await admin.from('ministry').delete().eq('id', ministryId)
    if (error) {
      return `Ministry ${ministryId} and the account on ${userId} were both left behind and need removing by hand (${error.message})`
    }
  }

  try {
    await supabaseAccounts.discard(userId)
  } catch (error) {
    return `the account on ${userId} was left behind and needs removing by hand (${error instanceof Error ? error.message : String(error)})`
  }

  return undefined
}
