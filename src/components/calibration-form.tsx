"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCalibrationRun } from "@/app/actions";
import { align, type Outcome } from "@/lib/basketball/calibration";
import { formatPercentage, percentage } from "@/lib/basketball/shooting";
import { readLabCalls, type LabCalls } from "@/lib/vision/lab-calls";
import { haptic } from "@/lib/haptics";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardSection } from "@/components/ui/card";
import { FormError, Input } from "@/components/ui/field";
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
  // V2 is the registered rule; V3 and V4 are trials (src/lib/vision/shotRules.ts, FALL and CROSS).
  const [rule, setRule] = useState<"v2" | "v3" | "v4">("v2");
  const [hoop, setHoop] = useState("Driveway");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Read on the phone after mount; the server never has it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setLab(readLabCalls()), []);

  const hasTrials = Boolean(lab?.calls.length && lab.calls.every((c) => c.v3));
  const hasV4 = Boolean(lab?.calls.length && lab.calls.every((c) => c.v4));
  const shown = rule === "v4" && hasV4 ? "v4" : rule === "v3" && hasTrials ? "v3" : "v2";
  const camera = useMemo(
    () => (lab?.calls ?? []).map((c) => (shown === "v4" && c.v4 ? c.v4 : shown === "v3" && c.v3 ? c.v3 : c.v2)),
    [lab, shown]
  );
  const result = useMemo(() => (truth.length && camera.length ? align(camera, truth) : null), [camera, truth]);

  if (lab === undefined) return null;

  if (!lab || lab.calls.length === 0) {
    return (
      <Card className="p-5 text-sm leading-relaxed text-foreground-dim">
        <p className="font-semibold text-foreground">No camera run to score yet.</p>
        <p className="mt-2">
          Open the detector lab, choose <strong>Our ball model</strong>, and run a saved clip (every frame) or
          the live camera. Its make and miss calls are kept on this phone and appear here.
        </p>
        <ButtonLink href="/lab/detector" block className="mt-4">
          Open the detector lab
        </ButtonLink>
      </Card>
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
        ruleVersion: shown === "v2" ? lab.ruleVersion : shown,
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
      <CardSection className="p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">The camera said</p>
        <p className="mt-1 text-sm text-foreground">
          {camera.length} shots, {camera.filter((c) => c === "make").length} makes ·{" "}
          <span className="text-foreground-dim">{lab.source}</span>
        </p>
        <p className="mt-0.5 text-[11px] text-foreground-mute">
          {new Date(lab.at).toLocaleString()} · rule {shown === "v2" ? lab.ruleVersion : `${shown} (trial)`} ·{" "}
          {lab.modelVersion}
        </p>
        {hasTrials && (
          <div className={`mt-2.5 grid gap-1 rounded-lg bg-raised p-1 ${hasV4 ? "grid-cols-3" : "grid-cols-2"}`}>
            {(hasV4 ? (["v2", "v3", "v4"] as const) : (["v2", "v3"] as const)).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setRule(v)}
                aria-pressed={rule === v}
                className={`rounded-md py-1.5 text-[11px] font-extrabold uppercase tracking-wide ${
                  rule === v ? "bg-surface text-accent shadow-sm" : "text-foreground-dim"
                }`}
              >
                {v === "v2" ? "Rule V2" : v === "v3" ? "V3 (trial)" : "V4 (trial)"}
              </button>
            ))}
          </div>
        )}
      </CardSection>

      <CardSection className="p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
            What really happened, in order
          </p>
          <p className="text-xs font-bold tabular-nums text-foreground-dim">{truth.length} shots</p>
        </div>
        <p className="mt-1 text-[11px] text-foreground-mute">Tap a dot to flip a shot you got wrong.</p>
        <div className="mt-1.5 flex min-h-7 flex-wrap">
          {truth.map((t, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Shot ${i + 1}: ${t}. Tap to change.`}
              onClick={() => {
                haptic("tap");
                setTruth((list) => list.map((x, j) => (j === i ? (x === "make" ? "miss" : "make") : x)));
              }}
              // A 28 px target around an 18 px dot: easy to hit, still a row of dots.
              className="flex h-7 w-7 items-center justify-center"
            >
              <span
                className={`h-[18px] w-[18px] rounded-full ${
                  t === "make" ? "bg-[var(--data-positive)]" : "border-2 border-foreground-mute"
                }`}
              />
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => add("miss")}
            className="rounded-xl border border-line bg-raised py-4 font-display text-2xl uppercase text-foreground-dim"
          >
            Miss
          </button>
          <button
            type="button"
            onClick={() => add("make")}
            className="rounded-xl bg-accent py-4 font-display text-2xl uppercase text-on-accent"
          >
            Make
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={truth.length === 0} onClick={() => setTruth((t) => t.slice(0, -1))}>
            Undo
          </Button>
          <Button variant="secondary" size="sm" disabled={truth.length === 0} onClick={() => setTruth([])}>
            Clear
          </Button>
          {WRITTEN_LISTS.map((w) => (
            <Button key={w.label} variant="secondary" size="sm" onClick={() => setTruth(w.results)}>
              {w.label}
            </Button>
          ))}
        </div>
      </CardSection>

      {result && (
        <CardSection className="space-y-3 border-accent! p-4">
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
                  <span className={bad ? "font-bold text-danger" : "text-[var(--data-positive)]"}>
                    {s.kind === "match" ? (bad ? "✗" : "✓") : "–"}
                  </span>
                </div>
              );
            })}
          </div>

          <Input
            value={hoop}
            onChange={(e) => setHoop(e.target.value)}
            maxLength={60}
            placeholder="Which hoop"
          />
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Notes: light, time of day, who shot"
          />
          {error && <FormError>{error}</FormError>}
          <Button onClick={save} disabled={saving} size="lg" block>
            {saving ? "Saving…" : "Save calibration"}
          </Button>
        </CardSection>
      )}
    </div>
  );
}
