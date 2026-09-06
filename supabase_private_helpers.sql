-- ===============================================================
-- 18. Advisor cleanup and private `app` schema for RLS helpers
--     (apply AFTER supabase_onboarding_selfservice.sql)
--
--   a) list_team_logins / revoke_team_login are no longer callable
--      through the REST API (SQL-editor manager tools only)
--   b) backup.employees_backup_20260808 gets a primary key and an
--      explicit deny-all policy
--   c) never-used indexes dropped (recreate when volume justifies)
--   d) the six RLS helper functions move from `public` to a new
--      `app` schema that PostgREST does not expose, so they stop
--      appearing under /rest/v1/rpc. Policies follow the move
--      automatically (they bind by function identity, not name).
--      Every function body that called public.<helper>() is
--      recreated calling app.<helper>().
--
--   Only three RPC entry points remain in `public` by design:
--   is_approved_team_login (anon pre-login check), and the
--   manager-guarded approve_team_login / set_employment_status.
--
-- Applied to production 2026-08-22 as migrations
--   advisor_cleanup_grants_backup_indexes and
--   move_rls_helpers_to_private_app_schema.
-- Idempotent: safe to re-run.
-- ===============================================================

-- ---------------------------------------------------------------
-- a. Admin functions off the REST API surface.
-- ---------------------------------------------------------------
revoke execute on function public.list_team_logins() from public, anon, authenticated;
revoke execute on function public.revoke_team_login(text) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- b. Backup snapshot: primary key + explicit deny policy.
-- ---------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'backup'
      and t.relname = 'employees_backup_20260808'
      and c.contype = 'p'
  ) then
    alter table backup.employees_backup_20260808 add primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'backup'
      and tablename  = 'employees_backup_20260808'
      and policyname = 'backup_no_end_user_access'
  ) then
    create policy backup_no_end_user_access on backup.employees_backup_20260808
      for select using (false);
  end if;
end $$;

-- ---------------------------------------------------------------
-- c. Never-used indexes.
-- ---------------------------------------------------------------
drop index if exists public.audit_log_occurred_idx;
drop index if exists public.audit_log_changed_cols_idx;
drop index if exists public.leave_requests_emp_dates_idx;
drop index if exists public.client_errors_fingerprint_idx;

-- ---------------------------------------------------------------
-- d. Private `app` schema for the RLS helpers.
-- ---------------------------------------------------------------
create schema if not exists app;
grant usage on schema app to authenticated;

do $$
declare fn text;
begin
  foreach fn in array array['current_emp_id()', 'current_emp_role()',
                            'is_manager()', 'is_staff()',
                            'is_active_employee()', 'can_notify(text)'] loop
    if to_regprocedure('public.' || fn) is not null then
      execute format('alter function public.%s set schema app', fn);
    end if;
  end loop;
end $$;

-- Helpers that call sibling helpers, requalified.
create or replace function app.is_manager()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(app.current_emp_role() = 'manager', false);
$function$;

create or replace function app.is_staff()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(app.current_emp_role() in ('teamlead','manager'), false);
$function$;

