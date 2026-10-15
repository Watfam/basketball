// Phase 10: confirms that nothing that detects or counts a shot changed. Compared byte for byte against the end of Phase 9.
//   node verify-production-unchanged.mjs [base-commit]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT } from "../../lib/registry.mjs";
const base = process.argv[2] ?? "8db1515";
const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1 << 28 });
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

// Must be byte-identical: detection, rules, the camera screen, shot adding/summing, goals, the frozen evaluation inputs.
const strictPaths = ["src/lib/vision", "public", "training/eval/thresholds.json", "training/eval/reports/baseline-v0.json", "training/eval/datasets.json", "training/eval/datasets.lock.json", "src/components/camera-stage.tsx", "src/lib/basketball/shooting.ts", "src/lib/basketball/goals.ts"];
const strict = git("ls-tree", "-r", "--name-only", base, "--", ...strictPaths).toString().trim().split("\n").filter((f) => f && !f.startsWith("public/_"));
const rows = strict.map((f) => { const p = path.join(ROOT, f); return { file: f, same: fs.existsSync(p) && sha(git("show", `${base}:${f}`)) === sha(fs.readFileSync(p)) }; });
const changed = rows.filter((r) => !r.same);

// Touched on purpose: listed so the change is visible, and reviewed by hand (see REPORT.md).
const touched = git("diff", "--name-only", base, "--", "src/components/shooting-hub.tsx", "src/lib/basketball/shot-draft.ts", "src/lib/basketball/activity-server.ts").toString().trim().split("\n").filter(Boolean);
const hub = git("diff", base, "--", "src/components/shooting-hub.tsx").toString().split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
const countingLines = /onCameraShot|useCameraCounter|liveCall|addShot|runSync|syncShotSession|toggleShot|undoLastShot|camera\.start|camera\.stop/;
const hubCountingRemoved = hub.filter((l) => countingLines.test(l));

const out = {
  base, strict_files_compared: rows.length, strict_files_changed: changed.map((r) => r.file),
  production_counting_files_unchanged: changed.length === 0,
  touched_on_purpose: touched, hub_removed_lines: hub.length, hub_removed_lines_touching_counting: hubCountingRemoved,
  checked_at: new Date().toISOString(),
};
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "production-unchanged.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
process.exit(changed.length || hubCountingRemoved.length ? 1 : 0);
