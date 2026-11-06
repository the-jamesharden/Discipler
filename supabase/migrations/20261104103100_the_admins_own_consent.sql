-- ---------------------------------------------------------------------------
-- The Admin's own consent at sign-up (Exponential launch, ticket 17)
-- ---------------------------------------------------------------------------
--
-- A third source for a consent record, which is not a route to the Intake form: an
-- Admin who signs a church up agrees to be texted on the page that asks for their
-- phone. `docs/consent-language.md` says what it covers.
--
-- A file of its own, because a new enum value cannot be used in the transaction that
-- adds it.

alter type consent_source add value 'ministry_setup';
