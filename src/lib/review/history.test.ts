import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compactShot, compareFraming, compareShots, deleteAllHistory, deleteSessionHistory, framingGroups, loadHistory, openHistory, parseShot, removeDamaged, retainSession, usage, type HistoryBackend, type RetainInput } from "./history-core.ts";
import { HISTORY_LIMITS, HISTORY_SCHEMA, type HistoryMeta, type HistorySession, type HistoryShot } from "./history-types.ts";
import { historyRetentionEnabled, HISTORY_RETAIN_KEY } from "./history-settings.ts";
import { SESSION_REVIEW_KEY } from "./flag.ts";
import type { ReviewBox, ReviewRecord } from "./types.ts";

const RIM = { x: 192, y: 190 }, STEP = 1000 / 15;
const box = (x: number, y: number, w = 24, score = 0.85): ReviewBox => ({ x1: x - w / 2, y1: y - w / 2, x2: x + w / 2, y2: y + w / 2, score, occ: false });
const arcAt = (f: number) => ({ x: 192 + 2 * f, y: 30 + 0.178 * (f + 30) ** 2 });
function record(id: string, opts: { skip?: number[]; dx?: number } = {}): ReviewRecord {
  const frames = [];
  for (let i = 0, t = -1000; t <= 2000; i += 1, t += STEP) { const f = (t * 29.97) / 1000, boxes: ReviewBox[] = []; if (f >= -29 && f <= 12 && !(opts.skip ?? []).includes(i)) { const p = arcAt(f); boxes.push(box(p.x + (opts.dx ?? 0), p.y)); } frames.push({ t, ran: true, boxes }); }
  return { v: 1, shotId: id, replayId: id, firstMs: 1000, rim: RIM, scale: 1, frames };
}

/** An in-memory backend whose writes are atomic (staged, then committed), like IndexedDB transactions. */
function memory(opts: { failSave?: boolean } = {}) {
  let meta: unknown = null; const sessions = new Map<string, unknown>(), shots = new Map<string, unknown>();
  const b: HistoryBackend & { sessions: typeof sessions; shots: typeof shots; setMeta(m: unknown): void; getMeta(): unknown } = {
    sessions, shots, setMeta(m) { meta = m; }, getMeta() { return meta; },
    async readMeta() { return meta; }, async writeMeta(m: HistoryMeta) { meta = m; },
    async saveSession(s: HistorySession, rows: HistoryShot[]) { if (opts.failSave) throw new Error("QuotaExceededError"); sessions.set(s.sessionKey, structuredClone(s)); for (const r of rows) shots.set(r.id, structuredClone(r)); },
    async listSessionsRaw() { return [...sessions.values()]; },
    async listShotsRaw(k?: string) { return [...shots.values()].filter((x) => !k || (x as HistoryShot).sessionKey === k); },
    async deleteSession(k: string) { sessions.delete(k); for (const [id, v] of shots) if ((v as HistoryShot).sessionKey === k) shots.delete(id); },
    async deleteShots(ids: string[]) { for (const id of ids) shots.delete(id); },
    async deleteAll() { meta = null; sessions.clear(); shots.clear(); },
  };
  return b;
}
const input = (n: number, over: Partial<RetainInput> = {}): RetainInput => {
  const records = new Map<string, ReviewRecord>(), shots = Array.from({ length: n }, (_, i) => { const id = `shot-${i}`; if (i % 4 !== 3) records.set(id, record(id, { dx: (i % 5) - 2, skip: i % 6 === 1 ? [20] : [] })); return { seq: i + 1, made: i % 3 !== 0, detectedMade: i % 3 !== 0, flagged: false, tMs: i * 20000, replayId: id }; });
  return { playerId: "p1", sessionKey: "p1:2026-10-19T10:00:00Z", sessionId: null, label: "Free throws", startedAt: "2026-10-19T10:00:00Z", shots, records, framing: { rimX: 0.5, rimY: 0.3, scale: 1, ballWidthPx: 24 }, ...over };
};

test("a retained shot keeps OBSERVED points only, rim-relative, with the rim to rebuild window coordinates; estimated points are never stored", async () => {
  const rec = record("shot-1", { skip: [20] }), row = compactShot({ seq: 1, made: true, detectedMade: true, replayId: "shot-1" }, rec, { sessionKey: "k", playerId: "p", now: 1 });
  assert.equal(row.tracked, true);
  const observed = rec.frames.flatMap((f) => f.boxes).length;
  assert.equal(row.points.length, observed, "one stored point per observed box, none for the gap");
  assert.ok(row.points.every((p) => p.length === 5 && p.every(Number.isFinite)));
  const f0 = rec.frames.find((f) => f.boxes.length)!, p0 = row.points[0];
  assert.ok(Math.abs(192 + p0[1] - (f0.boxes[0].x1 + f0.boxes[0].x2) / 2) < 0.06 && Math.abs(190 - p0[2] - (f0.boxes[0].y1 + f0.boxes[0].y2) / 2) < 0.06, "rim-relative offsets rebuild the window position");
  assert.equal(row.fingerprint?.schema, "shot-fingerprint/1"); assert.ok(row.gaps.length === 1 || row.gaps.length === 0);
  assert.ok(row.bytes > 100 && row.bytes < 6000, `a shot is a few kB at most, was ${row.bytes}`);
});

