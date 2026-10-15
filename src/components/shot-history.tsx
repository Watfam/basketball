"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyseHistory, type Statement } from "@/lib/review/consistency";
import { explainMissing } from "@/lib/review/fingerprint";
import { compareShots, deleteSessionHistory, framingGroups, loadHistory, type LoadedHistory } from "@/lib/review/history-core";
import { idbHistory } from "@/lib/review/history-store";
import type { HistoryShot } from "@/lib/review/history-types";
import { debugEnabled, record as recordDiag } from "@/lib/review/diagnostics";
import { reconcileHistoryNow } from "@/lib/review/history-ops";
import { Button } from "@/components/ui/button";
import { TrackingHistoryControls } from "@/components/tracking-history-controls";

/**
 * Shot history across saved sessions (EXPERIMENTAL, behind the hl:session-review flag): pick shots from any saved session, overlay their OBSERVED
 * paths relative to the rim, compare their measurements, and read basic consistency analytics. Everything is image-space; shots from different
 * camera framings are never treated as directly comparable, and a measurement that was not taken is shown as not available, with why.
 */
const PALETTE = ["#4fd1ff", "#ffb454", "#8ae68a", "#e08cff", "#ff7a7a", "#f2e46b"];
const MAX_PICK = 6;
const MEASURES: { key: string; label: string; unit?: string; digits?: number }[] = [
  { key: "rim_level_x_bw", label: "Position at rim height (image-horizontal)", unit: " bw" },
  { key: "approach_direction_deg", label: "Direction coming down", unit: "°", digits: 0 },
  { key: "descent_speed_bw_per_frame", label: "Speed coming down", unit: " bw/frame" },
  { key: "closest_approach_bw", label: "Closest to rim centre", unit: " bw" },
  { key: "observed_flight_ms", label: "Flight seen before rim", unit: " ms", digits: 0 },
  { key: "path_fit_rms_bw", label: "Smoothness (lower = smoother)", unit: " bw" },
  { key: "rim_interaction_observed", label: "Bounced back up after rim" },
];
const QUALITY: Record<HistoryShot["quality"]["level"], { text: string; dot: string }> = {
  tracked: { text: "path found", dot: "bg-accent" },
  partial: { text: "partial path", dot: "bg-foreground-dim" },
  unreliable: { text: "path unreliable", dot: "bg-foreground-mute" },
  none: { text: "no path", dot: "bg-line-strong" },
};
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function ShotHistory({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const [h, setH] = useState<LoadedHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "make" | "miss">("all");
  const [open, setOpen] = useState<string | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    const t0 = performance.now();
    try {
      await reconcileHistoryNow();
      const r = await loadHistory(idbHistory, playerId);
      setH(r); setError(null);
      if (debugEnabled()) recordDiag("history.load", performance.now() - t0);
    } catch {
      setError("Saved tracking history could not be read on this phone.");
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

  const byId = useMemo(() => new Map((h?.shots ?? []).map((s) => [s.id, s])), [h]);
  const sessionOf = useMemo(() => new Map((h?.sessions ?? []).map((s) => [s.sessionKey, s])), [h]);
  const groups = useMemo(() => (h ? framingGroups(h.sessions) : []), [h]);
  const groupOf = (key: string) => groups.findIndex((g) => g.some((s) => s.sessionKey === key)) + 1;
  const chosen = picked.map((id) => byId.get(id)).filter((s): s is HistoryShot => !!s);
  const verdicts = chosen.slice(1).map((s) => ({ s, v: compareShots({ shot: chosen[0], framing: sessionOf.get(chosen[0].sessionKey)?.framing ?? null }, { shot: s, framing: sessionOf.get(s.sessionKey)?.framing ?? null }) }));
  const allComparable = verdicts.length > 0 && verdicts.every((x) => x.v.comparable);
  // Consistency analytics run after the first paint so the lists appear at once, and are cheap by construction (bounded sample and iteration counts).
  const [analytics, setAnalytics] = useState<ReturnType<typeof analyseHistory> | null>(null);
  useEffect(() => {
    if (!h) return;
    const id = setTimeout(() => { const t0 = performance.now(); setAnalytics(analyseHistory(h.sessions, h.shots)); if (debugEnabled()) recordDiag("history.analyse", performance.now() - t0); }, 30);
    return () => clearTimeout(id);
  }, [h]);

  // ---- overlay: observed points, rim-relative, in ball widths ----
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const W = c.width, H = c.height, pad = 30, X = (v: number) => pad + ((v + 9) / 18) * (W - 2 * pad), Y = (v: number) => H - pad - ((v + 2) / 13) * (H - 2 * pad);
    ctx.fillStyle = "#12151a"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#2d323b"; ctx.fillStyle = "#9aa3b2"; ctx.font = "10px system-ui"; ctx.lineWidth = 1;
    for (let x = -8; x <= 8; x += 2) { ctx.beginPath(); ctx.moveTo(X(x), 10); ctx.lineTo(X(x), H - pad); ctx.stroke(); ctx.fillText(String(x), X(x) - 4, H - pad + 12); }
    for (let y = -2; y <= 10; y += 2) { ctx.beginPath(); ctx.moveTo(pad, Y(y)); ctx.lineTo(W - 10, Y(y)); ctx.stroke(); ctx.fillText(String(y), 6, Y(y) + 3); }
    ctx.strokeStyle = "#ff783c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - 10, Y(0)); ctx.moveTo(X(0), 10); ctx.lineTo(X(0), H - pad); ctx.stroke();
    chosen.forEach((s, n) => {
      const bw = s.ballWidthPx ?? 24, col = PALETTE[n % PALETTE.length], pts = s.points.filter((p) => p[0] >= -1000 && p[0] <= 400);
      if (pts.length < 2) return;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((p, i) => { const x = X(p[1] / bw), y = Y(p[2] / bw); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
      ctx.fillStyle = col; pts.forEach((p) => { ctx.beginPath(); ctx.arc(X(p[1] / bw), Y(p[2] / bw), 2, 0, 7); ctx.fill(); });
    });
  }, [chosen]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_PICK ? p : [...p, id]));
  const delSession = async (key: string) => {
    if (!window.confirm("Delete the saved tracking history of this session from this phone? Your saved session and its shot counts are not affected.")) return;
    await deleteSessionHistory(idbHistory, key);
    setPicked((p) => p.filter((id) => byId.get(id)?.sessionKey !== key));
    await load();
  };
  const val = (s: HistoryShot, k: string, unit = "", digits = 2) => { const v = s.fingerprint?.m[k]; return v === null || v === undefined ? null : typeof v === "boolean" ? (v ? "yes" : "no") : `${(v as number).toFixed(digits)}${unit}`; };
  const meanScore = (s: HistoryShot) => (s.points.length ? (s.points.reduce((a, p) => a + p[4], 0) / s.points.length / 100).toFixed(2) : "n/a");

  return (
    <div role="dialog" aria-modal="true" aria-label="Shot history" className="theme-dark fixed inset-0 z-[70] overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-md space-y-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-wide">Shot history (beta)</p>
            <p className="text-[11px] text-foreground-mute">Kept on this phone only. Image-space: not a physical measurement.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        <TrackingHistoryControls playerId={playerId} onChanged={() => { setPicked([]); void load(); }} />

        {error && <p className="rounded-lg bg-raised px-3 py-2 text-[12px] text-foreground">{error}</p>}
        {h && h.damaged > 0 && <p className="rounded-lg bg-raised px-3 py-2 text-[12px] text-foreground-dim">{h.damaged} unreadable record{h.damaged === 1 ? " was" : "s were"} skipped.</p>}
        {h && h.newer > 0 && <p className="rounded-lg bg-raised px-3 py-2 text-[12px] text-foreground-dim">{h.newer} record{h.newer === 1 ? " was" : "s were"} written by a newer version of the app and {h.newer === 1 ? "is" : "are"} left alone.</p>}

        {h && h.sessions.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">No tracking history is kept yet. Turn on &ldquo;Keep each saved shot&apos;s ball path&rdquo; above, then shoot and save a set with the camera. Sets saved before that, and sets counted by tapping, have none.</p>
        )}

        {h && h.sessions.length > 0 && (
          <section aria-label="Saved sessions" className="rounded-2xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Saved sessions · pick up to {MAX_PICK} shots</p>
              <div className="flex gap-1" role="group" aria-label="Filter">
                {(["all", "make", "miss"] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`min-h-8 rounded-md px-2 text-[11px] font-extrabold uppercase ${filter === f ? "bg-surface text-accent shadow-sm ring-1 ring-line-strong" : "bg-raised text-foreground-dim"}`}>{f === "all" ? "All" : f === "make" ? "Makes" : "Misses"}</button>
                ))}
              </div>
            </div>
            <ul className="mt-2 divide-y divide-line">
              {[...h.sessions].reverse().map((s) => {
                const mine = h.shots.filter((x) => x.sessionKey === s.sessionKey && (filter === "all" || (filter === "make") === x.made));
                return (
                  <li key={s.sessionKey} className="py-2">
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <button type="button" onClick={() => setOpen(open === s.sessionKey ? null : s.sessionKey)} aria-expanded={open === s.sessionKey} className="min-w-0 flex-1 text-left">
                        <span className="font-semibold text-foreground">{date(s.startedAt)}{s.label ? ` · ${s.label}` : ""}</span>
                        <span className="block text-[11px] text-foreground-mute">{s.shots} shots · {s.withTracking} with a path · {s.framing ? `framing ${groupOf(s.sessionKey)}` : "framing not recorded"}</span>
                      </button>
                      <Button variant="ghost" size="sm" onClick={() => void delSession(s.sessionKey)}>Delete</Button>
                    </div>
                    {open === s.sessionKey && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {mine.map((x) => (
                          <li key={x.id}>
                            <button type="button" aria-pressed={picked.includes(x.id)} onClick={() => toggle(x.id)} title={`${QUALITY[x.quality.level].text}`} className={`flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-extrabold ${picked.includes(x.id) ? "bg-accent text-on-accent" : "bg-raised text-foreground-dim"}`}>
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${QUALITY[x.quality.level].dot}`} />{x.seq} {x.made ? "make" : "miss"}
                            </button>
                          </li>
                        ))}
                        {mine.length === 0 && <li className="text-[11px] text-foreground-mute">No {filter === "make" ? "makes" : "misses"} in this session.</li>}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {chosen.length > 0 && (
          <section aria-label="Compare shots" className="rounded-2xl border border-line bg-surface p-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Compare observed paths (rim at the centre, in ball widths)</p>
            <canvas ref={cv} width={360} height={300} aria-label="Observed paths of the chosen shots relative to the rim" className="mt-2 w-full rounded-lg" />
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-foreground-dim">
              {chosen.map((s, n) => <li key={s.id}><b style={{ color: PALETTE[n % PALETTE.length] }}>●</b> {date(sessionOf.get(s.sessionKey)?.startedAt ?? "")} #{s.seq} {s.made ? "make" : "miss"}</li>)}
            </ul>
            {chosen.length >= 2 && (
              <div aria-live="polite" className="mt-2 rounded-lg bg-raised px-2 py-1.5 text-[12px] text-foreground-dim">
                {allComparable ? <b className="text-foreground">These shots can be compared: same camera framing, a measurable rim-level position for each.</b> : (
                  <>
                    <b className="text-foreground">These shots cannot all be meaningfully compared.</b>
                    <ul className="mt-1 list-disc pl-4">{[...new Set(verdicts.flatMap((x) => x.v.reasons))].map((r) => <li key={r}>{r}</li>)}</ul>
                    <p className="mt-1 text-foreground-mute">The paths above are drawn in each shot&apos;s own ball widths so you can look at their shapes, but differences between shots from different framings are not shown as measurements.</p>
                  </>
                )}
              </div>
            )}
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[320px] text-left text-[11px]">
                <thead><tr><th className="py-1 pr-2 font-bold text-foreground-mute">Measurement</th>{chosen.map((s, n) => <th key={s.id} className="px-1 font-bold" style={{ color: PALETTE[n % PALETTE.length] }}>#{s.seq}</th>)}</tr></thead>
                <tbody>
                  <tr className="border-t border-line"><td className="py-1 pr-2 text-foreground-mute">Path quality</td>{chosen.map((s) => <td key={s.id} className="px-1 text-foreground-dim">{QUALITY[s.quality.level].text}</td>)}</tr>
                  <tr className="border-t border-line"><td className="py-1 pr-2 text-foreground-mute">Seen points / mean score</td>{chosen.map((s) => <td key={s.id} className="px-1 text-foreground-dim">{s.points.length} / {meanScore(s)}</td>)}</tr>
                  {MEASURES.map((m) => (
                    <tr key={m.key} className="border-t border-line align-top">
                      <td className="py-1 pr-2 text-foreground-mute">{m.label}</td>
                      {chosen.map((s, i) => {
                        const v = val(s, m.key, m.unit, m.digits ?? 2);
                        const base = chosen[0].fingerprint?.m[m.key], cur = s.fingerprint?.m[m.key];
                        const delta = i > 0 && allComparable && typeof base === "number" && typeof cur === "number" ? ` (${cur - base >= 0 ? "+" : ""}${(cur - base).toFixed(m.digits ?? 2)})` : "";
                        return <td key={s.id} className={`px-1 ${v ? "font-semibold text-foreground" : "text-foreground-mute"}`}>{v ? `${v}${delta}` : <span title={explainMissing(s.fingerprint?.why[m.key] ?? "")}>n/a{s.fingerprint ? "" : " (no path kept)"}</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[10px] text-foreground-mute">bw = ball widths of that shot. n/a means it could not be measured from what the camera saw (tap or hold for the reason). Differences in brackets appear only when the shots are comparable. Measured from seen points only, never filled-in ones.</p>
            </div>
          </section>
        )}

        {!analytics && h && h.shots.length > 0 && <p className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-mute">Working out consistency…</p>}
        {analytics && h && h.shots.length > 0 && (
          <section aria-label="Consistency" className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Consistency (where the ball was seen at rim height)</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[320px] text-left text-[11px]">
                <thead><tr className="text-foreground-mute"><th className="py-1 pr-2">Session</th><th>Shots</th><th>With path</th><th>Measurable</th><th>Framing</th></tr></thead>
                <tbody>{analytics.coverage.map((c) => <tr key={c.sessionKey} className="border-t border-line"><td className="py-1 pr-2">{date(c.startedAt)}</td><td>{c.shots}</td><td>{c.tracked}</td><td>{c.withMeasure} ({Math.round(c.availability * 100)}%)</td><td>{c.framingGroup}</td></tr>)}</tbody>
              </table>
            </div>
            {analytics.groups.map((g) => (
              <div key={g.name} className="mt-3">
                <p className="font-bold text-foreground">{g.name}</p>
                <ul className="mt-1 space-y-2">
                  {g.statements.filter((s) => s.status === "supported").map((s) => <StatementView key={s.id} s={s} />)}
                  {g.statements.filter((s) => s.status === "supported").length === 0 && <li className="text-foreground-mute">No statement is supported by enough measurable shots yet.</li>}
                </ul>
                <details className="mt-1"><summary className="cursor-pointer text-[11px] text-foreground-mute">What was not reported, and why</summary>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-foreground-mute">{g.statements.filter((s) => s.status === "abstained").map((s) => <li key={s.id}>{LABEL[s.id]}: {s.detail ?? s.reason}</li>)}</ul>
                </details>
              </div>
            ))}
            <p className="mt-2 text-[10px] text-foreground-mute">Only the position of the ball at rim height is analysed. A change in these numbers is a change in where the ball was seen; it is not evidence about how the shot was taken.</p>
          </section>
        )}
      </div>
    </div>
  );
}

const LABEL: Record<Statement["id"], string> = { V1: "Variability", V2: "Trend across sessions", V3: "Latest session against earlier", V4a: "Makes against misses (distance)", V4b: "Makes against misses (spread)" };

function StatementView({ s }: { s: Statement }) {
  const u = s.uncertainty;
  return (
    <li className="rounded-lg bg-raised p-2">
      <p className="text-foreground">{s.claim_observation}</p>
      <p className="mt-1 text-[11px] text-foreground-mute">
        Sample: {Object.entries(s.n).map(([k, v]) => `${v} ${k}`).join(", ")} · measurable on {Math.round(s.measurement_quality.availability * 100)}% of shots
        {u.ci95 ? ` · 95% interval ${u.ci95.lo} to ${u.ci95.hi}` : ""}{u.effect !== null ? ` · estimate ${u.effect}` : ""}{u.p_adjusted !== null ? ` · chance level (adjusted) ${u.p_adjusted}` : ""}
      </p>
      <p className="text-[11px] text-foreground-mute">Compared with: {s.comparison_baseline}</p>
      <p className="text-[11px] text-foreground-mute">{s.interpretation_limit}</p>
      <p className="text-[11px] text-foreground-mute">Caution: {s.caution}</p>
      <details className="text-[10px] text-foreground-mute"><summary className="cursor-pointer">{s.supporting_shot_ids.length} shots behind this</summary><p className="break-all">{s.supporting_shot_ids.join(", ")}</p></details>
    </li>
  );
}
