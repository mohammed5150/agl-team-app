-- Notifications table (text id — matches client upserts and leave/approval flows).
-- Row Level Security: apply supabase_rls_policies.sql which installs:
--   nf_select_own, nf_update_own, nf_insert_authenticated, nf_delete_own
-- using public.current_emp_id() from the JWT email ↔ employees mapping.
--
-- Do NOT use a blanket `auth_all ... using (true)` policy on this table in production.

create table if not exists notifications (
  id      text primary key,
  to_user text,
  type    text,
  message text,
  read    boolean default false,
  date    timestamptz default now()
);

alter table notifications enable row level security;

drop policy if exists auth_all on notifications;
drop policy if exists portal_all on notifications;
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
end $$;

-- After this file, run: supabase_rls_policies.sql (defines nf_* policies).
