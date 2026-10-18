"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { compareShots, framingGroups, phonePosition } from "@/lib/review/history-core";
import type { CameraSetup, HistorySession, HistoryShot } from "@/lib/review/history-types";
import { setupGroups } from "@/lib/review/history-view";
import { CONFIDENCE, plainReasons, shotSummary } from "@/lib/review/plain";
import { COMPARE_CAUTION, hasUsablePath, observedDifferences, sceneOf, sightingTimes, stepTime, summarizePatterns, syncPoint, type Scene } from "@/lib/review/shot-scene";
import { MAKE_COLOR, MISS_COLOR, THIRD_COLOR, ShotStage, type Layer } from "@/components/shots/shot-stage";
import { usePlayback } from "@/components/shots/use-playback";
import { haptic } from "@/lib/haptics";

type Mode = "watch" | "compare" | "patterns";

// Scenes are built only for the shots actually looked at, then kept: a long history is not worked through up front.
const SCENES = new WeakMap<HistoryShot, Scene>();
function cachedScene(shot: HistoryShot): Scene {
  let sc = SCENES.get(shot);
  if (!sc) { sc = sceneOf(shot); SCENES.set(shot, sc); }
  return sc;
}
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const colorOf = (made: boolean) => (made ? MAKE_COLOR : MISS_COLOR);
const DOT = { tracked: "bg-accent", partial: "bg-foreground-dim", unreliable: "bg-foreground-mute", none: "bg-line-strong" } as const;
const btnBase = "min-h-12 rounded-xl border px-3 text-sm font-extrabold active:scale-[0.98] disabled:opacity-40";
const btn = `${btnBase} border-line bg-raised text-foreground`;
// Not built from `btn`: two background utilities on one element are won by whichever the stylesheet lists last, which left dark text on a dark button.
const btnPrimary = `${btnBase} border-accent bg-accent text-on-accent`;

/**
 * Looking at saved shots, as three simple things: watch one shot, compare two, or see where a group of shots went. Each answers one question.
 * It shows what the camera saw, in the camera's own picture, and never says why a shot went in or missed. Everything else the app can work out
 * about these shots (every path at once, the measurements, the statistics) is behind "Advanced", passed in as `advanced`.
 */
