import type { ConcernId, FollowUpItemId, MinistryId, PersonId, RelationshipId } from './ids'
import type { IntakeFormFields } from './intake'
import type { InvitationToken } from './invitations'
import type { PausePeriodWeeks } from './pause'

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
   * *Not my number.* It changes nothing -- a forwarded link can never re-point an
   * account -- and raises a persistent item for an Admin, because the alternative
   * is that Leader's check-ins reaching a stranger indefinitely.
   */
  | {
      readonly type: 'invitation.dispute_number'
      readonly ministryId: MinistryId
      readonly token: InvitationToken
    }
  /**
   * A Participant saying the match is not right, without having to have a
   * conversation about it. It raises an item and changes nothing else: unpairing
   * is a pastoral decision and stays with the Admin.
   */
  | {
      readonly type: 'match.decline'
      readonly ministryId: MinistryId
      readonly token: InvitationToken
    }
