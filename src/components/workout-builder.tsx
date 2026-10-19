"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomWorkout, saveCustomWorkout, startWorkoutSession } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { Sheet, useSheetClose } from "@/components/ui/sheet";
import { WORKOUT_SKILLS } from "@/lib/basketball/train-library";
import { LENGTHS, MAX_ENTRIES, clampInt, defaultName, draftWorkout, entryMinutes, toEntry, totalMinutes, type BuilderDrill, type BuilderEntry } from "@/lib/basketball/workout-builder";
import type { SkillLevel } from "@/lib/basketball/assessment";
import { haptic } from "@/lib/haptics";

export type BuilderInitial = { id: string; name: string; skills: string[]; entries: BuilderEntry[] };

const LABELS = Object.fromEntries(WORKOUT_SKILLS.map((s) => [s.value, s.label]));
const target = (e: Pick<BuilderEntry, "sets" | "reps" | "seconds">) => (e.seconds ? `${e.sets ?? 1}×${e.seconds}s` : e.reps ? `${e.sets ?? 1}×${e.reps}` : "no target");
const closestLength = (m: number) => LENGTHS.reduce((best, l) => (Math.abs(l - m) < Math.abs(best - m) ? l : best), LENGTHS[1] as number);

type Open = { kind: "edit"; key: string } | { kind: "add" } | { kind: "swap"; key: string } | null;

/**
 * Build a workout: pick the time and the skills and it drafts a session that fits; then change anything (reps, order, swap, add, remove) and
 * save it, or save and start. Until you change a drill by hand the draft follows the time and skills; after that your edits are kept and
 * "New draft" starts over. Times are estimates.
 */
