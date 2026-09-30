"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createDetector, type Optimization } from "@/lib/vision/detector";
import { probeRawGpu } from "@/lib/vision/gpu-probes";
import { gradientFrame } from "@/lib/vision/test-frame";
import { readDraft, useLocalDraft, writeDraft } from "@/lib/use-local-draft";
import { describeWake, getWakeStatus, useWakeLock } from "@/lib/use-wake-lock";

/**
 * Repeated, interleaved trials of the setups that might be killing the
 * page, counting how many survive.
 *
 * The crash turned out to be random: the same setup died once and lived
 * the next time. A single run therefore proves nothing either way. Each
 * setup here runs several times, round-robin so heat and time of day hit
 * them all equally, and after every crash the page restarts the next trial
 * by itself, so one tap starts a test that needs no one watching it.
 *
 * A trial during which the page was hidden (screen locked, app switched)
 * is thrown out as invalid rather than counted as a survival or a death.
 */

const KEY = "hl:survival";
const ROUNDS = 4;
const RESUME_SECONDS = 6;

type CfgId = "gpu" | "gpu-basic" | "gpu-off" | "raw" | "cpu" | "cpu-long";

type Cfg = {
  id: CfgId;
  label: string;
  what: string;
  seconds: number;
  trials: number;
  backend?: "webgpu" | "wasm";
  optimization?: Optimization;
};

const CONFIGS: Cfg[] = [
  {
    id: "gpu",
    label: "Model on the GPU (as it is now)",
    what: "The setup that has been dying.",
    seconds: 45,
    trials: ROUNDS,
    backend: "webgpu",
    optimization: "all",
  },
  {
    id: "gpu-basic",
    label: "Model on the GPU, simpler rewrite",
    what: "Same, but the runtime rewrites the model less before running it, which changes which GPU programs run.",
    seconds: 45,
    trials: ROUNDS,
    backend: "webgpu",
    optimization: "basic",
  },
  {
    id: "gpu-off",
    label: "Model on the GPU, no rewrite",
    what: "Same, with no rewriting at all: the plainest GPU programs.",
    seconds: 45,
    trials: ROUNDS,
    backend: "webgpu",
    optimization: "disabled",
  },
  {
    id: "raw",
    label: "Raw GPU work, no model",
    what: "Same pattern of GPU calls with none of the model. Shows whether it is the model or the GPU itself.",
    seconds: 45,
    trials: ROUNDS,
  },
  {
    id: "cpu",
    label: "Model on the CPU",
    what: "No GPU at all.",
    seconds: 45,
    trials: ROUNDS,
    backend: "wasm",
    optimization: "all",
  },
  {
    id: "cpu-long",
    label: "Model on the CPU, 3 minutes",
    what: "One long run: can the CPU route be trusted for a whole session?",
    seconds: 180,
    trials: 1,
    backend: "wasm",
    optimization: "all",
  },
];

type Trial = {
  cfg: CfgId;
  round: number;
  status: "survived" | "died" | "invalid" | "error";
  seconds: number;
  frames: number;
  note: string;
};

type State = {
  startedAt: string;
  build: string;
  standalone: boolean;
  cancelled: boolean;
  trials: Trial[];
  running: { cfg: CfgId; round: number; beat: number; frames: number; hidden: boolean } | null;
};

const PLAN: { cfg: Cfg; round: number }[] = [];
for (let round = 1; round <= ROUNDS; round += 1) {
  for (const cfg of CONFIGS) if (round <= cfg.trials) PLAN.push({ cfg, round });
}

const keyOf = (cfg: CfgId, round: number) => `${cfg}#${round}`;
const noSubscribe = () => () => {};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (n: number, dp = 1) => n.toFixed(dp);

