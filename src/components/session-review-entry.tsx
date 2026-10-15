"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import type { Shot } from "@/lib/basketball/shooting";
import { sessionReviewEnabled } from "@/lib/review/flag";
import { getReviewRecords } from "@/lib/review/review-store";
import type { ReviewShot } from "@/lib/review/types";

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
  if (!on || shots.length === 0) return null;

  const openReview = async () => {
    const ids = shots.map((s) => s.replayId).filter((x): x is string => !!x);
    const records = await getReviewRecords(ids);
    setItems(shots.map((s) => ({ seq: s.seq, made: s.made, detectedMade: s.detectedMade, flagged: s.flagged, tMs: s.tMs, replayId: s.replayId, record: s.replayId ? (records.get(s.replayId) ?? null) : null })));
    setOpen(true);
  };

  return (
    <>
      <button type="button" onClick={() => void openReview()} className="mt-2 self-center text-[11px] font-bold uppercase tracking-wide text-accent">
        Session review (beta)
      </button>
      {open && items && <SessionReview shots={items} title="Session review (beta)" onClose={() => setOpen(false)} />}
    </>
  );
}