export function WorkoutBuilder({ playerId, level, drills, suggestedSkills, initial }: { playerId: string; level: SkillLevel; drills: BuilderDrill[]; suggestedSkills: string[]; initial: BuilderInitial | null }) {
  const router = useRouter();
  const byId = useMemo(() => new Map(drills.map((d) => [d.id, d])), [drills]);
  const startMinutes = initial ? closestLength(totalMinutes(initial.entries)) : 30;
  const startSkills = initial?.skills.length ? initial.skills : suggestedSkills;
  const [minutes, setMinutes] = useState<number>(startMinutes);
  const [skills, setSkills] = useState<string[]>(startSkills);
  const [shuffle, setShuffle] = useState(0);
  const [touched, setTouched] = useState(Boolean(initial));
  const [entries, setEntries] = useState<BuilderEntry[]>(() => initial?.entries ?? draftWorkout({ minutes: startMinutes, skills: startSkills, level, drills }));
  const [name, setName] = useState(initial?.name ?? defaultName(startMinutes, startSkills, LABELS));
  const [nameEdited, setNameEdited] = useState(Boolean(initial));
  const [open, setOpen] = useState<Open>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  // The bar sits just above the app's bottom bar, whatever height that is on this phone.
  const [navH, setNavH] = useState(68);
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Player"]');
    if (!nav) return;
    const read = () => setNavH(nav.offsetHeight);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  const total = totalMinutes(entries);
  const over = total - minutes;
  const redraft = (m: number, s: string[], sh: number) => setEntries(draftWorkout({ minutes: m, skills: s, level, drills, shuffle: sh }));
  const rename = (m: number, s: string[]) => { if (!nameEdited) setName(defaultName(m, s, LABELS)); };

  const pickMinutes = (m: number) => {
    haptic("tap");
    setMinutes(m);
    rename(m, skills);
    if (!touched) redraft(m, skills, shuffle);
  };
  const toggleSkill = (s: string) => {
    haptic("tap");
    const next = skills.includes(s) ? skills.filter((x) => x !== s) : [...skills, s];
    setSkills(next);
    rename(minutes, next);
    if (!touched) redraft(minutes, next, shuffle);
  };
  const newDraft = () => {
    haptic("tap");
    const sh = shuffle + 1;
    setShuffle(sh);
    setTouched(false);
    redraft(minutes, skills, sh);
  };
  const edit = (next: BuilderEntry[]) => { setTouched(true); setEntries(next); };
  const patch = (key: string, change: Partial<BuilderEntry>) => edit(entries.map((e) => (e.key === key ? { ...e, ...change } : e)));
  const move = (key: string, d: -1 | 1) => {
    const i = entries.findIndex((e) => e.key === key), j = i + d;
    if (i < 0 || j < 0 || j >= entries.length) return;
    haptic("tap");
    const copy = [...entries];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    edit(copy);
  };
  const remove = (key: string) => { haptic("tap"); edit(entries.filter((e) => e.key !== key)); };
  const add = (d: BuilderDrill) => { if (entries.length >= MAX_ENTRIES) return; haptic("tap"); edit([...entries, toEntry(d)]); };
  const swap = (key: string, d: BuilderDrill) => { const old = entries.find((e) => e.key === key); edit(entries.map((e) => (e.key === key ? { ...toEntry(d), key, entryId: old?.entryId } : e))); };

  const opens = (o: Open) => (e: React.MouseEvent<HTMLElement>) => { haptic("tap"); setOpener(e.currentTarget); setOpen(o); };

  const save = (thenStart: boolean, temporary = false) => {
    setError(null);
    haptic("tap");
    startTransition(async () => {
      const res = await saveCustomWorkout({ id: initial?.id ?? null, temporary, name, skills, entries: entries.map((e) => ({ id: e.entryId ?? null, drillId: e.drillId, sets: e.sets, reps: e.reps, seconds: e.seconds, block: e.block })) });
      if (res.error || !res.workoutId) { setError(res.error ?? "The workout could not be saved."); return; }
      if (thenStart) {
        const s = await startWorkoutSession(playerId, res.workoutId);
        if (s?.error || !s?.sessionId) { setError(s?.error ?? "Saved, but it could not be started."); return; }
        router.replace(`/players/${playerId}/sessions/${s.sessionId}`);
        return;
      }
      router.replace(`/players/${playerId}/workouts?saved=${res.workoutId}`);
    });
  };

  const remove2 = () => {
    if (!initial) return;
    startTransition(async () => {
      const res = await deleteCustomWorkout(initial.id);
      if (res.error) { setError(res.error); return; }
      router.replace(`/players/${playerId}/workouts`);
    });
  };

  const editing = open?.kind === "edit" ? entries.find((e) => e.key === open.key) ?? null : null;
  const list = (swapKey: string | null) => (
    <DrillList drills={drills} skills={skills} used={entries} onPick={(d) => (swapKey ? swap(swapKey, d) : add(d))} swapping={swapKey !== null} full={!swapKey && entries.length >= MAX_ENTRIES} total={total} minutes={minutes} />
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 pb-48 sm:py-8">
      <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">{initial ? "Edit workout" : "Build a workout"}</h1>

      <section aria-label="How long">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-foreground-mute">How long</p>
        <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Minutes">
          {LENGTHS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => pickMinutes(m)}
              className={`min-h-12 rounded-xl border text-base font-extrabold ${minutes === m ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground"}`}>{m}<span className="ml-0.5 text-[11px] font-bold">min</span></button>
          ))}
        </div>
      </section>

      <section aria-label="What to work on">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-foreground-mute">What to work on</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {WORKOUT_SKILLS.map((s) => (
            <button key={s.value} type="button" aria-pressed={skills.includes(s.value)} onClick={() => toggleSkill(s.value)}
              className={`min-h-11 rounded-full border px-4 text-sm font-bold ${skills.includes(s.value) ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground-dim"}`}>{skills.includes(s.value) ? "✓ " : ""}{s.label}</button>
          ))}
        </div>
        {skills.length === 0 && <p className="mt-2 text-xs text-foreground-dim">Pick at least one skill and a draft appears. Or add drills yourself below.</p>}
      </section>

      <section aria-label="Your session">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">Your session</h2>
          <span className={`text-xs font-bold tabular-nums ${over > 3 ? "text-danger" : "text-foreground-dim"}`}><b className="text-foreground">{total}</b> of {minutes} min{over > 3 ? ` · ${over} over` : ""}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={minutes} aria-valuenow={Math.min(total, minutes)} aria-label="Minutes used">
          <div className={`h-full rounded-full ${over > 3 ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.min(100, (total / minutes) * 100)}%` }} />
        </div>

        {entries.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-6 text-center">
            <p className="text-sm text-foreground-dim">{skills.length ? "No drills for those skills yet." : "No drills yet."} Add one, or pick skills for a draft.</p>
          </div>
        ) : (
          <ol className="mt-3 space-y-2">
            {entries.map((e, i) => {
              const d = byId.get(e.drillId);
              return (
                <li key={e.key} className="flex items-stretch gap-1 rounded-2xl border border-line bg-surface">
                  <button type="button" onClick={opens({ kind: "edit", key: e.key })} aria-haspopup="dialog" className="min-h-14 min-w-0 flex-1 px-4 py-2.5 text-left">
                    <span className="block truncate text-sm font-bold text-foreground">{d?.name ?? "A drill that is no longer in the library"}</span>
                    <span className="block truncate text-xs text-foreground-dim">{(d?.skill_tags ?? []).map((t) => LABELS[t]).join(", ") || "Any skill"} · {target(e)} · about {entryMinutes(e)} min</span>
                  </button>
                  <div className="flex shrink-0 items-center pr-1">
                    <button type="button" onClick={() => move(e.key, -1)} disabled={i === 0} aria-label={`Move ${d?.name ?? "drill"} up`} className="grid h-11 w-11 place-items-center text-foreground-dim disabled:opacity-25">▲</button>
                    <button type="button" onClick={() => move(e.key, 1)} disabled={i === entries.length - 1} aria-label={`Move ${d?.name ?? "drill"} down`} className="grid h-11 w-11 place-items-center text-foreground-dim disabled:opacity-25">▼</button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="md" onClick={opens({ kind: "add" })} aria-haspopup="dialog">＋ Add a drill</Button>
          <Button variant="secondary" size="md" onClick={newDraft} disabled={skills.length === 0}>{touched ? "New draft" : "Shuffle"}</Button>
        </div>
        <p className="mt-2 text-[11px] text-foreground-mute">Tap a drill to change its sets and reps, swap it or remove it. Times are estimates.</p>
      </section>

      <section aria-label="Name">
        <label className="block text-[11px] font-extrabold uppercase tracking-[0.16em] text-foreground-mute" htmlFor="workout-name">Name</label>
        <Input id="workout-name" className="mt-2" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setNameEdited(true); }} />
      </section>

      {initial && (
        <section aria-label="Delete">
          {confirmDelete ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
              <p className="text-xs text-foreground">Delete <strong>{initial.name}</strong>? Sessions you already did with it stay in your history.</p>
              <div className="mt-2 flex gap-2">
                <Button variant="danger" size="sm" disabled={pending} onClick={remove2}>{pending ? "Deleting…" : "Delete workout"}</Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 text-xs font-extrabold uppercase tracking-wide text-foreground-dim hover:text-danger">Delete this workout</button>
          )}
        </section>
      )}

      <div className="fixed inset-x-0 z-20 border-t border-line bg-background/95 px-4 py-3 backdrop-blur" style={{ bottom: navH }}>
        <div className="mx-auto w-full max-w-lg space-y-2">
          {error && <FormError>{error}</FormError>}
          {!initial && <p className="text-center text-[11px] text-foreground-mute">Start now runs it without saving. You can save it afterwards if it was worth it.</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" disabled={pending || entries.length === 0 || !name.trim()} onClick={() => save(false)}>{pending ? "Saving…" : initial ? "Save changes" : "Save"}</Button>
            <Button size="lg" disabled={pending || entries.length === 0 || !name.trim()} onClick={() => (initial ? save(true) : save(true, true))}>{initial ? "Save and start" : "Start now"}</Button>
          </div>
        </div>
      </div>

      {open?.kind === "add" && (
        <Sheet title="Add a drill" onClose={() => setOpen(null)} opener={opener}>{list(null)}</Sheet>
      )}
      {open?.kind === "swap" && (
        <Sheet title="Swap this drill" onClose={() => setOpen(null)} opener={opener} done={false}>
          <SwapList render={(close) => <DrillList drills={drills} skills={skills} used={entries} swapping onPick={(d) => { swap(open.key, d); close(); }} full={false} total={total} minutes={minutes} />} />
        </Sheet>
      )}
      {open?.kind === "edit" && editing && (
        <Sheet title={byId.get(editing.drillId)?.name ?? "Drill"} onClose={() => setOpen(null)} opener={opener}>
          <EditDrill
            entry={editing}
            drill={byId.get(editing.drillId) ?? null}
            onChange={(c) => patch(editing.key, c)}
            onSwap={(e) => { setOpen({ kind: "swap", key: editing.key }); setOpener(e.currentTarget); }}
            onRemove={() => { remove(editing.key); setOpen(null); }}
          />
        </Sheet>
      )}
    </main>
  );
}

function SwapList({ render }: { render: (close: () => void) => React.ReactNode }) {
  const close = useSheetClose();
  return <>{render(close)}</>;
}

function Stepper({ label, value, onChange, min, max, step = 1, suffix = "" }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2">
      <span className="text-sm font-bold text-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => { haptic("tap"); onChange(clampInt(value - step, min, max)); }} disabled={value <= min} className="grid h-11 w-11 place-items-center rounded-lg bg-raised text-xl font-extrabold disabled:opacity-30">−</button>
        <span className="w-14 text-center text-base font-extrabold tabular-nums">{value}{suffix}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => { haptic("tap"); onChange(clampInt(value + step, min, max)); }} disabled={value >= max} className="grid h-11 w-11 place-items-center rounded-lg bg-raised text-xl font-extrabold disabled:opacity-30">+</button>
      </span>
    </div>
  );
}

