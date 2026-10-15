import { analyseHistory } from "./consistency.ts";
import { buildExport, planImport, runImport } from "./history-transfer.ts";
import { loadHistory, markSessionDeleted, restoreMarkedSession, retainSession, usage, type HistoryBackend } from "./history-core.ts";
import { memoryBackend } from "./history-memory.ts";
import { drawPathChart, type ChartLine } from "./path-draw.ts";
import { pathPieces } from "./history-view.ts";
import { PHONE_CRITERIA, type Check } from "./phonetest.ts";
import { syntheticSession } from "./selftest.ts";
import type { HistoryShot } from "./history-types.ts";

/**
 * The replay test: runs the shot-review and history code on tracking history already on the phone (or imported from a file made from existing
 * recordings), without any camera. It never writes to the real store: everything that changes data runs in a throwaway in-memory copy.
 * Criteria were registered first (training/eval/experiments/iphone-readiness/criteria-replay.json). It shows that the screens and storage run
 * correctly and fast on THIS phone's browser; it shows nothing about the live camera (see LIVE_ONLY in phonetest.ts).
 */
export const REPLAY_CRITERIA = { readMs: PHONE_CRITERIA.list1000Ms, drawP95Ms: PHONE_CRITERIA.renderPerShotMs, analyseMs: PHONE_CRITERIA.analyse250Ms, clipFrameP95Ms: PHONE_CRITERIA.renderPerShotMs, minRealShots: 20 } as const;

export type ClipSource = { ids(): Promise<string[]>; frames(id: string): Promise<{ t: number; blob: Blob }[] | null>; decode(blob: Blob): Promise<void> };
export type ReplayReport = {
  v: 1; at: string; userAgent: string;
  source: "real" | "synthetic";
  data: { sessions: number; shots: number; withPath: number };
  read_ms: number; draw: { n: number; p95_ms: number; median_ms: number } | null; analyse_ms: number;
  roundtrip: { ok: boolean; detail: string }; delete: { ok: boolean; detail: string };
  clips: { n: number; frames: number; p95_ms: number } | null;
  realStoreUnchanged: boolean; totalMs: number;
};

const pct = (a: number[], f: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : 0; };
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const fingerprintOfStore = async (b: HistoryBackend) => { const u = await usage(b); return `${u.sessions}|${u.shots}|${u.bytes}|${u.damaged}|${u.newer}`; };
const sameShot = (a: HistoryShot, b: HistoryShot) => JSON.stringify([a.points, a.gaps, a.events, a.made, a.detectedMade, a.flagged, a.quality, a.fingerprint, a.rim, a.scale, a.ballWidthPx]) === JSON.stringify([b.points, b.gaps, b.events, b.made, b.detectedMade, b.flagged, b.quality, b.fingerprint, b.rim, b.scale, b.ballWidthPx]);

