-- coconotes upgrade 4: Notes, and the duo model (every reminder belongs to both of you).
-- Run once in Supabase > SQL Editor. Safe to run again.

-- 1. Notes: ideas and requests, in brand folders, shared by the two of you
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  body text not null default '',
  brand_id uuid references public.brands on delete set null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_updated_idx on public.notes (updated_at desc);
alter table public.notes enable row level security;
drop policy if exists "team manages notes" on public.notes;
create policy "team manages notes" on public.notes for all using (public.is_team_member()) with check (public.is_team_member());
do $$ begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null; end $$;

-- 2. Duo: put every existing reminder on both of you, so you both get its reminders
update public.items set owner_ids = (select array_agg(id) from public.profiles)
where cardinality(owner_ids) < (select count(*) from public.profiles);
