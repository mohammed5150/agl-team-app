-- ADB-AGL Portal — Capability tier (T1/T2/T3/T4) on employees.
-- Distinct from the legacy salary tier (rating.tier, A/B/C) which stays as-is.
-- Run AFTER supabase_rls_policies.sql so the helper functions exist.

alter table employees
  add column if not exists tier text;

alter table employees
  drop constraint if exists employees_tier_check;
alter table employees
  add constraint employees_tier_check
  check (tier is null or tier in ('T1','T2','T3','T4'));

-- Field-level guard: only managers may change `tier`.
-- (RLS is row-level only; this trigger gives column-level enforcement.)
create or replace function public.employees_protect_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tier is distinct from old.tier and not public.is_manager() then
    raise exception 'Only managers may modify employee tier';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_protect_tier_trg on employees;
create trigger employees_protect_tier_trg
  before update on employees
  for each row execute function public.employees_protect_tier();

-- Same protection on INSERT: a non-manager creating a row with a tier set is
-- already blocked by the RLS insert policy (manager-only), but if that ever
-- changes we still want the column locked down.
create or replace function public.employees_protect_tier_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tier is not null and not public.is_manager() then
    raise exception 'Only managers may set employee tier';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_protect_tier_ins_trg on employees;
create trigger employees_protect_tier_ins_trg
  before insert on employees
  for each row execute function public.employees_protect_tier_insert();
