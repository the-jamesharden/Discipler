import type { IntakeFormFields, IntakePath } from '~/domain/intake'

/**
 * One field as the form sent it, and null for a field it did not send or sent as a
 * file. Shared with the routes, which read `via` before they can say what `source`
 * this submission has.
 */
export const textField = (submitted: FormData, name: string): string | null => {
  const value = submitted.get(name)
  return typeof value === 'string' ? value : null
}

/** What a form's `via` field means. There is no third route to Intake. */
const ROUTES: Record<string, string> = { link: 'pastor_link', qr: 'qr_code' }

/**
 * Exactly the two routes, and nothing else mapped onto them. The page decides which
 * one the visitor arrived by -- a bare link is the pastor-sent one, which is the
 * documented primary path -- and says so in the form.
 *
 * Anything else is passed through unchanged so the domain refuses it, because
 * `consent_record.source` is not defaulted and a write that cannot say how a Person
 * came to agree must fail rather than guess.
 */
export const consentSourceOf = (via: string | null): string | null => ROUTES[via ?? ''] ?? via

/**
 * One reader for every route that takes an Intake form: the Ministry-wide page, the
 * tokenized link an Admin sends, and the discipleship wizard. They are the same
 * form arriving three ways, and a second copy of this would eventually disagree
 * with the first about which name a field goes by.
 *
 * Two things are the route's to say rather than the form's, and both are passed in.
 *
 * `source` is how the Person arrived. The Ministry-wide page reads it off the link,
 * because the QR code is the same URL with `?via=qr` on it; the reopen route knows
 * it is a link a pastor sent and says so outright.
 *
 * `intakePath` is which form they were answering, which is decided by the route
 * that was posted to and by nothing in the body. Read as a hidden input it would be
 * a claim anybody could type into a request, and `consent_record` is the one table
 * whose whole job is to be read back in an audit.
 *
 * The answers themselves are read from the body wherever they appear, including on
 * a route that declares no path. That is deliberate: an answer with no form to
 * belong to is refused by `readIntakeForm` rather than quietly dropped.
 */
export const submittedIntakeForm = (
  submitted: FormData,
  known: {
    readonly source: string | null
    readonly intakePath: IntakePath | null
  },
): IntakeFormFields => {
  const text = (name: string) => textField(submitted, name)

  return {
    fullName: text('fullName'),
    phone: text('phone'),
    email: text('email'),
    ageBand: text('ageBand'),
    gender: text('gender'),
    goalId: text('goalId'),
    availability: submitted
      .getAll('availability')
      .filter((value): value is string => typeof value === 'string'),
    smsConsent: text('smsConsent') !== null,
    contactSharing: text('contactSharing'),
    source: known.source,
    intakePath: known.intakePath,
    // `side` on the wire, because that is the name the wizard's URL carries it
    // under and one name is what keeps a hidden input and the query string it lands
    // in from drifting apart.
    declaredSide: text('side'),
    experience: text('experience'),
    // The group form's own screen. Read on every route for the reason the side is:
    // a group named on a route that declares no group path is refused, not dropped.
    groupId: text('groupId'),
  }
}
