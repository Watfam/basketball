"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteShotSession, restoreShotSession } from "@/app/actions";
import { haptic } from "@/lib/haptics";

export type ShotSessionListItem = {
  id: string;
  label: string;
  date: string;
  /** e.g. the goal the set was shot to. */
  detail?: string | null;
  score: string;
  pct: string;
};

/** How long Undo stays on screen after a delete. */
const UNDO_MS = 6000;

/**
 * Recent sessions, with a Manage mode for deleting the ones a player
 * doesn't want counted. A delete leaves every total at once (the row is
 * marked, not removed) and Undo puts it back for a few seconds after.
 */
export function ShotSessionList({
  playerId,
  sessions,
  justDeleted,
}: {
  playerId: string;
  sessions: ShotSessionListItem[];
  /** A session deleted from its own page, to offer Undo for here. */
  justDeleted?: string;
}) {
  const router = useRouter();
  const [managing, setManaging] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<string | null>(justDeleted ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (undo) timer.current = setTimeout(() => setUndo(null), UNDO_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [undo]);

  function remove(id: string, label: string) {
    if (!window.confirm(`Delete this ${label} session? It leaves your totals now.`)) return;
    haptic("tap");
    setError(null);
    setHidden((h) => new Set(h).add(id));
    startTransition(async () => {
      const result = await deleteShotSession(id, playerId);
      if (result.error) {
        setHidden((h) => {
          const next = new Set(h);
          next.delete(id);
          return next;
        });
        setError(result.error);
        return;
      }
      setUndo(id);
      // In the address too: if that was the last session, the page swaps
      // this list for its empty state, and the new one still offers Undo.
      router.replace(`/players/${playerId}/shooting?deleted=${id}`);
    });
  }

  function restore() {
    if (!undo) return;
    const id = undo;
    haptic("tap");
    setUndo(null);
    startTransition(async () => {
      const result = await restoreShotSession(id, playerId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setHidden((h) => {
        const next = new Set(h);
        next.delete(id);
        return next;
      });
      // Drop ?deleted= so a reload doesn't offer Undo again.
      router.replace(`/players/${playerId}/shooting`);
      router.refresh();
    });
  }

  const visible = sessions.filter((s) => !hidden.has(s.id));

  return (
    <div>
      {sessions.length > 0 && (
        <div className="mb-2.5 flex items-end justify-between">
          <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">Recent sessions</h2>
          {visible.length > 0 && (
            <button
              type="button"
              onClick={() => setManaging((m) => !m)}
              aria-pressed={managing}
              className={`text-[11px] font-extrabold uppercase tracking-wide transition-colors ${
                managing ? "text-accent" : "text-foreground-mute hover:text-foreground"
              }`}
            >
              {managing ? "Done" : "Manage"}
            </button>
          )}
        </div>
      )}

      {visible.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {visible.map((s, i) => {
            const row = (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{s.label}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                    {s.date}
                    {s.detail ? ` · ${s.detail}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-xl leading-none text-foreground">{s.score}</p>
                  <p className="text-[11px] font-bold text-accent">{s.pct}</p>
                </div>
              </>
            );
            const border = i > 0 ? "border-t border-line" : "";
            return managing ? (
              <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${border}`}>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">{row}</div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(s.id, s.label)}
                  className="shrink-0 rounded-lg border border-red-400/40 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-red-400 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ) : (
              <Link
                key={s.id}
                href={`/players/${playerId}/shooting/${s.id}`}
                className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--raised)] ${border}`}
              >
                {row}
              </Link>
            );
          })}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {undo && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-line bg-[var(--raised)] px-4 py-3 shadow-lg"
        >
          <p className="text-sm text-foreground">Session deleted</p>
          <button
            type="button"
            onClick={restore}
            className="text-sm font-extrabold uppercase tracking-wide text-accent"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
