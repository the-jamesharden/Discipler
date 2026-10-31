# An Admin Signs In With Email or Phone

## Status

accepted

Supersedes ADR-0008, *The Phone Number Is the Sign-In Credential*, for an Admin who has a verified email.
ADR-0008 stands for every Leader, and for every Admin without one.

## Decision

**Sign-in is one box, "Email or phone", and a password.**
An Admin who signed up with an email may type either their email or their phone; anybody else types their phone, as before.
There is still one form, and nobody has to know which kind of user they are before typing.

**An Admin with a verified email can reset their own password.**
"Forgot password?" emails a one-time reset link to that address and to no other.
A reset ends every session on the account, as a Password Change does (ADR-0016).
Leaders keep today's recovery, an Admin's reset.

The password minimum is 8 everywhere, with a blocklist of common passwords and a maximum of at least 64 characters.
A second sign-in step with an authenticator app is the first ticket after the conference and is not part of this decision.

## Context

ADR-0008 made the phone the only credential because email is optional at Intake, so a Leader may never give one, and because two doors on one account make recovery choose between them.

Self sign-up (ADR-0029) changes the Admin's side of that.
A church that signs itself up gives an email first and proves it with a code, so every such Admin has a verified address before they have an account.
Pastors expect to sign in with their email, and the first self-signed-up Admin has nobody above them to reset a lost password: without a self-serve recovery, their only way back in is somebody at Discipler running SQL, which `docs/open-questions.md` named as the gap.

## Considered options

**Keep phone only, and verify the email for contact.**
Rejected.
It leaves a self-signed-up Admin with no recovery of their own, and asks pastors to sign in with something other than what they signed up with.

**Email only for Admins, phone for Leaders.**
Rejected, for ADR-0008's reason: two forms means a person has to know which kind of user they are before they can type, and an Admin who also leads is both.

**Recovery by a code texted to the phone.**
Deferred.
It is still the better answer for Leaders, and it is still post-launch.
For an Admin, the emailed link is the recovery that the sign-up flow has already proven reaches them.

## Consequences

**The cost is the one ADR-0008 named.**
An Admin with an email now has two doors, and whoever controls that inbox can take the account through a reset.
That is accepted because the reset goes only to an address proven at sign-up, ends every session, and sits behind the sign-in guessing limit and the stronger password rule, and because the authenticator step follows straight after the conference.

Recovery does not have to choose between two addresses: the email is the only recovery door, and the phone is only a sign-in door.

Leaders are unchanged, and so is every Admin who came in through a Setup Link with no email: they sign in by phone, and a lost password is still an Admin's reset.
`docs/open-questions.md`'s *How a Ministry's only Admin gets back in* is closed for an Admin with a verified email, and stays open for one without.

A phone number is still load-bearing in the three ways ADR-0008 lists, and an email on an Admin's account is now load-bearing in two: it signs them in and it recovers them.
