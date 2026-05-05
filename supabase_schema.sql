-- ADB-AGL Portal — Supabase schema (v1)
-- Paste this whole file into Supabase SQL Editor → "Run".

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

create table if not exists employees (
  id                 text primary key,
  email              text unique,
  password           text,
  initial_password   boolean default true,
  name               text not null,
  section            text,
  designation        text,
  shift              text,
  role               text default 'employee',
  nationality        text,
  mobile             text,
  emp_no             text,
  dob                date,
  marital_status     text,
  address            text,
  join_date          date,
  emergency_contact  text,
  emergency_name     text,
  passport_no        text,
  passport_expiry    date,
  visa_expiry        date,
  eid_no             text,
  eid_expiry         date,
  annual_leave       int default 30,
  used_annual        int default 0,
  sick_leave         int default 15,
  used_sick          int default 0,
  comp_off           int default 0,
  roster             jsonb default '{}'::jsonb,
  achievements       jsonb default '[]'::jsonb,
  warnings           jsonb default '[]'::jsonb,
  actions            jsonb default '[]'::jsonb,
  training           jsonb default '[]'::jsonb,
  documents          jsonb default '[]'::jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists leave_requests (
  id                 text primary key,
  emp_id             text,
  emp_name           text,
  section            text,
  type               text,
  start_date         date,
  end_date           date,
  days               int,
  reason             text,
  status             text default 'pending',
  applied_on         timestamptz default now(),
  tl_comment         text default '',
  mgr_comment        text default '',
  tl_action_date     timestamptz,
  mgr_action_date    timestamptz,
  tl_name            text default '',
  mgr_name           text default ''
);

create table if not exists notifications (
  id                 bigserial primary key,
  to_user            text,
  type               text,
  message            text,
  read               boolean default false,
  date               timestamptz default now()
);

create table if not exists announcements (
  id                 text primary key,
  title              text not null,
  message            text,
  priority           text default 'info',
  pinned             boolean default false,
  date               timestamptz default now(),
  by_user            text,
  target             text default 'all'
);

-- ---------------------------------------------------------------
-- Row Level Security (permissive for v1 — tighten before production)
-- ---------------------------------------------------------------

alter table employees        enable row level security;
alter table leave_requests   enable row level security;
alter table notifications    enable row level security;
alter table announcements    enable row level security;

drop policy if exists portal_all on employees;
drop policy if exists portal_all on leave_requests;
drop policy if exists portal_all on notifications;
drop policy if exists portal_all on announcements;

create policy portal_all on employees      for all using (true) with check (true);
create policy portal_all on leave_requests for all using (true) with check (true);
create policy portal_all on notifications  for all using (true) with check (true);
create policy portal_all on announcements  for all using (true) with check (true);

-- ---------------------------------------------------------------
-- Realtime (so approvals show up live on other devices)
-- ---------------------------------------------------------------

alter publication supabase_realtime add table employees;
alter publication supabase_realtime add table leave_requests;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table announcements;
