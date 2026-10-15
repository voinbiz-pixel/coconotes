// coconotes: turns a spoken or typed note into items, using Claude.
// Needs the secret ANTHROPIC_API_KEY. Optional secret CLAUDE_MODEL (default claude-haiku-5-5).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function prompt(text: string, c: { now: string; me: string; other: string; brands: string[] }) {
  return `You turn a spoken note into items for a to-do app shared by two people: ${c.me} (the speaker, "me") and ${c.other} ("other").
Now: ${c.now} (local time). Brands: ${c.brands.join(", ") || "none"}.
Return ONLY JSON, no prose: {"items":[{"type":"task|call|request|reminder","title":"","owner":"me|other|both","due_date":"YYYY-MM-DD or null","remind_at":"YYYY-MM-DDTHH:MM or null","contact_name":"or null","phone":"or null","brand":"exact brand name or null","urgent":false,"notes":"or null"}]}
Rules: one item per separate action. type "call" when the action is phoning someone. "request" when the speaker asks ${c.other} to do something (owner "other"). "reminder" when it is only a nudge with no other action. Otherwise "task". owner is who does it; "both" for we, us, or both of us. title: short, starts with a verb, no owner name, no date or time (example: "Call Harney rep about tea samples"). If a clock time is given, set remind_at; if only a day, set due_date. Resolve relative dates from Now. "In an hour" is now plus one hour. Morning 09:00, afternoon 16:00, evening or tonight 20:00. Put extra details in notes. Never invent details.

Note: """${text}"""`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: ok } = await user.rpc("is_team_member");
    if (!ok) return json({ error: "not allowed" }, 403);

    const { text, context } = await req.json();
    if (!text || String(text).length > 4000) return json({ error: "empty or too long" }, 400);
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "no key" }, 501);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: Deno.env.get("CLAUDE_MODEL") ?? "claude-haiku-5-5", max_tokens: 1200, messages: [{ role: "user", content: prompt(String(text), context) }] }),
    });
    if (!r.ok) { console.error(await r.text()); return json({ error: "model error" }, 502); }
    const data = await r.json();
    const out = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    const clean = out.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
    return json({ items: Array.isArray(parsed.items) ? parsed.items : [] });
  } catch (e) { console.error(e); return json({ error: "failed" }, 500); }
});
