import {
  AGE_BANDS,
  DECLARED_SIDES,
  EXPERIENCE_ANSWERS,
  GROUP_PATH,
  NO_GROUP_IN_MIND,
  ONE_TO_TWO_ANSWERS,
  OTHER_GOAL,
  SLOT_HOURS,
  WEEKDAYS,
  type DeclaredSide,
  type ExperienceAnswer,
  type OneToTwoAnswer,
} from '~/domain/intake'
import {
  isOwnQuestion,
  presetForm,
  questionOn,
  type BuiltInQuestion,
  type FormQuestion,
  type OwnQuestion,
} from '~/domain/intake-form'
import { LONG_TEXT_LIMIT, NO, SHORT_TEXT_LIMIT, YES } from '~/domain/own-answers'
import type { DiscipleshipGoalOption, IntakePrefill, JoinableGroup } from '~/service/ports'
import {
  DONE_BEFORE_ANSWER,
  DONE_BEFORE_DESCRIPTION,
  FIRST_TIME_ANSWER,
  FIRST_TIME_DESCRIPTION,
  GOAL_OTHER_BOX,
  GOAL_OTHER_OPTION,
  hourLabel,
  NO_GROUP_IN_MIND_ANSWER,
  noGroupInMindDescription,
  oneToTwoAnswerLabel,
  oneToTwoDescription,
  selectedSummary,
  sideDescription,
  sideLabel,
  weekdayFullLabel,
  weekdayLabel,
  AS_MANY_AS_APPLY,
  workingThrough,
  YES_NO_LABEL,
} from './copy'

/**
 * The questions Intake asks, each as its own piece.
 *
 * There are three forms -- the single page an Admin's link reopens, and the two
 * wizards that spread the same questions across screens -- and they ask the same
 * things. Split here rather than copied, because the copy that matters most is the
 * one it would be worst to have two of: the SMS agreement is the wording a consent
 * record points at by version, and two screens quietly drifting apart would leave
 * `consent_record.version` naming text that depends on which form somebody used.
 *
 * Each question is asked in the words of the Ministry's own form (Pastor feedback,
 * ticket 11): its wording, its hint and whether it may be left. A field handed no
 * question asks in the preset's words, which are today's -- the reopened single
 * page is one of those.
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
  goalOther: null,
  availability: [],
  contactSharing: null,
  own: {},
}

/** The preset's question, for a field asked without a form: today's words. */
const preset = (key: BuiltInQuestion): FormQuestion =>
  questionOn(presetForm('discipleship'), key) ?? questionOn(presetForm(GROUP_PATH), key)!

/**
 * A question's wording as somebody reads it: said to be optional where the form
 * lets it be left, which is how the email has always read -- *Email (optional)*.
 */
export const asAsked = (question: FormQuestion, wording: string = question.wording): string =>
  question.required ? wording : `${wording} (optional)`

/** The line under a question, where the form gives it one. */
const Hint = ({ question }: { readonly question: FormQuestion }) =>
  question.hint ? <p className="subtle">{question.hint}</p> : null

export const NameField = ({
  prefill,
  asked = preset('fullName'),
}: {
  readonly prefill: IntakePrefill
  readonly asked?: FormQuestion
}) => (
  <div className="field">
    <label className="label" htmlFor="fullName">
      {asAsked(asked)}
    </label>
    <Hint question={asked} />
    <input
      id="fullName"
      name="fullName"
      required
      autoComplete="name"
      defaultValue={prefill.fullName ?? ''}
    />
  </div>
)

export const PhoneField = ({
  prefill,
  asked = preset('phone'),
}: {
  readonly prefill: IntakePrefill
  readonly asked?: FormQuestion
}) => (
  <div className="field">
    <label className="label" htmlFor="phone">
      {asAsked(asked)}
    </label>
    <Hint question={asked} />
    <input
      id="phone"
      name="phone"
      type="tel"
      required
      autoComplete="tel"
      defaultValue={prefill.phone ?? ''}
    />
  </div>
)

export const EmailField = ({
  prefill,
  asked = preset('email'),
}: {
  readonly prefill: IntakePrefill
  readonly asked?: FormQuestion
}) => (
  <div className="field">
    <label className="label" htmlFor="email">
      {asAsked(asked)}
    </label>
    <Hint question={asked} />
    <input
      id="email"
      name="email"
      type="email"
      required={asked.required}
      autoComplete="email"
      defaultValue={prefill.email ?? ''}
    />
  </div>
)

