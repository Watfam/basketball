import { RadarChart } from "@/components/charts/radar-chart";
import { RATING_CATEGORIES, RATING_SCALE_MAX } from "@/lib/basketball/assessment";
import { attributeTier, strongestCategory, weakestCategory, type Ratings } from "@/lib/basketball/rating";

const TIER_STYLES: Record<ReturnType<typeof attributeTier>, { label: string; className: string }> = {
  elite: { label: "Elite", className: "text-accent" },
  high: { label: "Strong", className: "text-[var(--data-positive)]" },
  mid: { label: "Solid", className: "text-foreground-dim" },
  low: { label: "Building", className: "text-foreground-mute" },
};

export function AttributePanel({
  ratings,
  previousRatings,
}: {
  ratings: Ratings;
  previousRatings?: Ratings | null;
}) {
  const strongest = strongestCategory(ratings);
  const weakest = weakestCategory(ratings);

  const axes = RATING_CATEGORIES.map((cat) => ({
    label: cat.label.split(" ")[0],
    value: ratings[cat.value] ?? 0,
    previous: previousRatings?.[cat.value],
  }));

  return (
    <section className="panel-lit overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
          Attributes
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-mute">
          {previousRatings ? "vs. last check-in" : "Baseline"}
        </span>
      </div>

      <div className="px-5 pb-1 pt-2">
        <div className="mx-auto max-w-[260px]">
          <RadarChart axes={axes} max={RATING_SCALE_MAX} idPrefix="attr" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line">
        {RATING_CATEGORIES.map((cat) => {
          const value = ratings[cat.value] ?? 0;
          const previous = previousRatings?.[cat.value];
          const delta = typeof previous === "number" ? value - previous : null;
          const tier = TIER_STYLES[attributeTier(value)];

          return (
            <div key={cat.value} className="bg-surface px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[10px] font-extrabold uppercase tracking-[0.1em] text-foreground-dim">
                  {cat.label}
                </span>
                {delta !== null && delta !== 0 && (
                  <span
                    className={`shrink-0 text-[10px] font-extrabold ${
                      delta > 0 ? "text-[var(--data-positive)]" : "text-foreground-mute"
                    }`}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </span>
                )}
              </div>

              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="font-display text-3xl leading-none text-foreground">{value}</span>
                <span className="text-[10px] font-bold text-foreground-mute">/{RATING_SCALE_MAX}</span>
                <span className={`ml-auto text-[10px] font-extrabold uppercase ${tier.className}`}>
                  {tier.label}
                </span>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--data-dim)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(value / RATING_SCALE_MAX) * 100}%`,
                    background: "linear-gradient(90deg, var(--accent), var(--accent-hover))",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line bg-[var(--raised)] px-5 py-3.5">
        <p className="text-xs leading-relaxed text-foreground-dim">
          <span className="font-bold text-foreground">{strongest.label}</span> is your edge.{" "}
          <span className="font-bold text-foreground">{weakest.label}</span> is where the next
          jump comes from — training below is weighted toward it.
        </p>
      </div>
    </section>
  );
}
