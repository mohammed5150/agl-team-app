-- Roster privacy: an employee should not be able to read the whole team's
-- passports.
--
-- THE HOLE
-- employees carries passport_no, passport_expiry, visa_expiry, eid_no,
-- eid_expiry, dob, mobile, address, emergency_contact, emergency_name, plus
-- band and tier from the salary standardisation exercise. Its only SELECT
-- policy was:
--
--   emp_select_all  USING (current_emp_id() IS NOT NULL)
--
-- — any signed-in employee could read every column of every row. The UI hid
-- it (Team, Performance and Documents-management are staff-only screens), but
-- the UI is not the boundary: PostgREST is. Anyone with an account could open
-- devtools, take their access token and GET /rest/v1/employees?select=* to
-- retrieve all 92 colleagues' passport and Emirates ID numbers, dates of
-- birth, home addresses, mobile numbers and pay bands.
--
-- That was near-theoretical while two accounts existed. It stops being
-- theoretical the moment the whole team onboards, which is exactly what is
-- about to happen.
--
-- WHAT AN EMPLOYEE ACTUALLY NEEDS
-- Very little. An employee's navigation has no Team, Performance, Calendar or
-- Documents-management page (src/nav.js, NE). The only code that reads another
-- person's row is newRequestRecipients / newOvertimeRecipients, which need
-- `id` and `role` to address an approval notification to the right team lead
-- and manager. Names and sections are included so the app can label a
-- colleague without another round trip; none of it is personal data.
--
-- SHAPE
--   employees          → self, or staff (team lead / manager). Full columns.
--   employee_directory → everyone, safe columns only.
--
-- Managers and team leads are unaffected: is_staff() keeps their full read.
--
-- ORDER OF DEPLOYMENT — IMPORTANT
-- Ship the application first. app.jsx reads the directory and tolerates it not
-- existing (see fetchRoster), so the deployed app works both before and after
-- this file is applied. Applying this to a database whose app has NOT been
-- updated would leave an ordinary employee unable to route a leave request.

begin;

-- 1. The safe view -----------------------------------------------------------
-- No security_invoker: the view runs with its owner's rights and so is not
-- filtered by the tightened policy below. That is the point — it is the
-- deliberate, column-limited hole in it. The WHERE clause keeps it closed to
-- anyone who is not a member of staff on the roster.
create or replace view public.employee_directory as
  select e.id,
         e.name,
         e.role,
         e.section,
         e.designation,
         e.employment_status
  from public.employees e
  where public.current_emp_id() is not null;

comment on view public.employee_directory is
  'Colleague directory: id, name, role, section, designation, employment status. '
  'Carries no personal data — no contact details, documents, identity numbers, '
  'pay band or rating. Readable by any signed-in employee; the employees table '
  'itself is self-or-staff (see supabase_roster_privacy.sql).';

revoke all on public.employee_directory from anon;
grant select on public.employee_directory to authenticated;

-- 2. Tighten the table --------------------------------------------------------
drop policy if exists emp_select_all on public.employees;

create policy emp_select_self_or_staff on public.employees
  for select
  using (
    id = public.current_emp_id()     -- your own record, in full
    or public.is_staff()             -- team leads and managers, as before
  );

commit;

-- Verification (run by hand; expect employee=1 row, manager=all rows):
--
--   begin;
--   select set_config('request.jwt.claims',
--     (select json_build_object('email', email, 'role', 'authenticated')::text
--      from employees where role = 'employee' order by id limit 1), true);
--   set local role authenticated;
--   select count(*) as employees_visible from employees;          -- expect 1
--   select count(*) as directory_visible from employee_directory; -- expect all
--   rollback;
