import { buildTrail } from "./trail.ts";
import { fingerprint } from "./fingerprint.ts";
import { assessTrail } from "./quality.ts";
import type { ReviewRecord } from "./types.ts";
import { HISTORY_LIMITS, HISTORY_SCHEMA, type HistoryFraming, type HistoryMeta, type HistoryPoint, type HistorySession, type HistoryShot } from "./history-types.ts";

/**
 * The logic of saved tracking history, independent of where it is stored (a HistoryBackend), so it can be tested without a browser.
 * Safe by construction: it only ever writes records it has just built, it validates everything it reads, it never touches records of a
 * newer schema than it understands (they are left as they are and reported), and a damaged record is skipped and counted, never fatal.
 */

export interface HistoryBackend {
  readMeta(): Promise<unknown>;
  writeMeta(meta: HistoryMeta): Promise<void>;
  /** Session and its shots in ONE atomic write: all of it or none of it. */
  saveSession(session: HistorySession, shots: HistoryShot[]): Promise<void>;
  listSessionsRaw(): Promise<unknown[]>;
  listShotsRaw(sessionKey?: string): Promise<unknown[]>;
  /** The session and all its shots, atomically. */
  deleteSession(sessionKey: string): Promise<void>;
  /** Only the named shot rows (used to clear damaged records). */
  deleteShots(ids: string[]): Promise<void>;
  deleteAll(): Promise<void>;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Is this a plain, small, image-free value? (The privacy rule: coordinates and measurements only.) */
function plain(v: unknown, depth = 0): boolean {
  if (v === null || typeof v === "boolean" || num(v)) return true;
  if (typeof v === "string") return v.length <= 200 && !v.startsWith("data:") && !v.startsWith("blob:");
  if (depth > 4) return false;
  if (Array.isArray(v)) return v.length <= 400 && v.every((x) => plain(x, depth + 1));
  if (typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return false; // a Blob, ArrayBuffer, ImageData, Date...
    return Object.values(v as object).every((x) => plain(x, depth + 1));
  }
  return false;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: "newer" | "damaged" };

/** Upgrade a stored shot to the current schema. Today only schema 1 exists; the function is where an older version would be converted. */
export function parseShot(raw: unknown): Parsed<HistoryShot> {
  const r = raw as Partial<HistoryShot> | null;
  if (!r || typeof r !== "object" || !num(r.v)) return { ok: false, reason: "damaged" };
  if (r.v > HISTORY_SCHEMA) return { ok: false, reason: "newer" };
  if (r.v !== HISTORY_SCHEMA) return { ok: false, reason: "damaged" };
  if (typeof r.id !== "string" || typeof r.sessionKey !== "string" || typeof r.playerId !== "string" || !num(r.seq) || typeof r.made !== "boolean") return { ok: false, reason: "damaged" };
  if (!Array.isArray(r.points) || r.points.length > HISTORY_LIMITS.maxPointsPerShot || !r.points.every((p) => Array.isArray(p) && p.length === 5 && p.every(num))) return { ok: false, reason: "damaged" };
  if (r.fingerprint !== null && (typeof r.fingerprint !== "object" || r.fingerprint.schema !== "shot-fingerprint/1" || typeof r.fingerprint.m !== "object")) return { ok: false, reason: "damaged" };
  if (!r.quality || !["tracked", "partial", "unreliable", "none"].includes(r.quality.level)) return { ok: false, reason: "damaged" };
  if (!plain(r)) return { ok: false, reason: "damaged" };
  return { ok: true, value: r as HistoryShot };
}

export function parseSession(raw: unknown): Parsed<HistorySession> {
  const r = raw as Partial<HistorySession> | null;
  if (!r || typeof r !== "object" || !num(r.v)) return { ok: false, reason: "damaged" };
  if (r.v > HISTORY_SCHEMA) return { ok: false, reason: "newer" };
  if (r.v !== HISTORY_SCHEMA || typeof r.sessionKey !== "string" || typeof r.playerId !== "string" || typeof r.startedAt !== "string" || !num(r.shots) || !num(r.savedAt)) return { ok: false, reason: "damaged" };
  if (!plain(r)) return { ok: false, reason: "damaged" };
  return { ok: true, value: r as HistorySession };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export type ShotInput = { seq: number; made: boolean; detectedMade: boolean | null; flagged?: boolean; tMs?: number; replayId?: string };

/** One shot's compact history row, built from its transient review record (or an outcome-only row when there is none). Never throws. */
export function compactShot(shot: ShotInput, record: ReviewRecord | null | undefined, ctx: { sessionKey: string; playerId: string; now: number }): HistoryShot {
  const base = { v: HISTORY_SCHEMA, id: `${ctx.sessionKey}#${shot.seq}`, sessionKey: ctx.sessionKey, playerId: ctx.playerId, seq: shot.seq, made: shot.made, detectedMade: shot.detectedMade, flagged: !!shot.flagged, tMs: typeof shot.tMs === "number" ? Math.round(shot.tMs) : null, savedAt: ctx.now } as const;
  const none: HistoryShot = { ...base, tracked: false, rim: null, scale: null, ballWidthPx: null, ballWidthSource: null, points: [], gaps: [], events: [], rimHardwareBoxes: 0, rimHardwareNearby: 0, quality: { level: "none", reasons: ["No tracking data was kept for this shot."] }, fingerprint: null, bytes: 0 };
  let out = none;
  try {
    if (record && record.frames.length) {
      const trail = buildTrail(record), fp = trail.hasTrail ? fingerprint(trail) : null, q = assessTrail(trail, fp), rim = record.rim;
      const obs = trail.segments.flat().filter((p) => p.type === "observed").slice(0, HISTORY_LIMITS.maxPointsPerShot);
      const points: HistoryPoint[] = obs.map((p) => [Math.round(p.t), r1(p.x - rim.x), r1(rim.y - p.y), r1(p.w), Math.round((p.score ?? 0) * 100)]);
      let fpc: HistoryShot["fingerprint"] = null;
      if (fp) {
        const m: Record<string, number | boolean | null> = {}, why: Record<string, string> = {};
        for (const [k, v] of Object.entries(fp.measurements)) { m[k] = v.value; if (v.value === null && v.reason) why[k] = v.reason; }
        fpc = { schema: "shot-fingerprint/1", m, why, path: fp.rimLevelPath, usable: fp.usableForComparison };
      }
      out = { ...base, tracked: true, rim: { x: r1(rim.x), y: r1(rim.y) }, scale: record.scale, ballWidthPx: fp ? fp.ballWidthPx : null, ballWidthSource: fp ? fp.ballWidthSource : null, points, gaps: trail.gaps.map((g) => ({ fromT: Math.round(g.fromT), toT: Math.round(g.toT), reason: g.reason, missing: g.processedFramesMissing })), events: trail.events.map((e) => ({ t: Math.round(e.t), reason: e.reason })), rimHardwareBoxes: trail.rimHardwareBoxes, rimHardwareNearby: trail.rimHardwareNearby, quality: { level: q.level, reasons: q.reasons.map((x) => x.slice(0, 180)) }, fingerprint: fpc, bytes: 0 };
    }
  } catch {
    out = { ...none, quality: { level: "none", reasons: ["The tracking data for this shot could not be read."] } };
  }
  out.bytes = JSON.stringify(out).length;
  return out;
}

export type RetainInput = {
  playerId: string;
  /** Stable key for this saved session. */
  sessionKey: string;
  sessionId: string | null;
  label: string | null;
  startedAt: string;
  shots: ShotInput[];
  records: Map<string, ReviewRecord>;
  framing: HistoryFraming | null;
};
export type RetainResult = { status: "saved" | "nothing_to_keep" | "limit" | "read_only" | "error"; sessionKey: string; shots: number; tracked: number; bytes: number; ms: number; message?: string };

/** The newest schema this code can read and write. A store marked newer is read-only for this build. */
export async function openHistory(backend: HistoryBackend, now: number): Promise<{ writable: boolean; schema: number }> {
  const meta = (await backend.readMeta()) as Partial<HistoryMeta> | null;
  if (!meta || !num(meta.schema)) {
    await backend.writeMeta({ schema: HISTORY_SCHEMA, createdAt: now, app: "hardwood-lab" });
    return { writable: true, schema: HISTORY_SCHEMA };
  }
  return { writable: meta.schema <= HISTORY_SCHEMA, schema: meta.schema };
}

export async function usage(backend: HistoryBackend): Promise<{ sessions: number; shots: number; bytes: number; damaged: number; newer: number }> {
  let shots = 0, bytes = 0, damaged = 0, newer = 0, sessions = 0;
  for (const raw of await backend.listSessionsRaw()) { const p = parseSession(raw); if (p.ok) sessions += 1; else if (p.reason === "newer") newer += 1; else damaged += 1; }
  for (const raw of await backend.listShotsRaw()) { const p = parseShot(raw); if (p.ok) { shots += 1; bytes += p.value.bytes; } else if (p.reason === "newer") newer += 1; else damaged += 1; }
  return { sessions, shots, bytes, damaged, newer };
}

export async function retainSession(backend: HistoryBackend, input: RetainInput, now: number = Date.now()): Promise<RetainResult> {
  const t0 = typeof performance !== "undefined" ? performance.now() : 0, done = (r: Omit<RetainResult, "ms">): RetainResult => ({ ...r, ms: typeof performance !== "undefined" ? performance.now() - t0 : 0 });
  const empty = { sessionKey: input.sessionKey, shots: 0, tracked: 0, bytes: 0 };
  try {
    if (input.shots.length === 0) return done({ status: "nothing_to_keep", ...empty });
    const open = await openHistory(backend, now);
    if (!open.writable) return done({ status: "read_only", ...empty, message: "The saved history was written by a newer version of the app, so this version leaves it alone." });
    const ctx = { sessionKey: input.sessionKey, playerId: input.playerId, now };
    const rows = input.shots.map((s) => compactShot(s, s.replayId ? input.records.get(s.replayId) : null, ctx));
    const tracked = rows.filter((r) => r.tracked).length, bytes = rows.reduce((a, r) => a + r.bytes, 0);
    const u = await usage(backend);
    if (u.shots + rows.length > HISTORY_LIMITS.maxShots || u.bytes + bytes > HISTORY_LIMITS.maxBytes) return done({ status: "limit", ...empty, message: `Tracking history is full (${u.shots} shots, ${(u.bytes / 1e6).toFixed(1)} MB). Delete old sessions to keep more.` });
    const session: HistorySession = { v: HISTORY_SCHEMA, sessionKey: input.sessionKey, playerId: input.playerId, sessionId: input.sessionId, label: input.label, startedAt: input.startedAt, savedAt: now, shots: rows.length, withTracking: tracked, framing: input.framing, bytes };
    await backend.saveSession(session, rows);
    return done({ status: "saved", sessionKey: input.sessionKey, shots: rows.length, tracked, bytes });
  } catch (e) {
    return done({ status: "error", ...empty, message: e instanceof Error ? e.message : String(e) });
  }
}

export type LoadedHistory = { sessions: HistorySession[]; shots: HistoryShot[]; damaged: number; newer: number; writable: boolean };

export async function loadHistory(backend: HistoryBackend, playerId?: string): Promise<LoadedHistory> {
  const sessions: HistorySession[] = [], shots: HistoryShot[] = [];
  let damaged = 0, newer = 0;
  const meta = (await backend.readMeta()) as Partial<HistoryMeta> | null;
  for (const raw of await backend.listSessionsRaw()) { const p = parseSession(raw); if (p.ok) { if (!playerId || p.value.playerId === playerId) sessions.push(p.value); } else if (p.reason === "newer") newer += 1; else damaged += 1; }
  const keys = new Set(sessions.map((s) => s.sessionKey));
  for (const raw of await backend.listShotsRaw()) { const p = parseShot(raw); if (p.ok) { if (keys.has(p.value.sessionKey)) shots.push(p.value); } else if (p.reason === "newer") newer += 1; else damaged += 1; }
  sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  shots.sort((a, b) => a.sessionKey.localeCompare(b.sessionKey) || a.seq - b.seq);
  return { sessions, shots, damaged, newer, writable: !meta || !num(meta.schema) || meta.schema <= HISTORY_SCHEMA };
}

/** Delete damaged rows (and only those). Newer-schema rows are never touched. Returns how many were removed. */
export async function removeDamaged(backend: HistoryBackend): Promise<number> {
  const bad: string[] = [];
  for (const raw of await backend.listShotsRaw()) { const p = parseShot(raw); if (!p.ok && p.reason === "damaged") { const id = (raw as { id?: unknown })?.id; if (typeof id === "string") bad.push(id); } }
  if (bad.length) await backend.deleteShots(bad);
  return bad.length;
}

export async function deleteSessionHistory(backend: HistoryBackend, sessionKey: string): Promise<void> {
  await backend.deleteSession(sessionKey);
}
/** Everything, including rows this build cannot read: the user asked for it all to go. */
export async function deleteAllHistory(backend: HistoryBackend): Promise<void> {
  await backend.deleteAll();
}

// ---- framing -------------------------------------------------------------------------------------------------------------

/** Rim position: 0.02 of the picture is about one ball width at the sizes seen so far (21 px of 1080). The key sees distance, zoom and where the hoop sits in the picture; it cannot see the camera's ANGLE to the hoop. */
export const FRAMING_TOLERANCE = { rim: 0.02, scaleRatio: 0.1, ballWidthRatio: 0.15 } as const;

/** Can two sessions' shots be compared directly? Shots from different framings are not comparable in ball widths without more care, so they are not treated as such. */
export function compareFraming(a: HistoryFraming | null, b: HistoryFraming | null): { comparable: boolean; reasons: string[] } {
  if (!a || !b) return { comparable: false, reasons: ["The camera framing was not recorded for one of these sessions, so it cannot be confirmed that the camera was in the same place."] };
  const reasons: string[] = [];
  if (Math.abs(a.rimX - b.rimX) > FRAMING_TOLERANCE.rim + 1e-9 || Math.abs(a.rimY - b.rimY) > FRAMING_TOLERANCE.rim + 1e-9) reasons.push("The hoop sat in a different place in the camera picture.");
  if (Math.abs(a.scale / b.scale - 1) > FRAMING_TOLERANCE.scaleRatio) reasons.push("The camera was a different distance or zoom from the hoop (different window size).");
  if (a.ballWidthPx && b.ballWidthPx && Math.abs(a.ballWidthPx / b.ballWidthPx - 1) > FRAMING_TOLERANCE.ballWidthRatio) reasons.push("The ball looked a different size in the camera picture.");
  return { comparable: reasons.length === 0, reasons };
}

export type ComparisonVerdict = { comparable: boolean; reasons: string[] };
/** Can two shots be meaningfully compared? Every reason it cannot is listed. */
export function compareShots(a: { shot: HistoryShot; framing: HistoryFraming | null }, b: { shot: HistoryShot; framing: HistoryFraming | null }): ComparisonVerdict {
  const reasons: string[] = [];
  if (a.shot.sessionKey !== b.shot.sessionKey) reasons.push(...compareFraming(a.framing, b.framing).reasons);
  for (const [name, s] of [["First", a.shot], ["Second", b.shot]] as const) {
    if (!s.tracked || !s.fingerprint) reasons.push(`${name} shot has no tracking data kept.`);
    else {
      if (s.quality.level === "unreliable" || s.quality.level === "none") reasons.push(`${name} shot's path is not reliable (${s.quality.reasons[0] ?? "see its quality notes"}).`);
      if (s.fingerprint.m.rim_level_x_bw === null || s.fingerprint.m.rim_level_x_bw === undefined) reasons.push(`${name} shot was not seen coming down through the rim's height, so its rim-level position is unknown.`);
    }
  }
  return { comparable: reasons.length === 0, reasons };
}

/** Group sessions by framing: a session joins the first group whose first session it can be compared with. */
export function framingGroups(sessions: HistorySession[]): HistorySession[][] {
  const groups: HistorySession[][] = [];
  for (const s of sessions) { const g = groups.find((x) => compareFraming(x[0].framing, s.framing).comparable); if (g) g.push(s); else groups.push([s]); }
  return groups;
}
