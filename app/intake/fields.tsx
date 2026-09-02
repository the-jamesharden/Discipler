import { AGE_BANDS, SLOT_HOURS, WEEKDAYS } from '~/domain/intake'
import type { DiscipleshipGoalOption, IntakePrefill, JoinableGroup } from '~/service/ports'
import { GROUP_QUESTION, hourLabel, selectedSummary, weekdayFullLabel, weekdayLabel } from './copy'

/**
 * The questions Intake asks, each as its own piece.
 *
 * There are two forms now -- the single page anybody may open, and the discipleship
 * wizard that spreads the same questions across screens -- and they ask the same
 * things. Split here rather than copied, because the copy that matters most is the
 * one it would be worst to have two of: the SMS agreement is the wording a consent
 * record points at by version, and two screens quietly drifting apart would leave
 * `consent_record.version` naming text that depends on which form somebody used.
 *
 * Every control is a real form field. The design's option buttons are labels
 * around radios, painted by the stylesheet, so the screens work before any script
 * has loaded and read as radio groups to assistive technology.
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
    <div className="field">
      <label className="label" htmlFor="fullName">
        Your name
      </label>
      <input
        id="fullName"
        name="fullName"
        required
        autoComplete="name"
        defaultValue={prefill.fullName ?? ''}
      />
    </div>

    <div className="field">
      <label className="label" htmlFor="phone">
        Mobile number
      </label>
      <input
        id="phone"
        name="phone"
        type="tel"
        required
        autoComplete="tel"
        defaultValue={prefill.phone ?? ''}
      />
    </div>

    <div className="field">
      <label className="label" htmlFor="email">
        Email (optional)
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={prefill.email ?? ''}
      />
    </div>
  </>
)

/** How many distinct days a set of slot keys touches. */
const daysAmong = (keys: ReadonlySet<string>): number =>
  new Set([...keys].map((key) => key.split(':')[0])).size

/**
 * Eighty-four slots, and the same eighty-four whichever form is asking. Pairing
 * counts the overlap between two people, and a count only means something when both
 * sides used the same grid. Days down the vertical axis and hours across, 8am to
 * 8pm, each cell a checkbox filling the square.
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
      <p className="subtle">Select every hour that could work — not just your best one.</p>
      <ul className="avail-legend">
        <li>
          <i style={{ background: 'rgba(45, 80, 22, 0.06)' }} /> Not available
        </li>
        <li>
          <i style={{ background: 'rgba(127, 175, 140, 0.65)', borderColor: 'var(--primary-light)' }} />{' '}
          Available
        </li>
      </ul>
      <div className="grid-wrap">
        <table className="avail">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Day</span>
              </th>
              {SLOT_HOURS.map((hour) => (
                <th scope="col" key={hour}>
                  {hourLabel[hour]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day) => (
              <tr key={day}>
                <th scope="row" abbr={weekdayFullLabel[day]}>
                  {weekdayLabel[day]}
                </th>
                {SLOT_HOURS.map((hour) => (
                  <td key={hour} className="pick">
                    <label>
                      <span className="visually-hidden">
                        {weekdayFullLabel[day]} {hourLabel[hour]}
                      </span>
                      <input
                        type="checkbox"
                        name="availability"
                        value={`${day}:${hour}`}
                        defaultChecked={selected.has(`${day}:${hour}`)}
                      />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Rendered from what was carried in, so it is right on the way back to this
          screen and after a refresh. With no script it does not follow the ticks
          live, and the sentence is still true of what was saved. */}
      <p className="grid-count">{selectedSummary(selected.size, daysAmong(selected))}</p>
    </fieldset>
  )
}

/**
 * One goal from the Ministry's own list, as option buttons. One rather than the
 * design's several: the Goal is the suggestion tiebreaker and the backend records
 * one (ticket 21, ADR-0014) -- decision 7 of ticket 31.
 */
