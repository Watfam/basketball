"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeRosterPlayer, updateRosterPlayer } from "@/app/actions";
import { rosterDisplayName, rosterPosition, isLinkedMember, type RosterMember } from "@/lib/basketball/team";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";
import { formatPercentage, type SessionTotals } from "@/lib/basketball/shooting";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/field";

const POSITION_LABELS: Record<string, string> = Object.fromEntries(
  PRIMARY_POSITIONS.map((p) => [p.value, p.label])
);

export function RosterRow({
  member,
  teamId,
  shooting,
}: {
  member: RosterMember;
  teamId: string;
  /** This season's shooting for a linked player — null when unlinked, or linked but no sessions yet. */
  shooting?: SessionTotals | null;
}) {
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

  const jerseyBadge = (
    <span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--data-dim)] text-base leading-none text-foreground">
      {member.jersey_number || "—"}
    </span>
  );
  const nameBlock = (
    <div className="min-w-0">
      <p className="truncate text-sm font-bold text-foreground">{name}</p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
        {currentPosition ? POSITION_LABELS[currentPosition] ?? currentPosition : "No position"}
        {!linked && " · No account"}
      </p>
    </div>
  );

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2.5">
      {linked && member.player_id ? (
        <Link
          href={`/players/${member.player_id}/shooting?from=coach`}
          className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 hover:bg-raised"
        >
          {jerseyBadge}
          <div className="min-w-0 flex-1">{nameBlock}</div>
          {shooting && (
            <div className="w-12 shrink-0 text-right">
              <p className="font-display text-base leading-none text-accent">{formatPercentage(shooting.pct)}</p>
              {shooting.attempts > 0 && (
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
                  {shooting.makes}/{shooting.attempts}
                </p>
              )}
            </div>
          )}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {jerseyBadge}
          {nameBlock}
        </div>
      )}
      <div className="-mr-1 flex shrink-0">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${name}`}
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground-mute hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 20h4L19 9l-4-4L4 16z" />
            <path d="M13.5 6.5l4 4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Remove ${name}`}
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground-mute hover:text-danger"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
