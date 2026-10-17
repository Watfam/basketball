import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayerHero } from "@/components/player-hero";
import { PlayerTabHeader } from "@/components/player-tab-header";
import { AttributePanel } from "@/components/attribute-panel";
import { TrainingLoadPanel } from "@/components/training-load-panel";
import { MilestoneRail, buildMilestones } from "@/components/milestone-rail";
import { LevelPicker } from "@/components/level-picker";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardSection } from "@/components/ui/card";
import { loadActivity } from "@/lib/basketball/activity-server";
import { WEEKLY_DAYS_TARGET, thisWeek } from "@/lib/basketball/activity";
import { computeStreakWeeks, dailyActivity, isAssessmentStale, lastAssessedLabel, weeklyVolume } from "@/lib/basketball/progress";
import { computeOverall, type Ratings } from "@/lib/basketball/rating";
import { playerLevel, type ComputedPlayerType, type SkillLevel } from "@/lib/basketball/assessment";
import { formatPercentage, seasonStart } from "@/lib/basketball/shooting";
import { shotTotals, shotWindowStart, type ShotSet } from "@/lib/basketball/home";
import { loadProgressRows } from "@/lib/basketball/progress-server";
import { daysAgo } from "@/lib/basketball/progress-range";
import { analyzeBenchmarks } from "@/lib/basketball/benchmark-analysis";
import { BENCHMARKS } from "@/lib/basketball/benchmarks";

const EMPTY_RATINGS: Ratings = { ball_handling: 0, shooting: 0, defense: 0, athleticism: 0 };

/**
 * Me: the player card, how they're rated, how much work they've put in,
 * their training level, and their history. Everything about the player
 * that isn't "what do I do now" (that's Today).
 */