export const GoalField = ({
  goals,
  prefill,
}: {
  readonly goals: readonly DiscipleshipGoalOption[]
  readonly prefill: IntakePrefill
}) => (
  <fieldset>
    <legend>What are you hoping for?</legend>
    <p className="subtle">Choose the one that fits best.</p>
    <div className="choices grid-2">
      {goals.map((goal) => (
        <label key={goal.id} className="option" htmlFor={`goal:${goal.id}`}>
          <input
            id={`goal:${goal.id}`}
            type="radio"
            name="goalId"
            value={goal.id}
            required
            defaultChecked={prefill.goalId === goal.id}
          />
          {goal.label}
        </label>
      ))}
    </div>
  </fieldset>
)

/**
 * The group form's one question of its own, in the Goal's place: which of the
 * Ministry's groups the Person would like to join. The list arrives already
 * filtered for the gender they answered on the screen before, and shows a name
 * and nothing else -- not who leads it, not who is in it, and not whether picking
 * it asks or joins, which the done page says instead. A list that marked the
 * guarded groups would invite choosing by friction rather than by fit.
 */
export const GroupField = ({
  groups,
  chosen,
}: {
  readonly groups: readonly JoinableGroup[]
  readonly chosen: string | null
}) => (
  <fieldset>
    <legend>{GROUP_QUESTION}</legend>
    <div className="choices stack">
      {groups.map((group) => (
        <label key={group.relationshipId} className="option" htmlFor={`group:${group.relationshipId}`}>
          <input
            id={`group:${group.relationshipId}`}
            type="radio"
            name="groupId"
            value={group.relationshipId}
            required
            defaultChecked={chosen === group.relationshipId}
          />
          <span className="option-title">{group.name}</span>
        </label>
      ))}
    </div>
  </fieldset>
)

/** A band and never an exact age. See docs/adr/0001-pairing-suggestion-inputs.md. */
export const AgeBandField = ({ prefill }: { readonly prefill: IntakePrefill }) => (
  <fieldset>
    <legend className="plain">Age range</legend>
    <div className="choices grid-3">
      {AGE_BANDS.map((band) => (
        <label key={band} className="option centred-text" htmlFor={`ageBand:${band}`}>
          <input
            id={`ageBand:${band}`}
            type="radio"
            name="ageBand"
            value={band}
            required
            defaultChecked={prefill.ageBand === band}
          />
          <span className="option-title">{band}</span>
        </label>
      ))}
    </div>
  </fieldset>
)

/**
 * The absolute pairing constraint, which a Ministry may disable only in settings.
 * Asked of everybody, on every form. Exactly two options: `GENDERS` is male and
 * female, and gender is a pairing constraint -- decision 6 of ticket 31.
 */
export const GenderField = ({ prefill }: { readonly prefill: IntakePrefill }) => (
  <fieldset>
    <legend className="plain">Gender</legend>
    <div className="choices">
      <label className="option centred-text" htmlFor="gender:female">
        <input
          id="gender:female"
          type="radio"
          name="gender"
          value="female"
          required
          defaultChecked={prefill.gender === 'female'}
        />
        Female
      </label>
      <label className="option centred-text" htmlFor="gender:male">
        <input
          id="gender:male"
          type="radio"
          name="gender"
          value="male"
          required
          defaultChecked={prefill.gender === 'male'}
        />
        Male
      </label>
    </div>
  </fieldset>
)

/**
 * Both consents, and always on the screen with the Submit button. The checkbox that
 * grants consent belongs on the same screen as the write it authorises.
 *
 * The wording is carried over verbatim from the form that first asked it, because
 * a consent record points at this wording by version.
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
    <label className="check">
      <input type="checkbox" name="smsConsent" value="yes" required />
      <span>
        I agree to receive text messages from {ministryName} through Discipler about
        my discipleship relationship, including a weekly check-in. Message frequency
        varies. Message and data rates may apply. Reply STOP to opt out or HELP for
        help.
      </span>
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
    <label className="check">
      <input
        type="radio"
        name="contactSharing"
        value="granted"
        required
        defaultChecked={prefill.contactSharing === 'granted'}
      />
      <span>Yes, that is fine</span>
    </label>
    <label className="check">
      <input
        type="radio"
        name="contactSharing"
        value="declined"
        required
        defaultChecked={prefill.contactSharing === 'declined'}
      />
      <span>No, please do not</span>
    </label>
  </fieldset>
)
