"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import { sessionReviewEnabled } from "@/lib/review/flag";

// Loaded only when opened, and only when the flag is on: with the flag off none of this code is fetched.
const ShotHistory = dynamic(() => import("@/components/shot-history").then((m) => m.ShotHistory), { ssr: false });

/** Entry to shot history and its settings, for the shooting screen. Renders nothing unless the hl:session-review flag is on. */
export function TrackingHistoryEntry({ playerId }: { playerId: string }) {
  const on = useSyncExternalStore(() => () => {}, () => sessionReviewEnabled(), () => false);
  const [open, setOpen] = useState(false);
  if (!on) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 self-center text-[11px] font-bold uppercase tracking-wide text-accent">
        Shot history (beta)
      </button>
      {open && <ShotHistory playerId={playerId} onClose={() => setOpen(false)} />}
    </>
  );
}
