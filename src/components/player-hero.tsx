import { ProgressRing } from "@/components/charts/progress-ring";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";
import { SKILL_LEVELS, type SkillLevel } from "@/lib/basketball/assessment";

/**
 * The player card, at the top of Me. One panel carrying name, style,
 * overall rating and headline stats.
 *
 * One way of saying how good you are: the Overall, marked Measured (from
 * the combine) or Self-rated. The training level is the badge. The old
 * "Elite tier" stat was a third scale for the same number and is gone.
 */
export function PlayerHero({
  playerName,
  archetype,
  primaryPosition,
  level,
  overall,
  measured,
  streakWeeks,
  totalSessions,
  seasonPct,
}: {
  playerName: string;
  archetype: string;
  primaryPosition: string;
  level: SkillLevel;
  overall: number;
  /** Ratings from the combine rather than the player's own estimate. */
  measured: boolean;
  streakWeeks: number;
  /** Everything: workouts, shooting sets, film and the combine. */
  totalSessions: number;
  /** This season's make %, already formatted, or null before any shooting. */
  seasonPct: string | null;
}) {
  const positionLabel = PRIMARY_POSITIONS.find((p) => p.value === primaryPosition)?.label ?? "";
  const levelLabel = SKILL_LEVELS.find((l) => l.value === level)?.label ?? "";
  const stats = [
    { value: streakWeeks, label: "Wk streak", accent: streakWeeks > 0 },
    { value: totalSessions, label: totalSessions === 1 ? "Session" : "Sessions", accent: false },
    { value: seasonPct ?? "–", label: "Shooting", accent: false },
  ];

  return (
    // theme-dark re-resolves every token inside this subtree against the
    // dark palette, so the hero reads as a lit panel on the light app shell
    // without any component below knowing which palette it's in.
    <section className="theme-dark hero-sheen panel-lit relative overflow-hidden rounded-3xl border border-line shadow-[var(--shadow-panel)]">
      <div className="court-lines absolute inset-0 opacity-60" aria-hidden />

      <div className="relative px-5 pb-5 pt-6 sm:px-7 sm:pt-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-on-accent">
                {positionLabel}
              </span>
              <span className="rounded-md border border-line-strong px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground-dim">
                {levelLabel}
              </span>
            </div>

            <h1 className="font-display mt-3 text-[2.6rem] uppercase leading-[0.88] tracking-tight text-foreground sm:text-6xl">
              {playerName}
            </h1>
            <p className="mt-2 text-sm font-semibold leading-snug text-accent">{archetype}</p>
          </div>

          <ProgressRing ratio={overall / 99} size={104} stroke={7} idPrefix="ovr">
            <span className="font-display text-gradient-accent text-[2.6rem] leading-none">
              {overall}
            </span>
            <span className="-mt-1 text-[11px] font-extrabold uppercase tracking-[0.2em] text-foreground-dim">
              Overall
            </span>
            <span
              className={`mt-0.5 text-[11px] font-extrabold uppercase tracking-[0.12em] ${
                measured ? "text-[var(--data-positive)]" : "text-foreground-mute"
              }`}
            >
              {measured ? "Measured" : "Self-rated"}
            </span>
          </ProgressRing>
        </div>
      </div>

      <div className="relative mt-1 grid grid-cols-3 border-t border-line">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`px-4 py-3.5 text-center ${i < stats.length - 1 ? "border-r border-line" : ""}`}
          >
            <p
              className={`font-display text-2xl uppercase leading-none ${
                stat.accent ? "text-accent" : "text-foreground"
              }`}
            >
              {stat.value}
            </p>
            <p className="mt-1.5 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground-dim">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
