-- ADB-AGL Portal — RLS hardening (run after supabase_rls_policies.sql)
--
-- Idempotent. Re-run any time the base policy file changes.
--
-- Closes the privilege-escalation and data-integrity holes found in review:
--   1. employees.password legacy plaintext column -> drop it.
--   2. Directory (employees/announcements) exposed to any auto-signup session
--      -> gate SELECT on being a real employee.
--   3. Privileged employee columns (role/tier/id/email) AND leave-balance /
--      rating / warning columns editable by the row owner -> a trigger pins
--      them to managers (privileged) or staff (balances), with an escape hatch
--      for trusted backend roles (service_role / SQL editor) so admin fixes and
--      migrations are not blocked.
--   4. Approval updates could rewrite request content or skip a stage:
--        - leave/overtime status transitions pinned per role,
--        - a trigger freezes request identity/content after submission.
--   5. Notifications insertable by any authenticated session (incl. non-employee
--      auto-signups) -> require the inserter to be a real employee.
--
-- auth.role() returns 'authenticated' for end users, 'service_role' for the
-- backend, and NULL in the SQL editor. Enforcement targets 'authenticated'
-- only; coalescing NULL -> 'service_role' lets migrations and admin edits pass.

-- ---------------------------------------------------------------
-- 1. Drop legacy plaintext password column
--    (initial_password stays — a boolean flag the app uses to force a
--     password change on first login, not a secret)
-- ---------------------------------------------------------------

alter table employees drop column if exists password;

-- initial_password: existing accounts predate the forced-change feature, so
-- they must not be flagged. Detect first application by the OLD column default
-- (true) and clear existing rows once; on re-run (default already false) the
-- backfill is skipped so genuinely invited-but-not-yet-changed users keep their
-- forced prompt. New invites set initial_password=true explicitly via the app.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees'
      and column_name = 'initial_password'
      and column_default is not null and column_default ilike '%true%'
  ) then
    update employees set initial_password = false;
  end if;
end $$;

alter table employees alter column initial_password set default false;

-- ---------------------------------------------------------------
-- 2. Directory visible to actual employees only
--    (current_emp_id() is null for auth users with no employees row)
-- ---------------------------------------------------------------

drop policy if exists emp_select_all on employees;
create policy emp_select_all
  on employees for select
  to authenticated
  using (public.current_emp_id() is not null);

drop policy if exists ann_select_all on announcements;
create policy ann_select_all
  on announcements for select
  to authenticated
  using (public.current_emp_id() is not null);

-- ---------------------------------------------------------------
-- 3. Guard privileged + balance columns on employees
--    role/tier/id/email  -> managers only
--    leave balances / rating / warnings -> staff (TL or manager) only
--    Trusted backend roles (service_role / SQL editor) always bypass.
-- ---------------------------------------------------------------

create or replace function public.guard_employee_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := coalesce(auth.role(), 'service_role');
begin
  -- Only enforce against real authenticated end users.
  if actor_role <> 'authenticated' then
    return new;
  end if;

  if (new.role  is distinct from old.role
      or new.tier  is distinct from old.tier
      or new.id    is distinct from old.id
      or new.email is distinct from old.email)
     and not public.is_manager() then
    raise exception 'Only managers may change role, tier, id, or email';
  end if;

  if (new.annual_leave is distinct from old.annual_leave
      or new.used_annual is distinct from old.used_annual
      or new.sick_leave  is distinct from old.sick_leave
      or new.used_sick   is distinct from old.used_sick
      or new.comp_off    is distinct from old.comp_off
      or new.rating      is distinct from old.rating
      or new.warnings    is distinct from old.warnings)
     and not public.is_staff() then
    raise exception 'Only team leads or managers may change leave balances, ratings, or warnings';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_employee_privileges on employees;
create trigger trg_guard_employee_privileges
  before update on employees
  for each row execute function public.guard_employee_privileges();

-- Trigger functions must not be callable via the REST RPC surface; the trigger
-- still fires (owner context), so revoking EXECUTE is safe and clears the
-- "Public/Signed-in can execute SECURITY DEFINER function" advisor warning.
revoke all on function public.guard_employee_privileges() from anon, authenticated;

