import { analyseHistory } from "./consistency.ts";
import { buildTrail } from "./trail.ts";
import { deleteSessionHistory, loadHistory, retainSession, type HistoryBackend } from "./history-core.ts";
import { recorderBench, syntheticRecord, syntheticSession } from "./selftest.ts";
import type { DiagSummary } from "./diagnostics.ts";

/**
 * The on-phone readiness test: everything that can be measured in the browser on the phone itself, with the limits of what a browser can see
 * said plainly. Criteria are registered in training/eval/experiments/iphone-readiness/criteria.json BEFORE any phone result exists; they are
 * copied here and a test keeps the two in step. Nothing here is uploaded. It works in a throwaway area of the history store, never real history.
 */
export const PHONE_CRITERIA = {
  save250Ms: 1000,
  list1000Ms: 3000,
  analyse250Ms: 3000,
  renderPerShotMs: 50,
  recorderP99Us: 500,
  stressSlowdown: 2.0,
  loopWorkIncreaseMs: 2,
  fpsDrop: 1,
  batteryExtraPointsPer15Min: 2,
} as const;

export type Verdict = "pass" | "pass_synthetic" | "fail" | "not_measured";
export type Check = { id: string; label: string; verdict: Verdict; value: string; limit: string };

export type PhoneReport = {
  v: 1;
  at: string;
  userAgent: string;
  /** What this browser can and cannot report; nothing here is guessed. */
  capabilities: { persistApi: boolean; heapApi: boolean; batteryApi: boolean; standalone: boolean; deviceMemoryGB: number | null; cores: number | null };
  persistence: { persistedBefore: boolean | null; persistGranted: boolean | null; marker: { createdAt: number; ageHours: number } | null };
  storage: { usage: number | null; quota: number | null };
  sizes: { shots: number; save_ms: number; load_ms: number; analyse_ms: number; delete_ms: number; kb: number }[];
  list1000: { shots: number; load_ms: number } | null;
  render: { shots: number; per_shot_ms_median: number; per_shot_ms_p95: number; compare_draw_ms: number } | null;
  recorder: { frames: number; median_us: number; p99_us: number };
  stress: { rounds_ms: number[]; slowdown: number; failed: string | null } | null;
  heapMB: { start: number | null; end: number | null };
  battery: { start: number | null; end: number | null; charging: boolean | null };
  pageReloadedDuringRun: boolean;
  totalMs: number;
};

const RUN_KEY = "hl:phonetest:running";
export const MARKER_KEY = "hl:phonetest:marker";
const P = "phonetest";

const heap = () => { const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory; return m ? +(m.usedJSHeapSize / 1e6).toFixed(1) : null; };
const pct = (a: number[], f: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };

async function battery(): Promise<{ level: number | null; charging: boolean | null }> {
  try {
    const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> };
    if (!nav.getBattery) return { level: null, charging: null };
    const b = await nav.getBattery();
    return { level: Math.round(b.level * 100), charging: b.charging };
  } catch { return { level: null, charging: null }; }
}

export async function persistenceStatus(ask: boolean): Promise<PhoneReport["persistence"]> {
  const out: PhoneReport["persistence"] = { persistedBefore: null, persistGranted: null, marker: null };
  try { out.persistedBefore = (await navigator.storage?.persisted?.()) ?? null; } catch { /* unsupported */ }
  if (ask) { try { out.persistGranted = (await navigator.storage?.persist?.()) ?? null; } catch { /* unsupported */ } }
  try {
    const raw = window.localStorage.getItem(MARKER_KEY);
    if (!raw) window.localStorage.setItem(MARKER_KEY, JSON.stringify({ createdAt: Date.now() }));
    const m = JSON.parse(raw ?? window.localStorage.getItem(MARKER_KEY) ?? "null");
    if (m && typeof m.createdAt === "number") out.marker = { createdAt: m.createdAt, ageHours: +((Date.now() - m.createdAt) / 3_600_000).toFixed(2) };
  } catch { /* storage unavailable */ }
  return out;
}

