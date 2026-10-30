import { createClient } from "@supabase/supabase-js";
import "./style.css";

/* ================= config ================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const sb = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

/* ================= helpers ================= */
const $ = (id) => document.getElementById(id);
const app = $("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const localISO = (d) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, k) => { const d = parse(s); d.setDate(d.getDate() + k); return localISO(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const fmt = (s, o) => parse(s).toLocaleDateString("en-CA", o);
const short = (s) => fmt(s, { month: "short", day: "numeric" });
const TODAY = () => localISO(new Date());
const SESSIONS = ["Chest + triceps", "Back + biceps", "Legs + core", "Shoulders + arms", "Zone 2 cardio", "5K / intervals", "Other"];
const isLift = (s) => /Chest|Back|Legs|Shoulders/.test(s || "");
const PCOL = ["#8b7bff", "#ff6fb1", "#3fd8ff", "#46e3a6", "#ffc35c", "#c48bff"];
const colorOf = (p) => PCOL[(p && p.color) || 0] || PCOL[0];
const initial = (p) => ((p && p.name) || "?").trim().charAt(0).toUpperCase() || "?";
const e1rm = (s) => { const m = String(s || "").match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs)?\s*[x×*]\s*(\d+)/i); if (!m) return null; const w = +m[1], r = +m[2]; if (!w || !r || r > 15) return null; return r === 1 ? w : w * (1 + r / 30); };
const greet = () => { const h = new Date().getHours(); return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const nowHM = () => new Date().toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase();

const ICON = {
  today: '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/>',
  trends: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  group: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.6c2.6.1 4.4 2 5 5.4"/>',
  journal: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  send: '<path d="M5 12h13M12 5l7 7-7 7"/>',
  left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
};
const svgI = (k, sw = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

let toastT;
function toast(msg) { let t = $("toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast glass"; t.setAttribute("role", "status"); document.body.append(t); } t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

/* ================= state ================= */
const S = {
  session: null, me: null, status: null,
  people: {}, daysBy: {}, chats: [], reviews: [], signed: {},
  viewId: null, tab: "today", date: TODAY(), weekOffset: 0,
  sending: false, live: null, attach: [],
};
try { const t = localStorage.getItem("tl-tab"); if (["today", "trends", "group", "journal"].includes(t)) S.tab = t; } catch {}
const prof = () => S.people[S.viewId] || null;
const days = () => S.daysBy[S.viewId] || {};
const isMine = () => S.me && S.viewId === S.me;
const target = (p, d) => ({ kcal: d && d.session ? n(p?.kcalTrain) || 2250 : n(p?.kcalRest) || 1950, protein: n(p?.protein) || 160, water: n(p?.waterL) || 3, steps: n(p?.steps) || 8000 });

async function fn(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = "Something went wrong. Try again.";
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return data;
}

/* ================= data ================= */
async function loadGroup() {
  const since = addDays(TODAY(), -400);
  const [{ data: profs, error: e1 }, { data: dayRows, error: e2 }] = await Promise.all([
    sb.from("profiles").select("user_id, data, created_at").order("created_at"),
    sb.from("days").select("user_id, day, data").gte("day", since).limit(20000),
  ]);
  if (e1 || e2) throw e1 || e2;
  S.people = {}; (profs || []).forEach((r) => (S.people[r.user_id] = { id: r.user_id, ...r.data, createdAt: r.data?.createdAt || r.created_at }));
  S.daysBy = {}; (dayRows || []).forEach((r) => ((S.daysBy[r.user_id] ??= {})[r.day] = r.data));
}
async function loadChats() {
  if (!S.viewId) return;
  const { data } = await sb.from("chats").select("messages").eq("user_id", S.viewId).eq("day", S.date).maybeSingle();
  S.chats = data?.messages || [];
}
async function loadReviews() {
  if (!S.viewId) return;
  const { data } = await sb.from("reviews").select("id, kind, day, title, body").eq("user_id", S.viewId).order("day", { ascending: false }).limit(30);
  S.reviews = data || [];
}
async function signedUrl(path) {
  if (S.signed[path]) return S.signed[path];
  const { data } = await sb.storage.from("media").createSignedUrl(path, 60 * 60 * 6);
  if (data?.signedUrl) S.signed[path] = data.signedUrl;
  return data?.signedUrl || "";
}
async function saveDay(ds, next) {
  next.updatedAt = new Date().toISOString();
  S.daysBy[S.me] = { ...(S.daysBy[S.me] || {}), [ds]: next };
  const { error } = await sb.from("days").upsert({ user_id: S.me, day: ds, data: next, updated_at: next.updatedAt });
  if (error) throw error;
}

/* ================= projections ================= */
function weightSeries(dmap) {
  const pts = Object.keys(dmap).sort().filter((ds) => n(dmap[ds].weight) != null).map((ds) => ({ ds, v: +dmap[ds].weight }));
  return pts.map((p) => { const win = pts.filter((q) => { const dt = diffDays(q.ds, p.ds); return dt >= 0 && dt < 7; }); return { ds: p.ds, v: p.v, avg: avg(win.map((q) => q.v)) }; });
}
function projection(p, dmap) {
  const s = weightSeries(dmap);
  const goal = n(p?.goalWeight), start = n(p?.startWeight);
  const out = { series: s, goal, start, current: s.length ? s.at(-1).avg : start, slope: null, eta: null, rateWk: null, source: "none" };
  const lastDs = s.at(-1)?.ds || TODAY();
  const recent = s.filter((q) => diffDays(q.ds, lastDs) <= 21);
  if (recent.length >= 4 && diffDays(recent[0].ds, recent.at(-1).ds) >= 6) {
    const xs = recent.map((q) => diffDays(recent[0].ds, q.ds)), ys = recent.map((q) => q.v);
    const mx = avg(xs), my = avg(ys);
    const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0), den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    if (den > 0) { out.slope = num / den; out.source = "trend"; }
  }
  if (out.slope == null && goal != null && out.current != null) { out.slope = goal < out.current ? -0.75 / 7 : 0.5 / 7; out.source = "plan"; }
  if (out.slope != null) out.rateWk = out.slope * 7;
  if (goal != null && out.current != null && out.slope) {
    const need = goal - out.current;
    if (Math.abs(need) < 0.3) out.eta = TODAY();
    else if (Math.sign(need) === Math.sign(out.slope)) { const dd = Math.round(need / out.slope); if (dd > 0 && dd < 730) out.eta = addDays(lastDs, dd); }
  }
  return out;
}
function streak(dmap, test) { let k = 0, ds = TODAY(); if (!dmap[ds] || !test(dmap[ds])) ds = addDays(ds, -1); while (dmap[ds] && test(dmap[ds])) { k++; ds = addDays(ds, -1); } return k; }

/* ================= charts ================= */
let gid = 0;
const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; };
const W = (id, fb) => Math.max(300, Math.round(document.getElementById(id)?.clientWidth || fb));

function lineChart({ series, w = 760, h = 260, label = "", goal = null, proj = null, todayDs = null, yFmt = (v) => Math.round(v) }) {
  const all = series.flatMap((s) => s.pts);
  if (!all.length) return '<p class="empty">Not enough data yet.</p>';
  const L = 40, R = 14, T = 18, B = 30;
  const ds = all.map((p) => p.ds).sort();
  let x0 = ds[0], x1 = ds.at(-1);
  if (proj) x1 = [x1, proj.to.ds].sort().at(-1);
  if (x0 === x1) x1 = addDays(x0, 1);
  const vals = all.map((p) => p.v).concat(goal != null ? [goal] : []).concat(proj ? [proj.to.v + (proj.spread || 0), proj.to.v - (proj.spread || 0)] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(1, (hi - lo) * 0.12); lo -= pad; hi += pad;
  const span = diffDays(x0, x1);
  const X = (d) => L + (diffDays(x0, d) / span) * (w - L - R), Y = (v) => T + ((hi - v) / (hi - lo)) * (h - T - B);
  const step = niceStep((hi - lo) / 4); const ticks = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const nx = w < 480 ? 3 : 5; const xs = Math.max(1, Math.round(span / nx)); const xt = []; for (let i = 0; i <= span; i += xs) xt.push(addDays(x0, i));
  const id = "g" + ++gid;
  let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><defs>`;
  series.forEach((se, i) => { s += `<linearGradient id="${id}l${i}" x1="0" x2="1"><stop offset="0" stop-color="${se.c1}"/><stop offset="1" stop-color="${se.c2 || se.c1}"/></linearGradient><linearGradient id="${id}a${i}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${se.c1}" stop-opacity=".28"/><stop offset="1" stop-color="${se.c1}" stop-opacity="0"/></linearGradient>`; });
  s += `<filter id="${id}glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  ticks.forEach((v) => (s += `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".08"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${yFmt(v)}</text>`));
  xt.forEach((d, i) => (s += `<text x="${X(d)}" y="${h - 8}" text-anchor="${i === 0 ? "start" : "middle"}">${short(d)}</text>`));
  if (todayDs && todayDs > x0 && todayDs < x1) s += `<line x1="${X(todayDs)}" x2="${X(todayDs)}" y1="${T}" y2="${h - B}" stroke="currentColor" opacity=".25" stroke-dasharray="2 4"/><text class="lab" x="${X(todayDs) + 5}" y="${T + 4}">today</text>`;
  if (goal != null) s += `<line x1="${L}" x2="${w - R}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--good)" stroke-dasharray="5 6" opacity=".85"/><text class="lab" x="${L + 6}" y="${Y(goal) - 7}" style="fill:var(--good)">Goal ${yFmt(goal)}</text>`;
  if (proj) {
    const a = proj.from, b = proj.to, c = proj.c;
    if (proj.spread) s += `<path d="M${X(a.ds)} ${Y(a.v)} L${X(b.ds)} ${Y(b.v + proj.spread)} L${X(b.ds)} ${Y(b.v - proj.spread)} Z" fill="${c}" opacity=".12"/>`;
    s += `<line x1="${X(a.ds)}" y1="${Y(a.v)}" x2="${X(b.ds)}" y2="${Y(b.v)}" stroke="${c}" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>`;
    s += `<circle cx="${X(b.ds)}" cy="${Y(b.v)}" r="7" fill="${c}" opacity=".25"/><circle cx="${X(b.ds)}" cy="${Y(b.v)}" r="4" fill="${c}"/>`;
    s += `<text class="lab" x="${Math.min(X(b.ds), w - R)}" y="${Y(b.v) + 22}" text-anchor="end" style="fill:${c}">${esc(proj.label)}</text>`;
  }
  series.forEach((se, i) => {
    if (se.dots) se.pts.forEach((p) => (s += `<circle cx="${X(p.ds)}" cy="${Y(p.raw ?? p.v)}" r="2.4" fill="${se.c1}" opacity=".4"/>`));
    if (se.pts.length > 1) {
      const d = se.pts.map((p, k) => `${k ? "L" : "M"}${X(p.ds).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
      if (se.area) s += `<path d="${d} L${X(se.pts.at(-1).ds)} ${h - B} L${X(se.pts[0].ds)} ${h - B} Z" fill="url(#${id}a${i})"/>`;
      s += `<path d="${d}" fill="none" stroke="url(#${id}l${i})" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" filter="url(#${id}glow)"/>`;
    }
    const last = se.pts.at(-1);
    s += `<circle cx="${X(last.ds)}" cy="${Y(last.v)}" r="5" fill="${se.c2 || se.c1}" stroke="var(--bg)" stroke-width="2"/>`;
    if (se.endLabel) s += `<text class="lab" x="${X(last.ds) - 8}" y="${Y(last.v) - 11}" text-anchor="end" style="fill:${se.c2 || se.c1}">${esc(se.endLabel)}</text>`;
  });
  return s + "</svg>";
}
function barChart({ dates, values, targets, w = 420, h = 190, label = "", good = "under", c1 = "#8b7bff", c2 = "#ff6fb1" }) {
  if (!values.some((v) => v != null)) return '<p class="empty">Nothing logged in the last 14 days.</p>';
  const L = 34, R = 6, T = 10, B = 26;
  const max = Math.max(...values.filter((v) => v != null), ...targets.filter((v) => v != null)) * 1.12;
  const step = niceStep(max / 3); const ticks = []; for (let v = 0; v <= max; v += step) ticks.push(v);
  const bw = (w - L - R) / dates.length, Y = (v) => T + ((max - v) / max) * (h - T - B);
  const id = "b" + ++gid;
  let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient></defs>`;
  ticks.forEach((v) => (s += `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".08"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v >= 1000 ? v / 1000 + "k" : v}</text>`));
  dates.forEach((d, i) => {
    const v = values[i], t = targets[i], x = L + i * bw + bw * 0.2, bwi = bw * 0.6;
    if (v != null) {
      const ok = t == null ? true : good === "under" ? v <= t * 1.05 : v >= t * 0.95;
      s += `<rect x="${x}" y="${Y(v)}" width="${bwi}" height="${Math.max(2, Y(0) - Y(v))}" rx="${Math.min(6, bwi / 2)}" fill="${ok ? `url(#${id})` : "var(--warn)"}" opacity="${ok ? 1 : 0.85}"/>`;
    } else s += `<rect x="${x}" y="${Y(0) - 2}" width="${bwi}" height="2" rx="1" fill="currentColor" opacity=".12"/>`;
    if (t != null) s += `<line x1="${x - 2}" x2="${x + bwi + 2}" y1="${Y(t)}" y2="${Y(t)}" stroke="currentColor" stroke-width="1.5" opacity=".45"/>`;
    if (i % 2 === 1 || dates.length <= 8) s += `<text x="${x + bwi / 2}" y="${h - 7}" text-anchor="middle">${fmt(d, { day: "numeric" })}</text>`;
  });
  return s + `</svg><div class="legend"><span><i style="--c:linear-gradient(90deg,${c1},${c2})"></i>On target</span><span><i style="--c:var(--warn)"></i>Off target</span><span><i style="--c:currentColor;opacity:.45"></i>Target</span></div>`;
}
function bigRing(val, tgt) {
  const r = 120, c = 2 * Math.PI * r, pct = tgt ? Math.min(1, (val || 0) / tgt) : 0, over = val > tgt * 1.05;
  const id = "r" + ++gid;
  return `<svg viewBox="0 0 280 280" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${over ? "var(--warn)" : "var(--a3)"}"/><stop offset=".55" stop-color="${over ? "var(--warn)" : "var(--a1)"}"/><stop offset="1" stop-color="${over ? "var(--bad)" : "var(--a2)"}"/></linearGradient><filter id="${id}f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter></defs>
  <circle cx="140" cy="140" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".08" stroke-width="18"/>
  <circle cx="140" cy="140" r="${r}" fill="none" stroke="url(#${id})" stroke-width="18" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 140 140)" filter="url(#${id}f)" opacity=".7"/>
  <circle class="ringarc" cx="140" cy="140" r="${r}" fill="none" stroke="url(#${id})" stroke-width="18" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 140 140)" style="transition:stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)"/></svg>`;
}
const metric = (lab, val, unit, tgt, note, g1, g2) => `<div class="metric"><div class="row"><span class="lab">${lab}</span><span class="v">${val == null ? "–" : val}<small>${unit}</small></span></div><div class="bar" style="--g1:${g1};--g2:${g2}"><i style="width:${tgt ? Math.min(100, ((n(String(val).replace(/,/g, "")) || 0) / tgt) * 100) : 0}%"></i></div><div class="hint">${note}</div></div>`;
const kpi = (k, v, note, cls = "") => `<div class="kpi"><p class="eyebrow">${k}</p><div class="v ${cls}">${v}</div><div class="n">${note}</div></div>`;

/* ================= shell ================= */
function renderShell() {
  app.innerHTML = `
  <svg width="0" height="0" style="position:absolute"><defs><linearGradient id="dockgrad" x1="0" x2="1"><stop offset="0" stop-color="#8b7bff"/><stop offset="1" stop-color="#ff6fb1"/></linearGradient></defs></svg>
  <div class="shell">
    <header class="topbar">
      <div class="brand"><span class="mark" aria-hidden="true"></span>Training Log</div>
      <div class="top-right">
        <div class="pill glass" style="position:relative">
          <button class="iconbtn" id="d-prev" aria-label="Previous day">${svgI("left", 2)}</button>
          <button class="datebtn" id="d-label"></button>
          <input type="date" id="d-input" aria-label="Pick a day">
          <button class="iconbtn" id="d-next" aria-label="Next day">${svgI("right", 2)}</button>
        </div>
        <div style="position:relative">
          <button class="avatar" id="avatar" aria-haspopup="menu" aria-expanded="false" aria-label="Account"></button>
          <div class="menu glass" id="menu" role="menu" hidden>
            <div class="who" id="menu-who"></div>
            <button role="menuitem" id="m-profile">Edit profile and targets</button>
            <button role="menuitem" id="m-refresh">Refresh</button>
            <button role="menuitem" id="m-out">Sign out</button>
          </div>
        </div>
      </div>
    </header>
    <nav class="people" id="people" aria-label="People"></nav>
    <main id="view" style="display:grid;gap:18px"></main>
  </div>
  <nav class="dock glass" role="tablist" aria-label="Sections">
    ${["today", "trends", "group", "journal"].map((t) => `<button role="tab" data-tab="${t}" aria-selected="${S.tab === t}">${svgI(t)}<span>${t[0].toUpperCase() + t.slice(1)}</span></button>`).join("")}
  </nav>`;
  document.querySelectorAll(".dock button").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  $("d-prev").onclick = () => setDate(addDays(S.date, -1));
  $("d-next").onclick = () => setDate(addDays(S.date, 1));
  $("d-label").onclick = () => { const i = $("d-input"); i.value = S.date; i.showPicker ? i.showPicker() : i.click(); };
  $("d-input").onchange = (e) => e.target.value && setDate(e.target.value);
  const menu = $("menu"), av = $("avatar");
  av.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; av.setAttribute("aria-expanded", String(!menu.hidden)); };
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; av.setAttribute("aria-expanded", "false"); } });
  $("m-profile").onclick = () => { menu.hidden = true; renderProfileForm(S.people[S.me]); };
  $("m-refresh").onclick = async () => { menu.hidden = true; await refresh(); toast("Up to date"); };
  $("m-out").onclick = async () => { await sb.auth.signOut(); location.reload(); };
}
function renderHeader() {
  const me = S.people[S.me];
  $("d-label").textContent = S.date === TODAY() ? "Today" : S.date === addDays(TODAY(), -1) ? "Yesterday" : fmt(S.date, { weekday: "short", month: "short", day: "numeric" });
  $("d-next").disabled = S.date >= TODAY();
  const av = $("avatar"); av.textContent = initial(me); av.style.setProperty("--c", colorOf(me));
  $("menu-who").textContent = S.session?.user?.email || "";
  const box = $("people");
  const ids = Object.keys(S.people).sort((a, b) => (a === S.me ? -1 : b === S.me ? 1 : (S.people[a].name || "").localeCompare(S.people[b].name || "")));
  box.hidden = ids.length < 2;
  box.innerHTML = ids.map((id) => { const p = S.people[id]; return `<button class="chip-person" data-id="${id}" style="--c:${colorOf(p)}" aria-pressed="${id === S.viewId}"><span class="dot">${esc(initial(p))}</span>${esc(p.name || "Someone")}${id === S.me ? ' <span class="muted" style="font-weight:500">· you</span>' : ""}</button>`; }).join("");
  box.querySelectorAll("button").forEach((b) => (b.onclick = () => selectPerson(b.dataset.id)));
}
function setTab(t) {
  S.tab = t; try { localStorage.setItem("tl-tab", t); } catch {}
  document.querySelectorAll(".dock button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  render(); scrollTo({ top: 0, behavior: "smooth" });
}
async function setDate(ds) { if (ds > TODAY()) return; S.date = ds; S.live = null; render(); await loadChats(); if (S.tab === "today") renderThread(); }
async function selectPerson(id) { if (S.viewId === id) return; S.viewId = id; S.live = null; S.chats = []; S.reviews = []; render(); await Promise.all([loadChats(), loadReviews()]); render(); }

function render() {
  if (S.tab === "profile") return;
  renderHeader();
  const v = $("view");
  if (S.tab === "today") renderToday(v);
  else if (S.tab === "trends") renderTrends(v);
  else if (S.tab === "group") renderGroup(v);
  else renderJournal(v);
}

/* ================= today ================= */
function renderToday(v) {
  const p = prof(), d = days()[S.date] || {}, t = target(p, d);
  const kcal = n(d.kcal) || 0, pro = n(d.protein) || 0, water = n(d.waterL) || 0, steps = n(d.steps);
  const left = t.kcal - kcal;
  const who = isMine() ? `${greet()}, ${esc(p?.name || "")}` : `${esc(p?.name || "Someone")}'s day`;
  v.innerHTML = `
  <section class="glass card">
    <div class="card-h"><div><p class="eyebrow">${S.date === TODAY() ? "Today" : esc(fmt(S.date, { weekday: "long", month: "long", day: "numeric" }))}</p><h1 class="display" style="margin-top:6px">${who}</h1></div>
      <span class="tag"><span class="d"></span>${esc(d.session || "Rest day")}</span></div>
    <div class="hero">
      <div class="bigring">${bigRing(kcal, t.kcal)}<div class="center"><div class="val">${kcal.toLocaleString()}</div><div class="of">of ${t.kcal.toLocaleString()} kcal</div><div class="left ${left < 0 ? "" : "grad-text"}" style="${left < 0 ? "color:var(--warn)" : ""}">${left >= 0 ? `${left.toLocaleString()} left` : `${(-left).toLocaleString()} over`}</div></div></div>
      <div class="metrics">
        ${metric("Protein", pro, " g", t.protein, pro >= t.protein ? "Target hit" : `${t.protein - pro} g to go`, "var(--a3)", "var(--a1)")}
        ${metric("Water", Math.round(water * 10) / 10, " L", t.water, water >= t.water ? "Target hit" : `${(t.water - water).toFixed(1)} L to go`, "#4aa8ff", "var(--a3)")}
        ${metric("Steps", steps == null ? null : steps.toLocaleString(), "", t.steps, steps == null ? "Not logged yet" : steps >= t.steps ? "Target hit" : `${(t.steps - steps).toLocaleString()} to go`, "var(--a4)", "#b8f36b")}
        ${metric("Weight", n(d.weight), " lb", 0, n(d.weight) ? "Morning weigh-in" : "Log your morning weight", "var(--a5)", "var(--a2)")}
      </div>
    </div>
    <div class="quick" ${isMine() ? "" : "hidden"}>
      <form class="qf" data-k="weight"><input type="number" step="0.1" inputmode="decimal" placeholder="Weight lb" aria-label="Morning weight in pounds"><button aria-label="Log weight">+</button></form>
      <form class="qf" data-k="steps"><input type="number" step="1" inputmode="numeric" placeholder="Steps" aria-label="Steps"><button aria-label="Log steps">+</button></form>
      <form class="qf" data-k="waterAdd"><input type="number" step="0.1" inputmode="decimal" placeholder="Water + L" aria-label="Add water in litres"><button aria-label="Add water">+</button></form>
      <form class="qf" data-k="sleep"><input type="number" step="0.25" inputmode="decimal" placeholder="Sleep h" aria-label="Sleep hours"><button aria-label="Log sleep">+</button></form>
    </div>
  </section>
  <div class="grid2">
    <section class="glass card">
      <div class="card-h"><h2 class="display">Coach</h2><span class="hint">${isMine() ? "Type, talk or snap a photo" : esc((p?.name || "Their") + "'s chat")}</span></div>
      <div class="thread" id="thread" aria-live="polite"></div>
      <div id="composer" ${isMine() ? "" : "hidden"} style="display:grid;gap:10px">
        <div class="chips" id="chips">
          <button data-q="How am I doing today? What should my next meal look like?">How's today?</button>
          <button data-q="Drank 500 ml of water">+500 ml water</button>
          <button data-q="Had a protein shake (1 scoop whey in water)">Protein shake</button>
        </div>
        <div class="attach" id="attach"></div>
        <div class="composer">
          <label class="circle cam" title="Add a photo or video">${svgI("cam")}<input type="file" id="c-files" accept="image/*,video/*" multiple hidden></label>
          <textarea id="c-text" rows="1" placeholder="Ate, lifted, weighed…" aria-label="Message your coach"></textarea>
          <button class="circle send" id="c-send" aria-label="Send" disabled>${svgI("send", 2.2)}</button>
        </div>
      </div>
    </section>
    <section class="glass card">
      <div class="card-h"><h2 class="display">Where you're headed</h2><span class="hint" id="mini-note"></span></div>
      <div id="mini-proj"></div>
      <div class="kpis" id="mini-kpis"></div>
    </section>
  </div>`;
  const pr = projection(p, days());
  $("mini-proj").innerHTML = projChart(pr, p, W("mini-proj", 440), 230);
  $("mini-note").textContent = pr.source === "trend" ? "From your last 3 weeks" : pr.source === "plan" ? "At plan pace" : "";
  $("mini-kpis").innerHTML =
    kpi("Now", pr.current != null ? `${pr.current.toFixed(1)}<small>lb</small>` : "–", "7-day average") +
    kpi("Goal date", pr.eta ? fmt(pr.eta, { month: "short", day: "numeric" }) : "–", pr.eta ? `${Math.max(0, diffDays(TODAY(), pr.eta))} days away` : "Log more weigh-ins") +
    kpi("Pace", pr.rateWk != null ? `${pr.rateWk > 0 ? "+" : ""}${pr.rateWk.toFixed(2)}<small>lb/wk</small>` : "–", pr.source === "trend" ? "Actual trend" : "Plan", pr.rateWk != null && pr.rateWk < 0 ? "good" : "");
  wireToday();
  renderThread();
}
function projChart(pr, p, w, h) {
  if (!pr.series.length && pr.current == null) return '<p class="empty">Log a morning weight to start the projection.</p>';
  const c = colorOf(p);
  const series = pr.series.length ? [{ pts: pr.series.map((q) => ({ ds: q.ds, v: q.avg, raw: q.v })), c1: "var(--a3)", c2: c, dots: true, area: true }] : [];
  let proj = null;
  if (pr.eta && pr.goal != null) {
    const fromDs = pr.series.at(-1)?.ds || TODAY();
    proj = { from: { ds: fromDs, v: pr.current }, to: { ds: pr.eta, v: pr.goal }, c, label: fmt(pr.eta, { month: "short", day: "numeric", year: "numeric" }), spread: Math.min(4, 0.25 * (diffDays(fromDs, pr.eta) / 7)) };
  }
  if (!series.length && proj) series.push({ pts: [{ ds: proj.from.ds, v: proj.from.v }], c1: c });
  return lineChart({ series, w, h, label: "Weight projection", goal: pr.goal, proj, todayDs: TODAY() });
}
function wireToday() {
  document.querySelectorAll(".qf").forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault(); if (!isMine()) return;
    const inp = f.querySelector("input"); const val = n(inp.value); if (val == null) return;
    const cur = { ...(days()[S.date] || {}) }; const k = f.dataset.k;
    if (k === "waterAdd") cur.waterL = Math.round(((n(cur.waterL) || 0) + val) * 100) / 100; else cur[k] = val;
    inp.value = "";
    try { await saveDay(S.date, cur); render(); toast(k === "waterAdd" ? `+${val} L water` : "Logged"); }
    catch { toast("Couldn't save. Check your connection."); inp.value = val; }
  }));
  const ta = $("c-text");
  if (!ta) return;
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; updateSend(); });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer:coarse)").matches) { e.preventDefault(); if (!$("c-send").disabled) send(); } });
  $("c-files").addEventListener("change", (e) => { for (const f of e.target.files) S.attach.push({ file: f, url: URL.createObjectURL(f) }); e.target.value = ""; renderAttach(); updateSend(); });
  $("c-send").onclick = () => send();
  $("chips").onclick = (e) => { const b = e.target.closest("button[data-q]"); if (!b || S.sending) return; ta.value = b.dataset.q; send(); };
  renderAttach(); updateSend();
}
function updateSend() { const b = $("c-send"); if (b) b.disabled = S.sending || !isMine() || (!$("c-text").value.trim() && !S.attach.length); }
function renderAttach() {
  const box = $("attach"); if (!box) return;
  box.innerHTML = S.attach.map((a, i) => `<div class="thumb">${a.file.type.startsWith("image") ? `<img src="${a.url}" alt="">` : "Video"}<button data-i="${i}" aria-label="Remove">×</button></div>`).join("");
  box.querySelectorAll("button").forEach((b) => (b.onclick = () => { URL.revokeObjectURL(S.attach[+b.dataset.i].url); S.attach.splice(+b.dataset.i, 1); renderAttach(); updateSend(); }));
}
async function renderThread() {
  const t = $("thread"); if (!t) return;
  const msgs = [...S.chats, ...(S.live || [])];
  if (!msgs.length) { t.innerHTML = `<p class="empty">${isMine() ? (S.date === TODAY() ? "Tell me what you ate, how you trained, your weight, steps or water. Snap a meal or a nutrition label and I'll do the math and log it." : "Nothing in the chat for this day.") : "No chat for this day."}</p>`; return; }
  t.innerHTML = msgs.map((m, i) => `<div class="msg ${m.role === "user" ? "me" : "coach"}" data-i="${i}">${(m.media || []).map((a, j) => `<span data-m="${j}"></span>`).join("")}${m.pending ? '<span class="typing"><i></i><i></i><i></i></span>' : esc(m.text || "")}${m.logged ? `<span class="logged"><span>✓</span><span>${esc(m.logged)}</span></span>` : ""}</div>`).join("");
  t.scrollTop = t.scrollHeight;
  for (const [i, m] of msgs.entries()) for (const [j, a] of (m.media || []).entries()) {
    const slot = t.querySelector(`.msg[data-i="${i}"] [data-m="${j}"]`); if (!slot) continue;
    const src = a.url || (a.path ? await signedUrl(a.path) : ""); if (!src) continue;
    const el = a.kind === "video" ? Object.assign(document.createElement("video"), { src, controls: true, playsInline: true, preload: "metadata" }) : Object.assign(document.createElement("img"), { src, alt: "Photo" });
    slot.replaceWith(el);
  }
  t.scrollTop = t.scrollHeight;
}
async function compress(file) {
  if (!file.type.startsWith("image") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.84));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}
