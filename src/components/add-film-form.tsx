"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addFilmResource } from "@/app/actions";
import { FILM_KINDS, SKILL_LABELS } from "@/lib/basketball/film";
import { haptic } from "@/lib/haptics";

const SKILLS = ["ball_handling", "shooting", "defense", "athleticism"];

/**
 * How real video links get into the library. The curated lessons ship
 * without URLs deliberately — nothing in this app invents links — so this
 * is the path from "I found a good video" to "it's in my kid's Film Room
 * and shows up next to the right drill."
 */
export function AddFilmForm({
  householdId,
  playerId,
}: {
  householdId: string;
  playerId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<string>("technique");
  const [skillTags, setSkillTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    haptic("tap");
    startTransition(async () => {
      const result = await addFilmResource(householdId, playerId, {
        title,
        url,
        kind,
        skillTags,
        notes,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setTitle("");
      setUrl("");
      setNotes("");
      setSkillTags([]);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-line py-3.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:border-accent hover:text-accent"
      >
        + Add film
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">
          Add film
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] font-bold uppercase tracking-wide text-foreground-dim transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Hip switch breakdown"
            className="w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
          />
        </Field>

        <Field label="Link">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            placeholder="https://youtube.com/watch?v=…"
            className="w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
          />
        </Field>

        <Field label="Type">
          <div className="grid grid-cols-2 gap-1.5">
            {FILM_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`rounded-lg border px-2 py-2 text-[10px] font-extrabold uppercase tracking-wide transition-colors ${
                  kind === k.value
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-[var(--raised)] text-foreground-dim"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Skills">
          <div className="flex flex-wrap gap-1.5">
            {SKILLS.map((skill) => {
              const on = skillTags.includes(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() =>
                    setSkillTags((prev) =>
                      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
                    )
                  }
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                    on
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line text-foreground-dim"
                  }`}
                >
                  {SKILL_LABELS[skill]}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Note (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Why this one is worth watching"
            className="w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
          />
        </Field>

        <button
          type="button"
          onClick={submit}
          disabled={pending || !title.trim() || !url.trim()}
          className="w-full rounded-xl bg-accent py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          {pending ? "Saving…" : "Add to Film Room"}
        </button>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
        {label}
      </p>
      {children}
    </div>
  );
}