function drawTrail(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], rim: { x: number; y: number }) {
  ctx.clearRect(0, 0, 416, 416);
  ctx.strokeStyle = "#888"; ctx.lineWidth = 1;
  for (let g = 0; g <= 416; g += 52) { ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, 416); ctx.moveTo(0, g); ctx.lineTo(416, g); ctx.stroke(); }
  ctx.strokeStyle = "#e66"; ctx.lineWidth = 2; ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.fillStyle = "#e66"; for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.283); ctx.fill(); }
  ctx.strokeStyle = "#fa0"; ctx.beginPath(); ctx.arc(rim.x, rim.y, 12, 0, 6.283); ctx.stroke();
}

/** Time to build the trail for a shot and draw it (the work of opening a shot in Session review), and to draw a 10-shot comparison. */
export function renderBench(n: number): PhoneReport["render"] {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas"); cv.width = cv.height = 416;
  const ctx = cv.getContext("2d"); if (!ctx) return null;
  let seed = 11; const r = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const times: number[] = [], paths: { x: number; y: number }[][] = [];
  for (let i = 0; i < n; i += 1) {
    const rec = syntheticRecord(`${P}-${i}`, r);
    const t0 = performance.now();
    const trail = buildTrail(rec);
    const pts = trail.segments.flat().map((p) => ({ x: p.x, y: p.y }));
    drawTrail(ctx, pts, rec.rim);
    times.push(performance.now() - t0);
    if (paths.length < 10) paths.push(pts);
  }
  const c2 = document.createElement("canvas"); c2.width = 360; c2.height = 300;
  const x2 = c2.getContext("2d");
  const t1 = performance.now();
  if (x2) for (const p of paths) { x2.strokeStyle = "#e66"; x2.beginPath(); p.forEach((q, i) => (i ? x2.lineTo(q.x * 0.8, q.y * 0.7) : x2.moveTo(q.x * 0.8, q.y * 0.7))); x2.stroke(); }
  return { shots: n, per_shot_ms_median: +pct(times, 0.5).toFixed(2), per_shot_ms_p95: +pct(times, 0.95).toFixed(2), compare_draw_ms: +(performance.now() - t1).toFixed(2) };
}

/** Load and analyse the same four 250-shot sessions five times over, watching for slowdown or failure (memory pressure shows up as either). */
async function stress(backend: HistoryBackend, player: string): Promise<NonNullable<PhoneReport["stress"]>> {
  const rounds: number[] = [];
  try {
    for (let i = 0; i < 5; i += 1) {
      const t0 = performance.now();
      const h = await loadHistory(backend, player);
      analyseHistory(h.sessions, h.shots);
      rounds.push(Math.round(performance.now() - t0));
    }
    return { rounds_ms: rounds, slowdown: +(rounds[rounds.length - 1] / Math.max(1, rounds[0])).toFixed(2), failed: null };
  } catch (e) {
    return { rounds_ms: rounds, slowdown: NaN, failed: e instanceof Error ? e.message : String(e) };
  }
}

