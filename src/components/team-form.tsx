"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTeam, updateTeam } from "@/app/actions";
import { DEFENSIVE_SCHEMES, OFFENSIVE_SCHEMES, TEAM_FOCUS_AREAS } from "@/lib/basketball/taxonomy";
import { haptic } from "@/lib/haptics";

type ExistingTeam = {
  id: string;
  name: string;
  defensive_scheme: string | null;
  defensive_scheme_custom: string | null;
  offensive_scheme: string | null;
  offensive_scheme_custom: string | null;
  focus_areas: string[] | null;
};

/**
 * Team setup — shared between create and edit. Schemes are a fixed
 * taxonomy with a "custom" escape hatch (see lib/basketball/taxonomy.ts):
 * a coach running something not on the list still gets to name it rather
 * than being forced into the nearest wrong label.
 */
export function TeamForm({ existing }: { existing?: ExistingTeam }) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  const [defensiveScheme, setDefensiveScheme] = useState(existing?.defensive_scheme ?? "");
  const [defensiveCustom, setDefensiveCustom] = useState(existing?.defensive_scheme_custom ?? "");
  const [offensiveScheme, setOffensiveScheme] = useState(existing?.offensive_scheme ?? "");
  const [offensiveCustom, setOffensiveCustom] = useState(existing?.offensive_scheme_custom ?? "");
  const [focusAreas, setFocusAreas] = useState<string[]>(existing?.focus_areas ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleFocus(value: string) {
    haptic("tap");
    setFocusAreas((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function submit() {
    haptic("tap");
    setError(null);
    const formData = new FormData();
    formData.set("name", name);
    formData.set("defensive_scheme", defensiveScheme);
    formData.set("defensive_scheme_custom", defensiveCustom);
    formData.set("offensive_scheme", offensiveScheme);
    formData.set("offensive_scheme_custom", offensiveCustom);
    focusAreas.forEach((f) => formData.append("focus_areas", f));

    startTransition(async () => {
      const result = existing
        ? await updateTeam(existing.id, formData)
        : await createTeam(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      const newTeamId = existing?.id ?? ("teamId" in result ? result.teamId : undefined);
      router.push(`/teams/${newTeamId}`);
    });
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <section className="panel-lit rounded-3xl border border-line bg-surface p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">
          Team Name
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Thunder 8th Grade"
          className="font-display mt-2 w-full border-b border-line bg-transparent pb-2 text-2xl uppercase text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />
      </section>

      <SchemeSection
        title="Defensive Scheme"
        options={DEFENSIVE_SCHEMES}
        value={defensiveScheme}
        onChange={setDefensiveScheme}
        customValue={defensiveCustom}
        onCustomChange={setDefensiveCustom}
      />

      <SchemeSection
        title="Offensive Scheme"
        options={OFFENSIVE_SCHEMES}
        value={offensiveScheme}
        onChange={setOffensiveScheme}
        customValue={offensiveCustom}
        onCustomChange={setOffensiveCustom}
      />

      <section className="panel-lit rounded-3xl border border-line bg-surface p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">
          Season Focus
        </p>
        <p className="mt-1 text-xs text-foreground-dim">
          Pick as many as apply — this is what practice-plan suggestions build around.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {TEAM_FOCUS_AREAS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => toggleFocus(f.value)}
              className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold leading-tight transition-colors ${
                focusAreas.includes(f.value)
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-[var(--raised)] text-foreground-dim hover:border-accent/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !name.trim()}
        className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-[var(--glow)] transition-colors hover:bg-accent-hover active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
      >
        {pending ? "Saving…" : existing ? "Save changes" : "Create team"}
      </button>
    </div>
  );
}

function SchemeSection({
  title,
  options,
  value,
  onChange,
  customValue,
  onCustomChange,
}: {
  title: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  customValue: string;
  onCustomChange: (v: string) => void;
}) {
  return (
    <section className="panel-lit rounded-3xl border border-line bg-surface p-6">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">{title}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              haptic("tap");
              onChange(opt.value);
            }}
            className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold leading-tight transition-colors ${
              value === opt.value
                ? "border-accent bg-accent/10 text-accent"
                : "border-line bg-[var(--raised)] text-foreground-dim hover:border-accent/50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {value === "custom" && (
        <input
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="Name your scheme"
          className="mt-3 w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />
      )}
    </section>
  );
}
