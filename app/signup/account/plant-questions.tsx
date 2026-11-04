import type { ReactNode } from 'react'
import { PLANT_ANSWER_LONGEST, PLANT_ANYTHING_ELSE_LONGEST } from '~/domain/church-plant'
import { ACCOUNT_PAGE, PLANT_QUESTIONS } from '../copy'

/** The answers a refusal can be about, by the name each is posted under. */
export type PlantField = 'plantLaunchDate' | 'plantSendingChurch' | 'plantAverageAttendance' | 'plantLeadPastor'

interface Answers {
  readonly launchDate: string
  readonly sendingChurch: string
  readonly averageAttendance: string
  readonly leadPastor: string
  readonly anythingElse: string
}

/**
 * "Is your church a church plant?" on "Set up your account" (Exponential launch, ticket
 * 19; `s4-account.html?plant=yes`). No is preselected, and Yes opens the application on
 * the same page. The answers stay while it is closed, so a change of mind loses nothing,
 * and the form posts them only with Yes.
 */
export const PlantQuestions = ({
  isPlant,
  onIsPlant,
  answers,
  onAnswer,
  refusedField,
  refusalFor,
  describedBy,
}: {
  readonly isPlant: boolean
  readonly onIsPlant: (isPlant: boolean) => void
  readonly answers: Answers
  readonly onAnswer: { readonly [K in keyof Answers]: (answer: string) => void }
  readonly refusedField: string | null
  readonly refusalFor: (field: PlantField) => ReactNode
  readonly describedBy: (field: PlantField) => string | undefined
}) => {
  const required = (field: PlantField, label: string, key: Exclude<keyof Answers, 'anythingElse'>, extra: object = {}) => (
    <div className="field">
      <label className="label" htmlFor={field}>
        {label} <span className="req">*</span>
      </label>
      <input
        id={field}
        name={field}
        type="text"
        maxLength={PLANT_ANSWER_LONGEST}
        value={answers[key]}
        onChange={(event) => onAnswer[key](event.target.value)}
        aria-invalid={refusedField === field ? true : undefined}
        aria-describedby={describedBy(field)}
        {...extra}
      />
      {refusalFor(field)}
    </div>
  )

  return (
    <>
      <hr className="sep" />
      <fieldset className="plant-q">
        <legend className="plain">
          {PLANT_QUESTIONS.question} <span className="opt-tag">{ACCOUNT_PAGE.optional}</span>
        </legend>
        <p className="hint plant-lead">{PLANT_QUESTIONS.lead}</p>
        <div className="yesno">
          <label className="option centred-text">
            <input type="radio" name="plant" value="yes" checked={isPlant} onChange={() => onIsPlant(true)} />
            <span className="option-title">{PLANT_QUESTIONS.yes}</span>
          </label>
          <label className="option centred-text">
            <input type="radio" name="plant" value="no" checked={!isPlant} onChange={() => onIsPlant(false)} />
            <span className="option-title">{PLANT_QUESTIONS.no}</span>
          </label>
        </div>
        {isPlant ? (
          <div className="plant-app">
            {required('plantLaunchDate', PLANT_QUESTIONS.launchDate, 'launchDate', {
              placeholder: PLANT_QUESTIONS.launchDateExample,
            })}
            {required('plantSendingChurch', PLANT_QUESTIONS.sendingChurch, 'sendingChurch')}
            {required('plantAverageAttendance', PLANT_QUESTIONS.averageAttendance, 'averageAttendance', {
              inputMode: 'numeric',
            })}
            {required('plantLeadPastor', PLANT_QUESTIONS.leadPastor, 'leadPastor')}
            <div className="field">
              <label className="label" htmlFor="plantAnythingElse">
                {PLANT_QUESTIONS.anythingElse} <span className="opt-tag">{ACCOUNT_PAGE.optional}</span>
              </label>
              <textarea
                id="plantAnythingElse"
                name="plantAnythingElse"
                maxLength={PLANT_ANYTHING_ELSE_LONGEST}
                value={answers.anythingElse}
                onChange={(event) => onAnswer.anythingElse(event.target.value)}
              />
            </div>
            <p className="hint">{PLANT_QUESTIONS.followUp}</p>
          </div>
        ) : null}
      </fieldset>
    </>
  )
}
