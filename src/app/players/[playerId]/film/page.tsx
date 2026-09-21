import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FilmCard, type FilmView } from "@/components/film-card";
import { AddFilmForm } from "@/components/add-film-form";
import { EmptyState } from "@/components/empty-state";
import { ProgressRing } from "@/components/charts/progress-ring";
import {
  rankFilm,
  groupProFilm,
  FILM_KINDS,
  SKILL_LABELS,
  type FilmResource,
  type Trainer,
} from "@/lib/basketball/film";
import { WEAKNESS_THRESHOLD, type ComputedPlayerType } from "@/lib/basketball/assessment";
import { type PlayerType } from "@/lib/basketball/workout-matching";

/**
 * The Film Room.
 *
 * Structured as a curriculum rather than a video list: lessons carry what
 * to watch for, a player records what they're taking into the next
 * session, and everything is ordered toward the skills they're actually
 * weakest at. Trainers are first-class so a player can go straight to a
 * real channel when a lesson has no link attached yet.
 */
export default async function FilmRoomPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: player } = await supabase
    .schema("hoops")
    .from("players")
    .select("id, display_name, household_id, player_type")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) notFound();

  const playerType = (player.player_type ?? {}) as ComputedPlayerType & PlayerType;

  // RLS returns curated rows plus anything this household added — see the
  // film_resources policies in migration 0004.
  const { data: filmRows, error: filmError } = await supabase
    .schema("hoops")
    .from("film_resources")
    .select(
      "id, title, url, kind, difficulty, skill_tags, position_tags, watch_for, notes, duration_seconds, drill_id, trainer_id, pro_player_name, added_by_household_id, sort_order"
    );

  if (filmError) console.error("[film] fetch failed:", filmError);

  const { data: trainerRows } = await supabase
    .schema("hoops")
    .from("trainers")
    .select(
      "id, name, handle, youtube_url, instagram_url, tiktok_url, website_url, bio, specialty, sort_order"
    )
    .order("sort_order", { ascending: true });

  const { data: viewRows } = await supabase
    .schema("hoops")
    .from("film_views")
    .select("film_resource_id, takeaway, watched_at")
    .eq("player_id", playerId);

  const drillIds = [...new Set((filmRows ?? []).map((f) => f.drill_id).filter(Boolean))];
  const { data: drillRows } = drillIds.length
    ? await supabase.schema("hoops").from("drills").select("id, name").in("id", drillIds)
    : { data: [] as { id: string; name: string }[] };

  const trainers = (trainerRows ?? []) as Trainer[];
  const trainersById = new Map(trainers.map((t) => [t.id, t]));
  const drillNameById = new Map((drillRows ?? []).map((d) => [d.id, d.name]));
  const viewsByFilmId = new Map(
    ((viewRows ?? []) as FilmView[]).map((v) => [v.film_resource_id, v])
  );
  const watchedIds = new Set(viewsByFilmId.keys());

  const { data: sessionRows } = await supabase
    .schema("hoops")
    .from("film_sessions")
    .select("id, name, description, outcome, skill_tags, position_tags, difficulty, sort_order")
    .order("sort_order", { ascending: true });

  const studySessions = sessionRows ?? [];

  const { data: sessionItemRows } = studySessions.length
    ? await supabase
        .schema("hoops")
        .from("film_session_items")
        .select("film_session_id")
    : { data: [] as { film_session_id: string }[] };

  const itemCountBySession = new Map<string, number>();
  (sessionItemRows ?? []).forEach((r) => {
    itemCountBySession.set(r.film_session_id, (itemCountBySession.get(r.film_session_id) ?? 0) + 1);
  });

  const { data: sessionProgressRows } = await supabase
    .schema("hoops")
    .from("film_session_progress")
    .select("film_session_id, completed_at")
    .eq("player_id", playerId);

  const completedSessionIds = new Map(
    (sessionProgressRows ?? []).map((p) => [p.film_session_id, p.completed_at])
  );

  const film = (filmRows ?? []) as FilmResource[];
  const ranked = rankFilm(playerType, film, watchedIds, WEAKNESS_THRESHOLD);

  const studiedCount = film.filter((f) => watchedIds.has(f.id)).length;
  const [upNext, ...rest] = ranked;

  // Grouped by lesson type rather than by skill: a player browsing film is
  // usually after a kind of learning ("show me game IQ") more than a
  // category, and the weak-skill ordering already handles the rest.
  // Pro film is pulled out of the kind grouping and organised by player
  // instead — "who should I be watching" is the question a kid actually
  // has, and it's answerable in a way "here are 12 clips" isn't.
  // From `rest`, not `ranked` — whatever won the "Start Here" slot is
  // already rendered above, and pulling from the full list would show it
  // a second time down here.
  const proFilm = groupProFilm(
    rest.filter((f) => f.kind === "pro_study"),
    playerType.primary_position ?? null
  );
  const matchedPros = proFilm.filter((g) => g.matchesPosition).map((g) => g.player);

  const byKind = FILM_KINDS.filter((k) => k.value !== "pro_study")
    .map((kind) => ({
      kind,
      items: rest.filter((f) => f.kind === kind.value),
    }))
    .filter((g) => g.items.length > 0);

  const untyped = rest.filter((f) => !f.kind);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <Link
            href={`/players/${playerId}`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← {player.display_name}
          </Link>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
            {studiedCount}/{film.length} studied
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <section className="theme-dark hero-sheen panel-lit relative overflow-hidden rounded-3xl border border-line p-5 shadow-[var(--shadow-panel)]">
          <div className="court-lines absolute inset-0 opacity-60" aria-hidden />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-accent">
                Film Room
              </p>
              <h1 className="font-display mt-1.5 text-4xl uppercase leading-[0.92] tracking-tight text-foreground">
                Study the game
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-foreground-dim">
                Watching isn&rsquo;t studying. Every lesson tells you what to look for, and asks
                what you&rsquo;re taking into your next session.
              </p>
            </div>

            {film.length > 0 && (
              <ProgressRing
                ratio={film.length === 0 ? 0 : studiedCount / film.length}
                size={74}
                stroke={6}
                idPrefix="film"
              >
                <span className="font-display text-xl leading-none text-foreground">
                  {studiedCount}
                </span>
                <span className="mt-0.5 text-[8px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim">
                  Studied
                </span>
              </ProgressRing>
            )}
          </div>
        </section>

        {/* Directly under the hero, not below two dozen film cards — it was
            unreachable down there without scrolling the whole library. */}
        {player.household_id && (
          <AddFilmForm householdId={player.household_id} playerId={playerId} />
        )}

        {/* Above the individual lessons: a guided course is the better
            entry point than a library, especially for the IQ side where a
            player doesn't yet know what to look for. */}
        {studySessions.length > 0 && (
          <section>
            <SectionHeading title="Study Sessions" caption="Guided, in order" />
            <div className="space-y-2.5">
              {studySessions.map((s) => {
                const finished = Boolean(completedSessionIds.get(s.id));
                return (
                  <Link
                    key={s.id}
                    href={`/players/${playerId}/film/sessions/${s.id}`}
                    className="panel-lit block overflow-hidden rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-[var(--line-strong)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(s.skill_tags ?? []).map((t: string) => (
                            <span
                              key={t}
                              className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-accent"
                            >
                              {SKILL_LABELS[t] ?? t}
                            </span>
                          ))}
                        </div>
                        <p className="font-display mt-1.5 text-xl uppercase leading-[1.02] tracking-tight text-foreground">
                          {s.name}
                        </p>
                        {s.outcome && (
                          <p className="mt-1.5 text-xs leading-relaxed text-foreground-dim">
                            {s.outcome}
                          </p>
                        )}
                      </div>
                      {finished && (
                        <span className="shrink-0 rounded-md border border-[var(--data-positive)]/50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[var(--data-positive)]">
                          Done
                        </span>
                      )}
                    </div>
                    <p className="mt-3 border-t border-line pt-2.5 text-[10px] font-bold uppercase tracking-wider text-foreground-mute">
                      {itemCountBySession.get(s.id) ?? 0} clips
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {film.length === 0 ? (
          <EmptyState
            eyebrow="No film yet"
            title="Nothing in the Film Room"
            subtitle="Run supabase/seed_0005_film_room.sql to load the curriculum, or add your own film below."
          />
        ) : (
          <>
            {upNext && (
              <section>
                <SectionHeading title="Start Here" caption="Picked for your weak spots" />
                <FilmCard
                  film={upNext}
                  trainer={upNext.trainer_id ? trainersById.get(upNext.trainer_id) ?? null : null}
                  view={viewsByFilmId.get(upNext.id) ?? null}
                  playerId={playerId}
                  drillName={upNext.drill_id ? drillNameById.get(upNext.drill_id) ?? null : null}
                />
              </section>
            )}

            {proFilm.length > 0 && (
              <section>
                <SectionHeading title="Pro Film" caption="Steal something specific" />

                {matchedPros.length > 0 && (
                  <p className="mb-3 rounded-xl border border-[var(--data-cyan)]/30 bg-[var(--data-cyan)]/5 px-4 py-2.5 text-xs leading-relaxed text-foreground-dim">
                    Built like you:{" "}
                    <span className="font-bold text-[var(--data-cyan)]">
                      {matchedPros.join(", ")}
                    </span>
                    . Start there.
                  </p>
                )}

                <div className="space-y-4">
                  {proFilm.map((group) => (
                    <div key={group.player}>
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <p className="font-display text-lg uppercase leading-none tracking-wide text-foreground">
                          {group.player}
                        </p>
                        {group.matchesPosition && (
                          <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-[0.14em] text-[var(--data-cyan)]">
                            Your position
                          </span>
                        )}
                      </div>
                      <div className="space-y-2.5">
                        {group.items.map((f) => (
                          <FilmCard
                            key={f.id}
                            film={f}
                            trainer={null}
                            view={viewsByFilmId.get(f.id) ?? null}
                            playerId={playerId}
                            drillName={
                              f.drill_id ? drillNameById.get(f.drill_id) ?? null : null
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {byKind.map(({ kind, items }) => (
              <section key={kind.value}>
                <SectionHeading title={kind.label} caption={kind.blurb} />
                <div className="space-y-2.5">
                  {items.map((f) => (
                    <FilmCard
                      key={f.id}
                      film={f}
                      trainer={f.trainer_id ? trainersById.get(f.trainer_id) ?? null : null}
                      view={viewsByFilmId.get(f.id) ?? null}
                      playerId={playerId}
                      drillName={f.drill_id ? drillNameById.get(f.drill_id) ?? null : null}
                    />
                  ))}
                </div>
              </section>
            ))}

            {untyped.length > 0 && (
              <section>
                <SectionHeading title="Your Film" />
                <div className="space-y-2.5">
                  {untyped.map((f) => (
                    <FilmCard
                      key={f.id}
                      film={f}
                      trainer={f.trainer_id ? trainersById.get(f.trainer_id) ?? null : null}
                      view={viewsByFilmId.get(f.id) ?? null}
                      playerId={playerId}
                      drillName={f.drill_id ? drillNameById.get(f.drill_id) ?? null : null}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {trainers.length > 0 && (
          <section>
            <SectionHeading title="The Trainers" caption="Go straight to the source" />
            <div className="space-y-2.5">
              {trainers.map((trainer) => (
                <div key={trainer.id} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">
                        {trainer.name}
                      </p>
                      {trainer.handle && (
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
                          {trainer.handle}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {(trainer.specialty ?? []).map((s) => (
                        <span
                          key={s}
                          className="shrink-0 text-[9px] font-extrabold uppercase tracking-[0.12em] text-accent"
                        >
                          {SKILL_LABELS[s] ?? s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {trainer.bio && (
                    <p className="mt-2 text-xs leading-relaxed text-foreground-dim">{trainer.bio}</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-3 border-t border-line pt-2.5">
                    {/* Only links that were actually verified are rendered —
                        a trainer with no confirmed channel simply shows
                        fewer of these rather than a guessed URL. */}
                    <TrainerLink href={trainer.youtube_url} label="YouTube" />
                    <TrainerLink href={trainer.instagram_url} label="Instagram" />
                    <TrainerLink href={trainer.tiktok_url} label="TikTok" />
                    <TrainerLink href={trainer.website_url} label="Website" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function TrainerLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] font-extrabold uppercase tracking-wide text-accent transition-colors hover:text-accent-hover"
    >
      {label} ↗
    </a>
  );
}

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">
        {title}
      </h2>
      {caption && (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-foreground-mute">
          {caption}
        </span>
      )}
    </div>
  );
}
