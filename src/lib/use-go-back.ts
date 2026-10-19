"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NAV_KEY, REPLACE_KEY, screenBefore } from "@/lib/nav-stack";

/** The screen the player came from (the full address), or null when the app was just opened on this one. Safe to call during an event. */
export function cameFrom(current: string): string | null {
  try {
    const stack = JSON.parse(sessionStorage.getItem(NAV_KEY) ?? "[]") as string[];
    return Array.isArray(stack) ? screenBefore(stack, current) : null;
  } catch {
    return null;
  }
}

/** Goes back to the screen the player came from; with none (the app was opened here), to `fallback`. */
export function useGoBack(fallback: string): () => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(() => {
    if (cameFrom(pathname)) router.back();
    else router.push(fallback);
  }, [router, pathname, fallback]);
}

/** Say that the next navigation replaces this screen instead of adding one, so the record of screens matches the browser's history. */
export function noteReplace() {
  try { sessionStorage.setItem(REPLACE_KEY, String(Date.now())); } catch { /* private mode */ }
}
