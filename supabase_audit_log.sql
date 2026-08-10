-- ===============================================================
-- 13. Audit trail — who approved or changed what
--     (apply AFTER supabase_grant_hardening.sql)
--
-- WHY
-- The portal decides people's leave, overtime, ratings, warnings, pay band
-- and role, and until now it recorded almost none of it. The only audit
-- mechanism in the schema was profile_unlock_audit, scoped to a single
-- operation. Everything else — a manager changing someone's role, a team
-- lead approving overtime, a leave balance being adjusted — left no trace
-- beyond the current value of the row. There was no way to answer "who
-- approved this?" or "when did this become T3?" after the fact.
--
-- DESIGN
--   * One table, public.audit_log, append-only in practice: no role holds
--     INSERT, UPDATE or DELETE on it. The SECURITY DEFINER triggers below
--     are the only writers, so a record cannot be skipped or forged from
--     the API — the same shape that makes profile_unlock_audit trustworthy.
--   * The actor is resolved server-side from the JWT (current_emp_id /
--     auth.email), never taken from the client. A client that lies about
--     who it is still gets logged as who it actually is.
--   * Only CHANGED columns are stored, as two jsonb objects. Storing whole
--     rows would balloon the table (employees carries roster and training
--     blobs) and bury the one field that moved.
--   * Sensitive columns are redacted rather than dropped, so the record
--     still shows THAT a field changed without copying its contents into a
--     second table. See SENSITIVE_COLS below.
--   * Statement-level context (the request id) is not available in
--     Postgres, so correlated changes are grouped by transaction id
--     instead: every row written by one save shares a txid.
--
-- RETENTION
-- Unbounded here on purpose — see docs/BACKUP_RESTORE.md for the pruning
-- job. A UAE labour-record retention of two years is the working assumption;
-- prune_audit_log(interval) is provided but is NOT scheduled by this file.
--
-- Idempotent: safe to re-run.
-- ===============================================================

-- ---------------------------------------------------------------
-- a. The table
-- ---------------------------------------------------------------

create table if not exists public.audit_log (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  txid          bigint      not null default txid_current(),

  -- What happened
  table_name    text        not null,
  record_id     text,
  action        text        not null check (action in ('insert', 'update', 'delete')),

  -- What moved. Only changed columns; null on insert/delete respectively.
  changed_cols  text[],
  old_values    jsonb,
  new_values    jsonb,

  -- Who did it, resolved from the session rather than supplied by the client
  actor_emp_id  text,
  actor_email   text,
  actor_role    text,
  -- 'authenticated' for an end user, 'service_role' for the backend, and
  -- 'sql_editor' when auth.role() is null (a migration or manual fix).
  actor_context text,

  -- Optional free text, set for one transaction by the caller:
  --   select set_config('app.audit_reason', 'Backdated per HR ticket 412', true);
  reason        text
);

comment on table public.audit_log is
  'Append-only record of every change to employees, leave_requests, '
  'overtime_requests and announcements. Written only by the audit triggers; '
  'no role holds INSERT/UPDATE/DELETE. Managers may read it.';

create index if not exists audit_log_occurred_idx
  on public.audit_log (occurred_at desc);
create index if not exists audit_log_record_idx
  on public.audit_log (table_name, record_id, occurred_at desc);
create index if not exists audit_log_actor_idx
  on public.audit_log (actor_emp_id, occurred_at desc);
-- Supports "show me every approval" without scanning: changed_cols is a
-- small array, and status is what the approvals view filters on.
create index if not exists audit_log_changed_cols_idx
  on public.audit_log using gin (changed_cols);

-- ---------------------------------------------------------------
-- b. Access — managers read, nobody writes
-- ---------------------------------------------------------------

alter table public.audit_log enable row level security;

revoke all on public.audit_log from public, anon, authenticated;

drop policy if exists audit_select_manager on public.audit_log;
create policy audit_select_manager
  on public.audit_log for select
  to authenticated
  using (public.is_manager());

-- SELECT only. No insert/update/delete grant exists for any end-user role,
-- so the triggers are the sole writers and the log cannot be rewritten by
-- whoever it happens to incriminate.
grant select on public.audit_log to authenticated;

-- The sequence must not be grantable either, or a client could exhaust it.
revoke all on sequence public.audit_log_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------
-- c. The trigger function
--
-- One generic function drives every table. It reads TG_TABLE_NAME and the
-- primary-key column name from TG_ARGV[0], so adding a table is one CREATE
-- TRIGGER rather than another copy of this logic.
-- ---------------------------------------------------------------

create or replace function public.record_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pk_col     text := coalesce(TG_ARGV[0], 'id');
  -- Columns whose VALUE must not be copied into a second table. The fact of
  -- the change is still recorded (the name appears in changed_cols); only
  -- the before/after contents are replaced with a marker.
  --
  -- These are the identity-document and contact fields. They are already in
  -- employees under RLS; duplicating them into audit_log would widen the
  -- blast radius of any future mistake on this table for no investigative
  -- benefit, since "passport_no changed" is the auditable event.
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

  -- Which columns actually moved. On insert/delete that is every column
  -- present; on update it is the genuine diff, so a no-op save (the app
  -- debounces and can re-send an unchanged row) writes nothing at all.
  for k in
    select jsonb_object_keys(old_j || new_j)
  loop
    if (old_j -> k) is distinct from (new_j -> k) then
      changed := changed || k;
      if k = any (sensitive) then
        -- Record that it changed, never what it changed to.
        if old_j ? k then out_old := out_old || jsonb_build_object(k, '[redacted]'); end if;
        if new_j ? k then out_new := out_new || jsonb_build_object(k, '[redacted]'); end if;
      else
        if old_j ? k then out_old := out_old || jsonb_build_object(k, old_j -> k); end if;
        if new_j ? k then out_new := out_new || jsonb_build_object(k, new_j -> k); end if;
      end if;
    end if;
  end loop;

  if TG_OP = 'UPDATE' and cardinality(changed) = 0 then
    return null;  -- AFTER trigger: return value is ignored, this just skips the insert
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
    public.current_emp_id(),
    auth.email(),
    public.current_emp_role(),
    case
      when auth.role() is null then 'sql_editor'
      else auth.role()
    end,
    nullif(current_setting('app.audit_reason', true), '')
  );

  return null;  -- AFTER trigger
