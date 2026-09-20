/**
 * Milestones. Every one of these is computed from real logged work (session
 * count, streak length) rather than being decorative — a badge a player
 * can't actually earn is worse than no badge. Locked ones show real
 * progress so the next target is always visible.
 */

export type Milestone = {
  id: string;
  label: string;
  detail: string;
  current: number;
  target: number;
};

export function buildMilestones(totalSessions: number, streakWeeks: number): Milestone[] {
  return [
    { id: "first", label: "First Rep", detail: "1 session", current: totalSessions, target: 1 },
    { id: "five", label: "Locked In", detail: "5 sessions", current: totalSessions, target: 5 },
    { id: "streak4", label: "Month Strong", detail: "4-week streak", current: streakWeeks, target: 4 },
    { id: "twentyfive", label: "Grinder", detail: "25 sessions", current: totalSessions, target: 25 },
    { id: "streak12", label: "Offseason", detail: "12-week streak", current: streakWeeks, target: 12 },
  ];
}

export function MilestoneRail({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="rail -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
      {milestones.map((m) => {
        const unlocked = m.current >= m.target;
        const ratio = Math.min(1, m.current / m.target);

        return (
          <div
            key={m.id}
            className={`w-[7.5rem] shrink-0 rounded-2xl border p-3 ${
              unlocked
                ? "border-accent/50 bg-accent/10"
                : "border-line bg-surface"
            }`}
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-extrabold ${
                unlocked ? "bg-accent text-white" : "bg-[var(--data-dim)] text-foreground-mute"
              }`}
            >
              {unlocked ? "★" : "○"}
            </div>

            <p
              className={`mt-2.5 text-[11px] font-extrabold uppercase tracking-wide ${
                unlocked ? "text-accent" : "text-foreground-dim"
              }`}
            >
              {m.label}
            </p>
            <p className="mt-0.5 text-[10px] text-foreground-mute">{m.detail}</p>

            {!unlocked && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--data-dim)]">
                <div
                  className="h-full rounded-full bg-[var(--foreground-mute)]"
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
