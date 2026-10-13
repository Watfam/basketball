"use client";

import { useLocalDraft } from "@/lib/use-local-draft";

/** Whether drill timers beep on this phone. On unless switched off. */
export const DRILL_SOUND_KEY = "hl:sound:drills";

export function useDrillSound(): [boolean, (on: boolean) => void] {
  const [raw, setRaw] = useLocalDraft(DRILL_SOUND_KEY);
  return [raw !== "off", (on) => setRaw(on ? "on" : "off")];
}
