"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCalibrationRun } from "@/app/actions";
import { align, type Outcome } from "@/lib/basketball/calibration";
import { formatPercentage, percentage } from "@/lib/basketball/shooting";
import { readLabCalls, type LabCalls } from "@/lib/vision/lab-calls";
import { haptic } from "@/lib/haptics";
import exam4839 from "../../training/labels/IMG_4839-truth.json";
import exam4840 from "../../training/labels/IMG_4840-truth.json";

/** Matt's written lists for the exam clips, so a lab run of either can be scored in one tap. */
const WRITTEN_LISTS: { label: string; results: Outcome[] }[] = [
  { label: "IMG_4839 list", results: exam4839.results as Outcome[] },
  { label: "IMG_4840 list", results: exam4840.results as Outcome[] },
];

/**
 * Calibration: the camera's calls from the last Camera lab run, set
 * against what really happened, written down in order. Scored with the
 * same matching as the offline exams (src/lib/basketball/calibration.ts).
 */
export function CalibrationForm() {
  const router = useRouter();
  const [lab, setLab] = useState<LabCalls | null | undefined>(undefined);
  const [truth, setTruth] = useState<Outcome[]>([]);
  const [hoop, setHoop] = useState("Driveway");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Read on the phone after mount; the server never has it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setLab(readLabCalls()), []);

  const camera = useMemo(() => (lab?.calls ?? []).map((c) => c.v2), [lab]);
  const result = useMemo(() => (truth.length && camera.length ? align(camera, truth) : null), [camera, truth]);

  if (lab === undefined) return null;

  if (!lab || lab.calls.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 text-sm leading-relaxed text-foreground-dim">
        <p className="font-semibold text-foreground">No camera run to score yet.</p>
        <p className="mt-2">
          Open the detector lab, choose <strong>Our ball model</strong>, and run a saved clip (every frame) or
          the live camera. Its make and miss calls are kept on this phone and appear here.
        </p>
        <Link
          href="/lab/detector"
          className="mt-4 block rounded-xl bg-accent py-3 text-center text-xs font-extrabold uppercase tracking-wide text-white"
        >
          Open the detector lab
        </Link>
      </div>
    );
  }

  const add = (o: Outcome) => {
    haptic("tap");
    setTruth((t) => [...t, o]);
  };

  function save() {
    if (!result || !lab) return;
    setError(null);
    startSaving(async () => {
      const res = await saveCalibrationRun({
        source: `${lab.source}${result.method === "aligned" ? ", lined up (flatters the camera)" : ""}`,
        hoopLabel: hoop,
        ruleVersion: lab.ruleVersion,
        modelVersion: lab.modelVersion,
        shots: result.shots,
        agreed: result.agreed,
        cameraMakes: result.cameraMakes,
        trueMakes: result.trueMakes,
        perShot: result.perShot.map((s) =>
          s.kind === "match"
            ? { ...s, flagged: lab.calls[s.cameraIndex]?.flagged ?? false }
            : s.kind === "extra"
              ? { ...s, flagged: lab.calls[s.cameraIndex]?.flagged ?? false }
              : s
        ),
        notes: notes || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      haptic("success");
      router.push("/lab");
    });
  }

  const wrong = result?.perShot.filter((s) => s.kind === "match" && s.camera !== s.truth) ?? [];
  const wrongFlagged = wrong.filter((s) => s.kind === "match" && lab.calls[s.cameraIndex]?.flagged).length;
  const flaggedCount = lab.calls.filter((c) => c.flagged).length;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">The camera said</p>
        <p className="mt-1 text-sm text-foreground">
          {camera.length} shots, {camera.filter((c) => c === "make").length} makes ·{" "}
          <span className="text-foreground-dim">{lab.source}</span>
        </p>
        <p className="mt-0.5 text-[11px] text-foreground-mute">
          {new Date(lab.at).toLocaleString()} · rule {lab.ruleVersion} · {lab.modelVersion}
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
            What really happened, in order
          </p>
          <p className="text-xs font-bold tabular-nums text-foreground-dim">{truth.length} shots</p>
        </div>
        <div className="mt-2 flex min-h-6 flex-wrap gap-1">
          {truth.map((t, i) => (
            <span
              key={i}
              title={`Shot ${i + 1}: ${t}`}
              className={`h-4 w-4 rounded-full ${t === "make" ? "bg-[var(--data-positive)]" : "border-2 border-foreground-mute"}`}
            />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => add("miss")}
            className="rounded-xl border border-line bg-[var(--raised)] py-4 font-display text-2xl uppercase text-foreground-dim"
          >
            Miss
          </button>
          <button
            type="button"
            onClick={() => add("make")}
            className="rounded-xl bg-accent py-4 font-display text-2xl uppercase text-white"
          >
            Make
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={truth.length === 0}
            onClick={() => setTruth((t) => t.slice(0, -1))}
            className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-extrabold uppercase text-foreground-dim disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={truth.length === 0}
            onClick={() => setTruth([])}
            className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-extrabold uppercase text-foreground-dim disabled:opacity-40"
          >
            Clear
          </button>
          {WRITTEN_LISTS.map((w) => (
            <button
              key={w.label}
              type="button"
              onClick={() => setTruth(w.results)}
              className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-extrabold uppercase text-foreground-dim"
            >
              {w.label}
            </button>
          ))}
        </div>
      </section>

      {result && (
        <section className="space-y-3 rounded-2xl border border-accent bg-surface p-4">
          <div className="flex items-end gap-3">
            <p className="font-display text-5xl leading-none text-foreground">
              {formatPercentage(percentage(result.agreed, result.shots))}
            </p>
            <p className="pb-1 text-sm font-semibold text-foreground-dim">
              right on {result.agreed} of {result.shots} shots
            </p>
          </div>
          <p className="text-xs leading-relaxed text-foreground-dim">
            Camera {result.cameraMakes} makes, really {result.trueMakes}.
            {result.method === "aligned"
              ? ` The lists differ in length (${result.extra} counted that weren't shots, ${result.unseen} shots never counted), so they were lined up to agree as well as possible, which flatters the camera a little.`
              : " Same number of shots, matched one to one."}
          </p>
          <p className="text-xs leading-relaxed text-foreground-dim">
            Worth a look: {flaggedCount} of {camera.length} shots flagged
            {wrong.length > 0 ? `, catching ${wrongFlagged} of the ${wrong.length} wrong calls` : ""}.
          </p>

          <div className="overflow-hidden rounded-xl border border-line">
            {result.perShot.map((s, i) => {
              const flagged = s.kind !== "unseen" && lab.calls[s.cameraIndex]?.flagged;
              const bad = s.kind === "match" && s.camera !== s.truth;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between px-3 py-1.5 text-xs ${i ? "border-t border-line" : ""} ${
                    bad ? "bg-red-500/10" : ""
                  }`}
                >
                  <span className="tabular-nums text-foreground-mute">
                    {s.kind === "unseen" ? `Shot ${s.truthIndex + 1}` : s.kind === "extra" ? "Extra" : `Shot ${s.truthIndex + 1}`}
                  </span>
                  <span className="text-foreground">
                    {s.kind === "unseen"
                      ? `never counted (was a ${s.truth})`
                      : s.kind === "extra"
                        ? `camera counted a ${s.camera} that wasn't a shot`
                        : `camera ${s.camera}, really ${s.truth}`}
                    {flagged ? " · flagged" : ""}
                  </span>
                  <span className={bad ? "font-bold text-red-400" : "text-[var(--data-positive)]"}>
                    {s.kind === "match" ? (bad ? "✗" : "✓") : "–"}
                  </span>
                </div>
              );
            })}
          </div>

          <input
            value={hoop}
            onChange={(e) => setHoop(e.target.value)}
            maxLength={60}
            placeholder="Which hoop"
            className="w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2.5 text-sm text-foreground"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Notes: light, time of day, who shot"
            className="w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2.5 text-sm text-foreground"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save calibration"}
          </button>
        </section>
      )}
    </div>
  );
}
