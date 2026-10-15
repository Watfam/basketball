import { Card } from "@/components/ui/card";
import { CATEGORY_COMPARISON_NOTE, NOT_A_GAME_CLAIM, VOLUME_CAVEAT, MIN_SHOTS } from "@/lib/basketball/drill-analytics";
import type { KindsOfShotData } from "@/lib/basketball/drill-kinds-server";

/**
 * Tracked workout drills by kind of shot. Side by side with sample sizes, never ranked; compared only from the same spot or the same drill against
 * itself; and plain about what is counted by the camera, what comes from the drill, and what is not measured.
 */
export function KindsOfShot({ data }: { data: KindsOfShotData }) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <section aria-label="By kind of shot">
      <h2 className="mb-2.5 font-display text-xl uppercase leading-none tracking-wide text-foreground">By kind of shot</h2>
      <Card className="overflow-hidden">
        {data.stats.map((s, i) => (
          <div key={s.category} className={`px-4 py-3 ${i ? "border-t border-line" : ""}`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{s.label}</p>
              <p className="font-display text-xl leading-none text-accent">{s.enough ? `${s.pct}%` : "·"}</p>
            </div>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
              {s.makes} of {s.attempts} shots · {s.drills} tracked drill{s.drills === 1 ? "" : "s"}
              {s.enough ? ` · likely range ${pct(s.ci.lo)} to ${pct(s.ci.hi)}` : ` · under ${MIN_SHOTS} shots, too few to read`}
            </p>
            <p className="mt-0.5 text-[11px] text-foreground-mute">
              Counted by {[s.counted.camera ? `the camera in ${s.counted.camera} drill${s.counted.camera === 1 ? "" : "s"}` : null, s.counted.mixed ? `the camera and taps in ${s.counted.mixed}` : null, s.counted.taps ? `taps in ${s.counted.taps}` : null].filter(Boolean).join(", ")}
              {s.playerChanges.flipped + s.playerChanges.added > 0 ? `; you changed ${s.playerChanges.flipped} call${s.playerChanges.flipped === 1 ? "" : "s"} and added ${s.playerChanges.added}` : ""}.
            </p>
          </div>
        ))}
      </Card>
      <p className="mt-2 text-[11px] leading-relaxed text-foreground-mute">{CATEGORY_COMPARISON_NOTE}</p>

      {data.comparisons.length > 0 && (
        <Card className="mt-3 p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">From the same spot</p>
          <ul className="mt-1.5 space-y-2">
            {data.comparisons.map((c) => (
              <li key={`${c.spot}-${c.a.label}-${c.b.label}`} className="text-xs leading-relaxed text-foreground-dim">{c.statement.text}</li>
            ))}
          </ul>
        </Card>
      )}

      {data.repeated.length > 0 && (
        <Card className="mt-3 p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">The same drill over time</p>
          <ul className="mt-1.5 space-y-2">
            {data.repeated.map((r) => (
              <li key={r.name} className="text-xs leading-relaxed text-foreground-dim">{r.statement.text}</li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-foreground-mute">
        Makes and attempts are counted by the camera (or your taps) and corrected by you. The kind of shot is what the drill asks for, not something the
        camera saw. Footwork, speed, defenders and decisions are not measured. {VOLUME_CAVEAT} {NOT_A_GAME_CLAIM}
      </p>
    </section>
  );
}
