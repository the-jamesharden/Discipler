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
  searchParams: Promise<{
    with?: string | string[]
    leaderId?: string | string[]
    declaredGender?: string | string[]
    error?: string
  }>
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

  /**
   * Who arrives already chosen. One `with` is the Pair action on a Roster row --
   * preselected as a *participant* rather than as a leader, because that action sits
   * on an unpaired row and the common reason to press it is that this is somebody
   * waiting to be discipled. Several `with` are a refused submission coming back, and
   * then `leaderId` says who was leading it.
   */
  const onlyKnownPeople = (ids: string | string[] | undefined): Set<string> => {
    const asked = ids === undefined ? [] : [ids].flat()
    return new Set(
      candidates.filter((person) => asked.includes(person.personId)).map((p) => p.personId),
    )
  }
  const preselectedParticipants = onlyKnownPeople(query.with)
  const preselectedLeaders = onlyKnownPeople(query.leaderId)

  /**
   * What they declared last time, on a submission coming back refused. Looked up
   * against the three answers rather than rendered, like every other value that
   * arrived in a query string -- and nothing is checked on a first visit, because
   * the question has no default and a preselected radio would answer it for them.
   */
  const DECLARATIONS = [
    { value: 'male', label: 'A men\u2019s group \u2014 everybody in it is a man' },
    { value: 'female', label: 'A women\u2019s group \u2014 everybody in it is a woman' },
    { value: 'mixed', label: 'Mixed \u2014 men and women together' },
  ] as const
  const declaredBefore = [query.declaredGender ?? []].flat()[0]

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
            Choose who will lead and everyone they will disciple. One leader and one
            participant makes a one-to-one relationship; anything else is a group, and
            a group can have several leaders. Creating it does not start it —
            nothing reaches anybody until every leader accepts.
          </p>

          <form method="post" action="/roster/pair/create">
            {/*
              Checkboxes rather than a radio, because a group may be led by several
              people. The `required` a radio carried is gone with it: a checkbox set
              cannot express "at least one of these", and half-enforcing it here would
              leave the real rule in two places. The domain refuses an empty selection
              and the refusal comes back to this form.
            */}
            <fieldset>
              <legend>Leading</legend>
              {candidates.map((person) => (
                <label key={`leader:${person.personId}`} htmlFor={`leader:${person.personId}`}>
                  <input
                    id={`leader:${person.personId}`}
                    type="checkbox"
                    name="leaderId"
                    value={person.personId}
                    defaultChecked={preselectedLeaders.has(person.personId)}
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
                    defaultChecked={preselectedParticipants.has(person.personId)}
                  />
                  {person.fullName}
                </label>
              ))}
            </fieldset>

            {/*
              Asked outright, with nothing preselected. A group's gender is not
              implied by anybody in it -- *this is a women's group that currently has
              one member* is true and nothing in the membership says it -- so the
              product does not derive it and does not guess. It is left off a
              one-to-one, whose gender *is* the two people in it, and where the
              absolute match holds whatever anybody ticks; the domain is what knows
              which shape this is, so this fieldset asks unconditionally and says
              plainly who it is for.

              No `required`, for the reason the leader checkboxes have none: the rule
              is *a group must declare*, the browser cannot tell a group from a
              one-to-one until the boxes are ticked, and half-enforcing it here would
              leave the real rule in two places.
            */}
            <fieldset>
              <legend>If this is a group, what kind of group is it?</legend>
              <p className="subtle">
                Everybody in a men’s or women’s group must be of that gender, and
                that cannot be changed afterwards. Two people on their own are matched
                by gender automatically — leave this alone.
              </p>
              {DECLARATIONS.map((declaration) => (
                <label
                  key={declaration.value}
                  htmlFor={`declaredGender:${declaration.value}`}
                >
                  <input
                    id={`declaredGender:${declaration.value}`}
                    type="radio"
                    name="declaredGender"
                    value={declaration.value}
                    defaultChecked={declaredBefore === declaration.value}
                  />
                  {declaration.label}
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
