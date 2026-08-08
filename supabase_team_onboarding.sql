-- ===============================================================
-- 11. Team member onboarding — profile self-service and lock
--     (apply AFTER supabase_overtime_bands.sql)
--
--   a) profile_finalized / initial_password transition rules
--   b) employee-editable field allowlist enforced in the database
--   c) profile lock: a finalized profile is read-only to the employee
--   d) unique index on employees.email (login IDs must be unique)
--
-- Passwords are NOT touched here. They live entirely in Supabase Auth;
-- this schema has held no password column since
-- supabase_rls_hardening.sql dropped the legacy plaintext one.
--
-- Idempotent: safe to re-run.
-- ===============================================================

-- ---------------------------------------------------------------
-- a. Email is the login ID, so it must be unique.
--    Case-insensitive: loadPortalData matches on lower(email).
-- ---------------------------------------------------------------

create unique index if not exists employees_email_lower_key
  on public.employees (lower(email))
  where email is not null;

-- ---------------------------------------------------------------
-- b/c. Profile self-service guard
--
-- Applies only to an authenticated end user who is NOT staff, editing
-- their OWN row. Staff (team lead / manager) and trusted backend roles
-- are unaffected, so the existing manager correction workflow keeps
-- working after an employee has locked their profile.
--
-- Rules enforced:
--   1. A finalized profile is read-only — no employee-editable field
--      may change once profile_finalized is true.
--   2. profile_finalized may only go false -> true (self-finalize).
--      An employee can never set it back to false; only a manager can
--      reopen a profile.
--   3. initial_password may only go true -> false, and only as a side
--      effect of the employee setting their own password. It can never
--      be re-armed by the employee.
--   4. Every column outside the employee-editable allowlist must be
--      unchanged. This covers designation, section, emp_no, shift,
--      leave balances, rating, warnings, achievements, actions,
--      training and roster, on top of the role/tier/id/email and
--      band/airport/supplier already guarded by earlier migrations.
-- ---------------------------------------------------------------

create or replace function public.guard_employee_profile_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted backend roles (service_role / SQL editor) bypass entirely.
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;

  -- Staff keep full management access, including corrections after lock.
  if public.is_staff() then
    return new;
  end if;

  -- Beyond this point: a non-staff employee. They may only touch their own
  -- row at all (emp_update_self already enforces that; belt and braces).
  if old.id is distinct from public.current_emp_id() then
    raise exception 'You may only edit your own profile';
  end if;

  -- Rule 2 — finalization is one-way for an employee.
  if old.profile_finalized and not new.profile_finalized then
    raise exception
      'A finalized profile can only be reopened by a manager';
  end if;

  -- Rule 3 — the initial-password flag is one-way too.
  if new.initial_password and not old.initial_password then
    raise exception 'The initial password flag cannot be re-armed';
  end if;

  -- Rule 1 — a finalized profile is read-only to its owner. Compare the
  -- editable set; anything else is caught by rule 4 below regardless.
  if old.profile_finalized then
    if (new.name             is distinct from old.name
        or new.nationality      is distinct from old.nationality
        or new.mobile           is distinct from old.mobile
        or new.dob              is distinct from old.dob
        or new.marital_status   is distinct from old.marital_status
        or new.address          is distinct from old.address
        or new.emergency_name   is distinct from old.emergency_name
        or new.emergency_contact is distinct from old.emergency_contact
        or new.passport_no      is distinct from old.passport_no
        or new.passport_expiry  is distinct from old.passport_expiry
        or new.visa_expiry      is distinct from old.visa_expiry
        or new.eid_no           is distinct from old.eid_no
        or new.eid_expiry       is distinct from old.eid_expiry
        or new.documents        is distinct from old.documents) then
      raise exception
        'Your profile is finalized. Ask a manager to make corrections.';
    end if;
  end if;

  -- Rule 4 — everything outside the employee-editable allowlist is frozen.
  -- (role, tier, id and email are additionally guarded by
  --  guard_employee_privileges; band/airport/supplier by
  --  guard_employee_grading. Repeated here so the allowlist is complete
  --  and self-describing.)
  if (new.id            is distinct from old.id
      or new.email         is distinct from old.email
      or new.role          is distinct from old.role
      or new.tier          is distinct from old.tier
      or new.band          is distinct from old.band
      or new.airport       is distinct from old.airport
      or new.supplier      is distinct from old.supplier
      or new.designation   is distinct from old.designation
      or new.section       is distinct from old.section
      or new.emp_no        is distinct from old.emp_no
      or new.shift         is distinct from old.shift
      or new.annual_leave  is distinct from old.annual_leave
      or new.used_annual   is distinct from old.used_annual
      or new.sick_leave    is distinct from old.sick_leave
      or new.used_sick     is distinct from old.used_sick
      or new.comp_off      is distinct from old.comp_off
      or new.rating        is distinct from old.rating
      or new.warnings      is distinct from old.warnings
      or new.achievements  is distinct from old.achievements
      or new.actions       is distinct from old.actions
      or new.training      is distinct from old.training
      or new.roster        is distinct from old.roster) then
    raise exception
      'That field is managed by your team lead or manager';
  end if;

  return new;
