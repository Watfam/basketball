import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseHistory } from "./consistency.ts";
import { applyDeletion, applyRestore, loadHistory, markSessionDeleted, matchesSession, reconcileHistory, restoreMarkedSession, retainSession, runPending, UNDO_WINDOW_MS, usage, type HistoryBackend, type OpStore, type PendingOp, type RetainInput } from "./history-core.ts";
import type { HistoryMeta, HistorySession, HistoryShot } from "./history-types.ts";
import type { ReviewBox, ReviewRecord } from "./types.ts";

const RIM = { x: 192, y: 190 }, STEP = 1000 / 15;
const arcAt = (f: number) => ({ x: 192 + 2 * f, y: 30 + 0.178 * (f + 30) ** 2 });
const box = (x: number, y: number): ReviewBox => ({ x1: x - 12, y1: y - 12, x2: x + 12, y2: y + 12, score: 0.85, occ: false });
function record(id: string, dx = 0): ReviewRecord { const frames = []; for (let t = -1000; t <= 2000; t += STEP) { const f = (t * 29.97) / 1000, boxes: ReviewBox[] = []; if (f >= -29 && f <= 12) { const p = arcAt(f); boxes.push(box(p.x + dx, p.y)); } frames.push({ t, ran: true, boxes }); } return { v: 1, shotId: id, replayId: id, firstMs: 1000, rim: RIM, scale: 1, frames }; }

function memory(fail: { save?: boolean; list?: boolean } = {}) {
  let meta: unknown = null; const sessions = new Map<string, unknown>(), shots = new Map<string, unknown>();
  const b: HistoryBackend & { sessions: typeof sessions; shots: typeof shots; fail: typeof fail } = {
    sessions, shots, fail,
    async readMeta() { return meta; }, async writeMeta(m: HistoryMeta) { meta = m; },
    async saveSession(s: HistorySession, rows: HistoryShot[]) { if (b.fail.save) throw new Error("IDB unavailable"); sessions.set(s.sessionKey, structuredClone(s)); for (const r of rows) shots.set(r.id, structuredClone(r)); },
    async listSessionsRaw() { if (b.fail.list) throw new Error("IDB unavailable"); return [...sessions.values()]; },
    async listShotsRaw(k?: string) { return [...shots.values()].filter((x) => !k || (x as HistoryShot).sessionKey === k); },
    async deleteSession(k: string) { if (b.fail.save) throw new Error("IDB unavailable"); sessions.delete(k); for (const [id, v] of shots) if ((v as HistoryShot).sessionKey === k) shots.delete(id); },
    async deleteShots(ids: string[]) { for (const id of ids) shots.delete(id); },
    async deleteAll() { meta = null; sessions.clear(); shots.clear(); },
  };
  return b;
}
const memOps = (): OpStore & { ops: PendingOp[] } => { const o = { ops: [] as PendingOp[], read() { return this.ops; }, write(x: PendingOp[]) { this.ops = x; } }; return o; };
function input(key: string, n: number, over: Partial<RetainInput> = {}): RetainInput {
  const records = new Map<string, ReviewRecord>(), shots = Array.from({ length: n }, (_, i) => { const id = `${key}-${i}`; records.set(id, record(id, (i % 5) - 2)); return { seq: i + 1, made: i % 2 === 0, detectedMade: i % 2 === 0, flagged: false, tMs: i * 1000, replayId: id }; });
  return { playerId: "p1", sessionKey: `p1:${key}`, sessionId: null, label: key, startedAt: `2026-10-1${key.length}T10:00:00.000Z`, shots, records, framing: { rimX: 0.5, rimY: 0.3, scale: 1, ballWidthPx: 24 }, ...over };
}
const T0 = 1_000_000;

test("a deleted session's history is hidden everywhere at once: lists, usage, comparison inputs and analytics; unrelated sessions stay", async () => {
  const be = memory(); await retainSession(be, input("a", 20, { sessionId: "srv-a", startedAt: "2026-10-12T10:00:00.000Z" }), T0); await retainSession(be, input("bb", 20, { sessionId: "srv-b", startedAt: "2026-10-13T10:00:00.000Z" }), T0); await retainSession(be, input("c", 12, { playerId: "p2", sessionKey: "p2:c", sessionId: "srv-c" }), T0);
  const before = await loadHistory(be, "p1"); assert.equal(before.sessions.length, 2);
  const r = await markSessionDeleted(be, { playerId: "p1", sessionId: "srv-a" }, T0 + 1); assert.equal(r.matched, 1);
  const after = await loadHistory(be, "p1");
  assert.deepEqual(after.sessions.map((s) => s.label), ["bb"]); assert.ok(after.shots.every((s) => s.sessionKey === "p1:bb"), "no shot of the deleted session is returned");
  assert.equal((await usage(be)).sessions, 2, "usage counts the two live sessions (bb and the other player's c)");
  const an = analyseHistory(after.sessions, after.shots); assert.ok(an.coverage.every((c) => c.sessionKey === "p1:bb"));
  assert.ok(an.groups.flatMap((g) => g.statements).every((s) => s.supporting_shot_ids.every((id) => id.startsWith("p1:bb#"))), "analytics never cite a deleted shot");
  assert.equal((await loadHistory(be, "p2")).sessions.length, 1, "another player's session is untouched");
});

