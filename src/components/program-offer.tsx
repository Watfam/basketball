"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrollInProgram } from "@/app/actions";
import { haptic } from "@/lib/haptics";

const SKILL_LABELS: Record<string, string> = {
  ball_handling: "Ball Handling",
  shooting: "Shooting",
  defense: "Defense",
  athleticism: "Athleticism",
};

export type OfferedProgram = {
  id: string;
  name: string;
  description: string | null;
  focus_areas: string[] | null;
  level: string | null;
  week_count: number;
  days_per_week: number;
};

/**
 * Shown when a player isn't on a program. Committing to a block is a real
 * decision — weeks of scheduled work — so this states the commitment up
 * front rather than burying it behind a one-tap join.
 */
export function ProgramOffer({
  playerId,
  programs,
  reasons,
}: {
  playerId: string;
  programs: OfferedProgram[];
  reasons: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function join(programId: string) {
    haptic("tap");
    setPendingId(programId);
    startTransition(async () => {
      const result = await enrollInProgram(playerId, programId);
      setPendingId(null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (programs.length === 0) return null;

  return (
    <div className="space-y-3">
      {programs.map((program) => (
        <div
          key={program.id}
          className="panel-lit overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-panel)]"
        >
          <div className="px-5 pt-5">
            <div className="flex flex-wrap items-center gap-1.5">
              {program.focus_areas?.map((area) => (
                <span
                  key={area}
                  className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-accent"
                >
                  {SKILL_LABELS[area] ?? area}
                </span>
              ))}
            </div>

            <h3 className="font-display mt-2 text-2xl uppercase leading-[0.98] tracking-tight text-foreground">
              {program.name}
            </h3>
            {reasons[program.id] && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-accent">
                <span className="inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
                {reasons[program.id]}
              </p>
            )}
            {program.description && (
              <p className="mt-1.5 text-xs leading-relaxed text-foreground-dim">
                {program.description}
              </p>
            )}

            <div className="mt-3 flex items-center gap-4 border-y border-line py-2.5">
              <Metric value={String(program.week_count)} unit="weeks" />
              <Metric value={String(program.days_per_week)} unit="days / wk" />
              <Metric value={String(program.week_count * program.days_per_week)} unit="sessions" />
            </div>
          </div>

          <div className="px-5 py-3.5">
            <button
              type="button"
              onClick={() => join(program.id)}
              disabled={pendingId !== null}
              className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-accent-hover active:scale-[0.99] disabled:opacity-50"
            >
              {pendingId === program.id ? "Starting…" : "Start this program"}
            </button>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Metric({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-display text-lg leading-none text-foreground">{value}</span>
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-foreground-mute">
        {unit}
      </span>
    </div>
  );
}
