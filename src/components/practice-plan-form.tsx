"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePracticePlan, deletePracticePlan } from "@/app/actions";
import { TEAM_FOCUS_AREAS } from "@/lib/basketball/taxonomy";
import { totalMinutes, emptyBlock, cleanBlocks, type PracticeBlock } from "@/lib/basketball/practice";
import { haptic } from "@/lib/haptics";

type ExistingPlan = {
  id: string;
  title: string;
  practice_date: string | null;
  focus_areas: string[] | null;
  blocks: PracticeBlock[] | null;
};

/**
 * The practice builder. Blocks are ordered manually with up/down rather
 * than drag-and-drop — a practice plan is a handful of blocks, not a long
 * list, and drag reordering on a phone is exactly the kind of interaction
 * that's fiddly for a small win.
 */
export function PracticePlanForm({
  teamId,
  existing,
}: {
  teamId: string;
  existing?: ExistingPlan;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing?.practice_date ?? "");
  const [focusAreas, setFocusAreas] = useState<string[]>(existing?.focus_areas ?? []);
  const [blocks, setBlocks] = useState<PracticeBlock[]>(
    existing?.blocks && existing.blocks.length > 0 ? existing.blocks : [emptyBlock()]
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();

  function updateBlock(index: number, patch: Partial<PracticeBlock>) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function addBlock() {
    haptic("tap");
    setBlocks((prev) => [...prev, emptyBlock()]);
  }

  function removeBlock(index: number) {
    haptic("tap");
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, dir: -1 | 1) {
    haptic("tap");
    setBlocks((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleFocus(value: string) {
    haptic("tap");
    setFocusAreas((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function save() {
    const finalBlocks = cleanBlocks(blocks);
    if (!title.trim()) {
      setError("Give the plan a title.");
      return;
    }
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await savePracticePlan(teamId, existing?.id ?? null, {
        title,
        practiceDate: date || null,
        focusAreas,
        blocks: finalBlocks,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      router.push(`/teams/${teamId}/practice`);
    });
  }

  function remove() {
    if (!existing) return;
    haptic("tap");
    startDeleteTransition(async () => {
      const result = await deletePracticePlan(existing.id, teamId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(`/teams/${teamId}/practice`);
    });
  }

  const minutes = totalMinutes(cleanBlocks(blocks));

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <section className="panel-lit rounded-3xl border border-line bg-surface p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">
          Practice Plan
        </p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tuesday — transition D"
          className="font-display mt-2 w-full border-b border-line bg-transparent pb-2 text-2xl uppercase text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />
        <div className="mt-4 flex items-center justify-between gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          />
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
            {minutes} min total
          </span>
        </div>
      </section>

      <section className="panel-lit rounded-3xl border border-line bg-surface p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">Focus</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TEAM_FOCUS_AREAS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => toggleFocus(f.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                focusAreas.includes(f.value)
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line text-foreground-dim"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">
            Blocks
          </h2>
          <span className="text-[10px] font-bold uppercase tracking-wide text-foreground-mute">
            In order
          </span>
        </div>

        <div className="space-y-2.5">
          {blocks.map((block, i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <input
                  value={block.label}
                  onChange={(e) => updateBlock(i, { label: e.target.value })}
                  placeholder={`Block ${i + 1} — e.g. Closeout & slides`}
                  className="flex-1 border-b border-line bg-transparent pb-1 text-sm font-bold text-foreground placeholder:text-foreground-mute placeholder:font-normal focus:border-accent focus:outline-none"
                />
                <input
                  type="number"
                  value={block.minutes || ""}
                  onChange={(e) => updateBlock(i, { minutes: Number(e.target.value) || 0 })}
                  placeholder="min"
                  className="w-16 rounded-lg border border-line bg-[var(--raised)] px-2 py-1.5 text-center text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
                />
              </div>
              <textarea
                value={block.notes}
                onChange={(e) => updateBlock(i, { notes: e.target.value })}
                rows={2}
                placeholder="Notes — what you actually want to see"
                className="mt-2.5 w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-xs text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => moveBlock(i, -1)}
                    disabled={i === 0}
                    className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute transition-colors hover:text-foreground disabled:opacity-30"
                  >
                    ↑ Up
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBlock(i, 1)}
                    disabled={i === blocks.length - 1}
                    className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute transition-colors hover:text-foreground disabled:opacity-30"
                  >
                    ↓ Down
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeBlock(i)}
                  className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute transition-colors hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addBlock}
          className="mt-2.5 w-full rounded-xl border border-dashed border-line py-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:border-accent hover:text-accent"
        >
          + Add block
        </button>
      </section>

      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-[var(--glow)] transition-colors hover:bg-accent-hover active:scale-[0.99] disabled:opacity-40"
      >
        {pending ? "Saving…" : existing ? "Save changes" : "Save plan"}
      </button>

      {existing && (
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="w-full text-center text-[11px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-red-400 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete this plan"}
        </button>
      )}
    </div>
  );
}