export async function runPhoneTest(backend: HistoryBackend, onProgress: (m: string) => void, opts: { askPersist?: boolean } = {}): Promise<PhoneReport> {
  const T0 = performance.now();
  let reloaded = false;
  try { reloaded = window.localStorage.getItem(RUN_KEY) !== null; window.localStorage.setItem(RUN_KEY, String(Date.now())); } catch { /* storage unavailable */ }
  const player = `${P}`;
  const bat0 = await battery(), heap0 = heap();
  const nav = navigator as unknown as { deviceMemory?: number; standalone?: boolean };
  const capabilities: PhoneReport["capabilities"] = {
    persistApi: typeof navigator.storage?.persist === "function", heapApi: heap() !== null, batteryApi: typeof (navigator as unknown as { getBattery?: unknown }).getBattery === "function",
    standalone: nav.standalone === true || (typeof matchMedia !== "undefined" && matchMedia("(display-mode: standalone)").matches), deviceMemoryGB: nav.deviceMemory ?? null, cores: navigator.hardwareConcurrency ?? null,
  };
  onProgress("Checking storage persistence");
  const persistence = await persistenceStatus(!!opts.askPersist);
  const sizes: PhoneReport["sizes"] = [];
  const keys: string[] = [];
  for (const n of [40, 100, 250]) {
    onProgress(`${n}-shot session: saving, reading, analysing, deleting`);
    const key = `${player}:${n}`; keys.push(key);
    await deleteSessionHistory(backend, key).catch(() => {});
    const input = { ...syntheticSession(n, key, n), playerId: player };
    const res = await retainSession(backend, input);
    if (res.status !== "saved") throw new Error(`save failed: ${res.status} ${res.message ?? ""}`);
    const l0 = performance.now(), h = await loadHistory(backend, player), load = performance.now() - l0;
    const a0 = performance.now(); analyseHistory(h.sessions.filter((s) => s.sessionKey === key), h.shots.filter((s) => s.sessionKey === key)); const an = performance.now() - a0;
    const d0 = performance.now(); await deleteSessionHistory(backend, key); const del = performance.now() - d0;
    sizes.push({ shots: n, save_ms: Math.round(res.ms), load_ms: Math.round(load), analyse_ms: Math.round(an), delete_ms: Math.round(del), kb: Math.round(res.bytes / 1024) });
  }
  onProgress("Filling a 1,000-shot history and timing the list");
  let list1000: PhoneReport["list1000"] = null, stressR: PhoneReport["stress"] = null;
  try {
    for (let i = 0; i < 4; i += 1) { const key = `${player}:big${i}`; keys.push(key); await retainSession(backend, { ...syntheticSession(250, key, 20 + i), playerId: player }); }
    const t0 = performance.now(); const h = await loadHistory(backend, player); list1000 = { shots: h.shots.length, load_ms: Math.round(performance.now() - t0) };
    onProgress("Memory pressure: five load-and-analyse rounds");
    stressR = await stress(backend, player);
  } finally { for (const k of keys) await deleteSessionHistory(backend, k).catch(() => {}); }
  onProgress("Drawing 100 shot trails");
  const render = renderBench(100);
  onProgress("Timing the live-loop recorder");
  const recorder = recorderBench();
  let est: { usage: number | null; quota: number | null } = { usage: null, quota: null };
  try { const e = await navigator.storage?.estimate?.(); if (e) est = { usage: e.usage ?? null, quota: e.quota ?? null }; } catch { /* unsupported */ }
  const bat1 = await battery();
  try { window.localStorage.removeItem(RUN_KEY); } catch { /* storage unavailable */ }
  return {
    v: 1, at: new Date().toISOString(), userAgent: navigator.userAgent, capabilities, persistence, storage: est, sizes, list1000, render, recorder, stress: stressR,
    heapMB: { start: heap0, end: heap() }, battery: { start: bat0.level, end: bat1.level, charging: bat1.charging }, pageReloadedDuringRun: reloaded, totalMs: Math.round(performance.now() - T0),
  };
}

const row = (id: string, label: string, ok: boolean | null, value: string, limit: string): Check => ({ id, label, verdict: ok === null ? "not_measured" : ok ? "pass" : "fail", value, limit });

