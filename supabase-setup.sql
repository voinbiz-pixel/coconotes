-- coconotes: database setup
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Before running, put your two real emails at the very bottom.

create table if not exists public.team_members (email text primary key, added_at timestamptz not null default now());

create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where lower(email) = lower(auth.jwt() ->> 'email'));
$$;
grant execute on function public.is_team_member() to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null, name text not null default '', color text not null default '#2B4C7E', tz text,
  created_at timestamptz not null default now()
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(), name text not null, color text not null default '#4A545E', sort int not null default 0
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'task' check (type in ('task','call','request','reminder','content')),
  title text not null,
  brand_id uuid references public.brands on delete set null,
  done boolean not null default false,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  urgent boolean not null default false,
  nag boolean not null default false,
  nag_count int not null default 0,
  last_fired_at timestamptz,
  owner_ids uuid[] not null default '{}',
  due_date date,
  remind_at timestamptz,
  reminded boolean not null default false,
  contact_name text,
  phone text,
  notes text not null default '',
  links jsonb not null default '[]',
  stage text check (stage in ('idea','script','shoot','edit','review','ready','posted')),
  post_date date,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- A changed reminder time can fire again
create or replace function public.reset_reminded() returns trigger language plpgsql as $$
begin
  if new.remind_at is distinct from old.remind_at then new.reminded := false; new.nag_count := 0; end if;
  return new;
end $$;
drop trigger if exists items_reset_reminded on public.items;
create trigger items_reset_reminded before update on public.items for each row execute function public.reset_reminded();

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items on delete cascade,
  actor_id uuid references public.profiles on delete set null,
  to_id uuid references public.profiles on delete cascade,
  kind text not null, body text not null default '', read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint text primary key, profile_id uuid not null references public.profiles on delete cascade,
  p256dh text not null, auth text not null, created_at timestamptz not null default now()
);

create table if not exists public.calendar_tokens (
  profile_id uuid primary key references public.profiles on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table if not exists public.capture_tokens (
  profile_id uuid primary key references public.profiles on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  body text not null default '',
  brand_id uuid references public.brands on delete set null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_owner_idx on public.items using gin (owner_ids);
create index if not exists items_remind_idx on public.items (remind_at) where not reminded;
create index if not exists activity_to_idx on public.activity (to_id, read);
create index if not exists activity_item_idx on public.activity (item_id);

-- Security: only the two of you
alter table public.team_members enable row level security;
alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.items enable row level security;
alter table public.activity enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.calendar_tokens enable row level security;
alter table public.capture_tokens enable row level security;
alter table public.notes enable row level security;

create policy "team reads team list" on public.team_members for select using (public.is_team_member());
create policy "team reads profiles" on public.profiles for select using (public.is_team_member());
create policy "create own profile" on public.profiles for insert with check (id = auth.uid() and public.is_team_member());
create policy "edit own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "team manages brands" on public.brands for all using (public.is_team_member()) with check (public.is_team_member());
create policy "team manages items" on public.items for all using (public.is_team_member()) with check (public.is_team_member());
create policy "team reads activity" on public.activity for select using (public.is_team_member());
create policy "team writes own activity" on public.activity for insert with check (public.is_team_member() and actor_id = auth.uid());
create policy "mark own activity read" on public.activity for update using (to_id = auth.uid()) with check (to_id = auth.uid());
create policy "own push subscriptions" on public.push_subscriptions for all using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.is_team_member());
create policy "read own calendar link" on public.calendar_tokens for select using (profile_id = auth.uid());
create policy "create own calendar link" on public.calendar_tokens for insert with check (profile_id = auth.uid() and public.is_team_member());
create policy "reset own calendar link" on public.calendar_tokens for delete using (profile_id = auth.uid());
create policy "read own capture key" on public.capture_tokens for select using (profile_id = auth.uid());
create policy "create own capture key" on public.capture_tokens for insert with check (profile_id = auth.uid() and public.is_team_member());
create policy "reset own capture key" on public.capture_tokens for delete using (profile_id = auth.uid());
create policy "team manages notes" on public.notes for all using (public.is_team_member()) with check (public.is_team_member());

alter publication supabase_realtime add table public.items, public.activity, public.profiles, public.brands, public.notes;

insert into public.brands (name, color, sort) values
  ('LOX', '#0F5C63', 0), ('Greenwich & Delancey', '#7D6230', 1), ('Chef David', '#6B4A2F', 2), ('Madison and Park', '#2F5D3A', 3);

-- The two of you. Replace with real emails.
insert into public.team_members (email) values ('you@yourcompany.com'), ('masha@yourcompany.com') on conflict do nothing;
