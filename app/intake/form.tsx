import { ownQuestionsOf, type IntakeForm as MinistryForm } from '~/domain/intake-form'
import type { DiscipleshipGoalOption, IntakePrefill } from '~/service/ports'
import {
  AgeBandField,
  Agreements,
  AvailabilityGrid,
  ContactFields,
  GenderField,
  GoalField,
  OwnQuestionField,
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
}) => (
  <form method="post" action={action}>
    {/* The route the Person arrived by, recorded on each consent record. */}
    <input type="hidden" name="via" value={via} />
    <input type="hidden" name="v" value={String(form.version)} />

    <ContactFields prefill={prefill} />
    <AgeBandField prefill={prefill} />
    <GenderField prefill={prefill} />
    <AvailabilityGrid availability={prefill.availability} />
    <GoalField goals={goals} prefill={prefill} />
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
