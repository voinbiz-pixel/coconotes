// coconotes: sends a phone notification for reminders, requests, handoffs, and messages.
// Triggered by a Supabase Database Webhook on INSERT into public.activity.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:coconotes@example.com", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

Deno.serve(async (req) => {
  const a = (await req.json().catch(() => null))?.record;
  if (!a?.to_id || (a.actor_id && a.to_id === a.actor_id)) return new Response("skipped");

  const [actor, item, subs] = await Promise.all([
    a.actor_id ? sb.from("profiles").select("name,email").eq("id", a.actor_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("items").select("title,type,contact_name,phone").eq("id", a.item_id).maybeSingle(),
    sb.from("push_subscriptions").select("endpoint,p256dh,auth").eq("profile_id", a.to_id),
  ]);
  const who = (actor.data?.name || actor.data?.email || "Your teammate").split(/[\s@]/)[0];
  const it = item.data ?? { title: "something", type: "task", contact_name: null, phone: null };
  let title: string, body: string;
  if (a.kind === "reminder") {
    title = a.body === "Still not done" ? "Still not done" : it.type === "call" ? `Time to call ${it.contact_name || ""}`.trim() : "Reminder";
    body = it.type === "call" && it.phone ? `${it.title}, ${it.phone}` : it.title;
  } else {
    title = ({ request: `${who} asked you`, handoff: `${who} sent you something`, comment: `${who} sent a message`, created: `${who} added something for you`, done: `${who} finished it`, call_log: `${who} logged a call` } as Record<string, string>)[a.kind] ?? `${who} updated something`;
    body = a.body ? `${it.title}: ${a.body}` : it.title;
  }
  const msg = JSON.stringify({ title, body, url: `/?item=${a.item_id}`, item: a.item_id, tag: `${a.item_id}-${a.kind}` });
  await Promise.all((subs.data ?? []).map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, msg); }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint); else console.error(e); }
  }));
  return new Response("sent");
});
