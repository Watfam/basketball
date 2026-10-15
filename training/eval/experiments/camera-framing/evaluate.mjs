// F1-F7 evaluation of M1 (+M0/M3 comparators) from results/m1-raw.json (detector v2), results/background-registration.json and results/synthetic.json.
// Writes results/evaluation.json and prints a summary. Criteria: criteria.json, criteria-v2..v5.json (registered before this ran).
import fs from "node:fs";
import path from "node:path";
import { loadFraming, CLIPS, KS, KS_B } from "./lib.mjs";
import { ROOT } from "../../lib/registry.mjs";
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "results");
const { descriptor: D } = await loadFraming();
const raw = JSON.parse(fs.readFileSync(path.join(dir, "m1-raw.json")));
const bg = JSON.parse(fs.readFileSync(path.join(dir, "background-registration.json")));
const ds = JSON.parse(fs.readFileSync(path.join(ROOT, "training/eval/datasets.json")));
const DEV = ["IMG_4839", "IMG_4840", "IMG_4851", "IMG_4866", "IMG_4867"], VAL = ["IMG_4872", "IMG_4873", "IMG_4844"], DIAG = ["IMG_4874", "IMG_4836"];
const sets = (clip) => ({ A: raw[clip].filter((e) => KS.includes(e.k)), B: raw[clip].filter((e) => KS_B.includes(e.k)) });
const desc = {}; for (const c of CLIPS) { const s = sets(c); desc[c] = { A: D.describeFraming(s.A), B: D.describeFraming(s.B) }; }
const out = { generated: new Date().toISOString().slice(0, 10) };

// ---- F1 extraction (counts; the wrong-but-confident judgement is by eye and is written in REPORT.md) and F7 time
out.F1 = {}; const ms = [];
for (const c of CLIPS) {
  const all = raw[c]; for (const e of all) ms.push(e.ms);
  out.F1[c] = { stills: all.length, rimFound: all.filter((e) => e.q).length, boardFound: all.filter((e) => e.q && e.q.az !== null).length, issues: [...new Set(all.flatMap((e) => e.issues))] };
}
ms.sort((a, b) => a - b); out.F7 = { stills: ms.length, medianMs: ms[ms.length >> 1], p95Ms: ms[Math.floor(ms.length * 0.95)], note: "Node 20 on this Mac at 1920x1080 (the full-resolution path); not a phone number." };

// ---- F2: gate outcome per clip and pooled spread on gate-passing clips
const Q = ["posX", "posY", "size", "az", "off", "asp", "elev", "roll"];
out.gate = {}; for (const c of CLIPS) out.gate[c] = { A: desc[c].A.usable, B: desc[c].B.usable, sdA: Object.fromEntries(Q.map((k) => [k, desc[c].A.q[k] ? +D.gateSpread(k, desc[c].A.q[k]).toFixed(4) : null])), rimFoundA: desc[c].A.rimFound, rimFoundB: desc[c].B.rimFound };
const pooledOver = (clips) => {
  const r = {};
  for (const k of Q) {
    let num = 0, den = 0;
    for (const c of clips) for (const s of ["A", "B"]) { const q = desc[c][s].q[k]; if (q && desc[c][s].usable.includes(k)) { const sp = D.gateSpread(k, q); num += sp * sp * (q.n - 1); den += q.n - 1; } }
    r[k] = den ? +Math.sqrt(num / den).toFixed(4) : null;
  }
  return r;
};
out.pooledDevGatePassing = pooledOver(DEV);
out.pooledValidationGatePassing = pooledOver(VAL.concat(DIAG));
out.pooledDevStrict = (() => { // criteria.json F2 literally: all dev clips, no gate
  const r = {}; for (const k of Q) { let num = 0, den = 0; for (const c of DEV) for (const s of ["A", "B"]) { const q = desc[c][s].q[k]; if (q && q.n > 1) { const sp = D.gateSpread(k, q); num += sp * sp * (q.n - 1); den += q.n - 1; } } r[k] = den ? +Math.sqrt(num / den).toFixed(4) : null; }
  return r;
})();

