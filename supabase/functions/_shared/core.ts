import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

export const MODEL = "claude-sonnet-5-5";
export const SESSIONS = ["Chest + triceps", "Back + biceps", "Legs + core", "Shoulders + arms", "Zone 2 cardio", "5K / intervals", "Other"];

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reviews-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "content-type": "application/json" } });
export const fail = (status: number, error: string) => json({ error }, status);

export const admin = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

export async function getUser(req: Request, sb: SupabaseClient) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export const n = (v: unknown) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));

export async function claude(body: Record<string, unknown>) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (!res.ok) {
    const t = await res.text();
    const err = new Error(`anthropic ${res.status}: ${t.slice(0, 300)}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const out = await res.json();
  return (out.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
}

export function parseJSON(text: string): Record<string, any> | null {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* */ } }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* */ } }
  return null;
}

export const DAY_FIELDS = ["weight", "waist", "sleep", "steps", "waterL", "kcal", "protein", "firstMeal", "lastMeal", "food", "session", "runKm", "runMin", "bench", "squat", "deadlift", "pullups", "notes", "lateSnack", "media", "micros", "updatedAt"];
export function cleanDay(d: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of DAY_FIELDS) if (d[k] !== undefined) out[k] = d[k];
  return out;
}

export const PROFILE_FIELDS = ["name", "startWeight", "goalWeight", "heightIn", "kcalTrain", "kcalRest", "protein", "waterL", "steps", "notes", "color", "createdAt"];
export function cleanProfile(p: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_FIELDS) if (p[k] !== undefined) out[k] = p[k];
  out.name = String(out.name || "").slice(0, 24).trim();
  out.notes = String(out.notes || "").slice(0, 4000);
  return out;
}

export function coachRules(p: Record<string, any>) {
  return `You are ${p.name}'s personal nutrition and training coach inside a training-log app. Style: a mix of Peter Attia and Andrew Huberman, but plain, casual and short (under 90 words unless asked for more). No emoji. You log what they tell you and coach in the moment.

ABOUT ${p.name}: start weight ${p.startWeight} lb, goal ${p.goalWeight} lb${p.heightIn ? ", height " + p.heightIn + " in" : ""}.
TARGETS: ${p.kcalTrain} kcal on training days / ${p.kcalRest} on rest days, ${p.protein} g protein, ${p.waterL} L water, ${p.steps}+ steps.
WHAT THEY TOLD THEIR COACH (goals, allergies, health, schedule; always respect allergies and flag them in food or labels):
${p.notes || "(nothing yet)"}

HOW TO LOG:
- Food: if a nutrition label is visible, use its exact numbers for the portion eaten. For a meal photo, estimate portions and say they're estimates. Give kcal and protein per item.
- Only log what they say they actually ate or did. Questions ("how many calories is X?") are NOT logged unless they say they ate it.
- If something ambiguous matters (portion, unit), log your best estimate and ask one short question.
- Corrections adjust totals: put corrected DAY TOTALS in "kcal"/"protein" and rewrite "foodText".
- After logging food, say what's left for the day (kcal + protein) and one useful nudge.

REPLY WITH ONLY ONE JSON OBJECT, no other text:
{"reply": "what you say", "logged": "very short summary of what you logged, or empty string",
 "addKcal": 0, "addProtein": 0, "addWaterL": 0, "kcal": null, "protein": null,
 "foodLines": ["new lines, e.g. '6:10pm: chicken 200 g, rice 1 cup - ~520 kcal, 55 g protein'"],
 "foodText": null, "noteLines": ["new workout/other notes"],
 "set": {"weight": null, "waist": null, "sleep": null, "steps": null, "session": null, "runKm": null, "runMin": null, "bench": null, "squat": null, "deadlift": null, "pullups": null, "lateSnack": null, "firstMeal": null, "lastMeal": null},
 "mediaKind": null,
 "addMicros": {"satFatG": 0, "fiberG": 0, "sugarG": 0, "sodiumMg": 0, "potassiumMg": 0, "calciumMg": 0, "ironMg": 0, "magnesiumMg": 0, "zincMg": 0},
 "micros": null}
NUTRIENTS: for everything newly logged, put the summed amounts in "addMicros" (use label values when visible, otherwise typical values for that food; never leave them all 0 for real food). When correcting, put corrected DAY TOTALS in "micros" with the same keys. Daily guide: sat fat <20 g, fiber 35-40 g, added sugar <36 g, sodium <2,300 mg, potassium 3,400+ mg, calcium 1,000 mg, iron 8 mg, magnesium 420 mg, zinc 11 mg. Mention a nutrient only when it matters (e.g. sodium high, fiber low, sat fat near the limit).
"set" fields stay null unless given now. session is one of: ${SESSIONS.join(", ")}. firstMeal/lastMeal are 24h "HH:MM". Top sets like "185 x 5". mediaKind: meal, label, progress, form, other or null.`;
}

export function applyCoach(cur: Record<string, any>, out: Record<string, any>) {
  const next = { ...cur };
  if (n(out.kcal) != null) next.kcal = Math.round(n(out.kcal)!);
  else if (n(out.addKcal)) next.kcal = Math.round((n(cur.kcal) || 0) + n(out.addKcal)!);
  if (n(out.protein) != null) next.protein = Math.round(n(out.protein)!);
  else if (n(out.addProtein)) next.protein = Math.round((n(cur.protein) || 0) + n(out.addProtein)!);
  if (n(out.addWaterL)) next.waterL = Math.round(((n(cur.waterL) || 0) + n(out.addWaterL)!) * 100) / 100;
  if (typeof out.foodText === "string" && out.foodText.trim()) next.food = out.foodText.trim();
  else if (Array.isArray(out.foodLines) && out.foodLines.length) next.food = [cur.food || "", ...out.foodLines.map(String)].filter(Boolean).join("\n");
  if (Array.isArray(out.noteLines) && out.noteLines.length) next.notes = [cur.notes || "", ...out.noteLines.map(String)].filter(Boolean).join("\n");
  const MK = ["satFatG", "fiberG", "sugarG", "sodiumMg", "potassiumMg", "calciumMg", "ironMg", "magnesiumMg", "zincMg"];
  if (out.micros && typeof out.micros === "object") {
    next.micros = {};
    for (const k of MK) if (n(out.micros[k]) != null) next.micros[k] = Math.round(n(out.micros[k])! * 10) / 10;
  } else if (out.addMicros && typeof out.addMicros === "object") {
    const m = { ...(cur.micros || {}) };
    for (const k of MK) if (n(out.addMicros[k])) m[k] = Math.round(((n(m[k]) || 0) + n(out.addMicros[k])!) * 10) / 10;
    next.micros = m;
  }
  const s = out.set || {};
  for (const k of ["weight", "waist", "sleep", "steps", "runKm", "runMin"]) if (n(s[k]) != null) next[k] = n(s[k]);
  for (const k of ["bench", "squat", "deadlift", "pullups", "firstMeal", "lastMeal"]) if (s[k]) next[k] = String(s[k]);
  if (s.session && SESSIONS.includes(s.session)) next.session = s.session;
  if (typeof s.lateSnack === "boolean") next.lateSnack = s.lateSnack;
  return next;
}
