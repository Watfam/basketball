/** How loud the app's own sounds are. Outdoors a phone speaker is the quietest thing at the court, so the default is already Loud. */
export type SoundLevel = "normal" | "loud" | "max";

export const SOUND_LEVEL_KEY = "hl:sound:level";

export const SOUND_LEVELS: { value: SoundLevel; label: string; /** Loudest a beep gets, 0 to 1 of the phone's volume. */ peak: number; wave: "sine" | "square" }[] = [
  { value: "normal", label: "Normal", peak: 0.3, wave: "sine" },
  { value: "loud", label: "Loud", peak: 0.75, wave: "square" },
  { value: "max", label: "Max", peak: 1, wave: "square" },
];

export function parseSoundLevel(raw: string | null | undefined): SoundLevel {
  return raw === "normal" || raw === "max" || raw === "loud" ? raw : "loud";
}

export const levelSettings = (level: SoundLevel) => SOUND_LEVELS.find((l) => l.value === level) ?? SOUND_LEVELS[1];
