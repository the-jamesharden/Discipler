import { AGE_BANDS, DAY_BLOCKS, WEEKDAYS } from '~/domain/intake'
import type { DiscipleshipGoalOption, IntakePrefill, JoinableGroup } from '~/service/ports'
import { dayBlockLabel, GROUP_QUESTION, weekdayLabel } from './copy'

/**
 * The questions Intake asks, each as its own piece.
 *
 * There are two forms now -- the single page anybody may open, and the discipleship
 * wizard that spreads the same questions across screens -- and they ask the same
 * things. Split here rather than copied, because the copy that matters most is the
 * one it would be worst to have two of: the SMS agreement is the wording a consent
 * record points at by version, and two screens quietly drifting apart would leave
 * `consent_record.version` naming text that depends on which form somebody used.
 */

/**
 * No prefill at all: the answer for a form that does not know who opened it, which
 * is both the Ministry-wide page and every screen of the wizard. A named constant
 * says so at the call site rather than leaving eight nulls inline.
 *
 * It lives here beside the fields it fills in, because both forms need it and
 * neither owns it.
 */
export const NOTHING_PREFILLED: IntakePrefill = {
  fullName: null,
  phone: null,
  email: null,
  ageBand: null,
  gender: null,
  goalId: null,
  availability: [],
  contactSharing: null,
}

export const ContactFields = ({ prefill }: { readonly prefill: IntakePrefill }) => (
  <>
    <label htmlFor="fullName">Your name</label>
    <input
      id="fullName"
      name="fullName"
      required
      autoComplete="name"
      defaultValue={prefill.fullName ?? ''}
    />

    <label htmlFor="phone">Mobile number</label>
    <input
      id="phone"
      name="phone"
      type="tel"
      required
      autoComplete="tel"
      defaultValue={prefill.phone ?? ''}
    />

    <label htmlFor="email">Email (optional)</label>
    <input
      id="email"
      name="email"
      type="email"
      autoComplete="email"
      defaultValue={prefill.email ?? ''}
    />
  </>
)

/**
 * Thirty-five slots, and the same thirty-five whichever form is asking. Pairing
 * counts the overlap between two people, and a count only means something when both
 * sides used the same grid.
 */
export const AvailabilityGrid = ({
  availability,
}: {
  readonly availability: readonly string[]
}) => {
  const selected = new Set(availability)

  return (
    <fieldset>
      <legend>When could you meet?</legend>
      <p className="subtle">Select every time that could work — not just your best one.</p>
      <table>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Time of day</span>
            </th>
            {WEEKDAYS.map((day) => (
              <th scope="col" key={day}>
                {weekdayLabel[day]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_BLOCKS.map((block) => (
            <tr key={block}>
              <th scope="row">{dayBlockLabel[block]}</th>
              {WEEKDAYS.map((day) => (
                <td key={day}>
                  <label>
                    <span className="visually-hidden">
                      {weekdayLabel[day]} {dayBlockLabel[block]}
                    </span>
                    <input
                      type="checkbox"
                      name="availability"
                      value={`${day}:${block}`}
                      defaultChecked={selected.has(`${day}:${block}`)}
                    />
                  </label>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  )
}

export const GoalField = ({
  goals,
  prefill,
}: {
  readonly goals: readonly DiscipleshipGoalOption[]
  readonly prefill: IntakePrefill
}) => (
  <>
    <label htmlFor="goalId">What are you hoping for?</label>
    <select id="goalId" name="goalId" required defaultValue={prefill.goalId ?? ''}>
      <option value="" disabled>
        Choose one
      </option>
      {goals.map((goal) => (
        <option key={goal.id} value={goal.id}>
          {goal.label}
        </option>
      ))}
    </select>
  </>
)

/**
 * The group form's one question of its own, in the Goal's place: which of the
 * Ministry's groups the Person would like to join. The list arrives already
 * filtered for the gender they answered on the screen before, and shows a name
 * and nothing else -- not who leads it, not who is in it, and not whether picking
 * it asks or joins, which the done page says instead. A dropdown that marked the
 * guarded groups would invite choosing by friction rather than by fit.
 */
export const GroupField = ({
  groups,
  chosen,
}: {
  readonly groups: readonly JoinableGroup[]
  readonly chosen: string | null
}) => (
  <>
    <label htmlFor="groupId">{GROUP_QUESTION}</label>
    <select id="groupId" name="groupId" required defaultValue={chosen ?? ''}>
      <option value="" disabled>
        Choose one
      </option>
      {groups.map((group) => (
        <option key={group.relationshipId} value={group.relationshipId}>
          {group.name}
        </option>
      ))}
    </select>
  </>
)

/** A band and never an exact age. See docs/adr/0001-pairing-suggestion-inputs.md. */
export const AgeBandField = ({ prefill }: { readonly prefill: IntakePrefill }) => (
  <>
    <label htmlFor="ageBand">Your age</label>
    <select id="ageBand" name="ageBand" required defaultValue={prefill.ageBand ?? ''}>
      <option value="" disabled>
        Choose one
      </option>
      {AGE_BANDS.map((band) => (
        <option key={band} value={band}>
          {band}
        </option>
      ))}
    </select>
  </>
)

/**
 * The absolute pairing constraint, which a Ministry may disable only in settings.
 * Asked of everybody, on every form.
 */
export const GenderField = ({ prefill }: { readonly prefill: IntakePrefill }) => (
  <fieldset>
    <legend>Gender</legend>
    <label>
      <input
        type="radio"
        name="gender"
        value="female"
        required
        defaultChecked={prefill.gender === 'female'}
      />{' '}
      Female
    </label>
    <label>
      <input
        type="radio"
        name="gender"
        value="male"
        required
        defaultChecked={prefill.gender === 'male'}
      />{' '}
      Male
    </label>
  </fieldset>
)

/**
 * Both consents, and always on the screen with the Submit button. The checkbox that
 * grants consent belongs on the same screen as the write it authorises.
 */
export const Agreements = ({
  ministryName,
  prefill,
}: {
  readonly ministryName: string
  readonly prefill: IntakePrefill
}) => (
  <fieldset>
    <legend>Agreements</legend>

    {/*
      Never prefilled, even where everything above it is. This checkbox is the
      Person granting consent, and a box already ticked on their behalf is not
      them granting anything -- it is Discipler remembering that they once did.
      The Person who has changed their mind reaches STOP, which the refusal
      message names.
    */}
    <label>
      <input type="checkbox" name="smsConsent" value="yes" required /> I agree to
      receive text messages from {ministryName} through Discipler about my
      discipleship relationship, including a weekly check-in. Message frequency
      varies. Message and data rates may apply. Reply STOP to opt out or HELP for
      help.
    </label>

    {/*
      Two answers rather than one checkbox, because declining has to be
      something the Person did rather than something they skipped. Agreeing to
      hear from your church is not agreeing to hand your number to a congregant.

      This one *is* prefilled with what they last said, unlike the agreement
      above it: it is a choice between two answers, and showing them the one they
      currently stand by is what lets them change it.
    */}
    <p>
      May we share your name and phone number with {ministryName} and with the
      people in the discipleship relationship you are placed in — the leader, and
      anyone else being discipled alongside you?
    </p>
    <label>
      <input
        type="radio"
        name="contactSharing"
        value="granted"
        required
        defaultChecked={prefill.contactSharing === 'granted'}
      />{' '}
      Yes, that is fine
    </label>
    <label>
      <input
        type="radio"
        name="contactSharing"
        value="declined"
        required
        defaultChecked={prefill.contactSharing === 'declined'}
      />{' '}
      No, please do not
    </label>
  </fieldset>
)
