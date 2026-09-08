-- Ticket 36 -- A held row shows its number
--
-- Ticket 26 kept the phone number off a held import row, on the reading that a
-- number is reached one Person at a time through the consent check and never
-- listed. ADR-0021 reversed that for the Admin surface: the Roster row, the
-- person page and the held-rows card may show a number, and the card shows it.
-- An Admin deciding whether "Em Johnson" is Emily Johnson written differently or
-- somebody else sharing her phone is deciding about a number, and was being
-- asked to do it without seeing one.
--
-- Widened the way `public.roster` was in the migration before this one: dropped
-- and recreated, because the result gains a column and Postgres refuses to
-- change a function's return type in place.
--
-- The number comes out of the security definer function and not out of a column
-- grant, for the reason ADR-0021 gives. `authenticated` still holds no SELECT on
-- `held_import_row.phone`; the Admin test inside the function is what lets a
-- number reach a screen, so a Leader session reads no number here or anywhere
-- but `public.contact_to_share`.
-- ---------------------------------------------------------------------------

drop function public.held_import_rows(uuid);

create function public.held_import_rows(target_ministry_id uuid)
returns table (
  row_id      uuid,
  line        integer,
  full_name   text,
  phone       text,
  imported_at timestamptz,
  person_id   uuid,
  person_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.line, h.full_name, h.phone, h.imported_at, p.id, p.full_name
    from public.held_import_row h
    left join public.person p
      on p.ministry_id = h.ministry_id and p.phone = h.phone
   where h.ministry_id = target_ministry_id
     and h.resolved_at is null
     and app.is_admin_of(target_ministry_id)
   order by h.imported_at, h.line, p.full_name;
$$;

comment on function public.held_import_rows(uuid) is
  'One Ministry''s unanswered import rows, each repeated once per Person already '
  'on its number. The line, the name in the file, the number on the row and the '
  'names on the Roster are what identify it. The number reaches a screen only '
  'through the Admin test here (ADR-0021), never through a grant on the column.';

revoke execute on function public.held_import_rows(uuid) from public, anon;
grant execute on function public.held_import_rows(uuid) to authenticated;