export function ShotExplorer({ sessions, shots, advanced, initial, onSetup }: { sessions: HistorySession[]; shots: HistoryShot[]; advanced?: React.ReactNode; initial?: { sessionKey?: string; shotId?: string }; /** Saves the player's answer about the phone for these sets. Left out where nothing can be saved (the replay sample). */ onSetup?: (sessionKeys: string[], setup: CameraSetup) => void }) {
  const groups = useMemo(() => setupGroups(framingGroups(sessions), shots), [sessions, shots]);
  const [mode, setMode] = useState<Mode>("watch");
  const startGroup = Math.max(0, groups.findIndex((g) => g.sessions.some((s) => s.sessionKey === initial?.sessionKey)));
  const [gi, setGi] = useState(startGroup);
  const group = groups[Math.min(gi, groups.length - 1)];
  const [setKey, setSetKey] = useState<string | null>(initial?.sessionKey ?? null);
  // A set whose phone answer changed can move to another group; then "all sets" is shown rather than an empty list.
  const activeKey = group && setKey && group.sessions.some((s) => s.sessionKey === setKey) ? setKey : null;
  const inScope = useMemo(() => (group ? group.shots.filter((s) => !activeKey || s.sessionKey === activeKey) : []), [group, activeKey]);
  const sceneFor = cachedScene;
  const bySession = useMemo(() => new Map(sessions.map((s) => [s.sessionKey, s])), [sessions]);

  const best = (made?: boolean) => [...inScope].reverse().find((s) => hasUsablePath(s) && (made === undefined || s.made === made));
  const [watchId, setWatchId] = useState<string | null>(initial?.shotId ?? null);
  const watchShot = inScope.find((s) => s.id === watchId) ?? best() ?? inScope[inScope.length - 1] ?? null;
  const [cmp, setCmp] = useState<{ a: string | null; b: string | null }>({ a: null, b: null });
  const cmpA = inScope.find((s) => s.id === cmp.a) ?? best(true) ?? null;
  const cmpB = inScope.find((s) => s.id === cmp.b) ?? best(false) ?? null;

  if (!group) return null;
  const watch = (id: string) => { setWatchId(id); setMode("watch"); };
  const compare = (a: string, b: string) => { setCmp({ a, b }); setMode("compare"); };

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="How to look at your shots" className="grid grid-cols-3 gap-1 rounded-xl bg-raised p-1">
        {([["watch", "Watch a shot"], ["compare", "Compare two"], ["patterns", "Where they went"]] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { haptic("tap"); setMode(k); }} className={`min-h-11 rounded-lg px-1 text-xs font-extrabold ${mode === k ? "bg-surface text-accent shadow-sm" : "text-foreground-dim"}`}>{t}</button>
        ))}
      </div>

      {groups.length > 1 && (
        <label className="block text-[12px] text-foreground-dim">Camera setup
          <select value={Math.min(gi, groups.length - 1)} onChange={(e) => { setGi(+e.target.value); setSetKey(null); setWatchId(null); setCmp({ a: null, b: null }); }} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-2 text-base text-foreground">
            {groups.map((g, i) => <option key={i} value={i}>Setup {i + 1}: {g.sessions.length} set{g.sessions.length === 1 ? "" : "s"}, {g.shots.length} shots ({date(g.sessions[0].startedAt)})</option>)}
          </select>
          <span className="mt-1 block text-[11px] text-foreground-mute">Sets filmed from a different spot or zoom are kept apart. Their pictures cannot be fairly put side by side.</span>
        </label>
      )}

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Which set">
        {[{ key: null as string | null, label: `All ${group.shots.length} shots` }, ...group.sessions.map((s) => ({ key: s.sessionKey as string | null, label: `${date(s.startedAt)}${s.label ? ` · ${s.label}` : ""}` }))].map((o) => (
          <button key={String(o.key)} type="button" aria-pressed={activeKey === o.key} onClick={() => { setSetKey(o.key); setWatchId(null); setCmp({ a: null, b: null }); }} className={`min-h-11 shrink-0 rounded-full border px-3.5 text-xs font-bold ${activeKey === o.key ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground-dim"}`}>{o.label}</button>
        ))}
      </div>

      {mode === "watch" && (watchShot ? <Watch key={watchShot.id} shot={watchShot} all={inScope} scene={sceneFor(watchShot)} sessions={bySession} onPick={setWatchId} /> : <Empty />)}
      {mode === "compare" && <Compare key={`${cmpA?.id}-${cmpB?.id}`} a={cmpA} b={cmpB} all={inScope} sceneFor={sceneFor} sessions={bySession} onPick={setCmp} />}
      {mode === "patterns" && <Patterns shots={inScope} sessions={activeKey ? group.sessions.filter((x) => x.sessionKey === activeKey) : group.sessions} onWatch={watch} onCompare={compare} onSetup={onSetup} />}

      {advanced}
    </div>
  );
}

const Empty = () => <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-4 text-center text-sm text-foreground-dim">No shots in this set have a saved path.</p>;

