import {
  ownQuestionsOf,
  removedQuestions,
  type BuiltInQuestion,
  type IntakeForm as MinistryForm,
} from '~/domain/intake-form'
import type { DiscipleshipGoalOption, IntakePrefill } from '~/service/ports'
import {
  AgeBandField,
  Agreements,
  AvailabilityGrid,
  EmailField,
  GenderField,
  GoalField,
  NameField,
  OwnQuestionField,
  PhoneField,
} from './fields'

/**
 * The Intake form on one page, rendered by the tokenized link an Admin sends one
 * Person so they can correct what it says.
 *
 * One component, because it is one form: the same fields the discipleship wizard
 * spreads across screens, prefilled. The fields themselves live in `fields.tsx`,
 * because there are two forms now and the wording a consent record points at by
 * version must not exist twice. This page is the order they are asked in here,
 * and nothing else. It wears the wizard's design because it is the wizard's form,
 * with the answers already in it (decision 9 of ticket 31).
 *
 * After Discipler's questions it asks the Ministry's own (Pastor feedback, ticket
 * 12), from the form the Person last answered, in that form's order and words,
 * with their answers already in them. The version they come from travels with the
 * answers, as the wizard's does, so they are read against the questions shown.
 *
 * It does not ask what that form no longer asks (ticket 13): a question an Admin
 * removed, with every answer to it, is not put back in front of anybody here.
 */

export const IntakeForm = ({
  action,
  ministryName,
  goals,
  via,
  prefill,
  form,
}: {
  readonly action: string
  readonly ministryName: string
  readonly goals: readonly DiscipleshipGoalOption[]
  readonly via: 'link' | 'qr'
  readonly prefill: IntakePrefill
  /** The form whose own questions are asked after Discipler's. */
  readonly form: MinistryForm
}) => {
  const removed = removedQuestions(form)
  const asks = (key: BuiltInQuestion) => !removed.includes(key)
  return (
    <form method="post" action={action}>
      {/* The route the Person arrived by, recorded on each consent record. */}
      <input type="hidden" name="via" value={via} />
      <input type="hidden" name="v" value={String(form.version)} />

      <NameField prefill={prefill} />
      <PhoneField prefill={prefill} />
      {asks('email') ? <EmailField prefill={prefill} /> : null}
      {asks('ageBand') ? <AgeBandField prefill={prefill} /> : null}
      {asks('gender') ? <GenderField prefill={prefill} /> : null}
      {asks('availability') ? <AvailabilityGrid availability={prefill.availability} /> : null}
      {asks('goalId') ? <GoalField goals={goals} prefill={prefill} /> : null}
      {ownQuestionsOf(form).map((question) => (
        <OwnQuestionField key={question.key} question={question} given={prefill.own[question.key] ?? []} />
      ))}
      <Agreements ministryName={ministryName} prefill={prefill} />

      <div className="form-actions">
        <span />
        <button type="submit">Submit</button>
      </div>
    </form>
  )
}