/** Hold a report to the registered criteria. Anything the browser could not measure is "not_measured", never a pass. */
export function judge(r: PhoneReport): Check[] {
  const s250 = r.sizes.find((x) => x.shots === 250);
  const c = PHONE_CRITERIA;
  return [
    row("save250", "Saving a 250-shot session", s250 ? s250.save_ms <= c.save250Ms : null, s250 ? `${s250.save_ms} ms` : "no result", `under ${c.save250Ms} ms`),
    row("analyse250", "Analysing a 250-shot session", s250 ? s250.analyse_ms <= c.analyse250Ms : null, s250 ? `${s250.analyse_ms} ms` : "no result", `under ${c.analyse250Ms} ms`),
    row("list1000", "Listing a history of 1,000+ shots", r.list1000 && r.list1000.shots >= 1000 ? r.list1000.load_ms <= c.list1000Ms : null, r.list1000 ? `${r.list1000.shots} shots in ${r.list1000.load_ms} ms` : "no result", `under ${c.list1000Ms} ms`),
    row("render", "Opening a shot (trail build and draw), 95th percentile", r.render ? r.render.per_shot_ms_p95 <= c.renderPerShotMs : null, r.render ? `${r.render.per_shot_ms_p95} ms` : "no canvas", `under ${c.renderPerShotMs} ms`),
    row("recorder", "Live-loop recorder, 99th percentile per frame", r.recorder.p99_us <= c.recorderP99Us, `${r.recorder.p99_us} µs`, `under ${c.recorderP99Us} µs`),
    row("stress", "Five rounds of load and analyse: no failure, no big slowdown", r.stress ? r.stress.failed === null && r.stress.slowdown <= c.stressSlowdown : null, r.stress ? (r.stress.failed ?? `last round ${r.stress.slowdown}x the first`) : "no result", `no failure, at most ${c.stressSlowdown}x`),
    row("reload", "The page stayed alive for the whole test", !r.pageReloadedDuringRun, r.pageReloadedDuringRun ? "the page was reloaded during an earlier run (the phone may have ended it for memory)" : "no reload seen", "no reload"),
    row("persist", "Browser storage marked persistent", r.persistence.persistedBefore === null && r.persistence.persistGranted === null ? null : r.persistence.persistedBefore === true || r.persistence.persistGranted === true, r.persistence.persistedBefore === null && r.persistence.persistGranted === null ? "this browser cannot say" : `already ${String(r.persistence.persistedBefore)}, asked ${String(r.persistence.persistGranted)}`, "persistent (otherwise the phone may clear it)"),
    row("heap", "JavaScript memory use", null, r.capabilities.heapApi ? `${r.heapMB.start} to ${r.heapMB.end} MB` : "not available in this browser", "reported only"),
    row("battery", "Battery during the test", null, r.capabilities.batteryApi ? `${r.battery.start}% to ${r.battery.end}%` : "not available in this browser (iPhone Safari does not offer it)", "use the by-hand set comparison"),
  ];
}

export type LoopSide = { medianWorkMs: number | null; p95WorkMs: number | null; medianIntervalMs: number | null; frames: number };
const side = (s: DiagSummary[] | undefined): LoopSide => {
  const w = s?.find((x) => x.name === "loop.work_ms"), i = s?.find((x) => x.name === "loop.interval_ms");
  return { medianWorkMs: w ? w.medianMs : null, p95WorkMs: w ? w.p95Ms : null, medianIntervalMs: i ? i.medianMs : null, frames: w ? w.n : 0 };
};
/** The live-loop comparison between a set with Session review off and one with it on (two real sets on the phone). */
export function judgeLoop(off: DiagSummary[] | undefined, on: DiagSummary[] | undefined): { off: LoopSide; on: LoopSide; checks: Check[] } {
  const a = side(off), b = side(on), c = PHONE_CRITERIA;
  const have = a.medianWorkMs !== null && b.medianWorkMs !== null && a.frames >= 100 && b.frames >= 100;
  const fpsOff = a.medianIntervalMs ? 1000 / a.medianIntervalMs : null, fpsOn = b.medianIntervalMs ? 1000 / b.medianIntervalMs : null;
  const dWork = have ? (b.medianWorkMs as number) - (a.medianWorkMs as number) : null;
  const dFps = fpsOff !== null && fpsOn !== null && have ? fpsOff - fpsOn : null;
  return {
    off: a, on: b,
    checks: [
      row("loopWork", "Live loop work per frame: median, review on minus off", dWork === null ? null : dWork <= c.loopWorkIncreaseMs, dWork === null ? "needs a set of 100+ frames with review off and one with it on" : `${dWork.toFixed(2)} ms`, `at most ${c.loopWorkIncreaseMs} ms more`),
      row("loopFps", "Live loop speed: frames per second, review off minus on", dFps === null ? null : dFps <= c.fpsDrop, dFps === null ? "needs both sets" : `${dFps.toFixed(2)} fps`, `at most ${c.fpsDrop} fps lower`),
    ],
  };
}

