-- Overtime requests table
create table if not exists overtime_requests (
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

alter table overtime_requests enable row level security;
drop policy if exists auth_all on overtime_requests;
create policy auth_all on overtime_requests for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table overtime_requests;
