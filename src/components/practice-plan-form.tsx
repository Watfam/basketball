"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePracticePlan, deletePracticePlan } from "@/app/actions";
import { TEAM_FOCUS_AREAS } from "@/lib/basketball/taxonomy";
import {
  totalMinutes,
  emptyBlock,
  cleanBlocks,
  parsePastedList,
  matchDrillName,
  type PracticeBlock,
} from "@/lib/basketball/practice";
import { haptic } from "@/lib/haptics";

type ExistingPlan = {
  id: string;
  title: string;
  practice_date: string | null;
  focus_areas: string[] | null;
  blocks: PracticeBlock[] | null;
};

type DrillOption = { id: string; name: string };

/**
 * The practice builder, rebuilt around how Matt actually writes these —
 * a flat list typed fast, one drill per line, blank lines for grouping,
 * nothing else. The first version asked for a label, a minute count and
 * notes on every row; his real practice notes have none of that, so the
 * form was slower than the notes app it was replacing.
 *
 * Entry is now a single-line-per-row list: type, Enter, type, Enter —
 * the same rhythm as any checklist app. Minutes and notes still exist
 * but stay collapsed until tapped open, and a plan can be built entirely
 * without ever touching them.
 */
export function PracticePlanForm({
  teamId,
  existing,
  availableDrills = [],
  quickNames = [],
}: {
  teamId: string;
  existing?: ExistingPlan;
  availableDrills?: DrillOption[];
  // This coach's own most-used drill names, ranked by frequency across
  // past plans — see frequentDrillNames. Empty on the very first plan;
  // grows on its own after that.
  quickNames?: string[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing?.practice_date ?? "");
  const [focusAreas, setFocusAreas] = useState<string[]>(existing?.focus_areas ?? []);
  const [blocks, setBlocks] = useState<PracticeBlock[]>(
    existing?.blocks && existing.blocks.length > 0 ? existing.blocks : [emptyBlock()]
  );
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();

  const rowRefs = useRef<(HTMLInputElement | null)[]>([]);

  function focusRow(index: number) {
    requestAnimationFrame(() => rowRefs.current[index]?.focus());
  }

  function updateBlock(index: number, patch: Partial<PracticeBlock>) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  /** Enter moves to (or creates) the next row — the whole point of this rebuild. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      haptic("tap");
      if (index === blocks.length - 1) {
        setBlocks((prev) => [...prev, emptyBlock()]);
        focusRow(index + 1);
      } else {
        focusRow(index + 1);
      }
      return;
    }
    // Backspace on an empty row deletes it and drops back to the previous
    // one — the same feel as a notes app or checklist, not a form.
    if (e.key === "Backspace" && blocks[index].label === "" && blocks.length > 1) {
      e.preventDefault();
      haptic("tap");
      setBlocks((prev) => prev.filter((_, i) => i !== index));
      focusRow(Math.max(0, index - 1));
    }
  }

  /** Fills the current empty row (or adds a new one) and moves on — same
      rhythm as typing it, minus the typing. */
  function insertQuickName(name: string) {
    haptic("tap");
    setBlocks((prev) => {
      const lastIndex = prev.length - 1;
      if (prev[lastIndex]?.label === "" && !prev[lastIndex].isSection) {
        const next = [...prev];
        next[lastIndex] = { ...next[lastIndex], label: name };
        return [...next, emptyBlock()];
      }
      return [...prev, { label: name }, emptyBlock()];
    });
    focusRow(blocks.length);
  }

  function addSection() {
    haptic("tap");
    setBlocks((prev) => [...prev, { label: "", isSection: true }]);
  }

  function removeBlock(index: number) {
    haptic("tap");
    setBlocks((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : [emptyBlock()]));
    setExpandedRow(null);
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

  function importPaste() {
    const parsed = parsePastedList(pasteText);
    if (parsed.length === 0) return;
    haptic("success");
    setBlocks(parsed);
    setPasteText("");
    setPasteOpen(false);
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
          placeholder="Tuesday — Run and Jump install"
          className="font-display mt-2 w-full border-b border-line bg-transparent pb-2 text-2xl uppercase text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />
        <div className="mt-4 flex items-center justify-between gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          />
          {minutes > 0 && (
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
              {minutes} min total
            </span>
          )}
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
            Drills
          </h2>
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setPasteOpen((v) => !v);
            }}
            className="text-[10px] font-extrabold uppercase tracking-wide text-accent transition-colors hover:text-accent-hover"
          >
            {pasteOpen ? "Cancel paste" : "Paste a list"}
          </button>
        </div>

        {quickNames.length > 0 && !pasteOpen && (
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
              Your most-used drills — tap to add
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => insertQuickName(name)}
                  className="rounded-full border border-line bg-[var(--raised)] px-3 py-1.5 text-xs font-bold text-foreground-dim transition-colors hover:border-accent hover:text-accent"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {pasteOpen && (
          <div className="mb-3 rounded-2xl border border-accent/40 bg-accent/5 p-3.5">
            <p className="mb-2 text-xs leading-relaxed text-foreground-dim">
              Paste it exactly how you&rsquo;d write it in Notes — one drill per line, a blank
              line between groups. This replaces the list below.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder={"Celtic drill\nOlympic shooting\n\nShell Drill\n4UP"}
              autoFocus
              className="w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={importPaste}
              disabled={!pasteText.trim()}
              className="mt-2 w-full rounded-lg bg-accent py-2 text-[11px] font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              Use this list
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-line bg-surface p-2">
          {(() => {
            // A running count of drill rows only — numbering straight
            // through the array would count dividers too, and skipping
            // 5 and 9 in a numbered list reads as "where did those go,"
            // not as "that's a section break."
            let drillNumber = 0;
            return blocks.map((block, i) => {
            const rowNumber = block.isSection ? null : ++drillNumber;
            if (block.isSection) {
              return (
                <div key={i} className="group flex items-center gap-2 px-2 py-2.5">
                  <div className="h-px flex-1 bg-line" />
                  <button
                    type="button"
                    onClick={() => removeBlock(i)}
                    className="text-[9px] font-extrabold uppercase tracking-wide text-foreground-mute opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Remove
                  </button>
                </div>
              );
            }

            const suggestion =
              !block.drillId && block.label.length >= 3
                ? matchDrillName(block.label, availableDrills)
                : null;
            const expanded = expandedRow === i;

            return (
              <div key={i} className={i > 0 ? "border-t border-line" : ""}>
                <div className="flex items-center gap-1.5 px-2 py-2">
                  <span className="w-5 shrink-0 text-center text-[10px] font-bold text-foreground-mute">
                    {rowNumber}
                  </span>
                  <input
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    value={block.label}
                    onChange={(e) => updateBlock(i, { label: e.target.value })}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    placeholder="Drill or activity name"
                    className="min-w-0 flex-1 bg-transparent py-1 text-sm font-semibold text-foreground placeholder:text-foreground-mute placeholder:font-normal focus:outline-none"
                  />
                  {block.minutes ? (
                    <span className="shrink-0 text-[10px] font-extrabold text-foreground-mute">
                      {block.minutes}m
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setExpandedRow(expanded ? null : i);
                    }}
                    className="shrink-0 rounded-md px-1.5 py-1 text-[13px] font-bold leading-none text-foreground-mute transition-colors hover:text-foreground"
                    aria-label="More options"
                  >
                    ···
                  </button>
                </div>

                {suggestion && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      updateBlock(i, { drillId: suggestion.id });
                    }}
                    className="ml-8 mb-1.5 block text-[10px] font-extrabold uppercase tracking-wide text-[var(--data-cyan)] transition-colors hover:opacity-80"
                  >
                    ↳ Link to &ldquo;{suggestion.name}&rdquo; in the drill library
                  </button>
                )}
                {block.drillId && (
                  <p className="ml-8 mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--data-cyan)]">
                    Linked to drill library
                  </p>
                )}

                {expanded && (
                  <div className="mb-2 ml-8 mr-2 space-y-2 rounded-lg border border-line bg-[var(--raised)] p-2.5">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
                        Minutes
                      </label>
                      <input
                        type="number"
                        value={block.minutes || ""}
                        onChange={(e) => updateBlock(i, { minutes: Number(e.target.value) || undefined })}
                        placeholder="—"
                        className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-center text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
                      />
                    </div>
                    <textarea
                      value={block.notes ?? ""}
                      onChange={(e) => updateBlock(i, { notes: e.target.value })}
                      rows={2}
                      placeholder="Notes (optional)"
                      className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
                    />
                    <div className="flex justify-between">
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
                )}
              </div>
            );
            });
          })()}
        </div>

        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setBlocks((prev) => [...prev, emptyBlock()]);
              focusRow(blocks.length);
            }}
            className="flex-1 rounded-xl border border-dashed border-line py-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:border-accent hover:text-accent"
          >
            + Add drill
          </button>
          <button
            type="button"
            onClick={addSection}
            className="rounded-xl border border-dashed border-line px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:border-accent hover:text-accent"
          >
            + Group
          </button>
        </div>
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
