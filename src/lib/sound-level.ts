/** How loud the app's own sounds are: Normal, or Loud (the default: outdoors a phone speaker is the quietest thing at the court). */
export type SoundLevel = "normal" | "loud";

export const SOUND_LEVEL_KEY = "hl:sound:level";

export const SOUND_LEVELS: { value: SoundLevel; label: string; /** Loudest a beep gets, 0 to 1 of the phone's volume. */ peak: number; wave: "sine" | "square" }[] = [
  { value: "normal", label: "Normal", peak: 0.3, wave: "sine" },
  { value: "loud", label: "Loud", peak: 1, wave: "square" },
];

/** Normal, or Loud for anything else (a phone that had the short-lived "max" setting gets Loud, which is as loud as Max was). */
export function parseSoundLevel(raw: string | null | undefined): SoundLevel {
  return raw === "normal" ? "normal" : "loud";
}

export const levelSettings = (level: SoundLevel) => SOUND_LEVELS.find((l) => l.value === level) ?? SOUND_LEVELS[1];
