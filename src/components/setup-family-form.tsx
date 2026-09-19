"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createHouseholdWithFirstPlayer } from "@/app/actions";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";
import { haptic } from "@/lib/haptics";

export function SetupFamilyForm() {
  const router = useRouter();
  const [householdName, setHouseholdName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [primaryPosition, setPrimaryPosition] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("household_name", householdName);
    formData.set("display_name", displayName);
    formData.set("birth_year", birthYear);
    formData.set("primary_position", primaryPosition);
    startTransition(async () => {
      const result = await createHouseholdWithFirstPlayer(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      router.push(`/players/${result.playerId}/assessment`);
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="court-glow mx-auto w-full max-w-md rounded-3xl border border-line bg-surface p-6 sm:p-8"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        Welcome to Hardwood Lab
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
        Set up your family
      </h2>
      <p className="mt-1 text-sm text-foreground-dim">
        One household, every player nested under it. Add the first player now —
        you can add more anytime.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-foreground-dim">
            Household name
          </label>
          <input
            type="text"
            required
            placeholder="e.g. The Watfords"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-line bg-elevated px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
          />
        </div>

        <div className="h-px bg-line" />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-dim">
            First player
          </p>

          <input
            type="text"
            required
            placeholder="Player name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-line bg-elevated px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
          />

          <input
            type="number"
            placeholder="Birth year (optional)"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            className="mt-3 w-full rounded-xl border border-line bg-elevated px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
          />

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-foreground-dim">
            Position (optional — the assessment will nail this down)
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PRIMARY_POSITIONS.map((p) => {
              const selected = primaryPosition === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    setPrimaryPosition(selected ? "" : p.value);
                  }}
                  className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
                    selected
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-elevated text-foreground-dim hover:border-accent/50 hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Setting up…" : "Create family & start assessment"}
        </button>
      </form>
    </motion.div>
  );
}