function EditDrill({ entry, drill, onChange, onSwap, onRemove }: { entry: BuilderEntry; drill: BuilderDrill | null; onChange: (c: Partial<BuilderEntry>) => void; onSwap: (e: React.MouseEvent<HTMLElement>) => void; onRemove: () => void }) {
  const timed = Boolean(entry.seconds);
  return (
    <div className="space-y-3">
      {drill?.description && <p className="text-xs leading-relaxed text-foreground-dim">{drill.description}</p>}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Counted by">
        <button type="button" role="radio" aria-checked={!timed} onClick={() => onChange({ seconds: null, reps: entry.reps ?? 10 })} className={`min-h-11 rounded-xl border text-sm font-bold ${!timed ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground-dim"}`}>By reps</button>
        <button type="button" role="radio" aria-checked={timed} onClick={() => onChange({ reps: null, seconds: entry.seconds ?? 30 })} className={`min-h-11 rounded-xl border text-sm font-bold ${timed ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground-dim"}`}>By time</button>
      </div>
      <Stepper label="Sets" value={entry.sets ?? 1} min={1} max={10} onChange={(n) => onChange({ sets: n })} />
      {timed ? <Stepper label="Seconds" value={entry.seconds ?? 30} min={5} max={600} step={5} onChange={(n) => onChange({ seconds: n })} /> : <Stepper label="Reps" value={entry.reps ?? 10} min={1} max={100} step={entry.reps && entry.reps >= 20 ? 5 : 1} onChange={(n) => onChange({ reps: n })} />}
      <p className="text-xs text-foreground-dim">{target(entry)} · about {entryMinutes(entry)} min</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="md" onClick={onSwap}>Swap drill</Button>
        <Button variant="danger" size="md" onClick={onRemove}>Remove</Button>
      </div>
    </div>
  );
}