async function send() {
  if (S.sending || !isMine()) return;
  const ta = $("c-text"); const text = ta.value.trim(); const items = S.attach.slice();
  if (!text && !items.length) return;
  const ds = S.date;
  S.sending = true; updateSend(); ta.value = ""; ta.style.height = "auto"; S.attach = []; renderAttach();
  const userMsg = { role: "user", text, media: items.map((a) => ({ kind: a.file.type.startsWith("video") ? "video" : "image", url: a.url })) };
  S.live = [userMsg, { role: "coach", pending: true }]; renderThread();
  try {
    const media = [];
    for (const a of items) {
      const kind = a.file.type.startsWith("video") ? "video" : "image";
      if (kind === "video" && a.file.size > 25 * 1024 * 1024) throw new Error("That video is over 25 MB. Trim it and try again.");
      const f = await compress(a.file);
      const ext = (f.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${S.me}/${ds}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("media").upload(path, f, { contentType: f.type || undefined });
      if (error) throw new Error("Couldn't upload that file. Try again.");
      media.push({ path, kind, type: f.type });
    }
    const out = await fn("coach", { text, date: ds, timeNow: ds === TODAY() ? nowHM() : "", media });
    S.daysBy[S.me] = { ...(S.daysBy[S.me] || {}), [ds]: out.day };
    if (S.date === ds) S.chats = out.messages;
    S.live = null; render();
  } catch (e) {
    S.live = [userMsg, { role: "coach", text: e.message || "Couldn't reach the coach. Try again." }]; renderThread();
    ta.value = text;
  } finally { S.sending = false; updateSend(); }
}

/* ================= trends ================= */
function renderTrends(v) {
  const p = prof(), dm = days(), pr = projection(p, dm);
  v.innerHTML = `
  <section class="glass card">
    <div class="card-h"><div><p class="eyebrow">Projection</p><h1 class="display" style="margin-top:6px">${pr.eta && pr.goal != null ? `<span class="grad-text">${pr.goal} lb</span> by ${esc(fmt(pr.eta, { month: "long", day: "numeric" }))}` : "Weight trend"}</h1></div><span class="hint">${pr.source === "trend" ? "Projected from the last 3 weeks of weigh-ins" : pr.source === "plan" ? "Plan pace until there are 2+ weeks of weigh-ins" : ""}</span></div>
    <div id="proj"></div>
    <div class="kpis" id="pk"></div>
  </section>
  <div class="grid2">
    <section class="glass card"><div class="card-h"><h3>Calories vs target</h3><span class="hint">14 days</span></div><div id="ch-k"></div></section>
    <section class="glass card"><div class="card-h"><h3>Protein</h3><span class="hint">14 days</span></div><div id="ch-p"></div></section>
    <section class="glass card"><div class="card-h"><h3>Steps</h3><span class="hint">14 days</span></div><div id="ch-s"></div></section>
    <section class="glass card"><div class="card-h"><h3>Strength</h3><span class="hint">Estimated 1-rep max</span></div><div id="ch-st"></div></section>
  </div>
  <div class="kpis" id="streaks"></div>`;
  $("proj").innerHTML = projChart(pr, p, W("proj", 760), 300);
  const start = n(p?.startWeight), lost = start != null && pr.current != null ? start - pr.current : null;
  const toGo = pr.goal != null && pr.current != null ? pr.current - pr.goal : null;
  const pct = start != null && pr.goal != null && lost != null && start !== pr.goal ? Math.max(0, Math.min(100, (lost / (start - pr.goal)) * 100)) : null;
  $("pk").innerHTML =
    kpi("Start", start != null ? `${start}<small>lb</small>` : "–", p?.createdAt ? "Since " + short(String(p.createdAt).slice(0, 10)) : "") +
    kpi("Now", pr.current != null ? `${pr.current.toFixed(1)}<small>lb</small>` : "–", "7-day average") +
    kpi("Change", lost != null ? `${lost > 0 ? "−" : "+"}${Math.abs(lost).toFixed(1)}<small>lb</small>` : "–", pct != null ? `${Math.round(pct)}% of the way` : "", lost > 0 ? "good" : "") +
    kpi("To go", toGo != null ? `${Math.abs(toGo).toFixed(1)}<small>lb</small>` : "–", pr.goal != null ? `Goal ${pr.goal} lb` : "") +
    kpi("Pace", pr.rateWk != null ? `${pr.rateWk > 0 ? "+" : ""}${pr.rateWk.toFixed(2)}<small>lb/wk</small>` : "–", "Healthy: 0.5–1.0 down");
  const dates = Array.from({ length: 14 }, (_, i) => addDays(TODAY(), i - 13));
  const tg = (ds, k) => (dm[ds] ? target(p, dm[ds])[k] : null);
  $("ch-k").innerHTML = barChart({ w: W("ch-k", 420), dates, values: dates.map((ds) => n(dm[ds]?.kcal)), targets: dates.map((ds) => tg(ds, "kcal")), label: "Calories", good: "under", c1: "#8b7bff", c2: "#ff6fb1" });
  $("ch-p").innerHTML = barChart({ w: W("ch-p", 420), dates, values: dates.map((ds) => n(dm[ds]?.protein)), targets: dates.map((ds) => tg(ds, "protein")), label: "Protein", good: "over", c1: "#8b7bff", c2: "#3fd8ff" });
  $("ch-s").innerHTML = barChart({ w: W("ch-s", 420), dates, values: dates.map((ds) => n(dm[ds]?.steps)), targets: dates.map((ds) => tg(ds, "steps")), label: "Steps", good: "over", c1: "#46e3a6", c2: "#b8f36b" });
  const lifts = [["bench", "Bench", "#8b7bff", "#ff6fb1"], ["squat", "Squat", "#3fd8ff", "#46e3a6"], ["deadlift", "Deadlift", "#ffc35c", "#ff6fb1"]];
  const ls = lifts.map(([k, lab, c1, c2]) => ({ pts: Object.keys(dm).sort().map((ds) => ({ ds, v: e1rm(dm[ds][k]) })).filter((q) => q.v), c1, c2, endLabel: lab })).filter((s) => s.pts.length);
  $("ch-st").innerHTML = ls.length ? lineChart({ series: ls, w: W("ch-st", 420), h: 220, label: "Estimated 1RM" }) + `<div class="legend">${ls.map((s) => `<span><i style="--c:linear-gradient(90deg,${s.c1},${s.c2})"></i>${s.endLabel} ${Math.round(s.pts.at(-1).v)} lb</span>`).join("")}</div>` : '<p class="empty">Tell the coach your top sets, like “bench 185 x 5”, and your strength curve appears here.</p>';
  const t = (d) => target(p, d);
  $("streaks").innerHTML =
    kpi("Logging streak", `${streak(dm, () => true)}<small>days</small>`, "Days in a row") +
    kpi("Protein streak", `${streak(dm, (d) => n(d.protein) >= t(d).protein * 0.95)}<small>days</small>`, "Hit protein") +
    kpi("Kitchen closed", `${streak(dm, (d) => !d.lateSnack)}<small>days</small>`, "No late snacks") +
    kpi("Steps streak", `${streak(dm, (d) => n(d.steps) >= t(d).steps)}<small>days</small>`, "Hit step target");
}

/* ================= group ================= */
const weekDates = (off) => { const base = parse(TODAY()); base.setDate(base.getDate() + off * 7); const dow = (base.getDay() + 6) % 7; base.setDate(base.getDate() - dow); return Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return localISO(d); }); };
function renderGroup(v) {
  const ids = Object.keys(S.people);
  const rows = ids.map((id) => { const p = S.people[id], pr = projection(p, S.daysBy[id] || {}); const start = n(p.startWeight); const done = start != null && pr.goal != null && pr.current != null && start !== pr.goal ? Math.max(0, Math.min(1, (start - pr.current) / (start - pr.goal))) : 0; return { id, p, pr, done }; }).sort((a, b) => b.done - a.done);
  const wk = weekDates(0);
  v.innerHTML = `
  <section class="glass card">
    <div class="card-h"><div><p class="eyebrow">The race</p><h1 class="display" style="margin-top:6px">Progress to goal</h1></div><span class="hint">7-day average weight</span></div>
    <div style="display:grid;gap:10px">${rows.map(({ id, p, pr, done }) => `<div class="racer" data-id="${id}" style="--c:${colorOf(p)}"><span class="dot">${esc(initial(p))}</span><div style="min-width:0"><div><b>${esc(p.name || "Someone")}</b> <span class="meta">${pr.current != null ? `${pr.current.toFixed(1)} → ${pr.goal ?? "?"} lb` : "No weigh-ins yet"}</span></div><div class="track"><i style="width:${Math.round(done * 100)}%"></i></div></div><div class="right"><b>${Math.round(done * 100)}%</b>${pr.eta ? "ETA " + esc(fmt(pr.eta, { month: "short", day: "numeric" })) : "—"}</div></div>`).join("") || '<p class="empty">Nobody here yet.</p>'}</div>
  </section>
  <section class="glass card"><div class="card-h"><h3>Weight change, side by side</h3><span class="hint">% from each person's start</span></div><div id="race"></div></section>
  <section class="glass card"><div class="card-h"><h3>This week</h3><span class="hint">${short(wk[0])} – ${short(wk[6])}</span></div>
    <div class="tablebox"><table><thead><tr><th>Person</th><th>Logged</th><th>Avg kcal</th><th>Avg protein</th><th>Avg steps</th><th>Sessions</th><th>Change</th></tr></thead><tbody>
    ${ids.map((id) => { const p = S.people[id], dm = S.daysBy[id] || {}; const ds = wk.filter((x) => dm[x]); const k = ds.map((x) => n(dm[x].kcal)).filter((x) => x != null), pr = ds.map((x) => n(dm[x].protein)).filter((x) => x != null), st = ds.map((x) => n(dm[x].steps)).filter((x) => x != null); const ses = ds.filter((x) => dm[x].session).length; const ws = weightSeries(dm); const inWk = ws.filter((q) => q.ds >= wk[0] && q.ds <= wk[6]); const prev = ws.filter((q) => q.ds < wk[0]).at(-1); const ch = inWk.length && prev ? inWk.at(-1).avg - prev.avg : null;
      return `<tr><td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${colorOf(p)};margin-right:9px;box-shadow:0 0 10px ${colorOf(p)}"></span>${esc(p.name || "Someone")}</td><td>${ds.length}/7</td><td>${k.length ? Math.round(avg(k)).toLocaleString() : "–"}</td><td>${pr.length ? Math.round(avg(pr)) + " g" : "–"}</td><td>${st.length ? Math.round(avg(st)).toLocaleString() : "–"}</td><td>${ses}</td><td class="${ch == null ? "" : ch <= 0 ? "good" : "off"}">${ch == null ? "–" : (ch > 0 ? "+" : "") + ch.toFixed(1) + " lb"}</td></tr>`; }).join("")}
    </tbody></table></div></section>
  <section class="glass card" id="invite-card" ${S.status?.isOwner ? "" : "hidden"}>
    <div class="card-h"><h3>Invite people</h3><span class="hint">Only you see this</span></div>
    <div class="invite"><div><p class="eyebrow">Invite code</p><div class="code" id="code">${esc(S.status?.inviteCode || "")}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" id="copy-invite">Copy invite</button><button class="btn ghost" id="new-code">New code</button></div></div>
    <p class="hint">Send them the app link and this code. They create an account, enter the code, and set up their profile. A new code stops the old one working for new sign-ups.</p>
  </section>`;
  v.querySelectorAll(".racer").forEach((r) => (r.onclick = async () => { await selectPerson(r.dataset.id); setTab("trends"); }));
  const series = ids.map((id) => { const p = S.people[id]; const s = weightSeries(S.daysBy[id] || {}); const base = n(p.startWeight) || s[0]?.avg; if (!s.length || !base) return null; return { pts: s.map((q) => ({ ds: q.ds, v: ((q.avg - base) / base) * 100 })), c1: colorOf(p), endLabel: p.name || "" }; }).filter(Boolean);
  $("race").innerHTML = series.length ? lineChart({ series, w: W("race", 760), h: 260, label: "% change", yFmt: (x) => (x > 0 ? "+" : "") + x.toFixed(1) + "%" }) : '<p class="empty">Lines appear once people log morning weights.</p>';
  const cp = $("copy-invite");
  if (cp) {
    cp.onclick = async () => { const txt = `Join my Training Log: ${location.origin}${location.pathname}\nInvite code: ${S.status.inviteCode}`; try { await navigator.clipboard.writeText(txt); toast("Invite copied"); } catch { toast("Copy the link and code above"); } };
    $("new-code").onclick = async () => { try { const r = await fn("join", { action: "new-code" }); S.status.inviteCode = r.inviteCode; $("code").textContent = r.inviteCode; toast("New code made"); } catch (e) { toast(e.message); } };
  }
}

/* ================= journal ================= */
const FIELDS = { weight: "f-weight", waist: "f-waist", sleep: "f-sleep", steps: "f-steps", waterL: "f-water", kcal: "f-kcal", protein: "f-protein", firstMeal: "f-first", lastMeal: "f-last", food: "f-food", session: "f-session", runKm: "f-km", runMin: "f-min", bench: "f-bench", squat: "f-squat", deadlift: "f-dead", pullups: "f-pull", notes: "f-notes" };
const NUMERIC = new Set(["weight", "waist", "sleep", "steps", "waterL", "kcal", "protein", "runKm", "runMin"]);
function renderJournal(v) {
  const p = prof(), dm = days(), dates = weekDates(S.weekOffset);
  v.innerHTML = `
  <section class="glass card">
    <div class="card-h"><div><p class="eyebrow">${isMine() ? "Your week" : esc((p?.name || "") + "'s week")}</p><h2 class="display" style="margin-top:6px">${short(dates[0])} – ${esc(fmt(dates[6], { month: "short", day: "numeric" }))}</h2></div>
      <div style="display:flex;gap:6px"><button class="iconbtn glass" id="w-prev" aria-label="Previous week">${svgI("left", 2)}</button><button class="iconbtn glass" id="w-next" aria-label="Next week" ${S.weekOffset >= 0 ? "disabled" : ""}>${svgI("right", 2)}</button></div></div>
    <div class="tablebox"><table><thead><tr><th>Day</th><th>Session</th><th>Weight</th><th>Kcal</th><th>Protein</th><th>Water</th><th>Steps</th><th>Sleep</th><th>Late snack</th></tr></thead><tbody>
    ${dates.map((ds) => { const d = dm[ds]; const day = esc(fmt(ds, { weekday: "short", day: "numeric" })); if (!d) return `<tr><td>${day}</td><td colspan="8" style="text-align:left;color:var(--faint);font-family:var(--body)">Not logged</td></tr>`; const t = target(p, d); const cls = (x, ok) => (x == null ? "" : ok ? "good" : "off"); const kv = n(d.kcal), pv = n(d.protein), sv = n(d.steps), wv = n(d.waterL);
      return `<tr><td>${day}</td><td><span class="sess">${esc(d.session || "Rest")}</span></td><td>${n(d.weight) ?? "–"}</td><td class="${cls(kv, kv != null && kv <= t.kcal * 1.05)}">${kv?.toLocaleString() ?? "–"}</td><td class="${cls(pv, pv >= t.protein * 0.95)}">${pv != null ? pv + " g" : "–"}</td><td class="${cls(wv, wv >= t.water)}">${wv != null ? wv + " L" : "–"}</td><td class="${cls(sv, sv >= t.steps)}">${sv?.toLocaleString() ?? "–"}</td><td>${n(d.sleep) ?? "–"}</td><td>${d.lateSnack ? "Yes" : "No"}</td></tr>`; }).join("")}
    </tbody></table></div>
  </section>
  <section class="glass card"><h2 class="display">Coach reviews</h2><div id="reviews" style="display:grid;gap:12px">${S.reviews.length ? S.reviews.map((r) => `<article class="review"><p class="eyebrow">${r.kind === "month" ? "Monthly" : "Weekly"} · ${esc(fmt(r.day, { month: "short", day: "numeric", year: "numeric" }))}</p><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p></article>`).join("") : '<p class="empty">Reviews arrive every Sunday evening and on the 1st of each month.</p>'}</div></section>
  <section class="glass card"><h2 class="display">Photos and videos</h2><div class="media" id="media"></div></section>
  <details class="glass card" id="manual" ${isMine() ? "" : "hidden"}>
    <summary>Edit ${esc(fmt(S.date, { weekday: "long", month: "short", day: "numeric" }))} by hand</summary>
    <form id="log" autocomplete="off" style="display:grid;gap:14px">
      <div class="fgrid">
        <label>Weight (lb)<input id="f-weight" type="number" step="0.1"></label><label>Waist (in)<input id="f-waist" type="number" step="0.1"></label>
        <label>Sleep (h)<input id="f-sleep" type="number" step="0.25"></label><label>Steps<input id="f-steps" type="number" step="1"></label>
        <label>Water (L)<input id="f-water" type="number" step="0.1"></label><label>Calories<input id="f-kcal" type="number" step="10"></label>
        <label>Protein (g)<input id="f-protein" type="number" step="1"></label><label>First meal<input id="f-first" type="time"></label><label>Last meal<input id="f-last" type="time"></label>
      </div>
      <label class="check"><input type="checkbox" id="f-late"> Snacked after the window closed</label>
      <label>What I ate<textarea id="f-food" rows="4"></textarea></label>
      <div class="fgrid">
        <label>Session<select id="f-session"><option value="">Rest</option>${SESSIONS.map((s) => `<option>${s}</option>`).join("")}</select></label>
        <label>Run (km)<input id="f-km" type="number" step="0.1"></label><label>Run (min)<input id="f-min" type="number" step="1"></label>
        <label>Bench top set<input id="f-bench" placeholder="185 x 5"></label><label>Squat top set<input id="f-squat" placeholder="205 x 6"></label>
        <label>Deadlift top set<input id="f-dead" placeholder="225 x 5"></label><label>Pull-ups<input id="f-pull" placeholder="3, 3, 2"></label>
      </div>
      <label>Notes<textarea id="f-notes" rows="3"></textarea></label>
      <div class="row-end"><span class="status" id="status" role="status"></span><button class="btn" id="save">Save day</button></div>
    </form>
  </details>`;
  $("w-prev").onclick = () => { S.weekOffset--; render(); };
  $("w-next").onclick = () => { if (S.weekOffset < 0) { S.weekOffset++; render(); } };
  const d = dm[S.date] || {};
  for (const [k, id] of Object.entries(FIELDS)) $(id).value = d[k] ?? "";
  $("f-late").checked = !!d.lateSnack;
  $("log").onsubmit = async (e) => {
    e.preventDefault(); if (!isMine()) return;
    const doc = { ...(days()[S.date] || {}), lateSnack: $("f-late").checked };
    for (const [k, id] of Object.entries(FIELDS)) { const val = $(id).value.trim(); doc[k] = NUMERIC.has(k) ? (val === "" ? null : +val) : val; }
    $("save").disabled = true; $("status").textContent = "Saving…";
    try { await saveDay(S.date, doc); $("status").textContent = "Saved."; } catch { $("status").textContent = "Couldn't save. Try again."; }
    finally { $("save").disabled = false; }
  };
  (async () => {
    const all = []; Object.keys(dm).sort().reverse().forEach((ds) => (dm[ds].media || []).forEach((m) => all.push({ ...m, ds })));
    const box = $("media"); if (!box) return;
    if (!all.length) { box.innerHTML = '<p class="empty">Progress photos and form videos you send the coach land here.</p>'; return; }
    box.innerHTML = all.map((m, i) => `<figure data-i="${i}"><span></span><figcaption>${esc(short(m.ds))}</figcaption></figure>`).join("");
    for (const [i, m] of all.entries()) {
      const src = await signedUrl(m.path); const slot = box.querySelector(`figure[data-i="${i}"] span`); if (!slot || !src) continue;
      slot.replaceWith(m.kind === "video" ? Object.assign(document.createElement("video"), { src, controls: true, playsInline: true, preload: "metadata" }) : Object.assign(document.createElement("img"), { src, alt: "Progress photo " + m.ds, loading: "lazy" }));
    }
  })();
}

/* ================= profile / onboarding ================= */
function renderProfileForm(existing) {
  const st = S.status || {};
  const base = existing || { name: "", kcalTrain: 2000, kcalRest: 1750, protein: 140, waterL: 2.75, steps: 8000, color: Object.keys(S.people).length % PCOL.length, notes: "" };
  const host = existing ? $("view") : app;
  if (existing) { S.tab = "profile"; document.querySelectorAll(".dock button").forEach((b) => b.setAttribute("aria-selected", "false")); }
  const html = `
  <section class="glass card" style="${existing ? "" : "width:min(640px,100%);margin:0 auto"}">
    <div><p class="eyebrow">${existing ? "Profile" : "Welcome"}</p><h1 class="display" style="margin-top:6px">${existing ? "Your targets" : "Let's set you up"}</h1></div>
    <p class="muted" style="margin:0">Your coach uses this to set targets and give advice. Everyone in the group can see each other's logs and progress.</p>
    <form id="pf" autocomplete="off" style="display:grid;gap:16px">
      ${!existing && st.needsInvite ? `<label>Invite code<input id="pf-code" type="text" required autocapitalize="characters" placeholder="e.g. PEAK-IRON-4821" style="text-transform:uppercase;letter-spacing:.06em"></label>` : ""}
      <div class="fgrid">
        <label>Name<input id="pf-name" type="text" required maxlength="24" value="${esc(base.name || "")}"></label>
        <label>Current weight (lb)<input id="pf-start" type="number" step="0.1" required value="${base.startWeight ?? ""}"></label>
        <label>Goal weight (lb)<input id="pf-goal" type="number" step="0.1" required value="${base.goalWeight ?? ""}"></label>
        <label>Height (in)<input id="pf-height" type="number" step="0.5" value="${base.heightIn ?? ""}"></label>
      </div>
      <div class="fgrid">
        <label>Calories, training day<input id="pf-kt" type="number" step="10" required value="${base.kcalTrain ?? ""}"></label>
        <label>Calories, rest day<input id="pf-kr" type="number" step="10" required value="${base.kcalRest ?? ""}"></label>
        <label>Protein (g)<input id="pf-pro" type="number" step="5" required value="${base.protein ?? ""}"></label>
        <label>Water (L)<input id="pf-water" type="number" step="0.25" required value="${base.waterL ?? ""}"></label>
        <label>Steps<input id="pf-steps" type="number" step="500" required value="${base.steps ?? ""}"></label>
      </div>
      <label>What your coach should know: goals, allergies, injuries, schedule<textarea id="pf-notes" rows="5">${esc(base.notes || "")}</textarea></label>
      <div><p class="eyebrow" style="margin-bottom:10px">Your colour</p><div class="swatches">${PCOL.map((c, i) => `<label><input type="radio" name="pf-color" value="${i}" ${i === (base.color || 0) ? "checked" : ""} aria-label="Colour ${i + 1}"><span style="--c:${c}"></span></label>`).join("")}</div></div>
      ${st.canImport ? `<label>Bring over your old log (optional)<input id="pf-import" type="file" accept="application/json,.json"></label><p class="hint" style="margin-top:-8px">Pick the training-log-import.json file Claude sent you. It fills in this form and brings over your log.</p>` : ""}
      <div class="row-end"><span class="status" id="pf-status" role="status"></span><div style="display:flex;gap:8px">${existing ? '<button type="button" class="btn ghost" id="pf-cancel">Cancel</button>' : ""}<button class="btn" id="pf-save">${existing ? "Save changes" : "Start"}</button></div></div>
    </form>
  </section>`;
  if (existing) host.innerHTML = html;
  else host.innerHTML = `<div class="shell" style="padding-bottom:40px"><header class="topbar"><div class="brand"><span class="mark"></span>Training Log</div><button class="btn ghost" id="pf-out">Sign out</button></header>${html}</div>`;
  $("pf-out")?.addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
  $("pf-import")?.addEventListener("change", async (e) => {
    try {
      const lp = JSON.parse(await e.target.files[0].text()).profile; if (!lp) return;
      const set = (id, v) => { if (v != null && $(id)) $(id).value = v; };
      set("pf-name", lp.name); set("pf-start", lp.startWeight); set("pf-goal", lp.goalWeight); set("pf-height", lp.heightIn);
      set("pf-kt", lp.kcalTrain); set("pf-kr", lp.kcalRest); set("pf-pro", lp.protein); set("pf-water", lp.waterL); set("pf-steps", lp.steps); set("pf-notes", lp.notes);
      $("pf-status").textContent = "Filled in from your old log.";
    } catch { $("pf-status").textContent = "That file couldn't be read."; }
  });
  $("pf-cancel")?.addEventListener("click", () => setTab("today"));
  $("pf").onsubmit = async (e) => {
    e.preventDefault();
    const profile = { name: $("pf-name").value.trim(), startWeight: n($("pf-start").value), goalWeight: n($("pf-goal").value), heightIn: n($("pf-height").value), kcalTrain: n($("pf-kt").value), kcalRest: n($("pf-kr").value), protein: n($("pf-pro").value), waterL: n($("pf-water").value), steps: n($("pf-steps").value), notes: $("pf-notes").value.trim(), color: +(document.querySelector("input[name=pf-color]:checked")?.value || 0) };
    const status = $("pf-status"); status.className = "status"; status.textContent = "Saving…"; $("pf-save").disabled = true;
    try {
      await fn("join", { action: "save", profile, inviteCode: $("pf-code")?.value || "" });
      const file = $("pf-import")?.files?.[0];
      if (file) { status.textContent = "Bringing over your log…"; await fn("join", { action: "import", legacy: JSON.parse(await file.text()) }); }
      await boot(true);
      if (existing) toast("Profile saved");
    } catch (err) { status.className = "status err"; status.textContent = err.message || "Couldn't save."; $("pf-save").disabled = false; }
  };
}

/* ================= auth ================= */
function renderAuth(mode = "in", note = "") {
  app.innerHTML = `
  <div class="auth"><section class="glass card">
    <div style="display:grid;gap:14px;justify-items:start"><span class="mark" style="width:44px;height:44px;border-radius:14px" aria-hidden="true"></span>
      <h1 class="display">Training <span class="grad-text">Log</span></h1>
      <p class="muted" style="margin:0">Your AI coach for food, training and progress. Log it by talking, typing or snapping a photo.</p></div>
    ${mode === "reset" ? "" : `<div class="seg" role="tablist"><button role="tab" data-m="in" aria-selected="${mode === "in"}">Sign in</button><button role="tab" data-m="up" aria-selected="${mode === "up"}">Create account</button></div>`}
    <form id="af" style="display:grid;gap:12px" autocomplete="on">
      ${mode === "reset" ? `<label>New password<input id="a-pass" type="password" required minlength="8" autocomplete="new-password"></label>` : `
      <label>Email<input id="a-email" type="email" required autocomplete="email"></label>
      <label>Password<input id="a-pass" type="password" required minlength="8" autocomplete="${mode === "up" ? "new-password" : "current-password"}"></label>`}
      <button class="btn" id="a-go" style="margin-top:4px">${mode === "reset" ? "Set new password" : mode === "up" ? "Create account" : "Sign in"}</button>
      <div class="row-end"><span class="status" id="a-status" role="status">${esc(note)}</span>${mode === "in" ? '<button type="button" class="linkbtn" id="a-forgot">Forgot password?</button>' : ""}</div>
    </form>
    ${mode === "up" ? '<p class="hint">You\'ll need an invite code from the group owner after signing up.</p>' : ""}
  </section></div>`;
  app.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => renderAuth(b.dataset.m)));
  const status = $("a-status");
  $("a-forgot")?.addEventListener("click", async () => {
    const email = $("a-email").value.trim(); if (!email) { status.textContent = "Enter your email first."; return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    status.textContent = "Check your email for a reset link.";
  });
  $("af").onsubmit = async (e) => {
    e.preventDefault(); status.className = "status"; status.textContent = "…"; $("a-go").disabled = true;
    try {
      if (mode === "reset") { const { error } = await sb.auth.updateUser({ password: $("a-pass").value }); if (error) throw error; await boot(true); return; }
      const email = $("a-email").value.trim(), password = $("a-pass").value;
      if (mode === "up") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) { status.textContent = "Check your email to confirm, then sign in."; $("a-go").disabled = false; return; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error;
      }
      await boot(true);
    } catch (err) { status.className = "status err"; status.textContent = /Invalid login/i.test(err.message) ? "Email or password is wrong." : err.message; $("a-go").disabled = false; }
  };
}

/* ================= boot ================= */
async function refresh() { await loadGroup(); await Promise.all([loadChats(), loadReviews()]); render(); }
async function boot(force = false) {
  if (!sb) { app.innerHTML = `<div class="auth"><section class="glass card"><h1 class="display">Almost there</h1><p class="muted">This build has no backend connection yet. It's set up automatically once the Supabase secrets are added to GitHub.</p></section></div>`; return; }
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  if (!S.session) { renderAuth("in"); return; }
  S.me = S.session.user.id;
  try { S.status = await fn("join", { action: "status" }); }
  catch (e) { app.innerHTML = `<div class="auth"><section class="glass card"><h1 class="display">Can't connect</h1><p class="muted">${esc(e.message)}</p><button class="btn" onclick="location.reload()">Try again</button></section></div>`; return; }
  if (!S.status.hasProfile) { renderProfileForm(null); return; }
  S.viewId = S.viewId && S.viewId !== S.me && !force ? S.viewId : S.me;
  renderShell();
  await loadGroup(); render();
  await Promise.all([loadChats(), loadReviews()]); render();
}

let resizeT;
addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.people[S.me] && ["today", "trends", "group"].includes(S.tab)) render(); }, 200); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.people[S.me] && !S.sending) { if (S.date !== TODAY() && S.date === addDays(TODAY(), -1)) S.date = TODAY(); refresh().catch(() => {}); } });
sb?.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") renderAuth("reset"); });
boot();