export type BatterySet = { start: number; end: number; minutes: number };
/** Battery by hand: drain per 15 minutes with review on minus off. Needs two sets of at least 10 minutes. */
export function judgeBattery(off: BatterySet | null, on: BatterySet | null): Check {
  const per15 = (b: BatterySet) => ((b.start - b.end) * 15) / b.minutes;
  const valid = (b: BatterySet | null): b is BatterySet => !!b && [b.start, b.end, b.minutes].every(Number.isFinite) && b.minutes >= 10 && b.start >= b.end && b.start <= 100;
  if (!valid(off) || !valid(on)) return row("batteryHand", "Battery: extra drain per 15 minutes, review on minus off (by hand)", null, "enter percentages and minutes for two sets of 10+ minutes", `at most ${PHONE_CRITERIA.batteryExtraPointsPer15Min} points`);
  const extra = per15(on) - per15(off);
  return row("batteryHand", "Battery: extra drain per 15 minutes, review on minus off (by hand)", extra <= PHONE_CRITERIA.batteryExtraPointsPer15Min, `${extra.toFixed(1)} points (off ${per15(off).toFixed(1)}, on ${per15(on).toFixed(1)})`, `at most ${PHONE_CRITERIA.batteryExtraPointsPer15Min} points`);
}

/**
 * What only the live iPhone camera can show. The replay test (replaytest.ts) says nothing about any of these, and nothing in the app marks one
 * of them validated: they stay "not validated" until a real set on a real phone is measured against criteria.json. Ids are kept equal to
 * criteria-replay.json by a test.
 */
export type LiveOnly = { id: string; title: string; why: string; how: string; result: "loop" | "battery" | "manual" };
export const LIVE_ONLY: LiveOnly[] = [
  { id: "L1_speed", title: "Counting speed with shot review on and off", why: "The review recorder runs inside the live camera loop; only the live loop can show its cost.", how: "Turn on Timing diagnostics. Count one set with shot review off, then a set of the same drill with it on. Come back and tap Refresh.", result: "loop" },
  { id: "L2_counts", title: "Same shots counted with review on and off", why: "Counting must not change. This is the real-phone check of that.", how: "Do the same drill twice (review off, then on) and compare the counted makes and misses with what you saw.", result: "manual" },
  { id: "L3_battery", title: "Battery over a 15-minute set", why: "The browser cannot read the battery on iPhone, and heat only shows over a real set.", how: "Note the battery % and the time before and after each of two 15-minute sets (review off, then on) and enter them.", result: "battery" },
  { id: "L4_capture", title: "Paths captured for new live shots", why: "How many live shots get a trustworthy path depends on the real camera and light.", how: "After a camera set with shot review on, open Review your shots and note how many shots show a clear path.", result: "manual" },
  { id: "L5_clips", title: "Video for new shots shows with its path", why: "Clips are only kept until a set is saved, so this can only be checked right after a live set.", how: "End a camera set, open Review your shots before saving, and watch a shot: the video should play under the path.", result: "manual" },
  { id: "L6_survival", title: "Saved paths survive for days", why: "Safari can clear a website's storage after about a week unused; only time shows it.", how: "Keep paths on, add the app to the Home Screen, and check the Shot history again after a week.", result: "manual" },
  { id: "L7_homescreen", title: "Camera and review work from the Home Screen app", why: "The Home Screen app and Safari tabs behave differently on iPhone.", how: "Open the app from the Home Screen, run a camera set, and open Review your shots.", result: "manual" },
  { id: "L8_reference", title: "Camera check when holding the phone", why: "Hand-held drift and real light cannot be replayed.", how: "Open Camera reference, set a reference, put the phone down again and check.", result: "manual" },
];
