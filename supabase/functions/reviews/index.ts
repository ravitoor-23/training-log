// Writes a weekly or monthly review for every person. Called by the GitHub Actions schedule.
import { admin, claude, cors, fail, json, parseJSON } from "../_shared/core.ts";

const TZ = "America/Vancouver";
const localDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const addDays = (s: string, k: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };

async function dailyReport(sb: any, userId: string, p: Record<string, any>, today: string) {
  const { data: rows } = await sb.from("days").select("day, data").eq("user_id", userId).gte("day", addDays(today, -6)).lte("day", today).order("day");
  const day = (rows || []).find((r: any) => r.day === today)?.data;
  if (!day) return "no log today";
  const prompt = `You are ${p.name}'s coach (style: Peter Attia + Andrew Huberman, plain casual language). Write tonight's END-OF-DAY REPORT for ${today}.
PROFILE: ${JSON.stringify({ kcalTrain: p.kcalTrain, kcalRest: p.kcalRest, protein: p.protein, waterL: p.waterL, steps: p.steps, goalWeight: p.goalWeight })}
NOTES (goals, allergies, health): ${p.notes || "(none)"}
TODAY: ${JSON.stringify({ ...day, media: undefined })}
LAST 6 DAYS (pattern context): ${JSON.stringify((rows || []).filter((r: any) => r.day !== today).map((r: any) => ({ date: r.day, kcal: r.data.kcal, protein: r.data.protein, micros: r.data.micros, lateSnack: r.data.lateSnack })))}
Daily guide: calories = kcalTrain if a session was logged else kcalRest; protein target; water; steps; sat fat <20 g, fiber 35-40 g, added sugar <36 g, sodium <2,300 mg, potassium 3,400+ mg, calcium 1,000 mg, iron 8 mg, magnesium 420 mg, zinc 11 mg.
Reply with ONLY JSON: {"headline": "one short line", "body": "plain text under 220 words. First a scoreboard, one line each: Calories, Protein, Water, Steps, then each nutrient as 'value / target ✓ or ✗'. Then 'Where you're short' (2-3 lines). Then 'Tomorrow' as 3 bullets starting with • naming specific foods to add or swap (respect allergies)."}`;
  const out = parseJSON(await claude({ max_tokens: 1400, messages: [{ role: "user", content: prompt }] })) || {};
  const title = `${new Date(today + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} · ${out.headline || "Daily report"}`;
  await sb.from("reviews").upsert({ user_id: userId, id: `day-${today}`, kind: "day", day: today, title, body: String(out.body || ""), created_at: new Date().toISOString() });
  return title;
}

async function reviewPerson(sb: any, userId: string, p: Record<string, any>, kind: "week" | "month", today: string) {
  let from: string, to: string, label: string;
  if (kind === "month") {
    const [y, m] = today.split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
    from = `${py}-${String(pm).padStart(2, "0")}-01`;
    to = addDays(`${y}-${String(m).padStart(2, "0")}-01`, -1);
    label = new Date(from + "T12:00:00Z").toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
  } else { to = today; from = addDays(today, -6); label = from; }
  const lookback = addDays(from, -21);
  const { data: days } = await sb.from("days").select("day, data").eq("user_id", userId).gte("day", lookback).lte("day", to).order("day");
  const { data: past } = await sb.from("reviews").select("kind, day, title, body").eq("user_id", userId).order("day", { ascending: false }).limit(3);
  const prompt = `You are ${p.name}'s coach (style: Peter Attia + Andrew Huberman, plain casual language, concise). Write their ${kind === "month" ? "MONTHLY review for " + label : "WEEKLY review for " + from + " to " + to}.

PROFILE: ${JSON.stringify({ name: p.name, startWeight: p.startWeight, goalWeight: p.goalWeight, heightIn: p.heightIn, kcalTrain: p.kcalTrain, kcalRest: p.kcalRest, protein: p.protein, waterL: p.waterL, steps: p.steps, startedOn: p.createdAt })}
NOTES FROM THEM (goals, allergies, health): ${p.notes || "(none)"}
DAILY LOGS (${lookback} to ${to}; days before ${from} are trend context only): ${JSON.stringify((days || []).map((d: any) => ({ date: d.day, ...d.data, media: undefined })))}
RECENT REVIEWS: ${JSON.stringify(past || [])}

Compute for the review period: days logged; 7-day-average weight and change vs the prior period; pace in lb/week (healthy loss 0.5-1.0); projected goal date at current pace; avg kcal vs target (training-day target when a session was logged, else rest-day); avg protein, water, steps; sessions; late snacks; top-set progress (estimated 1RM); running; nutrient averages from each day's "micros" (sat fat, fiber, sodium, potassium, calcium, iron, magnesium vs guide: sat fat <20 g, fiber 35-40 g, sodium <2,300 mg, potassium 3,400+ mg, calcium 1,000 mg, iron 8 mg, magnesium 420 mg) and the one food change that would fix the biggest gap. Plan rules: stalled 2+ weeks -> -150 kcal or +2,000 steps; losing >1.5 lb/week or strength dropping -> +150 kcal.${kind === "month" ? " Say whether a maintenance week is due (every 8-10 weeks of dieting) and, if their notes mention pending bloodwork or a check-up, ask whether it's done." : ""} Respect allergies and health notes. If they logged little, say so kindly and keep it short.

Reply with ONLY JSON: {"headline": "one short line", "body": "plain text under ${kind === "month" ? 300 : 200} words: the numbers, what went well, one or two fixes, then focus as 3 bullets starting with •"}`;
  const out = parseJSON(await claude({ max_tokens: 1500, messages: [{ role: "user", content: prompt }] })) || {};
  const id = kind === "month" ? `month-${from.slice(0, 7)}` : `week-${today}`;
  const title = kind === "month"
    ? `${label} · ${out.headline || "Monthly review"}`
    : `Week of ${new Date(from + "T12:00:00Z").toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })} · ${out.headline || "Weekly review"}`;
  await sb.from("reviews").upsert({ user_id: userId, id, kind, day: today, title, body: String(out.body || "No review this time."), created_at: new Date().toISOString() });
  return title;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const token = Deno.env.get("REVIEWS_TOKEN");
  if (!token || req.headers.get("x-reviews-token") !== token) return fail(403, "Forbidden");
  const { kind = "week" } = await req.json().catch(() => ({}));
  const sb = admin();
  const today = localDate();
  const { data: people } = await sb.from("profiles").select("user_id, data");
  const results = await Promise.allSettled((people || []).map((r: any) => kind === "day" ? dailyReport(sb, r.user_id, r.data, today) : reviewPerson(sb, r.user_id, r.data, kind === "month" ? "month" : "week", today)));
  return json({ ok: true, results: results.map((r) => (r.status === "fulfilled" ? r.value : String(r.reason))) });
});
