// coconotes: private calendar feed. Your calls and reminders at their times, due dates as all-day items.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
const text = (s: unknown) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (iso: string) => iso.replaceAll("-", "");
const nextDay = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replaceAll("-", ""); };
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function fold(line: string): string {
  const enc = new TextEncoder(), out: string[] = []; let cur = "", bytes = 0;
  for (const ch of line) { const b = enc.encode(ch).length, limit = out.length ? 74 : 75; if (bytes + b > limit) { out.push(cur); cur = ""; bytes = 0; } cur += ch; bytes += b; }
  out.push(cur); return out.join("\r\n ");
}
function ev(uid: string, when: { date?: string; at?: string }, summary: string, desc: string): string[] {
  const l = ["BEGIN:VEVENT", `UID:${uid}@coconotes`, `DTSTAMP:${utc(new Date())}`];
  if (when.at) { const s = new Date(when.at); l.push(`DTSTART:${utc(s)}`, `DTEND:${utc(new Date(s.getTime() + 15 * 60e3))}`); }
  else l.push(`DTSTART;VALUE=DATE:${ymd(when.date!)}`, `DTEND;VALUE=DATE:${nextDay(when.date!)}`, "TRANSP:TRANSPARENT");
  l.push(`SUMMARY:${text(summary)}`);
  if (desc) l.push(`DESCRIPTION:${text(desc)}`);
  if (APP_URL) l.push(`URL:${APP_URL}/?item=${uid.split("-").slice(1).join("-")}`);
  l.push("END:VEVENT"); return l;
}
const notFound = () => new Response("Not found", { status: 404 });

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{24,64}$/.test(token)) return notFound();
  const { data: tok } = await sb.from("calendar_tokens").select("profile_id").eq("token", token).maybeSingle();
  if (!tok) return notFound();
  const { data: me } = await sb.from("profiles").select("id,email").eq("id", tok.profile_id).maybeSingle();
  const { data: team } = await sb.from("team_members").select("email");
  if (!me || !team?.some((t) => t.email.toLowerCase() === me.email.toLowerCase())) return notFound();

  const { data: items } = await sb.from("items").select("id,type,title,done,stage,urgent,owner_ids,due_date,remind_at,post_date,contact_name,phone,notes").contains("owner_ids", [me.id]);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//coconotes//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:coconotes", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const it of items ?? []) {
    const open = it.type === "content" ? it.stage !== "posted" : !it.done;
    if (!open) continue;
    const label = it.type === "call" ? `Call ${it.contact_name || ""}: ${it.title}`.replace(/:\s*Call\s.*$/i, "") : it.title;
    const desc = [it.phone ? `Phone: ${it.phone}` : "", it.notes].filter(Boolean).join("\n");
    const summary = `${it.urgent ? "Urgent: " : ""}${label}`;
    if (it.remind_at) lines.push(...ev(`at-${it.id}`, { at: it.remind_at }, summary, desc));
    else if (it.due_date) lines.push(...ev(`due-${it.id}`, { date: it.due_date }, summary, desc));
    else if (it.type === "content" && it.post_date) lines.push(...ev(`post-${it.id}`, { date: it.post_date }, `Post: ${it.title}`, desc));
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="coconotes.ics"', "Cache-Control": "no-cache, max-age=0" } });
});
