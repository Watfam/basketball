"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { analyseHistory, type Statement } from "@/lib/review/consistency";
import { compareShots, deleteSessionHistory, framingGroups, loadHistory, setSessionSetup, type LoadedHistory } from "@/lib/review/history-core";
import { idbHistory } from "@/lib/review/history-store";
import type { HistoryShot } from "@/lib/review/history-types";
import { debugEnabled, record as recordDiag } from "@/lib/review/diagnostics";
import { reconcileHistoryNow } from "@/lib/review/history-ops";
import { CONFIDENCE, coverageSentence, makesVersusMisses, plainMissing, plainStatement } from "@/lib/review/plain";
import { outcomeLines, pathPieces, rowOf, setupGroups } from "@/lib/review/history-view";
import { PathChart, type ChartLine } from "@/components/path-chart";
import { HistoryShotViewer } from "@/components/history-shot-viewer";
import { Button } from "@/components/ui/button";
import { TrackingHistoryControls } from "@/components/tracking-history-controls";
import { ShotExplorer } from "@/components/shots/shot-explorer";

/**
 * Shot history (EXPERIMENTAL, behind the hl:session-review flag): your saved sets, each shot's path to watch again, makes against misses, and
 * comparison of shots. Sets shot from different camera setups are kept apart, because their paths cannot be fairly compared; a measurement the
 * camera could not take is shown as such, with the reason. Wording is plain (src/lib/review/plain.ts).
 */