end;
$$;

-- Runs after the earlier guards (alphabetical firing order on the same
-- event: trg_guard_employee_grading, trg_guard_employee_privileges, then
-- trg_guard_employee_profile_lock). Any one of them raising is enough.
drop trigger if exists trg_guard_employee_profile_lock on public.employees;
create trigger trg_guard_employee_profile_lock
  before update on public.employees
  for each row execute function public.guard_employee_profile_lock();

revoke all on function public.guard_employee_profile_lock() from anon, authenticated;

-- ---------------------------------------------------------------
-- d. An employee may not create or delete employee rows. Already true
--    (emp_insert_manager / emp_delete_manager), asserted here so the
--    onboarding surface is fully described in one migration.
-- ---------------------------------------------------------------

-- No change required; documented for reviewers.

-- ---------------------------------------------------------------
-- e. Team Mail ID mapping
--
-- The employees table currently carries derived @adbsafegate.ae
-- addresses. The Team Mail ID is the permanent login ID, so these rows
-- are repointed at their real addresses.
--
-- ONLY the twelve confirmed mappings are applied. Two Team Mail IDs
-- remain UNRESOLVED and are deliberately absent:
--
--   praveen6273@gmail.com
--       roster holds two candidates — Praveen Arunachalam (EMP-052)
--       and Praveen Koothoor (EMP-080)
--   jjijosebastian311@gmail.com
--       labelled "Jiji"; roster holds Jiji Varghese (EMP-020) and
--       Jijo Sebastian (EMP-057), and the address reads "jijosebastian"
--
-- Do not add either until the owner confirms which person it belongs
-- to. An incorrect mapping hands one employee another's login.
--
-- Guarded so it is idempotent and can never collide: a row is only
-- updated when the target address is not already held by a different
-- employee.
-- ---------------------------------------------------------------

do $$
declare
  m record;
