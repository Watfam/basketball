"use client";

import type { ReviewBox, ReviewRecord } from "./types.ts";
import { analyseHistory } from "./consistency.ts";
import { deleteSessionHistory, loadHistory, retainSession, type HistoryBackend, type RetainInput } from "./history-core.ts";
import { createReviewRecorder } from "./recorder.ts";

/**
 * A reproducible storage and rendering self-test for the history store, runnable on the phone itself (the Session review page in the camera lab)
 * and in a browser. Builds sessions of N synthetic shots (arcs onto the rim with missing frames, second-ball boxes and a rim-hardware box now and
 * then), saves each through the REAL retention code into the REAL store under a throwaway player id, times each step, reads it back, runs the
 * analytics, and deletes it. It never touches a real player's history. Synthetic data shows cost, not accuracy.
 */
const RIM = { x: 192, y: 190 }, STEP = 1000 / 15, PLAYER = "__selftest__";

function rand(seed: number) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const box = (x: number, y: number, w: number, score: number, occ = false): ReviewBox => ({ x1: x - w / 2, y1: y - w / 2, x2: x + w / 2, y2: y + w / 2, score, occ });

export function syntheticRecord(id: string, r: () => number): ReviewRecord {
  const frames: ReviewRecord["frames"] = [], dx = (r() - 0.5) * 3 * (r() < 0.4 ? 8 : 1), hardware = r() < 0.15, second = r() < 0.15;
  for (let t = -1000; t <= 2000; t += STEP) {
    const f = (t * 29.97) / 1000, boxes: ReviewBox[] = [];
    if (f >= -29 && f <= 12 && r() > 0.12) boxes.push(box(192 + 2 * f + dx * (1 + f / 30), 30 + 0.178 * (f + 30) ** 2, 22 + r() * 4, 0.5 + r() * 0.45));
    if (hardware) boxes.push(box(180, 194, 11, 0.5, true));
    if (second && f > -6 && f < -2) boxes.push(box(260, 120, 24, 0.6));
    frames.push({ t, ran: true, boxes });
  }
  return { v: 1, shotId: id, replayId: id, firstMs: 1000, rim: RIM, scale: 1, frames };
}

export function syntheticSession(n: number, key: string, seed: number): RetainInput {
  const r = rand(seed), records = new Map<string, ReviewRecord>();
  const shots = Array.from({ length: n }, (_, i) => { const id = `${key}-${i}`; records.set(id, syntheticRecord(id, r)); return { seq: i + 1, made: r() < 0.5, detectedMade: r() < 0.5, flagged: false, tMs: i * 20000, replayId: id }; });
  return { playerId: PLAYER, sessionKey: key, sessionId: null, label: "self-test", startedAt: new Date(1_760_000_000_000 + seed * 86_400_000).toISOString(), shots, records, framing: { rimX: 0.5, rimY: 0.3, scale: 1, ballWidthPx: 24 } };
}

export type SelfTestRow = { shots: number; build_ms: number; save_ms: number; bytes_ours: number; bytes_per_shot: number; storage_estimate_delta_bytes: number | null; load_ms: number; analyse_ms: number; delete_ms: number; heap_MB: number | null };
export type SelfTestReport = { at: string; userAgent: string; rows: SelfTestRow[]; recorder: { frames: number; median_us: number; p99_us: number } | null; storage: { usage: number | null; quota: number | null } };

async function estimate() { try { const e = await navigator.storage?.estimate?.(); return e ? { usage: e.usage ?? null, quota: e.quota ?? null } : { usage: null, quota: null }; } catch { return { usage: null, quota: null }; } }
const heap = () => { const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory; return m ? +(m.usedJSHeapSize / 1e6).toFixed(1) : null; };

export function recorderBench(frames = 3000): { frames: number; median_us: number; p99_us: number } {
  const rec = createReviewRecorder(), r = rand(5), times: number[] = [];
  for (let i = 0; i < frames; i += 1) {
    const boxes = r() < 0.7 ? [{ x1: 100 + r() * 100, y1: 100 + r() * 100, x2: 124 + r() * 100, y2: 124 + r() * 100, score: 0.8 }] : [];
    if (r() < 0.1) boxes.push({ x1: 174, y1: 188, x2: 185, y2: 199, score: 0.5 });
    const t0 = performance.now(); rec.push(i * 66.7, true, boxes); times.push((performance.now() - t0) * 1000);
  }
  times.sort((a, b) => a - b);
  return { frames, median_us: +times[times.length >> 1].toFixed(1), p99_us: +times[Math.floor(times.length * 0.99)].toFixed(1) };
}

export async function runSelfTest(backend: HistoryBackend, sizes = [40, 100, 250], onProgress?: (msg: string) => void): Promise<SelfTestReport> {
  const rows: SelfTestRow[] = [];
  for (const n of sizes) {
    onProgress?.(`${n} shots: building`);
    const key = `${PLAYER}:${n}`;
    await deleteSessionHistory(backend, key).catch(() => {});
    const t0 = performance.now(), input = syntheticSession(n, key, n), build = performance.now() - t0;
    const before = await estimate();
    onProgress?.(`${n} shots: saving`);
    const res = await retainSession(backend, input);
    if (res.status !== "saved") throw new Error(`self-test save failed: ${res.status} ${res.message ?? ""}`);
    const after = await estimate();
    onProgress?.(`${n} shots: loading and analysing`);
    const l0 = performance.now(), h = await loadHistory(backend, PLAYER), load = performance.now() - l0;
    const a0 = performance.now(); analyseHistory(h.sessions.filter((s) => s.sessionKey === key), h.shots.filter((s) => s.sessionKey === key)); const analyse = performance.now() - a0;
    const h1 = heap();
    const d0 = performance.now(); await deleteSessionHistory(backend, key); const del = performance.now() - d0;
    rows.push({ shots: n, build_ms: +build.toFixed(0), save_ms: +res.ms.toFixed(0), bytes_ours: res.bytes, bytes_per_shot: Math.round(res.bytes / n), storage_estimate_delta_bytes: before.usage !== null && after.usage !== null ? after.usage - before.usage : null, load_ms: +load.toFixed(0), analyse_ms: +analyse.toFixed(0), delete_ms: +del.toFixed(0), heap_MB: h1 });
  }
  const e = await estimate();
  return { at: new Date().toISOString(), userAgent: navigator.userAgent, rows, recorder: recorderBench(), storage: e };
}
