-- ===============================================================
-- 17. Manager self-service for approving a Team Mail ID
--     (apply AFTER supabase_security_v2.sql)
--
-- WHY
-- Verifying the deployment surfaced an operational dead end: a manager
-- cannot onboard a new joiner. trg_guard_employee_email_approved refuses a
-- roster row for any address not already in approved_team_logins, and nothing
-- outside the SQL editor can add one — no role holds INSERT on that table, by
-- design, because it is the list that decides who may hold an account at all.
--
-- The security design is right. The gap is that the only way to exercise it
-- was to ask a developer, which in practice means either new hires wait days,
-- or somebody is handed the service-role key. Both are worse outcomes than
-- letting the manager — who already sets roles, pay bands and employment
-- status — do it through an audited, deliberate action.
--
-- SHAPE
--   * approve_team_login(email, label) — manager only, validates the address,
--     records who approved it and why, refuses duplicates gracefully.
--   * revoke_team_login(email) — manager only. Refuses to revoke an address
--     that still has a roster row, so the list cannot be used to orphan an
--     employee; offboard them first.
--   * list_team_logins() — manager only. Lets the UI show what is approved
--     and which entries have no employee yet, WITHOUT granting SELECT on the
--     table (which would make the whole list enumerable through PostgREST).
--
-- The table itself keeps zero grants. These functions are the only door, and
-- each checks is_manager() itself rather than trusting the caller.
--
-- Idempotent: safe to re-run.
-- ===============================================================

-- ---------------------------------------------------------------
-- Provenance. The table records what was approved but not by whom, which is
-- the first question asked when an unexpected address turns up on it.
-- ---------------------------------------------------------------

alter table public.approved_team_logins
  add column if not exists approved_by_id text;
alter table public.approved_team_logins
  add column if not exists approved_by_email text;

comment on column public.approved_team_logins.approved_by_id is
  'Employee id of the manager who approved this address, when it was added '
  'through approve_team_login(). Null for the original imported batch.';

-- ---------------------------------------------------------------
-- Approve
-- ---------------------------------------------------------------

create or replace function public.approve_team_login(
  p_email text,
  p_label text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  addr text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_manager() then
    raise exception 'Only a manager may approve a Team Mail ID'
      using errcode = 'insufficient_privilege';
  end if;

  -- Deliberately strict. This list decides who may hold an account, so a
  -- typo here is not a cosmetic problem: whoever really owns the mistyped
  -- address could create a Team Portal account with it. That exact mistake
  -- is on the record — see the four corrected addresses in the third batch
  -- (src/teamDirectory.js).
  if addr = '' or addr !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That is not a valid email address: %', p_email
      using hint = 'Check for typos and stray spaces before approving.',
            errcode = 'check_violation';
  end if;

  if exists (select 1 from public.approved_team_logins where lower(email) = addr) then
    return 'already approved';
  end if;

  insert into public.approved_team_logins (email, label, approved_by_id, approved_by_email)
  values (addr, nullif(trim(coalesce(p_label, '')), ''),
          public.current_emp_id(), auth.email());

  return 'approved';
end;
$fn$;

revoke all on function public.approve_team_login(text, text) from public, anon;
grant execute on function public.approve_team_login(text, text) to authenticated;

-- ---------------------------------------------------------------
-- Revoke
-- ---------------------------------------------------------------

create or replace function public.revoke_team_login(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  addr text := lower(trim(coalesce(p_email, '')));
  emp  text;
begin
  if not public.is_manager() then
    raise exception 'Only a manager may revoke a Team Mail ID'
      using errcode = 'insufficient_privilege';
  end if;

  -- Revoking an address that still has a roster row would leave an employee
  -- who exists but can never sign in, and whose next profile save is refused
  -- by trg_guard_employee_email_approved. Offboarding is the intended route
  -- for someone leaving; it keeps their record resolvable.
  select id into emp from public.employees where lower(email) = addr;
  if emp is not null then
    raise exception 'That address still belongs to employee % — offboard them instead', emp
      using hint = 'Profile > Account > Offboard. Revoking here would orphan the record.',
            errcode = 'check_violation';
  end if;

  delete from public.approved_team_logins where lower(email) = addr;
  if not found then
    return 'not on the list';
  end if;
  return 'revoked';
end;
$fn$;

revoke all on function public.revoke_team_login(text) from public, anon;
grant execute on function public.revoke_team_login(text) to authenticated;

-- ---------------------------------------------------------------
-- Read it back
--
-- A function rather than a SELECT grant: granting SELECT on the table would
-- expose the whole list through PostgREST, which is exactly what
-- supabase_team_onboarding.sql withheld so the list cannot be enumerated.
-- This returns it only to a manager, and returns nothing to anyone else
-- rather than raising — an empty list is the honest answer to "what may I
-- see" for a non-manager.
-- ---------------------------------------------------------------

create or replace function public.list_team_logins()
returns table (
  email          text,
  label          text,
  approved_at    timestamptz,
  approved_by    text,
  employee_id    text,
  has_account    boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  select a.email,
         a.label,
         a.approved_at,
         coalesce(a.approved_by_email, 'imported'),
         e.id,
         exists (select 1 from auth.users u where lower(u.email) = lower(a.email))
  from public.approved_team_logins a
  left join public.employees e on lower(e.email) = lower(a.email)
  where public.is_manager()
  order by a.approved_at desc, a.email;
$fn$;

revoke all on function public.list_team_logins() from public, anon;
grant execute on function public.list_team_logins() to authenticated;