test("matching: by the server id, else by the start time sent to the server (any ISO spelling); never across players; never fuzzy", () => {
  const s = { v: 1, sessionKey: "p1:x", playerId: "p1", sessionId: "srv-1", label: null, startedAt: "2026-10-12T10:00:00.000Z", savedAt: 1, shots: 1, withTracking: 1, framing: null, bytes: 1 } as HistorySession;
  assert.ok(matchesSession(s, { playerId: "p1", sessionId: "srv-1" }));
  assert.ok(matchesSession(s, { playerId: "p1", startedAt: "2026-10-12T10:00:00+00:00" }), "the server's spelling of the same instant");
  assert.ok(!matchesSession(s, { playerId: "p2", sessionId: "srv-1" })); assert.ok(!matchesSession(s, { playerId: "p1", sessionId: "other" })); assert.ok(!matchesSession(s, { playerId: "p1", startedAt: "2026-10-12T10:00:01.000Z" })); assert.ok(!matchesSession(s, { playerId: "p1" }));
});

test("a session whose server id was not known is found by start time, and the link is learned so Undo can find it by id", async () => {
  const be = memory(); await retainSession(be, input("a", 10, { sessionId: null, startedAt: "2026-10-12T10:00:00.000Z" }), T0);
  assert.equal((await markSessionDeleted(be, { playerId: "p1", sessionId: "srv-9", startedAt: "2026-10-12T10:00:00+00:00" }, T0 + 5)).matched, 1);
  assert.equal((await restoreMarkedSession(be, { playerId: "p1", sessionId: "srv-9" }, T0 + 10)).matched, 1);
  assert.equal((await loadHistory(be, "p1")).sessions.length, 1);
});

test("Undo within the window restores the history; after the window it is removed for good and cannot be restored", async () => {
  const be = memory(); await retainSession(be, input("a", 10, { sessionId: "srv-a" }), T0);
  await markSessionDeleted(be, { playerId: "p1", sessionId: "srv-a" }, T0);
  assert.equal((await restoreMarkedSession(be, { playerId: "p1", sessionId: "srv-a" }, T0 + 5000)).matched, 1); assert.equal((await loadHistory(be, "p1")).shots.length, 10);
  await markSessionDeleted(be, { playerId: "p1", sessionId: "srv-a" }, T0 + 6000);
  const late = await restoreMarkedSession(be, { playerId: "p1", sessionId: "srv-a" }, T0 + 6000 + UNDO_WINDOW_MS + 1);
  assert.deepEqual([late.matched, late.expired], [0, 1]); assert.equal(be.sessions.size, 0); assert.equal(be.shots.size, 0, "all related tracking rows are gone");
});

test("reconcile removes hidden sessions past the window with ALL their shots, and shot rows whose session is gone; it leaves live and recently hidden sessions alone and is safe to repeat", async () => {
  const be = memory(); await retainSession(be, input("a", 8, { sessionId: "srv-a" }), T0); await retainSession(be, input("bb", 8, { sessionId: "srv-b" }), T0); await retainSession(be, input("ccc", 8, { sessionId: "srv-c" }), T0);
  await markSessionDeleted(be, { playerId: "p1", sessionId: "srv-a" }, T0); await markSessionDeleted(be, { playerId: "p1", sessionId: "srv-b" }, T0 + UNDO_WINDOW_MS);
  be.shots.set("p1:ghost#1", { ...(be.shots.get("p1:a#1") as object), id: "p1:ghost#1", sessionKey: "p1:ghost" });
  const r = await reconcileHistory(be, T0 + UNDO_WINDOW_MS + 10); assert.equal(r.purged, 1); assert.equal(r.orphans, 1, "the purged session took its 8 shots with it; the ghost row is the one orphan");
  assert.ok(![...be.shots.values()].some((s) => ["p1:a", "p1:ghost"].includes((s as HistoryShot).sessionKey)));
  assert.ok(be.sessions.has("p1:bb") && be.sessions.has("p1:ccc"), "recently hidden and live sessions remain");
  const again = await reconcileHistory(be, T0 + UNDO_WINDOW_MS + 10); assert.deepEqual(again, { purged: 0, orphans: 0 });
});

