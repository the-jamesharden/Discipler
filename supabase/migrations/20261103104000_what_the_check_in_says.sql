-- What the check-in says: the four sentences a church may rewrite inside the frame
-- Discipler always writes (Exponential launch, ticket 40; ADR-0034).
--
-- Additive and safe to push ahead of the code: four nullable columns on `ministry`,
-- one nullable column on `checkin_sequence`, and the settings read restated with the
-- new columns on the end. Every existing row reads null, which is Discipler's words,
-- so nothing a church is sent changes until an Admin saves a sentence.

-- ---------------------------------------------------------------------------
-- The sentences
-- ---------------------------------------------------------------------------

-- Null on a line a church has not rewritten, and null rather than a copy of
-- Discipler's words, so a church that never touched a line goes on sending whatever
-- Discipler's words are.
--
-- The checks hold what can be held against a pilot's SQL as well as the form: not
-- blank, at most 160 characters (`CHECK_IN_SENTENCE.longest`), on one line with no
-- control characters, and a question that says who it is about. What a sentence
-- must not *say* -- reply choices, an opt-out word, a link -- is a reading of
-- English, kept in `src/domain/check-in-words.ts` where the sentences for it are.
alter table ministry
  add column checkin_question_sentence text
    constraint ministry_checkin_question_sentence_is_a_sentence check (
      checkin_question_sentence is null or (
        length(btrim(checkin_question_sentence)) > 0
        and char_length(checkin_question_sentence) <= 160
        and checkin_question_sentence !~ '[[:cntrl:]]'
        and position('[name]' in checkin_question_sentence) > 0
      )
    ),
  add column checkin_rating_sentence text
    constraint ministry_checkin_rating_sentence_is_a_sentence check (
      checkin_rating_sentence is null or (
        length(btrim(checkin_rating_sentence)) > 0
        and char_length(checkin_rating_sentence) <= 160
        and checkin_rating_sentence !~ '[[:cntrl:]]'
      )
    ),
  add column checkin_concern_sentence text
    constraint ministry_checkin_concern_sentence_is_a_sentence check (
      checkin_concern_sentence is null or (
        length(btrim(checkin_concern_sentence)) > 0
        and char_length(checkin_concern_sentence) <= 160
        and checkin_concern_sentence !~ '[[:cntrl:]]'
      )
    ),
  add column checkin_thanks_sentence text
    constraint ministry_checkin_thanks_sentence_is_a_sentence check (
      checkin_thanks_sentence is null or (
        length(btrim(checkin_thanks_sentence)) > 0
        and char_length(checkin_thanks_sentence) <= 160
        and checkin_thanks_sentence !~ '[[:cntrl:]]'
      )
    );

comment on column ministry.checkin_question_sentence is
  'The check-in''s opening question as this church words it, [name] standing for '
  'whoever it is about, or null for Discipler''s words. Discipler adds the start and '
  'the reply choices around it.';
comment on column ministry.checkin_rating_sentence is
  'How it went, as this church words it, or null for Discipler''s words. Discipler '
  'adds the start and the reply choices around it.';
comment on column ministry.checkin_concern_sentence is
  'What is asked after a concern, as this church words it, or null for Discipler''s '
  'words.';
comment on column ministry.checkin_thanks_sentence is
  'The thank-you that closes a check-in, as this church words it, or null for '
  'Discipler''s words.';

-- Column by column, as the rest of the settings form is granted.
grant update (
  checkin_question_sentence,
  checkin_rating_sentence,
  checkin_concern_sentence,
  checkin_thanks_sentence
) on ministry to discipler_command;

-- ---------------------------------------------------------------------------
-- The words a conversation went out in
-- ---------------------------------------------------------------------------

-- A change applies from the next check-in sent, so a conversation holds the
-- sentences it opened with. Its next question, its reminder and its thank-you are
-- composed after it opened, possibly after an Admin saved new words, and a reminder
-- is the question as it first went out. The texts already sent are in
-- `outbound_message.body` as they went, which nothing rewrites.
--
-- All four sentences as they were in force, not only the ones a church had saved,
-- so a conversation also outlasts a change to Discipler's own words. Null on one
-- opened before this column, which went out in Discipler's.
alter table checkin_sequence
  add column words jsonb
    constraint checkin_sequence_words_are_the_four_sentences check (
      words is null or (
        jsonb_typeof(words -> 'question') is not distinct from 'string'
        and jsonb_typeof(words -> 'rating') is not distinct from 'string'
        and jsonb_typeof(words -> 'concern') is not distinct from 'string'
        and jsonb_typeof(words -> 'thanks') is not distinct from 'string'
      )
    );

comment on column checkin_sequence.words is
  'The check-in''s four sentences this conversation opened with, which it finishes '
  'with whatever the church has saved since. Null on one opened before a church could '
  'reword, which went out in Discipler''s words.';

-- ---------------------------------------------------------------------------
-- The settings read
-- ---------------------------------------------------------------------------

-- `ministry_settings` restated whole from `20260915000100_what_a_ministry_may_vary.sql`
-- with the four sentences on the end. Its result type changes, so it is dropped and
-- created rather than replaced; `settings_page` reads it by name when it runs and
-- `to_jsonb` carries the new columns through.
drop function public.ministry_settings(uuid);

create function public.ministry_settings(target_ministry_id uuid)
returns table (
  name text,
  from_name text,
  timezone text,
  leader_noun text,
  participant_noun text,
  suggest_gender_match boolean,
  suggest_max_age_band_gap smallint,
  checkin_day smallint,
  checkin_hour smallint,
  checkin_question_sentence text,
  checkin_rating_sentence text,
  checkin_concern_sentence text,
  checkin_thanks_sentence text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.name,
         m.from_name,
         m.timezone,
         m.leader_noun,
         m.participant_noun,
         m.suggest_gender_match,
         m.suggest_max_age_band_gap,
         m.checkin_day,
         m.checkin_hour,
         m.checkin_question_sentence,
         m.checkin_rating_sentence,
         m.checkin_concern_sentence,
         m.checkin_thanks_sentence
    from public.ministry m
   where m.id = target_ministry_id
     and (
       app.is_admin_of(target_ministry_id)
       or app.command_ministry_id() = target_ministry_id
     );
$$;

comment on function public.ministry_settings(uuid) is
  'One Ministry''s settings, for the Admin who administers it. Answers nobody '
  'else: a Leader is a member of the Ministry and these are not theirs to read.';

revoke execute on function public.ministry_settings(uuid) from public, anon, service_role;
grant execute on function public.ministry_settings(uuid)
  to authenticated, discipler_command;
