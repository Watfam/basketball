/**
 * Where the live loop's time goes, measured on the phone itself. Off unless localStorage hl:session-review-debug = "1" (same switch as the
 * other timings); when off nothing in here runs. Nothing leaves the phone.
 *
 * One record per loop pass: how long each stage took, whether the model ran, how many camera frames went by. From those it answers
 * the questions a rapid-shot problem depends on: how many frames per second are really analysed, how many camera frames are never looked
 * at, how old a frame is by the time its answer is back, and whether anything stalls near the rim.
 */
import type { Detector } from "./detector";

export const PIPELINE_KEY = "hl:pipeline:report";
/** Experimental pacing (default off): hl:loop-pace = "fresh" (or "1", the lab switch) skips the extra camera-frame wait when a pass ran late and a newer frame is already there. */
export const PACE_KEY = "hl:loop-pace";
export function freshPaceEnabled(read: (k: string) => string | null = (k) => (typeof window === "undefined" ? null : window.localStorage.getItem(k))): boolean {
  try { const v = read(PACE_KEY); return v === "fresh" || v === "1"; } catch { return false; }
}

/**
 * The pacing decision, kept apart so it can be tested: after a pass, wait for another camera frame unless the flag is on, the pass is already
 * past its budget (less the 6 ms the loop allows), and the camera has shown a newer picture than the one that was read.
 */
export function skipFrameWait(fresh: boolean, nowMs: number, dueMs: number, currentTime: number, drawnAt: number): boolean {
  return fresh && nowMs >= dueMs - 6 && currentTime !== drawnAt;
}
/** Stages in loop order. `idle` is the wait before the next pass (pacing), `detect` the whole model round trip. */
export const STAGES = ["idle", "draw", "readback", "motion", "detect", "rules"] as const;
export type Stage = (typeof STAGES)[number];

export type FrameRecord = {
  /** performance.now() at the start of the pass. */
  t0: number;
  /** ms per stage. */
  ms: Record<Stage, number>;
  /** Worker-side parts of the model round trip (ms), when the model ran. */
  prep: number;
  infer: number;
  post: number;
  modelRan: boolean;
  /** A ball was near the rim on this pass or the 20 before it. */
  nearRim: boolean;
  /** Camera frames presented since the previous pass (>= 1 when the camera is running at full rate; null if the browser cannot say). */
  cameraFrames: number | null;
  /** How old the picture was when it was drawn, and when the answer was back (ms). */
  ageAtDraw: number | null;
  ageAtAnswer: number | null;
};

export type Dist = { n: number; median: number; p95: number; p99: number; max: number };
export function dist(values: number[]): Dist {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return { n: 0, median: 0, p95: 0, p99: 0, max: 0 };
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  return { n: s.length, median: at(0.5), p95: at(0.95), p99: at(0.99), max: s[s.length - 1] };
}

export type PipelineReport = {
  at: string;
  seconds: number;
  passes: number;
  /** Passes where the model actually ran (the motion gate skips it while the scene is still). */
  modelRuns: number;
  /** Frames per second looked at: passes / seconds. */
  analysedFps: number;
  modelFps: number;
  /** Frames per second the camera presented, and the share of them never looked at (null if not measurable). */
  cameraFps: number | null;
  skippedPercent: number | null;
  interval: Dist;
  stages: Record<Stage, Dist>;
  worker: { prep: Dist; infer: Dist; post: Dist };
  frameAgeAtAnswer: Dist | null;
  /** Passes longer than 250 ms, and the stage that took longest in each of the worst. */
  stalls: { count: number; worst: { ms: number; stage: Stage; at: number }[] };
  /** Main-thread delay measured by a 50 ms timer (any value well above 0 is something else holding the thread). */
  mainThreadLag: Dist;
  warmup: { firstRunsMedian: number; steadyMedian: number };
  /** The same figures for passes with a ball near the rim: the moments rapid shots happen. */
  nearRim: { passes: number; analysedFps: number; interval: Dist; stalls: number } | null;
  /** Share of each pass's wall time not accounted for by a named stage (garbage collection, other tasks). */
  unaccountedMedian: number;
};

const KEEP = 1500;

