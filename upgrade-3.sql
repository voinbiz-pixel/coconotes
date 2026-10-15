-- coconotes upgrade: Lock Screen quick capture.
-- Run once in SQL Editor (needed whether you set up before or after this update, unless supabase-setup.sql already has capture_tokens).

alter table public.profiles add column if not exists tz text;

create table if not exists public.capture_tokens (
  profile_id uuid primary key references public.profiles on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table public.capture_tokens enable row level security;
drop policy if exists "read own capture key" on public.capture_tokens;
drop policy if exists "create own capture key" on public.capture_tokens;
drop policy if exists "reset own capture key" on public.capture_tokens;
create policy "read own capture key" on public.capture_tokens for select using (profile_id = auth.uid());
create policy "create own capture key" on public.capture_tokens for insert with check (profile_id = auth.uid() and public.is_team_member());
create policy "reset own capture key" on public.capture_tokens for delete using (profile_id = auth.uid());
