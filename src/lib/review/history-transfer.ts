import { HISTORY_LIMITS, HISTORY_SCHEMA, type HistoryFraming, type HistorySession, type HistoryShot } from "./history-types.ts";
import { loadHistory, openHistory, parseSession, parseShot, usage, type HistoryBackend } from "./history-core.ts";

/**
 * Export and import of saved tracking history: a file the player keeps or moves to another phone themselves.
 *
 * What the file holds: ball-path coordinates, timings and measurements per shot, and each session's start time and camera framing. Nothing
 * else: no video, no pictures, no account, player or server identifiers, and by default no label text (a label is free text a person typed). It
 * is built from a fixed list of fields, so nothing new that is ever added to the store can leak into a file by accident. It is never sent
 * anywhere by this code; the caller decides where the file goes.
 *
 * Import treats the file as untrusted: format and version are checked, a newer file is refused, a changed or truncated file is refused whole
 * (a checksum covers the content), every session is rebuilt field by field and validated with the same rules the store itself uses, a damaged
 * or oversized session is skipped and reported while the others still come in, and a session already on this phone is skipped (or replaced if
 * asked). It only ever adds or replaces the sessions named in the file; every other session on the phone is left exactly as it was.
 */

export const EXPORT_FORMAT = "hardwood-lab.tracking-history";
export const EXPORT_VERSION = 1 as const;
export const MAX_IMPORT_BYTES = 30_000_000;

// ---- SHA-256 (pure, so it behaves the same in a browser, a worker and a test) -------------------------------------------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const len = bytes.length, padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes); padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor((len * 8) / 0x100000000)); dv.setUint32(padded.length - 4, (len * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i += 1) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0; }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}

// ---- the file --------------------------------------------------------------------------------------------------------------------

type ExportShot = Pick<HistoryShot, "seq" | "made" | "detectedMade" | "flagged" | "tMs" | "tracked" | "rim" | "scale" | "ballWidthPx" | "ballWidthSource" | "points" | "gaps" | "events" | "rimHardwareBoxes" | "rimHardwareNearby" | "quality" | "fingerprint">;
type ExportSession = { startedAt: string; label?: string; framing: HistoryFraming | null; shots: ExportShot[] };
export type ExportFile = {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  schema: typeof HISTORY_SCHEMA;
  exportedAt: string;
  contents: string;
  includesLabels: boolean;
  counts: { sessions: number; shots: number };
  sessions: ExportSession[];
  checksum: string;
};

const CONTENTS = "Ball-path coordinates and measurements for saved sessions. No video, no pictures, no account or player identifiers.";
const checksumOf = (sessions: ExportSession[], counts: ExportFile["counts"]) => sha256Hex(JSON.stringify({ sessions, counts }));

function exportShot(s: HistoryShot): ExportShot {
  return {
    seq: s.seq, made: s.made, detectedMade: s.detectedMade, flagged: s.flagged, tMs: s.tMs, tracked: s.tracked, rim: s.rim, scale: s.scale, ballWidthPx: s.ballWidthPx, ballWidthSource: s.ballWidthSource,
    points: s.points, gaps: s.gaps, events: s.events, rimHardwareBoxes: s.rimHardwareBoxes, rimHardwareNearby: s.rimHardwareNearby, quality: s.quality, fingerprint: s.fingerprint,
  };
}

export type ExportOptions = { playerId: string; /** Only these sessions; default every live session of the player. */ sessionKeys?: string[]; /** Free-text labels are left out unless asked for. */ includeLabels?: boolean };
export type ExportResult = { text: string; sessions: number; shots: number; bytes: number; skipped: { damaged: number; newer: number } };

