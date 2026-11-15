import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Eyebrow } from "@/components/ui/card";
import { RatingChip } from "@/components/sim/rating";
import { loadMatchupContext } from "@/lib/sim/load";
import { defenseProfile, PLAY_GROUP_LABEL, RELIABLE, reportByDefense, runGrid, type PlayGroup } from "@/lib/sim/matchup";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const GROUP_ORDER: PlayGroup[] = ["half", "blob", "slob", "press"];

export default async function MatchupsPage({ params }: { params: Promise<{ teamId: string; noteId: string }> }) {
  const { teamId, noteId } = await params;
  const { opponent, doc, plays } = await loadMatchupContext(teamId, noteId);
  const grid = runGrid(plays, doc);
  const reports = reportByDefense(grid);
  if (!grid.rows.length) notFound();

  const base = `/teams/${teamId}/scouting/${noteId}/matchups`;
  const hrefFor = (playId: string, defenseKey: string) => `${base}/${encodeURIComponent(playId)}/${encodeURIComponent(defenseKey)}`;
  const hasDrawn = GROUP_ORDER.some((g) => grid.defenses[g].some((d) => d.scouted));

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}/scouting/${noteId}`, label: opponent }} />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-8 px-4 py-5 sm:py-8">
        <header className="space-y-2">
          <Eyebrow>{opponent}</Eyebrow>
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">Matchups</h1>
          <p className="text-sm leading-relaxed text-foreground-dim">
            Every play in your playbook, run against each defense in the scouting report. The scores are the model&apos;s <strong className="text-foreground">estimates</strong>, good for ranking which plays to try, not for predicting what happens. They are only as good as the defense diagrams. Tap a score to watch it.
          </p>
          {!hasDrawn && (
            <p className="rounded-xl border border-line bg-raised px-3 py-2 text-xs leading-relaxed text-foreground-dim">
              No defenses are drawn in this report yet, so plays are only tested against generic man-to-man. Draw their zone or press in the scouting note and it shows up here.
            </p>
          )}
        </header>

        <section className="space-y-3">
          <h2 className="font-display text-xl uppercase tracking-wide text-foreground">Against each defense</h2>
          {reports.map((r) => {
            const profile = defenseProfile(grid, r.group, r.defense.key);
            const man = r.defense.key === "man" ? null : defenseProfile(grid, r.group, "man");
            const avoid = r.worst.filter((w) => !r.best.some((b) => b.play.id === w.play.id));
            return (
              <Card key={`${r.group}-${r.defense.key}`} className="space-y-3 p-4">
                <div>
                  <p className="font-display text-lg uppercase leading-none tracking-tight text-foreground">{r.defense.label}</p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-accent">
                    {PLAY_GROUP_LABEL[r.group]}
                    {!r.defense.scouted && " · not scouted"}
                  </p>
                </div>
                <div>
                  <Eyebrow className="mb-1.5">Run these</Eyebrow>
                  <ul className="space-y-1.5">
                    {r.best.map((e) => (
                      <li key={e.play.id}>
                        <Link href={hrefFor(e.play.id, r.defense.key)} className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 hover:bg-raised">
                          <span className="min-w-0 truncate text-sm font-bold text-foreground">{e.play.name}</span>
                          <RatingChip rating={e.summary.rating} score={e.summary.score} reliable />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                {avoid.length > 0 && (
                  <div>
                    <Eyebrow className="mb-1.5">Skip these</Eyebrow>
                    <ul className="space-y-1.5">
                      {avoid.map((e) => (
                        <li key={e.play.id}>
                          <Link href={hrefFor(e.play.id, r.defense.key)} className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 hover:bg-raised">
                            <span className="min-w-0 truncate text-sm font-bold text-foreground">{e.play.name}</span>
                            <RatingChip rating={e.summary.rating} score={e.summary.score} reliable />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {profile && (
                  <p className="text-xs leading-relaxed text-foreground-dim">
                    {r.group === "press" ? (
                      <>
                        Across the plays tested, the ball gets across half court <strong className="text-foreground">{pct(profile.advance)}</strong> of the time and is turned over <strong className="text-foreground">{pct(profile.turnover)}</strong>.
                      </>
                    ) : (
                      <>
                        Across the plays tested, it forces a turnover on <strong className="text-foreground">{pct(profile.turnover)}</strong> of possessions and leaves a shooter open on <strong className="text-foreground">{pct(profile.openLook)}</strong>
                        {man ? ` (generic man: ${pct(man.turnover)} and ${pct(man.openLook)})` : ""}.
                      </>
                    )}
                  </p>
                )}
              </Card>
            );
          })}
        </section>

        {GROUP_ORDER.map((group) => {
          const defs = grid.defenses[group];
          const rows = grid.rows
            .filter((r) => r.group === group)
            .map((r) => {
              const ok = r.cells.filter((c) => c.summary.confidence >= RELIABLE);
              const avg = ok.length ? ok.reduce((a, c) => a + c.summary.ppp, 0) / ok.length : -Infinity;
              return { r, avg };
            })
            .sort((a, b) => b.avg - a.avg)
            .map((x) => x.r);
          if (!rows.length) return null;
          return (
            <section key={group} className="space-y-3">
              <h2 className="font-display text-xl uppercase tracking-wide text-foreground">{PLAY_GROUP_LABEL[group]}</h2>
              <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">Play</th>
                      {defs.map((d) => (
                        <th key={d.key} className="w-20 px-1 py-2 text-center text-[10px] font-extrabold uppercase leading-tight tracking-wide text-foreground-mute">
                          {d.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.play.id} className="border-b border-line last:border-b-0">
                        <td className="px-3 py-2">
                          <p className="text-sm font-bold leading-tight text-foreground">{r.play.name}</p>
                          <p className="text-[11px] text-foreground-mute">{r.play.vs}</p>
                        </td>
                        {r.cells.map((c) => (
                          <td key={c.defenseKey} className="px-1 py-2 text-center">
                            <Link href={hrefFor(r.play.id, c.defenseKey)} aria-label={`${r.play.name} against ${defs.find((d) => d.key === c.defenseKey)?.label}`} className="inline-block">
                              <RatingChip rating={c.summary.rating} score={c.summary.score} reliable={c.summary.confidence >= RELIABLE} />
                            </Link>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <p className="text-xs leading-relaxed text-foreground-mute">
          How it works: your play runs on a fixed clock, and the defense reacts the way the scouting diagrams show, adjusted for the ball, screens and passing lanes, across 40 slightly different runs. Scores run 0–100 (higher is better for your offense) and compare plays against each other. &ldquo;No read&rdquo; means most of that play happens somewhere their diagram doesn&apos;t cover.
        </p>
      </main>
    </div>
  );
}