export async function runReplayTest(real: HistoryBackend, onProgress: (m: string) => void, opts: { clips?: ClipSource; canvas?: () => CanvasRenderingContext2D | null; now?: number } = {}): Promise<ReplayReport> {
  const T0 = now(), stamp = opts.now ?? Date.now();
  onProgress("Checking what is saved on this phone");
  const before = await fingerprintOfStore(real);
  const probe = await loadHistory(real);
  let source: ReplayReport["source"] = "real", store: HistoryBackend = real;
  if (probe.shots.filter((s) => s.points.length >= 2).length < REPLAY_CRITERIA.minRealShots) {
    source = "synthetic"; const m = memoryBackend(); store = m;
    onProgress("Not enough saved shot paths here, so using made-up ones (clearly marked)");
    for (let i = 1; i <= 6; i += 1) await retainSession(m, { ...syntheticSession(60, `replay:${i}`, i), playerId: "replay", sessionKey: `replay:${i}` }, stamp);
  }
  onProgress("Reading everything saved");
  const r0 = now(); const h = await loadHistory(store); const read_ms = now() - r0;
  const withPath = h.shots.filter((s) => s.points.length >= 2);

  onProgress("Drawing every saved path");
  let draw: ReplayReport["draw"] = null;
  const ctx = opts.canvas ? opts.canvas() : null;
  if (ctx) {
    const times: number[] = [];
    for (const s of withPath.slice(-250)) { const t0 = now(); const lines: ChartLine[] = pathPieces(s).map((pts) => ({ pts, color: s.made ? "#4fd1ff" : "#ffb454" })); drawPathChart(ctx, 360, 300, lines); times.push(now() - t0); }
    draw = { n: times.length, p95_ms: +pct(times, 0.95).toFixed(2), median_ms: +pct(times, 0.5).toFixed(2) };
  }

  onProgress("Looking for patterns");
  const a0 = now(); analyseHistory(h.sessions, h.shots); const analyse_ms = now() - a0;

  onProgress("Exporting and importing a copy");
  const players = [...new Set(h.sessions.map((s) => s.playerId))];
  const player = players.map((p) => ({ p, n: h.shots.filter((x) => x.playerId === p).length })).sort((x, y) => y.n - x.n)[0]?.p ?? "none";
  let roundtrip: ReplayReport["roundtrip"] = { ok: false, detail: "nothing to export" };
  const copy = memoryBackend();
  try {
    const ex = await buildExport(store, { playerId: player }, stamp);
    const plan = await planImport(ex.text, copy, player, { onDuplicate: "skip" }, stamp);
    if (!plan.ok) roundtrip = { ok: false, detail: plan.message };
    else {
      await runImport(plan, copy);
      const A = await loadHistory(store, player), B = await loadHistory(copy, player);
      const at = (L: typeof A) => { const m = new Map(L.sessions.map((x) => [x.sessionKey, Date.parse(x.startedAt)])); return (x: HistoryShot) => `${m.get(x.sessionKey)}#${x.seq}`; };
      const keyA = at(A), keyB = at(B), inB = new Map(B.shots.map((x) => [keyB(x), x]));
      const shotsOk = A.shots.length === B.shots.length && A.shots.every((x) => { const y = inB.get(keyA(x)); return !!y && sameShot(x, y); });
      const ok = A.sessions.length === B.sessions.length && shotsOk;
      roundtrip = { ok, detail: `${A.sessions.length} sets and ${A.shots.length} shots out, ${B.sessions.length} and ${B.shots.length} back in, every path point ${shotsOk ? "identical" : "NOT identical"}` };
    }
  } catch (e) { roundtrip = { ok: false, detail: e instanceof Error ? e.message : String(e) }; }

  onProgress("Deleting and restoring a set in the copy");
  let del: ReplayReport["delete"] = { ok: false, detail: "nothing to delete" };
  try {
    const L = await loadHistory(copy, player);
    if (L.sessions.length >= 1) {
      const target = L.sessions[0], others = JSON.stringify(L.shots.filter((x) => x.sessionKey !== target.sessionKey).map((x) => x.id));
      await markSessionDeleted(copy, { playerId: player, startedAt: target.startedAt }, stamp);
      const hidden = await loadHistory(copy, player), u = await usage(copy);
      const gone = !hidden.sessions.some((x) => x.sessionKey === target.sessionKey) && !hidden.shots.some((x) => x.sessionKey === target.sessionKey) && u.sessions === L.sessions.length - 1;
      const unrelated = JSON.stringify(hidden.shots.map((x) => x.id)) === others;
      const back = await restoreMarkedSession(copy, { playerId: player, startedAt: target.startedAt }, stamp + 1000);
      const R = await loadHistory(copy, player);
      const restored = back.matched === 1 && R.shots.length === L.shots.length && R.sessions.length === L.sessions.length;
      del = { ok: gone && unrelated && restored, detail: `hidden at once ${gone ? "yes" : "NO"}, other sets untouched ${unrelated ? "yes" : "NO"}, restored whole ${restored ? "yes" : "NO"}` };
    }
  } catch (e) { del = { ok: false, detail: e instanceof Error ? e.message : String(e) }; }

  let clips: ReplayReport["clips"] = null;
  if (opts.clips) {
    onProgress("Decoding saved video clips");
    try {
      const ids = (await opts.clips.ids()).slice(0, 20), times: number[] = []; let frames = 0;
      for (const id of ids) { const f = await opts.clips.frames(id); if (!f) continue; for (const fr of f) { const t0 = now(); await opts.clips.decode(fr.blob); times.push(now() - t0); frames += 1; } }
      if (ids.length) clips = { n: ids.length, frames, p95_ms: +pct(times, 0.95).toFixed(2) };
    } catch { clips = null; }
  }
  const after = await fingerprintOfStore(real);
  return { v: 1, at: new Date(stamp).toISOString(), userAgent: typeof navigator === "undefined" ? "node" : navigator.userAgent, source, data: { sessions: h.sessions.length, shots: h.shots.length, withPath: withPath.length }, read_ms: Math.round(read_ms), draw, analyse_ms: Math.round(analyse_ms), roundtrip, delete: del, clips, realStoreUnchanged: before === after, totalMs: Math.round(now() - T0) };
}

/** Hold a replay report to the registered criteria. Every label says it is replayed data; synthetic passes are never plain passes. */
export function judgeReplay(r: ReplayReport): Check[] {
  const c = REPLAY_CRITERIA, syn = r.source === "synthetic";
  const mk = (id: string, label: string, ok: boolean | null, value: string, limit: string): Check => ({ id, label: `Replayed data: ${label}`, verdict: ok === null ? "not_measured" : ok ? (syn ? "pass_synthetic" : "pass") : "fail", value: syn ? `${value} (made-up data)` : value, limit });
  return [
    mk("R2_read", "reading everything saved", r.read_ms <= c.readMs, `${r.read_ms} ms for ${r.data.shots} shots`, `under ${c.readMs} ms`),
    mk("R3_draw", "drawing each saved path, 95th percentile", r.draw ? r.draw.p95_ms <= c.drawP95Ms : null, r.draw ? `${r.draw.p95_ms} ms over ${r.draw.n} paths` : "no canvas available", `under ${c.drawP95Ms} ms`),
    mk("R4_analyse", "looking for patterns across all sets", r.analyse_ms <= c.analyseMs, `${r.analyse_ms} ms`, `under ${c.analyseMs} ms`),
    mk("R5_roundtrip", "export, then import into a copy", r.roundtrip.ok, r.roundtrip.detail, "every set and path identical"),
    mk("R6_delete", "delete and undo in a copy", r.delete.ok, r.delete.detail, "hidden at once, restored whole, others untouched"),
    mk("R7_clips", "saved video clips decode and draw", r.clips ? r.clips.p95_ms <= c.clipFrameP95Ms : null, r.clips ? `${r.clips.frames} frames from ${r.clips.n} clips, 95th percentile ${r.clips.p95_ms} ms` : "no clips on this phone (they are kept only until a set is saved)", `under ${c.clipFrameP95Ms} ms per frame`),
    mk("R8_nowrite", "the real saved paths were not changed by the test", r.realStoreUnchanged, r.realStoreUnchanged ? "identical before and after" : "CHANGED", "identical"),
  ];
}
