// Copies the ONNX Runtime Web files the browser has to fetch into public/ort.
//
// They are served as plain static files rather than bundled: the bundler
// mangles the runtime's dynamic worker and wasm loading, and it keeps
// ~80 MB of variants (only a few of which any one phone uses) out of the
// app bundle. The output is generated, git-ignored, and rebuilt on every
// install, so a version bump can never leave stale runtime files behind.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "onnxruntime-web", "dist");
const to = join(root, "public", "ort");

// webgpu: the WebGPU entry point loads the asyncify build (checked against
//   the entry point's own references; the JSPI variants belong to a
//   different entry point and would add 16 MB nothing loads).
// wasm: the CPU fallback if WebGPU is unavailable.
const files = [
  "ort.webgpu.min.mjs",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort.wasm.min.mjs",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];

if (!existsSync(from)) {
  console.log("copy-ort: onnxruntime-web not installed yet, skipping");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const f of files) {
  if (!existsSync(join(from, f))) {
    console.error(`copy-ort: expected ${f} in onnxruntime-web/dist but it is missing`);
    process.exit(1);
  }
  copyFileSync(join(from, f), join(to, f));
}
console.log(`copy-ort: copied ${files.length} runtime files to public/ort`);