function parse(raw: string | null): State | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as State;
  } catch {
    return null;
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Finished trials, plus one that was running when the page vanished. */
function withDeath(state: State | null, live: boolean): Trial[] {
  if (!state) return [];
  if (state.running && !live) {
    const r = state.running;
    return [
      ...state.trials,
      {
        cfg: r.cfg,
        round: r.round,
        status: r.hidden ? "invalid" : "died",
        seconds: r.beat,
        frames: r.frames,
        note: r.hidden ? "the page was hidden, so this does not count" : "the browser closed the page",
      },
    ];
  }
  return state.trials;
}

function summarize(trials: Trial[], cfg: Cfg) {
  const mine = trials.filter((t) => t.cfg === cfg.id && t.status !== "invalid");
  const survived = mine.filter((t) => t.status === "survived").length;
  const deaths = mine.filter((t) => t.status === "died").map((t) => t.seconds);
  const errors = mine.filter((t) => t.status === "error").length;
  return { counted: mine.length, survived, deaths, errors, invalid: trials.filter((t) => t.cfg === cfg.id && t.status === "invalid").length };
}

function reportText(state: State, trials: Trial[]) {
  const lines = [
    `Survival test — ${new Date(state.startedAt).toLocaleString()}`,
    `Version ${state.build} · ${state.standalone ? "home-screen app" : "Safari tab"}`,
    `Device: ${navigator.userAgent}`,
    "",
  ];
  for (const cfg of CONFIGS) {
    const s = summarize(trials, cfg);
    lines.push(
      `${cfg.label}: survived ${s.survived} of ${s.counted}` +
        (s.deaths.length ? `; died at ${s.deaths.map((d) => `${fmt(d)}s`).join(", ")}` : "") +
        (s.errors ? `; ${s.errors} errors` : "") +
        (s.invalid ? `; ${s.invalid} thrown out (page hidden)` : "")
    );
  }
  lines.push("", "Every trial, in the order they ran:");
  for (const t of trials) {
    const cfg = CONFIGS.find((c) => c.id === t.cfg);
    lines.push(
      `  ${cfg?.id ?? t.cfg} #${t.round}: ${t.status} at ${fmt(t.seconds)}s, ${t.frames} frames${t.note ? ` · ${t.note}` : ""}`
    );
  }
  return lines.join("\n");
}

export function SurvivalTest() {
  const [raw] = useLocalDraft(KEY);
  const state = parse(raw);
  const [live, setLive] = useState(false);
  const [countdown, setCountdown] = useState(RESUME_SECONDS);
  const [shared, setShared] = useState<"" | "copied" | "failed">("");
  const stopRef = useRef(false);
  const goRef = useRef<(fresh: boolean) => Promise<void>>(async () => {});
  const standalone = useSyncExternalStore(noSubscribe, isStandalone, () => null);
  useWakeLock(live);

  const trials = withDeath(state, live);
  const doneKeys = new Set(trials.map((t) => keyOf(t.cfg, t.round)));
  const nextItem = PLAN.find((p) => !doneKeys.has(keyOf(p.cfg.id, p.round))) ?? null;
  const finished = !!state && nextItem === null;
  const canAuto = !!state && !live && !state.cancelled && nextItem !== null;
  const wasCutOff = !!state?.running;

  function update(fn: (s: State) => State) {
    const current = parse(readDraft(KEY));
    if (current) writeDraft(KEY, JSON.stringify(fn(current)));
  }

  async function runTrial(cfg: Cfg, round: number): Promise<Trial["status"]> {
    const override = Number(new URLSearchParams(window.location.search).get("t"));
    const seconds = override > 0 ? override : cfg.seconds;
    let origin = performance.now();
    let frames = 0;
    let hidden = false;
    const isStopped = () => stopRef.current;

    update((s) => ({ ...s, running: { cfg: cfg.id, round, beat: 0, frames: 0, hidden: false } }));
    const heartbeat = setInterval(() => {
      update((s) =>
        s.running
          ? { ...s, running: { ...s.running, beat: (performance.now() - origin) / 1000, frames, hidden } }
          : s
      );
    }, 500);
    const onVisibility = () => {
      if (document.hidden) hidden = true;
    };
    document.addEventListener("visibilitychange", onVisibility);

    let note = "";
    let status: Trial["status"] = "survived";
    try {
      if (cfg.id === "raw") {
        const r = await probeRawGpu("ortlike", {
          seconds,
          isStopped,
          beat: (n) => (frames = n),
        });
        frames = r.frames;
      } else {
        const detector = await createDetector(cfg.backend ?? "webgpu", () => {}, {
          optimization: cfg.optimization,
          onEvent: (text) => {
            note += `${note ? "; " : ""}${text}`;
          },
        });
        try {
          const frame = gradientFrame(640, 360);
          origin = performance.now();
          while (!isStopped() && (performance.now() - origin) / 1000 < seconds) {
            const start = performance.now();
            await detector.detect(frame);
            frames += 1;
            const spare = 1000 / 30 - (performance.now() - start);
            await sleep(spare > 1 ? spare : 0);
          }
          note += `${note ? "; " : ""}${fmt(frames / Math.max(0.001, (performance.now() - origin) / 1000))} fps`;
        } finally {
          await detector.dispose();
        }
      }
      if (isStopped()) status = "error";
      if (isStopped()) note = "stopped by you";
    } catch (e) {
      status = "error";
      note = e instanceof Error ? e.message : String(e);
    } finally {
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
    }

    if (hidden) {
      status = "invalid";
      note = "the page was hidden during this trial, so it does not count";
    }
    note += `${note ? " · " : ""}${describeWake(getWakeStatus())}`;

    const result: Trial = {
      cfg: cfg.id,
      round,
      status,
      seconds: (performance.now() - origin) / 1000,
      frames,
      note,
    };
    update((s) => ({ ...s, running: null, trials: [...s.trials, result] }));
    return status;
  }

  async function go(fresh: boolean) {
    stopRef.current = false;
    if (fresh) {
      writeDraft(
        KEY,
        JSON.stringify({
          startedAt: new Date().toISOString(),
          build: process.env.NEXT_PUBLIC_BUILD ?? "local",
          standalone: isStandalone(),
          cancelled: false,
          trials: [],
          running: null,
        } satisfies State)
      );
    } else {
      update((s) => ({ ...s, cancelled: false, trials: withDeath(s, false), running: null }));
    }

    setLive(true);
    try {
      for (;;) {
        const current = parse(readDraft(KEY));
        const finishedKeys = new Set((current?.trials ?? []).map((t) => keyOf(t.cfg, t.round)));
        const item = PLAN.find((p) => !finishedKeys.has(keyOf(p.cfg.id, p.round)));
        if (!item || stopRef.current) break;
        await runTrial(item.cfg, item.round);
        await sleep(1500);
      }
    } finally {
      setLive(false);
    }
  }

  useEffect(() => {
    goRef.current = go;
  });

  // After a crash the next trial starts by itself; this is what makes the
  // test hands-off. Cancel stops it.
  useEffect(() => {
    if (!canAuto || !wasCutOff) return;
    let left = RESUME_SECONDS;
    const id = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        clearInterval(id);
        void goRef.current(false);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [canAuto, wasCutOff]);

  async function copyOrShare(share: boolean) {
    if (!state) return;
    const text = reportText(state, trials);
    try {
      if (share && typeof navigator.share === "function") await navigator.share({ title: "Survival test", text });
      else {
        await navigator.clipboard.writeText(text);
        setShared("copied");
      }
    } catch {
      if (!share) setShared("failed");
    }
    setTimeout(() => setShared(""), 2500);
  }

  const resuming = canAuto && wasCutOff;
  const doneCount = trials.filter((t) => t.status !== "invalid").length;
  const current = live ? state?.running : null;

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-foreground-dim">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">How to run it</p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>Restart the iPhone first, then open this page from the home screen.</li>
          <li>
            Plug the phone in and set it down <strong className="text-foreground">face up, screen on</strong>.
            Do not touch it or switch apps: that throws a trial out.
          </li>
          <li>
            Tap Start. The screen will go black and the page will reload now and then. That is expected:
            it restarts itself a few seconds later and carries on. It takes roughly 20 minutes in all.
          </li>
        </ol>
        <p className="text-foreground-mute">
          {standalone === null ? "" : standalone ? "Home-screen app." : "Safari tab."} Version{" "}
          {process.env.NEXT_PUBLIC_BUILD}
        </p>
      </section>

      <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        {CONFIGS.map((cfg) => {
          const s = summarize(trials, cfg);
          const isCurrent = current?.cfg === cfg.id;
          return (
            <div key={cfg.id} className="rounded-lg border border-line p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{cfg.label}</p>
                <p className="shrink-0 text-[11px] font-extrabold uppercase tabular-nums text-foreground-dim">
                  {s.counted === 0 ? "—" : `${s.survived} of ${s.counted} survived`}
                </p>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-foreground-mute">{cfg.what}</p>
              {(s.deaths.length > 0 || isCurrent) && (
                <p className="mt-1 text-[11px] leading-snug text-foreground-dim">
                  {isCurrent && current ? `Running trial ${current.round}: ${fmt(current.beat, 0)} s. ` : ""}
                  {s.deaths.length ? `Died at ${s.deaths.map((d) => `${fmt(d, 0)}s`).join(", ")}.` : ""}
                </p>
              )}
            </div>
          );
        })}
        <p className="pt-1 text-[11px] text-foreground-mute">
          {doneCount} of {PLAN.length} trials done.
        </p>
      </section>

      {resuming && (
        <p className="rounded-lg bg-[var(--raised)] p-3 text-xs leading-relaxed text-foreground-dim">
          The last trial was cut off. Carrying on in {Math.max(0, countdown)} s.
        </p>
      )}

      <div className="space-y-2">
        {!live && !state && (
          <button
            type="button"
            onClick={() => void go(true)}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white"
          >
            Start the survival test
          </button>
        )}
        {!live && state && nextItem && (
          <button
            type="button"
            onClick={() => void go(false)}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white"
          >
            {resuming ? "Carry on now" : "Continue"}
          </button>
        )}
        {resuming && (
          <button
            type="button"
            onClick={() => update((s) => ({ ...s, cancelled: true }))}
            className="w-full rounded-xl border border-accent py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-accent"
          >
            Cancel automatic restart
          </button>
        )}
        {live && (
          <button
            type="button"
            onClick={() => {
              stopRef.current = true;
              update((s) => ({ ...s, cancelled: true }));
            }}
            className="w-full rounded-xl border border-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-accent"
          >
            Stop
          </button>
        )}
        {!live && state && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void copyOrShare(true)}
              className="flex-1 rounded-xl bg-accent py-3 text-[11px] font-extrabold uppercase tracking-wide text-white"
            >
              Share or save
            </button>
            <button
              type="button"
              onClick={() => void copyOrShare(false)}
              className="flex-1 rounded-xl border border-accent py-3 text-[11px] font-extrabold uppercase tracking-wide text-accent"
            >
              {shared === "copied" ? "Copied" : shared === "failed" ? "Copy blocked" : "Copy results"}
            </button>
          </div>
        )}
        {!live && state && (
          <button
            type="button"
            onClick={() => writeDraft(KEY, null)}
            className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute"
          >
            {finished ? "Clear and start over" : "Discard these results and start over"}
          </button>
        )}
      </div>

      {state && !live && (
        <details>
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
            Show as text
          </summary>
          <textarea
            readOnly
            rows={16}
            value={reportText(state, trials)}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-lg border border-line bg-[var(--raised)] p-2 font-mono text-[10px] leading-snug text-foreground-dim"
          />
        </details>
      )}
    </div>
  );
}
