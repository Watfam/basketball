"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { NAV_KEY, popScreen, pushScreen } from "@/lib/nav-stack";

/** Notes each screen the player visits in this tab (see nav-stack.ts), so Back can return to the screen they came from. Draws nothing. */
export function NavTracker() {
  const pathname = usePathname();
  const poppedAt = useRef(0);
  useEffect(() => {
    const onPop = () => { poppedAt.current = Date.now(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    let stack: string[] = [];
    try { stack = JSON.parse(sessionStorage.getItem(NAV_KEY) ?? "[]") as string[]; } catch { stack = []; }
    if (!Array.isArray(stack)) stack = [];
    const url = pathname + window.location.search;
    // Coming back with the browser's own Back (a swipe) drops the screen that was left.
    if (Date.now() - poppedAt.current < 3000) {
      poppedAt.current = 0;
      stack = popScreen(stack);
      if (stack[stack.length - 1]?.split("?")[0] !== pathname) stack = pushScreen(stack, url);
    } else {
      stack = pushScreen(stack, url);
    }
    try { sessionStorage.setItem(NAV_KEY, JSON.stringify(stack)); } catch { /* private mode: Back just goes to the default screen */ }
  }, [pathname]);
  return null;
}
