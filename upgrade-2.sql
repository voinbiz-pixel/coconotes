-- coconotes upgrade: status (not started, in progress, done) and keep-reminding.
-- Only needed if you already ran supabase-setup.sql before this update. Paste into SQL Editor and click Run.

alter table public.items add column if not exists status text not null default 'todo';
alter table public.items add column if not exists nag boolean not null default false;
alter table public.items add column if not exists nag_count int not null default 0;
alter table public.items add column if not exists last_fired_at timestamptz;
update public.items set status = 'done' where done and status <> 'done';
do $$ begin
  alter table public.items add constraint items_status_check check (status in ('todo','doing','done'));
exception when duplicate_object then null; end $$;

create or replace function public.reset_reminded() returns trigger language plpgsql as $$
begin
  if new.remind_at is distinct from old.remind_at then new.reminded := false; new.nag_count := 0; end if;
  return new;
end $$;

create or replace function public.fire_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare r record; o uuid;
begin
  for r in
    select * from public.items
    where remind_at is not null and remind_at <= now() and type <> 'content' and not done
      and (not reminded or (nag and nag_count < 6 and last_fired_at <= now() - interval '30 minutes'))
    for update skip locked
  loop
    foreach o in array r.owner_ids loop
      insert into public.activity (item_id, actor_id, to_id, kind, body) values (r.id, null, o, 'reminder', case when r.reminded then 'Still not done' else '' end);
    end loop;
    update public.items set reminded = true, last_fired_at = now(), nag_count = case when r.reminded then nag_count + 1 else 0 end where id = r.id;
  end loop;
end $$;
revoke execute on function public.fire_reminders() from public, anon, authenticated;
