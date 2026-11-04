-- coconotes upgrade 5: Daily checklist.
-- Each person keeps their own routine, checked off fresh every day. Adds two tables; changes nothing that exists.

create table if not exists public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  title text not null,
  sort int not null default 0,
  only_on date,                -- set for a step added just for one day
  created_at timestamptz not null default now()
);
create index if not exists routine_steps_owner_idx on public.routine_steps (owner_id, sort);

create table if not exists public.routine_days (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.routine_steps on delete cascade,
  owner_id uuid not null references public.profiles on delete cascade,
  day date not null,
  state text not null check (state in ('done', 'skipped')),
  at timestamptz not null default now(),
  unique (step_id, day)
);
create index if not exists routine_days_day_idx on public.routine_days (day);

alter table public.routine_steps enable row level security;
alter table public.routine_days enable row level security;

-- both of you can see each other's progress; each of you can only change your own
drop policy if exists "team sees routines" on public.routine_steps;
create policy "team sees routines" on public.routine_steps for select using (public.is_team_member());
drop policy if exists "own routine" on public.routine_steps;
create policy "own routine" on public.routine_steps for all using (owner_id = auth.uid() and public.is_team_member()) with check (owner_id = auth.uid() and public.is_team_member());

drop policy if exists "team sees days" on public.routine_days;
create policy "team sees days" on public.routine_days for select using (public.is_team_member());
drop policy if exists "own days" on public.routine_days;
create policy "own days" on public.routine_days for all using (owner_id = auth.uid() and public.is_team_member()) with check (owner_id = auth.uid() and public.is_team_member());

do $$ begin alter publication supabase_realtime add table public.routine_steps; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.routine_days; exception when duplicate_object then null; end $$;
