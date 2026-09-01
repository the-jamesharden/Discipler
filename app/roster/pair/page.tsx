import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getRosterReader } from '~/service/container'
import { firstTimeLabel, pairingRefusalMessage } from '../copy'
import { DECLARED_GENDER_OPTIONS } from '../declared-gender'

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
   * What each candidate said about whether this is their first time, beside their
   * name in both lists. An Admin about to pair two people can see when both are new
   * to this, which is the whole of what this answer is for.
   *
   * It ranks nobody and refuses nobody, which is what keeps it outside ADR-0001.
   * That ADR fixes the *suggestion* inputs at four and constrains any fifth; this is
   * not one -- nothing on this screen suggests anybody, and the candidate list is
   * deliberately unfiltered because pastoral judgment is never subordinate to a
   * filtered list. Ticket 04 does not inherit this as a ranking input, and would
   * need an amendment to ADR-0001 to make it one.
   *
   * Silent where nobody was asked. The two answers are said outright, so a blank is
   * *the form did not ask* rather than a quiet *no*.
   */
  const firstTimeNote = (firstTime: boolean | null) =>
    firstTime === null ? null : (
      <span className="subtle">
        {` — ${firstTimeLabel[firstTime ? 'first_time' : 'done_before']}`}
      </span>
    )

  /**
   * What they declared last time, on a submission coming back refused. Compared
   * against the three answers rather than rendered, like every other value that
   * arrived in a query string.
   */
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
                  {firstTimeNote(person.firstTime)}
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
                  {firstTimeNote(person.firstTime)}
                </label>
              ))}
            </fieldset>

            {/*
              Asked outright, with nothing preselected, for the reason
              `needsAGenderDeclaration` gives in src/domain/relationships.ts.

              It is one fieldset for both shapes, and the legend carries the
              distinction. A one-to-one should be asked nothing -- its gender *is* the
              two people in it -- but the browser cannot tell a group from a one-to-one
              until the boxes are ticked, so a form that hid this for a pair would have
              to know the answer before the Admin gave it. The domain is what knows the
              shape: it requires an answer of a group and takes a one-to-one without
              one. An Admin who answers anyway is held to what they said rather than
              having it discarded, which is the refusal-over-silence rule the rest of
              this screen follows.

              No `required`, for the reason the leader checkboxes have none, and for
              the one the boundary states where it does the refusing.
            */}
            <fieldset>
              <legend>If this is a group, what kind of group is it?</legend>
              <p className="subtle">
                Everybody in a men’s or women’s group must be of that gender, and
                that cannot be changed afterwards. Two people on their own are matched
                by gender automatically — leave this alone.
              </p>
              {DECLARED_GENDER_OPTIONS.map((declaration) => (
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
