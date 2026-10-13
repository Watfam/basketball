import { Card } from "@/components/ui/card";
import { formatPercentage, percentage } from "@/lib/basketball/shooting";
import { totalsOf, type RealSet } from "@/lib/vision/real-sets";

/**
 * Real sets shot with the camera: what it rang as unsure, what players
 * changed in review, what they added by hand, and how its makes compare
 * with the final ones. Changes are only those made in review: a set saved
 * without looking shows none, so zero is not proof the camera was right.
 */
export function RealSets({ sets, playerNames }: { sets: RealSet[]; playerNames: Record<string, string> }) {
  if (sets.length === 0) return null;
  const t = totalsOf(sets);
  // A set with no changes was either right or never looked at; the data can't say which. So: changes over all shots (the floor) and over
  // only the sets where something was changed (a ceiling, since those were certainly looked at).
  const looked = sets.filter((x) => x.changed > 0);
  const lookedShots = looked.reduce((a, x) => a + x.cameraShots, 0);
  const lookedChanged = looked.reduce((a, x) => a + x.changed, 0);
  const bias = t.finalMakes > 0 ? Math.round(((t.cameraSaidMakes - t.finalMakes) / t.finalMakes) * 100) : null;
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">Real sets</h2>
      <p className="text-xs leading-relaxed text-foreground-dim">
        Sets shot with the camera, and what players did in review. Only changes made in review show, so a set saved without
        looking shows none.
      </p>
      <Card className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
        <Stat
          label="Calls changed"
          value={`${t.changed} of ${t.cameraShots}`}
          sub={
            lookedShots > 0 && lookedShots < t.cameraShots
              ? `${formatPercentage(percentage(t.changed, t.cameraShots))} of all · ${formatPercentage(percentage(lookedChanged, lookedShots))} where something changed`
              : formatPercentage(percentage(t.changed, t.cameraShots))
          }
        />
        <Stat label="Ringed unsure" value={`${t.ringed} of ${t.cameraShots}`} sub={formatPercentage(percentage(t.ringed, t.cameraShots))} />
        <Stat
          label="Makes: camera → final"
          value={`${t.cameraSaidMakes} → ${t.finalMakes}`}
          sub={bias === null ? "" : `${bias > 0 ? "+" : ""}${bias}%`}
        />
        <Stat label="Added by hand" value={String(t.addedByHand)} sub={`${t.sets} ${t.sets === 1 ? "set" : "sets"}`} />
      </Card>
      <Card className="overflow-hidden">
        {sets.map((s, i) => (
          <div key={s.id} className={`px-4 py-3 ${i ? "border-t border-line" : ""}`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">
                {s.makes}/{s.attempts} · {formatPercentage(percentage(s.makes, s.attempts))}
                <span className="font-normal text-foreground-dim"> · {playerNames[s.playerId] ?? "Player"}</span>
                {s.isTest && <span className="ml-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">test</span>}
              </p>
              <p className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                {new Date(s.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                {s.minutes !== null ? ` · ${s.minutes} min` : ""}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-foreground-dim">
              Ringed {s.ringed} ({formatPercentage(percentage(s.ringed, s.cameraShots))}) · changed {s.changed} · added {s.addedByHand} · makes {s.cameraSaidMakes} → {s.finalMakes}
            </p>
            <p className="mt-0.5 text-[11px] text-foreground-mute">
              {s.ruleVersion ?? "?"} · {s.modelVersion ?? "?"}
              {s.rimX !== null && s.rimY !== null ? ` · rim ${s.rimX.toFixed(2)}, ${s.rimY.toFixed(2)}` : ""}
            </p>
          </div>
        ))}
      </Card>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">{label}</p>
      <p className="font-display mt-0.5 text-2xl leading-none text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs font-bold text-accent">{sub}</p>}
    </div>
  );
}
