"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import { sessionReviewEnabled } from "@/lib/review/flag";

// Loaded only when opened, and only when the flag is on: with the flag off none of this code is fetched.
const ShotHistory = dynamic(() => import("@/components/shot-history").then((m) => m.ShotHistory), { ssr: false });

/** Entry to shot history and its settings, for the shooting screen. Renders nothing unless the hl:session-review flag is on. */
export function TrackingHistoryEntry({ playerId, startedAt, label = "Shot history (beta)", className = "mt-3 self-center" }: { playerId: string; /** Open straight to the saved set that started at this time. */ startedAt?: string; label?: string; className?: string }) {
  const on = useSyncExternalStore(() => () => {}, () => sessionReviewEnabled(), () => false);
  const [open, setOpen] = useState(false);
  if (!on) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${className} text-[11px] font-bold uppercase tracking-wide text-accent`}>
        {label}
      </button>
      {open && <ShotHistory playerId={playerId} focusStartedAt={startedAt} onClose={() => setOpen(false)} />}
    </>
  );
}
