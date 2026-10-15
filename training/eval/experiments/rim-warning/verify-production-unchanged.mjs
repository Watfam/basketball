// Confirms that the production counting pipeline and the frozen evaluation inputs are byte-identical to a base commit (default: the end of Phase 8).
//   node verify-production-unchanged.mjs [base-commit]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT } from "../../lib/registry.mjs";
const base = process.argv[2] ?? "ba5b979";
const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1 << 28 });
const watched = git("ls-tree", "-r", "--name-only", base, "--", "src/lib/vision", "src/lib/basketball", "public", "training/eval/thresholds.json", "training/eval/reports/baseline-v0.json", "training/eval/datasets.json", "training/eval/datasets.lock.json", "src/components/camera-stage.tsx", "src/components/shooting-hub.tsx").toString().trim().split("\n").filter((f) => !f.startsWith("public/_"));
const rows = [];
for (const f of watched) {
  const inBase = crypto.createHash("sha256").update(git("show", `${base}:${f}`)).digest("hex");
  const p = path.join(ROOT, f), now = fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : null;
  rows.push({ file: f, same: inBase === now });
}
// replay-store.ts gained one read-only function in Phase 8, before this base; everything here is compared against the base itself.
const changed = rows.filter((r) => !r.same);
const out = { base, compared: rows.length, changed: changed.map((r) => r.file), production_counting_files_unchanged: changed.length === 0, checked_at: new Date().toISOString() };
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "production-unchanged.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
process.exit(changed.length ? 1 : 0);
