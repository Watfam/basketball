"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { idbHistory } from "@/lib/review/history-store";
import { SAMPLE_PLAYER, importSample, previewSample, removeSample, sampleCounts } from "@/lib/review/sample-replay";
import { markHistoryUsed } from "@/lib/review/history-ops";
import { syntheticRecord } from "@/lib/review/selftest";
import type { ImportPlan } from "@/lib/review/history-transfer";
import type { ReviewShot } from "@/lib/review/types";
import { ShotHistory } from "@/components/shot-history";
import { SessionReview } from "@/components/session-review";
import { assessRimReading, type RimAssessment } from "@/lib/review/rim-warning";
import { RimWarningBanner } from "@/components/rim-warning-banner";
import { Button } from "@/components/ui/button";

/** Step 1 of the camera-free test: bring the replay sample onto this phone, into its own area, and look at it. Nothing leaves the phone. */
export function ReplaySamplePanel({ onChanged }: { onChanged?: () => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const [counts, setCounts] = useState<{ sessions: number; shots: number } | null>(null);
  const [file, setFile] = useState<{ text: string; name: string } | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"none" | "history" | "review" | "rim">("none");
  const [rim, setRim] = useState<{ a: RimAssessment; shots: ReviewShot[]; marked: number[] } | null>(null);
  const [shots, setShots] = useState<ReviewShot[]>([]);

  const refresh = useCallback(async () => { try { setCounts(await sampleCounts(idbHistory)); } catch { setCounts(null); } }, []);
  useEffect(() => { let live = true; void Promise.resolve().then(() => { if (live) void refresh(); }); return () => { live = false; }; }, [refresh]);

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setNote(null); setPlan(null);
    try { const text = await f.text(); setFile({ text, name: f.name }); setPlan(await previewSample(text, idbHistory)); } catch { setNote("That file could not be read."); }
    setBusy(false); if (picker.current) picker.current.value = "";
  };
  const doImport = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await importSample(file.text, idbHistory);
      if (r.ok) { if (r.added > 0) markHistoryUsed(); setNote(r.added === 0 ? "Nothing new: this sample is already on the phone. Nothing was changed." : `Added ${r.added} sample sets (${r.shots} shots) in the separate sample area. Nothing else on this phone was changed.`); }
      else setNote(r.message);
    } catch { setNote("Could not import. Nothing was changed."); }
    setPlan(null); setFile(null); setBusy(false); await refresh(); onChanged?.();
  };
  const wipe = async () => {
    if (!window.confirm("Remove the replay sample from this phone? Only the sample is removed. Your own sets and shot paths are not touched.")) return;
    setBusy(true);
    try { const n = await removeSample(idbHistory); setNote(`Removed ${n} sample set${n === 1 ? "" : "s"}. Nothing else was touched.`); } catch { setNote("Could not remove the sample. Try again."); }
    setBusy(false); await refresh(); onChanged?.();
  };
  const madeUp = () => {
    let seed = 7; const r = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    setShots(Array.from({ length: 14 }, (_, i) => ({ seq: i + 1, made: i % 3 !== 0, detectedMade: i % 3 !== 0, flagged: i === 4, tMs: i * 20000, replayId: undefined, record: i === 9 ? null : syntheticRecord(`preview-${i}`, r) })));
    setRim(null); setView("review");
  };
  const rimPreview = () => {
    let seed = 11; const r = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const list: ReviewShot[] = Array.from({ length: 12 }, (_, i) => {
      const rec = syntheticRecord(`rim-${i}`, r);
      // made-up: for four of the shots put flagged boxes on the rim for half the frames (what the recorder writes when the rim is read as a ball)
      if ([2, 3, 6, 8].includes(i)) for (const f of rec.frames) if (f.t > -600 && f.t < 900) f.boxes.push({ x1: rec.rim.x - 17, y1: rec.rim.y - 3, x2: rec.rim.x - 6, y2: rec.rim.y + 8, score: 0.5, occ: true });
      return { seq: i + 1, made: i % 2 === 0, detectedMade: i % 2 === 0, flagged: false, tMs: i * 20000, replayId: rec.shotId, record: rec };
    });
    const a = assessRimReading(list.map((x) => x.record as NonNullable<typeof x.record>));
    setRim({ a, shots: list, marked: a.affected.map((x) => list.find((s) => s.replayId === x.shotId)?.seq).filter((n): n is number => typeof n === "number").sort((x, y) => x - y) });
    setView("rim");
  };
  const importable = plan && plan.ok ? plan.summary.new : 0;
  const has = !!counts && counts.sessions > 0;
  const sec = "rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim", h = "text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute";

  return (
    <section aria-label="Replay sample" className={sec}>
      <p className={h}>Step 1 · the replay sample</p>
      <p className="mt-1">A file of real tracked shot paths, made on the computer from your existing recordings. Coordinates only: no video, no pictures, no names. It is imported into its own <b>sample</b> area, so it never mixes with your players&apos; sets, never shows in their lists, and removing it leaves everything else exactly as it was.</p>
      <p className="mt-1 font-semibold text-foreground">{counts === null ? "Checking…" : has ? `Sample on this phone: ${counts.sessions} sets, ${counts.shots} shots.` : "No sample on this phone yet."}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => picker.current?.click()} disabled={busy}>{has ? "Import the file again…" : "Import the sample file…"}</Button>
        <Button variant="secondary" size="sm" onClick={() => setView("history")} disabled={!has}>Browse the sample</Button>
        <Button variant="secondary" size="sm" onClick={madeUp}>Preview “Review your shots” (made-up shots)</Button>
        <Button variant="secondary" size="sm" onClick={rimPreview}>Preview the rim warning (made-up set)</Button>
        <Button variant="danger" size="sm" onClick={() => void wipe()} disabled={busy || !has}>Remove the sample</Button>
        <input ref={picker} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} aria-label="Choose the replay sample file" />
      </div>
      {plan && !plan.ok && <p role="alert" className="mt-2 font-semibold text-foreground">{plan.message}</p>}
      {plan && plan.ok && (
        <div className="mt-2 rounded-xl border border-line p-2">
          <p className="text-foreground"><b>{file?.name}</b> has {plan.sessions.length} set{plan.sessions.length === 1 ? "" : "s"}: {plan.summary.new} new{plan.summary.duplicate > 0 ? `, ${plan.summary.duplicate} already here (skipped)` : ""}{plan.summary.damaged > 0 ? `, ${plan.summary.damaged} unreadable (skipped)` : ""}.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void doImport()} disabled={busy || importable === 0}>Import {importable} set{importable === 1 ? "" : "s"}</Button>
            <Button variant="secondary" size="sm" onClick={() => { setPlan(null); setFile(null); }} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
      {note && <p aria-live="polite" className="mt-2 text-foreground">{note}</p>}
      <p className="mt-2 text-foreground-mute">The made-up preview opens the post-set review screen on invented shots so you can check how it looks and feels on the phone. It says nothing about the camera.</p>
      {view === "history" && <ShotHistory playerId={SAMPLE_PLAYER} sample onClose={() => { setView("none"); void refresh(); }} />}
      {view === "rim" && rim && (
        <div role="dialog" aria-modal="true" aria-label="Rim warning preview" className="theme-dark fixed inset-0 z-[70] overflow-y-auto bg-background text-foreground">
          <div className="mx-auto w-full max-w-md px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between"><p className="text-sm font-extrabold uppercase tracking-wide">Rim warning preview (made-up set)</p><Button variant="ghost" size="sm" onClick={() => setView("none")}>Done</Button></div>
            <p className="mt-2 text-[12px] text-foreground-mute">A made-up set where the rim is read as a ball in several shots. This is how the note looks at the end of a camera set. It is invented data: it says nothing about the camera.</p>
            <RimWarningBanner assessment={rim.a} shotNumbers={rim.marked} onReview={() => setView("review")} />
            {!rim.a.warn && <p className="mt-3 rounded-lg bg-raised px-2 py-1.5 text-[12px] text-foreground">The preview did not trigger the warning ({rim.a.reason}).</p>}
          </div>
        </div>
      )}
      {view === "review" && rim && <SessionReview shots={rim.shots} title="Review your shots (made-up)" marked={rim.marked} onClose={() => setView("rim")} />}
      {view === "review" && !rim && <SessionReview shots={shots} title="Review your shots (made-up)" onClose={() => setView("none")} />}
    </section>
  );
}
