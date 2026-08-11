-- ============================================================================
-- FIX: team leads could not approve or reject ANY overtime request
--
-- SYMPTOM
-- A team lead opens the Overtime page, taps Approve, and the row flips to
-- "approved ✅" — then a red banner appears reading "Couldn't save overtime
-- changes — your last change may not be saved. Check your connection." The
-- connection is fine. On the next refresh the request is pending again, but
-- the requester has already been sent an "Overtime approved" notification and
-- a push, because those fire from local state before the write is attempted.
--
-- CAUSE
-- supabase_rls_hardening.sql defines guard_request_immutable() to freeze the
-- substance of a request once it has been submitted. It was written for
-- leave_requests and names that table's columns directly:
--
--     if (new.emp_id     is distinct from old.emp_id
--         or new.start_date is distinct from old.start_date
--         or new.end_date   is distinct from old.end_date
--         or new.days       is distinct from old.days
--         or new.type       is distinct from old.type
--         or new.reason     is distinct from old.reason) then
--
-- supabase_overtime_bands.sql then reuses that same function on
-- overtime_requests — "Freeze request content after submission (same guard as
-- leave)". But overtime_requests has no start_date, end_date, days or type; it
-- has work_date and hours. In PL/pgSQL those field references are resolved at
-- runtime against the actual record, so the trigger raises
--
--     ERROR 42703: record "new" has no field "start_date"
--
-- The function has an early return for "the requester editing their own still
-- pending row", which is why submitting and withdrawing overtime always
-- worked, and why this went unnoticed: the only path that reaches the frozen
-- -column check on overtime_requests is somebody OTHER than the requester
-- updating the row, and on that table that is exactly — and only — the team
-- lead approving or rejecting it. The one code path that reaches the bug is
-- the entire approval stage.
--
-- Leave was never affected: leave_requests really does have those columns.
--
-- FIX
-- Make the guard table-aware. The frozen set is chosen from TG_TABLE_NAME and
-- compared through to_jsonb, so a column that does not exist on the table
-- being updated is simply not consulted instead of raising. A table this
-- trigger is attached to in future without being listed here falls back to
-- freezing emp_id only, which fails safe rather than erroring.
-- ============================================================================

create or replace function public.guard_request_immutable()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  frozen text[];
  o      jsonb;
  n      jsonb;
  col    text;
begin
  if coalesce(auth.role(), 'service_role') <> 'authenticated' then
    return new;
  end if;

  -- The requester editing their own still-pending row is allowed. Unchanged
  -- from the original: emp_id and status exist on both tables.
  if old.emp_id = public.current_emp_id() and old.status = 'pending' then
    return new;
  end if;

  frozen := case tg_table_name
              when 'leave_requests'    then array['emp_id','start_date','end_date','days','type','reason']
              -- Overtime's substance is who, which day, how many hours and why.
              -- status, tl_comment, tl_action_date and tl_name are exactly what
              -- the approving team lead is supposed to be writing, so they are
              -- deliberately not frozen.
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
$$;

-- Matches supabase_rls_hardening.sql: this is a trigger function, not an API.
revoke all on function public.guard_request_immutable() from anon, authenticated;

-- VERIFY ---------------------------------------------------------------------
--   begin;
--     select set_config('request.jwt.claims',
--       json_build_object('role','authenticated','email','<a team lead>')::text, true);
--     set local role authenticated;
--     -- expect: UPDATE 1, not "record \"new\" has no field \"start_date\""
--     update public.overtime_requests
--        set status='approved', tl_comment='Approved', tl_action_date=now(), tl_name='TL'
--      where status='pending';
--   rollback;
