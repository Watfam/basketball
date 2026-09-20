import { VolumeChart, type VolumeWeek } from "@/components/charts/volume-chart";
import { ConsistencyGrid, type DayCell } from "@/components/charts/consistency-grid";

/**
 * The "am I actually putting in work" panel. Volume answers how much,
 * consistency answers how often — kept in one panel because either number
 * alone is misleading (one big week isn't development).
 */
export function TrainingLoadPanel({
  weeks,
  days,
  thisWeekCount,
  weeklyTarget,
}: {
  weeks: VolumeWeek[];
  days: DayCell[];
  thisWeekCount: number;
  weeklyTarget: number;
}) {
  const hitTarget = thisWeekCount >= weeklyTarget;

  return (
    <section className="panel-lit overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
            Training Load
          </h2>
          <p className="mt-1 text-xs text-foreground-dim">Sessions completed per week</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-2xl leading-none text-foreground">
            {thisWeekCount}
            <span className="text-foreground-mute">/{weeklyTarget}</span>
          </p>
          <p
            className={`mt-1 text-[9px] font-extrabold uppercase tracking-[0.14em] ${
              hitTarget ? "text-[var(--data-positive)]" : "text-foreground-mute"
            }`}
          >
            {hitTarget ? "Target hit" : "This week"}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5 pt-5">
        <VolumeChart weeks={weeks} />
      </div>

      <div className="border-t border-line px-5 py-4">
        <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim">
          Consistency
        </p>
        <ConsistencyGrid days={days} />
      </div>
    </section>
  );
}
