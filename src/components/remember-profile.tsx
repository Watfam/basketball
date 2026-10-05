"use client";

import { useEffect } from "react";
import { PROFILE_COOKIE, encodeProfile, type Profile } from "@/lib/profile";

/** A year: the choice should outlast any normal gap between sessions. */
const MAX_AGE = 60 * 60 * 24 * 365;

export function rememberProfile(p: Profile) {
  document.cookie = `${PROFILE_COOKIE}=${encodeURIComponent(encodeProfile(p))}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

/**
 * Placed in the player and team layouts: opening one of those pages makes
 * it the active profile, so a shared link or a bookmark lands as that
 * person without a second question.
 */
export function RememberProfile({ profile }: { profile: Profile }) {
  const value = encodeProfile(profile);
  useEffect(() => {
    rememberProfile(profile);
    // Only the encoded value matters; the object is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return null;
}