// ---- F3 positive controls
const cls = (a, b) => D.compareFramingDescriptors(a, b);
const tally = (arr) => arr.reduce((m, c) => ((m[c] = (m[c] || 0) + 1), m), {});
const p1 = [], excluded = ["IMG_4844"];
for (const c of CLIPS) if (!excluded.includes(c)) { const r = cls(desc[c].A, desc[c].B); p1.push({ clip: c, class: r.class, reasons: r.reasons }); }
const p2 = []; for (const a of ["A", "B"]) for (const b of ["A", "B"]) { const r = cls(desc["IMG_4839"][a], desc["IMG_4840"][b]); p2.push({ pair: `4839-${a} vs 4840-${b}`, class: r.class, reasons: r.reasons }); }
out.F3 = { P1: p1, P1_tally: tally(p1.map((x) => x.class)), P2: p2, P2_tally: tally(p2.map((x) => x.class)), note: "P1 = descriptor of stills 1,3,5,7,9 vs descriptor of stills 2,4,6,8,10 of the same clip (an implementation of P1 for descriptors; IMG_4844 excluded because its camera moved)." };

// ---- F6 real pairs
const trueClass = (r) => {
  if (Math.abs(r.shiftX) <= 0.01 && Math.abs(r.shiftY) <= 0.01 && Math.abs(r.scale - 1) <= 0.025 && r.ncc >= 0.8) return "same_camera";
  if (r.ncc < 0.35 || Math.abs(r.shiftX) > 0.03 || Math.abs(r.shiftY) > 0.03 || Math.abs(r.scale - 1) > 0.05) return r.ncc >= 0.5 || r.ncc < 0.35 ? "different_camera" : "unresolved";
  return "unresolved";
};
const rec = (clip) => ds.clips.find((x) => x.id === clip);
const m0 = (a, b) => { const A = rec(a)?.window, B = rec(b)?.window; if (!A?.rim_native || !B?.rim_native) return "not_recorded"; const ax = A.rim_native[0] / 1920, ay = A.rim_native[1] / 1080, bx = B.rim_native[0] / 1920, by = B.rim_native[1] / 1080; return Math.abs(ax - bx) <= 0.02 && Math.abs(ay - by) <= 0.02 && Math.abs(A.scale / B.scale - 1) <= 0.1 ? "comparable" : "not_comparable"; };
out.F6 = { pairs: [] };
for (const [k, r] of Object.entries(bg.cross)) {
  const [a, b] = k.split("|"); const truth = trueClass(r);
  const m1 = cls(desc[a].A, desc[b].A);
  out.F6.pairs.push({ a, b, truth, bg: { shiftX: +r.shiftX.toFixed(3), shiftY: +r.shiftY.toFixed(3), scale: +r.scale.toFixed(3), ncc: r.ncc }, m1: m1.class, m1reasons: m1.reasons, m0: m0(a, b) });
}
const tl = (t) => out.F6.pairs.filter((p) => p.truth === t);
out.F6.summary = {};
for (const t of ["same_camera", "different_camera", "unresolved"]) out.F6.summary[t] = { n: tl(t).length, m1: tally(tl(t).map((p) => p.m1)), m0: tally(tl(t).map((p) => p.m0)) };
// 4844 camera-moved example: first vs last stills (descriptors need >=4 valid stills, which 4844 does not have; report the measurement instead)
out.camera_moved_4844 = { rimFoundOf10: out.F1.IMG_4844.rimFound, background: bg.within.IMG_4844, M0: "not applicable (rim_native does not match the stills)" };

