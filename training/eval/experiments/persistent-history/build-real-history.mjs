// Builds saved-session histories from EXISTING recordings with the app's own recorder and retention code (in memory), one session per recording.
// Writes results/real-derived-history.json (analytics) and, with --demo, public/_history-demo/manifest.json (TEMPORARY, git-excluded) for the browser checks.
//   node build-real-history.mjs [--demo]
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry } from "../../lib/registry.mjs";
import { EVAL } from "../../lib/registry.mjs";
import { loadHistoryLib } from "./lib.mjs";
import { analyseClip, CLIPS } from "../shot-intelligence/shots.mjs";
const L = await loadHistoryLib(), reg = loadRegistry(), demo = process.argv.includes("--demo"), fsMs = (f) => (f * 1001) / 30;
const memory = () => { let meta = null; const sessions = new Map(), shots = new Map(); return { sessions, shots, readMeta: async () => meta, writeMeta: async (m) => { meta = m; }, saveSession: async (s, rows) => { sessions.set(s.sessionKey, s); for (const r of rows) shots.set(r.id, r); }, listSessionsRaw: async () => [...sessions.values()], listShotsRaw: async (k) => [...shots.values()].filter((x) => !k || x.sessionKey === k), deleteSession: async (k) => { sessions.delete(k); for (const [id, v] of shots) if (v.sessionKey === k) shots.delete(id); }, deleteShots: async (ids) => { for (const i of ids) shots.delete(i); }, deleteAll: async () => { meta = null; sessions.clear(); shots.clear(); } }; };
const be = memory(), manifest = { note: "Demo only. Real recordings' detections, cut by the app's recorder.", sessions: [] }, perf = [];
for (const id of CLIPS) {
  const A = await analyseClip(id, { thin: 2 }), clip = reg.clips.find((c) => c.id === id), rec = L.recorder.createReviewRecorder(), cut = new Map(A.shots.map((s) => [Math.round(s.first + 2 * 29.97) + 1, s])), records = new Map();
  for (let f = 0; f <= Math.max(...A.byF.keys()); f += 2) { rec.push(fsMs(f), true, (A.byF.get(f) ?? []).filter((b) => b.score >= 0.2)); for (const [cf, s] of cut) if (cf <= f + 1 && cf >= f) records.set(`shot-${id}-${s.first}`, rec.cut(fsMs(s.first), `shot-${id}-${s.first}`, A.rim, clip.window.scale)); }
  const written = A.shots.filter((s) => s.label.written_outcome), shots = written.map((s, i) => ({ seq: i + 1, made: s.label.written_outcome === "make", detectedMade: s.call.v4 === "make", flagged: false, tMs: Math.round(fsMs(s.first)), replayId: `shot-${id}-${s.first}` }));
  const [rx, ry] = clip.window.rim_native, input = { playerId: "kid1", sessionKey: `kid1:${clip.recorded_utc}`, sessionId: null, label: `${id} (${clip.session})`, startedAt: clip.recorded_utc, shots, records, framing: { rimX: +(rx / 1920).toFixed(3), rimY: +(ry / 1080).toFixed(3), scale: clip.window.scale, ballWidthPx: 24 } };
  const res = await L.core.retainSession(be, input, Date.parse(clip.recorded_utc) + 3_600_000); perf.push({ clip: id, status: res.status, shots: res.shots, tracked: res.tracked, bytes: res.bytes, ms: +res.ms.toFixed(1) });
  if (demo) manifest.sessions.push({ input: { ...input, records: Object.fromEntries(records) }, now: Date.parse(clip.recorded_utc) + 3_600_000 });
}
const h = await L.core.loadHistory(be, "kid1"), an = L.consistency.analyseHistory(h.sessions, h.shots);
const summary = { sessions: h.sessions.length, shots: h.shots.length, tracked: h.shots.filter((s) => s.tracked).length, bytes: h.shots.reduce((a, s) => a + s.bytes, 0), damaged: h.damaged, retention: perf, framing_groups: an.groups.map((g) => ({ name: g.name, sessions: g.sessions.map((s) => s.label), statements: g.statements.map((s) => ({ id: s.id, status: s.status, reason: s.reason ?? null, n: s.n, claim: s.claim_observation, uncertainty: s.uncertainty })) })), coverage: an.coverage };
fs.writeFileSync(path.join(EVAL, "experiments/persistent-history/results/real-derived-history.json"), JSON.stringify(summary, null, 1));
if (demo) { const out = path.join(ROOT, "public/_history-demo"); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest)); }
console.log(JSON.stringify({ sessions: summary.sessions, shots: summary.shots, tracked: summary.tracked, kB: Math.round(summary.bytes / 1024), groups: summary.framing_groups.map((g) => [g.name, g.sessions.length, g.statements.filter((s) => s.status === "supported").map((s) => s.id)]) }));
for (const g of summary.framing_groups) for (const s of g.statements) console.log(g.name.slice(0, 22), s.id, s.status, s.reason ?? "", JSON.stringify(s.n), s.claim ? s.claim.slice(0, 150) : "");
