-- ADB-AGL Portal — Web Push subscriptions
-- Stores per-device push endpoints. The send-push Edge Function uses the
-- service-role key to read any user's subscriptions and dispatch pushes.

create table if not exists push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null references employees(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz default now(),
  last_seen_at  timestamptz default now()
);

create index if not exists push_subscriptions_user_id_idx
  on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

-- Drop in case of re-run
drop policy if exists ps_select_own on push_subscriptions;
drop policy if exists ps_insert_own on push_subscriptions;
drop policy if exists ps_update_own on push_subscriptions;
drop policy if exists ps_delete_own on push_subscriptions;

-- Users see and manage only their own device subscriptions.
-- The Edge Function reads cross-user via service_role (bypasses RLS).
create policy ps_select_own on push_subscriptions for select
  to authenticated
  using (user_id = public.current_emp_id());

create policy ps_insert_own on push_subscriptions for insert
  to authenticated
  with check (user_id = public.current_emp_id());

create policy ps_update_own on push_subscriptions for update
  to authenticated
  using (user_id = public.current_emp_id())
  with check (user_id = public.current_emp_id());

create policy ps_delete_own on push_subscriptions for delete
  to authenticated
  using (user_id = public.current_emp_id());
