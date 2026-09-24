import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FilmCard, type FilmView } from "@/components/film-card";
import { FilmRoomTabs } from "@/components/film-room-tabs";
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
 * A curriculum rather than a video list: lessons carry what to watch for,
 * the player records what they're taking into the next session, and
 * everything is ordered toward the skills they're weakest at.
 *
 * Split across three tabs because a single scroll had become
 * unnavigable. `?lesson=<id>` opens one lesson directly, so anything
 * linking here from elsewhere lands on the lesson it promised instead of
 * dropping the player into the library to go hunting.
 */
export default async function FilmRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ lesson?: string; tab?: string }>;
}) {
  const { playerId } = await params;
  const { lesson: deepLinkId, tab } = await searchParams;
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
      "id, name, handle, youtube_url, instagram_url, website_url, bio, specialty, sort_order"
    )
    .order("sort_order", { ascending: true });

  const { data: viewRows } = await supabase
    .schema("hoops")
    .from("film_views")
    .select("film_resource_id, takeaway, watched_at")
    .eq("player_id", playerId);

  // Links this household attached to curated lessons (migration 0009).
  const { data: linkRows } = player.household_id
    ? await supabase
        .schema("hoops")
        .from("film_links")
        .select("film_resource_id, url")
        .eq("household_id", player.household_id)
    : { data: [] as { film_resource_id: string; url: string }[] };

  const linkByFilmId = new Map((linkRows ?? []).map((l) => [l.film_resource_id, l.url]));

  const drillIds = [...new Set((filmRows ?? []).map((f) => f.drill_id).filter(Boolean))];
  const { data: drillRows } = drillIds.length
    ? await supabase.schema("hoops").from("drills").select("id, name").in("id", drillIds)
    : { data: [] as { id: string; name: string }[] };

  const { data: sessionRows } = await supabase
    .schema("hoops")
    .from("film_sessions")
    .select("id, name, description, outcome, skill_tags, position_tags, difficulty, sort_order")
    .order("sort_order", { ascending: true });

  const studySessions = sessionRows ?? [];

  const { data: sessionItemRows } = await supabase
    .schema("hoops")
    .from("film_session_items")
    .select("film_session_id");

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

  const trainers = (trainerRows ?? []) as Trainer[];
  const trainersById = new Map(trainers.map((t) => [t.id, t]));
  const drillNameById = new Map((drillRows ?? []).map((d) => [d.id, d.name]));
  const viewsByFilmId = new Map(
    ((viewRows ?? []) as FilmView[]).map((v) => [v.film_resource_id, v])
  );
  const watchedIds = new Set(viewsByFilmId.keys());

  const film = (filmRows ?? []) as FilmResource[];
  const ranked = rankFilm(playerType, film, watchedIds, WEAKNESS_THRESHOLD);
  const studiedCount = film.filter((f) => watchedIds.has(f.id)).length;

  const card = (f: FilmResource, autoOpen = false) => (
    <FilmCard
      key={f.id}
      film={f}
      trainer={f.trainer_id ? trainersById.get(f.trainer_id) ?? null : null}
      view={viewsByFilmId.get(f.id) ?? null}
      playerId={playerId}
      drillName={f.drill_id ? drillNameById.get(f.drill_id) ?? null : null}
      householdId={player.household_id}
      linkOverride={linkByFilmId.get(f.id) ?? null}
      autoOpen={autoOpen}
    />
  );

  const [upNext, ...rest] = ranked;
  const proFilm = groupProFilm(
    rest.filter((f) => f.kind === "pro_study"),
    playerType.primary_position ?? null
  );
  const matchedPros = proFilm.filter((g) => g.matchesPosition).map((g) => g.player);
  const byKind = FILM_KINDS.filter((k) => k.value !== "pro_study")
    .map((kind) => ({ kind, items: rest.filter((f) => f.kind === kind.value) }))
    .filter((g) => g.items.length > 0);
  const untyped = rest.filter((f) => !f.kind);

  // A deep-linked lesson gets pinned to the top of the Library tab with
  // its sheet already open, so the player never scrolls to find it.
  const deepLinked = deepLinkId ? film.find((f) => f.id === deepLinkId) ?? null : null;
  const initialTab = deepLinked
    ? ("library" as const)
    : tab === "library" || tab === "trainers"
      ? tab
      : ("sessions" as const);

  const sessionsTab = (
    <div className="space-y-5">
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
                        {((s.skill_tags ?? []) as string[]).map((t) => (
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

      {upNext && (
        <section>
          <SectionHeading title="Or One Lesson" caption="Picked for your weak spots" />
          {card(upNext)}
        </section>
      )}
    </div>
  );

  const libraryTab = (
    <div className="space-y-5">
      {deepLinked && (
        <section>
          <SectionHeading title="Opened" />
          {card(deepLinked, true)}
        </section>
      )}

      {player.household_id && (
        <AddFilmForm householdId={player.household_id} playerId={playerId} />
      )}

      {proFilm.length > 0 && (
        <section>
          <SectionHeading title="Pro Film" caption="Steal something specific" />
          {matchedPros.length > 0 && (
            <p className="mb-3 rounded-xl border border-[var(--data-cyan)]/30 bg-[var(--data-cyan)]/5 px-4 py-2.5 text-xs leading-relaxed text-foreground-dim">
              Built like you:{" "}
              <span className="font-bold text-[var(--data-cyan)]">{matchedPros.join(", ")}</span>.
              Start there.
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
                <div className="space-y-2.5">{group.items.map((f) => card(f))}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {byKind.map(({ kind, items }) => (
        <section key={kind.value}>
          <SectionHeading title={kind.label} caption={kind.blurb} />
          <div className="space-y-2.5">{items.map((f) => card(f))}</div>
        </section>
      ))}

      {untyped.length > 0 && (
        <section>
          <SectionHeading title="Your Film" />
          <div className="space-y-2.5">{untyped.map((f) => card(f))}</div>
        </section>
      )}
    </div>
  );

  const trainersTab = (
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
            {/* Only verified links render — a trainer with no confirmed
                channel shows fewer of these rather than a guessed URL. */}
            <TrainerLink href={trainer.youtube_url} label="YouTube" />
            <TrainerLink href={trainer.instagram_url} label="Instagram" />
            <TrainerLink href={trainer.website_url} label="Website" />
          </div>
        </div>
      ))}
    </div>
  );

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

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5 sm:py-8">
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
                ratio={studiedCount / film.length}
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

        {film.length === 0 ? (
          <EmptyState
            eyebrow="No film yet"
            title="Nothing in the Film Room"
            subtitle="Run supabase/seed_0005_film_room.sql to load the curriculum, or add your own film."
          />
        ) : (
          <FilmRoomTabs
            sessions={sessionsTab}
            library={libraryTab}
            trainers={trainersTab}
            initialTab={initialTab}
          />
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
