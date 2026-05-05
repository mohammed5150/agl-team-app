-- ADB-AGL Portal — Row Level Security policies (production)
-- Supersedes the permissive policies in supabase_phase5.sql.
-- Run after supabase_schema.sql, supabase_overtime.sql, supabase_phase5.sql.
--
-- Roles in employees.role: 'employee', 'teamlead', 'manager'.
-- Login uses Supabase auth (email/password). Employee identity is resolved by
-- matching auth email to employees.email (lowercased).

-- ---------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they bypass RLS while
-- looking up the caller's role from the employees table itself).
-- ---------------------------------------------------------------

create or replace function public.current_emp_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id from employees
  where lower(email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;

create or replace function public.current_emp_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from employees
  where lower(email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_emp_role() = 'manager', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_emp_role() in ('teamlead','manager'), false);
$$;

revoke all on function public.current_emp_id()   from public;
revoke all on function public.current_emp_role() from public;
revoke all on function public.is_manager()       from public;
revoke all on function public.is_staff()         from public;
grant execute on function public.current_emp_id()   to authenticated;
grant execute on function public.current_emp_role() to authenticated;
grant execute on function public.is_manager()       to authenticated;
grant execute on function public.is_staff()         to authenticated;

-- ---------------------------------------------------------------
-- Drop any existing permissive policies
-- ---------------------------------------------------------------

drop policy if exists portal_all on employees;
drop policy if exists auth_all   on employees;
drop policy if exists portal_all on leave_requests;
drop policy if exists auth_all   on leave_requests;
drop policy if exists portal_all on notifications;
drop policy if exists auth_all   on notifications;
drop policy if exists portal_all on announcements;
drop policy if exists auth_all   on announcements;
drop policy if exists auth_all   on overtime_requests;

-- Idempotent re-runs of this file
drop policy if exists emp_select_all          on employees;
drop policy if exists emp_update_self         on employees;
drop policy if exists emp_update_staff        on employees;
drop policy if exists emp_insert_manager      on employees;
drop policy if exists emp_delete_manager      on employees;
drop policy if exists lr_select               on leave_requests;
drop policy if exists lr_insert_self          on leave_requests;
drop policy if exists lr_update_self_pending  on leave_requests;
drop policy if exists lr_update_tl            on leave_requests;
drop policy if exists lr_update_mgr           on leave_requests;
drop policy if exists lr_delete_mgr           on leave_requests;
drop policy if exists ann_select_all          on announcements;
drop policy if exists ann_insert_staff        on announcements;
drop policy if exists ann_update_staff        on announcements;
drop policy if exists ann_delete_mgr          on announcements;
drop policy if exists nf_select_own           on notifications;
drop policy if exists nf_update_own           on notifications;
drop policy if exists nf_insert_authenticated on notifications;
drop policy if exists nf_delete_own           on notifications;
drop policy if exists ot_select               on overtime_requests;
drop policy if exists ot_insert_self          on overtime_requests;
drop policy if exists ot_update_self_pending  on overtime_requests;
drop policy if exists ot_update_staff         on overtime_requests;
drop policy if exists ot_delete_mgr           on overtime_requests;

-- ---------------------------------------------------------------
-- employees
--   SELECT  : every authenticated user (internal directory)
--   UPDATE  : own row, or any row if caller is teamlead/manager
--   INSERT  : managers only
--   DELETE  : managers only
-- ---------------------------------------------------------------

create policy emp_select_all
  on employees for select
  to authenticated
  using (true);

create policy emp_update_self
  on employees for update
  to authenticated
  using (id = public.current_emp_id())
  with check (id = public.current_emp_id());

create policy emp_update_staff
  on employees for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy emp_insert_manager
  on employees for insert
  to authenticated
  with check (public.is_manager());

create policy emp_delete_manager
  on employees for delete
  to authenticated
  using (public.is_manager());

-- ---------------------------------------------------------------
-- leave_requests
--   SELECT : own requests, plus all rows for staff
--   INSERT : own row, must start as 'pending'
--   UPDATE : self while still pending, or TL when pending,
--            or manager at any time
--   DELETE : managers only
-- ---------------------------------------------------------------

create policy lr_select
  on leave_requests for select
  to authenticated
  using (emp_id = public.current_emp_id() or public.is_staff());

create policy lr_insert_self
  on leave_requests for insert
  to authenticated
  with check (
    emp_id = public.current_emp_id()
    and status = 'pending'
  );

create policy lr_update_self_pending
  on leave_requests for update
  to authenticated
  using (emp_id = public.current_emp_id() and status = 'pending')
  with check (emp_id = public.current_emp_id());

create policy lr_update_tl
  on leave_requests for update
  to authenticated
  using (public.current_emp_role() = 'teamlead' and status = 'pending')
  with check (public.current_emp_role() = 'teamlead');

create policy lr_update_mgr
  on leave_requests for update
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy lr_delete_mgr
  on leave_requests for delete
  to authenticated
  using (public.is_manager());

-- ---------------------------------------------------------------
-- announcements
--   SELECT : every authenticated user
--   INSERT : staff (TL or manager)
--   UPDATE : staff
--   DELETE : managers
-- ---------------------------------------------------------------

create policy ann_select_all
  on announcements for select
  to authenticated
  using (true);

create policy ann_insert_staff
  on announcements for insert
  to authenticated
  with check (public.is_staff());

create policy ann_update_staff
  on announcements for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy ann_delete_mgr
  on announcements for delete
  to authenticated
  using (public.is_manager());

-- ---------------------------------------------------------------
-- notifications
--   SELECT : recipient only
--   UPDATE : recipient only (mark read)
--   INSERT : any authenticated user (sending notifications is
--            currently triggered from many UI paths; tighten later
--            by routing creates through a SECURITY DEFINER RPC)
--   DELETE : recipient only
-- ---------------------------------------------------------------

create policy nf_select_own
  on notifications for select
  to authenticated
  using (to_user = public.current_emp_id());

create policy nf_update_own
  on notifications for update
  to authenticated
  using (to_user = public.current_emp_id())
  with check (to_user = public.current_emp_id());

create policy nf_insert_authenticated
  on notifications for insert
  to authenticated
  with check (true);

create policy nf_delete_own
  on notifications for delete
  to authenticated
  using (to_user = public.current_emp_id());

-- ---------------------------------------------------------------
-- overtime_requests (mirrors leave_requests)
-- ---------------------------------------------------------------

create policy ot_select
  on overtime_requests for select
  to authenticated
  using (emp_id = public.current_emp_id() or public.is_staff());

create policy ot_insert_self
  on overtime_requests for insert
  to authenticated
  with check (
    emp_id = public.current_emp_id()
    and status = 'pending'
  );

create policy ot_update_self_pending
  on overtime_requests for update
  to authenticated
  using (emp_id = public.current_emp_id() and status = 'pending')
  with check (emp_id = public.current_emp_id());

create policy ot_update_staff
  on overtime_requests for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy ot_delete_mgr
  on overtime_requests for delete
  to authenticated
  using (public.is_manager());
