-- ===============================================================
-- 14. Request validation — statuses, ranges, and overlaps
--     (apply AFTER supabase_audit_log.sql)
--
-- WHY
-- The submit forms carried a handful of inline checks and between them missed
-- the ones that matter for a roster: nothing stopped an employee booking two
-- overlapping leave requests, claiming the same overtime twice, or writing a
-- status the workflow has no meaning for. Every one of those produces a roster
-- the portal reports as correct and the airfield cannot staff.
--
-- src/validation.js states the same rules for the UI so the form can answer
-- before the round trip. THIS file is the boundary: a client that skips the
-- form, or an old cached bundle, still cannot write a conflicting row.
--
-- WHAT IS ENFORCED HERE VS IN THE APP
--   here  — statuses, date ordering, ranges, hours, and OVERLAPS. Overlap is
--           relational: it depends on other rows, so only the database can
--           check it without a race between two concurrent submissions.
--   app   — leave-balance warnings. Deliberately not enforced here, because
--           management may legitimately approve leave beyond a balance as
--           unpaid, and a constraint would push that conversation off-system.
--
-- Idempotent: safe to re-run.
-- ===============================================================

-- ---------------------------------------------------------------
-- a. Statuses must be ones the workflow knows
--
-- Added NOT VALID first, then validated, so an existing row with a stale
-- status reports itself instead of failing the whole migration. If the
-- VALIDATE step raises, fix the offending rows and re-run — do not drop the
-- constraint.
-- ---------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_requests_status_check'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_status_check
      check (status in ('pending', 'tl_approved', 'approved', 'rejected', 'withdrawn'))
      not valid;
  end if;
end $$;

alter table public.leave_requests validate constraint leave_requests_status_check;

do $$
begin
  if to_regclass('public.overtime_requests') is null then
    return;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'overtime_requests_status_check'
  ) then
    -- Overtime is team-lead-terminal: there is no 'tl_approved' stage,
    -- because the team lead IS the final approver (see
    -- src/overtimeWorkflow.js and the absence of a manager UPDATE policy).
    execute $c$
      alter table public.overtime_requests
        add constraint overtime_requests_status_check
        check (status in ('pending', 'approved', 'rejected', 'withdrawn'))
        not valid
    $c$;
  end if;
  execute 'alter table public.overtime_requests validate constraint overtime_requests_status_check';
end $$;

-- ---------------------------------------------------------------
-- b. Dates and magnitudes
-- ---------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_requests_dates_check'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_dates_check
      check (
        start_date is null or end_date is null or end_date >= start_date
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leave_requests_days_check'
  ) then
    -- Matches MAX_LEAVE_DAYS in src/validation.js. `days` is what the balance
    -- arithmetic downstream uses, so a value that disagrees with the dates is
    -- worse than a missing one.
    alter table public.leave_requests
      add constraint leave_requests_days_check
      check (days is null or (days > 0 and days <= 90))
      not valid;
  end if;
end $$;

alter table public.leave_requests validate constraint leave_requests_dates_check;
alter table public.leave_requests validate constraint leave_requests_days_check;

do $$
begin
  if to_regclass('public.overtime_requests') is null then
    return;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'overtime_requests_hours_check'
  ) then
    -- MIN_OT_HOURS / MAX_OT_HOURS in src/validation.js, plus the half-hour
    -- granularity the form and payroll both use.
    execute $c$
      alter table public.overtime_requests
        add constraint overtime_requests_hours_check
        check (hours is null or (hours >= 0.5 and hours <= 12 and (hours * 2) = floor(hours * 2)))
        not valid
    $c$;
  end if;
  execute 'alter table public.overtime_requests validate constraint overtime_requests_hours_check';
end $$;

-- ---------------------------------------------------------------
-- c. Overlapping leave
--
-- The check the portal never had. A trigger rather than an EXCLUDE
-- constraint, because only PENDING and APPROVED requests occupy the
-- calendar — a rejected or withdrawn request must be free to overlap
-- anything, and an EXCLUDE constraint cannot express that partial rule
-- across the daterange it would need to build.
--
-- Runs as SECURITY DEFINER so the lookup sees every row regardless of the
-- caller's RLS view: an employee cannot see a colleague's requests, but an
-- overlap check that only sees your own rows would still be correct here
-- (overlaps are per-employee) — the definer context is for the case where
-- an approver edits on someone's behalf.
-- ---------------------------------------------------------------

