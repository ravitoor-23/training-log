// The coach: reads the day's log + chat, looks at any photos, logs what the person ate or did, and replies.
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { admin, applyCoach, claude, cleanDay, coachRules, cors, fail, getUser, json, n, parseJSON } from "../_shared/core.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = admin();
    const user = await getUser(req, sb);
    if (!user) return fail(401, "Sign in again.");
    const { data: prow } = await sb.from("profiles").select("data").eq("user_id", user.id).maybeSingle();
    if (!prow) return fail(403, "Set up your profile first.");
    const p = { ...(prow.data as Record<string, any>) };

    const body = await req.json();
    const text = String(body.text || "").slice(0, 4000);
    const date = String(body.date || "");
    const timeNow = String(body.timeNow || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, "Bad date.");
    const media = (Array.isArray(body.media) ? body.media : [])
      .filter((m: any) => typeof m?.path === "string" && m.path.startsWith(user.id + "/"))
      .slice(0, 6)
      .map((m: any) => ({ path: m.path, kind: m.kind === "video" ? "video" : "image", type: String(m.type || "") }));
    if (!text && !media.length) return fail(400, "Say something or add a photo.");

    const { data: drow } = await sb.from("days").select("data").eq("user_id", user.id).eq("day", date).maybeSingle();
    const { data: crow } = await sb.from("chats").select("messages").eq("user_id", user.id).eq("day", date).maybeSingle();
    const day = (drow?.data as Record<string, any>) || {};
    const history = (crow?.messages as any[]) || [];

    const images: { type: string; data: string }[] = [];
    for (const m of media.filter((m: any) => m.kind === "image")) {
      const { data: blob } = await sb.storage.from("media").download(m.path);
      if (!blob) continue;
      const type = /image\/(jpeg|png|webp|gif)/.test(blob.type) ? blob.type : "image/jpeg";
      images.push({ type, data: encodeBase64(new Uint8Array(await blob.arrayBuffer())) });
    }
    const videos = media.filter((m: any) => m.kind === "video").length;

    const snap = { date, timeNow, kcal: n(day.kcal) || 0, protein: n(day.protein) || 0, waterL: n(day.waterL) || 0, steps: n(day.steps), weight: n(day.weight), sleep: n(day.sleep), session: day.session || "", food: day.food || "", notes: day.notes || "", targetKcalToday: day.session ? p.kcalTrain : p.kcalRest };
    let msg = (text || "Here is a photo.") + "\n\nTODAY'S LOG SO FAR:\n" + JSON.stringify(snap);
    if (videos) msg += `\n[${videos} video(s) attached - you cannot see them; they're saved to their media. Ask what they want checked.]`;

    const turns: { role: string; content: any }[] = [];
    for (const h of history.slice(-12)) {
      const role = h.role === "user" ? "user" : "assistant";
      const content = h.text || "(photo)";
      if (turns.length && turns.at(-1)!.role === role) turns.at(-1)!.content += "\n" + content;
      else turns.push({ role, content });
    }
    while (turns.length && turns[0].role !== "user") turns.shift();
    if (turns.length && turns.at(-1)!.role === "user") turns.push({ role: "assistant", content: "Noted." });
    turns.push({ role: "user", content: [...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.type, data: im.data } })), { type: "text", text: msg }] });

    const raw = await claude({ max_tokens: 1200, system: coachRules(p), messages: turns });
    const out = parseJSON(raw);
    if (!out) return fail(502, "I got muddled on that one. Send it again.");

    let next: Record<string, any> = applyCoach(day, out);
    next.media = Array.isArray(day.media) ? day.media.slice() : [];
    if (media.length && (out.mediaKind === "progress" || out.mediaKind === "form" || videos)) next.media.push(...media.map((m: any) => ({ path: m.path, kind: m.kind })));
    next.updatedAt = new Date().toISOString();
    next = cleanDay(next);

    const now = new Date().toISOString();
    const messages = [...history,
      { role: "user", text, ts: now, media: media.map((m: any) => ({ path: m.path, kind: m.kind })) },
      { role: "coach", text: String(out.reply || "Logged."), logged: String(out.logged || ""), ts: now },
    ].slice(-120);

    const e1 = await sb.from("days").upsert({ user_id: user.id, day: date, data: next, updated_at: now });
    const e2 = await sb.from("chats").upsert({ user_id: user.id, day: date, messages, updated_at: now });
    if (e1.error || e2.error) throw e1.error || e2.error;
    return json({ day: next, messages });
  } catch (e: any) {
    console.error(e);
    if (e?.status === 429 || e?.status === 529) return fail(429, "The coach is busy. Try again in a minute.");
    if (e?.status === 401 || e?.status === 403) return fail(500, "The coach's API key isn't working. Check the Anthropic key and billing.");
    return fail(500, "Couldn't reach the coach. Try again.");
  }
});
