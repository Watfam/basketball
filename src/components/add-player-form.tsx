"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlayer } from "@/app/actions";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { FormError, Input, Select } from "@/components/ui/field";

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
    <form onSubmit={handleSubmit} className={cx(cardClass, "space-y-3 p-4")}>
      <Input
        type="text"
        required
        placeholder="Player name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      {/* flex-1 on both: an even split, as w-1/2 was (Input/Select are w-full). */}
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="Birth year"
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value)}
          className="flex-1"
        />
        <Select value={primaryPosition} onChange={(e) => setPrimaryPosition(e.target.value)} className="flex-1">
          <option value="">Position (optional)</option>
          {PRIMARY_POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      {error && <FormError>{error}</FormError>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Adding…" : "Add player"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