create or replace function public.guard_leave_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clash text;
begin
  -- Only rows that occupy the calendar can clash, and only with others that
  -- do. A withdrawal or rejection is always allowed through.
  if new.status not in ('pending', 'tl_approved', 'approved') then
    return new;
  end if;
  if new.start_date is null or new.end_date is null or new.emp_id is null then
    return new;
  end if;

  select id into clash
  from public.leave_requests
  where emp_id = new.emp_id
    and id is distinct from new.id
    and status in ('pending', 'tl_approved', 'approved')
    and start_date is not null
    and end_date is not null
    -- Inclusive overlap: two ranges clash unless one ends before the other
    -- starts. daterange(...,'[]') makes the inclusivity explicit.
    and daterange(start_date, end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  limit 1;

  if clash is not null then
    raise exception
      'This leave overlaps request % for the same employee', clash
      using hint = 'Withdraw or amend the existing request first.',
            errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_leave_overlap on public.leave_requests;
create trigger trg_guard_leave_overlap
  before insert or update of emp_id, start_date, end_date, status
  on public.leave_requests
  for each row execute function public.guard_leave_overlap();

-- Postgres grants EXECUTE to PUBLIC by default; naming PUBLIC is what makes
-- the revoke real (see supabase_grant_hardening.sql).
revoke all on function public.guard_leave_overlap() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- d. Duplicate and excessive overtime on one day
--
-- Same reasoning: the total for a date depends on other rows, so only the
-- database can enforce it without two concurrent submissions both passing
-- their own check and together exceeding the limit.
-- ---------------------------------------------------------------

create or replace function public.guard_overtime_daily_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing numeric;
begin
  if new.status not in ('pending', 'approved') then
    return new;
  end if;
  if new.work_date is null or new.emp_id is null or new.hours is null then
    return new;
  end if;

  select coalesce(sum(hours), 0) into existing
  from public.overtime_requests
  where emp_id = new.emp_id
    and work_date = new.work_date
    and id is distinct from new.id
    and status in ('pending', 'approved');

  -- MAX_OT_HOURS_PER_DAY in src/validation.js.
  if existing + new.hours > 12 then
    raise exception
      'Overtime for % would total %h, above the 12h daily limit (%h already claimed)',
      new.work_date, existing + new.hours, existing
      using hint = 'Amend or withdraw the existing claim for that date.',
            errcode = 'check_violation';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.overtime_requests') is null then
    return;
  end if;
  execute 'drop trigger if exists trg_guard_overtime_daily_total on public.overtime_requests';
  execute 'create trigger trg_guard_overtime_daily_total
             before insert or update of emp_id, work_date, hours, status
             on public.overtime_requests
             for each row execute function public.guard_overtime_daily_total()';
end $$;

revoke all on function public.guard_overtime_daily_total() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- e. Pin the manager's leave transitions
--
-- supabase_rls_hardening.sql pinned what an employee and a team lead may set,
-- but left lr_update_mgr as an unconstrained `with check (is_manager())`. A
-- manager could therefore write ANY status — including moving a finished
-- request back to 'pending', which resets the approval chain and leaves the
-- audit trail describing a sequence that never happened.
--
-- A manager is the final approver, so the legitimate moves are: decide a
-- request the team lead has passed up, or correct their own decision.
-- ---------------------------------------------------------------

drop policy if exists lr_update_mgr on public.leave_requests;
create policy lr_update_mgr
  on public.leave_requests for update
  to authenticated
  using (public.is_manager() and status in ('tl_approved', 'approved', 'rejected'))
  with check (public.is_manager() and status in ('approved', 'rejected'));

-- ---------------------------------------------------------------
-- f. Announcement fields
-- ---------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'announcements_priority_check'
  ) then
    alter table public.announcements
      add constraint announcements_priority_check
      check (priority in ('info', 'important', 'urgent'))
      not valid;
  end if;
end $$;

alter table public.announcements validate constraint announcements_priority_check;

-- ---------------------------------------------------------------
-- g. Indexes the new checks rely on
--
-- Without these, every insert scans the table. Both are narrow and match the
-- exact predicate the triggers use.
-- ---------------------------------------------------------------

create index if not exists leave_requests_emp_dates_idx
  on public.leave_requests (emp_id, start_date, end_date)
  where status in ('pending', 'tl_approved', 'approved');

do $$
begin
  if to_regclass('public.overtime_requests') is not null then
    execute $c$
      create index if not exists overtime_requests_emp_date_idx
        on public.overtime_requests (emp_id, work_date)
        where status in ('pending', 'approved')
    $c$;
  end if;
end $$;
