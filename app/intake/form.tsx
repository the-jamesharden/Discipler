import type { DiscipleshipGoalOption, IntakePrefill } from '~/service/ports'
import {
  AgeBandField,
  Agreements,
  AvailabilityGrid,
  ContactFields,
  GenderField,
  GoalField,
} from './fields'

/**
 * The Intake form itself, rendered by both ways in: the Ministry-wide link anybody
 * may open, and the tokenized link an Admin sends one Person so they can correct
 * what it says.
 *
 * One component, because it is one form. The two routes differ in where the
 * submission goes and in whether the fields arrive with answers already in them --
 * not in what is asked, which is the thing a second copy would eventually disagree
 * about.
 *
 * The fields themselves live in `fields.tsx`, because there is a second form now:
 * the discipleship wizard asks these same questions across several screens. This
 * page is the order they are asked in here, and nothing else.
 */

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
}) => (
  <form method="post" action={action}>
    {/* The route the Person arrived by, recorded on each consent record. */}
    <input type="hidden" name="via" value={via} />

    <ContactFields prefill={prefill} />
    <AvailabilityGrid availability={prefill.availability} />
    <GoalField goals={goals} prefill={prefill} />
    <AgeBandField prefill={prefill} />
    <GenderField prefill={prefill} />
    <Agreements ministryName={ministryName} prefill={prefill} />

    <button type="submit">Submit</button>
  </form>
)