/** Build the file for one player's live sessions. Sessions deleted in the app (hidden for the undo window) are never exported. */
export async function buildExport(backend: HistoryBackend, opts: ExportOptions, now: number = Date.now()): Promise<ExportResult> {
  const h = await loadHistory(backend, opts.playerId);
  const want = opts.sessionKeys ? new Set(opts.sessionKeys) : null;
  const sessions: ExportSession[] = [];
  for (const s of h.sessions) {
    if (want && !want.has(s.sessionKey)) continue;
    const rows = h.shots.filter((x) => x.sessionKey === s.sessionKey).sort((a, b) => a.seq - b.seq).map(exportShot);
    const out: ExportSession = { startedAt: s.startedAt, framing: s.framing ? { rimX: s.framing.rimX, rimY: s.framing.rimY, scale: s.framing.scale, ballWidthPx: s.framing.ballWidthPx } : null, shots: rows };
    if (opts.includeLabels && s.label) out.label = s.label.slice(0, 200);
    sessions.push(out);
  }
  const counts = { sessions: sessions.length, shots: sessions.reduce((a, s) => a + s.shots.length, 0) };
  const file: ExportFile = {
    format: EXPORT_FORMAT, version: EXPORT_VERSION, schema: HISTORY_SCHEMA, exportedAt: new Date(now).toISOString(), contents: CONTENTS, includesLabels: !!opts.includeLabels, counts, sessions, checksum: checksumOf(sessions, counts),
  };
  const text = JSON.stringify(file);
  return { text, sessions: counts.sessions, shots: counts.shots, bytes: text.length, skipped: { damaged: h.damaged, newer: h.newer } };
}

// ---- import ------------------------------------------------------------------------------------------------------------------------

export type ImportRefusal = "too_big" | "not_json" | "wrong_format" | "newer_version" | "bad_version" | "altered" | "empty" | "read_only";
export type SessionOutcome = "new" | "duplicate" | "replace" | "damaged" | "too_big" | "duplicate_in_file";
export type PlannedSession = { startedAt: string; shots: number; outcome: SessionOutcome; session?: HistorySession; rows?: HistoryShot[]; note?: string; /** The session already on this phone (same player, same instant) that this one replaces or revives. */ replacesKey?: string };
export type ImportPlan =
  | { ok: false; reason: ImportRefusal; message: string }
  | { ok: true; sessions: PlannedSession[]; summary: Record<SessionOutcome, number>; shotsToAdd: number; exportedAt: string; includesLabels: boolean };

const REFUSAL: Record<ImportRefusal, string> = {
  too_big: "This file is too large to be a shot-paths export.",
  not_json: "This file is not readable. It may be damaged or it is not a Hardwood Lab export.",
  wrong_format: "This is not a Hardwood Lab shot-paths file.",
  newer_version: "This file was made by a newer version of the app. Update the app to import it.",
  bad_version: "This file's version is not one this app understands.",
  altered: "This file has been changed or cut short since it was exported, so it was not imported. Export it again from the original phone.",
  empty: "This file has no sessions in it.",
  read_only: "The shot paths on this phone were saved by a newer version of the app, so this version cannot import into them.",
};
const refuse = (reason: ImportRefusal): ImportPlan => ({ ok: false, reason, message: REFUSAL[reason] });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function framingOf(v: unknown): HistoryFraming | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !finite(v.rimX) || !finite(v.rimY) || !finite(v.scale) || !(v.ballWidthPx === null || finite(v.ballWidthPx))) return undefined;
  if (v.rimX < 0 || v.rimX > 1 || v.rimY < 0 || v.rimY > 1 || v.scale <= 0 || v.scale > 20) return undefined;
  return { rimX: v.rimX, rimY: v.rimY, scale: v.scale, ballWidthPx: v.ballWidthPx as number | null };
}

/** Rebuild a stored shot from an exported one with this phone's own ids, field by field, then hold it to the store's own rules. */
function rebuildShot(raw: unknown, sessionKey: string, playerId: string, now: number): HistoryShot | null {
  if (!isObj(raw) || !Number.isInteger(raw.seq) || (raw.seq as number) < 0 || (raw.seq as number) > 100000) return null;
  const row = {
    v: HISTORY_SCHEMA, id: `${sessionKey}#${raw.seq}`, sessionKey, playerId, seq: raw.seq, made: raw.made, detectedMade: raw.detectedMade ?? null, flagged: !!raw.flagged, tMs: raw.tMs ?? null, tracked: !!raw.tracked,
    rim: raw.rim ?? null, scale: raw.scale ?? null, ballWidthPx: raw.ballWidthPx ?? null, ballWidthSource: raw.ballWidthSource ?? null, points: raw.points, gaps: raw.gaps ?? [], events: raw.events ?? [],
    rimHardwareBoxes: raw.rimHardwareBoxes ?? 0, rimHardwareNearby: raw.rimHardwareNearby ?? 0, quality: raw.quality, fingerprint: raw.fingerprint ?? null, savedAt: now, bytes: 0,
  } as unknown as HistoryShot;
  if (!(row.detectedMade === null || typeof row.detectedMade === "boolean")) return null;
  if (!(row.tMs === null || finite(row.tMs))) return null;
  if (!(row.rim === null || (isObj(row.rim) && finite(row.rim.x) && finite(row.rim.y)))) return null;
  if (!(row.scale === null || finite(row.scale)) || !(row.ballWidthPx === null || finite(row.ballWidthPx))) return null;
  if (!(row.ballWidthSource === null || row.ballWidthSource === "shot" || row.ballWidthSource === "default")) return null;
  if (!Array.isArray(row.gaps) || row.gaps.length > 200 || !row.gaps.every((g) => isObj(g) && finite(g.fromT) && finite(g.toT) && finite(g.missing) && typeof g.reason === "string")) return null;
  if (!Array.isArray(row.events) || row.events.length > 200 || !row.events.every((e) => isObj(e) && finite(e.t) && typeof e.reason === "string")) return null;
  if (!finite(row.rimHardwareBoxes) || !finite(row.rimHardwareNearby)) return null;
  if (!isObj(row.quality) || !Array.isArray(row.quality.reasons) || !row.quality.reasons.every((r) => typeof r === "string")) return null;
  row.bytes = JSON.stringify(row).length;
  const p = parseShot(row);
  return p.ok ? p.value : null;
}

