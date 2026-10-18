// coconotes: Lock Screen capture. An iPhone Shortcut posts typed text here with your personal key.
// Claude sorts it into reminders (time, person, brand), they're saved, and a short summary comes back for the notification.
// Turn OFF JWT verification for this function (the personal key is the password). Uses ANTHROPIC_API_KEY if set.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const reply = (t: string, status = 200) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

function offsetMinutes(tz: string, at: Date): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/); if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}
function localToUtc(local: string, tz: string): string {
  const [d, t] = local.split("T"); const [y, mo, da] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, da, h, mi));
  return new Date(guess.getTime() - offsetMinutes(tz, guess) * 60e3).toISOString();
}
function localNow(tz: string) {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).format(new Date());
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { label: `${f({ weekday: "long" })}, ${iso} ${f({ hour: "2-digit", minute: "2-digit", hour12: false })}`, date: iso };
}
function prompt(text: string, me: string, other: string, now: string, brands: string[]) {
  return `You turn a spoken note into items for a to-do app shared by two people: ${me} (the speaker, "me") and ${other} ("other").
Now: ${now} (local time). Brands: ${brands.join(", ") || "none"}.
Return ONLY JSON, no prose: {"items":[{"type":"task|call|request|reminder","title":"","owner":"me|other|both","due_date":"YYYY-MM-DD or null","remind_at":"YYYY-MM-DDTHH:MM or null","contact_name":"or null","phone":"or null","brand":"exact brand name or null","urgent":false,"notes":"or null"}]}
Rules: one item per separate action. type "call" when the action is phoning someone. "request" when the speaker asks ${other} to do something (owner "other"). "reminder" when it is only a nudge with no other action. Otherwise "task". owner is who does it; "both" for we, us, or both of us. title: short, starts with a verb, no owner name, no date or time. If a clock time is given, set remind_at; if only a day, set due_date. Resolve relative dates from Now. "In an hour" is now plus one hour. Morning 09:00, afternoon 16:00, evening or tonight 20:00. Put extra details in notes. Never invent details.

Note: """${text}"""`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply("Send a POST with JSON {\"text\": \"...\"}", 405);
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!/^[a-f0-9]{24,64}$/.test(key)) return reply("Unknown key", 404);
  const { data: tok } = await sb.from("capture_tokens").select("profile_id").eq("token", key).maybeSingle();
  if (!tok) return reply("Unknown key", 404);
  const [{ data: profiles }, { data: team }, { data: brands }] = await Promise.all([sb.from("profiles").select("id,name,email,tz"), sb.from("team_members").select("email"), sb.from("brands").select("id,name")]);
  const me = profiles?.find((p) => p.id === tok.profile_id);
  if (!me || !team?.some((t) => t.email.toLowerCase() === me.email.toLowerCase())) return reply("Not allowed", 403);
  const other = profiles?.find((p) => p.id !== me.id);
  const first = (p?: { name?: string; email?: string }) => (p?.name || p?.email || "Teammate").split(/[\s@]/)[0];

  let text = "";
  try { const body = await req.json(); text = String(body.text ?? "").trim(); } catch { text = (await req.text()).trim(); }
  if (!text) return reply("Didn't catch anything. Try again.", 400);
  if (text.length > 4000) text = text.slice(0, 4000);

  const tz = me.tz || "America/New_York", now = localNow(tz);
  type Item = { type: string; title: string; owner: string; due_date: string | null; remind_at: string | null; contact_name: string | null; phone: string | null; brand: string | null; urgent: boolean; notes: string | null };
  let items: Item[] = [];
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (apiKey) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("CLAUDE_MODEL") ?? "claude-haiku-5-5", max_tokens: 1200, messages: [{ role: "user", content: prompt(text, first(me), first(other), now.label, (brands ?? []).map((b) => b.name)) }] }) });
      const data = await r.json();
      const out = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("").replace(/```json|```/g, "");
      items = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)).items ?? [];
    } catch (e) { console.error(e); }
  }
  if (!items.length) items = [{ type: "task", title: text.charAt(0).toUpperCase() + text.slice(1), owner: "me", due_date: now.date, remind_at: null, contact_name: null, phone: null, brand: null, urgent: false, notes: null }];

  const ids = (o: string) => o === "both" ? [me.id, other?.id].filter(Boolean) : o === "other" && other ? [other.id] : [me.id];
  const lines: string[] = [];
  for (const x of items.filter((i) => i?.title)) {
    const owner = "both"; // duo app: every reminder belongs to both of you
    const remind = x.remind_at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x.remind_at) ? localToUtc(x.remind_at.slice(0, 16), tz) : null;
    const due = remind ? x.remind_at!.slice(0, 10) : (/^\d{4}-\d{2}-\d{2}$/.test(x.due_date ?? "") ? x.due_date : null);
    const brand = x.brand ? (brands ?? []).find((b) => b.name.toLowerCase() === String(x.brand).toLowerCase())?.id ?? null : null;
    const type = x.phone || x.type === "call" || /^\s*call\b/i.test(x.title) ? "call" : (x.type === "reminder" ? "reminder" : "task");
    const { data: it, error } = await sb.from("items").insert({ type, title: x.title, owner_ids: ids(owner), due_date: due, remind_at: remind, contact_name: x.contact_name, phone: x.phone, brand_id: brand, urgent: !!x.urgent, notes: x.notes ?? "", created_by: me.id }).select("id").single();
    if (error) { console.error(error); continue; }
    if (other) await sb.from("activity").insert({ item_id: it.id, actor_id: me.id, to_id: other.id, kind: "created", body: "" });
    const when = remind ? new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(remind)) : due ?? "";
    lines.push(`${x.title}${when ? `, ${when}` : ""}`);
  }
  return reply(lines.length ? `Added ${lines.length}: ${lines.join("; ")}` : "Couldn't add that. Try again.");
});
