import { isKnownTimezone } from './week'
import { isBillingCycle, type BillingCycle } from './offers'
import { newPasswordRefusal, type NewPasswordRefusal } from './accounts'
import { readWording } from './wording'
import { EXPONENTIAL_OFFER } from './launch-terms'
import {
  readPlantApplication,
  type PlantAnswers,
  type PlantFormFields,
  type PlantFormRefusal,
} from './church-plant'

/**
 * What "Set up your account" asks and how its answers are read (Exponential launch,
 * ticket 17). The browser's button is a courtesy; this is the rule.
 */

/** "Where did you hear about us?", in the mock-up's order and words. */
export const HEARD_ABOUT_US = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'online_google', label: 'Online (Google)' },
  { value: 'a_friend', label: 'A friend' },
  { value: 'another_ministry', label: 'Another ministry' },
  { value: 'conferences', label: 'Conferences' },
  { value: 'other_media', label: 'Other media' },
] as const

export type HeardFrom = (typeof HEARD_ABOUT_US)[number]['value']

/** The answer's words, for the email to support@. */
export const heardFromLabel = (heard: HeardFrom): string =>
  HEARD_ABOUT_US.find((choice) => choice.value === heard)!.label

/**
 * What a link already says about where they heard. `EXPO26` from the booth wins over a
 * referral, as the Exponential special offer does when a church holds both, and it
 * counts even after the offer ends: they still came from the conference.
 */
export const heardFromCarried = ({
  code,
  ref,
}: {
  readonly code: string | null
  readonly ref: string | null
}): HeardFrom | null => {
  if (code?.trim().toUpperCase() === EXPONENTIAL_OFFER.code) return 'conferences'
  return ref ? 'another_ministry' : null
}

/** The refusals of the form itself, before anything else is asked. */
export type AccountFormRefusal =
  | NewPasswordRefusal
  | 'signup.church_name_needed'
  | 'signup.full_name_needed'
  | 'signup.bad_timezone'
  | PlantFormRefusal
  | 'signup.bad_cycle'
  | 'signup.terms_needed'

export interface AccountFormFields {
  readonly churchName: string
  readonly fullName: string
  readonly heardFrom: string
  readonly password: string
  readonly timezone: string
  /** Ticket 19's questions. Left out, or anything but "Yes, we are", is not applying. */
  readonly plant?: PlantFormFields
  readonly cycle: string
  readonly agreedToTerms: boolean
}

export interface AccountForm {
  readonly churchName: string
  readonly fullName: string
  readonly heardFrom: HeardFrom | null
  readonly password: string
  readonly timezone: string
  /** The church-plant application, or null for a church that did not apply. */
  readonly plant: PlantAnswers | null
  readonly cycle: BillingCycle
}

const isHeardFrom = (value: string): value is HeardFrom =>
  HEARD_ABOUT_US.some((choice) => choice.value === value)

/**
 * The form as the church opens with it, or why not, top to bottom as it is read. The
 * question they may skip is the one thing not refused: anything but one of its answers
 * reads as no answer, because no person could have chosen it and nothing depends on it.
 */
export const readAccountForm = (
  fields: AccountFormFields,
): { readonly form: AccountForm } | { readonly refusal: AccountFormRefusal } => {
  const churchName = readWording(fields.churchName)
  if (!churchName) return { refusal: 'signup.church_name_needed' }
  const fullName = readWording(fields.fullName)
  if (!fullName) return { refusal: 'signup.full_name_needed' }

  const refused = newPasswordRefusal(fields.password)
  if (refused) return { refusal: refused }

  const timezone = fields.timezone.trim()
  if (!timezone || !isKnownTimezone(timezone)) return { refusal: 'signup.bad_timezone' }

  const application = readPlantApplication(fields.plant)
  if ('refusal' in application) return application

  if (!isBillingCycle(fields.cycle)) return { refusal: 'signup.bad_cycle' }
  if (!fields.agreedToTerms) return { refusal: 'signup.terms_needed' }

  return {
    form: {
      churchName,
      fullName,
      heardFrom: isHeardFrom(fields.heardFrom) ? fields.heardFrom : null,
      password: fields.password,
      timezone,
      plant: application.plant,
      cycle: fields.cycle,
    },
  }
}
