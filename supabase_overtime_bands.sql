-- ===============================================================
-- 10. Performance bands, leave-manager policy fix, and overtime
--     (apply AFTER supabase_rls_hardening.sql)
--
--   a) employees: band / airport / supplier columns
--   b) leave_requests: pin lr_update_mgr status transitions — the
--      hardening migration pinned self + teamlead but left the
--      manager policy as bare is_manager()
--   c) overtime_requests: create the table and its RLS with a
--      TEAM-LEAD-TERMINAL workflow (no manager approval stage)
--
-- Idempotent: safe to re-run.
-- ===============================================================

-- ---------------------------------------------------------------
-- a. Employee performance band / airport / supplier
--    From the manpower salary standardisation exercise. Grade
--    metadata only — no salary or invoice figures are stored.
-- ---------------------------------------------------------------

alter table public.employees add column if not exists band     text;
alter table public.employees add column if not exists airport  text;
alter table public.employees add column if not exists supplier text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_band_check'
  ) then
    alter table public.employees
      add constraint employees_band_check
      check (band is null or band in ('A', 'B', 'C', 'D', 'E'));
  end if;
end $$;

comment on column public.employees.band is
  'Performance band A-E from the salary standardisation exercise. NULL = not graded.';
comment on column public.employees.airport is
  'Airport the employee is deployed at (ZIA/AAN/AZI/XSB/ZDY). NULL = unassigned.';
comment on column public.employees.supplier is
  'Manpower supplier company. NULL = direct staff.';

-- Band, airport and supplier are grading metadata, not self-service fields:
-- only a manager may change them. Mirrors the role/tier guard already applied
-- by supabase_rls_hardening.sql section 4.
create or replace function public.guard_employee_grading()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;
  if (new.band     is distinct from old.band
      or new.airport  is distinct from old.airport
      or new.supplier is distinct from old.supplier)
     and not public.is_manager() then
    raise exception 'Only a manager can change band, airport or supplier';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_employee_grading on public.employees;
create trigger trg_guard_employee_grading
  before update on public.employees
  for each row execute function public.guard_employee_grading();

revoke all on function public.guard_employee_grading() from anon, authenticated;

-- ---------------------------------------------------------------
-- b. Pin the manager's allowed leave status transitions
--    Before this, lr_update_mgr was `using (is_manager())
--    with check (is_manager())` — no status constraint at all, so a
--    manager could revive a withdrawn/rejected request or write an
--    arbitrary status string.
-- ---------------------------------------------------------------

drop policy if exists lr_update_mgr on public.leave_requests;
create policy lr_update_mgr
  on public.leave_requests for update
  to authenticated
  using (
    public.is_manager()
    and status in ('pending', 'tl_approved')
  )
  with check (
    public.is_manager()
    and status in ('tl_approved', 'approved', 'rejected')
  );

-- ---------------------------------------------------------------
-- c. Overtime requests — team-lead-terminal approval
--
--    Workflow:  pending ──TL approve──> approved
--                       ──TL reject───> rejected
--                       ──self────────> withdrawn
--
--    There is deliberately NO manager approval stage and no
--    'tl_approved' status: the team lead is the final approver.
-- ---------------------------------------------------------------

create table if not exists public.overtime_requests (
  id              text primary key,
  emp_id          text,
  emp_name        text,
  section         text,
  work_date       date,
  hours           numeric(4,2),
  reason          text,
  status          text default 'pending',
  applied_on      timestamptz default now(),
  tl_comment      text default '',
  tl_action_date  timestamptz,
  tl_name         text default '',
  comp_off_days   numeric(4,2) default 0
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'overtime_requests_status_check'
  ) then
    alter table public.overtime_requests
      add constraint overtime_requests_status_check
      check (status in ('pending', 'approved', 'rejected', 'withdrawn'));
  end if;
end $$;

create index if not exists overtime_requests_emp_id_idx on public.overtime_requests (emp_id);
create index if not exists overtime_requests_status_idx on public.overtime_requests (status);

alter table public.overtime_requests enable row level security;

-- Drop every earlier policy, including the fully permissive auth_all from
-- supabase_overtime.sql and the manager-stage policies from the hardening
-- migration, which assumed overtime mirrored leave.
drop policy if exists auth_all                on public.overtime_requests;
drop policy if exists portal_all              on public.overtime_requests;
drop policy if exists ot_select               on public.overtime_requests;
drop policy if exists ot_insert_self          on public.overtime_requests;
drop policy if exists ot_update_self_pending  on public.overtime_requests;
drop policy if exists ot_update_staff         on public.overtime_requests;
drop policy if exists ot_update_tl            on public.overtime_requests;
drop policy if exists ot_update_mgr           on public.overtime_requests;
drop policy if exists ot_delete_mgr           on public.overtime_requests;

-- Read: own requests, or any request if you are staff (TL/manager).
create policy ot_select
  on public.overtime_requests for select
  to authenticated
  using (emp_id = public.current_emp_id() or public.is_staff());

-- Create: only for yourself, and only as 'pending'.
create policy ot_insert_self
  on public.overtime_requests for insert
  to authenticated
  with check (
    emp_id = public.current_emp_id()
    and status = 'pending'
  );

-- Requester: may edit their own request while pending, or withdraw it.
create policy ot_update_self_pending
  on public.overtime_requests for update
  to authenticated
  using (emp_id = public.current_emp_id() and status = 'pending')
  with check (
    emp_id = public.current_emp_id()
    and status in ('pending', 'withdrawn')
  );

-- Team lead: the FINAL approver. pending -> approved | rejected.
create policy ot_update_tl
  on public.overtime_requests for update
  to authenticated
  using (public.current_emp_role() = 'teamlead' and status = 'pending')
  with check (
    public.current_emp_role() = 'teamlead'
    and status in ('approved', 'rejected')
  );

-- Manager: may read (via ot_select) and delete, but deliberately has NO
-- update policy — overtime approval stops at the team lead.
create policy ot_delete_mgr
  on public.overtime_requests for delete
  to authenticated
  using (public.is_manager());

-- Freeze request content after submission (same guard as leave).
drop trigger if exists trg_guard_overtime_immutable on public.overtime_requests;
create trigger trg_guard_overtime_immutable
  before update on public.overtime_requests
  for each row execute function public.guard_request_immutable();

-- Realtime: add the table to the publication if it is not already there.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'overtime_requests'
  ) then
    alter publication supabase_realtime add table public.overtime_requests;
  end if;
end $$;