// ---- F4/P3 synthetic
const sp = path.join(dir, "synthetic.json");
if (fs.existsSync(sp)) {
  const syn = JSON.parse(fs.readFileSync(sp)); const byOp = {};
  for (const s of syn) { (byOp[s.op] ||= { kind: s.kind, truth: s.truth, classes: [] }).classes.push(s.class); }
  out.synthetic = Object.fromEntries(Object.entries(byOp).map(([op, v]) => [op, { kind: v.kind, truth: v.truth, n: v.classes.length, ...tally(v.classes) }]));
  const P3 = syn.filter((s) => s.kind === "P3"), N = syn.filter((s) => s.kind === "N");
  out.F3_P3 = { n: P3.length, tally: tally(P3.map((s) => s.class)) };
  out.F4 = { n: N.length, tally: tally(N.map((s) => s.class)), comparableWhenNormalizable: N.filter((s) => s.class === "comparable").length / N.length, notComparableWhenNormalizable: N.filter((s) => s.class === "not_comparable").length / N.length };
  out.F4.byType = {}; for (const [op, v] of Object.entries(byOp)) if (v.kind === "N") out.F4.byType[op] = { n: v.classes.length, comparable: v.classes.filter((c) => c === "comparable").length / v.classes.length, not_comparable: v.classes.filter((c) => c === "not_comparable").length / v.classes.length };
}

// ---- F5 model-based view change (labelled MODEL-BASED)
const sdS = out.pooledDevGatePassing;
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const rad = (d) => (d * Math.PI) / 180;
const e0 = 13;
const model = (theta, elev) => ({ az: 4 * Math.cos(rad(theta)), off: -0.83 * Math.sin(rad(theta)), asp: (72 * Math.cos(rad(theta))) / (42 * Math.cos(rad(elev))) });
const draw = (theta, elev) => {
  const t = model(theta, elev); const stills = [];
  for (let i = 0; i < 5; i++) stills.push({ q: { posX: 0.55 + gauss() * 0.0004, posY: 0.42 + gauss() * 0.0013, size: Math.exp(Math.log(0.02) + gauss() * sdS.size), elev: 0.4 * (1 + gauss() * 0.14), az: t.az * (1 + gauss() * sdS.az), off: t.off + gauss() * sdS.off, asp: t.asp * (1 + gauss() * sdS.asp), roll: gauss() * (sdS.roll ?? 0.45) }, rim: { cx: 1, cy: 1, w: 1, h: 1, n: 1 } });
  return D.describeFraming(stills);
};
out.F5 = { label: "MODEL-BASED (orthographic hoop: board 72x42 in, rim 18 in, rim centre 15 in in front of the board; noise = the measured pooled per-still spread on gate-passing development clips). Not a real-image result.", draws: 1000, cells: [] };
for (const th0 of [10, 20, 40]) for (const dth of [0, 5, 10, 15, 20, 30, 45]) for (const de of [0, 3, 6, 10, 15]) {
  if (de > 0 && dth > 0) continue; // vary one thing at a time
  const c = { comparable: 0, normalizable: 0, not_comparable: 0, unknown: 0 };
  for (let i = 0; i < out.F5.draws; i++) c[D.compareFramingDescriptors(draw(th0, e0), draw(th0 + dth, e0 + de)).class] += 1;
  out.F5.cells.push({ theta0: th0, dTheta: dth, dElev: de, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +(v / out.F5.draws).toFixed(3)])), M3_M0_like: { comparable: 1 } });
}
fs.writeFileSync(path.join(dir, "evaluation.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ F1: out.F1, F7: out.F7, gate: out.gate, pooledDevGatePassing: out.pooledDevGatePassing, pooledDevStrict: out.pooledDevStrict, pooledValidationGatePassing: out.pooledValidationGatePassing, F3: { P1: out.F3.P1, P1_tally: out.F3.P1_tally, P2: out.F3.P2, P2_tally: out.F3.P2_tally }, F6: out.F6.summary }, null, 1));
console.log("F5:"); for (const c of out.F5.cells) console.log(JSON.stringify(c));
