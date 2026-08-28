import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getRosterReader } from '~/service/container'
import { pairingRefusalMessage } from '../copy'

export const dynamic = 'force-dynamic'

/**
 * One screen for every pairing route. An Admin arrives here from a Person's Pair
 * action, from picking several people, or -- once ticket 04 lands -- from accepting
 * a suggestion. They differ only in how the Admin arrived at the names, which is a
 * property of the screen and not of the relationship being formed, so there is one
 * form and one command underneath all three.
 *
 * Creating a relationship does not start it. The form says so, because an Admin who
 * expects a text to go out and sees nothing happen will create it a second time.
 */

export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string; error?: string }>
}) {
  const admin = await currentAdmin()
  if (!admin) redirect('/login')

  const roster = await getRosterReader().listRoster(admin.ministryId)
  const query = await searchParams
  const refusal = pairingRefusalMessage(query.error)

  /**
   * Everyone Intake has cleared and who has not opted out. Deliberately *not*
   * filtered to the unpaired: a Person already being discipled may lead, and a
   * Person in a one-to-one may still join a group. Which combinations are legal is
   * a question about the Ministry's other relationships, so the database answers it
   * and this list does not pre-empt it -- an Admin's judgment is never subordinate
   * to a filtered list.
   */
  const candidates = roster.filter(
    (person) =>
      person.participationStatus === 'ready_to_pair' ||
      person.participationStatus === 'paired',
  )

  // Preselected as a participant rather than as the leader: the Pair action sits on
  // an unpaired row, and the common reason to press it is that this is somebody
  // waiting to be discipled. The Admin can move them.
  const preselected = candidates.find((person) => person.personId === query.with)

  return (
    <main>
      <h1>Form a relationship</h1>
      <p className="subtle">{admin.ministryName}</p>

      {candidates.length < 2 ? (
        <div className="panel">
          <p className="empty">
            At least two people need to have completed Intake before anyone can be
            paired.
          </p>
          <p>
            <Link href="/roster">Back to the Roster</Link>
          </p>
        </div>
      ) : (
        <div className="panel">
          {refusal ? (
            <p className="error" role="alert">
              {refusal}
            </p>
          ) : null}

          <p className="subtle">
            Choose one leader and everyone they will disciple. One participant makes a
            one-to-one relationship; several make a group. Creating it does not start
            it — nothing reaches anybody until the leader accepts.
          </p>

          <form method="post" action="/roster/pair/create">
            <fieldset>
              <legend>Leader</legend>
              {candidates.map((person) => (
                <label key={`leader:${person.personId}`} htmlFor={`leader:${person.personId}`}>
                  <input
                    id={`leader:${person.personId}`}
                    type="radio"
                    name="leaderId"
                    value={person.personId}
                    required
                  />
                  {person.fullName}
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>Discipling</legend>
              {candidates.map((person) => (
                <label
                  key={`participant:${person.personId}`}
                  htmlFor={`participant:${person.personId}`}
                >
                  <input
                    id={`participant:${person.personId}`}
                    type="checkbox"
                    name="participantId"
                    value={person.personId}
                    defaultChecked={person.personId === preselected?.personId}
                  />
                  {person.fullName}
                </label>
              ))}
            </fieldset>

            <button type="submit">Create relationship</button>
          </form>

          <p>
            <Link href="/roster">Back to the Roster</Link>
          </p>
        </div>
      )}
    </main>
  )
}
