"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PlayCourt } from "@/components/plays/play-court";
import { computeContentBounds } from "@/lib/plays/bounds";
import { DEFENSE_IDS, OFFENSE_IDS, type DefenseId, type Frame, type OffenseId } from "@/lib/plays/types";
import type { Reason, ReplayData } from "@/lib/sim/engine";
import { cx } from "@/components/ui/cx";

const SPEEDS = [0.5, 1, 2] as const;
const TONE_DOT: Record<Reason["tone"], string> = { bad: "bg-danger", good: "bg-data-positive", note: "bg-foreground-mute" };

function frameAt(replay: ReplayData, k: number, lastHolder: OffenseId): Frame {
  const t = replay.ticks[k];
  return {
    offense: OFFENSE_IDS.map((id, i) => ({ id, pos: t.o[i] })),
    defense: DEFENSE_IDS.map((id, i) => ({ id, man: OFFENSE_IDS[i], coverage: "manual" as const, manualPos: t.x[i] })),
    ballHolder: t.holder ?? lastHolder,
    lines: [],
    note: "",
  };
}

/** Plays one simulated run back on the court: our five, their five as the model moved them, and the ball. Tapping a coaching point jumps to the moment it happens. */
export function MatchupReplay({ replay, reasons }: { replay: ReplayData; reasons: Reason[] }) {
  const last = replay.ticks.length - 1;
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [focus, setFocus] = useState<number | null>(null);
  const posRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let raf: number;
    let prev: number | null = null;
    posRef.current = tick;
    const step = (now: number) => {
      const dt = prev === null ? 0 : (now - prev) / 1000;
      prev = now;
      posRef.current = Math.min(last, posRef.current + (dt * speed) / replay.dt);
      setTick(Math.round(posRef.current));
      if (posRef.current >= last) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // The loop owns the position once it starts; restarting on every tick would reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, last, replay.dt]);

  const region = useMemo(() => {
    const frames: Frame[] = [];
    for (let i = 0; i <= last; i += 4) frames.push(frameAt(replay, i, "O1"));
    frames.push(frameAt(replay, last, "O1"));
    return computeContentBounds(frames);
  }, [replay, last]);

  const holderHistory = useMemo(() => {
    const out: OffenseId[] = [];
    for (const t of replay.ticks) out.push(t.holder ?? out[out.length - 1] ?? replay.ticks.find((x) => x.holder)?.holder ?? "O1");
    return out;
  }, [replay]);

  const t = replay.ticks[tick];
  const focused = focus !== null ? reasons[focus] : null;
  const highlight: DefenseId | null = focused?.defender ?? null;

  function jump(i: number) {
    const r = reasons[i];
    if (r.tick === undefined) return;
    setFocus(i);
    const start = Math.max(0, r.tick - 8);
    posRef.current = start;
    setTick(start);
    setPlaying(true);
  }

  function toggle() {
    if (!playing && tick >= last) {
      posRef.current = 0;
      setTick(0);
    }
    setPlaying((p) => !p);
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <PlayCourt
          frame={frameAt(replay, tick, holderHistory[tick])}
          tool="move"
          dragging={null}
          onTapPlayer={() => {}}
          onMovePlayer={() => {}}
          onDragStateChange={() => {}}
          onAddLine={() => {}}
          onEraseLine={() => {}}
          ballOverride={t.ball}
          interactive={false}
          region={region}
          highlightId={highlight}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="min-h-11 min-w-20 rounded-xl bg-accent px-4 text-xs font-extrabold uppercase tracking-[0.1em] text-on-accent hover:bg-accent-hover"
        >
          {playing ? "Pause" : tick >= last ? "Replay" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={last}
          value={tick}
          aria-label="Position in the play"
          onChange={(e) => {
            const v = Number(e.target.value);
            setPlaying(false);
            posRef.current = v;
            setTick(v);
          }}
          className="h-11 min-w-0 flex-1 accent-[var(--accent)]"
        />
        <div className="flex overflow-hidden rounded-lg border border-line-strong">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={cx("min-h-9 px-2 text-[11px] font-extrabold tabular-nums", speed === s ? "bg-accent text-on-accent" : "bg-surface text-foreground-dim hover:text-foreground")}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-1.5">
        {reasons.map((r, i) => {
          const seekable = r.tick !== undefined;
          const Tag = seekable ? "button" : "div";
          return (
            <li key={i}>
              <Tag
                {...(seekable ? { type: "button" as const, onClick: () => jump(i) } : {})}
                className={cx(
                  "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm leading-snug text-foreground",
                  focus === i ? "border-accent bg-raised" : "border-line bg-surface",
                  seekable && "hover:border-line-strong",
                )}
              >
                <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[r.tone])} />
                <span className="min-w-0 flex-1">{r.text}</span>
                {seekable && <span className="mt-0.5 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-accent">Watch</span>}
              </Tag>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
