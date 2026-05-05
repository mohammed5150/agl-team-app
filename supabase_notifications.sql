-- Recreate notifications table with text id (matches other tables)
drop table if exists notifications cascade;

create table notifications (
  id      text primary key,
  to_user text,
  type    text,
  message text,
  read    boolean default false,
  date    timestamptz default now()
);

alter table notifications enable row level security;
create policy auth_all on notifications for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table notifications;
