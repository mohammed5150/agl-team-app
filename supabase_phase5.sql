-- Phase 5: tighten RLS + add TL/MGR as employee rows

-- 1) Drop permissive policies
drop policy if exists portal_all on employees;
drop policy if exists portal_all on leave_requests;
drop policy if exists portal_all on announcements;
drop policy if exists portal_all on notifications;

-- 2) Authenticated-only policies
create policy auth_all on employees      for all to authenticated using (true) with check (true);
create policy auth_all on leave_requests for all to authenticated using (true) with check (true);
create policy auth_all on announcements  for all to authenticated using (true) with check (true);
create policy auth_all on notifications  for all to authenticated using (true) with check (true);

-- 3) Insert TL and Manager so they can log in through the normal flow
insert into employees
  (id, email, password, initial_password, name, section, designation, shift, role,
   nationality, mobile, emp_no, dob, marital_status, address, join_date,
   emergency_contact, emergency_name, eid_no, eid_expiry,
   annual_leave, used_annual, sick_leave, used_sick, comp_off)
values
  ('TL-001',  'mohammed.faheem@adbsafegate.ae', 'Adb@2026', false,
   'Mohammed Faheem', 'All', 'Team Leader', 'General', 'teamlead',
   'Indian', '+971 50 222 0001', 'ADB-2001', '1985-03-20', 'Married', 'Abu Dhabi, UAE', '2015-06-01',
   '+971 50 222 0002', 'N/A', '784-XXXX-XXXXXXX-X', '2028-12-31',
   30, 5, 15, 1, 2),
  ('MGR-001', 'ragesh.menon@adbsafegate.ae', 'Adb@2026', false,
   'Ragesh Menon', 'All', 'Maintenance Manager', 'General', 'manager',
   'Indian', '+971 50 333 0001', 'ADB-3001', '1980-07-10', 'Married', 'Abu Dhabi, UAE', '2012-01-15',
   '+971 50 333 0002', 'N/A', '784-XXXX-XXXXXXX-X', '2028-12-31',
   30, 3, 15, 0, 0)
on conflict (id) do nothing;