begin
  for m in
    select * from (values
      ('EMP-048', 'muhammed.farhan.ext@adbsafegate.com'),  -- Farhan
      ('EMP-009', 'anurag.aikkal@adbsafegate.com'),        -- Anurag
      ('EMP-001', 'amarnath.munderi@adbsafegate.com'),     -- Amarnath
      ('EMP-005', 'gopakumar.gopinadhan@adbsafegate.com'), -- Gopa
      ('EMP-019', 'nisar.ahmed@adbsafegate.com'),          -- Nisar
      ('EMP-050', 'nithin.kumar@adbsafegate.com'),         -- Nithin
      ('EMP-089', 'jesudaskt22@gmail.com'),                -- Jesudas
      ('EMP-049', 'prajeshprabhakar002@gmail.com'),        -- Prajesh
      ('EMP-051', 'Bv4haris@gmail.com'),                   -- Haris
      ('MGR-001', 'ragesh.menon@adbsafegate.com'),         -- Ragesh
      ('EMP-018', 'sanoop.louis@adbsafegate.com'),         -- Sanoop
      ('TL-002',  'mohammed.faheem@adbsafegate.com')       -- Mohammed Faheem
    ) as t(emp_id, team_mail)
  loop
    if not exists (select 1 from public.employees where id = m.emp_id) then
      raise notice 'Team mail mapping skipped, no such employee: %', m.emp_id;
      continue;
    end if;
    if exists (
      select 1 from public.employees
      where lower(email) = lower(m.team_mail) and id <> m.emp_id
    ) then
      raise notice 'Team mail % already held by another employee, skipping %',
        m.team_mail, m.emp_id;
      continue;
    end if;
    update public.employees
       set email = m.team_mail
     where id = m.emp_id
       and (email is distinct from m.team_mail);
  end loop;
end $$;

comment on function public.guard_employee_profile_lock() is
  'Team onboarding: enforces the employee-editable field allowlist, one-way '
  'profile finalization, one-way initial-password clearing, and read-only '
  'locking of a finalized profile. Staff and backend roles bypass.';

-- ---------------------------------------------------------------
-- f. Authoritative onboarding authorization — server-side
--
-- The approved Team Mail ID list moves into the database and becomes
-- the security boundary. The client copy in src/teamDirectory.js is
-- retained for instant feedback only; nothing depends on it.
--
-- Three layers, each independently sufficient:
--   f1. approved_team_logins  — the authoritative list, NOT readable
--       by anon or authenticated (no enumeration of team emails).
--   f2. is_approved_team_login(text) — SECURITY DEFINER RPC returning
--       a bare boolean for ONE address. Callable pre-session so the
--       login form can check before attempting sign-up. Discloses no
--       employee information: you can test an address, not list them.
--   f3. triggers that refuse the write itself:
--         - auth.users     BEFORE INSERT  -> blocks account creation
--         - employees      BEFORE INSERT/UPDATE OF email -> blocks
--           roster rows for unapproved addresses
--       These hold even if the client is bypassed entirely.
-- ---------------------------------------------------------------

create table if not exists public.approved_team_logins (
  email       text primary key,
  label       text,
  approved_at timestamptz not null default now()
);

create unique index if not exists approved_team_logins_lower_key
  on public.approved_team_logins (lower(email));

comment on table public.approved_team_logins is
  'Authoritative list of Team Mail IDs permitted to onboard. Not readable '
  'by anon or authenticated roles — query via is_approved_team_login().';

-- The 14 approved Team Mail IDs, stored verbatim.
insert into public.approved_team_logins (email, label) values
  ('muhammed.farhan.ext@adbsafegate.com',  'Farhan'),
  ('anurag.aikkal@adbsafegate.com',        'Anurag'),
  ('amarnath.munderi@adbsafegate.com',     'Amarnath'),
  ('gopakumar.gopinadhan@adbsafegate.com', 'Gopa'),
  ('nisar.ahmed@adbsafegate.com',          'Nisar'),
  ('jjijosebastian311@gmail.com',          'Jiji — employee mapping unresolved'),
  ('nithin.kumar@adbsafegate.com',         'Nithin'),
  ('praveen6273@gmail.com',                'Praveen — employee mapping unresolved'),
  ('jesudaskt22@gmail.com',                'Jesudas'),
  ('prajeshprabhakar002@gmail.com',        'Prajesh'),
  ('Bv4haris@gmail.com',                   'Haris'),
  ('ragesh.menon@adbsafegate.com',         'Ragesh'),
  ('sanoop.louis@adbsafegate.com',         'Sanoop'),
  ('mohammed.faheem@adbsafegate.com',      'Mohammed Faheem')
