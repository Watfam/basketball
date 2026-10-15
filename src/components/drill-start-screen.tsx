"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { describeGoal } from "@/lib/basketball/goals";
import { describeHow, parseTracked } from "@/lib/basketball/drill-tracking";
import type { DrillStart } from "@/lib/basketball/drill-start";
import type { DrillOutcome } from "@/lib/drill-attach";

/** What is counted and what is not, in the words used everywhere else (WHAT_IS_MEASURED in drill-shooting.ts). */
function Honesty({ camera }: { camera: boolean }) {
  return (
    <p className="mt-3 text-[11px] leading-relaxed text-foreground-mute">
      {camera ? "The camera counts shots and calls make or miss; you check them before they are saved." : "Your taps count the shots."} The kind of shot is what this drill asks for.
      Footwork, speed, defenders and decisions are not measured.
    </p>
  );
}

/** The first thing a drill-linked tracking page shows: which drill, the lesson for it, and one button. Nothing else to choose. */
export function DrillStartScreen({ drill, cameraOn, onStart, onSkip, backHref }: { drill: DrillStart; cameraOn: boolean; onStart: () => void; onSkip: () => void; backHref: string }) {
  const c = drill.context;
  const goal = c.goal ? describeGoal(c.goal) : null;
  return (
    <section className="panel-lit rounded-3xl border border-line bg-surface p-6" aria-label="Track this drill">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
        {drill.planLabel ?? drill.workoutName ?? "Your workout"} · tracking a drill
      </p>
      <h2 className="font-display mt-3 text-3xl uppercase leading-none tracking-wide text-foreground">{c.drillName}</h2>
      {c.variant && <p className="mt-1 text-sm font-semibold text-foreground-dim">{c.variant}</p>}
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-foreground-mute">
        {drill.categoryLabel}
        {goal ? ` · ${goal}` : " · you end the set"}
      </p>

      {drill.lesson && (
        <div className="mt-4 rounded-xl border border-[var(--data-cyan)]/30 bg-[var(--data-cyan)]/5 px-3.5 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--data-cyan)]">
            {drill.lesson.basis === "linked" ? "Lesson for this drill" : "Related lesson"}
          </p>
          <p className="mt-1 text-sm font-bold leading-snug text-foreground">{drill.lesson.title}</p>
          {drill.lesson.watchFor[0] && <p className="mt-1.5 text-xs leading-relaxed text-foreground-dim">{drill.lesson.watchFor[0]}</p>}
          {drill.lesson.url && (
            <a href={drill.lesson.url} target="_blank" rel="noopener noreferrer" className="-my-3 mt-2 inline-flex items-center py-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--data-cyan)]">
              Watch the lesson ↗
            </a>
          )}
        </div>
      )}

      <Button size="lg" block onClick={onStart} className="mt-5">
        {cameraOn ? "Start the camera" : "Start counting"}
      </Button>
      <p className="mt-2 text-center text-[11px] text-foreground-mute">
        {cameraOn ? "Prop the phone up so it can see the hoop. You can tap make or miss any time the camera misses one." : "You tap make or miss. The camera is turned off in this app."}
      </p>
      <Honesty camera={cameraOn} />

      <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold">
        <Link href={backHref} className="-my-3 py-3 text-foreground-dim underline-offset-2 hover:underline">
          Back to your workout
        </Link>
        <button type="button" onClick={onSkip} className="-my-3 py-3 text-foreground-dim underline-offset-2 hover:underline">
          Shoot without a drill
        </button>
      </div>
    </section>
  );
}

/** A set for a different drill is already open on this phone: never silently mixed with this one. */
export function DrillMismatch({ openLabel, drillName, onResume, onReplace }: { openLabel: string; drillName: string; onResume: () => void; onReplace: () => void }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-6" aria-label="A set is already open">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">A set is already open</p>
      <h2 className="font-display mt-3 text-2xl uppercase leading-none tracking-wide text-foreground">{openLabel || "A shooting set"}</h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-dim">
        You started tracking {drillName}, but a different set is still open on this phone. Finish it first, or throw it away and track {drillName}.
      </p>
      <Button size="lg" block onClick={onResume} className="mt-5">
        Resume the set in progress
      </Button>
      <Button size="lg" block variant="secondary" onClick={onReplace} className="mt-2.5">
        Discard it and track {drillName}
      </Button>
    </section>
  );
}

/** On the "Session saved" screen of a drill-linked set: where the result went, in plain words, and the way back. */
export function DrillResultNote({ outcome }: { outcome: DrillOutcome | null }) {
  const m = outcome?.metrics ? parseTracked(outcome.metrics) : null;
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-4" aria-live="polite">
      {outcome?.phase === "saved" && m ? (
        <>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">Added to your workout</p>
          <p className="mt-1 text-sm font-bold text-foreground">
            {m.makes} of {m.attempts} made
          </p>
          <p className="mt-0.5 text-xs text-foreground-dim">{describeHow(m.tracking)}</p>
          <p className="mt-1 text-[11px] text-foreground-mute">If the count is off, you can fix it on the workout screen.</p>
        </>
      ) : outcome?.phase === "waiting" ? (
        <>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">Shots saved</p>
          <p className="mt-1 text-xs text-foreground-dim">{outcome.message ?? "The drill result will be added to your workout as soon as this phone is online. Open the app again then."}</p>
        </>
      ) : outcome?.phase === "failed" ? (
        <>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">Shots saved, drill not updated</p>
          <p className="mt-1 text-xs text-foreground-dim">{outcome.message ?? "The shots are in your shooting history, but they could not be added to the workout."}</p>
        </>
      ) : (
        <p className="text-xs text-foreground-dim">Adding the result to your workout…</p>
      )}
    </div>
  );
}
