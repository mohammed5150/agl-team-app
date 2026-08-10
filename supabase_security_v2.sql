-- ===============================================================
-- 16. Security review follow-ups
--     (apply AFTER supabase_monitoring.sql)
--
-- Two findings from the security/production review that did not belong with
-- the audit, validation or monitoring work.
--
-- Idempotent: safe to re-run.
-- ===============================================================

-- ---------------------------------------------------------------
-- a. Notifications could be addressed to anyone
--
-- supabase_rls_hardening.sql narrowed the INSERT policy from "any
-- authenticated session" to "any real employee", which closed the
-- non-employee auto-signup hole. But an ordinary employee could still write
-- a notification addressed to a COLLEAGUE, with any text they liked.
--
-- That is an in-app phishing channel with the portal's own credibility behind
-- it: "Your leave for 12-16 Aug was rejected — contact HR on <number>" arrives
-- looking exactly like every genuine notification, because it IS a genuine
-- notification row. The portal also surfaces notifications as browser and web
-- push alerts, so it reaches the phone.
--
-- What the app legitimately needs an employee to do is notify an APPROVER:
-- submitLeave and submitOvertime address team leads and managers. Nothing in
-- the app has an employee notifying another employee — every such
-- notification (approval, rejection, announcement) is written by staff acting
-- on the request. So the rule is:
--
--   employee  -> may notify staff (teamlead/manager), or themselves
--   staff     -> may notify anyone
--
-- A tighter design would route every create through a SECURITY DEFINER RPC
-- that derives the recipient from the request being acted on, which
-- supabase_rls_policies.sql already notes as the eventual fix. This is the
-- part of it that can be done without restructuring the client.
-- ---------------------------------------------------------------

create or replace function public.can_notify(target_emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Must be a real employee at all.
    public.current_emp_id() is not null
    and (
      -- Staff may notify anyone.
      public.is_staff()
      -- Anyone may notify themselves (the app seeds a few this way).
      or target_emp_id = public.current_emp_id()
      -- An employee may notify an approver.
      or exists (
        select 1 from public.employees e
        where e.id = target_emp_id
          and e.role in ('teamlead', 'manager')
      )
    );
$$;

-- The RLS policy calls this, so `authenticated` needs EXECUTE. Unlike the
-- trigger functions it is safe to expose: it takes one id and returns one
-- boolean about the CALLER's own rights, so it cannot be used to enumerate
-- anything the caller could not already read from the employees directory.
revoke all on function public.can_notify(text) from public, anon;
grant execute on function public.can_notify(text) to authenticated;

drop policy if exists nf_insert_authenticated on public.notifications;
drop policy if exists nf_insert_employee on public.notifications;
create policy nf_insert_employee
  on public.notifications for insert
  to authenticated
  with check (public.can_notify(to_user));

-- A notification is a record of something that happened; letting the sender
-- edit it afterwards would make it unreliable. Recipients still need UPDATE
-- to mark one read, so scope the policy to that rather than dropping it:
-- nf_update_own already restricts WHO, this restricts WHAT.
create or replace function public.guard_notification_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;
  if (new.to_user is distinct from old.to_user
      or new.type    is distinct from old.type
      or new.message is distinct from old.message
      or new.date    is distinct from old.date) then
    raise exception 'A notification''s content cannot be changed after it is sent'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_notification_immutable on public.notifications;
create trigger trg_guard_notification_immutable
  before update on public.notifications
  for each row execute function public.guard_notification_immutable();

revoke all on function public.guard_notification_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- b. Deleting an employee destroyed the record along with the access
--
-- emp_delete_manager lets a manager DELETE an employees row. That is the only
-- offboarding mechanism the portal has, and it is the wrong one: it removes
-- the person's leave history, ratings and warnings from every view that joins
-- on them, cascades their push subscriptions away, and leaves the audit trail
-- pointing at an id that no longer resolves to a name. For an employment
-- record with a retention obligation, that is data loss dressed up as a
-- feature.
--
-- This adds the column an offboarding workflow needs, and the guard that
-- makes deactivation meaningful. The UI for it is not built here — what IS
-- built is that the record survives, and that a deactivated account cannot
-- act. Leaving the DELETE policy in place would let a manager route around
-- all of it, so it goes.
-- ---------------------------------------------------------------

alter table public.employees
  add column if not exists employment_status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_employment_status_check'
  ) then
    alter table public.employees
      add constraint employees_employment_status_check
      check (employment_status in ('active', 'suspended', 'offboarded'))
      not valid;
  end if;