export function createPipelineStats(now: () => number = () => performance.now()) {
  const recs: FrameRecord[] = [];
  const lag: number[] = [];
  let cur: Partial<FrameRecord> & { ms: Record<Stage, number> } | null = null;
  let mark0 = 0;
  let lastEnd = 0;
  let started = 0;
  let nearUntil = -1;
  let passes = 0;
  const presented = { last: null as number | null, first: null as number | null, lastAt: 0 };
  let lastPresentedSeen: number | null = null;
  let workerLast: { prep: number; infer: number; post: number } | null = null;

  const blank = (): Record<Stage, number> => ({ idle: 0, draw: 0, readback: 0, motion: 0, detect: 0, rules: 0 });

  return {
    begin(t0: number) {
      if (!started) started = t0;
      cur = { t0, ms: blank(), modelRan: false, prep: 0, infer: 0, post: 0, nearRim: false, cameraFrames: null, ageAtDraw: null, ageAtAnswer: null };
      if (lastEnd) cur.ms.idle = Math.max(0, t0 - lastEnd);
      mark0 = t0;
      workerLast = null;
    },
    /** Closes the stage that just finished. */
    mark(stage: Exclude<Stage, "idle">) {
      if (!cur) return;
      const t = now();
      cur.ms[stage] += t - mark0;
      mark0 = t;
    },
    /** The model round trip reported by the worker. */
    worker(prep: number, infer: number, post: number) {
      workerLast = { prep, infer, post };
    },
    /** Called once the picture is on the canvas: how old it was. */
    drawn(t0: number) {
      if (cur && presented.lastAt) cur.ageAtDraw = Math.max(0, t0 - presented.lastAt);
    },
    /** A camera frame was presented (requestVideoFrameCallback). */
    presentedFrame(at: number, presentedFrames: number | null) {
      presented.lastAt = at;
      if (presentedFrames !== null) {
        presented.first ??= presentedFrames;
        presented.last = presentedFrames;
      }
    },
    lagSample(ms: number) {
      lag.push(ms);
      if (lag.length > 600) lag.splice(0, lag.length - 600);
    },
    /** Finishes the pass. `ballNearRim` is whether this pass saw a ball in or near the rim zone. */
    end(modelRan: boolean, ballNearRim: boolean) {
      if (!cur) return;
      const t = now();
      lastEnd = t;
      const c = cur;
      c.modelRan = modelRan;
      if (ballNearRim) nearUntil = passes + 20;
      c.nearRim = passes <= nearUntil || ballNearRim;
      if (workerLast) {
        c.prep = workerLast.prep;
        c.infer = workerLast.infer;
        c.post = workerLast.post;
      }
      if (presented.last !== null && lastPresentedSeen !== null) c.cameraFrames = presented.last - lastPresentedSeen;
      lastPresentedSeen = presented.last;
      if (c.ageAtDraw != null) c.ageAtAnswer = c.ageAtDraw + (t - (c.t0 as number));
      recs.push(c as FrameRecord);
      if (recs.length > KEEP) recs.splice(0, recs.length - KEEP);
      passes += 1;
    },
    records: () => recs,
    report(): PipelineReport | null {
      return buildReport(recs, lag, presented.first, presented.last);
    },
  };
}

export type PipelineStats = ReturnType<typeof createPipelineStats>;

/** Pure: a report from records. `lag` are main-thread delay samples. */
export function buildReport(recs: FrameRecord[], lag: number[], firstPresented: number | null, lastPresented: number | null): PipelineReport | null {
  if (recs.length < 3) return null;
  const first = recs[0].t0, last = recs[recs.length - 1].t0;
  const seconds = Math.max(0.001, (last - first) / 1000);
  const intervals = recs.slice(1).map((r, i) => r.t0 - recs[i].t0);
  const stage = (s: Stage) => dist(recs.map((r) => r.ms[s]));
  const stages = Object.fromEntries(STAGES.map((s) => [s, stage(s)])) as Record<Stage, Dist>;
  const ran = recs.filter((r) => r.modelRan);
  const stalls = recs.slice(1).map((r, i) => ({ ms: r.t0 - recs[i].t0, rec: recs[i] })).filter((x) => x.ms > 250);
  const worst = [...stalls].sort((a, b) => b.ms - a.ms).slice(0, 5).map((x) => {
    const parts = STAGES.filter((s) => s !== "idle").map((s) => [s, x.rec.ms[s]] as const).sort((a, b) => b[1] - a[1]);
    return { ms: Math.round(x.ms), stage: parts[0][0] as Stage, at: Math.round((x.rec.t0 - first) / 1000) };
  });
  const ages = recs.map((r) => r.ageAtAnswer).filter((v): v is number => v !== null);
  const cameraSeconds = lastPresented !== null && firstPresented !== null ? seconds : null;
  const cameraFps = cameraSeconds && lastPresented !== null && firstPresented !== null ? (lastPresented - firstPresented) / cameraSeconds : null;
  const analysedFps = (recs.length - 1) / seconds;
  const near = recs.filter((r) => r.nearRim);
  const nearIntervals = near.map((r) => { const i = recs.indexOf(r); return i > 0 ? r.t0 - recs[i - 1].t0 : NaN; });
  const warm = ran.slice(0, 10).map((r) => r.ms.detect), steady = ran.slice(10).map((r) => r.ms.detect);
  const work = (r: FrameRecord) => STAGES.filter((s) => s !== "idle").reduce((a, s) => a + r.ms[s], 0);
  const unaccounted = recs.slice(1).map((r, i) => Math.max(0, intervals[i] - work(recs[i]) - r.ms.idle));
  return {
    at: new Date().toISOString(),
    seconds: Math.round(seconds),
    passes: recs.length,
    modelRuns: ran.length,
    analysedFps: +analysedFps.toFixed(1),
    modelFps: +(ran.length / seconds).toFixed(1),
    cameraFps: cameraFps === null ? null : +cameraFps.toFixed(1),
    skippedPercent: cameraFps && cameraFps > 0 ? +Math.max(0, 100 * (1 - analysedFps / cameraFps)).toFixed(0) : null,
    interval: dist(intervals),
    stages,
    worker: { prep: dist(ran.map((r) => r.prep)), infer: dist(ran.map((r) => r.infer)), post: dist(ran.map((r) => r.post)) },
    frameAgeAtAnswer: ages.length ? dist(ages) : null,
    stalls: { count: stalls.length, worst },
    mainThreadLag: dist(lag),
    warmup: { firstRunsMedian: dist(warm).median, steadyMedian: dist(steady).median },
    nearRim: near.length >= 3 ? { passes: near.length, analysedFps: +(1000 / Math.max(1, dist(nearIntervals).median)).toFixed(1), interval: dist(nearIntervals), stalls: nearIntervals.filter((v) => v > 250).length } : null,
    unaccountedMedian: dist(unaccounted).median,
  };
}

