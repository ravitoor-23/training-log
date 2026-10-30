// Create or update the caller's profile. The first person to join becomes the owner and gets an invite code;
// everyone after needs that code. The owner can also bring over their old log once.
import { admin, cleanDay, cleanProfile, cors, fail, getUser, json } from "../_shared/core.ts";

const makeCode = () => {
  const words = ["IRON", "PEAK", "LIFT", "STRIDE", "FORGE", "SUMMIT", "TEMPO", "RISE", "GRIT", "PULSE"];
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  const num = crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000;
  return `${pick()}-${pick()}-${num}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = admin();
    const user = await getUser(req, sb);
    if (!user) return fail(401, "Sign in again.");
    const body = await req.json().catch(() => ({}));
    const action = body.action || "save";

    const meta = async (key: string) => (await sb.from("app_meta").select("value").eq("key", key).maybeSingle()).data?.value ?? null;
    const owner = await meta("owner");
    const isOwner = owner?.user_id === user.id;

    if (action === "status") {
      const { data: prof } = await sb.from("profiles").select("data, created_at").eq("user_id", user.id).maybeSingle();
      return json({
        hasProfile: !!prof, needsInvite: !!owner && !prof, isOwner,
        inviteCode: isOwner ? (await meta("invite"))?.code ?? null : null,
        canImport: (isOwner || !owner) && !(await meta("legacy_claimed")),
      });
    }

    if (action === "new-code") {
      if (!isOwner) return fail(403, "Only the owner can do that.");
      const code = makeCode();
      await sb.from("app_meta").upsert({ key: "invite", value: { code } });
      return json({ inviteCode: code });
    }

    if (action === "import") {
      if (!isOwner) return fail(403, "Only the owner can do that.");
      if (await meta("legacy_claimed")) return json({ ok: true, already: true });
      const legacy = body.legacy || {};
      for (const [day, data] of Object.entries(legacy.days || {}))
        await sb.from("days").upsert({ user_id: user.id, day, data: cleanDay(data as Record<string, unknown>) }, { onConflict: "user_id,day", ignoreDuplicates: true });
      for (const [day, messages] of Object.entries(legacy.chats || {}))
        await sb.from("chats").upsert({ user_id: user.id, day, messages }, { onConflict: "user_id,day", ignoreDuplicates: true });
      for (const [id, r] of Object.entries(legacy.reviews || {}) as [string, any][])
        await sb.from("reviews").upsert({ user_id: user.id, id, kind: r.kind || "week", day: r.date, title: r.title || "Review", body: r.body || "" }, { onConflict: "user_id,id", ignoreDuplicates: true });
      await sb.from("app_meta").upsert({ key: "legacy_claimed", value: { at: new Date().toISOString() } });
      return json({ ok: true });
    }

    // save profile
    const profile = cleanProfile(body.profile || {});
    if (!profile.name) return fail(400, "Add your name.");
    const { data: existing } = await sb.from("profiles").select("data").eq("user_id", user.id).maybeSingle();
    if (!existing) {
      if (owner) {
        const invite = (await meta("invite"))?.code || "";
        if (String(body.inviteCode || "").trim().toUpperCase() !== invite) return fail(403, "That invite code doesn't match. Ask the group owner for the current code.");
      } else {
        await sb.from("app_meta").upsert({ key: "owner", value: { user_id: user.id } });
        await sb.from("app_meta").upsert({ key: "invite", value: { code: makeCode() } });
      }
      profile.createdAt ||= new Date().toISOString();
    } else {
      profile.createdAt = (existing.data as any)?.createdAt || profile.createdAt;
    }
    const { error } = await sb.from("profiles").upsert({ user_id: user.id, email: user.email, data: profile, updated_at: new Date().toISOString() });
    if (error) throw error;
    return json({ ok: true, profile: { id: user.id, ...profile } });
  } catch (e) {
    console.error(e);
    return fail(500, "Something went wrong. Try again.");
  }
});