test("repeated deletion is safe: the second delete matches nothing and changes nothing; deleting an unknown session is a no-op", async () => {
  const be = memory(); await retainSession(be, input("a", 6, { sessionId: "srv-a" }), T0); await retainSession(be, input("bb", 6, { sessionId: "srv-b" }), T0);
  const m = { playerId: "p1", sessionId: "srv-a" }; assert.equal((await markSessionDeleted(be, m, T0 + 1)).matched, 1);
  const snap = JSON.stringify([...be.sessions.values()]); assert.equal((await markSessionDeleted(be, m, T0 + 2)).matched, 0); assert.equal(JSON.stringify([...be.sessions.values()]), snap, "the hidden time is not rewritten");
  assert.equal((await markSessionDeleted(be, { playerId: "p1", sessionId: "nope" }, T0 + 3)).matched, 0); assert.equal((await loadHistory(be, "p1")).sessions.length, 1);
});

test("a store that cannot be reached queues the deletion; it is applied later, once, and an Undo before that cancels it", async () => {
  const be = memory({ save: true }), ops = memOps(); await retainSession(memory(), input("a", 4), T0);
  be.fail.save = false; await retainSession(be, input("a", 6, { sessionId: "srv-a" }), T0); be.fail.save = true;
  const m = { playerId: "p1", sessionId: "srv-a" };
  assert.deepEqual(await applyDeletion(be, ops, m, T0 + 1), { status: "queued", matched: 0 }); assert.equal(ops.ops.length, 1);
  assert.deepEqual(await applyDeletion(be, ops, m, T0 + 2), { status: "queued", matched: 0 }); assert.equal(ops.ops.length, 1, "the same deletion is queued once");
  const still = await runPending(be, ops, T0 + 3); assert.equal(still.remaining, 1);
  be.fail.save = false; const done = await runPending(be, ops, T0 + 4); assert.equal(done.remaining, 0); assert.equal((await loadHistory(be, "p1")).sessions.length, 0);
  // undo that arrives while the deletion is still queued just cancels it
  const be2 = memory(), ops2 = memOps(); await retainSession(be2, input("a", 6, { sessionId: "srv-a" }), T0); be2.fail.save = true;
  await applyDeletion(be2, ops2, m, T0 + 1); be2.fail.save = false; assert.equal((await applyRestore(be2, ops2, m, T0 + 2)).status, "done"); assert.equal(ops2.ops.length, 0);
  assert.equal((await loadHistory(be2, "p1")).sessions.length, 1);
});

test("damaged and newer rows never break deletion: a corrupted session row is skipped, other sessions delete normally", async () => {
  const be = memory(); await retainSession(be, input("a", 5, { sessionId: "srv-a" }), T0);
  be.sessions.set("junk", "garbage"); be.sessions.set("future", { v: 99, sessionKey: "future" }); be.shots.set("badshot", { id: "badshot", v: 1 });
  assert.equal((await markSessionDeleted(be, { playerId: "p1", sessionId: "srv-a" }, T0)).matched, 1);
  await reconcileHistory(be, T0 + UNDO_WINDOW_MS + 1);
  assert.ok(!be.sessions.has("p1:a")); assert.ok(be.sessions.has("junk") && be.sessions.has("future"), "rows this build cannot read are left alone");
});

test("a read-only store (written by a newer version) is never modified by a deletion", async () => {
  const be = memory(); await retainSession(be, input("a", 5, { sessionId: "srv-a" }), T0); await be.writeMeta({ schema: 99, createdAt: 1, app: "future" });
  assert.equal((await markSessionDeleted(be, { playerId: "p1", sessionId: "srv-a" }, T0)).matched, 0); assert.equal((await reconcileHistory(be, T0 + UNDO_WINDOW_MS + 1)).purged, 0); assert.equal(be.sessions.size, 1);
});

test("the delete glue only touches the store after a SERVER success: the call sites run it after the server action, and a server failure returns first", async () => {
  const fs = await import("node:fs"), path = await import("node:path"), root = path.join(import.meta.dirname, "../../components");
  for (const f of ["delete-shot-session-button.tsx", "shot-session-list.tsx"]) {
    const src = fs.readFileSync(path.join(root, f), "utf8"), call = src.indexOf("forgetSessionHistory({"), serverCall = src.indexOf("await deleteShotSession("), errorReturn = src.indexOf("return;", serverCall);
    assert.ok(serverCall > 0 && call > serverCall && errorReturn > serverCall && errorReturn < call, `${f}: history is forgotten only after the server delete succeeded`);
  }
});
