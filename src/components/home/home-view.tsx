import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardSection, Eyebrow } from "@/components/ui/card";
import { WEEKLY_DAYS_TARGET, type WeekSummary } from "@/lib/basketball/activity";
import { HOME_RANGES, countedBy, plainSentence, MIN_SHOTS_TO_READ, type Answer, type Focus, type LookBack, type RecentItem, type Totals, type WeekBar } from "@/lib/basketball/home";
import { formatPercentage } from "@/lib/basketball/shooting";
import { BenchmarksCard } from "@/components/benchmarks-card";
import type { BenchmarkLine } from "@/lib/basketball/benchmark-summary";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const short = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

export type HomeViewProps = {
  playerId: string;
  welcome: { title: string; line: string };
  week: WeekSummary;
  /** The existing next-up card(s): a set to pick up, the workout or program day, the combine. The one big button lives here. */
  hero: ReactNode;
  range: { key: "7d" | "4w" | "season"; label: string; phrase: string };
  totals: Totals;
  /** The season so far, shown when the chosen range is empty but the player has shot before. */
  season: Totals;
  weeks: WeekBar[];
  lookBack: LookBack | null;
  answer: Answer;
  focus: Focus | null;
  recent: RecentItem[];
  /** The three benchmark tests with the latest result of each, and the workout that runs them (null when it is not in the library). */
  benchmarks: BenchmarkLine[];
  benchmarkWorkoutId: string | null;
  /** Only for test pages that show this view somewhere else; the real page leaves these out. */
  basePath?: string;
};

/**
 * Today. The first screen a player sees, top to bottom: a welcome, the one thing to do, how the shooting is going in three numbers and one
 * picture, one thing to focus on, what was done lately, and the way to the details. Everything here is a link to the screen that holds the
 * detail (Shoot, Progress, Train, Film Room), carrying the date range along, so nothing is a dead end. It receives data and draws it.
 */