/** More shots than this are not all drawn as chips at once on a phone: the newest are, the selected one is always there, and the rest are one tap away. */
const CHIPS_AT_MOST = 40;
/** Where each chip row was scrolled to. Picking a shot rebuilds the screen below it (it is keyed by the shot), and a row that began again at the left would lose the player's place. */
const chipScroll = new Map<string, number>();
function Chips({ all, selected, onPick, label }: { all: HistoryShot[]; selected: string[]; onPick: (id: string) => void; label: string }) {
  const [showAll, setShowAll] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    if (list.current) list.current.scrollLeft = chipScroll.get(label) ?? 0;
  }, [label]);
  // The chosen shot is kept in view (it may have been chosen with Shot ›, or be new to this row), without moving the row otherwise.
  const chosen = selected.join(",");
  useLayoutEffect(() => {
    const ul = list.current;
    const on = ul?.querySelector<HTMLElement>("[aria-pressed=true]")?.closest("li");
    if (!ul || !on) return;
    const left = on.offsetLeft - ul.offsetLeft, right = left + on.offsetWidth;
    if (left < ul.scrollLeft + 8 || right > ul.scrollLeft + ul.clientWidth - 8) ul.scrollLeft = Math.max(0, left - (ul.clientWidth - on.offsetWidth) / 2);
    chipScroll.set(label, ul.scrollLeft);
  }, [chosen, label]);
  const shown = useMemo(() => {
    if (showAll || all.length <= CHIPS_AT_MOST) return all;
    const newest = all.slice(-CHIPS_AT_MOST), ids = new Set(newest.map((x) => x.id));
    return [...all.filter((x) => selected.includes(x.id) && !ids.has(x.id)), ...newest];
  }, [all, showAll, selected]);
  return (
    <>
      <ul ref={list} onScroll={(e) => chipScroll.set(label, e.currentTarget.scrollLeft)} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={label}>
        {shown.map((s) => {
          const on = selected.includes(s.id);
          return (
            <li key={s.id} className="relative shrink-0">
              <button type="button" aria-pressed={on} aria-label={`Shot ${s.seq}, ${s.made ? "make" : "miss"}, ${CONFIDENCE[s.quality.level].label}`} onClick={() => { haptic("tap"); onPick(s.id); }}
                className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-3 text-xs font-extrabold ${on ? "border-foreground bg-surface text-foreground" : "border-line text-foreground-dim"}`} style={{ borderColor: on ? colorOf(s.made) : undefined }}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[s.quality.level]}`} aria-hidden />
                <span style={{ color: colorOf(s.made) }} aria-hidden>{s.made ? "✓" : "✕"}</span>{s.seq}
                {!hasUsablePath(s) && <span className="sr-only"> (no clear path)</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length < all.length && <button type="button" onClick={() => setShowAll(true)} className="min-h-11 text-[11px] font-extrabold text-accent underline underline-offset-2">Show all {all.length} shots</button>}
    </>
  );
}

function Controls({ pb, times, onStep, onShot }: { pb: ReturnType<typeof usePlayback>; times: number[]; onStep: (d: 1 | -1) => void; onShot?: (d: 1 | -1) => void }) {
  return (
    <>
      <div className="grid grid-cols-5 gap-1.5">
        <button type="button" className={btn} onClick={() => onShot?.(-1)} disabled={!onShot} aria-label="Previous shot">‹ Shot</button>
        <button type="button" className={btn} onClick={() => onStep(-1)} aria-label="Back one sighting">◂</button>
        <button type="button" className={btnPrimary} onClick={() => { haptic("tap"); pb.play(); }} aria-label={pb.playing ? "Pause" : "Play"}>{pb.playing ? "Pause" : "Play"}</button>
        <button type="button" className={btn} onClick={() => onStep(1)} aria-label="Forward one sighting">▸</button>
        <button type="button" className={btn} onClick={() => onShot?.(1)} disabled={!onShot} aria-label="Next shot">Shot ›</button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input type="range" min={Math.min(...times)} max={Math.max(...times)} step={1} value={pb.t} onChange={(e) => pb.seek(+e.target.value)} aria-label="Moment in the shot" className="h-11 min-w-0 flex-1" />
        <button type="button" onClick={() => pb.setSpeed(pb.speed === 1 ? 0.5 : 1)} aria-pressed={pb.speed === 0.5} className="min-h-11 shrink-0 rounded-lg border border-line px-3 text-xs font-extrabold text-foreground-dim">{pb.speed === 0.5 ? "Half speed" : "Full speed"}</button>
      </div>
    </>
  );
}

function Watch({ shot, all, scene, sessions, onPick }: { shot: HistoryShot; all: HistoryShot[]; scene: Scene; sessions: Map<string, HistorySession>; onPick: (id: string) => void }) {
  const times = sightingTimes(scene);
  const hasPath = scene.sightings.length >= 2;
  const pb = usePlayback(scene.startT, scene.endT);
  const i = all.findIndex((s) => s.id === shot.id);
  const m = shot.fingerprint?.m ?? null;
  const conf = CONFIDENCE[shot.quality.level];
  const color = colorOf(shot.made);
  const layers: Layer[] = [{ scene, color, t: pb.t, tag: "a" }];
  const unsure = scene.sightings.filter((s) => s.unsure).length;
  return (
    <section aria-label="Watch this shot" className="space-y-2.5">
      <Chips all={all} selected={[shot.id]} onPick={onPick} label="Shots in this set" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full px-3 py-1 text-sm font-extrabold" style={{ background: `${color}22`, color }}>{shot.made ? "✓ Make" : "✕ Miss"}</span>
        <span className="text-[12px] text-foreground-mute">{date(sessions.get(shot.sessionKey)?.startedAt ?? "")} · shot {shot.seq}</span>
        {scene.callChanged && <span className="text-[12px] font-bold text-foreground-dim">You changed the camera&rsquo;s call on this one.</span>}
      </div>
      {hasPath ? (
        <>
          <ShotStage layers={layers} crossingLabel label={`The camera's view of shot ${shot.seq}: the ball over the rim and backboard`} />
          <p className="text-[11px] leading-relaxed text-foreground-mute">What the camera saw. The ball is drawn where it was seen, at the size it looked. The rim and backboard are drawn to scale for reference; they were not detected. There is no video of a saved shot.</p>
          <Controls pb={pb} times={times} onStep={(d) => pb.seek(stepTime(times, pb.t, d))} onShot={(d) => { const n = all[i + d]; if (n) onPick(n.id); }} />
          <p aria-live="polite" className="text-[12px] text-foreground-mute">{pb.t >= 0 ? "+" : ""}{(pb.t / 1000).toFixed(2)} s from the first sighting at the rim{unsure > 0 ? ` · ${unsure} sighting${unsure === 1 ? " was" : "s were"} not sure (hollow dots)` : ""}{scene.gaps.length ? ` · ${scene.gaps.length} stretch${scene.gaps.length === 1 ? "" : "es"} not seen (dashed)` : ""}</p>
        </>
      ) : (
        <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-4 text-sm text-foreground-dim">{shot.tracked ? "The camera saw the ball too few times to show a path." : "No path was saved for this shot, only whether it went in."}</p>
      )}
      <p className="text-[13px] text-foreground-dim"><b className="text-foreground">{conf.label}.</b> {shotSummary({ level: shot.quality.level, m })}</p>
      {plainReasons(shot.quality.reasons).length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-foreground-dim">{plainReasons(shot.quality.reasons).map((r) => <li key={r}>{r}</li>)}</ul>}
      <details className="rounded-xl border border-line bg-surface px-3 py-1"><summary className="flex min-h-11 cursor-pointer items-center text-xs font-extrabold text-foreground-dim">What does &ldquo;arc&rdquo; mean?</summary><ArcIllustration /></details>
    </section>
  );
}

function ArcIllustration() {
  return (
    <figure className="pb-2">
      <svg viewBox="0 0 300 150" className="w-full rounded-lg bg-[#0d1117]" role="img" aria-label="An illustration of a flatter and a higher shot arc toward the hoop. Not a measurement of any shot.">
        <line x1="10" y1="135" x2="290" y2="135" stroke="#fff" strokeOpacity="0.25" />
        <rect x="268" y="18" width="5" height="60" fill="#fff" fillOpacity="0.25" /><line x1="256" y1="78" x2="268" y2="78" stroke="#ff783c" strokeWidth="3" />
        <path d="M 30 112 Q 140 58 256 78" fill="none" stroke="#9aa4b2" strokeWidth="2.5" strokeDasharray="5 4" /><text x="120" y="76" className="fill-[#9aa4b2] text-[10px] font-bold">flatter</text>
        <path d="M 30 112 Q 120 -22 256 78" fill="none" stroke="#4fd1ff" strokeWidth="2.5" strokeDasharray="5 4" /><text x="104" y="26" className="fill-[#4fd1ff] text-[10px] font-bold">higher</text>
        <circle cx="30" cy="112" r="6" fill="#e8803a" />
      </svg>
      <figcaption className="mt-1 text-[11px] leading-relaxed text-foreground-mute"><b className="text-foreground-dim">An illustration, the same for everyone. It is not your shot.</b> Coaches talk about arc: how high the ball travels. A higher arc comes down into the hoop more steeply. A camera behind you cannot measure your arc, so this app does not draw one for your shots.</figcaption>
    </figure>
  );
}

function Compare({ a, b, all, sceneFor, sessions, onPick }: { a: HistoryShot | null; b: HistoryShot | null; all: HistoryShot[]; sceneFor: (s: HistoryShot) => Scene; sessions: Map<string, HistorySession>; onPick: (v: { a: string | null; b: string | null }) => void }) {
  const [layout, setLayout] = useState<"overlay" | "side">("overlay");
  const sa = a ? sceneFor(a) : null, sb = b ? sceneFor(b) : null;
  const sync = sa && sb ? syncPoint(sa, sb) : null;
  const lo = sync && sa && sb ? -Math.max(sync.aT - sa.startT, sync.bT - sb.startT) : 0;
  const hi = sync && sa && sb ? Math.max(sa.endT - sync.aT, sb.endT - sync.bT) : 1;
  const pb = usePlayback(lo, hi);
  if (!a || !b || !sa || !sb || !sync) {
    return (
      <section aria-label="Compare two shots" className="space-y-2.5">
        <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-4 text-sm text-foreground-dim">Pick two shots to compare. A make and a miss from the same set is a good start.</p>
        <Chips all={all} selected={[a?.id, b?.id].filter(Boolean) as string[]} onPick={(id) => onPick(a && !b ? { a: a.id, b: id } : { a: id, b: null })} label="Shots in this set" />
      </section>
    );
  }
  const verdict = compareShots({ shot: a, framing: sessions.get(a.sessionKey)?.framing ?? null, setup: sessions.get(a.sessionKey)?.setup }, { shot: b, framing: sessions.get(b.sessionKey)?.framing ?? null, setup: sessions.get(b.sessionKey)?.setup });
  const colorA = a.made === b.made ? MAKE_COLOR : colorOf(a.made), colorB = a.made === b.made ? THIRD_COLOR : colorOf(b.made);
  const at = (s: Scene, local: number) => local + (s === sa ? sync.aT : sync.bT);
  const la: Layer = { scene: sa, color: colorA, t: at(sa, pb.t), tag: "a" }, lb: Layer = { scene: sb, color: colorB, t: at(sb, pb.t), tag: "b" };
  const common = [...sightingTimes(sa).map((t) => t - sync.aT), ...sightingTimes(sb).map((t) => t - sync.bT)].sort((x, y) => x - y);
  const diffs = observedDifferences(sa, sb);
  const tag = (s: HistoryShot) => `${s.made ? "✓ Make" : "✕ Miss"} · shot ${s.seq}`;
  return (
    <section aria-label="Compare two shots" className="space-y-2.5">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Shot A</p>
      <Chips all={all} selected={[a.id]} onPick={(id) => onPick({ a: id, b: b.id })} label="Choose shot A" />
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Shot B</p>
      <Chips all={all} selected={[b.id]} onPick={(id) => onPick({ a: a.id, b: id })} label="Choose shot B" />
      <div className="flex flex-wrap gap-2 text-sm font-extrabold">
        <span className="rounded-full px-3 py-1" style={{ background: `${colorA}22`, color: colorA }}>A {tag(a)}</span>
        <span className="rounded-full px-3 py-1" style={{ background: `${colorB}22`, color: colorB }}>B {tag(b)}</span>
        <button type="button" className="min-h-11 rounded-full border border-line px-3 text-xs text-foreground-dim" onClick={() => onPick({ a: b.id, b: a.id })}>Swap</button>
      </div>
      {!verdict.comparable && (
        <div className="rounded-xl bg-raised px-3 py-2 text-[12px] text-foreground-dim"><b className="text-foreground">These two cannot be fairly compared:</b><ul className="mt-1 list-disc pl-4">{[...new Set(verdict.reasons)].map((r) => <li key={r}>{r}</li>)}</ul><p className="mt-1 text-foreground-mute">You can still watch them, but the differences below are not shown.</p></div>
      )}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-raised p-1" role="group" aria-label="Layout">
        {([["overlay", "On top of each other"], ["side", "Side by side"]] as const).map(([k, t]) => <button key={k} type="button" aria-pressed={layout === k} onClick={() => setLayout(k)} className={`min-h-11 rounded-lg text-xs font-extrabold ${layout === k ? "bg-surface text-accent shadow-sm" : "text-foreground-dim"}`}>{t}</button>)}
      </div>
      {layout === "overlay" ? <ShotStage layers={[la, lb]} label="Both shots in the camera's view, lined up" /> : (
        <div className="grid grid-cols-2 gap-1.5"><ShotStage layers={[la]} label={`Shot A`} compact showCrossing={false} /><ShotStage layers={[lb]} label={`Shot B`} compact showCrossing={false} /></div>
      )}
      <p className="text-[11px] text-foreground-mute">{sync.note}</p>
      <Controls pb={pb} times={common.length ? common : [0]} onStep={(d) => pb.seek(stepTime(common, pb.t, d))} />
      {verdict.comparable && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-[12px]"><caption className="sr-only">What the camera saw in each shot</caption>
            <thead><tr className="text-[11px] uppercase tracking-wide text-foreground-mute"><th className="p-2.5 font-bold">What the camera saw</th><th className="p-2.5 font-bold" style={{ color: colorA }}>A</th><th className="p-2.5 font-bold" style={{ color: colorB }}>B</th></tr></thead>
            <tbody>{diffs.map((d) => <tr key={d.label} className="border-t border-line align-top"><td className="p-2.5 text-foreground-mute">{d.label}</td><td className="p-2.5 font-semibold text-foreground">{d.a}</td><td className="p-2.5 font-semibold text-foreground">{d.b}</td></tr>)}</tbody></table>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-foreground-mute">{COMPARE_CAUTION}</p>
    </section>
  );
}

const POSITIONS = [["behind", "Straight behind me"], ["side", "Off to one side"], ["unsure", "Not sure"]] as const;
const MOVES = [["no", "No"], ["yes", "Yes"], ["unsure", "Not sure"]] as const;

/** Two optional questions about the phone. The answer is the player's own, kept on this phone with the sets, and it only decides which sets are compared and how a side is worded. */
function PhoneAsk({ sessions, onSetup }: { sessions: HistorySession[]; onSetup: (sessionKeys: string[], setup: CameraSetup) => void }) {
  const first = sessions[0]?.setup ?? null;
  const same = sessions.every((s) => s.setup?.position === first?.position && s.setup?.moved === first?.moved);
  const now: CameraSetup = same && first ? first : { v: 1, position: "unsure", moved: "unsure" };
  const keys = sessions.map((s) => s.sessionKey);
  const row = (legend: string, opts: readonly (readonly [string, string])[], value: string | null, set: (v: string) => void) => (
    <fieldset className="mt-2"><legend className="text-[12px] font-bold text-foreground">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {opts.map(([v, t]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => set(v)} className={`min-h-11 rounded-full border px-3.5 text-xs font-bold ${value === v ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground-dim"}`}>{t}</button>)}
      </div>
    </fieldset>
  );
  return (
    <details className="rounded-xl border border-line bg-surface px-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-[12px] font-bold text-foreground-dim">Where was the phone? (optional){first ? " · answered" : ""}</summary>
      <div className="pb-3">
        <p className="text-[11px] text-foreground-mute">Your answer stays on this phone. It does not change counting. It only decides which sets are lined up together and how carefully a side is worded.</p>
        {row("Where was the phone for these sets?", POSITIONS, same && first ? first.position : null, (v) => onSetup(keys, { ...now, position: v as CameraSetup["position"] }))}
        {row("Did the phone move or get bumped?", MOVES, same && first ? first.moved : null, (v) => onSetup(keys, { ...now, moved: v as CameraSetup["moved"] }))}
      </div>
    </details>
  );
}

function Patterns({ shots, sessions, onWatch, onCompare, onSetup }: { shots: HistoryShot[]; sessions: HistorySession[]; onWatch: (id: string) => void; onCompare: (a: string, b: string) => void; onSetup?: (sessionKeys: string[], setup: CameraSetup) => void }) {
  const position = phonePosition(sessions);
  const p = useMemo(() => summarizePatterns(shots, position), [shots, position]);
  if (p.coverage.shots === 0) return <Empty />;
  const W = 340, mid = W / 2, scale = 22;
  const many = p.arrivals.length > 24;
  const BINS = 13, binW = W / BINS;
  const bin = (x: number) => Math.max(0, Math.min(BINS - 1, Math.floor(x + BINS / 2)));
  const hist = Array.from({ length: BINS }, () => ({ makes: [] as typeof p.arrivals, misses: [] as typeof p.arrivals }));
  for (const d of p.arrivals) hist[bin(d.xBw)][d.made ? "makes" : "misses"].push(d);
  const peak = Math.max(1, ...hist.map((h) => h.makes.length + h.misses.length));
  const dots = p.arrivals.map((d, n) => ({ ...d, cx: Math.max(10, Math.min(W - 10, mid + d.xBw * scale)), row: n }));
  const rows: number[][] = [];
  const placed = dots.map((d) => { let r = 0; while ((rows[r] ?? []).some((x) => Math.abs(x - d.cx) < 14)) r += 1; (rows[r] ??= []).push(d.cx); return { ...d, cy: 26 + r * 15 }; });
  const height = Math.max(70, 40 + rows.length * 15);
  const HH = 150, base = HH - 22, unit = (HH - 50) / peak;
  const binLabel = (i: number) => { const lo = i - Math.floor(BINS / 2); return lo === 0 ? "centre" : lo > 0 ? `${lo} to ${lo + 1} ball widths right` : `${-lo - 1} to ${-lo} ball widths left`; };
  const svg = many ? (
    <svg viewBox={`0 0 ${W} ${HH}`} className="w-full rounded-xl bg-[#0d1117]" role="group" aria-label="How many shots came down at each distance left or right of the rim's centre, as the camera picture shows it">
      <ellipse cx={mid} cy={12} rx={((0.457 / 0.24) * binW) / 2} ry={5} fill="none" stroke="#ff783c" strokeWidth={2.5} />
      <line x1={0} x2={W} y1={base} y2={base} stroke="#ffffff" strokeOpacity={0.25} />
      {hist.map((h, i) => {
        const n = h.makes.length + h.misses.length, mh = h.makes.length * unit, xh = h.misses.length * unit;
        const pick = [...h.misses, ...h.makes].sort((x, y) => y.seq - x.seq)[0];
        return (
          <g key={i} role={n ? "button" : undefined} tabIndex={n ? 0 : undefined} aria-label={n ? `${binLabel(i)}: ${n} shot${n === 1 ? "" : "s"}, ${h.makes.length} make${h.makes.length === 1 ? "" : "s"} and ${h.misses.length} miss${h.misses.length === 1 ? "" : "es"}. Watch one` : undefined} onClick={() => pick && onWatch(pick.id)} onKeyDown={(e) => { if (pick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onWatch(pick.id); } }} className={n ? "cursor-pointer outline-none" : ""}>
            <rect x={i * binW} y={0} width={binW} height={HH - 6} fill="transparent" />
            {mh > 0 && <rect x={i * binW + 2} y={base - mh} width={binW - 4} height={mh} rx={2} fill={MAKE_COLOR} />}
            {xh > 0 && <rect x={i * binW + 2} y={base - mh - xh} width={binW - 4} height={xh} rx={2} fill="none" stroke={MISS_COLOR} strokeWidth={2} />}
            {n > 0 && <text x={i * binW + binW / 2} y={base - mh - xh - 4} textAnchor="middle" className="fill-[#9aa4b2] text-[9px] font-bold">{n}</text>}
          </g>
        );
      })}
      <text x={8} y={HH - 6} className="fill-[#9aa4b2] text-[9px] font-bold">LEFT</text><text x={W - 8} y={HH - 6} textAnchor="end" className="fill-[#9aa4b2] text-[9px] font-bold">RIGHT</text>
    </svg>
  ) : (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full rounded-xl bg-[#0d1117]" role="group" aria-label="One dot per shot, left or right of the rim's centre as the camera picture shows it">
      <ellipse cx={mid} cy={12} rx={((0.457 / 0.24) * scale) / 2} ry={5} fill="none" stroke="#ff783c" strokeWidth={2.5} /><line x1={mid} x2={mid} y1={18} y2={height - 6} stroke="#ffffff" strokeOpacity={0.18} strokeDasharray="3 4" />
      {placed.map((d) => (
        <g key={d.id} role="button" tabIndex={0} aria-label={`Shot ${d.seq}, ${d.made ? "make" : "miss"}, ${Math.abs(d.xBw) < 0.25 ? "centre" : `${Math.abs(d.xBw).toFixed(1)} ball widths ${d.xBw > 0 ? "right" : "left"}`}`} onClick={() => onWatch(d.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onWatch(d.id); } }} className="cursor-pointer outline-none">
          <circle cx={d.cx} cy={d.cy} r={20} fill="transparent" /><circle cx={d.cx} cy={d.cy} r={6} fill={d.made ? MAKE_COLOR : "#0d1117"} stroke={colorOf(d.made)} strokeWidth={2.5} />
        </g>
      ))}
      <text x={8} y={height - 6} className="fill-[#9aa4b2] text-[9px] font-bold">LEFT</text><text x={W - 8} y={height - 6} textAnchor="end" className="fill-[#9aa4b2] text-[9px] font-bold">RIGHT</text>
    </svg>
  );
  return (
    <section aria-label="Where your shots went" className="space-y-2.5">
      <h3 className="text-sm font-extrabold text-foreground">Where each shot came down past the rim</h3>
      {p.usable === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface/60 p-4 text-sm text-foreground-dim">None of these shots were seen coming down past the rim clearly enough to place. {p.coverage.withPath} of {p.coverage.shots} had a path.</p>
      ) : (
        <>
          {svg}
          <p className="text-[12px] text-foreground-dim"><b style={{ color: MAKE_COLOR }}>●</b> {p.makes} make{p.makes === 1 ? "" : "s"} · <b style={{ color: MISS_COLOR }}>○</b> {p.misses} miss{p.misses === 1 ? "" : "es"}. {many ? "Tap a bar to watch the latest shot in it. " : "Tap a dot to watch that shot. "}Left and right are as the camera picture shows them.</p>
          {p.side && (
            <div className={`rounded-xl px-3 py-2 text-[13px] ${p.side.strong ? "bg-accent/10 text-foreground" : "bg-raised text-foreground-dim"}`}>
              <p>{p.side.text}</p>
              {p.side.caveat && <p className="mt-1 text-[12px] text-foreground-dim">{p.side.caveat}</p>}
            </div>
          )}
          {onSetup && <PhoneAsk sessions={sessions} onSetup={onSetup} />}
          {!p.side && p.misses > 0 && <p className="text-[12px] text-foreground-mute">With {p.misses} miss{p.misses === 1 ? "" : "es"} placed there is not enough to say which side they tend to go. It takes at least 8.</p>}
          {(p.typicalMake || p.typicalMiss) && (
            <div className="grid grid-cols-2 gap-2">
              {p.typicalMake && <button type="button" className={btn} onClick={() => onWatch(p.typicalMake!.id)}>Watch a typical make</button>}
              {p.typicalMiss && <button type="button" className={btn} onClick={() => onWatch(p.typicalMiss!.id)}>Watch a typical miss</button>}
              {p.typicalMake && p.typicalMiss && <button type="button" className={`${btn} col-span-2`} onClick={() => onCompare(p.typicalMake!.id, p.typicalMiss!.id)}>Compare a typical make with a typical miss</button>}
            </div>
          )}
        </>
      )}
      <p className="text-[11px] text-foreground-mute">{p.coverage.shots} shots: {p.coverage.withPath} with a saved path, {p.coverage.seenComingDown} seen coming down past the rim clearly enough to place.</p>
    </section>
  );
}