create or replace function app.can_notify(target_emp_id text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    app.current_emp_id() is not null
    and (
      app.is_staff()
      or target_emp_id = app.current_emp_id()
      or exists (
        select 1 from public.employees e
        where e.id = target_emp_id
          and e.role in ('teamlead', 'manager')
      )
    );
$function$;

-- Remaining public functions, with helper calls requalified to app.*.
create or replace function public.approve_team_login(p_email text, p_label text default null::text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  addr text := lower(trim(coalesce(p_email, '')));
begin
  if not app.is_manager() then
    raise exception 'Only a manager may approve a Team Mail ID'
      using errcode = 'insufficient_privilege';
  end if;

  if addr = '' or addr !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'That is not a valid email address: %', p_email
      using hint = 'Check for typos and stray spaces before approving.',
            errcode = 'check_violation';
  end if;

  if exists (select 1 from public.approved_team_logins where lower(email) = addr) then
    return 'already approved';
  end if;

  insert into public.approved_team_logins (email, label, approved_by_id, approved_by_email)
  values (addr, nullif(trim(coalesce(p_label, '')), ''),
          app.current_emp_id(), auth.email());

  return 'approved';
end;
$function$;

create or replace function public.revoke_team_login(p_email text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  addr text := lower(trim(coalesce(p_email, '')));
  emp  text;
begin
  if not app.is_manager() then
    raise exception 'Only a manager may revoke a Team Mail ID'
      using errcode = 'insufficient_privilege';
  end if;

  select id into emp from public.employees where lower(email) = addr;
  if emp is not null then
    raise exception 'That address still belongs to employee % — offboard them instead', emp
      using hint = 'Profile > Account > Offboard. Revoking here would orphan the record.',
            errcode = 'check_violation';
  end if;

  delete from public.approved_team_logins where lower(email) = addr;
  if not found then
    return 'not on the list';
  end if;
  return 'revoked';
end;
$function$;

create or replace function public.set_employment_status(p_emp_id text, p_status text, p_reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not app.is_manager() then
    raise exception 'Only a manager may change employment status'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('active', 'suspended', 'offboarded') then
    raise exception 'Unknown employment status: %', p_status
      using errcode = 'check_violation';
  end if;
  if p_emp_id = app.current_emp_id() then
    raise exception 'You cannot change your own employment status'
      using errcode = 'check_violation';
  end if;

  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);

  update public.employees
     set employment_status = p_status
   where id = p_emp_id;

  if not found then
    raise exception 'No such employee: %', p_emp_id using errcode = 'no_data_found';
  end if;
end;
$function$;

create or replace function public.list_team_logins()
 returns table(email text, label text, approved_at timestamp with time zone, approved_by text, employee_id text, has_account boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select a.email,
         a.label,
         a.approved_at,
         coalesce(a.approved_by_email, 'imported'),
         e.id,
         exists (select 1 from auth.users u where lower(u.email) = lower(a.email))
  from public.approved_team_logins a
  left join public.employees e on lower(e.email) = lower(a.email)
  where app.is_manager()
  order by a.approved_at desc, a.email;
$function$;

create or replace function public.employees_protect_tier()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.tier is distinct from old.tier and not app.is_manager() then
    raise exception 'Only managers may modify employee tier';
  end if;
  return new;
end;
$function$;

create or replace function public.employees_protect_tier_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.tier is not null and not app.is_manager() then
    raise exception 'Only managers may set employee tier';
  end if;
  return new;
end;
$function$;

create or replace function public.guard_employee_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return old;
  end if;

  if not app.is_manager() then
    raise exception 'Employees are offboarded, not deleted'
      using hint  = 'Profile > Account > Offboard keeps the audit trail and leave history attached.',
            errcode = 'insufficient_privilege';
  end if;

  return old;
end;
$function$;

create or replace function public.guard_employee_grading()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;
  if (new.band is distinct from old.band
      or new.airport  is distinct from old.airport
      or new.supplier is distinct from old.supplier)
     and not app.is_manager() then
    raise exception 'Only a manager can change band, airport or supplier';
  end if;
  return new;
end;
$function$;

create or replace function public.guard_employee_privileges()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  actor_role text := coalesce(auth.role(), 'service_role');
begin
  if actor_role <> 'authenticated' then
    return new;
  end if;

  if (new.role  is distinct from old.role
      or new.tier  is distinct from old.tier
      or new.id    is distinct from old.id
      or new.email is distinct from old.email)
     and not app.is_manager() then
    raise exception 'Only managers may change role, tier, id, or email';
  end if;

  if (new.annual_leave is distinct from old.annual_leave
      or new.used_annual is distinct from old.used_annual
      or new.sick_leave  is distinct from old.sick_leave
      or new.used_sick   is distinct from old.used_sick
      or new.comp_off    is distinct from old.comp_off
      or new.rating      is distinct from old.rating
      or new.warnings    is distinct from old.warnings)
     and not app.is_staff() then
    raise exception 'Only team leads or managers may change leave balances, ratings, or warnings';
  end if;

  return new;
end;
$function$;

create or replace function public.guard_employee_profile_lock()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;

  -- Rule 0 — UNLOCK IS MANAGER-ONLY. Checked BEFORE the staff bypass.
  if old.profile_finalized and not new.profile_finalized
     and not app.is_manager() then
    raise exception
      'A finalized profile can only be reopened by a manager';
  end if;

  if app.is_staff() then
    return new;
  end if;

  if old.id is distinct from app.current_emp_id() then
    raise exception 'You may only edit your own profile';
  end if;

  if new.initial_password and not old.initial_password then
    raise exception 'The initial password flag cannot be re-armed';
  end if;

  if old.profile_finalized then
    if (new.name             is distinct from old.name
        or new.nationality      is distinct from old.nationality
        or new.mobile           is distinct from old.mobile
        or new.dob              is distinct from old.dob
        or new.marital_status   is distinct from old.marital_status
        or new.address          is distinct from old.address
        or new.emergency_name   is distinct from old.emergency_name
        or new.emergency_contact is distinct from old.emergency_contact
        or new.passport_no      is distinct from old.passport_no
        or new.passport_expiry  is distinct from old.passport_expiry
        or new.visa_expiry      is distinct from old.visa_expiry
        or new.eid_no           is distinct from old.eid_no
        or new.eid_expiry       is distinct from old.eid_expiry
        or new.documents        is distinct from old.documents) then
      raise exception
        'Your profile is finalized. Ask a manager to make corrections.';
    end if;
  end if;

  if (new.id            is distinct from old.id
      or new.email         is distinct from old.email
      or new.role          is distinct from old.role
      or new.tier          is distinct from old.tier
      or new.band          is distinct from old.band
      or new.airport       is distinct from old.airport
      or new.supplier      is distinct from old.supplier
      or new.designation   is distinct from old.designation
      or new.section       is distinct from old.section
      or new.emp_no        is distinct from old.emp_no
      or new.shift         is distinct from old.shift
      or new.annual_leave  is distinct from old.annual_leave
      or new.used_annual   is distinct from old.used_annual
      or new.sick_leave    is distinct from old.sick_leave
      or new.used_sick     is distinct from old.used_sick
      or new.comp_off      is distinct from old.comp_off
      or new.rating        is distinct from old.rating
      or new.warnings      is distinct from old.warnings
      or new.achievements  is distinct from old.achievements
      or new.actions       is distinct from old.actions
      or new.training      is distinct from old.training
      or new.roster        is distinct from old.roster) then
    raise exception
      'That field is managed by your team lead or manager';
  end if;

  return new;
end;
$function$;

create or replace function public.guard_employment_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;

  if new.employment_status is distinct from old.employment_status then
    if not app.is_manager() then
      raise exception 'Only a manager may change employment status'
        using errcode = 'insufficient_privilege';
    end if;
    if new.employment_status = 'offboarded' then
      new.offboarded_at := now();
    elsif old.employment_status = 'offboarded' then
      new.offboarded_at := null;
    end if;
  else
    new.offboarded_at := old.offboarded_at;
  end if;

  return new;
end;
$function$;

create or replace function public.guard_request_immutable()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  frozen text[];
  o      jsonb;
  n      jsonb;
  col    text;
begin
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;

  if old.emp_id = app.current_emp_id() and old.status = 'pending' then
    return new;
  end if;

  frozen := case tg_table_name
              when 'leave_requests'    then array['emp_id','start_date','end_date','days','type','reason']
              when 'overtime_requests' then array['emp_id','work_date','hours','reason']
              else array['emp_id']
            end;

  o := to_jsonb(old);
  n := to_jsonb(new);

  foreach col in array frozen loop
    if (o -> col) is distinct from (n -> col) then
      raise exception 'Request details cannot be changed after submission';
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.record_audit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  pk_col     text := coalesce(TG_ARGV[0], 'id');
  sensitive  text[] := array[
    'passport_no', 'eid_no', 'mobile', 'address', 'dob',
    'emergency_contact', 'emergency_name'
  ];
  old_j      jsonb;
  new_j      jsonb;
  changed    text[] := '{}';
  out_old    jsonb  := '{}'::jsonb;
  out_new    jsonb  := '{}'::jsonb;
  k          text;
  rec_id     text;
begin
  if TG_OP = 'INSERT' then
    new_j := to_jsonb(new);
    old_j := '{}'::jsonb;
  elsif TG_OP = 'DELETE' then
    old_j := to_jsonb(old);
    new_j := '{}'::jsonb;
  else
    old_j := to_jsonb(old);
    new_j := to_jsonb(new);
  end if;

  rec_id := coalesce(new_j ->> pk_col, old_j ->> pk_col);

  for k in
    select jsonb_object_keys(old_j || new_j)
  loop
    if (old_j -> k) is distinct from (new_j -> k) then
      changed := changed || k;
      if k = any (sensitive) then
        if old_j ? k then out_old := out_old || jsonb_build_object(k, '[redacted]'); end if;
        if new_j ? k then out_new := out_new || jsonb_build_object(k, '[redacted]'); end if;
      else
        if old_j ? k then out_old := out_old || jsonb_build_object(k, old_j -> k); end if;
        if new_j ? k then out_new := out_new || jsonb_build_object(k, new_j -> k); end if;
      end if;
    end if;
  end loop;

  if TG_OP = 'UPDATE' and cardinality(changed) = 0 then
    return null;
  end if;

  insert into public.audit_log (
    table_name, record_id, action,
    changed_cols, old_values, new_values,
    actor_emp_id, actor_email, actor_role, actor_context,
    reason
  ) values (
    TG_TABLE_NAME,
    rec_id,
    lower(TG_OP),
    changed,
    case when TG_OP = 'INSERT' then null else out_old end,
    case when TG_OP = 'DELETE' then null else out_new end,
    app.current_emp_id(),
    auth.email(),
    app.current_emp_role(),
    case
      when auth.role() is null then 'sql_editor'
      else auth.role()
    end,
    nullif(current_setting('app.audit_reason', true), '')
  );

  return null;
end;
$function$;

create or replace function public.record_profile_unlock()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if old.profile_finalized and not new.profile_finalized then
    insert into public.profile_unlock_audit (
      employee_id, employee_email,
      unlocked_by_id, unlocked_by_email, unlocked_by_role,
      reason
    ) values (
      old.id, old.email,
      app.current_emp_id(), auth.email(), coalesce(app.current_emp_role(), auth.role()),
      nullif(current_setting('app.unlock_reason', true), '')
    );
  end if;
  return new;
end;
$function$;

create or replace function public.stamp_client_error()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  recent integer;
begin
  new.emp_id := app.current_emp_id();
  new.email  := auth.email();
  new.role   := app.current_emp_role();

  new.occurred_at := now();

  select count(*) into recent
  from public.client_errors
  where emp_id is not distinct from new.emp_id
    and occurred_at > now() - interval '1 minute';

  if recent >= 20 then
    return null;
  end if;

  new.message   := left(coalesce(new.message, ''), 2000);
  new.stack     := left(new.stack, 8000);
  new.user_agent := left(new.user_agent, 512);
  new.route     := left(new.route, 64);
  new.component := left(new.component, 256);

  return new;
end;
$function$;
