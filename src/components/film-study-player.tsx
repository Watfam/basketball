"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeFilmSession } from "@/app/actions";
import { isWatchableUrl, durationLabel, FILM_KIND_LABELS } from "@/lib/basketball/film";
import { haptic } from "@/lib/haptics";
import { Button, buttonClass } from "@/components/ui/button";
import { FormError, TextArea } from "@/components/ui/field";

export type StudyItem = {
  id: string;
  prompt: string | null;
  film: {
    id: string;
    title: string;
    url: string | null;
    kind: string | null;
    notes: string | null;
    watch_for: string[] | null;
    duration_seconds: number | null;
    pro_player_name: string | null;
  };
};

/**
 * Working through a film session one lesson at a time.
 *
 * Deliberately stepped rather than a scrollable list: the whole point of
 * a study session is watching one thing with one question in mind, and a
 * list invites skimming all of it at once. The prompt sits above the
 * video link because it has to be read first to be worth anything.
 */
export function FilmStudyPlayer({
  playerId,
  filmSessionId,
  sessionName,
  outcome,
  items,
  alreadyCompleted,
  existingTakeaway,
}: {
  playerId: string;
  filmSessionId: string;
  sessionName: string;
  outcome: string | null;
  items: StudyItem[];
  alreadyCompleted: boolean;
  existingTakeaway: string | null;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [takeaway, setTakeaway] = useState(existingTakeaway ?? "");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const atEnd = index >= items.length;
  const item = items[index];

  function next() {
    haptic("step");
    setIndex((i) => i + 1);
  }

  function back() {
    haptic("tap");
    setIndex((i) => Math.max(0, i - 1));
  }

  function finish() {
    haptic("success");
    startTransition(async () => {
      const result = await completeFilmSession(
        playerId,
        filmSessionId,
        takeaway,
        items.map((i) => i.film.id)
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-md text-center">
        <div className="theme-dark hero-sheen panel-lit relative overflow-hidden rounded-3xl border border-accent p-7">
          <div className="court-lines absolute inset-0 opacity-60" aria-hidden />
          <div className="relative">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
              Session Complete
            </p>
            <h2 className="font-display mt-3 text-4xl uppercase leading-[0.9] tracking-tight text-foreground">
              {sessionName}
            </h2>
            {takeaway && (
              <p className="mt-4 border-l-2 border-accent pl-3 text-left text-sm italic leading-relaxed text-foreground-dim">
                {takeaway}
              </p>
            )}
          </div>
        </div>

        <Button size="lg" block onClick={() => router.push(`/players/${playerId}/film`)} className="mt-5">
          Back to Film Room
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push(`/players/${playerId}/film`)}
          className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
        >
          ← Film Room
        </button>
        <span className="truncate text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
          {sessionName}
        </span>
      </div>

      <div className="mb-4 flex items-center gap-1.5">
        {items.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= index ? "bg-accent" : "bg-[var(--data-dim)]"
            }`}
          />
        ))}
        <div
          className={`h-1 flex-1 rounded-full transition-colors ${
            atEnd ? "bg-accent" : "bg-[var(--data-dim)]"
          }`}
        />
      </div>

      {atEnd ? (
        <div className="panel-lit rounded-3xl border border-line bg-surface p-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
            Last step
          </p>
          <h2 className="font-display mt-2 text-3xl uppercase leading-[0.95] tracking-tight text-foreground">
            What are you stealing?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground-dim">
            {outcome ?? "One thing from this session you're taking onto the court."}
          </p>

          <TextArea
            value={takeaway}
            onChange={(e) => setTakeaway(e.target.value)}
            rows={4}
            placeholder="Be specific. “Relocate after every pass instead of watching the ball.”"
            className="mt-4"
          />

          <Button size="lg" block onClick={finish} disabled={pending} className="mt-4">
            {pending ? "Saving…" : alreadyCompleted ? "Update takeaway" : "Finish session"}
          </Button>
          {error && <FormError className="mt-2">{error}</FormError>}

          <Button variant="ghost" size="sm" block onClick={back} className="mt-2">
            Back
          </Button>
        </div>
      ) : (
        <div className="panel-lit rounded-3xl border border-line bg-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">
              {item.film.kind ? FILM_KIND_LABELS[item.film.kind] ?? item.film.kind : "Film"}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
              {index + 1} of {items.length}
              {durationLabel(item.film.duration_seconds)
                ? ` · ${durationLabel(item.film.duration_seconds)}`
                : ""}
            </span>
          </div>

          <h2 className="font-display mt-2 text-2xl uppercase leading-[0.98] tracking-tight text-foreground">
            {item.film.title}
          </h2>
          {item.film.pro_player_name && (
            <p className="mt-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--data-cyan)]">
              {item.film.pro_player_name}
            </p>
          )}

          {/* Above the video on purpose — a prompt read afterwards is just
              a caption. */}
          {item.prompt && (
            <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">
                Your job this clip
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{item.prompt}</p>
            </div>
          )}

          {isWatchableUrl(item.film.url) ? (
            <a
              href={item.film.url as string}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ size: "lg", block: true, className: "mt-4" })}
            >
              Watch film ↗
            </a>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-3 text-center text-xs text-foreground-dim">
              No link on this one yet — the points below still stand on their own.
            </p>
          )}

          {(item.film.watch_for ?? []).length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-accent">
                Watch For
              </p>
              <ul className="space-y-2">
                {(item.film.watch_for ?? []).map((w) => (
                  <li key={w} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex gap-3">
            {index > 0 && (
              <Button variant="secondary" onClick={back} className="px-5">
                Back
              </Button>
            )}
            <Button variant="secondary" onClick={next} className="flex-1">
              {index === items.length - 1 ? "Last step →" : "Next clip →"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
