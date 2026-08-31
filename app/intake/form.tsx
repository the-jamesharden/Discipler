import { AGE_BANDS, DAY_BLOCKS, WEEKDAYS } from '~/domain/intake'
import type { DiscipleshipGoalOption, IntakePrefill } from '~/service/ports'
import { dayBlockLabel, weekdayLabel } from './copy'

/**
 * The Intake form itself, rendered by both ways in: the Ministry-wide link anybody
 * may open, and the tokenized link an Admin sends one Person so they can correct
 * what it says.
 *
 * One component, because it is one form. The two routes differ in where the
 * submission goes and in whether the fields arrive with answers already in them --
 * not in what is asked, which is the thing a second copy would eventually disagree
 * about.
 */

/**
 * The Ministry-wide link's prefill: none of it. That link does not know who opened
 * it, which is why the form asks -- and a named constant says so at the call site
 * rather than leaving eight nulls inline.
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

export const IntakeForm = ({
  action,
  ministryName,
  goals,
  via,
  prefill,
}: {
  readonly action: string
  readonly ministryName: string
  readonly goals: readonly DiscipleshipGoalOption[]
  readonly via: 'link' | 'qr'
  readonly prefill: IntakePrefill
}) => {
  const selected = new Set(prefill.availability)

  return (
    <form method="post" action={action}>
      {/* The route the Person arrived by, recorded on each consent record. */}
      <input type="hidden" name="via" value={via} />

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

      <button type="submit">Submit</button>
    </form>
  )
}
