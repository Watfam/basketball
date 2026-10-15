"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Shot } from "@/lib/basketball/shooting";
import { sessionReviewEnabled } from "@/lib/review/flag";
import { getReviewRecords } from "@/lib/review/review-store";
import type { ReviewShot } from "@/lib/review/types";
import { assessRimReading, rimWarningEnabled, type RimAssessment } from "@/lib/review/rim-warning";
import { RimWarningBanner } from "@/components/rim-warning-banner";

// Loaded only when someone opens it, and only when the flag is on: with the flag off none of this code is fetched.
const SessionReview = dynamic(() => import("@/components/session-review").then((m) => m.SessionReview), { ssr: false });

/**
 * The entry point on the existing review screen (shot-review.tsx). Renders nothing unless the hl:session-review flag is on
 * (localStorage.setItem("hl:session-review", "1")). Attaches each camera shot's review record when the phone has it.
 */
export function SessionReviewEntry({ shots }: { shots: Shot[] }) {
  // Read after hydration; the server snapshot is always off, so nothing differs on first paint.
  const on = useSyncExternalStore(() => () => {}, () => sessionReviewEnabled(), () => false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ReviewShot[] | null>(null);
  // Experimental rim warning (flag hl:rim-warning, off by default). With the flag off nothing below runs: no records are read, nothing is assessed.
  const rimOn = useSyncExternalStore(() => () => {}, () => rimWarningEnabled(), () => false);
  const [warning, setWarning] = useState<{ key: string; a: RimAssessment } | null>(null);
  const key = shots.map((s) => `${s.seq}:${s.replayId ?? ""}`).join("|");
  useEffect(() => {
    if (!rimOn || !on || shots.length === 0) return;
    let live = true;
    const ids = shots.map((s) => s.replayId).filter((x): x is string => !!x);
    void getReviewRecords(ids).then((records) => { if (live) setWarning({ key, a: assessRimReading([...records.values()]) }); }).catch(() => { /* no warning if records cannot be read */ });
    return () => { live = false; };
  }, [rimOn, on, key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` identifies the shots; their array identity changes every render
  const marked = useMemo(() => (warning && warning.key === key && warning.a.warn ? warning.a.affected.map((x) => shots.find((s) => s.replayId === x.shotId)?.seq).filter((n): n is number => typeof n === "number").sort((a, b) => a - b) : []), [warning, key, shots]);
  if (!on || shots.length === 0) return null;

  const openReview = async () => {
    const ids = shots.map((s) => s.replayId).filter((x): x is string => !!x);
    const records = await getReviewRecords(ids);
    setItems(shots.map((s) => ({ seq: s.seq, made: s.made, detectedMade: s.detectedMade, flagged: s.flagged, tMs: s.tMs, replayId: s.replayId, record: s.replayId ? (records.get(s.replayId) ?? null) : null })));
    setOpen(true);
  };

  return (
    <>
      {rimOn && warning && warning.key === key && <RimWarningBanner assessment={warning.a} shotNumbers={marked} onReview={() => void openReview()} />}
      <button type="button" onClick={() => void openReview()} className="mt-2 self-center text-[11px] font-bold uppercase tracking-wide text-accent">
        Review your shots (beta)
      </button>
      {open && items && <SessionReview shots={items} title="Review your shots" marked={marked} onClose={() => setOpen(false)} />}
    </>
  );
}
