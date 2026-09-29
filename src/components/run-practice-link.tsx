"use client";

import Link from "next/link";
import { primeAlerts } from "@/lib/alerts";
import { haptic } from "@/lib/haptics";

/**
 * The way into Run Practice — a plain Link that also unlocks audio on the
 * way through.
 *
 * Mobile browsers only let a real user gesture start audio, and once the
 * runner has mounted there's no guaranteed tap before the first drill's
 * ten-second warning is due. This tap is that gesture: client-side
 * navigation keeps the same document, so the AudioContext unlocked here
 * is still unlocked when the timer needs to beep.
 */
export function RunPracticeLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch
      onClick={() => {
        primeAlerts();
        haptic("tap");
      }}
      className={className}
    >
      {children}
    </Link>
  );
}