const isoOk = (s: unknown): s is string => typeof s === "string" && s.length <= 64 && Number.isFinite(Date.parse(s));

/**
 * Check a file and say what importing it would do, changing nothing. `playerId` is who the sessions will belong to on this phone
 * (a file carries no player). A session already on this phone (same start time for that player) is skipped unless replace is chosen.
 */
export async function planImport(text: string, backend: HistoryBackend, playerId: string, opts: { onDuplicate: "skip" | "replace" } = { onDuplicate: "skip" }, now: number = Date.now()): Promise<ImportPlan> {
  if (text.length > MAX_IMPORT_BYTES) return refuse("too_big");
  let file: unknown;
  try { file = JSON.parse(text); } catch { return refuse("not_json"); }
  if (!isObj(file) || file.format !== EXPORT_FORMAT) return refuse("wrong_format");
  if (!finite(file.version) || !Number.isInteger(file.version) || file.version < 1) return refuse("bad_version");
  if (file.version > EXPORT_VERSION) return refuse("newer_version");
  if (!finite(file.schema) || file.schema > HISTORY_SCHEMA) return refuse(finite(file.schema) ? "newer_version" : "bad_version");
  if (!Array.isArray(file.sessions) || !isObj(file.counts) || typeof file.checksum !== "string") return refuse("altered");
  const counts = file.counts as ExportFile["counts"];
  if (checksumOf(file.sessions as ExportSession[], counts) !== file.checksum) return refuse("altered");
  if (file.sessions.length === 0) return refuse("empty");
  const open = await openHistory(backend, now);
  if (!open.writable) return refuse("read_only");

  // What is already here, hidden-for-undo sessions included (their rows must be cleared before the same session is written again).
  const existing = new Map<string, HistorySession>();
  for (const raw of await backend.listSessionsRaw()) { const p = parseSession(raw); if (p.ok) existing.set(`${p.value.playerId}|${Date.parse(p.value.startedAt)}`, p.value); }
  const u = await usage(backend);
  let shotsLeft = HISTORY_LIMITS.maxShots - u.shots, bytesLeft = HISTORY_LIMITS.maxBytes - u.bytes;

  const planned: PlannedSession[] = [], seen = new Set<string>();
  const summary: Record<SessionOutcome, number> = { new: 0, duplicate: 0, replace: 0, damaged: 0, too_big: 0, duplicate_in_file: 0 };
  let shotsToAdd = 0;
  for (const raw of file.sessions) {
    const s = isObj(raw) ? raw : null;
    const startedAt = s?.startedAt;
    const declaredShots = Array.isArray(s?.shots) ? (s?.shots as unknown[]).length : 0;
    const bad = (note: string): PlannedSession => ({ startedAt: typeof startedAt === "string" ? startedAt.slice(0, 64) : "?", shots: declaredShots, outcome: "damaged", note });
    if (!s || !isoOk(startedAt) || !Array.isArray(s.shots)) { planned.push(bad("this session's record is unreadable")); summary.damaged += 1; continue; }
    if (s.shots.length === 0 || s.shots.length > HISTORY_LIMITS.maxShots) { planned.push(bad("this session has no shots or too many")); summary.damaged += 1; continue; }
    const framing = framingOf(s.framing === undefined ? null : s.framing);
    if (framing === undefined) { planned.push(bad("its camera framing is unreadable")); summary.damaged += 1; continue; }
    const key = `${playerId}:${startedAt}`;
    if (seen.has(key)) { planned.push({ startedAt, shots: s.shots.length, outcome: "duplicate_in_file", note: "this start time appears twice in the file" }); summary.duplicate_in_file += 1; continue; }
    seen.add(key);
    const rows: HistoryShot[] = [];
    const seqs = new Set<number>();
    let ok = true;
    for (const rawShot of s.shots) { const r = rebuildShot(rawShot, key, playerId, now); if (!r || seqs.has(r.seq)) { ok = false; break; } seqs.add(r.seq); rows.push(r); }
    if (!ok) { planned.push(bad("a shot in it is unreadable")); summary.damaged += 1; continue; }
    const bytes = rows.reduce((a, r) => a + r.bytes, 0);
    const prior = existing.get(`${playerId}|${Date.parse(startedAt)}`);
    const live = !!prior && !prior.deletedAt;
    if (live && opts.onDuplicate === "skip") { planned.push({ startedAt, shots: rows.length, outcome: "duplicate", note: "already on this phone" }); summary.duplicate += 1; continue; }
    const freed = live && prior ? { shots: prior.shots, bytes: prior.bytes } : { shots: 0, bytes: 0 };
    if (rows.length > shotsLeft + freed.shots || bytes > bytesLeft + freed.bytes) { planned.push({ startedAt, shots: rows.length, outcome: "too_big", note: "it would not fit in the space allowed for shot paths" }); summary.too_big += 1; continue; }
    shotsLeft -= rows.length - freed.shots; bytesLeft -= bytes - freed.bytes;
    const label = typeof s.label === "string" && s.label.length <= 200 ? s.label : null;
    const session: HistorySession = { v: HISTORY_SCHEMA, sessionKey: key, playerId, sessionId: null, label, startedAt, savedAt: now, shots: rows.length, withTracking: rows.filter((r) => r.tracked).length, framing: framing ?? null, bytes };
    const outcome: SessionOutcome = live ? "replace" : "new";
    planned.push({ startedAt, shots: rows.length, outcome, session, rows, replacesKey: prior?.sessionKey });
    summary[outcome] += 1; shotsToAdd += rows.length;
  }
  return { ok: true, sessions: planned, summary, shotsToAdd, exportedAt: typeof file.exportedAt === "string" ? file.exportedAt.slice(0, 40) : "", includesLabels: file.includesLabels === true };
}

