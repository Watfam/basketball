"use client";

import { useEffect } from "react";
import { PROFILE_COOKIE, encodeProfile, type Profile } from "@/lib/profile";

/** A year: the choice should outlast any normal gap between sessions. */
const MAX_AGE = 60 * 60 * 24 * 365;

export function rememberProfile(p: Profile) {
  document.cookie = `${PROFILE_COOKIE}=${encodeURIComponent(encodeProfile(p))}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

/** Set while the coach is looking at a player's pages from the coach home. */
const COACH_VIEW_KEY = "hl:viewingAsCoach";

function coachIsViewing(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("from") === "coach") {
      sessionStorage.setItem(COACH_VIEW_KEY, "1");
    }
    return sessionStorage.getItem(COACH_VIEW_KEY) === "1";
  } catch {
    return false;
  }
}

/** The front door: whoever is picked next is a real choice again. */
export function endCoachView() {
  try {
    sessionStorage.removeItem(COACH_VIEW_KEY);
  } catch {
    // Storage blocked: nothing was set either.
  }
}

/**
 * Placed in the player and team layouts: opening one of those pages makes
 * it the active profile, so a shared link or a bookmark lands as that
 * person without a second question.
 *
 * Except when the coach opens a player from the coach home (links carry
 * ?from=coach): checking Cameron's stats must not make the phone think
 * Cameron is the one using it. That lasts for the browser tab, until the
 * front door is opened again.
 */
export function RememberProfile({ profile }: { profile: Profile }) {
  const value = encodeProfile(profile);
  useEffect(() => {
    if (profile.kind === "coach") endCoachView();
    else if (coachIsViewing()) return;
    rememberProfile(profile);
    // Only the encoded value matters; the object is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return null;
}

/** On the front door: picking a player there is a real choice. */
export function EndCoachView() {
  useEffect(() => endCoachView(), []);
  return null;
}