test("saving a session stores the session and every shot (outcome-only rows for shots without a record) and reports counts and bytes", async () => {
  const be = memory(), res = await retainSession(be, input(40), 1000);
  assert.equal(res.status, "saved"); assert.equal(res.shots, 40); assert.equal(res.tracked, 30); assert.ok(res.bytes > 0);
  const h = await loadHistory(be, "p1");
  assert.equal(h.sessions.length, 1); assert.equal(h.shots.length, 40); assert.equal(h.sessions[0].withTracking, 30); assert.equal(h.damaged, 0);
  const plain = h.shots.find((s) => !s.tracked)!; assert.equal(plain.fingerprint, null); assert.deepEqual(plain.points, []); assert.equal(plain.quality.level, "none");
  assert.equal(JSON.stringify(h.shots[0]), JSON.stringify(JSON.parse(JSON.stringify(h.shots[0]))), "plain JSON data");
  assert.equal((await loadHistory(be, "someone-else")).sessions.length, 0);
});

test("privacy: stored rows are plain numbers and short strings; a row carrying a Blob, an image string or a typed array is rejected", async () => {
  const be = memory(); await retainSession(be, input(5));
  const row = [...be.shots.values()][0] as HistoryShot;
  assert.ok(parseShot(row).ok);
  assert.equal(parseShot({ ...row, frame: new Blob(["x"]) }).ok, false);
  assert.equal(parseShot({ ...row, thumb: "data:image/jpeg;base64,AAAA" }).ok, false);
  assert.equal(parseShot({ ...row, raw: new Uint8Array(4) }).ok, false);
  assert.equal(parseShot({ ...row, blob: "blob:https://x/abc" }).ok, false);
  const src = ["history-core.ts", "history-store.ts", "history-types.ts", "consistency.ts", "history-settings.ts", "diagnostics.ts"].map((f) => fs.readFileSync(path.join(import.meta.dirname, f), "utf8")).join("\n");
  for (const bad of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "supabase", "createObjectURL", "toBlob", "toDataURL", "getImageData"]) assert.equal(src.includes(bad), false, `history code must not use ${bad}`);
});

test("opt-in: nothing is retained unless the session-review flag AND the retention setting are both exactly '1'", () => {
  const rd = (a: Record<string, string>) => (k: string) => a[k] ?? null;
  assert.equal(historyRetentionEnabled(rd({})), false);
  assert.equal(historyRetentionEnabled(rd({ [HISTORY_RETAIN_KEY]: "1" })), false, "retention alone is not enough");
  assert.equal(historyRetentionEnabled(rd({ [SESSION_REVIEW_KEY]: "1" })), false, "the flag alone is not enough");
  assert.equal(historyRetentionEnabled(rd({ [SESSION_REVIEW_KEY]: "1", [HISTORY_RETAIN_KEY]: "1" })), true);
  assert.equal(historyRetentionEnabled(() => { throw new Error("blocked"); }), false);
});

test("a failed write leaves nothing half saved", async () => {
  const be = memory({ failSave: true }), res = await retainSession(be, input(10));
  assert.equal(res.status, "error"); assert.equal(be.sessions.size, 0); assert.equal(be.shots.size, 0);
});

test("the size limit stops new retention with a message and writes nothing; existing history is untouched", async () => {
  const be = memory(); await retainSession(be, input(10, { sessionKey: "a" }));
  const before = be.shots.size, big = input(HISTORY_LIMITS.maxShots, { sessionKey: "big" }), res = await retainSession(be, big);
  assert.equal(res.status, "limit"); assert.match(res.message ?? "", /full/); assert.equal(be.shots.size, before);
});

test("damaged rows are skipped and counted, not fatal; removeDamaged removes only them; newer-schema rows are kept and counted", async () => {
  const be = memory(); await retainSession(be, input(6));
  be.shots.set("bad1", { id: "bad1", v: 1, sessionKey: "p1:2026-10-19T10:00:00Z", playerId: "p1", seq: 99, made: true, points: "nope", quality: { level: "tracked" }, fingerprint: null });
  be.shots.set("bad2", "garbage"); be.shots.set("bad3", { id: "bad3", v: 1, sessionKey: "p1:2026-10-19T10:00:00Z", playerId: "p1", seq: 98, made: true, points: [[1, 2, 3, 4, NaN]], quality: { level: "none", reasons: [] }, fingerprint: null });
  be.shots.set("future", { id: "future", v: HISTORY_SCHEMA + 1, sessionKey: "p1:2026-10-19T10:00:00Z", whatever: [1, 2] });
  const h = await loadHistory(be, "p1");
  assert.equal(h.shots.length, 6); assert.equal(h.damaged, 3); assert.equal(h.newer, 1);
  assert.equal(await removeDamaged(be), 2, "the two with an id are removable; 'garbage' has none");
  assert.ok(be.shots.has("future"), "newer rows are never touched"); assert.ok(!be.shots.has("bad1") && !be.shots.has("bad3"));
  assert.equal((await usage(be)).shots, 6);
});

