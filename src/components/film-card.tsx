"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  logFilmView,
  removeFilmView,
  deleteFilmResource,
  setFilmLink,
} from "@/app/actions";
import {
  FILM_KIND_LABELS,
  SKILL_LABELS,
  durationLabel,
  isWatchableUrl,
  type FilmResource,
  type Trainer,
} from "@/lib/basketball/film";
import { haptic } from "@/lib/haptics";

export type FilmView = { film_resource_id: string; takeaway: string | null; watched_at: string };

/**
 * A film lesson. The card is a summary; the sheet is where the actual
 * studying happens — what to watch for before pressing play, and the
 * takeaway afterwards.
 *
 * Curated lessons ship without a video URL on purpose (nothing here
 * invents links), so the sheet has to be worth opening without one: the
 * watch-for list is the lesson, and the trainer's real channel is the
 * route to finding the footage.
 */
export function FilmCard({
  film,
  trainer,
  view,
  playerId,
  drillName,
  householdId = null,
  linkOverride = null,
  autoOpen = false,
}: {
  film: FilmResource;
  trainer: Trainer | null;
  view: FilmView | null;
  playerId: string;
  drillName: string | null;
  householdId?: string | null;
  // A link this household attached to a curated lesson. Curated rows are
  // shared and service-role only, so the URL lives alongside rather than
  // on the lesson itself.
  linkOverride?: string | null;
  // Opened straight from a deep link, so the player lands on the lesson
  // they were promised rather than on the library with a hunt ahead.
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [takeaway, setTakeaway] = useState(view?.takeaway ?? "");
  const [linkDraft, setLinkDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effectiveUrl = film.url ?? linkOverride;
  const watched = Boolean(view);
  const watchable = isWatchableUrl(effectiveUrl);

  // Somewhere to actually go and find footage, rather than being told to
  // come back when you have some.
  const searchUrl = trainer?.youtube_url
    ? trainer.youtube_url
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(
        film.pro_player_name ? `${film.pro_player_name} ${film.title}` : film.title
      )}`;

  function saveLink() {
    if (!householdId) return;
    haptic("tap");
    startTransition(async () => {
      const result = await setFilmLink(householdId, film.id, linkDraft, playerId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setLinkDraft("");
      router.refresh();
    });
  }
  const duration = durationLabel(film.duration_seconds);
  const isOwn = Boolean(film.added_by_household_id);

  function save() {
    haptic("success");
    startTransition(async () => {
      const result = await logFilmView(playerId, film.id, takeaway);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function unwatch() {
    haptic("tap");
    startTransition(async () => {
      const result = await removeFilmView(playerId, film.id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setTakeaway("");
      router.refresh();
    });
  }

  function remove() {
    haptic("tap");
    startTransition(async () => {
      const result = await deleteFilmResource(film.id, playerId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setOpen(true);
        }}
        className="w-full rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-[var(--line-strong)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {film.kind && (
                <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-accent">
                  {FILM_KIND_LABELS[film.kind] ?? film.kind}
                </span>
              )}
              {duration && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-foreground-mute">
                  {duration}
                </span>
              )}
            </div>

            <p className="font-display mt-1.5 text-xl uppercase leading-[1.02] tracking-tight text-foreground">
              {film.title}
            </p>

            {/* Pro film names the player being studied; trainer film names
                the coach teaching it. Never both. */}
            {film.pro_player_name ? (
              <p className="mt-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--data-cyan)]">
                {film.pro_player_name}
              </p>
            ) : (
              trainer && (
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
                  {trainer.name}
                </p>
              )
            )}
          </div>

          {watched && (
            <span className="shrink-0 rounded-md border border-[var(--data-positive)]/50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[var(--data-positive)]">
              Studied
            </span>
          )}
        </div>

        {drillName && (
          <p className="mt-2.5 truncate text-[11px] text-foreground-dim">
            Pairs with <span className="font-bold text-[var(--data-cyan)]">{drillName}</span>
          </p>
        )}

        {view?.takeaway && (
          <p className="mt-2 line-clamp-2 border-l-2 border-line pl-2.5 text-xs italic leading-relaxed text-foreground-dim">
            {view.takeaway}
          </p>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <div className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-surface p-6 sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {film.kind && (
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">
                    {FILM_KIND_LABELS[film.kind] ?? film.kind}
                  </p>
                )}
                <h3 className="font-display mt-1 text-2xl uppercase leading-[0.98] tracking-tight text-foreground">
                  {film.title}
                </h3>
                {film.pro_player_name ? (
                  <p className="mt-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--data-cyan)]">
                    {film.pro_player_name}
                  </p>
                ) : (
                  trainer && (
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
                      {trainer.name}
                    </p>
                  )
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-foreground-dim transition-colors hover:text-foreground"
              >
                Close
              </button>
            </div>

            {film.notes && (
              <p className="mt-3 text-sm leading-relaxed text-foreground-dim">{film.notes}</p>
            )}

            {(film.skill_tags ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(film.skill_tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent"
                  >
                    {SKILL_LABELS[tag] ?? tag}
                  </span>
                ))}
              </div>
            )}

            {(film.watch_for ?? []).length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <h4 className="mb-2.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-accent">
                  Watch For
                </h4>
                <ul className="space-y-2">
                  {(film.watch_for ?? []).map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 border-t border-line pt-4">
              {watchable ? (
                <a
                  href={effectiveUrl as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-xl bg-accent py-3 text-center text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-accent-hover"
                >
                  Watch film ↗
                </a>
              ) : (
                <div className="rounded-xl border border-dashed border-line px-4 py-3.5">
                  <p className="text-center text-xs leading-relaxed text-foreground-dim">
                    No link on this one yet — the lesson above stands on its own.
                  </p>

                  {searchUrl && (
                    <a
                      href={searchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 block text-center text-[11px] font-extrabold uppercase tracking-wide text-accent transition-colors hover:text-accent-hover"
                    >
                      {trainer?.youtube_url ? `${trainer.name}'s channel ↗` : "Search YouTube ↗"}
                    </a>
                  )}

                  {/* The link goes straight onto THIS lesson. It used to
                      point at "Add film", which created a separate entry
                      beside the lesson instead of completing it. */}
                  {householdId && (
                    <div className="mt-3 border-t border-line pt-3">
                      <input
                        value={linkDraft}
                        onChange={(e) => setLinkDraft(e.target.value)}
                        inputMode="url"
                        placeholder="Paste a YouTube link for this lesson"
                        className="w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={saveLink}
                        disabled={pending || !linkDraft.trim()}
                        className="mt-2 w-full rounded-lg border border-accent py-2 text-[11px] font-extrabold uppercase tracking-wide text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
                      >
                        {pending ? "Saving…" : "Attach link"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <label
                htmlFor={`takeaway-${film.id}`}
                className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.18em] text-accent"
              >
                What are you taking into your next session?
              </label>
              <textarea
                id={`takeaway-${film.id}`}
                value={takeaway}
                onChange={(e) => setTakeaway(e.target.value)}
                rows={3}
                placeholder="One thing. Be specific — “hold the follow-through until it hits the net”."
                className="w-full rounded-xl border border-line bg-[var(--raised)] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
              />

              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="mt-3 w-full rounded-xl border border-accent py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
              >
                {pending ? "Saving…" : watched ? "Update takeaway" : "Mark as studied"}
              </button>

              <div className="mt-2 flex justify-center gap-4">
                {watched && (
                  <button
                    type="button"
                    onClick={unwatch}
                    disabled={pending}
                    className="text-[10px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-foreground-dim disabled:opacity-50"
                  >
                    Mark unstudied
                  </button>
                )}
                {isOwn && (
                  <button
                    type="button"
                    onClick={remove}
                    disabled={pending}
                    className="text-[10px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-red-400 disabled:opacity-50"
                  >
                    Delete film
                  </button>
                )}
              </div>

              {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
