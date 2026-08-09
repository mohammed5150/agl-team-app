-- ===============================================================
-- 12. Grant hardening and roster-backup isolation
--     (apply AFTER supabase_team_onboarding.sql)
--
-- Two defects found by the Supabase database linter after the team
-- onboarding migration was applied. Both are corrected here, and the
-- underlying mistake is fixed at source in the earlier files.
--
-- Idempotent: safe to re-run.
-- ===============================================================

-- ---------------------------------------------------------------
-- a. Trigger functions were still EXECUTE-able by PUBLIC.
--
-- Postgres grants EXECUTE on a newly created function to PUBLIC by
-- default. anon and authenticated inherit that grant, so the
--
--     revoke all on function ... from anon, authenticated;
--
-- lines in the earlier migrations were a no-op: revoking a role does
-- not remove a PUBLIC grant. Every one of these functions remained
-- reachable at /rest/v1/rpc/<name>.
--
-- Exploitability was low — a trigger function invoked outside a trigger
-- context raises "trigger functions can only be called as triggers" —
-- but the intent of those revokes was to close the RPC surface, and
-- they did not.
--
-- Safe: a trigger function does not need EXECUTE on the user running
-- the DML. The privilege is checked when the trigger is CREATED, not
-- when it fires. public.guard_employee_privileges has always run this
-- way in this database, which is the proof.
-- ---------------------------------------------------------------

revoke all on function public.guard_auth_user_approved()      from public, anon, authenticated;
revoke all on function public.guard_employee_email_approved() from public, anon, authenticated;
revoke all on function public.guard_employee_profile_lock()   from public, anon, authenticated;
revoke all on function public.record_profile_unlock()         from public, anon, authenticated;
revoke all on function public.guard_employee_grading()        from public, anon, authenticated;

-- public.is_approved_team_login KEEPS its anon grant. The login form has
-- to check an address before a session exists, and the function returns
-- a bare boolean for one address: it can test, not enumerate.

-- ---------------------------------------------------------------
-- b. The roster backup was exposed through the REST API.
--
-- public.employees_backup_20260808 (61 rows, taken before the roster
-- import) had RLS disabled and SELECT granted to anon, so the whole
-- snapshot was readable without signing in.
--
-- It is moved out of the PostgREST-exposed schema rather than dropped,
-- so the exposure ends immediately while the data survives for the
-- owner to review and drop deliberately.
-- ---------------------------------------------------------------

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;

comment on schema backup is
  'Not exposed to PostgREST. Holds retained snapshots; no end-user role has access.';

do $$
begin
  if to_regclass('public.employees_backup_20260808') is not null then
    execute 'alter table public.employees_backup_20260808 set schema backup';
  end if;
end $$;

do $$
begin
  if to_regclass('backup.employees_backup_20260808') is not null then
    execute 'revoke all on table backup.employees_backup_20260808 from public, anon, authenticated';
    execute 'alter table backup.employees_backup_20260808 enable row level security';
    execute $c$comment on table backup.employees_backup_20260808 is
      'Pre-import roster snapshot taken 2026-08-08 (61 rows). Retained deliberately; drop with: drop table backup.employees_backup_20260808;'$c$;
  end if;
end $$;
