# 06 — Invitation Link and Acceptance

**What to build:** A Leader receives a text telling them they have been matched and inviting them to look — an invitation, not an assignment. Tapping through reveals who they have been matched with and for which Ministry *before* anything is asked of them. Only then do they set a name and a password and accept. Acceptance activates the relationship, releases the Starter Message to everyone in it, and stamps `accepted_at` as the durable record that this Leader agreed to this relationship. That timestamp is the whole of the activation — there is no status column to set.

The Invitation Link is individualized, bound to the Person record rather than to an email address, and resolves without a session — possession of the phone it was sent to is the authentication. It expires in seven to fourteen days and is **consumed on account creation, not on resolution**, so a Leader who opens it and gets interrupted by a phone call can return to the same message rather than needing a re-issue.

The phone number Discipler will text is displayed, not requested, so a Leader cannot mistype their way out of their own check-ins. A "not my number" affordance notifies the Admin and changes nothing, so a forwarded link can never re-point an account. The name the Leader types is stored as given; a spelling difference from Intake is not an error and raises nothing.

Participants hear who their Leader is and how to recognize their number, so an unknown text tomorrow is not alarming, and are given a way to say the match is not right without a conversation. No phone number is ever sent to a Leader by SMS.

Two access tiers only: Admin, who sees everything in their Ministry, and Leader, who sees only their own relationships. Coordinator, staff, and pastor team all name the Admin role and must not become separate tiers. Sessions are long-lived, on the order of a year; recovery is by password, and a lost password requires an Admin reset until one-time codes ship post-launch.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] A Leader receives an Invitation Link on relationship creation and can resolve it without a session
- [ ] The match is revealed before any input is requested
- [ ] The Leader sets a name and password to accept; the typed name is stored as given
- [ ] The phone number is displayed, not accepted as input, and "not my number" notifies the Admin without changing anything
- [ ] The link survives being opened and abandoned, and is consumed on account creation
- [ ] The link expires within seven to fourteen days
- [ ] Acceptance activates the relationship, releases the Starter Message to everyone in it, and records a timestamp
- [ ] Participants receive their Leader's name and number where contact-sharing consent permits, and a way to decline the match
- [ ] No message to a Leader contains a phone number
- [ ] Exactly two access tiers exist, and `tier` governs access only — it never determines who leads a relationship and never gates the Leader surface
- [ ] Account creation sets `person.user_id`, linking the login to the Person record in that Ministry
- [ ] A Leader can see only the relationships they hold an open leader membership on

## Comments

### Amended — dual-role persons

The Invitation Link was already bound to the Person record rather than to an email
address, so the account-to-Person link this adds is the fact the flow already
assumed. Every Leader who logs in has a Person row in that Ministry; one without
is an error, not a supported state.

An Admin who also leads holds a single `ministry_member` row with `tier = 'admin'`,
because `unique (ministry_id, user_id)` permits no second one. The Leader surface
must therefore never require a `tier = 'leader'` row to exist — see ticket 19.

### Settled — the sign-in credential is a phone number and a password

This ticket asked for "a name and a password" and named no identifier; ticket 01 shipped
email; ticket 15 said phone. Settled: **phone number and password, one form, everyone
including Admins.** Email is optional at Intake, so a credential built on it is one half
the people who need it may not have. See
`docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.

The link is already bound to the Person rather than to an email address, so nothing in
the invitation flow changes — the identifier the Leader signs back in with is the number
this flow displays and refuses to accept as input.

### Settled — "not my number" is a persistent follow-up item

*Notifies the Admin* means it raises a `invitation_number_disputed` follow-up item, not a
transient notification. It is the highest-stakes condition in ticket 07's table: a wrong
number sends that Leader's check-ins to a stranger indefinitely, and a notification that
scrolls out of view is exactly the failure a Follow-Up Item exists to prevent. It still
changes nothing else — a forwarded link can never re-point an account.

### Settled — a Participant declining the match raises `match_declined`

*A way to say the match is not right without a conversation* had no recorded destination
anywhere in the spec or the tickets. It raises a `match_declined` follow-up item. It is a
Participant on a web page — a different actor and a different surface from a Leader
texting `SWAP` — and without an item it reaches nobody.

- [ ] The Leader signs in with a phone number and a password, and no email is collected anywhere in this flow
- [ ] "not my number" raises a persistent `invitation_number_disputed` follow-up item and changes nothing else
- [ ] A Participant declining the match raises a `match_declined` follow-up item
