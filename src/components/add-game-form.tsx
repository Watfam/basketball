"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGame } from "@/app/actions";
import { haptic } from "@/lib/haptics";

/**
 * For filling in a reschedule or a game the imported schedule missed —
 * same collapsed-until-tapped pattern as adding to the roster, since
 * most visits to this page are just checking the schedule, not editing it.
 */
export function AddGameForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!opponent.trim() || !date) {
      setError("Opponent and date are required.");
      return;
    }
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await addGame(teamId, { opponent, gameDate: date, gameTime: time, location });
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      setOpponent("");
      setDate("");
      setTime("");
      setLocation("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-line py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:border-accent hover:text-accent"
      >
        + Add game
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4">
      <input
        value={opponent}
        onChange={(e) => setOpponent(e.target.value)}
        placeholder="Opponent"
        className="w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
      />
      <div className="mt-2.5 flex gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
        />
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="5:00pm"
          className="w-24 rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />
      </div>
      <div className="mt-2.5 flex gap-1.5">
        {(["home", "away", "neutral"] as const).map((loc) => (
          <button
            key={loc}
            type="button"
            onClick={() => {
              haptic("tap");
              setLocation((prev) => (prev === loc ? "" : loc));
            }}
            className={`flex-1 rounded-full border px-3 py-1.5 text-xs font-bold capitalize transition-colors ${
              location === loc
                ? "border-accent bg-accent text-white"
                : "border-line bg-[var(--raised)] text-foreground-dim"
            }`}
          >
            {loc}
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="flex-1 rounded-lg border border-accent py-2 text-[11px] font-extrabold uppercase tracking-wide text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add game"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] font-bold uppercase tracking-wide text-foreground-dim"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
