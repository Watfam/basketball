"use client";

import { useState } from "react";
import { haptic } from "@/lib/haptics";

type Drill = {
  name: string;
  description: string | null;
  video_url: string | null;
  source_trainer: string | null;
  setup: string | null;
  cues: string[] | null;
  common_mistakes: string[] | null;
  equipment: string[] | null;
};

/**
 * "Learn this drill before you start." Opens as a sheet over the session
 * rather than a separate route so a player mid-workout never loses their
 * place — the point is to check a cue between sets, not to navigate away.
 *
 * Renders nothing at all when a drill has no coaching content: a button
 * that opens an empty sheet is worse than no button.
 */
export function DrillInstructions({ drill }: { drill: Drill }) {
  const [open, setOpen] = useState(false);

  const cues = drill.cues ?? [];
  const mistakes = drill.common_mistakes ?? [];
  const equipment = drill.equipment ?? [];
  const hasContent = Boolean(drill.setup) || cues.length > 0 || mistakes.length > 0;

  if (!hasContent) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setOpen(true);
        }}
        className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent transition-colors hover:text-accent-hover"
      >
        How to do this →
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close instructions"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-surface p-6 sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-display text-2xl uppercase leading-[0.98] tracking-tight text-foreground">
                  {drill.name}
                </h3>
                {drill.source_trainer && (
                  <p className="mt-1 text-[10px] font-extrabold uppercase tracking-wider text-foreground-mute">
                    {drill.source_trainer}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-foreground-dim transition-colors hover:text-foreground"
              >
                Close
              </button>
            </div>

            {drill.description && (
              <p className="mt-3 text-sm leading-relaxed text-foreground-dim">{drill.description}</p>
            )}

            {equipment.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {equipment.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-line bg-[var(--raised)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground-dim"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}

            {drill.setup && (
              <Section title="Set Up">
                <p className="text-sm leading-relaxed text-foreground-dim">{drill.setup}</p>
              </Section>
            )}

            {cues.length > 0 && (
              <Section title="Coaching Cues">
                <ul className="space-y-2">
                  {cues.map((cue) => (
                    <li key={cue} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      {cue}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {mistakes.length > 0 && (
              <Section title="Common Mistakes">
                <ul className="space-y-2">
                  {mistakes.map((m) => (
                    <li key={m} className="flex gap-2.5 text-sm leading-relaxed text-foreground-dim">
                      <span className="mt-0.5 shrink-0 font-bold text-foreground-mute">×</span>
                      {m}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {drill.video_url && (
              <a
                href={drill.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 block w-full rounded-xl border border-accent py-3 text-center text-sm font-extrabold uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent/10"
              >
                Watch film ↗
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h4 className="mb-2.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-accent">
        {title}
      </h4>
      {children}
    </div>
  );
}
