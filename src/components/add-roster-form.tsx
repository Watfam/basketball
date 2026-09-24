"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRosterPlayer } from "@/app/actions";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";
import { haptic } from "@/lib/haptics";

type OwnPlayer = { id: string; display_name: string };

/**
 * Adding to the roster. Most kids on a real team have no Hardwood Lab
 * account, so a bare name is the primary path — picking from "your own
 * players" only ever surfaces kids in a household the coach owns (RLS
 * scopes hoops.players that way), which in practice means their own
 * kid(s), not the rest of the team.
 */
export function AddRosterForm({
  teamId,
  ownPlayers,
  alreadyLinkedIds,
}: {
  teamId: string;
  ownPlayers: OwnPlayer[];
  alreadyLinkedIds: Set<string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [jersey, setJersey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const availableOwnPlayers = ownPlayers.filter((p) => !alreadyLinkedIds.has(p.id));

  function submit() {
    if (!playerId && !name.trim()) {
      setError("Pick one of your players, or enter a name.");
      return;
    }
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await addRosterPlayer(teamId, {
        playerId: playerId || undefined,
        rosterName: playerId ? undefined : name,
        rosterPosition: playerId ? undefined : position,
        jerseyNumber: jersey,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setPlayerId("");
      setName("");
      setPosition("");
      setJersey("");
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
        + Add to roster
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4">
      {availableOwnPlayers.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
            Your players
          </p>
          <div className="flex flex-wrap gap-1.5">
            {availableOwnPlayers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  haptic("tap");
                  setPlayerId((prev) => (prev === p.id ? "" : p.id));
                  setName("");
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  playerId === p.id
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-[var(--raised)] text-foreground-dim"
                }`}
              >
                {p.display_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!playerId && (
        <>
          <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
            Or a name — no account needed
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player name"
            className="w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
          />
        </>
      )}

      <div className="mt-2.5 flex gap-2">
        <input
          value={jersey}
          onChange={(e) => setJersey(e.target.value)}
          placeholder="#"
          className="w-16 rounded-lg border border-line bg-[var(--raised)] px-2 py-2 text-center text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />
        {!playerId && (
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-[var(--raised)] px-2 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          >
            <option value="">Position (optional)</option>
            {PRIMARY_POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="flex-1 rounded-lg border border-accent py-2 text-[11px] font-extrabold uppercase tracking-wide text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add to roster"}
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