export default async function MePage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const supabase = await createClient();
  const hoops = supabase.schema("hoops");

  const [{ data: { user } }, { data: player }, { data: assessments }, { data: lastCombine }, { data: seasonRows }, activity, progress] =
    await Promise.all([
      supabase.auth.getUser(),
      hoops.from("players").select("id, display_name, player_type").eq("id", playerId).maybeSingle(),
      // The two latest rating snapshots: the older one draws "before" on the radar.
      hoops
        .from("assessments")
        .select("kind, computed_player_type, completed_at")
        .eq("player_id", playerId)
        .order("completed_at", { ascending: false })
        .limit(2),
      hoops
        .from("assessments")
        .select("completed_at")
        .eq("player_id", playerId)
        .eq("kind", "combine")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      hoops
        .from("shot_sessions")
        .select("id, label, started_at, makes, attempts, source")
        .eq("player_id", playerId)
        .not("ended_at", "is", null)
        .is("deleted_at", null)
        .gt("attempts", 0)
        .gte("started_at", shotWindowStart(new Date()).toISOString())
        .limit(1000),
      loadActivity(supabase, playerId),
      loadProgressRows(supabase, playerId),
    ]);

  if (!user) redirect("/login");
  if (!player) notFound();

  const playerType = (player.player_type ?? {}) as ComputedPlayerType & { preferred_level?: SkillLevel };
  if (!playerType.archetype) redirect(`/players/${playerId}/assessment`);

  const ratings = (playerType.ratings ?? EMPTY_RATINGS) as Ratings;
  const level = playerLevel(player.player_type);
  const measured = Boolean(lastCombine);
  const previousRatings = (assessments?.[1]?.computed_player_type as ComputedPlayerType | undefined)?.ratings ?? null;
  const ratedAt = (lastCombine?.completed_at as string | null | undefined) ?? assessments?.[0]?.completed_at;
  const stale = isAssessmentStale(ratedAt);

  const dates = activity.activities.map((a) => a.at);
  const streakWeeks = computeStreakWeeks(dates);
  const week = thisWeek(activity.activities);
  const sets = (seasonRows ?? []) as unknown as ShotSet[];
  const season = shotTotals(sets, seasonStart());
  const shotsFourWeeks = shotTotals(sets, daysAgo(28)).taken;
  const milestones = buildMilestones(dates.length, streakWeeks);
  const fourWeeksAgo = daysAgo(28);
  const recentWorkouts = activity.activities.filter((a) => a.kind === "workout" && a.at >= fourWeeksAgo).length;
  const benchmarksRun = analyzeBenchmarks(progress.rows).filter((r) => r.groups.some((g) => g.current && g.comparable.length > 0)).length;

  return (
    <div className="flex flex-1 flex-col">
      <PlayerTabHeader playerId={playerId} name={player.display_name} />

      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-5 sm:py-8">
        <PlayerHero
          playerName={player.display_name}
          archetype={playerType.archetype}
          primaryPosition={playerType.primary_position ?? ""}
          level={level}
          overall={computeOverall(ratings)}
          measured={measured}
          streakWeeks={streakWeeks}
          totalSessions={dates.length}
          seasonPct={season.taken > 0 ? formatPercentage(season.pct) : null}
        />

        <section aria-label="Progress">
          <SectionHeading title="Progress" caption="Last 4 weeks" />
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Workouts", value: String(recentWorkouts), sub: "finished", href: `/players/${playerId}/progress?range=4w` },
              { label: "Shots taken", value: String(shotsFourWeeks), sub: "effort, not skill", href: `/players/${playerId}/shooting?range=4w` },
              { label: "Benchmarks", value: `${benchmarksRun} of ${BENCHMARKS.length}`, sub: "run so far", href: `/players/${playerId}/progress?view=benchmarks&range=all` },
            ].map((t) => (
              <Link key={t.label} href={t.href} className="flex min-h-24 flex-col justify-between rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-line-strong">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-foreground-mute">{t.label}</span>
                <span><span className="block font-display text-2xl leading-none text-foreground">{t.value}</span><span className="mt-0.5 block text-[11px] font-bold leading-snug text-foreground-dim">{t.sub}</span></span>
              </Link>
            ))}
          </div>
          <Link href={`/players/${playerId}/progress`} className="-mb-2 mt-1 flex min-h-11 items-center justify-between rounded-lg px-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent">
            Progress and analytics <span aria-hidden>›</span>
          </Link>
        </section>

        <section>
          <SectionHeading title="Your game" caption={measured ? `Measured · ${lastAssessedLabel(ratedAt)}` : "Self-rated"} />
          <AttributePanel ratings={ratings} previousRatings={previousRatings as Ratings | null} />
          {/* Measured beats self-rated: once there's a combine, retesting
              means the combine again, never a guess over the top of it. */}
          {measured ? (
            <ButtonLink
              href={`/players/${playerId}/combine`}
              variant={stale ? "primary" : "secondary"}
              size="md"
              block
              className="mt-3"
            >
              {stale ? "Time to retest: run the combine" : "Retest in the combine"}
            </ButtonLink>
          ) : (
            <Card className="mt-3 p-4">
              <p className="text-sm text-foreground-dim">
                These are your own guesses. The combine measures them: nine tests, about 30 minutes.
              </p>
              <ButtonLink href={`/players/${playerId}/combine`} size="md" block className="mt-3">
                Get measured
              </ButtonLink>
              <ButtonLink href={`/players/${playerId}/assessment`} variant="ghost" size="sm" block className="mt-1">
                Rate yourself again
              </ButtonLink>
            </Card>
          )}
        </section>

        <section>
          <SectionHeading title="The work" caption="Last 8 weeks" />
          <TrainingLoadPanel
            weeks={weeklyVolume(dates, 8)}
            days={dailyActivity(dates, 14)}
            thisWeekCount={week.activeDays}
            weeklyTarget={WEEKLY_DAYS_TARGET}
          />
        </section>

        <section>
          <SectionHeading
            title="Milestones"
            caption={`${milestones.filter((m) => m.current >= m.target).length} of ${milestones.length} unlocked`}
          />
          <MilestoneRail milestones={milestones} />
        </section>

        <section>
          <SectionHeading title="Training level" caption="How hard workouts run" />
          <Card className="p-4">
            <LevelPicker playerId={playerId} currentLevel={level} isSuggested={!playerType.preferred_level} />
          </Card>
        </section>

        <CardSection className="overflow-hidden">
          {[
            { href: `/players/${playerId}/progress`, label: "Progress and analytics", sub: "Benchmarks, trends, and the work behind them" },
            { href: `/players/${playerId}/assessments`, label: "Ratings history", sub: "Every rating, and what changed" },
            { href: `/players/${playerId}/sessions`, label: "Workout history", sub: "Every workout, finished or not" },
            { href: `/players/${playerId}/shooting`, label: "Shooting history", sub: "Every set, by drill" },
            { href: "/", label: "Switch profile", sub: "Someone else using this phone" },
          ].map((item, i) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-raised ${
                i ? "border-t border-line" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="truncate text-xs text-foreground-mute">{item.sub}</p>
              </div>
              <span className="text-foreground-mute" aria-hidden>
                ›
              </span>
            </Link>
          ))}
        </CardSection>
      </main>
    </div>
  );
}

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">{title}</h2>
      {caption && (
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-foreground-mute">{caption}</span>
      )}
    </div>
  );
}
