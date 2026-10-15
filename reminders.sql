-- coconotes: timed reminders
-- Run AFTER supabase-setup.sql. Checks every minute for reminders that are due
-- and creates an activity row, which sends the phone notification.
-- If "pg_cron" errors, turn it on first: Database > Extensions > search pg_cron > enable. Then run this again.

create extension if not exists pg_cron;

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

select cron.schedule('coconotes-reminders', '* * * * *', 'select public.fire_reminders()');
