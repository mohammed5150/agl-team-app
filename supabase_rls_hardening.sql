-- ADB-AGL Portal — RLS hardening (run after supabase_rls_policies.sql)
--
-- Closes four privilege-escalation holes found in security review:
--   1. employees.password is a legacy plaintext column (auth is Supabase Auth
--      only) readable by every authenticated user -> drop it.
--   2. Login auto-signup means ANY email can obtain an authenticated session;
--      emp_select_all/ann_select_all used using(true), exposing the employee
--      directory to non-employees -> gate on being a real employee.
--   3. emp_update_self / emp_update_staff WITH CHECK did not pin role/tier,
--      so an employee (or TL) could UPDATE their own role to 'manager'
--      -> trigger guard restricts privileged columns to managers.
--   4. lr_update_self_pending / lr_update_tl WITH CHECK did not pin status,
--      so an employee could self-approve and a TL could skip the manager
--      -> pin the allowed target statuses per role.

-- ---------------------------------------------------------------
-- 1. Drop legacy plaintext password column
--    (initial_password stays — it is a boolean flag the app uses to
--    force a password change on first login, not a secret)
-- ---------------------------------------------------------------

alter table employees drop column if exists password;

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
-- 3. Only managers may change privileged employee columns
--    (role, tier, id, email). Employees/TLs keep profile edits.
-- ---------------------------------------------------------------

create or replace function public.guard_employee_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role  is distinct from old.role
      or new.tier  is distinct from old.tier
      or new.id    is distinct from old.id
      or new.email is distinct from old.email)
     and not public.is_manager() then
    raise exception 'Only managers may change role, tier, id, or email';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_employee_privileges on employees;
create trigger trg_guard_employee_privileges
  before update on employees
  for each row execute function public.guard_employee_privileges();

-- ---------------------------------------------------------------
-- 4. Pin allowed status transitions on leave/overtime updates
-- ---------------------------------------------------------------

-- Employee editing their own request: may keep it 'pending' or
-- withdraw it — never approve it
drop policy if exists lr_update_self_pending on leave_requests;
create policy lr_update_self_pending
  on leave_requests for update
  to authenticated
  using (emp_id = public.current_emp_id() and status = 'pending')
  with check (
    emp_id = public.current_emp_id()
    and status in ('pending', 'withdrawn')
  );

-- Team lead: may only move a pending request to tl_approved/rejected
drop policy if exists lr_update_tl on leave_requests;
create policy lr_update_tl
  on leave_requests for update
  to authenticated
  using (public.current_emp_role() = 'teamlead' and status = 'pending')
  with check (
    public.current_emp_role() = 'teamlead'
    and status in ('tl_approved', 'rejected')
  );

-- Overtime mirrors leave for the employee self-edit case
drop policy if exists ot_update_self_pending on overtime_requests;
create policy ot_update_self_pending
  on overtime_requests for update
  to authenticated
  using (emp_id = public.current_emp_id() and status = 'pending')
  with check (emp_id = public.current_emp_id() and status = 'pending');
