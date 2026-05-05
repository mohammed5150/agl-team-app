-- Add rating + profile_finalized columns so both features persist to Supabase
alter table employees
  add column if not exists rating jsonb default '{}'::jsonb,
  add column if not exists profile_finalized boolean default false;