/** The three ways to reach somebody, together, as the reopened single page asks them. */
export const ContactFields = ({ prefill }: { readonly prefill: IntakePrefill }) => (
  <>
    <NameField prefill={prefill} />
    <PhoneField prefill={prefill} />
    <EmailField prefill={prefill} />
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
  asked = preset('availability'),
}: {
  readonly availability: readonly string[]
  readonly asked?: FormQuestion
}) => {
  const selected = new Set(availability)

  return (
    <fieldset>
      <legend>{asAsked(asked)}</legend>
      <Hint question={asked} />
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
 *
 * Then *Other*, last on every Ministry's form and not one of its options, which
 * opens a box for the Person's own words (Pastor feedback 2026-10, ticket 06). It
 * is the same radio group, so the goal stays one choice.
 *
 * The box is opened by the stylesheet and no script, as the option buttons are
 * painted: it is hidden while Other is not ticked, and shown always by a browser
 * that cannot tell, which is the safe way round. It carries no `required`, because
 * a required box that is hidden would stop somebody who chose an option from
 * submitting at all; Other with the box empty is refused when it arrives, the way
 * every other unanswered question on this form is.
 */
export const GoalField = ({
  goals,
  prefill,
  asked = preset('goalId'),
}: {
  readonly goals: readonly DiscipleshipGoalOption[]
  readonly prefill: IntakePrefill
  readonly asked?: FormQuestion
}) => (
  <fieldset className="goal-question">
    <legend>{asAsked(asked)}</legend>
    <Hint question={asked} />
    <div className="choices grid-2">
      {goals.map((goal) => (
        <label key={goal.id} className="option" htmlFor={`goal:${goal.id}`}>
          <input
            id={`goal:${goal.id}`}
            type="radio"
            name="goalId"
            value={goal.id}
            required={asked.required}
            defaultChecked={prefill.goalId === goal.id}
          />
          {goal.label}
        </label>
      ))}
      <label className="option" htmlFor={`goal:${OTHER_GOAL}`}>
        <input
          id={`goal:${OTHER_GOAL}`}
          type="radio"
          name="goalId"
          value={OTHER_GOAL}
          required={asked.required}
          defaultChecked={prefill.goalOther !== null}
        />
        {GOAL_OTHER_OPTION}
      </label>
    </div>
    <div className="field goal-other">
      <label className="label" htmlFor="goalOther">
        {GOAL_OTHER_BOX}
      </label>
      <input id="goalOther" name="goalOther" type="text" defaultValue={prefill.goalOther ?? ''} />
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
  ministryName,
  asked = preset('groupId'),
}: {
  readonly groups: readonly JoinableGroup[]
  readonly chosen: string | null
  readonly ministryName: string
  readonly asked?: FormQuestion
}) => (
  <fieldset>
    <legend>{asAsked(asked)}</legend>
    <Hint question={asked} />
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
          {group.materialTitle ? (
            <span className="option-desc">{workingThrough(group.materialTitle)}</span>
          ) : null}
        </label>
      ))}
      {/* The last option in the same radio group, dashed, so the step still
          submits once and works with no script (Group form exits, ticket 01,
          S-7). It names no group, and the Ministry is asked to place them. */}
      <label className="option dashed" htmlFor={`group:${NO_GROUP_IN_MIND}`}>
        <input
          id={`group:${NO_GROUP_IN_MIND}`}
          type="radio"
          name="groupId"
          value={NO_GROUP_IN_MIND}
          required
          defaultChecked={chosen === NO_GROUP_IN_MIND}
        />
        <span className="option-title">{NO_GROUP_IN_MIND_ANSWER}</span>
        <span className="option-desc">{noGroupInMindDescription(ministryName)}</span>
      </label>
    </div>
  </fieldset>
)

