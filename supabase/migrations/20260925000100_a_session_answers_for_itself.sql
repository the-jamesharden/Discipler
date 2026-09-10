-- A session is verified where it is read, and a held one is still a held one
-- ---------------------------------------------------------------------------
-- The app checks a session's token locally, against the Auth server's public
-- signing key, rather than asking the Auth server on every request. A token
-- that verifies is one the Auth server issued and has not expired; what it
-- cannot say is whether the session it belongs to still exists, because
-- `docs/adr/0016-a-password-change-ends-every-session.md` ends sessions on the
-- server and the token in the person's hand knows nothing about it.
--
-- This function is where the app asks that one question, on the data
-- connection it already holds. `auth.sessions` is the Auth server's own table
-- and is not readable by `authenticated`, so it answers as definer and reads
-- nothing but the row the caller's own token names: `session_id` is a claim in
-- every access token the Auth server mints, and a row is live when it exists,
-- belongs to the caller, and has not been given an end.
--
-- False and not null for a token without a `session_id` claim, which is what a
-- service-role token is: no session, so no live one.
create function public.session_is_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.sessions s
     where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
       and s.user_id = (select auth.uid())
       and (s.not_after is null or s.not_after > now())
  );
$$;

revoke execute on function public.session_is_live() from public, anon;
grant execute on function public.session_is_live() to authenticated;