end;
$$;

-- Trigger functions must not be reachable over the REST RPC surface.
-- Postgres grants EXECUTE to PUBLIC by default, and revoking only
-- anon/authenticated leaves that grant in place — the mistake corrected in
-- supabase_grant_hardening.sql. Name PUBLIC explicitly.
revoke all on function public.record_audit() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- d. Attach to the tables that carry decisions
--
-- AFTER, so only changes that survived every BEFORE guard are recorded —
-- a refused attempt must not leave a row implying it succeeded, the same
-- reasoning as trg_record_profile_unlock.
-- ---------------------------------------------------------------

drop trigger if exists trg_audit_employees on public.employees;
create trigger trg_audit_employees
  after insert or update or delete on public.employees
  for each row execute function public.record_audit('id');

drop trigger if exists trg_audit_leave_requests on public.leave_requests;
create trigger trg_audit_leave_requests
  after insert or update or delete on public.leave_requests
  for each row execute function public.record_audit('id');

drop trigger if exists trg_audit_announcements on public.announcements;
create trigger trg_audit_announcements
  after insert or update or delete on public.announcements
  for each row execute function public.record_audit('id');

-- Overtime is optional in some deployments (supabase_overtime.sql is not
-- applied everywhere), so guard on the table existing.
do $$
begin
  if to_regclass('public.overtime_requests') is not null then
    execute 'drop trigger if exists trg_audit_overtime_requests on public.overtime_requests';
    execute 'create trigger trg_audit_overtime_requests
               after insert or update or delete on public.overtime_requests
               for each row execute function public.record_audit(''id'')';
  end if;
end $$;

-- Notifications are deliberately NOT audited. They are derived from the
-- events already recorded here, they are by far the highest-volume table,
-- and auditing them would drown the approvals in machine chatter.

-- ---------------------------------------------------------------
-- e. Reading it back
--
-- A view for the question the log exists to answer: who decided what.
-- Managers only, inheriting audit_log's RLS through security_invoker.
-- ---------------------------------------------------------------

create or replace view public.audit_approvals
with (security_invoker = true)
as
select
  a.id,
  a.occurred_at,
  a.table_name,
  a.record_id,
  a.old_values ->> 'status' as from_status,
  a.new_values ->> 'status' as to_status,
  coalesce(a.new_values ->> 'mgr_comment', a.new_values ->> 'tl_comment') as comment,
  a.actor_emp_id,
  a.actor_email,
  a.actor_role,
  a.reason
from public.audit_log a
where a.table_name in ('leave_requests', 'overtime_requests')
  and 'status' = any (a.changed_cols)
order by a.occurred_at desc;

comment on view public.audit_approvals is
  'Every leave/overtime status transition with the person who made it. '
  'security_invoker, so audit_log RLS (managers only) still applies.';

revoke all on public.audit_approvals from public, anon;
grant select on public.audit_approvals to authenticated;

-- A second view for the privileged-field changes a manager is asked about
-- most: role, tier, band, and leave balances.
create or replace view public.audit_privileged_changes
with (security_invoker = true)
as
select
  a.id,
  a.occurred_at,
  a.record_id as employee_id,
  a.changed_cols,
  a.old_values,
  a.new_values,
  a.actor_emp_id,
  a.actor_email,
  a.actor_role,
  a.reason
from public.audit_log a
where a.table_name = 'employees'
  and a.changed_cols && array[
    'role', 'tier', 'band', 'airport', 'supplier',
    'annual_leave', 'used_annual', 'sick_leave', 'used_sick', 'comp_off',
    'rating', 'warnings', 'profile_finalized', 'status'
  ]
order by a.occurred_at desc;

comment on view public.audit_privileged_changes is
  'Changes to role, grading, leave balances, ratings and warnings, with the '
  'actor. security_invoker, so audit_log RLS (managers only) still applies.';

revoke all on public.audit_privileged_changes from public, anon;
grant select on public.audit_privileged_changes to authenticated;

-- ---------------------------------------------------------------
-- f. Retention
--
-- Provided, not scheduled. Deleting audit history is a decision with a
-- compliance dimension, so it must be an explicit act by the owner rather
-- than something a migration quietly starts doing. To run it monthly, use
-- pg_cron:
--   select cron.schedule('prune-audit', '0 3 1 * *',
--                        $$select public.prune_audit_log(interval '2 years')$$);
-- ---------------------------------------------------------------

create or replace function public.prune_audit_log(older_than interval)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  -- Refuse to run as an end user, whatever their role. Pruning is a
  -- maintenance operation for the service role or the SQL editor; a manager
  -- must not be able to trim the log that records what they did.
  if coalesce(auth.role(), 'service_role') = 'authenticated' then
    raise exception 'prune_audit_log may only be run by the backend';
  end if;

  delete from public.audit_log
  where occurred_at < now() - older_than;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_audit_log(interval) from public, anon, authenticated;
