-- The words Discipler reaches for when a Ministry has not chosen its own.
--
-- `leader_noun` and `participant_noun` shipped defaulting to `mentor` and
-- `mentee` in `20260915000100_what_a_ministry_may_vary.sql`. Mentoring is the
-- wider practice and discipleship is the one this product is for, so the default
-- now says the thing the product says: a **discipler** and a **disciple**.
--
-- The defaults move and no existing row is rewritten. A Ministry's nouns are a
-- setting it holds right now, and nothing here can tell a Ministry that chose
-- `mentor` on purpose from one that simply never opened the form -- so a backfill
-- would silently overrule the first to reach the second. Existing Ministries keep
-- the words they have and change them on the settings form, which is where that
-- decision has always lived.
--
-- `declared_side` is deliberately untouched. Its `mentor` / `mentee` values are
-- what the discipleship wizard asks a Person on its first screen, and they are a
-- vocabulary of that form rather than the two roles in a relationship -- the
-- comment on `consent_record.declared_side` says as much. Renaming them here would
-- fold an answer on a form into a role in a relationship, which is the confusion
-- that column was split out to prevent.

alter table ministry
  alter column leader_noun      set default 'discipler',
  alter column participant_noun set default 'disciple';

comment on column ministry.leader_noun is
  'The word this Ministry calls the person doing the discipling, as its messages '
  'will carry it. Defaults to ''discipler''. Never blank -- see '
  'ministry_leader_noun_is_not_blank.';

comment on column ministry.participant_noun is
  'The word this Ministry calls the person being discipled, as its messages will '
  'carry it. Defaults to ''disciple''. Never blank -- see '
  'ministry_participant_noun_is_not_blank.';