on conflict (email) do nothing;

-- Locked down: no anon or authenticated access at all. Managers read it
-- through the RPC below, or via the SQL editor / service_role.
alter table public.approved_team_logins enable row level security;
revoke all on public.approved_team_logins from anon, authenticated;

drop policy if exists atl_select_manager on public.approved_team_logins;
create policy atl_select_manager
  on public.approved_team_logins for select
  to authenticated
  using (public.is_manager());

-- f2. Single-address check. Returns a boolean and nothing else, so it
--     cannot be used to enumerate the team.
create or replace function public.is_approved_team_login(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.approved_team_logins
    where lower(email) = lower(trim(coalesce(p_email, '')))
  );
$$;

-- Deliberately callable before a session exists: the login form must be
-- able to check an address before attempting sign-up.
grant execute on function public.is_approved_team_login(text) to anon, authenticated;

comment on function public.is_approved_team_login(text) is
  'Returns true when the given address is an approved Team Mail ID. Boolean '
  'only — exposes no employee data and cannot enumerate the list.';

-- f3a. Refuse an employee row for an unapproved address.
create or replace function public.guard_employee_email_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only judge an address that is actually being set or changed. Supabase
  -- upserts send every column, so an ordinary profile save includes an
  -- unchanged email; without this, the 78 roster rows still holding derived
  -- @adbsafegate.ae addresses would fail on every save.
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;
  if new.email is null or trim(new.email) = '' then
    return new;                       -- placeholder rows stay permitted
  end if;
  -- Trusted backend roles (migrations, SQL editor) bypass, so section (e)
  -- and any admin data fix can run regardless of ordering.
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;
  if not public.is_approved_team_login(new.email) then
    raise exception
      'Email % is not an approved Team Mail ID', new.email
      using hint = 'Add it to approved_team_logins first.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_employee_email_approved on public.employees;
create trigger trg_guard_employee_email_approved
  before insert or update of email on public.employees
  for each row execute function public.guard_employee_email_approved();

revoke all on function public.guard_employee_email_approved() from anon, authenticated;

-- f3b. Refuse the Supabase Auth account itself.
--
-- GoTrue inserts into auth.users through Postgres, so a raising trigger
-- there stops account creation server-side — the one place RLS alone
-- cannot reach. This is what makes the gate real rather than cosmetic.
--
-- Scoped narrowly: it only ever raises for an address that is neither
-- approved nor already on the roster, so existing accounts, invited
-- users and admin-provisioned users are unaffected.
create or replace function public.guard_auth_user_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Phone-only, anonymous and OAuth-without-email sign-ins are out of scope.
  if new.email is null or trim(new.email) = '' then
    return new;
  end if;

  -- Approved Team Mail ID. Comparison is lower(trim(...)) inside the RPC, so
  -- casing and stray whitespace cannot wrongly refuse a legitimate member.
  if public.is_approved_team_login(new.email) then
    return new;
  end if;

  -- Already on the roster. Covers accounts provisioned before this migration
  -- and any admin-created user, so applying it can never lock out an existing
  -- member. Guarded with to_regclass so the trigger is order-independent and
  -- does not fail if employees is absent.
  if to_regclass('public.employees') is not null then
    if exists (
      select 1 from public.employees where lower(email) = lower(new.email)
    ) then
      return new;
    end if;
  end if;

  -- Fail closed. An authorization gate that cannot confirm approval must
  -- refuse: letting an unverified address through would defeat the control.
  -- Every avoidable cause of a wrong refusal is handled above.
  raise exception
    'This email address is not registered for the Team Portal'
    using hint = 'Contact your administrator.',
          errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_guard_auth_user_approved on auth.users;
create trigger trg_guard_auth_user_approved
  before insert on auth.users
  for each row execute function public.guard_auth_user_approved();

revoke all on function public.guard_auth_user_approved() from anon, authenticated;
