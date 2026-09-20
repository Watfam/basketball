import { ProgressRing } from "@/components/charts/progress-ring";
import { ovrTier } from "@/lib/basketball/rating";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";
import { SKILL_LEVELS, type SkillLevel } from "@/lib/basketball/assessment";

/**
 * The identity block at the top of the hub. One panel carrying name,
 * archetype, overall rating and headline stats — deliberately not four
 * separate stacked cards, which is what made the old hub read as a list
 * of widgets instead of a player's profile.
 */
export function PlayerHero({
  playerName,
  archetype,
  primaryPosition,
  level,
  overall,
  streakWeeks,
  totalSessions,
}: {
  playerName: string;
  archetype: string;
  primaryPosition: string;
  level: SkillLevel;
  overall: number;
  streakWeeks: number;
  totalSessions: number;
}) {
  const positionLabel = PRIMARY_POSITIONS.find((p) => p.value === primaryPosition)?.label ?? "";
  const levelLabel = SKILL_LEVELS.find((l) => l.value === level)?.label ?? "";
  const tier = ovrTier(overall);

  const stats = [
    { value: streakWeeks, label: "Wk streak", accent: streakWeeks > 0 },
    { value: totalSessions, label: totalSessions === 1 ? "Session" : "Sessions", accent: false },
    { value: tier.label, label: "Tier", accent: false, isText: true },
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
              <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">
                {positionLabel}
              </span>
              <span className="rounded-md border border-line-strong px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-foreground-dim">
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
            <span className="-mt-1 text-[9px] font-extrabold uppercase tracking-[0.2em] text-foreground-dim">
              Overall
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
              } ${stat.isText ? "text-xl" : ""}`}
            >
              {stat.value}
            </p>
            <p className="mt-1.5 whitespace-nowrap text-[9px] font-extrabold uppercase tracking-[0.12em] text-foreground-dim">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
