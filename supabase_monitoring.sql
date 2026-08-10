-- ===============================================================
-- 15. Monitoring — front-end error reporting
--     (apply AFTER supabase_validation.sql)
--
-- WHY
-- When the portal broke for someone, nobody found out. The ErrorBoundary
-- showed a friendly message and console.error went to a phone nobody reads.
-- An operations team on shift is not going to file a bug report; they will
-- work around it, and the workaround becomes the process. This is the
-- smallest thing that turns "the portal is being weird" into a record with a
-- stack trace and a count.
--
-- WHY NOT SENTRY
-- A third-party error service would be better at this, and if one is adopted
-- this table should go. It is not adopted here because the CSP is
-- `connect-src 'self' https://*.supabase.co` — adding an external origin
-- widens the policy that stops an injected script exfiltrating anything, and
-- error payloads from an HR portal carry employee identifiers. Reporting into
-- the database the app already talks to costs no new egress path.
--
-- SHAPE
--   * Any authenticated session may INSERT — a report is only useful if it can
--     be filed from a session that is already misbehaving.
--   * Nobody may UPDATE or DELETE. Managers may SELECT.
--   * The reporter is recorded server-side by a trigger, from the JWT, and the
--     client's own idea of who it is is overwritten. A broken client must not
--     be able to misattribute its errors.
--   * A per-session rate limit stops a render loop writing a million rows.
--
-- Idempotent: safe to re-run.
-- ===============================================================

create table if not exists public.client_errors (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),

  -- What broke
  kind          text not null check (kind in ('error', 'unhandled_rejection', 'render', 'sync')),
  message       text not null,
  stack         text,
  component     text,
  -- Route the user was on. The app's own hash key ('leave', 'approvals'),
  -- never a full URL — those carry employee ids in the hash.
  route         text,

  -- Where from
  user_agent    text,
  app_version   text,

  -- Who. Set by the trigger from the session, not by the client.
  emp_id        text,
  email         text,
  role          text,

  -- Grouping. A stable hash of kind+message+top stack frame, so repeats of
  -- one fault collapse into a count instead of a wall.
  fingerprint   text
);

comment on table public.client_errors is
  'Front-end error reports. Insert-only for users; managers may read. The '
  'reporter is stamped by trg_stamp_client_error from the JWT, never by the '
  'client.';

create index if not exists client_errors_occurred_idx
  on public.client_errors (occurred_at desc);
create index if not exists client_errors_fingerprint_idx
  on public.client_errors (fingerprint, occurred_at desc);

-- ---------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------

alter table public.client_errors enable row level security;

revoke all on public.client_errors from public, anon, authenticated;

-- INSERT for any real employee. Not `anon`: an unauthenticated writer would
-- make this an open write endpoint on a public URL.
drop policy if exists ce_insert_employee on public.client_errors;
create policy ce_insert_employee
  on public.client_errors for insert
  to authenticated
  with check (public.current_emp_id() is not null);

drop policy if exists ce_select_manager on public.client_errors;
create policy ce_select_manager
  on public.client_errors for select
  to authenticated
  using (public.is_manager());

-- No UPDATE or DELETE policy, and no grant: a report cannot be altered or
-- removed through the API once filed.
grant insert, select on public.client_errors to authenticated;
grant usage on sequence public.client_errors_id_seq to authenticated;

-- ---------------------------------------------------------------
-- Stamp the reporter, and cap the volume
--
-- BEFORE INSERT, so the values the client sent for emp_id/email/role are
-- replaced rather than trusted. A client that is misbehaving badly enough to
-- report an error is not a client whose account claims should be believed.
-- ---------------------------------------------------------------

create or replace function public.stamp_client_error()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
begin
  new.emp_id := public.current_emp_id();
  new.email  := auth.email();
  new.role   := public.current_emp_role();

  -- Never accept a client-supplied timestamp: a wrong clock would scatter the
  -- report across the timeline and make the count meaningless.
  new.occurred_at := now();

  -- Rate limit. A React render loop can file thousands of identical reports a
  -- minute; the first few are the diagnosis and the rest are just cost.
  -- Silently dropped rather than raised: an error reporter that throws inside
  -- an error handler is a fault multiplier.
  select count(*) into recent
  from public.client_errors
  where emp_id is not distinct from new.emp_id
    and occurred_at > now() - interval '1 minute';

  if recent >= 20 then
    return null;  -- BEFORE trigger returning null skips the insert
  end if;

  -- Bound the free-text columns. A stack trace from a minified bundle can be
  -- enormous, and the top frames are the ones that identify the fault.
  new.message   := left(coalesce(new.message, ''), 2000);
  new.stack     := left(new.stack, 8000);
  new.user_agent := left(new.user_agent, 512);
  new.route     := left(new.route, 64);
  new.component := left(new.component, 256);

  return new;
end;
$$;

drop trigger if exists trg_stamp_client_error on public.client_errors;
create trigger trg_stamp_client_error
  before insert on public.client_errors
  for each row execute function public.stamp_client_error();

-- Postgres grants EXECUTE to PUBLIC by default; naming PUBLIC is what makes
-- the revoke real (see supabase_grant_hardening.sql).
revoke all on function public.stamp_client_error() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Grouped view — what is actually broken, rather than every instance
-- ---------------------------------------------------------------

create or replace view public.client_error_summary
with (security_invoker = true)
as
select
  fingerprint,
  min(occurred_at)          as first_seen,
  max(occurred_at)          as last_seen,
  count(*)                  as occurrences,
  count(distinct emp_id)    as affected_users,
  (array_agg(kind      order by occurred_at desc))[1] as kind,
  (array_agg(message   order by occurred_at desc))[1] as message,
  (array_agg(route     order by occurred_at desc))[1] as route,
  (array_agg(component order by occurred_at desc))[1] as component
from public.client_errors
group by fingerprint
order by max(occurred_at) desc;

comment on view public.client_error_summary is
  'One row per distinct fault with a count and how many people hit it. '
  'security_invoker, so client_errors RLS (managers only) still applies.';

revoke all on public.client_error_summary from public, anon;
grant select on public.client_error_summary to authenticated;

-- ---------------------------------------------------------------
-- Retention
--
-- Errors are operational telemetry, not a record anyone is required to keep,
-- so unlike audit_log this one is safe to prune aggressively. Still not
-- scheduled here — see docs/MONITORING.md.
--   select cron.schedule('prune-client-errors', '30 3 * * *',
--                        $$select public.prune_client_errors(interval '90 days')$$);
-- ---------------------------------------------------------------

create or replace function public.prune_client_errors(older_than interval)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  if coalesce(auth.role(), 'service_role') = 'authenticated' then
    raise exception 'prune_client_errors may only be run by the backend';
  end if;
  delete from public.client_errors where occurred_at < now() - older_than;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_client_errors(interval) from public, anon, authenticated;
