-- ===============================================================
-- Template for supabase_team_onboarding_data.local.sql
--
-- The real file holds the team's personal email addresses, so it is
-- gitignored (*.local.sql) and never committed. Copy this file to
-- supabase_team_onboarding_data.local.sql, replace the placeholder rows
-- with the real Team Mail IDs, and run it in the Supabase SQL editor
-- AFTER supabase_team_onboarding.sql (step 11).
--
-- Needed only for a NEW or EMPTY project. An existing deployment already
-- holds this data, and new joiners are approved in the portal
-- (approve_team_login). The current list can be read back by a manager
-- with list_team_logins(), or from a backup (docs/BACKUP_RESTORE.md).
--
-- Idempotent: safe to re-run.
-- ===============================================================

-- e. Repoint confirmed employees rows at their Team Mail IDs.
--    A row is updated only when the address is not already held by a
--    different employee, so a wrong row here cannot steal a login.
do $$
declare
  m record;
begin
  for m in
    select * from (values
      ('EMP-000', 'first.last@example.com'),   -- placeholder
      ('TL-000',  'team.lead@example.com')     -- placeholder
    ) as t(emp_id, team_mail)
  loop
    if not exists (select 1 from public.employees where id = m.emp_id) then
      raise notice 'Team mail mapping skipped, no such employee: %', m.emp_id;
      continue;
    end if;
    if exists (
      select 1 from public.employees
      where lower(email) = lower(m.team_mail) and id <> m.emp_id
    ) then
      raise notice 'Team mail % already held by another employee, skipping %',
        m.team_mail, m.emp_id;
      continue;
    end if;
    update public.employees
       set email = m.team_mail
     where id = m.emp_id
       and (email is distinct from m.team_mail);
  end loop;
end $$;

-- f1. Seed the approved Team Mail IDs, stored verbatim.
--     Label an address "employee mapping unresolved" when it should be
--     able to sign in but no employees row is confirmed for it yet.
insert into public.approved_team_logins (email, label) values
  ('first.last@example.com', 'Placeholder — EMP-000'),
  ('team.lead@example.com',  'Placeholder — TL-000, team lead')
on conflict (email) do nothing;