-- ---------------------------------------------------------------
-- 4a. Pin allowed status transitions on leave/overtime updates
-- ---------------------------------------------------------------

-- Employee editing their own request: may keep it 'pending' or withdraw it.
drop policy if exists lr_update_self_pending on leave_requests;
create policy lr_update_self_pending
  on leave_requests for update
  to authenticated
  using (emp_id = public.current_emp_id() and status = 'pending')
  with check (
    emp_id = public.current_emp_id()
    and status in ('pending', 'withdrawn')
  );

-- Team lead: may only move a pending request to tl_approved/rejected.
drop policy if exists lr_update_tl on leave_requests;
create policy lr_update_tl
  on leave_requests for update
  to authenticated
  using (public.current_emp_role() = 'teamlead' and status = 'pending')
  with check (
    public.current_emp_role() = 'teamlead'
    and status in ('tl_approved', 'rejected')
  );

-- ---------------------------------------------------------------
-- 4b. Freeze request identity/content after submission
--     Approvers (TL/manager) may change status/comments but NOT the
--     requester, dates, days, type, or reason. The requester may still
--     edit their own row while it is pending. Backend roles bypass.
-- ---------------------------------------------------------------

create or replace function public.guard_request_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;
  -- The requester editing their own still-pending row is allowed.
  if old.emp_id = public.current_emp_id() and old.status = 'pending' then
    return new;
  end if;
  if (new.emp_id     is distinct from old.emp_id
      or new.start_date is distinct from old.start_date
      or new.end_date   is distinct from old.end_date
      or new.days       is distinct from old.days
      or new.type       is distinct from old.type
      or new.reason     is distinct from old.reason) then
    raise exception 'Request details cannot be changed after submission';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_leave_immutable on leave_requests;
create trigger trg_guard_leave_immutable
  before update on leave_requests
  for each row execute function public.guard_request_immutable();

revoke all on function public.guard_request_immutable() from anon, authenticated;

-- Overtime mirrors leave — status pinning + content freeze — but only if the
-- overtime_requests table exists (supabase_overtime.sql is optional and not
-- applied everywhere). Guarded so the migration never fails without overtime.
do $$
begin
  if to_regclass('public.overtime_requests') is null then
    return;
  end if;

  -- employee self-edit (keep pending or withdraw)
  execute 'drop policy if exists ot_update_self_pending on overtime_requests';
  execute 'create policy ot_update_self_pending on overtime_requests for update to authenticated using (emp_id = public.current_emp_id() and status = ''pending'') with check (emp_id = public.current_emp_id() and status in (''pending'', ''withdrawn''))';

  -- replace the unpinned ot_update_staff with role-scoped approval policies so
  -- a team lead can no longer set overtime straight to 'approved'
  execute 'drop policy if exists ot_update_staff on overtime_requests';
  execute 'drop policy if exists ot_update_tl on overtime_requests';
  execute 'create policy ot_update_tl on overtime_requests for update to authenticated using (public.current_emp_role() = ''teamlead'' and status = ''pending'') with check (public.current_emp_role() = ''teamlead'' and status in (''tl_approved'', ''rejected''))';
  execute 'drop policy if exists ot_update_mgr on overtime_requests';
  execute 'create policy ot_update_mgr on overtime_requests for update to authenticated using (public.is_manager()) with check (public.is_manager() and status in (''tl_approved'', ''approved'', ''rejected''))';

  -- freeze request content on overtime too
  execute 'drop trigger if exists trg_guard_overtime_immutable on overtime_requests';
  execute 'create trigger trg_guard_overtime_immutable before update on overtime_requests for each row execute function public.guard_request_immutable()';
end $$;

-- ---------------------------------------------------------------
-- 5. Notifications: only real employees may create them
--    (blocks non-employee auto-signup sessions from spoofing/spamming;
--     tighten further later by routing creates through a SECURITY DEFINER RPC)
-- ---------------------------------------------------------------

drop policy if exists nf_insert_authenticated on notifications;
drop policy if exists nf_insert_employee on notifications;
create policy nf_insert_employee
  on notifications for insert
  to authenticated
  with check (public.current_emp_id() is not null);
