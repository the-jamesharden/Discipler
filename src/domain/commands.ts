import type {
  ConcernId,
  FollowUpItemId,
  ImportRowId,
  MaterialId,
  MinistryId,
  PersonId,
  RelationshipId,
} from './ids'
import type { GoalDirection } from './discipleship-goals'
import type { MinistrySettingsFields } from './ministry-settings'
import type { DiscipleshipGoalId, Gender, IntakeFormFields } from './intake'
import type { IntakeLinkToken } from './intake-link'
import type { InvitationToken } from './invitations'
import type { PausePeriodWeeks } from './pause'
import type { RelationshipOutcome } from './relationships'

/**
 * Every external trigger enters through this one boundary, and this union is the
 * complete list of ways the world can change something. The spec names the full
 * set: Intake submitted, Person imported, relationship created, relationship
 * cancelled, Leader accepted, inbound SMS received, Admin action taken, and the
 * scheduled tick.
 *
 * Each command arrives with the ticket that gives it behaviour, rather than being
 * stubbed out ahead of the rules it is supposed to enforce.
 */
export type Command =
  | {
      readonly type: 'scheduled.tick'
      readonly ministryId: MinistryId
    }
  /**
   * The spreadsheet itself is the payload, unread. Reading it is a rule about what
   * Discipler will accept as a Person -- a name, a number it can text -- and that
   * belongs on the same side of the boundary as every other rule, where it is
   * driven by tests with no upload anywhere near it.
   */
  | {
      readonly type: 'person.import'
      readonly ministryId: MinistryId
      readonly csv: string
    }
  /**
   * The Admin's answer to a row the import would not guess about. It is a separate
   * command and not a second import, because the file is gone and nothing about it
   * is being re-read: the row Discipler kept is the whole input, and the answer is
   * the one thing only a person who knows the congregation can supply.
   *
   * The answer carries the Person it is about rather than sitting beside an
   * optional field, so that *the same Person* with nobody named cannot be composed.
   * Which Person matters: a number may already reach two people -- ADR-0005 has
   * always allowed it -- and *the same Person* is a question with one answer per
   * name on the number.
   */
  | {
      readonly type: 'import_row.resolve'
      readonly ministryId: MinistryId
      readonly rowId: ImportRowId
      /**
       * The Admin's account, like every other judgement this product records. The
       * row keeps who answered even if the account later goes.
       */
      readonly resolvedBy: string
      readonly answer:
        | { readonly kind: 'same_person'; readonly personId: PersonId }
        | { readonly kind: 'someone_else' }
    }
  /**
   * The submitted form itself is the payload, unread, for the same reason the
   * spreadsheet is: what Discipler will accept as a completed Intake -- a name, a
   * number, a grid with something on it, SMS consent, a decision about contact
   * sharing -- is a rule, and rules live on the domain side of this boundary.
   *
   * One link serves a whole Ministry. The pastor sends it, or a QR code opens the
   * same one at a leaders' meeting, so the form says who is filling it in rather
   * than the URL saying on their behalf.
   */
  | {
      readonly type: 'intake.submit'
      readonly ministryId: MinistryId
      readonly form: IntakeFormFields
      /**
       * Present when the Person reached the form through a link an Admin issued
       * them, and absent on the Ministry-wide link.
       *
       * It changes who the form is about and nothing else about what the form
       * means. Without it a Person is recognised by the name and number they typed,
       * which is exactly what a Person correcting their number cannot be: the token
       * names them, so the correction lands on their own record instead of filing a
       * second one.
       */
      readonly token?: IntakeLinkToken
    }
  /**
   * An Admin issuing a Person the link that reopens their own Intake form,
   * prefilled. It sends nothing: the Admin copies the link and passes it on, which
   * is what a Person correcting a wrong phone number needs -- texting it to the
   * number already on file would reach whoever holds the wrong one.
   *
   * Issuing again replaces the link issued before. One live link per Person is what
   * an Admin means by *send them a new one*, and two would both open the door with
   * neither able to revoke the other.
   */
  | {
      readonly type: 'intake.reopen'
      readonly ministryId: MinistryId
      readonly personId: PersonId
    }
  /**
   * Sending a Leader their Invitation Link again.
   *
   * The condition it answers is one the product raises and could not act on. The
   * tick stops reminding a Leader whose link has run out -- a reminder carrying a
   * dead link sends them to a page telling them to find an Admin -- and escalates
   * to `relationship_unaccepted` instead. This is what an Admin does about it.
   *
   * A live link is re-sent rather than replaced, for the reason `intake.reopen`
   * gives: minting a second token stops the one already on their phone from
   * working, and the commonest reason to ask is a Leader who lost the text rather
   * than one holding a dead link.
   */
  | {
      readonly type: 'invitation.reissue'
      readonly ministryId: MinistryId
      readonly relationshipId: RelationshipId
      readonly personId: PersonId
    }
  /**
   * An Admin's plan that this Person may lead, recorded before Intake and kept up
   * to date afterwards. One field and not two: the intended role *is* the
   * leader-pool flag, because a Person marked intended-leader but not eligible
   * would be a state nobody could say the meaning of.
   *
   * It carries no Admin identity, unlike a pause or an ending. Those suspend or
   * terminate a Ministry's contact with somebody and the product rules require a
   * named actor for them; this records an intention that changes nothing about
   * what reaches anybody, and the history event beside it is the record that it
   * was set.
   */
  | {
      readonly type: 'person.set_lead_eligibility'
      readonly ministryId: MinistryId
      readonly personId: PersonId
      readonly eligible: boolean
    }
  /**
   * One command for all three pairing routes -- accepting a suggestion, pairing two
   * people from the Roster, selecting several people together. They differ in how
   * the Admin arrived at the names, which is a property of the screen and not of
   * the relationship being formed.
   */
  | {
      readonly type: 'relationship.create'
      readonly ministryId: MinistryId
      /** One Leader makes a one-to-one possible; several make it a group. */
      readonly leaderIds: readonly PersonId[]
      readonly participantIds: readonly PersonId[]
      /**
       * What the Admin said this relationship is: a men's one, a women's one, or --
       * as `null` -- a mixed one. Every member must be of a declared gender, and the
       * declaration is frozen at creation.
       *
       * Optional here and required by the boundary of anything but a one-to-one,
       * which is asked nothing: its gender is implied by the two people in it. The
       * three states are distinct and none of them is a default -- `undefined` is
       * *nobody was asked*, `null` is *mixed*, and a value is a binding.
       */
      readonly declaredGender?: Gender | null
    }
  /**
   * An Admin cancelling a relationship nobody accepted. It ends every open
   * membership, which is the whole of *returning everyone to the suggestion pool*:
   * `participation_status` reads open participant memberships, so closing them is
   * what makes a Person `Ready to Pair` again.
   *
   * Only an unaccepted one. Ending a relationship that has started is a different
   * act with a required outcome and is ticket 13's, and letting one command do both
   * would put an ending with no recorded reason inside this one.
   */
  | {
      readonly type: 'relationship.cancel'
      readonly ministryId: MinistryId
      readonly relationshipId: RelationshipId
      /**
       * The Admin's account, as the session named it. Cancelling disbands a
       * relationship and returns everyone in it to the pool with nobody told, so
       * it is one of the acts the product rules require a named actor for.
       */
      readonly cancelledBy: string
    }
  /**
   * An Admin ending a relationship that has run, with an outcome and a reason.
   *
   * A relationship that ran well and finished is an outcome, not a deletion: the
   * history is preserved exactly, and closing every open membership is what
   * returns its Participants to the Roster as `Ready to Pair` -- unless they have
   * opted out, or hold another open participant membership, both of which the
   * derivation handles without a special case.
   *
   * `Ended` is terminal, so this happens once. Cancelling a relationship nobody
   * accepted is the other command: that one carries no outcome, because a
   * relationship that never started cannot have completed.
   */
  | {
      readonly type: 'relationship.end'
      readonly ministryId: MinistryId
      readonly relationshipId: RelationshipId
      /** What happened, in the Ministry's own words. Required, and free text. */
      readonly reason: string
      /**
       * The part that can be counted. Free text cannot answer *did this complete
       * or break down* retrospectively, which is the question an ending exists to
       * make answerable.
       */
      readonly outcome: RelationshipOutcome
      /**
       * The Admin's account, as the session named it. Ending is one of the acts
       * the product rules require a named actor for.
       */
      readonly endedBy: string
    }
  /**
   * One Participant leaving a relationship that continues without them.
   *
   * Their membership receives an end date rather than being deleted, and their
   * past check-in weeks stay attached to the relationship exactly as recorded --
   * history is not rewritten by somebody leaving. A relationship dropping from
   * three Participants to one changes nothing structurally: it is still one
   * relationship, and the check-in copy follows the remaining Participants on its
   * own.
   *
   * Leaving is not ending. A Leader stepping out, or the last Participant leaving,
   * is a relationship that is over, and ending one records an outcome -- so both
   * are refused here rather than quietly performed as a departure.
   */
  | {
      readonly type: 'relationship.depart'
      readonly ministryId: MinistryId
      readonly relationshipId: RelationshipId
      /** Whose open participant membership this closes. */
      readonly personId: PersonId
      /** The Admin's account, as the session named it. */
      readonly departedBy: string
    }
  /**
   * An Admin putting a relationship onto a Material.
   *
   * The screen that does this is deferred from V1 and the data is not, so this
   * command exists with nothing routing to it -- the seam the assignment rules
   * are proven against, in the same way `checkin.start` is the seam the
   * conversation was proven against before a cadence existed to open one.
   *
   * It closes whatever period was running and opens a new one at the same instant,
   * because *periods never overlap and never leave gaps* is a fact about the pair.
   * There is no un-assign: one Material at a time means the history moves from one
   * to the next, and the only period with no Material in it is the one acceptance
   * opened.
   */
  | {
      readonly type: 'relationship.assign_material'
      readonly ministryId: MinistryId
      readonly relationshipId: RelationshipId
      readonly materialId: MaterialId
      /**
       * The Admin's account, as the session named it. What a relationship is
       * working through is a pastoral decision recorded against a Ministry's
       * history, so it names who made it like every other Admin act.
       */
      readonly assignedBy: string
    }
  /**
   * An Admin pausing a relationship, so they can act on something they have been
   * told offline and a holiday does not put a Leader in the care queue.
   *
   * It suspends that relationship's check-ins and nothing else: membership is
   * untouched, nobody returns to the suggestion pool, and the relationship stays
   * on the Leader's list marked `Paused`. Stepping back never costs a Leader the
   * people they lead.
   *
   * Leader-initiated pause over SMS is ticket 17's, and reaches the same rules
   * through the same command.
   */
  | {
      readonly type: 'relationship.pause'
      readonly ministryId: MinistryId
      readonly relationshipId: RelationshipId
      /**
       * One of five periods. Omitted means two weeks -- the default lives in the
       * domain rather than on each screen, so the Admin surface and the Keyword
       * Exchange cannot default differently.
       */
      readonly periodWeeks?: PausePeriodWeeks
      /**
       * The Admin's account, as the session named it. A pause suspends a
       * Ministry's contact with a Leader, so it is one of the acts the product
       * rules require a named actor for.
       */
      readonly pausedBy: string
    }
  /**
   * An Admin resuming a paused relationship, which is the only thing besides
   * ending it that takes a relationship out of `Paused`. A period running out
   * does not: it raises an item and leaves the state alone, because nobody's
   * check-ins should restart on a date they have forgotten.
   *
   * Resuming restores whatever the history yields and never sets `Healthy` on its
   * own -- a relationship that was `Stalled` when it was paused is `Stalled`
   * again, and clears only on an answered check-in.
   */
  | {
      readonly type: 'relationship.resume'
      readonly ministryId: MinistryId
      readonly relationshipId: RelationshipId
      /** The Admin's account, as the session named it. */
      readonly resumedBy: string
    }
  /**
   * An Admin acting on a Follow-Up Item, which is the only thing that closes one.
   * Nothing here is a note: resolving is one click, and the actions an Admin took
   * are recorded as facts of their own rather than retyped into this table.
   */
  | {
      readonly type: 'follow_up.resolve'
      readonly ministryId: MinistryId
      readonly itemId: FollowUpItemId
      /** The Admin's account, as the session named it. */
      readonly resolvedBy: string
    }
  /**
   * An Admin opening one Concern's text.
   *
   * A command rather than a read, because opening one writes: the viewing is
   * recorded against the Admin who did it. The text comes back from the same unit
   * of work that records the viewing, which is what makes reading a Concern
   * without leaving a trace unrepresentable rather than merely discouraged.
   */
  | {
      readonly type: 'concern.view'
      readonly ministryId: MinistryId
      readonly concernId: ConcernId
      /** The Admin's account, as the session named it. */
      readonly viewedBy: string
    }
  /**
   * An Admin resolving a Concern, which is the only thing that closes one. No
   * answered check-in clears it and it never clears itself -- that is the whole
   * difference between a Concern and the Stalled state beside it.
   */
  | {
      readonly type: 'concern.resolve'
      readonly ministryId: MinistryId
      readonly concernId: ConcernId
      /** The Admin's account, as the session named it. */
      readonly resolvedBy: string
    }
  /**
   * A Leader agreeing to lead. The token is the credential -- possession of the
   * phone it was sent to is the whole of the authentication -- so no session is
   * required and none is consulted.
   *
   * The account exists by the time this arrives. Creating it is Supabase Auth's,
   * not the domain's, and `userId` is the identifier it handed back.
   */
  | {
      readonly type: 'relationship.accept'
      readonly ministryId: MinistryId
      readonly token: InvitationToken
      /** As typed. A spelling difference from Intake is not an error. */
      readonly fullName: string
      readonly userId: string
    }
  /**
   * One Leader's weekly conversation, opened. It covers every relationship they
   * lead, so it names the Person and never a relationship -- a Leader holding
   * three of them gets one conversation, not three.
   *
   * *What makes a Leader due* is ticket 08b's, and in production `scheduled.tick`
   * is the only thing that opens one. This trigger consults no cadence and is
   * routed to by nothing: it survives as the seam that lets the conversation be
   * proven with no scheduler anywhere near it.
   */
  | {
      readonly type: 'checkin.start'
      readonly ministryId: MinistryId
      readonly personId: PersonId
    }
  /**
   * One inbound text, from one phone. Resolution is the sender's number to a
   * Person to their open Check-In Sequence to the question awaiting a reply --
   * never to *the Person's relationship*, because a Leader may hold several and
   * the position in the sequence is what disambiguates them.
   *
   * The number is resolved to a Person before this command is built, because the
   * unit of work is scoped to one Ministry and the webhook has no session telling
   * it which. Everything after that is a rule and lives on the domain side.
   */
  | {
      readonly type: 'sms.inbound'
      readonly ministryId: MinistryId
      readonly personId: PersonId
      /** Exactly as it arrived. Reading it is the domain's job, not the route's. */
      readonly body: string
    }
  /**
   * The four ways an Admin changes the list of Discipleship Goals their Ministry
   * offers at Intake. Four commands and not one, because they are four acts an
   * Admin performs separately and only one of them costs anybody their answer.
   *
   * Renaming is deliberately not remove-then-add. The option is a row and the
   * answers point at the row, so a reworded option is the same option and every
   * Person who chose it still has -- which is the whole reason the wording is a
   * column rather than the value on the submission.
   */
  | {
      readonly type: 'goal.add'
      readonly ministryId: MinistryId
      /** As typed. What counts as wording at all is decided at the boundary. */
      readonly label: string
    }
  | {
      readonly type: 'goal.rename'
      readonly ministryId: MinistryId
      readonly goalId: DiscipleshipGoalId
      readonly label: string
    }
  /**
   * One option, one place along the list. Up and down rather than a whole order,
   * because that is the control an Admin presses and the list it produces is the
   * boundary's to work out -- a surface that computed the new order would be
   * deciding a Ministry's own ordering on its behalf.
   */
  | {
      readonly type: 'goal.move'
      readonly ministryId: MinistryId
      readonly goalId: DiscipleshipGoalId
      readonly direction: GoalDirection
    }
  /**
   * The one edit that costs somebody something. Every Person whose current answer
   * pointed at this option loses it: they keep their Intake and their
   * availability and stay pairable, ranked on availability alone until they
   * answer again, and their stated goal is gone from every live surface.
   *
   * Gone, but not unrecorded. The answers the delete is about to blank are read
   * before it runs and written into `discipleship_goal.removed`, so a Ministry can
   * still say from its own history who used to want this -- which is what keeps
   * ADR-0014's exemption to *preserve historical ministry events* bounded to the
   * screens rather than extending to the record.
   *
   * Nothing here says the Admin was warned. The warning is a screen's -- it needs
   * a page and a second press to exist at all -- and what this records is that
   * the removal happened and what it cost.
   */
  | {
      readonly type: 'goal.remove'
      readonly ministryId: MinistryId
      readonly goalId: DiscipleshipGoalId
    }
  /**
   * An Admin saving the one settings form: the Ministry it is, the Language it
   * speaks, and how it wants Pairing and the weekly ask to behave.
   *
   * One command for all three sections, because it is one form and one save. Three
   * commands would let a Ministry's timezone land while its cadence was refused,
   * which is the shape that produces a check-in due at an hour nobody chose.
   *
   * The form arrives unread, like the spreadsheet and the Intake form: what counts
   * as a timezone, a whole hour inside quiet hours, or a word for a role is a rule,
   * and rules live on the domain side of this boundary.
   */
  | {
      readonly type: 'settings.update'
      readonly ministryId: MinistryId
      readonly fields: MinistrySettingsFields
      /**
       * The Admin's account, as the session named it. Settings decide the hour a
       * whole Ministry is texted at and whether the gender rule is enforced at
       * all, so the record names who changed them.
       */
      readonly changedBy: string
    }
  /**
   * *Not my number.* It changes nothing -- a forwarded link can never re-point an
   * account -- and raises a persistent item for an Admin, because the alternative
   * is that Leader's check-ins reaching a stranger indefinitely.
   */
  | {
      readonly type: 'invitation.dispute_number'
      readonly ministryId: MinistryId
      readonly token: InvitationToken
    }
