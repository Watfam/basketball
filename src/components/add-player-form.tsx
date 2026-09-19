"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlayer } from "@/app/actions";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";
import { haptic } from "@/lib/haptics";

export function AddPlayerForm({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [primaryPosition, setPrimaryPosition] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("household_id", householdId);
    formData.set("display_name", displayName);
    formData.set("birth_year", birthYear);
    formData.set("primary_position", primaryPosition);
    startTransition(async () => {
      const result = await addPlayer(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      router.push(`/players/${result.playerId}/assessment`);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-line px-4 py-3 text-sm font-semibold text-foreground-dim transition-colors hover:border-accent hover:text-foreground"
      >
        + Add a player
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-line bg-surface p-4"
    >
      <input
        type="text"
        required
        placeholder="Player name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Birth year"
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value)}
          className="w-1/2 rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <select
          value={primaryPosition}
          onChange={(e) => setPrimaryPosition(e.target.value)}
          className="w-1/2 rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        >
          <option value="">Position (optional)</option>
          {PRIMARY_POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add player"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-foreground-dim hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