const PALETTE = ["#4fd1ff", "#ffb454", "#8ae68a", "#e08cff", "#ff7a7a", "#f2e46b"];
const MAKE = "#4fd1ff", MISS = "#ffb454";
const MAX_PICK = 6;
const MEASURES: { key: string; label: string; unit?: string; digits?: number }[] = [
  { key: "rim_level_x_bw", label: "Sideways from the rim's centre (+ is right in the picture)", unit: " ball widths" },
  { key: "approach_direction_deg", label: "Slant coming down", unit: "°", digits: 0 },
  { key: "descent_speed_bw_per_frame", label: "How fast it was dropping", unit: " per frame" },
  { key: "closest_approach_bw", label: "Closest to the rim's centre", unit: " ball widths" },
  { key: "observed_flight_ms", label: "Followed before the rim", unit: " ms", digits: 0 },
  { key: "path_fit_rms_bw", label: "Smoothness (lower is smoother)", unit: " ball widths" },
  { key: "rim_interaction_observed", label: "Bounced back up off the rim" },
];
const DOT: Record<HistoryShot["quality"]["level"], string> = { tracked: "bg-accent", partial: "bg-foreground-dim", unreliable: "bg-foreground-mute", none: "bg-line-strong" };
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function ShotHistory({ playerId, onClose, focusStartedAt, sample = false }: { playerId: string; onClose: () => void; focusStartedAt?: string; /** Browsing the replay sample, not a player's own history. */ sample?: boolean }) {
  const [h, setH] = useState<LoadedHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "make" | "miss">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const [mode, setMode] = useState<"outcome" | "pick">("outcome");
  const [scope, setScope] = useState(0);
  const [settings, setSettings] = useState(false);
  const [lineCap, setLineCap] = useState(12);

  const load = useCallback(async () => {
    const t0 = performance.now();
    try {
      await reconcileHistoryNow();
      const r = await loadHistory(idbHistory, playerId);
      setH(r); setError(null);
      if (debugEnabled()) recordDiag("history.load", performance.now() - t0);
    } catch {
      setError("Saved shot paths could not be read on this phone.");
    }
  }, [playerId]);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => { if (live) void load(); });
    return () => { live = false; };
  }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Open the set the player came from, once it has loaded.
  const focused = useMemo(() => (h && focusStartedAt ? h.sessions.find((x) => Date.parse(x.startedAt) === Date.parse(focusStartedAt)) ?? null : null), [h, focusStartedAt]);
  useEffect(() => { if (focused) { const id = setTimeout(() => setOpen(focused.sessionKey), 0); return () => clearTimeout(id); } }, [focused]);

  const byId = useMemo(() => new Map((h?.shots ?? []).map((x) => [x.id, x])), [h]);
  const sessionOf = useMemo(() => new Map((h?.sessions ?? []).map((x) => [x.sessionKey, x])), [h]);
  const groups = useMemo(() => (h ? setupGroups(framingGroups(h.sessions), h.shots) : []), [h]);
  const group = groups[Math.min(scope, Math.max(0, groups.length - 1))];
  const chosen = picked.map((id) => byId.get(id)).filter((x): x is HistoryShot => !!x);
  const verdicts = chosen.slice(1).map((x) => ({ x, v: compareShots({ shot: chosen[0], framing: sessionOf.get(chosen[0].sessionKey)?.framing ?? null, setup: sessionOf.get(chosen[0].sessionKey)?.setup }, { shot: x, framing: sessionOf.get(x.sessionKey)?.framing ?? null, setup: sessionOf.get(x.sessionKey)?.setup }) }));
  const allComparable = verdicts.length > 0 && verdicts.every((x) => x.v.comparable);
  const watched = watching ? byId.get(watching) ?? null : null;

  const [analytics, setAnalytics] = useState<ReturnType<typeof analyseHistory> | null>(null);
  useEffect(() => {
    if (!h) return;
    const id = setTimeout(() => { const t0 = performance.now(); setAnalytics(analyseHistory(h.sessions, h.shots)); if (debugEnabled()) recordDiag("history.analyse", performance.now() - t0); }, 30);
    return () => clearTimeout(id);
  }, [h]);

  const mm = useMemo(() => makesVersusMisses((group?.shots ?? []).map(rowOf)), [group]);
  const outLines: ChartLine[] = useMemo(() => outcomeLines(group?.shots ?? [], lineCap).map((l) => ({ pts: l.pts, color: l.made ? MAKE : MISS })), [group, lineCap]);
  const pickLines: ChartLine[] = chosen.flatMap((x, n) => pathPieces(x).filter((p) => p.length >= 2).map((pts) => ({ pts, color: PALETTE[n % PALETTE.length] })));
  const nMake = outLines.filter((l) => l.color === MAKE).length, nMiss = outLines.length - nMake;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_PICK ? p : [...p, id]));
  const delSession = async (key: string) => {
    if (!window.confirm("Delete the saved shot paths of this set from this phone? Your saved session and its shot counts are not affected.")) return;
    await deleteSessionHistory(idbHistory, key);
    setPicked((p) => p.filter((id) => byId.get(id)?.sessionKey !== key));
    setWatching((w) => (w && byId.get(w)?.sessionKey === key ? null : w));
    await load();
  };
  const val = (x: HistoryShot, k: string, unit = "", digits = 2) => { const v = x.fingerprint?.m[k]; return v === null || v === undefined ? null : typeof v === "boolean" ? (v ? "yes" : "no") : `${(v as number).toFixed(digits)}${unit}`; };
  const hasData = !!h && h.sessions.length > 0;

  return (
    <div role="dialog" aria-modal="true" aria-label="Shot history" className="theme-dark fixed inset-0 z-[70] overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-md space-y-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-wide">{sample ? "Shot history: replay sample" : "Shot history"}</p>
            <p className="text-[11px] text-foreground-mute">{sample ? "Real paths from existing recordings, kept apart from any player. Not your own sets." : "Beta. Kept on this phone only."}</p>
          </div>
          <div className="flex gap-1">
            {!sample && <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setSettings((v) => !v)} aria-expanded={settings}>Settings</Button>}
            <Button variant="ghost" size="sm" className="min-h-11" onClick={onClose}>Done</Button>
          </div>
        </div>

        {!sample && (settings || (h && !hasData)) && <TrackingHistoryControls playerId={playerId} onChanged={() => { setPicked([]); setWatching(null); void load(); }} />}

        {error && <p className="rounded-lg bg-raised px-3 py-2 text-[12px] text-foreground">{error}</p>}
        {h && h.damaged > 0 && <p className="rounded-lg bg-raised px-3 py-2 text-[12px] text-foreground-dim">{h.damaged} saved item{h.damaged === 1 ? " was" : "s were"} unreadable and skipped. Settings can clear {h.damaged === 1 ? "it" : "them"}.</p>}
        {h && h.newer > 0 && <p className="rounded-lg bg-raised px-3 py-2 text-[12px] text-foreground-dim">{h.newer} saved item{h.newer === 1 ? " was" : "s were"} made by a newer version of the app and {h.newer === 1 ? "is" : "are"} left alone.</p>}

        {h && !hasData && (
          <p className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">No shot paths are kept yet. Switch on &ldquo;Keep shot paths&rdquo; above, then shoot a set with the camera and save it. Sets saved before that, and sets counted by tapping, have no paths.</p>
        )}

        {hasData && (
          <ShotExplorer
            sessions={h!.sessions}
            shots={h!.shots}
            initial={{ sessionKey: focused?.sessionKey }}
            onSetup={sample ? undefined : (keys, setup) => { void setSessionSetup(idbHistory, keys, setup).then(() => load()); }}
            advanced={
              <details className="rounded-2xl border border-line bg-surface px-3 py-1">
                <summary className="flex min-h-12 cursor-pointer items-center text-sm font-extrabold text-foreground-dim">Advanced: every path, measurements, statistics, saved sets</summary>
                <div className="space-y-3 pb-3">
        {hasData && (
          <section aria-label="Saved sets" className="rounded-2xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Your sets</p>
              <div className="flex gap-1" role="group" aria-label="Show">
                {(["all", "make", "miss"] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`min-h-11 rounded-md px-2 text-[11px] font-extrabold uppercase ${filter === f ? "bg-surface text-accent shadow-sm ring-1 ring-line-strong" : "bg-raised text-foreground-dim"}`}>{f === "all" ? "All" : f === "make" ? "Makes" : "Misses"}</button>
                ))}
              </div>
            </div>
            <ul className="mt-2 divide-y divide-line">
              {[...h!.sessions].reverse().map((x) => {
                const all = h!.shots.filter((y) => y.sessionKey === x.sessionKey);
                const mine = all.filter((y) => filter === "all" || (filter === "make") === y.made);
                const clear = all.filter((y) => y.quality.level === "tracked").length;
                return (
                  <li key={x.sessionKey} className="py-2">
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <button type="button" onClick={() => setOpen(open === x.sessionKey ? null : x.sessionKey)} aria-expanded={open === x.sessionKey} className="min-h-11 min-w-0 flex-1 text-left">
                        <span className="font-semibold text-foreground">{date(x.startedAt)}{x.label ? ` · ${x.label}` : ""}</span>
                        <span className="block text-[11px] text-foreground-mute">{coverageSentence(all.length, x.withTracking, clear)}</span>
                      </button>
                      <Button variant="ghost" size="sm" className="min-h-11" onClick={() => void delSession(x.sessionKey)}>Delete</Button>
                    </div>
                    {open === x.sessionKey && (
                      <>
                        <p className="mt-2 text-[11px] text-foreground-mute">Tap a shot to watch it. The dot shows how clear its path is: bright is clear, grey is weak or missing.</p>
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {mine.map((y) => (
                            <li key={y.id}>
                              <button type="button" aria-pressed={watching === y.id} onClick={() => setWatching(watching === y.id ? null : y.id)} title={CONFIDENCE[y.quality.level].label} className={`flex min-h-11 items-center gap-1 rounded-md px-2 text-[11px] font-extrabold ${watching === y.id ? "bg-accent text-on-accent" : "bg-raised text-foreground-dim"}`}>
                                <span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[y.quality.level]}`} />{y.seq} {y.made ? "make" : "miss"}
                              </button>
                            </li>
                          ))}
                          {mine.length === 0 && <li className="text-[11px] text-foreground-mute">No {filter === "make" ? "makes" : "misses"} in this set.</li>}
                        </ul>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {watched && <HistoryShotViewer key={watched.id} shot={watched} when={date(sessionOf.get(watched.sessionKey)?.startedAt ?? "")} onClose={() => setWatching(null)} />}
        {watched && !picked.includes(watched.id) && picked.length < MAX_PICK && <Button variant="secondary" size="sm" className="min-h-11" onClick={() => { toggle(watched.id); setMode("pick"); }}>Add this shot to a comparison</Button>}

        {hasData && group && (
          <section aria-label="Compare shots" className="rounded-2xl border border-line bg-surface p-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Compare shots</p>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-raised p-1">
              {([["outcome", "Makes vs misses"], ["pick", `Picked shots (${picked.length})`]] as const).map(([k, t]) => (
                <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`min-h-11 rounded-lg text-xs font-extrabold ${mode === k ? "bg-surface text-accent shadow-sm" : "text-foreground-dim"}`}>{t}</button>
              ))}
            </div>

            {mode === "outcome" && (
              <>
                {groups.length > 1 && (
                  <label className="mt-2 block text-[12px] text-foreground-dim">Camera setup
                    <select value={Math.min(scope, groups.length - 1)} onChange={(e) => setScope(+e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface p-2 text-base text-foreground">
                      {groups.map((g, i) => <option key={i} value={i}>Setup {i + 1}: {g.sessions.length} set{g.sessions.length === 1 ? "" : "s"}, {g.shots.length} shots ({date(g.sessions[0].startedAt)}{g.sessions.length > 1 ? ` to ${date(g.sessions[g.sessions.length - 1].startedAt)}` : ""})</option>)}
                    </select>
                  </label>
                )}
                {groups.length > 1 && <p className="mt-1 text-[11px] text-foreground-mute">Sets filmed from a different spot or zoom are kept apart: their paths cannot be fairly put on one picture.</p>}
                <PathChart lines={outLines} label="Paths of makes and misses side by side, with the rim at the centre" />
                <div className="mt-1 flex gap-2">{lineCap < 120 ? <button type="button" onClick={() => setLineCap(120)} className="min-h-11 text-[11px] font-extrabold text-accent underline underline-offset-2">Show up to 120 paths</button> : <button type="button" onClick={() => setLineCap(12)} className="min-h-11 text-[11px] font-extrabold text-accent underline underline-offset-2">Show fewer</button>}</div>
                <p className="mt-1 text-[11px] text-foreground-mute">The rim is the orange bar. Each square is two ball widths. Up is up in the picture. Showing the newest {outLines.length} paths.</p>
                <p className="mt-1 text-[12px] text-foreground-dim"><b style={{ color: MAKE }}>●</b> {nMake} make path{nMake === 1 ? "" : "s"} · <b style={{ color: MISS }}>●</b> {nMiss} miss path{nMiss === 1 ? "" : "s"}</p>
                <p aria-live="polite" className="mt-2 rounded-lg bg-raised px-2 py-1.5 text-[12px] text-foreground-dim">{mm.sentence}</p>
              </>
            )}

            {mode === "pick" && (
              <>
                {chosen.length === 0 ? (
                  <p className="mt-2 text-[12px] text-foreground-dim">Open a set above, tap a shot, then choose &ldquo;Add this shot to a comparison&rdquo;. You can compare up to {MAX_PICK}.</p>
                ) : (
                  <>
                    <PathChart lines={pickLines} label="Paths of the picked shots, with the rim at the centre" />
                    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-foreground-dim">
                      {chosen.map((x, n) => <li key={x.id}><b style={{ color: PALETTE[n % PALETTE.length] }}>●</b> {date(sessionOf.get(x.sessionKey)?.startedAt ?? "")} #{x.seq} {x.made ? "make" : "miss"} <button type="button" onClick={() => toggle(x.id)} className="ml-0.5 font-bold text-accent" aria-label={`Remove shot ${x.seq}`}>remove</button></li>)}
                    </ul>
                    {chosen.length >= 2 && (
                      <div aria-live="polite" className="mt-2 rounded-lg bg-raised px-2 py-1.5 text-[12px] text-foreground-dim">
                        {allComparable ? <b className="text-foreground">These shots were filmed the same way, so they can be compared.</b> : (
                          <>
                            <b className="text-foreground">These shots cannot be fairly compared:</b>
                            <ul className="mt-1 list-disc pl-4">{[...new Set(verdicts.flatMap((x) => x.v.reasons))].map((r) => <li key={r}>{r}</li>)}</ul>
                            <p className="mt-1 text-foreground-mute">You can still look at the shapes above, but differences between them are not shown as measurements.</p>
                          </>
                        )}
                      </div>
                    )}
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[320px] text-left text-[11px]">
                        <thead><tr><th className="py-1 pr-2 font-bold text-foreground-mute">What the camera measured</th>{chosen.map((x, n) => <th key={x.id} className="px-1 font-bold" style={{ color: PALETTE[n % PALETTE.length] }}>#{x.seq}</th>)}</tr></thead>
                        <tbody>
                          <tr className="border-t border-line"><td className="py-1 pr-2 text-foreground-mute">How clear the path is</td>{chosen.map((x) => <td key={x.id} className="px-1 text-foreground-dim">{CONFIDENCE[x.quality.level].label}</td>)}</tr>
                          {MEASURES.map((m) => (
                            <tr key={m.key} className="border-t border-line align-top">
                              <td className="py-1 pr-2 text-foreground-mute">{m.label}</td>
                              {chosen.map((x, i) => {
                                const v = val(x, m.key, m.unit, m.digits ?? 2);
                                const base = chosen[0].fingerprint?.m[m.key], cur = x.fingerprint?.m[m.key];
                                const delta = i > 0 && allComparable && typeof base === "number" && typeof cur === "number" ? ` (${cur - base >= 0 ? "+" : ""}${(cur - base).toFixed(m.digits ?? 2)})` : "";
                                return <td key={x.id} className={`px-1 ${v ? "font-semibold text-foreground" : "text-foreground-mute"}`}>{v ? `${v}${delta}` : <span title={plainMissing(x.fingerprint?.why[m.key])}>not measured{x.fingerprint ? "" : " (no path)"}</span>}</td>;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-1 text-[11px] text-foreground-mute">&ldquo;Not measured&rdquo; means the camera did not see enough to say. Numbers in brackets show the change from the first shot and appear only when the shots can be compared.</p>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        )}

        {hasData && !analytics && <p className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-mute">Looking for patterns…</p>}
        {hasData && analytics && (
          <section aria-label="Patterns" className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Statistics across sets</p>
            <p className="mt-1 text-foreground-mute">Where the ball crossed the rim&apos;s height is the only thing measured here. Some lines below restate what a miss is (a miss is a ball that did not go through the middle), so they are kept here and not shown first.</p>
            <p className="mt-1">Only where the ball crossed the rim&apos;s height is looked at. A pattern here says where the ball was seen, not why.</p>
            {analytics.groups.map((g, gi) => (
              <div key={g.name} className="mt-3">
                <p className="font-bold text-foreground">{analytics.groups.length > 1 ? `Camera setup ${gi + 1}` : "Your sets"}</p>
                <ul className="mt-1 space-y-2">
                  {g.statements.filter((x) => x.status === "supported").map((x) => <StatementView key={x.id} s={x} />)}
                  {g.statements.filter((x) => x.status === "supported").length === 0 && <li className="text-foreground-mute">Nothing stands out yet. It takes more shots with a clear path, across more sets, before the app will say anything.</li>}
                </ul>
                <details className="mt-1"><summary className="flex min-h-11 cursor-pointer items-center text-[11px] text-foreground-mute">What was not reported, and why</summary>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-foreground-mute">{g.statements.filter((x) => x.status === "abstained").map((x) => <li key={x.id}>{LABEL[x.id]}: {plainStatement(String(x.detail ?? x.reason ?? ""))}</li>)}</ul>
                </details>
              </div>
            ))}
          </section>
        )}
                </div>
              </details>
            }
          />
        )}
      </div>
    </div>
  );
}

const LABEL: Record<Statement["id"], string> = { V1: "How much it varies", V2: "Trend across sets", V3: "Latest set against earlier", V4a: "Makes against misses (distance from centre)", V4b: "Makes against misses (spread)" };

function StatementView({ s }: { s: Statement }) {
  const u = s.uncertainty;
  return (
    <li className="rounded-lg bg-raised p-2">
      <p className="text-foreground">{plainStatement(s.claim_observation ?? "")}</p>
      <p className="mt-1 text-[11px] text-foreground-mute">{plainStatement(s.interpretation_limit)}</p>
      <details className="mt-1 text-[11px] text-foreground-mute"><summary className="flex min-h-11 cursor-pointer items-center">How sure is this?</summary>
        <p className="mt-1">Based on {Object.entries(s.n).map(([k, v]) => `${v} ${k}`).join(", ")}; the camera could measure {Math.round(s.measurement_quality.availability * 100)}% of the shots.{u.ci95 ? ` Likely range: ${u.ci95.lo} to ${u.ci95.hi}.` : ""}{u.p_adjusted !== null ? ` Chance of seeing this by luck (adjusted): ${u.p_adjusted}.` : ""}</p>
        <p className="mt-1">Compared with: {s.comparison_baseline}</p>
        <p className="mt-1">Caution: {plainStatement(s.caution)}</p>
        <p className="mt-1 break-all text-[10px]">{s.supporting_shot_ids.length} shots behind this: {s.supporting_shot_ids.join(", ")}</p>
      </details>
    </li>
  );
}
