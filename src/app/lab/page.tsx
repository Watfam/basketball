import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { DeleteCalibrationButton } from "@/components/delete-calibration-button";
import { RememberProfile } from "@/components/remember-profile";
import { formatPercentage, percentage } from "@/lib/basketball/shooting";

export const metadata = { title: "Camera lab" };

type Run = {
  id: string;
  created_at: string;
  hoop_label: string | null;
  rule_version: string | null;
  model_version: string | null;
  shots: number;
  agreed: number;
  camera_makes: number;
  true_makes: number;
  notes: string | null;
};

/**
 * The coach's camera lab: how accurate the camera counting is, measured,
 * and the tools to measure it. Players never see this; their screens show
 * basketball numbers only.
 */
export default async function CameraLabPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: runRows, error }, { data: firstTeam }] = await Promise.all([
    supabase
      .schema("hoops")
      .from("calibration_runs")
      .select("id, created_at, hoop_label, rule_version, model_version, shots, agreed, camera_makes, true_makes, notes")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .schema("hoops")
      .from("teams")
      .select("id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const runs = (runRows ?? []) as Run[];

  // Accuracy per counting version: a new rule or model starts a fresh line.
  const byVersion = new Map<string, { shots: number; agreed: number; runs: number }>();
  for (const r of runs) {
    const key = `${r.rule_version ?? "?"} · ${r.model_version ?? "?"}`;
    const v = byVersion.get(key) ?? { shots: 0, agreed: 0, runs: 0 };
    byVersion.set(key, { shots: v.shots + r.shots, agreed: v.agreed + r.agreed, runs: v.runs + 1 });
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Being here is coach work: make Coach the active profile. */}
      <RememberProfile profile={{ kind: "coach", teamId: firstTeam?.id ?? null }} />
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <Link
            href={firstTeam ? `/teams/${firstTeam.id}` : "/"}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← {firstTeam ? "Team" : "Home"}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-5 px-4 py-5 sm:py-8">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">Coach</p>
          <h1 className="font-display mt-1 text-3xl uppercase leading-none tracking-wide text-foreground">
            Camera lab
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-foreground-dim">
            How often the camera calls make or miss correctly, measured against written results. Run a clip or the
            live camera in the detector lab, then calibrate it here.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href="/lab/detector"
            className="rounded-2xl border border-line bg-surface px-4 py-4 text-center text-xs font-extrabold uppercase tracking-wide text-foreground"
          >
            Detector lab
          </Link>
          <Link
            href="/lab/calibrate"
            className="rounded-2xl bg-accent px-4 py-4 text-center text-xs font-extrabold uppercase tracking-wide text-white"
          >
            Calibrate
          </Link>
        </div>

        {byVersion.size > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">Accuracy</h2>
            {[...byVersion.entries()].map(([version, v]) => (
              <div key={version} className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Rule {version}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                    {v.runs} {v.runs === 1 ? "calibration" : "calibrations"} · {v.shots} shots
                  </p>
                </div>
                <p className="font-display text-3xl leading-none text-foreground">
                  {formatPercentage(percentage(v.agreed, v.shots))}
                </p>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">Calibrations</h2>
          {error ? (
            <EmptyState eyebrow="Couldn't load" title="Calibrations aren't available" subtitle={error.message} />
          ) : runs.length === 0 ? (
            <EmptyState
              eyebrow="None yet"
              title="No calibrations"
              subtitle="Shoot a set with the camera counting, write down every result, and calibrate it here."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {runs.map((r, i) => (
                <div key={r.id} className={`px-4 py-3 ${i ? "border-t border-line" : ""}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">
                      {r.agreed}/{r.shots} right · {formatPercentage(percentage(r.agreed, r.shots))}
                    </p>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                      {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-foreground-dim">
                    Camera {r.camera_makes} makes, really {r.true_makes}
                    {r.hoop_label ? ` · ${r.hoop_label}` : ""}
                  </p>
                  {r.notes && <p className="mt-0.5 text-[11px] text-foreground-mute">{r.notes}</p>}
                  <DeleteCalibrationButton id={r.id} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
