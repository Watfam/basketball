import { byZone, durationMinutes, formatPercentage, shotsPerMinute, summarize, type Shot } from "@/lib/basketball/shooting";

/**
 * The most recent shots as a row of marks.
 *
 * A make is a filled disc and a miss is a hollow ring, so the two differ
 * by shape and not only colour. With onToggle it is also the correction
 * control: tap a mark to flip it. That matters for the camera tracker
 * too, where fixing the occasional wrong call has to be one tap.
 */
export function ShotStrip({
  shots,
  onToggle,
  limit = 20,
}: {
  shots: Shot[];
  onToggle?: (seq: number) => void;
  limit?: number;
}) {
  const visible = shots.slice(-limit);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5" role="list" aria-label="Recent shots">
      {visible.map((s) => {
        const mark = s.made
          ? "border-[var(--data-positive)] bg-[var(--data-positive)]"
          : "border-foreground-mute bg-transparent";
        const label = `Shot ${s.seq}: ${s.made ? "made" : "missed"}${
          onToggle ? ". Tap to change." : ""
        }`;
        return onToggle ? (
          <button
            key={s.seq}
            type="button"
            role="listitem"
            aria-label={label}
            onClick={() => onToggle(s.seq)}
            className={`h-6 w-6 rounded-full border-2 transition-transform active:scale-90 ${mark}`}
          />
        ) : (
          <span
            key={s.seq}
            role="listitem"
            aria-label={label}
            className={`h-4 w-4 rounded-full border-2 ${mark}`}
          />
        );
      })}
    </div>
  );
}

/**
 * The whole story of one session: makes over attempts, percentage,
 * streak, where the shots came from. Used both right after finishing
 * and when reopening a saved session, so the two never disagree.
 */
export function SessionSummary({
  label,
  dateLabel,
  startedAt,
  endedAt,
  shots,
  average,
}: {
  label: string | null;
  dateLabel?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  shots: Shot[];
  /** The player's own make % for this kind of shot, to set today against. */
  average?: { pct: number; sessions: number } | null;
}) {
  const sum = summarize(shots);
  const pace = shotsPerMinute(shots.length, startedAt ?? null, endedAt ?? null);
  const zones = byZone(shots);
  const minutes = durationMinutes(startedAt ?? null, endedAt ?? null);
  const untagged = shots.filter((s) => s.zone === null).length;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">
          {label ?? "Shooting session"}
          {dateLabel ? ` · ${dateLabel}` : ""}
        </p>
        <div className="mt-2 flex items-end gap-4">
          <p className="font-display text-6xl leading-none text-foreground">
            {sum.makes}
            <span className="text-foreground-mute">/{sum.attempts}</span>
          </p>
          <p className="font-display pb-1 text-3xl leading-none text-accent">
            {formatPercentage(sum.pct)}
          </p>
        </div>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
          {[
            minutes !== null ? `${minutes} min` : null,
            sum.longestMakeStreak >= 2 ? `Best run ${sum.longestMakeStreak} makes` : null,
            sum.longestMissStreak >= 3 ? `Longest miss streak ${sum.longestMissStreak}` : null,
            pace !== null ? `${pace} shots a min` : null,
          ]
            .filter((t): t is string => Boolean(t))
            // Each stat stays on one line; only the gaps between them wrap.
            .map((t) => t.replace(/ /g, "\u00a0"))
            .join(" · ")}
        </p>
      </div>

      {average && sum.pct !== null && (
        <div className="rounded-xl border border-line bg-[var(--raised)] p-3">
          <div className="flex items-baseline justify-between text-[11px] font-bold uppercase tracking-wide">
            <span className="text-foreground-mute">
              Your {label ?? "shooting"} average · {average.sessions} {average.sessions === 1 ? "session" : "sessions"}
            </span>
            <span className="tabular-nums text-foreground-dim">{formatPercentage(average.pct)}</span>
          </div>
          <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-accent" style={{ width: `${sum.pct}%` }} />
            <div
              className="absolute top-0 h-full w-0.5 bg-foreground"
              style={{ left: `${average.pct}%` }}
              aria-hidden
            />
          </div>
          <p className="mt-1.5 text-xs font-semibold text-foreground">
            Today {formatPercentage(sum.pct)}
            {sum.pct > average.pct ? " · above your average" : sum.pct < average.pct ? " · below your average" : " · right on it"}
          </p>
        </div>
      )}

      <ShotStrip shots={shots} limit={60} />

      {zones.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
            By spot
          </p>
          {zones.map((z) => (
            <div key={z.zone}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-foreground">{z.label}</span>
                <span className="text-[11px] font-bold tabular-nums text-foreground-dim">
                  {z.makes}/{z.attempts} · {formatPercentage(z.pct)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--raised)]">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${z.pct ?? 0}%` }}
                />
              </div>
            </div>
          ))}
          {untagged > 0 && (
            <p className="text-[11px] text-foreground-mute">
              {untagged} {untagged === 1 ? "shot" : "shots"} without a spot
            </p>
          )}
        </div>
      )}
    </div>
  );
}