/** Plain text for pasting into a message. */
export function formatReport(r: PipelineReport): string {
  const d = (x: Dist) => `${x.median.toFixed(0)} / ${x.p95.toFixed(0)} / ${x.p99.toFixed(0)} ms (n=${x.n})`;
  const lines = [
    `Camera throughput, ${r.seconds} s, ${r.passes} passes (${r.modelRuns} model runs)`,
    `Analysed ${r.analysedFps} fps; model ${r.modelFps} fps; camera ${r.cameraFps ?? "unknown"} fps; camera frames never looked at: ${r.skippedPercent === null ? "unknown" : r.skippedPercent + "%"}`,
    `Time between passes (median / 95th / 99th): ${d(r.interval)}`,
    ...STAGES.map((s) => `  ${s}: ${d(r.stages[s])}`),
    `Model, worker side: prep ${d(r.worker.prep)}; inference ${d(r.worker.infer)}; post ${d(r.worker.post)}`,
    `Picture age when the answer is back: ${r.frameAgeAtAnswer ? d(r.frameAgeAtAnswer) : "unknown"}`,
    `Stalls over 250 ms: ${r.stalls.count}${r.stalls.worst.length ? " (worst " + r.stalls.worst.map((w) => `${w.ms} ms at ${w.at}s in ${w.stage}`).join("; ") + ")" : ""}`,
    `Main-thread lag: ${d(r.mainThreadLag)}`,
    `Warm-up: first model runs ${r.warmup.firstRunsMedian.toFixed(0)} ms, steady ${r.warmup.steadyMedian.toFixed(0)} ms`,
    r.nearRim ? `Ball near the rim: ${r.nearRim.passes} passes, ${r.nearRim.analysedFps} fps analysed, gap ${d(r.nearRim.interval)}, ${r.nearRim.stalls} stalls` : "Ball near the rim: too few passes to say",
    `Unaccounted time per pass (median): ${r.unaccountedMedian.toFixed(1)} ms`,
  ];
  return lines.join("\n");
}

/** Wraps a detector so the worker-side timings are kept. The wrapper returns exactly what the detector returned. */
export function instrumentDetector(detector: Detector, stats: PipelineStats) {
  const original = detector.detect.bind(detector);
  detector.detect = async (frame) => {
    const result = await original(frame);
    const t = (result as { timings?: { prepMs?: number; inferMs?: number; postMs?: number } }).timings;
    if (t) stats.worker(t.prepMs ?? 0, t.inferMs ?? 0, t.postMs ?? 0);
    return result;
  };
}

type VideoWithFrames = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { presentedFrames?: number }) => void) => number };

/**
 * Starts the two probes that need the browser: camera frames presented, and main-thread lag. Returns a stop function. Stops by itself
 * if no pass has begun for 3 seconds (the camera was closed).
 */
export function startProbes(video: HTMLVideoElement, stats: PipelineStats, alive: () => boolean): () => void {
  let on = true;
  const v = video as VideoWithFrames;
  const tick = (now: number, meta?: { presentedFrames?: number }) => {
    if (!on || !alive()) return;
    stats.presentedFrame(now, meta?.presentedFrames ?? null);
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick);
  };
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick);
  let expected = performance.now() + 50;
  const timer = setInterval(() => {
    if (!on || !alive()) return;
    const t = performance.now();
    stats.lagSample(Math.max(0, t - expected));
    expected = t + 50;
  }, 50);
  return () => { on = false; clearInterval(timer); };
}

export function persistReport(stats: PipelineStats) {
  try {
    const r = stats.report();
    if (r) window.localStorage.setItem(PIPELINE_KEY, JSON.stringify(r));
  } catch { /* storage unavailable */ }
}
export function loadReport(): PipelineReport | null {
  try { return JSON.parse(window.localStorage.getItem(PIPELINE_KEY) ?? "null"); } catch { return null; }
}
