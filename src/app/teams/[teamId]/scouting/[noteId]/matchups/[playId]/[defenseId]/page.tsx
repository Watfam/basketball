import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Eyebrow } from "@/components/ui/card";
import { MatchupReplay } from "@/components/sim/matchup-replay";
import { RATING_LABEL, RATING_TONE } from "@/components/sim/rating";
import { cx } from "@/components/ui/cx";
import { loadMatchupContext } from "@/lib/sim/load";
import { simulateMatchup } from "@/lib/sim/engine";
import { defensesFor, groupFor, modeFor, PLAY_GROUP_LABEL, RELIABLE } from "@/lib/sim/matchup";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function MatchupDetailPage({ params }: { params: Promise<{ teamId: string; noteId: string; playId: string; defenseId: string }> }) {
  const { teamId, noteId, playId: rawPlay, defenseId: rawDefense } = await params;
  const playId = decodeURIComponent(rawPlay);
  const defenseKey = decodeURIComponent(rawDefense);
  const { opponent, doc, plays } = await loadMatchupContext(teamId, noteId);

  const play = plays.find((p) => p.id === playId);
  const group = play ? groupFor(play) : null;
  if (!play || !group) notFound();
  const defense = defensesFor(group, doc).find((d) => d.key === defenseKey);
  if (!defense) notFound();

  const { summary, replay } = simulateMatchup(play.frames, defense.model, modeFor(group), `${play.id}|${defense.key}`);
  const reliable = summary.confidence >= RELIABLE;
  const press = group === "press";

  const stats: { label: string; value: string }[] = [
    { label: "Turnover", value: pct(summary.pTurnover) },
    press ? { label: "Gets across half", value: pct(summary.pAdvance) } : { label: "Open look", value: pct(summary.pOpenLook) },
    ...(defense.model.canTrap ? [{ label: "Trapped", value: pct(summary.pTrap) }] : []),
  ];

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}/scouting/${noteId}/matchups`, label: "Matchups" }} />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-5 px-4 py-5 sm:py-8">
        <header className="space-y-1.5">
          <Eyebrow>
            {opponent} · {PLAY_GROUP_LABEL[group]}
          </Eyebrow>
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">{play.name}</h1>
          <p className="text-sm text-foreground-dim">
            against <strong className="text-foreground">{defense.label}</strong>
            {!defense.scouted && " (generic, not scouted)"}
          </p>
        </header>

        <Card className="flex items-stretch gap-4 p-4">
          <div className={cx("flex w-24 shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-3", reliable ? RATING_TONE[summary.rating] : "border-dashed border-line text-foreground-mute")}>
            <span className="font-display text-4xl leading-none tabular-nums">{reliable ? summary.score : "—"}</span>
            <span className="mt-1 text-[10px] font-extrabold uppercase tracking-wide">{reliable ? RATING_LABEL[summary.rating] : "No read"}</span>
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 self-center">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">{s.label}</dt>
                <dd className="font-display text-xl leading-tight tabular-nums text-foreground">{s.value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">Est. points</dt>
              <dd className="font-display text-xl leading-tight tabular-nums text-foreground">{summary.ppp.toFixed(2)}</dd>
            </div>
          </dl>
        </Card>

        {!reliable && (
          <p className="rounded-xl border border-line bg-raised px-3 py-2 text-xs leading-relaxed text-foreground-dim">
            Most of this play happens where their diagram doesn&apos;t show a defense, so there&apos;s no rating. The replay is still the model&apos;s best guess. Add that spot to their diagram to firm it up.
          </p>
        )}

        <MatchupReplay replay={replay} reasons={summary.reasons} />

        <p className="text-xs leading-relaxed text-foreground-mute">
          One simulated run (the typical one of 40). Their players move as the diagram shows, adjusted for the ball, screens and passing lanes; yours follow the play exactly as drawn. Estimates for ranking plays, not predictions.{" "}
          <Link href={`/teams/${teamId}/plays/${encodeURIComponent(play.id)}`} className="font-bold text-accent hover:underline">
            See the play
          </Link>
        </p>
      </main>
    </div>
  );
}