/** A band and never an exact age. See docs/adr/0001-pairing-suggestion-inputs.md. */
export const AgeBandField = ({
  prefill,
  asked = preset('ageBand'),
}: {
  readonly prefill: IntakePrefill
  readonly asked?: FormQuestion
}) => (
  <fieldset>
    <legend className="plain">{asAsked(asked)}</legend>
    <Hint question={asked} />
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
export const GenderField = ({
  prefill,
  asked = preset('gender'),
}: {
  readonly prefill: IntakePrefill
  readonly asked?: FormQuestion
}) => (
  <fieldset>
    <legend className="plain">{asAsked(asked)}</legend>
    <Hint question={asked} />
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
 * The discipleship wizard's first question: which side of a discipleship
 * relationship the Person is offering to stand on. The first-time question, the
 * one-to-two question and the closing line are worded from this answer.
 */
export const SideField = ({
  chosen,
  asked = preset('side'),
}: {
  readonly chosen: DeclaredSide | null
  readonly asked?: FormQuestion
}) => (
  <fieldset>
    <legend>{asAsked(asked)}</legend>
    <Hint question={asked} />
    <div className="choices stack">
      {DECLARED_SIDES.map((option) => (
        <label key={option} className="option" htmlFor={`side:${option}`}>
          <input
            id={`side:${option}`}
            type="radio"
            name="side"
            value={option}
            required
            defaultChecked={chosen === option}
          />
          <span className="option-title">{sideLabel[option]}</span>
          <span className="option-desc">{sideDescription[option]}</span>
        </label>
      ))}
    </div>
  </fieldset>
)

/**
 * Whether this is their first time, put in the words of the side they offered:
 * the form words it once for a mentor and once for somebody to be mentored.
 *
 * Two answers, worded as statements rather than as yes and no, so the answer is
 * legible without the question. The values say the same thing the labels do, for
 * the reason the labels are worded this way at all.
 */
export const ExperienceField = ({
  side,
  chosen,
  asked = preset('experience'),
}: {
  readonly side: DeclaredSide | null
  readonly chosen: ExperienceAnswer | null
  readonly asked?: FormQuestion
}) => (
  <fieldset>
    <legend>
      {asAsked(asked, side === 'mentee' ? (asked.menteeWording ?? asked.wording) : asked.wording)}
    </legend>
    <Hint question={asked} />
    <div className="choices stack">
      {EXPERIENCE_ANSWERS.map((option) => (
        <label key={option} className="option" htmlFor={`experience:${option}`}>
          <input
            id={`experience:${option}`}
            type="radio"
            name="experience"
            value={option}
            required={asked.required}
            defaultChecked={chosen === option}
          />
          <span className="option-title">
            {option === 'first_time' ? FIRST_TIME_ANSWER : DONE_BEFORE_ANSWER}
          </span>
          <span className="option-desc">
            {option === 'first_time' ? FIRST_TIME_DESCRIPTION : DONE_BEFORE_DESCRIPTION}
          </span>
        </label>
      ))}
    </div>
  </fieldset>
)

/**
 * Whether they are open to a 1:2 (Suggestions beyond the one-to-one, ticket 01):
 * the first-time question's twin, put in the words of the side they offered, a
 * statement to agree with rather than a question. The two answers are sentences
 * on their own in the side's words, and the values are the same two words for
 * both sides: the pairing surfaces say them beside a name without knowing which
 * screen asked.
 *
 * Never asked without a side: the form keeps it on a later page than the side,
 * so a screen reaching it always has one. Should one arrive without (a URL edited
 * by hand), it is said in a mentor's words rather than not at all, as the
 * first-time question is.
 */
export const OneToTwoField = ({
  side,
  chosen,
  asked = preset('oneToTwo'),
}: {
  readonly side: DeclaredSide | null
  readonly chosen: OneToTwoAnswer | null
  readonly asked?: FormQuestion
}) => (
  <fieldset>
    <legend>
      {asAsked(asked, side === 'mentee' ? (asked.menteeWording ?? asked.wording) : asked.wording)}
    </legend>
    <Hint question={asked} />
    <div className="choices stack">
      {ONE_TO_TWO_ANSWERS.map((option) => (
        <label key={option} className="option" htmlFor={`oneToTwo:${option}`}>
          <input
            id={`oneToTwo:${option}`}
            type="radio"
            name="oneToTwo"
            value={option}
            required={asked.required}
            defaultChecked={chosen === option}
          />
          <span className="option-title">{oneToTwoAnswerLabel[side ?? 'mentor'][option]}</span>
          <span className="option-desc">{oneToTwoDescription[option]}</span>
        </label>
      ))}
    </div>
  </fieldset>
)

/**
 * A question the Ministry added to its own form (Pastor feedback, ticket 12), as
 * the control its kind takes: a line, a box for a few paragraphs, option buttons
 * for one choice, ticks for several, or Yes and No. Named by its key, which is the
 * name its answer travels under.
 *
 * A required one is held by the browser as every other question on the form is:
 * `required` on the line, the box and the radios. Ticks cannot say *at least one
 * of these*, so several choices is refused when it arrives instead, as the grid is.
 */
export const OwnQuestionField = ({
  question,
  given,
}: {
  readonly question: OwnQuestion
  /** What they gave before, as the form sends it: carried, or offered back on the reopened page. */
  readonly given: readonly string[]
}) => {
  const id = (value: string) => `${question.key}:${value}`
  switch (question.kind) {
    case 'short_text':
    case 'long_text':
      return (
        <div className="field">
          <label className="label" htmlFor={question.key}>
            {asAsked(question)}
          </label>
          <Hint question={question} />
          {question.kind === 'short_text' ? (
            <input
              id={question.key}
              name={question.key}
              type="text"
              maxLength={SHORT_TEXT_LIMIT}
              required={question.required}
              defaultValue={given[0] ?? ''}
            />
          ) : (
            <textarea
              id={question.key}
              name={question.key}
              rows={4}
              maxLength={LONG_TEXT_LIMIT}
              required={question.required}
              defaultValue={given[0] ?? ''}
            />
          )}
        </div>
      )
    case 'one_choice':
    case 'several_choices':
      return (
        <fieldset>
          <legend>{asAsked(question)}</legend>
          <Hint question={question} />
          {question.kind === 'several_choices' ? <p className="subtle">{AS_MANY_AS_APPLY}</p> : null}
          <div className="choices stack">
            {question.choices.map((choice) => (
              <label
                key={choice.id}
                className={question.kind === 'several_choices' ? 'option several' : 'option'}
                htmlFor={id(choice.id)}
              >
                <input
                  id={id(choice.id)}
                  type={question.kind === 'one_choice' ? 'radio' : 'checkbox'}
                  name={question.key}
                  value={choice.id}
                  required={question.kind === 'one_choice' && question.required}
                  defaultChecked={given.includes(choice.id)}
                />
                {choice.wording}
              </label>
            ))}
          </div>
        </fieldset>
      )
    case 'yes_no':
      return (
        <fieldset>
          <legend>{asAsked(question)}</legend>
          <Hint question={question} />
          <div className="choices">
            {([YES, NO] as const).map((answer) => (
              <label key={answer} className="option centred-text" htmlFor={id(answer)}>
                <input
                  id={id(answer)}
                  type="radio"
                  name={question.key}
                  value={answer}
                  required={question.required}
                  defaultChecked={given.includes(answer)}
                />
                {YES_NO_LABEL[answer]}
              </label>
            ))}
          </div>
        </fieldset>
      )
  }
}

/**
 * Everything a screen of either wizard knows when it asks a question: the answers
 * carried so far, and the lists the Ministry offers.
 */
export interface Answering {
  readonly prefill: IntakePrefill
  readonly side: DeclaredSide | null
  readonly experience: ExperienceAnswer | null
  readonly oneToTwo: OneToTwoAnswer | null
  readonly goals: readonly DiscipleshipGoalOption[]
  readonly groups: readonly JoinableGroup[]
  readonly groupChosen: string | null
  readonly ministryName: string
}

/**
 * One question of the Ministry's form, as the field that asks it (Pastor feedback,
 * ticket 11). The wizards draw each page by handing every question on it here,
 * in the order the form has them.
 */
export const AskedQuestion = ({
  question,
  answering,
}: {
  readonly question: FormQuestion
  readonly answering: Answering
}) => {
  if (isOwnQuestion(question)) {
    return <OwnQuestionField question={question} given={answering.prefill.own[question.key] ?? []} />
  }
  switch (question.key) {
    case 'side':
      return <SideField asked={question} chosen={answering.side} />
    case 'ageBand':
      return <AgeBandField asked={question} prefill={answering.prefill} />
    case 'gender':
      return <GenderField asked={question} prefill={answering.prefill} />
    case 'experience':
      return <ExperienceField asked={question} side={answering.side} chosen={answering.experience} />
    case 'oneToTwo':
      return <OneToTwoField asked={question} side={answering.side} chosen={answering.oneToTwo} />
    case 'availability':
      return <AvailabilityGrid asked={question} availability={answering.prefill.availability} />
    case 'goalId':
      return <GoalField asked={question} goals={answering.goals} prefill={answering.prefill} />
    case 'groupId':
      return (
        <GroupField
          asked={question}
          groups={answering.groups}
          chosen={answering.groupChosen}
          ministryName={answering.ministryName}
        />
      )
    case 'fullName':
      return <NameField asked={question} prefill={answering.prefill} />
    case 'phone':
      return <PhoneField asked={question} prefill={answering.prefill} />
    case 'email':
      return <EmailField asked={question} prefill={answering.prefill} />
  }
}

/**
 * Both consents, and always on the screen with the Submit button. The checkbox that
 * grants consent belongs on the same screen as the write it authorises.
 *
 * The wording is carried over verbatim from the form that first asked it, because
 * a consent record points at this wording by version. It is not one of the form's
 * questions and no Admin edits it.
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
      <span>Yes, I consent to sharing my name and phone number</span>
    </label>
    <label className="check">
      <input
        type="radio"
        name="contactSharing"
        value="declined"
        required
        defaultChecked={prefill.contactSharing === 'declined'}
      />
      <span>No, I do not consent to sharing my name and phone number</span>
    </label>
  </fieldset>
)
