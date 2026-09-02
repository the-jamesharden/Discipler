import Link from 'next/link'
import { redirect } from 'next/navigation'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getDiscipleshipGoalReader } from '~/service/container'
import { NotAnAdmin, PageShell, SignOut } from '../../shell'
import { chosenByLabel, refusalMessage, removalWarning } from './copy'

export const dynamic = 'force-dynamic'

/**
 * The list of Discipleship Goals this Ministry offers at Intake, and the screen
 * that changes it. Set before a semester begins; the seeded list carries no
 * product meaning and exists so a new Ministry is never unable to serve its own
 * form.
 *
 * Removing is the one act on this page that costs anybody anything, so it is the
 * one act that takes two presses. The control opens a warning saying how many
 * people have chosen the option and that their answer goes with it; only the
 * button inside that warning removes. Nothing on this page removes an option in
 * one press, because the answers it loses cannot be got back.
 */
export default async function DiscipleshipGoalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    /** The option an Admin has asked to remove, so this page warns about that one. */
    removing?: string
    error?: string
  }>
}) {
  const resolution = await resolveAdmin()

  if (resolution.status === 'not-an-admin') return <NotAnAdmin title="Discipleship Goals" />
  if (resolution.status === 'signed-out') redirect('/login')

  const admin = resolution.admin
  const goals = await getDiscipleshipGoalReader().listDiscipleshipGoals(admin.ministryId)
  const query = await searchParams

  // Looked up on the list rather than echoed, like every other name a surface here
  // says: what arrives in the query string is whatever somebody typed there, and an
  // option this Ministry does not offer warns about nothing.
  const removing = goals.find((goal) => goal.id === query.removing) ?? null
  const refusal = refusalMessage(query.error)

  return (
    <PageShell
      title="Discipleship Goals"
      subtitle={admin.ministryName}
      back={{ href: '/settings', label: 'Back to Ministry settings' }}
      actions={<SignOut />}
    >
      <div className="card">
        <p className="card-lead">
          These are the options Intake asks everyone to choose from. They are this
          ministry’s own — set them before a semester begins, in the order you most
          want people to consider them.
        </p>

        {refusal ? (
          <p className="toast error" role="alert">
            {refusal}
          </p>
        ) : null}

        <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Option</th>
              <th>Chosen by</th>
              <th>Order</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((goal, index) => (
              <tr key={goal.id}>
                {/* Reworded in place, because the option is a row and the answers
                    point at the row. A ministry that decides *Career* should read
                    *Career and calling* has not asked anybody a new question, and
                    nobody who chose it loses anything. */}
                <td>
                  <form method="post" action="/settings/goals/rename">
                    <input type="hidden" name="goalId" value={goal.id} />
                    <label className="visually-hidden" htmlFor={`label-${goal.id}`}>Wording</label>
                    <input
                      id={`label-${goal.id}`}
                      name="label"
                      type="text"
                      defaultValue={goal.label}
                      required
                      style={{ width: 'auto', minWidth: '14rem', marginRight: '0.5rem' }}
                    />
                    <button type="submit" className="sec small">Save wording</button>
                  </form>
                </td>
                <td>{chosenByLabel(goal.chosenBy)}</td>
                {/* Up and down rather than a drag, so the ordering works before
                    JavaScript has loaded — and the ends offer nothing to press,
                    because the top option cannot go higher. */}
                <td>
                  {index > 0 ? (
                    <form method="post" action="/settings/goals/move">
                      <input type="hidden" name="goalId" value={goal.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button type="submit" className="sec small">{`Move “${goal.label}” up`}</button>
                    </form>
                  ) : null}
                  {index < goals.length - 1 ? (
                    <form method="post" action="/settings/goals/move">
                      <input type="hidden" name="goalId" value={goal.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button type="submit" className="sec small">{`Move “${goal.label}” down`}</button>
                    </form>
                  ) : null}
                </td>
                {/* A link and not a form. Pressing it removes nothing: it reloads
                    this page with the warning open on this option, and the only
                    control that removes is inside that warning. */}
                <td>
                  {goals.length > 1 ? (
                    <Link className="btn sec small danger" href={`/settings/goals?removing=${goal.id}`}>Remove</Link>
                  ) : (
                    // The last option is not offered for removal at all, and the
                    // reason is said rather than left to a control that does
                    // nothing. The boundary and the database refuse it too.
                    <span className="muted">
                      The only option left — Intake could not be served without it
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {removing ? (
          <div role="alert" className="notice" style={{ marginTop: '1.25rem' }}>
            <h3>{`Remove “${removing.label}”?`}</h3>
            <p>{removalWarning(removing.label, removing.chosenBy)}</p>
            <form method="post" action="/settings/goals/remove">
              <input type="hidden" name="goalId" value={removing.id} />
              {/* The confirmation itself. The route removes nothing without it, so
                  a link or a stale form that names an option and says nothing else
                  reopens this warning rather than acting on it. */}
              <input type="hidden" name="confirm" value="yes" />
              <button type="submit">{`Yes, remove “${removing.label}” and lose those answers`}</button>
            </form>
            <p style={{ marginTop: '0.75rem' }}>
              <Link className="btn sec" href="/settings/goals">Keep it</Link>
            </p>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2 className="card-title">Add an option</h2>
        <p className="card-lead">
          It goes to the bottom of the list, where you can move it up.
        </p>
        <form method="post" action="/settings/goals/add">
          <div className="field">
            <label className="label" htmlFor="label">Wording</label>
            <input id="label" name="label" type="text" required />
          </div>
          <button type="submit">Add</button>
        </form>
      </div>
    </PageShell>
  )
}
