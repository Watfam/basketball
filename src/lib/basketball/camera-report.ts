import type { Draft } from "./shot-draft.ts";

/**
 * How a camera set went, from its shots and the camera's own stats: kept with the saved set (when the database has the
 * column for it) and also pasted by hand from the review screen. The measurements the camera was tuned on come from
 * real sets, so this is what makes real sets measurable without asking anyone to remember.
 */
export type CameraReport = {
  ruleVersion: string;
  modelVersion: string;
  build: string;
  camShots: number;
  handAdded: number;
  ringed: number;
  reasons: Record<string, number>;
  /** Camera calls the player changed in review. */
  changed: number;
  avgFps: number | null;
  minFps: number | null;
  slowSeen: boolean | null;
  scale: number | null;
  ballWidth: number | null;
  aim: string | null;
  phone: string;
};

type Context = { ruleVersion: string; modelVersion: string; build: string; aim: string | null; phone: string };

export function buildCameraReport(d: Pick<Draft, "shots" | "cameraStats">, ctx: Context): CameraReport {
  const cam = d.shots.filter((s) => s.source === "camera");
  const ringed = cam.filter((s) => s.flagged);
  const reasons: Record<string, number> = {};
  for (const s of ringed) for (const r of s.flagReasons ?? []) reasons[r] = (reasons[r] ?? 0) + 1;
  const st = d.cameraStats;
  return {
    ruleVersion: ctx.ruleVersion,
    modelVersion: ctx.modelVersion,
    build: ctx.build,
    camShots: cam.length,
    handAdded: d.shots.length - cam.length,
    ringed: ringed.length,
    reasons,
    changed: cam.filter((s) => s.detectedMade !== null && s.detectedMade !== s.made).length,
    avgFps: st ? st.avgFps : null,
    minFps: st ? st.minFps : null,
    slowSeen: st ? st.slowSeen : null,
    scale: st?.scale ?? null,
    ballWidth: st?.ballWidth ?? null,
    aim: ctx.aim,
    phone: ctx.phone.slice(0, 90),
  };
}

/** The pasteable text form. `makes` and `shots` are the set's own totals. */
export function formatCameraReport(r: CameraReport, totals: { shots: number; makes: number }): string {
  const pct = r.camShots ? Math.round((100 * r.ringed) / r.camShots) : 0;
  return [
    `Camera report: rule ${r.ruleVersion}, model ${r.modelVersion}, build ${r.build}`,
    `Set: ${totals.shots} shots, ${totals.makes} makes (${r.camShots} counted by the camera, ${r.handAdded} added by hand)`,
    `Ringed unsure: ${r.ringed} of ${r.camShots} (${pct}%); reasons ${JSON.stringify(r.reasons)}`,
    `Calls changed in review: ${r.changed}`,
    r.avgFps !== null && r.minFps !== null
      ? `Speed: average ${r.avgFps.toFixed(1)} fps, slowest ${r.minFps.toFixed(1)}, slow warning ${r.slowSeen ? "yes" : "no"}; size x${r.scale?.toFixed(2) ?? "?"} (ball ${r.ballWidth?.toFixed(1) ?? "?"} px)`
      : "Speed: not recorded",
    `Aim: ${r.aim || "not saved"}`,
    `Phone: ${r.phone || "?"}`,
  ].join("\n");
}