function DrillList({ drills, skills, used, onPick, swapping, full, total, minutes }: { drills: BuilderDrill[]; skills: string[]; used: BuilderEntry[]; onPick: (d: BuilderDrill) => void; swapping: boolean; full: boolean; total: number; minutes: number }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(skills.length === 0);
  const count = (id: string) => used.filter((e) => e.drillId === id).length;
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return drills.filter((d) => (all || d.skill_tags.some((s) => skills.includes(s))) && w.every((x) => d.name.toLowerCase().includes(x)));
  }, [drills, q, all, skills]);
  return (
    <div className="space-y-2.5">
      {!swapping && <p className="text-xs text-foreground-dim"><b className="text-foreground">{total}</b> of {minutes} min{full ? " · the most drills a workout holds" : ""}</p>}
      <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drills" aria-label="Search drills" />
      {skills.length > 0 && (
        <button type="button" aria-pressed={all} onClick={() => setAll((a) => !a)} className={`min-h-11 rounded-full border px-4 text-xs font-bold ${all ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground-dim"}`}>{all ? "✓ Every skill" : "Only your skills · show every skill"}</button>
      )}
      <p className="text-xs text-foreground-mute">{shown.length} {shown.length === 1 ? "drill" : "drills"}</p>
      <ul className="space-y-1.5">
        {shown.map((d) => (
          <li key={d.id}>
            <button type="button" disabled={full} onClick={() => onPick(d)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left disabled:opacity-45">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-foreground">{d.name}</span>
                <span className="block truncate text-xs text-foreground-dim">{d.skill_tags.map((t) => LABELS[t]).join(", ") || "Any skill"} · {target(d)}{d.difficulty ? ` · ${d.difficulty}` : ""}</span>
              </span>
              <span className="shrink-0 text-xs font-extrabold text-accent-hover">{swapping ? "Use" : count(d.id) > 0 ? `✓ ${count(d.id)} · add` : "＋ Add"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