test("a store marked with a newer schema is read-only: this build neither writes nor deletes in it", async () => {
  const be = memory(); be.setMeta({ schema: HISTORY_SCHEMA + 1, createdAt: 1, app: "x" });
  const res = await retainSession(be, input(5)); assert.equal(res.status, "read_only"); assert.equal(be.shots.size, 0);
  assert.equal((await openHistory(be, 5)).writable, false); assert.equal((await loadHistory(be)).writable, false);
  const fresh = memory(); assert.deepEqual(await openHistory(fresh, 5), { writable: true, schema: HISTORY_SCHEMA }); assert.equal((fresh.getMeta() as HistoryMeta).schema, HISTORY_SCHEMA);
});

test("deleting one session removes it and its shots only; deleting everything leaves nothing, unreadable rows included", async () => {
  const be = memory(); await retainSession(be, input(5, { sessionKey: "a" })); await retainSession(be, input(7, { sessionKey: "b" }));
  await deleteSessionHistory(be, "a"); const h = await loadHistory(be);
  assert.equal(h.sessions.length, 1); assert.equal(h.shots.length, 7); assert.ok([...be.shots.values()].every((s) => (s as HistoryShot).sessionKey === "b"));
  be.shots.set("junk", { v: 99 }); await deleteAllHistory(be);
  assert.equal(be.sessions.size + be.shots.size, 0); assert.equal(be.getMeta(), null);
});

test("sessions saved before tracking existed (no rows, or outcome-only rows) load and analyse without error", async () => {
  const be = memory(); const none = input(8, { records: new Map() }); const res = await retainSession(be, none);
  assert.equal(res.status, "saved"); assert.equal(res.tracked, 0);
  const h = await loadHistory(be, "p1"); assert.equal(h.sessions[0].withTracking, 0); assert.ok(h.shots.every((s) => !s.tracked));
});

test("framing: the same place is comparable; a moved hoop, another distance or ball size is not; unknown framing is never assumed the same", () => {
  const f = { rimX: 0.5, rimY: 0.3, scale: 1, ballWidthPx: 24 };
  assert.equal(compareFraming(f, { ...f, rimX: 0.51 }).comparable, true);
  assert.equal(compareFraming(f, { ...f, rimX: 0.55 }).comparable, false);
  assert.equal(compareFraming(f, { ...f, scale: 1.6 }).comparable, false);
  assert.equal(compareFraming(f, { ...f, ballWidthPx: 14 }).comparable, false);
  assert.equal(compareFraming(f, null).comparable, false); assert.equal(compareFraming(null, null).comparable, false);
  const mk = (k: string, fr: typeof f | null): HistorySession => ({ v: 1, sessionKey: k, playerId: "p", sessionId: null, label: null, startedAt: k, savedAt: 1, shots: 1, withTracking: 1, framing: fr, bytes: 1 });
  assert.deepEqual(framingGroups([mk("1", f), mk("2", { ...f, rimX: 0.505 }), mk("3", { ...f, scale: 2 }), mk("4", null)]).map((g) => g.map((s) => s.sessionKey)), [["1", "2"], ["3"], ["4"]]);
});

test("comparing two shots lists every reason they cannot be compared, and says nothing is comparable across different framings", async () => {
  const be = memory(); await retainSession(be, input(8, { sessionKey: "a" })); await retainSession(be, input(8, { sessionKey: "b", framing: { rimX: 0.7, rimY: 0.3, scale: 1, ballWidthPx: 24 } }));
  const h = await loadHistory(be), a = h.shots.find((s) => s.sessionKey === "a" && s.tracked)!, b = h.shots.find((s) => s.sessionKey === "b" && s.tracked)!, un = h.shots.find((s) => s.sessionKey === "a" && !s.tracked)!;
  const fa = h.sessions[0].framing, fb = h.sessions[1].framing;
  const cross = compareShots({ shot: a, framing: fa }, { shot: b, framing: fb }); assert.equal(cross.comparable, false); assert.ok(cross.reasons.some((r) => /different place/.test(r)));
  const untracked = compareShots({ shot: a, framing: fa }, { shot: un, framing: fa }); assert.equal(untracked.comparable, false); assert.ok(untracked.reasons.some((r) => /no tracking data/.test(r)));
  const a2 = h.shots.find((s) => s.sessionKey === "a" && s.tracked && s.id !== a.id)!; const same = compareShots({ shot: a, framing: fa }, { shot: a2, framing: fa });
  assert.ok(same.comparable || same.reasons.length > 0);
});
