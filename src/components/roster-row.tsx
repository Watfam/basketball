"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeRosterPlayer, updateRosterPlayer } from "@/app/actions";
import { rosterDisplayName, rosterPosition, isLinkedMember, type RosterMember } from "@/lib/basketball/team";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/field";

const POSITION_LABELS: Record<string, string> = Object.fromEntries(
  PRIMARY_POSITIONS.map((p) => [p.value, p.label])
);

export function RosterRow({ member, teamId }: { member: RosterMember; teamId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [jersey, setJersey] = useState(member.jersey_number ?? "");
  const [position, setPosition] = useState(rosterPosition(member) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const linked = isLinkedMember(member);
  const name = rosterDisplayName(member);
  const currentPosition = rosterPosition(member);

  function save() {
    haptic("tap");
    startTransition(async () => {
      const result = await updateRosterPlayer(member.id, teamId, {
        jerseyNumber: jersey,
        // A linked player's position comes from their profile, not the
        // roster row — only editable here for a bare-name entry.
        rosterPosition: linked ? undefined : position,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    haptic("tap");
    startTransition(async () => {
      const result = await removeRosterPlayer(member.id, teamId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3">
        <p className="text-sm text-foreground">
          Remove <strong>{name}</strong> from the roster?
        </p>
        <div className="flex shrink-0 gap-1">
          <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
            Remove
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-accent/40 bg-accent/5 p-3.5">
        <p className="text-sm font-bold text-foreground">{name}</p>
        <div className="mt-2 flex gap-2">
          {/* The wrapper sets the width: Input is full-width by default. */}
          <div className="w-16 shrink-0">
            <Input value={jersey} onChange={(e) => setJersey(e.target.value)} placeholder="#" className="text-center" />
          </div>
          {!linked && (
            <Select value={position} onChange={(e) => setPosition(e.target.value)} className="flex-1">
              <option value="">No position set</option>
              {PRIMARY_POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          )}
        </div>
        {error && <FormError className="mt-1.5">{error}</FormError>}
        <div className="mt-2.5 flex gap-2">
          <Button variant="secondary" size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--data-dim)] text-base leading-none text-foreground">
          {member.jersey_number || "—"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{name}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
            {currentPosition ? POSITION_LABELS[currentPosition] ?? currentPosition : "No position"}
            {!linked && " · No account"}
          </p>
        </div>
      </div>
      <div className="-mr-2 flex shrink-0">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          Remove
        </Button>
      </div>
    </div>
  );
}
