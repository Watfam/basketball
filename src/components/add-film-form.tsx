"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addFilmResource } from "@/app/actions";
import { FILM_KINDS, SKILL_LABELS } from "@/lib/basketball/film";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { FormError, Input, TextArea } from "@/components/ui/field";

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
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">
          Add film
        </p>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="-mr-3">
          Cancel
        </Button>
      </div>

      <div className="mt-3 space-y-3">
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Hip switch breakdown"
          />
        </Field>

        <Field label="Link">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            placeholder="https://youtube.com/watch?v=…"
          />
        </Field>

        <Field label="Type">
          <div className="grid grid-cols-2 gap-1.5">
            {FILM_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`rounded-lg border px-2 py-2 text-[11px] font-extrabold uppercase tracking-wide transition-colors ${
                  kind === k.value
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-raised text-foreground-dim"
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
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
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
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Why this one is worth watching"
          />
        </Field>

        <Button size="lg" block onClick={submit} disabled={pending || !title.trim() || !url.trim()}>
          {pending ? "Saving…" : "Add to Film Room"}
        </Button>

        {error && <FormError>{error}</FormError>}
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow className="mb-1.5">{label}</Eyebrow>
      {children}
    </div>
  );
}
