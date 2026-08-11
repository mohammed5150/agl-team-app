-- ============================================================================
-- VIEW GRANT HARDENING
--
-- WHAT WAS WRONG
-- `public.employee_directory` is a SECURITY DEFINER view (the Postgres default
-- for a view: security_invoker is off, so it runs with the privileges of its
-- owner, `postgres`). That is deliberate and load-bearing — it is what lets a
-- non-staff employee see the colleague roster while the `employees` table
-- itself stays self-or-staff. See supabase_roster_privacy.sql.
--
-- What was NOT deliberate is that `authenticated` also held INSERT, UPDATE,
-- DELETE and TRUNCATE on it. supabase_roster_privacy.sql does
--
--     revoke all on public.employee_directory from anon;
--     grant select on public.employee_directory to authenticated;
--
-- which revokes anon but never revokes authenticated. A bare `grant select`
-- adds a privilege; it does not remove the ones already there. And they were
-- already there, because a stock Supabase project ships
--
--     alter default privileges in schema public
--       grant all on tables to anon, authenticated, service_role;
--
-- so every relation created in `public` starts life fully writable by every
-- signed-in user. For a TABLE that is survivable, because RLS still applies.
-- For a SECURITY DEFINER VIEW it is not: the view executes as `postgres`, and
-- `employees` is owned by `postgres` with force_row_level_security off, so a
-- write routed through the view bypasses RLS entirely.
--
-- The view is a simple single-table select, which makes it auto-updatable, so
-- the write actually reaches the table. Confirmed against the live database by
-- planning the statement as `authenticated`:
--
--     Delete on employees e
--       ->  Result
--             One-Time Filter: (current_emp_id() IS NOT NULL)
--             ->  Seq Scan on employees e
--
-- No RLS qualifier, no policy consulted — and `employees` has no DELETE policy
-- at all, so RLS would otherwise have refused outright. Any signed-in employee
-- could have deleted the entire roster with one PostgREST call. The audit
-- trigger would have faithfully recorded the wipe without preventing it.
--
-- UPDATE through the same path was already largely contained: the eight guard
-- triggers on `employees` check auth.role(), which reads a JWT claim and is
-- therefore unaffected by SECURITY DEFINER, so role/tier/status/profile
-- changes still raised. DELETE had no such guard. Both are closed below.
-- ============================================================================

-- 1. The directory is a read surface. Say so in the grants -------------------
--
-- Ordering matters: revoke everything first, then re-grant only SELECT.
revoke all privileges on public.employee_directory from anon, authenticated;
grant select on public.employee_directory to authenticated;

-- 2. The audit and error views are read surfaces too -------------------------
--
-- These three already set security_invoker = true, so RLS on the underlying
-- tables does apply to them and they were never exposed the way the directory
-- was. They are included because an audit trail that the audited party can
-- UPDATE or DELETE is not an audit trail, and relying on "the policy happens
-- to forbid it" is a weaker guarantee than not holding the privilege.
revoke all privileges on public.audit_approvals           from anon, authenticated;
revoke all privileges on public.audit_privileged_changes  from anon, authenticated;
revoke all privileges on public.client_error_summary      from anon, authenticated;
grant select on public.audit_approvals          to authenticated;
grant select on public.audit_privileged_changes to authenticated;
grant select on public.client_error_summary     to authenticated;

-- 3. Defence in depth: employees are offboarded, never deleted ---------------
--
-- Step 1 closes the known route. This closes the class of route: any future
-- SECURITY DEFINER view over `employees` would bypass RLS the same way, and
-- the next person to add one will not necessarily remember why the grants on
-- the last one were written the way they are.
--
-- The application never deletes an employee — offboarding is a status change
-- (see set_employment_status), which is what keeps the audit trail and the
-- leave history attached to a real row. A manager retains the ability to
-- delete, matching how every other guard on this table treats managers.
create or replace function public.guard_employee_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- service_role and direct SQL-editor work are out of scope, exactly as in
  -- guard_employee_privileges and the other guards on this table.
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return old;
  end if;

  if not public.is_manager() then
    raise exception 'Employees are offboarded, not deleted'
      using hint  = 'Profile > Account > Offboard keeps the audit trail and leave history attached.',
            errcode = 'insufficient_privilege';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_guard_employee_delete on public.employees;
create trigger trg_guard_employee_delete
  before delete on public.employees
  for each row execute function public.guard_employee_delete();

-- A trigger function is not an API. New functions in `public` pick up EXECUTE
-- for anon and authenticated from the same default privileges described above,
-- which would publish this one at /rest/v1/rpc/guard_employee_delete. The call
-- would fail ("trigger functions can only be called as triggers"), but none of
-- the sibling guards on this table carry that grant and this one should not
-- either.
revoke execute on function public.guard_employee_delete() from anon, authenticated;

-- VERIFY ---------------------------------------------------------------------
--   -- expect: select true, update/delete false
--   select has_table_privilege('authenticated','public.employee_directory','SELECT'),
--          has_table_privilege('authenticated','public.employee_directory','UPDATE'),
--          has_table_privilege('authenticated','public.employee_directory','DELETE');
--
--   -- expect: permission denied for view employee_directory
--   begin;
--     select set_config('request.jwt.claims','{"role":"authenticated"}', true);
--     set local role authenticated;
--     explain delete from public.employee_directory;
--   rollback;