export function HomeView(p: HomeViewProps) {
  const base = p.basePath ?? `/players/${p.playerId}`;
  const root = `/players/${p.playerId}`;
  const rangeHref = (key: string) => `${base}${base.includes("?") ? "&" : "?"}range=${key}`;
  const shootingHref = `${root}/shooting?range=${p.range.key}`;
  const skillHref = `${root}/progress?view=shooting&range=${p.range.key}`;
  const progressHref = `${root}/progress?range=${p.range.key}`;
  const empty = p.totals.taken === 0;
  const never = empty && p.season.taken === 0 && p.weeks.every((w) => w.taken === 0);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
      <Welcome title={p.welcome.title} line={p.welcome.line} week={p.week} />

      <div className="space-y-4">{p.hero}</div>

      <section aria-label="Your shooting" className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">Your shooting</h2>
          <div className="flex gap-1" role="group" aria-label="How far back">
            {HOME_RANGES.map((r) => (
              <Link key={r.key} href={rangeHref(r.key)} scroll={false} aria-current={p.range.key === r.key ? "true" : undefined}
                className={`flex min-h-11 items-center rounded-full border px-3 text-xs font-bold ${p.range.key === r.key ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground-dim"}`}>{r.label}</Link>
            ))}
          </div>
        </div>

        <CardSection className="overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-line">
            <Kpi label="Shots taken" value={String(p.totals.taken)} href={shootingHref} hint="See each set" />
            <Kpi label="Shots made" value={String(p.totals.made)} href={shootingHref} hint="See each set" />
            <Kpi label="Shooting %" value={p.totals.taken > 0 ? formatPercentage(p.totals.pct) : "—"} href={skillHref} hint="By skill" accent />
          </div>

          <div className="space-y-3 border-t border-line p-4">
            <p className="text-[15px] font-semibold leading-snug text-foreground">{plainSentence(p.totals, p.range.phrase)}</p>
            {empty && !never && p.season.taken > 0 && <p className="text-sm text-foreground-dim">Your season so far: {p.season.made} of {p.season.taken} ({formatPercentage(p.season.pct)}). Try a longer range above.</p>}
            {p.totals.taken > 0 && p.totals.taken < MIN_SHOTS_TO_READ && <p className="text-sm text-foreground-dim">Only {p.totals.taken} {p.totals.taken === 1 ? "shot" : "shots"} so far, so the percentage is early. It means more after {MIN_SHOTS_TO_READ} or more.</p>}
            {!never && <AnswerLine answer={p.answer} href={p.answer.benchmark ? `${root}/progress?view=benchmarks&benchmark=${p.answer.benchmark}&range=all` : `${root}/progress?view=benchmarks&range=all`} />}
            {never ? (
              <>
                <p className="text-sm text-foreground-dim">Your numbers start with your first set. Shoot, count your makes, and they show up here.</p>
                <ButtonLink href={`${root}/shooting`} size="md" block>Start shooting</ButtonLink>
              </>
            ) : (
              <>
                <WeeklyBars weeks={p.weeks} root={root} />
                {p.lookBack && <p className="text-sm text-foreground-dim">{p.lookBack.short}</p>}
              </>
            )}
            {!never && (
              <details className="text-[13px] text-foreground-dim">
                <summary className="flex min-h-11 cursor-pointer items-center font-bold text-foreground-dim">How are these counted?</summary>
                <ul className="mb-1 list-disc space-y-1.5 pl-5 leading-relaxed">
                  <li>Shots taken and made are every shot counted in a saved set: free shooting and drills, by camera or by tapping.</li>
                  {countedBy(p.totals) && <li>{countedBy(p.totals)}</li>}
                  <li>Shooting % is shots made divided by shots taken.</li>
                  <li>More shots means more work. It does not mean you shoot better.</li>
                  <li>Different drills are different difficulty, so this mixes them. Only the benchmarks are the same test every time.</li>
                  {p.lookBack && <li>{p.lookBack.text}</li>}
                </ul>
              </details>
            )}
          </div>
        </CardSection>
      </section>

      {/* "Next benchmark" is what the Benchmarks section below already says, so it is not shown twice. */}
      {p.focus && p.focus.kind !== "benchmark" && <FocusCard focus={p.focus} />}

      <section aria-label="Benchmarks" className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">Benchmarks</h2>
          <Link href={`${root}/progress?view=benchmarks&range=all`} className="flex min-h-11 items-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent-hover">All results ›</Link>
        </div>
        <BenchmarksCard playerId={p.playerId} lines={p.benchmarks} workoutId={p.benchmarkWorkoutId} intro={false} />
      </section>

      <section aria-label="Recent" className="space-y-2.5">
        <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">Recent</h2>
        {p.recent.length === 0 ? (
          <Card className="p-4 text-sm text-foreground-dim">Nothing yet. Your finished workouts and shooting sets show up here.</Card>
        ) : (
          <CardSection className="divide-y divide-line overflow-hidden">
            {p.recent.map((r) => (
              <Link key={r.id} href={r.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised">
                <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-extrabold uppercase ${r.kind === "workout" ? "bg-accent/15 text-accent-hover" : "bg-raised text-foreground-dim"}`}>{r.kind === "workout" ? "Wk" : "Sh"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{r.title}</span>
                  <span className="block truncate text-xs text-foreground-dim">{r.detail}{r.how ? ` · ${r.how}` : ""}</span>
                </span>
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">{r.when}</span>
              </Link>
            ))}
          </CardSection>
        )}
        <div className="flex flex-wrap gap-x-5">
          <Link href={`${root}/sessions`} className="flex min-h-11 items-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent-hover">Workout history ›</Link>
          <Link href={shootingHref} className="flex min-h-11 items-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent-hover">All shooting ›</Link>
        </div>
      </section>

      <CardSection className="overflow-hidden">
        <Link href={progressHref} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-raised">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">Progress and analytics</span>
            <span className="block truncate text-xs text-foreground-mute">Benchmarks, drills, trends and shot replays</span>
          </span>
          <span className="text-foreground-mute" aria-hidden>›</span>
        </Link>
      </CardSection>
    </main>
  );
}

function Welcome({ title, line, week }: { title: string; line: string; week: WeekSummary }) {
  const hit = week.activeDays >= WEEKLY_DAYS_TARGET;
  return (
    <section aria-label="Welcome" className="animate-rise">
      <h1 className="font-display text-4xl uppercase leading-[0.95] tracking-tight text-foreground">{title}</h1>
      <p className="mt-1.5 text-[15px] leading-snug text-foreground-dim">{line}</p>
      <ol className="mt-3 flex items-center gap-1.5" aria-label={`${week.activeDays} of ${WEEKLY_DAYS_TARGET} days trained this week${hit ? ", target hit" : ""}`}>
        {week.days.map((active, i) => (
          <li key={i}>
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-extrabold ${active ? "bg-accent text-on-accent" : i === week.today ? "border-2 border-accent text-accent-hover" : "bg-raised text-foreground-mute"}`}
              aria-label={`${DAY_NAMES[i]}${active ? ", trained" : ""}${i === week.today ? ", today" : ""}`}
            >
              {DAY_LETTERS[i]}
            </span>
          </li>
        ))}
        <li className="ml-1 text-xs font-bold text-foreground-dim">{week.activeDays} of {WEEKLY_DAYS_TARGET} days</li>
      </ol>
    </section>
  );
}

function Kpi({ label, value, href, hint, accent = false }: { label: string; value: string; href: string; hint: string; accent?: boolean }) {
  return (
    <Link href={href} className="flex min-h-28 flex-col justify-between px-3 py-3.5 transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-foreground-mute">{label}</span>
      <span>
        <span className={`block font-display text-4xl leading-none tabular-nums ${accent ? "text-accent-hover" : "text-foreground"}`}>{value}</span>
        <span className="mt-1 block text-[11px] font-bold text-foreground-dim">{hint} <span aria-hidden>›</span></span>
      </span>
    </Link>
  );
}

/** Shots per week for eight weeks, with the percentage made printed above each week that has enough shots. Each bar opens that week's sets. */
function WeeklyBars({ weeks, root }: { weeks: WeekBar[]; root: string }) {
  const peak = Math.max(1, ...weeks.map((w) => w.taken));
  if (weeks.every((w) => w.taken === 0)) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground-mute">Your last 8 weeks</p>
      <ul className="flex h-28 items-stretch gap-1.5" aria-label="Shots taken each week. The number above a bar is the percentage made.">
        {weeks.map((w) => {
          const label = `Week of ${short(w.start)}${w.isCurrent ? " (this week)" : ""}: ${w.taken} ${w.taken === 1 ? "shot" : "shots"}, ${w.made} made${w.readable ? `, ${Math.round(w.pct ?? 0)}%` : ""}. See that week's sets.`;
          return (
            <li key={w.start.toISOString()} className="min-w-0 flex-1">
              <Link href={`${root}/shooting?from=${iso(w.start)}&to=${iso(new Date(w.end.getTime() - 1))}`} aria-label={label} className="flex h-full flex-col justify-end gap-1 rounded-md focus-visible:outline-2 focus-visible:outline-accent">
                <span className={`text-center text-[11px] font-extrabold tabular-nums ${w.readable ? "text-foreground" : "text-foreground-mute"}`}>{w.readable ? `${Math.round(w.pct ?? 0)}` : ""}</span>
                <span
                  aria-hidden
                  className="animate-grow block w-full rounded-t-[3px]"
                  style={{
                    height: `${w.taken === 0 ? 3 : Math.max(8, (w.taken / peak) * 78)}%`,
                    background: w.isCurrent ? "linear-gradient(180deg, var(--accent-hover), var(--accent))" : w.taken > 0 ? "var(--line-strong)" : "var(--data-dim)",
                  }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex justify-between text-[11px] font-bold text-foreground-mute"><span>8 weeks ago</span><span>This week</span></div>
      <p className="mt-1 text-xs text-foreground-dim">Bars are how many shots you took. The number above is the percent that went in.</p>
    </div>
  );
}

const TONE: Record<Answer["tone"], { glyph: string; cls: string }> = {
  yes: { glyph: "✓", cls: "bg-[var(--data-positive)] text-on-accent" },
  maybe: { glyph: "?", cls: "bg-accent/20 text-accent-hover" },
  dip: { glyph: "↓", cls: "bg-raised text-foreground" },
  none: { glyph: "–", cls: "bg-raised text-foreground-dim" },
  wait: { glyph: "1", cls: "bg-raised text-foreground-dim" },
  new: { glyph: "?", cls: "bg-raised text-foreground-dim" },
};

/** "Am I getting better?", answered only from the benchmarks: the same test, done the same way. */
function AnswerLine({ answer, href }: { answer: Answer; href: string }) {
  const t = TONE[answer.tone];
  return (
    <div className="rounded-xl border border-line bg-raised p-3" aria-label="Am I getting better?">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground-mute">Am I getting better?</p>
      <div className="mt-1.5 flex items-start gap-2.5">
        <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-extrabold ${t.cls}`}>{t.glyph}</span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-snug text-foreground">{answer.headline}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-foreground-dim">{answer.detail}</p>
          <Link href={href} className="-mb-2 inline-flex min-h-11 items-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent-hover">See the tests ›</Link>
        </div>
      </div>
    </div>
  );
}

function FocusCard({ focus }: { focus: Focus }) {
  return (
    <section aria-label="Your focus">
      <Card className="p-4">
        <Eyebrow className="text-accent-hover">{focus.eyebrow}</Eyebrow>
        <h2 className="mt-1 font-display text-2xl uppercase leading-[0.98] tracking-tight text-foreground">{focus.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground-dim">{focus.body}</p>
        {focus.lesson && (
          <p className="mt-2 text-sm text-foreground-dim">
            Lesson for it: <b className="text-foreground">{focus.lesson.title}</b>{focus.lesson.watched ? " (watched)" : ""}.{" "}
            <Link href={focus.lesson.href} className="inline-flex min-h-11 items-center font-extrabold text-accent-hover">Open it ›</Link>
          </p>
        )}
        <ButtonLink href={focus.href} variant="secondary" size="md" block className="mt-2">{focus.cta}</ButtonLink>
        {focus.evidenceHref && <Link href={focus.evidenceHref} className="-mb-2 mt-1 flex min-h-11 items-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent-hover">See how it has gone ›</Link>}
      </Card>
    </section>
  );
}