export type ImportResult = { added: number; replaced: number; shots: number; failed: number };

/**
 * Write the sessions a plan marked new or replace, one atomic session at a time. A replaced session is cleared and rewritten; if the rewrite
 * fails the original is put back, so a failure never leaves a session worse off than it was. Sessions not in the plan are never touched.
 */
export async function runImport(plan: ImportPlan, backend: HistoryBackend): Promise<ImportResult> {
  const r: ImportResult = { added: 0, replaced: 0, shots: 0, failed: 0 };
  if (!plan.ok) return r;
  for (const p of plan.sessions) {
    if ((p.outcome !== "new" && p.outcome !== "replace") || !p.session || !p.rows) continue;
    const key = p.replacesKey ?? p.session.sessionKey;
    let before: { s: HistorySession; rows: HistoryShot[] } | null = null;
    try {
      const prevRaw = (await backend.listSessionsRaw()).map((x) => parseSession(x)).find((x) => x.ok && x.value.sessionKey === key);
      if (prevRaw && prevRaw.ok) {
        const rows = (await backend.listShotsRaw(key)).map((x) => parseShot(x)).filter((x): x is { ok: true; value: HistoryShot } => x.ok).map((x) => x.value);
        before = { s: prevRaw.value, rows };
        await backend.deleteSession(key);
      }
      if (!before && key !== p.session.sessionKey) await backend.deleteSession(p.session.sessionKey);
      await backend.saveSession(p.session, p.rows);
      r.shots += p.rows.length;
      if (p.outcome === "replace") r.replaced += 1; else r.added += 1;
    } catch {
      r.failed += 1;
      if (before) { try { await backend.saveSession(before.s, before.rows); } catch { /* the store itself is unavailable */ } }
    }
  }
  return r;
}
