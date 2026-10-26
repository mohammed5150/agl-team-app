-- Team Studio: shared wiki-style pages (SOP notes, shift handover notes,
-- procedures). A small ordered list of blocks — heading / text / checklist —
-- rather than a full rich-text document; enough structure for airfield notes
-- without a WYSIWYG editor or a markup language to sanitize.
--
-- RLS mirrors announcements exactly (see supabase_rls_policies.sql): every
-- authenticated user reads, team lead or manager ("staff") writes, manager
-- deletes. No ordering requirement on other migrations — depends only on
-- public.is_staff() / public.is_manager(), created in supabase_rls_policies.sql.

create table if not exists studio_pages (
  id           text primary key,
  title        text not null,
  blocks       jsonb not null default '[]'::jsonb,
  pinned       boolean default false,
  author_id    text,
  author_name  text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table studio_pages enable row level security;

drop policy if exists stu_select_all   on studio_pages;
drop policy if exists stu_insert_staff on studio_pages;
drop policy if exists stu_update_staff on studio_pages;
drop policy if exists stu_delete_mgr   on studio_pages;

create policy stu_select_all
  on studio_pages for select
  to authenticated
  using (true);

create policy stu_insert_staff
  on studio_pages for insert
  to authenticated
  with check (public.is_staff());

create policy stu_update_staff
  on studio_pages for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy stu_delete_mgr
  on studio_pages for delete
  to authenticated
  using (public.is_manager());

alter publication supabase_realtime add table studio_pages;
