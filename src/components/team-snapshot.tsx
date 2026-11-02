import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Card, Eyebrow } from "@/components/ui/card";
import type { TeamRecord } from "@/lib/basketball/today";

export type SnapshotPlayer = { id: string; name: string; shotThisWeek: boolean };

/**
 * The thing this hub should actually tell a coach that's new each time they
 * open it: the record so far, and who on the roster has (and hasn't)
 * picked up a ball to log shooting this week. Each linked player's season
 * detail already lives on their own roster row below — this is the quick,
 * no-scrolling glance above it.
 */
export function TeamSnapshot({ record, players }: { record: TeamRecord; players: SnapshotPlayer[] }) {
  if (record.played === 0 && players.length === 0) return null;

  return (
    <Card className="space-y-3 p-4">
      {record.played > 0 && (
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl leading-none text-foreground">
            {record.wins}-{record.losses}
            {record.ties > 0 ? `-${record.ties}` : ""}
          </span>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim">
            this season
          </span>
        </div>
      )}

      {players.length > 0 && (
        <div>
          <Eyebrow>Shooting this week</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {players.map((p) => (
              <Link key={p.id} href={`/players/${p.id}/shooting?from=coach`} className="flex flex-col items-center gap-1" title={p.name}>
                <span className={`rounded-full ${p.shotThisWeek ? "ring-2 ring-accent" : "opacity-40"}`}>
                  <Avatar id={p.id} name={p.name} size={36} />
                </span>
                <span className="max-w-11 truncate text-[10px] font-bold text-foreground-mute">{p.name.split(" ")[0]}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
