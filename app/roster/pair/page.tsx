import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getMinistrySettingsReader, getRosterReader } from '~/service/container'
import { PageShell, SignOut } from '../../shell'
import { firstTimeLabel, pairingRefusalMessage, roleHeading } from '../copy'
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
 *
 * The design drew this as a modal with one Leader dropdown; this page is a
 * superset of it -- several Leaders, several Participants, a declared gender, a
 * name and the approval switch -- and a page survives a refresh and a back button,
 * which a modal does not.
 */

export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<{
    with?: string | string[]
    leaderId?: string | string[]
    declaredGender?: string | string[]
    name?: string | string[]
    joinRequiresApproval?: string | string[]
    error?: string
  }>
}) {
  const admin = await currentAdmin()
  if (!admin) redirect('/login')

  /**
   * The two roles in this Ministry's own words. Read here rather than written into
   * the page, because a Ministry that calls them something else has said so on the
   * settings form and this screen is where an Admin does the naming -- a form that
   * went on saying `Leading` while every message this Ministry sends says
   * `discipler` would be the one place the product spoke over them.
   */
  const [roster, settings] = await Promise.all([
    getRosterReader().listRoster(admin.ministryId),
    getMinistrySettingsReader().readMinistrySettings(admin.ministryId),
  ])
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
  const askedForLeaders = onlyKnownPeople(query.leaderId)

  /**
   * Whether this form is a submission coming back rather than a fresh arrival. A
   * refusal carries one, and it is the only thing on the screen that can tell the
   * two apart: an Admin who ticked nobody and was refused for it sends back exactly
   * the same empty `leaderId` a first visit has.
   *
   * It decides whether the offer below is made at all. An Admin who unticked
   * somebody and pressed the button has said something, and a screen that ticked
   * them again on the way back would be arguing with them.
   */
  const cameBackRefused = query.error !== undefined

  /**
   * Who said, on the discipleship wizard, that they came to disciple somebody.
   *
   * Ticked on arrival, and it is an offer rather than a decision: `declared_side` is
   * a preference the Person stated and explicitly not `eligible_to_lead`, which is
   * the Admin's to record (see the comment on `consent_record.declared_side`). What
   * it changes is what the Admin is looking at when they decide, which is the whole
   * of what that column is for -- somebody who signed up to disciple should not have
   * to be found again in a list of everybody.
   *
   * Never somebody already ticked as a Participant. The Pair action on a Roster row
   * says *this person is waiting to be discipled*, and a name ticked on both sides of
   * the same form is a question rather than a starting point.
   */
  const offeredToDisciple = new Set(
    candidates
      .filter((person) => person.declaredSide === 'mentor')
      .map((person) => person.personId),
  )
  const preselectedLeaders = cameBackRefused
    ? askedForLeaders
    : new Set(
        [...askedForLeaders, ...offeredToDisciple].filter(
          (personId) => !preselectedParticipants.has(personId),
        ),
      )

  /**
   * What each candidate said about whether this is their first time, beside their
   * name in both lists. An Admin about to pair two people can see when both are new
   * to this, which is the whole of what this answer is for.
   *
   * It ranks nobody and refuses nobody, which is what keeps it outside ADR-0001.
   * Silent where nobody was asked. The two answers are said outright, so a blank is
   * *the form did not ask* rather than a quiet *no*.
   */
  const firstTimeNote = (firstTime: boolean | null) =>
    firstTime === null ? null : (
      <span className="muted">{` — ${firstTimeLabel(firstTime)}`}</span>
    )

  /**
   * What they declared last time, on a submission coming back refused. Compared
   * against the three answers rather than rendered, like every other value that
   * arrived in a query string.
   */
  const declaredBefore = [query.declaredGender ?? []].flat()[0]
  /**
   * The name they typed and the door they chose, on a submission coming back
   * refused. The name is the Admin's own typing rather than anybody's details, and
   * it is put back into a field rather than rendered as text.
   */
  const namedBefore = [query.name ?? []].flat()[0] ?? ''
  const askedFirstBefore = [query.joinRequiresApproval ?? []].flat()[0] === 'yes'

  return (
    <PageShell
      title="Form a relationship"
      subtitle={admin.ministryName}
      back={{ href: '/roster', label: 'Back to the Roster' }}
      actions={<SignOut />}
    >
      {candidates.length < 2 ? (
        <div className="card">
          <p className="empty">
            At least two people need to have completed Intake before anyone can be
            paired.
          </p>
          <p>
            <Link className="btn sec" href="/roster">
              Back to the Roster
            </Link>
          </p>
        </div>
      ) : (
        <div className="card">
          {refusal ? (
            <p className="toast error" role="alert">
              {refusal}
            </p>
          ) : null}

          <p className="notice">
            Choose who will lead and everyone they will disciple. One leader and one
            participant makes a one-to-one relationship; anything else is a group, and
            a group can have several leaders. The age band rule governs suggestion
            only — you may pair across it here. Gender matching cannot be overridden.
            Creating it does not start it — nothing reaches anybody until every leader
            accepts.
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
              <legend>{roleHeading(settings.leaderNoun)}</legend>
              {candidates.map((person) => (
                <label key={`leader:${person.personId}`} className="check" htmlFor={`leader:${person.personId}`}>
                  <input
                    id={`leader:${person.personId}`}
                    type="checkbox"
                    name="leaderId"
                    value={person.personId}
                    defaultChecked={preselectedLeaders.has(person.personId)}
                  />
                  <span>
                    {person.fullName}
                    {firstTimeNote(person.firstTime)}
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>{roleHeading(settings.participantNoun)}</legend>
              {candidates.map((person) => (
                <label
                  key={`participant:${person.personId}`}
                  className="check"
                  htmlFor={`participant:${person.personId}`}
                >
                  <input
                    id={`participant:${person.personId}`}
                    type="checkbox"
                    name="participantId"
                    value={person.personId}
                    defaultChecked={preselectedParticipants.has(person.personId)}
                  />
                  <span>
                    {person.fullName}
                    {firstTimeNote(person.firstTime)}
                  </span>
                </label>
              ))}
            </fieldset>

            {/*
              The two questions only a group answers, in a panel of their own.
              Everything above decides who is in this relationship and applies to
              every shape; everything in here is answered by a group and left alone
              by two people on their own. They read as one aside rather than as two
              more questions in the column, because an Admin forming a one-to-one
              should be able to see in one glance that neither of them is theirs --
              and a divider they can see is what says so before they read a word.
            */}
            <section className="aside" aria-labelledby="if-a-group">
              <h2 className="aside-title" id="if-a-group">
                If this is a group
              </h2>
              <p className="subtle">
                Two people on their own answer neither of these — leave them alone.
              </p>

              {/*
                Asked outright, with nothing preselected, for the reason
                `needsAGenderDeclaration` gives in src/domain/relationships.ts.

                It is one fieldset for both shapes, and the legend carries the
                distinction. A one-to-one should be asked nothing -- its gender *is*
                the two people in it -- but the browser cannot tell a group from a
                one-to-one until the boxes are ticked, so a form that hid this for a
                pair would have to know the answer before the Admin gave it. The
                domain is what knows the shape: it requires an answer of a group and
                takes a one-to-one without one. An Admin who answers anyway is held to
                what they said rather than having it discarded, which is the
                refusal-over-silence rule the rest of this screen follows.

                No `required`, for the reason the leader checkboxes have none, and for
                the one the boundary states where it does the refusing.
              */}
              <fieldset>
                <legend className="aside-legend">What kind of group is it?</legend>
                <p className="subtle">
                  Everybody in a men’s or women’s group must be of that gender, and
                  that cannot be changed afterwards. Two people on their own are
                  matched by gender automatically.
                </p>
                <div className="choices">
                  {DECLARED_GENDER_OPTIONS.map((declaration) => (
                    <label
                      key={declaration.value}
                      className="option centred-text"
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
                </div>
              </fieldset>

              {/*
                What a group is called, and whether joining it through the group link
                asks first. Asked of every shape for the reason the declaration is:
                the browser cannot tell a group from a one-to-one until the boxes are
                ticked. The domain requires the name of a group and takes a one-to-one
                without one. No `required`, for the same reason.
              */}
              <fieldset className="aside-part">
                <legend className="aside-legend">What is it called?</legend>
                <p className="subtle">
                  The name appears on the group link, which anybody may open, and is
                  what its leader is asked about each week.
                </p>
                <div className="field">
                  <label className="label" htmlFor="name">
                    Group name
                  </label>
                  <input id="name" name="name" defaultValue={namedBefore} />
                </div>
                <label className="check" htmlFor="joinRequiresApproval">
                  <input
                    id="joinRequiresApproval"
                    type="checkbox"
                    name="joinRequiresApproval"
                    value="yes"
                    defaultChecked={askedFirstBefore}
                  />
                  <span>Ask me before anyone joins through the group link</span>
                </label>
              </fieldset>
            </section>

            <div className="form-actions">
              <Link className="btn sec" href="/roster">
                Cancel
              </Link>
              <button type="submit">Create relationship</button>
            </div>
          </form>
        </div>
      )}
    </PageShell>
  )
}
