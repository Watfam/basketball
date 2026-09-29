"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A string kept on the device under `key`, readable as React state.
 *
 * The point is that work in progress lives on the phone first. A shooting
 * session is many small taps in a gym with unreliable signal; if the only
 * copy were on a server, one dropped request or closed tab would cost the
 * whole session. Writes here are synchronous and local, so a tap can
 * never be lost to the network.
 *
 * useSyncExternalStore rather than useState + useEffect, for two reasons:
 * the server has no storage, so the server snapshot must be null and the
 * client re-reads after hydrating without a mismatch; and it keeps every
 * consumer, and every other tab, on the same value.
 *
 * localStorage can be unavailable (private mode, quota, blocked). Writes
 * then fall back to memory, so the counter still works for the life of
 * the page — it just can't survive a refresh.
 */

const CHANGE_EVENT = "hl:draft-change";
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    // fall through to memory
  }
  return memory.get(key) ?? null;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Read the current value outside a render, e.g. inside an async callback. */
export function readDraft(key: string): string | null {
  if (typeof window === "undefined") return null;
  return read(key);
}

export function writeDraft(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage refused; the in-memory copy above still serves this page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useLocalDraft(key: string): [string | null, (next: string | null) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null
  );
  const write = useCallback((next: string | null) => writeDraft(key, next), [key]);
  return [raw, write];
}