end $$;

alter table public.employees validate constraint employees_employment_status_check;

alter table public.employees
  add column if not exists offboarded_at timestamptz;

comment on column public.employees.employment_status is
  'active | suspended | offboarded. Offboarding deactivates rather than '
  'deleting, so leave history, ratings and the audit trail stay resolvable.';

create index if not exists employees_employment_status_idx
  on public.employees (employment_status)
  where employment_status <> 'active';

-- Only a manager may change it, and the timestamp is set by the database so
-- it records when it actually happened rather than what a client claimed.
create or replace function public.guard_employment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;

  if new.employment_status is distinct from old.employment_status then
    if not public.is_manager() then
      raise exception 'Only a manager may change employment status'
        using errcode = 'insufficient_privilege';
    end if;
    if new.employment_status = 'offboarded' then
      new.offboarded_at := now();
    elsif old.employment_status = 'offboarded' then
      new.offboarded_at := null;
    end if;
  else
    -- The timestamp is derived, never client-set.
    new.offboarded_at := old.offboarded_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_employment_status on public.employees;
create trigger trg_guard_employment_status
  before update on public.employees
  for each row execute function public.guard_employment_status();

revoke all on function public.guard_employment_status() from public, anon, authenticated;

-- Changing the status and recording WHY must be one transaction.
-- set_config(..., true) is transaction-local and PostgREST runs every request
-- in its own transaction, so a client doing "set the reason" then "do the
-- update" as two calls loses the reason before the audit trigger can read it
-- — and a status change with no reason is a change log, not an audit trail.
create or replace function public.set_employment_status(
  p_emp_id text,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Only a manager may change employment status'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('active', 'suspended', 'offboarded') then
    raise exception 'Unknown employment status: %', p_status
      using errcode = 'check_violation';
  end if;
  -- A manager must not be able to offboard themselves: it would lock them out
  -- of the account that is meant to be able to undo it.
  if p_emp_id = public.current_emp_id() then
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
$$;

-- Callable by end users on purpose — it is the supported path, and it checks
-- is_manager() itself rather than trusting the caller.
revoke all on function public.set_employment_status(text, text, text) from public, anon;
grant execute on function public.set_employment_status(text, text, text) to authenticated;

-- An offboarded person keeps their record but loses the ability to act. This
-- is checked in the policies below rather than only in the app, so a stale
-- session or a direct API call is refused too.
create or replace function public.is_active_employee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employees
    where lower(email) = lower(auth.jwt() ->> 'email')
      and employment_status = 'active'
  );
$$;

revoke all on function public.is_active_employee() from public, anon;
grant execute on function public.is_active_employee() to authenticated;

-- New requests require an active account. Existing rows stay readable, so an
-- offboarded person's history is still visible to staff and the audit trail
-- still resolves.
drop policy if exists lr_insert_self on public.leave_requests;
create policy lr_insert_self
  on public.leave_requests for insert
  to authenticated
  with check (
    emp_id = public.current_emp_id()
    and status = 'pending'
    and public.is_active_employee()
  );

do $$
begin
  if to_regclass('public.overtime_requests') is null then
    return;
  end if;
  execute 'drop policy if exists ot_insert_self on public.overtime_requests';
  execute 'create policy ot_insert_self on public.overtime_requests for insert
             to authenticated
             with check (emp_id = public.current_emp_id()
                         and status = ''pending''
                         and public.is_active_employee())';
end $$;

-- Remove the hard delete. Offboarding is a status change; a genuine erasure
-- request (a right-to-be-forgotten claim, say) is a deliberate act for the
-- service role in the SQL editor, where it is visible and considered, not a
-- button a tired manager can press at the end of a shift.
drop policy if exists emp_delete_manager on public.employees;

comment on table public.employees is
  'No DELETE policy by design: offboarding sets employment_status, so leave '
  'history, ratings and audit entries stay resolvable. Erasure is a '
  'service_role operation, not an end-user one.';
