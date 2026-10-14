// Decodes a clip's hoop window exactly the way tools/22-dump-detections.mjs does (30 s pieces, fps=30000/1001, crop, scale),
// so frame numbers here are the dump's frame numbers and line up with every saved detection file. The README warns that
// numbering drifts slightly on long clips: the piece-wise count is the reference, not the container's frame index.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT } from "./registry.mjs";

export const SIZE = 416;
export const PIECE = 30;
export const FPS = 30000 / 1001;
const FB = SIZE * SIZE * 3;

export function clipPath(clip) {
  return path.join(ROOT, clip.file);
}

export function duration(file) {
  return Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).stdout.toString());
}

const vf = (w) => `fps=30000/1001,crop=${w.cropSize}:${w.cropSize}:${w.cropX}:${w.cropY}${w.cropSize === SIZE ? "" : `,scale=${SIZE}:${SIZE}`}`;

/** Yields { n, rgb } for every frame of the 416 px model-input window, numbered as the dump tool numbers them. */
export function* windowFrames(clip) {
  const file = clipPath(clip);
  const dur = duration(file);
  let base = 0;
  for (let s = 0; s < dur; s += PIECE) {
    const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(s), "-t", String(PIECE), "-i", file, "-an", "-vf", vf(clip.window), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1024 * 1024 * 1024 });
    const n = Math.floor(r.stdout.length / FB);
    for (let i = 0; i < n; i += 1) yield { n: base + i, rgb: r.stdout.subarray(i * FB, (i + 1) * FB), piece: s, local: i };
    base += n;
  }
}

/** The same frames at native resolution (the window cut at its own size, not scaled), for the chosen frame numbers only. */
export function nativeFrames(clip, wanted, pieceStarts) {
  // pieceStarts: Map(frame number -> { piece, local }) recorded while walking windowFrames.
  const file = clipPath(clip);
  const w = clip.window;
  const out = new Map();
  const byPiece = new Map();
  for (const n of wanted) {
    const p = pieceStarts.get(n);
    if (!p) continue;
    if (!byPiece.has(p.piece)) byPiece.set(p.piece, []);
    byPiece.get(p.piece).push({ n, local: p.local });
  }
  for (const [piece, list] of byPiece) {
    list.sort((a, b) => a.local - b.local);
    const sel = list.map((x) => `eq(n\\,${x.local})`).join("+");
    const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(piece), "-t", String(PIECE), "-i", file, "-an", "-vf", `fps=30000/1001,select='${sel}',crop=${w.cropSize}:${w.cropSize}:${w.cropX}:${w.cropY}`, "-vsync", "vfr", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1024 * 1024 * 1024 });
    const fb = w.cropSize * w.cropSize * 3;
    list.forEach((x, i) => {
      if ((i + 1) * fb <= r.stdout.length) out.set(x.n, r.stdout.subarray(i * fb, (i + 1) * fb));
    });
  }
  return out;
}
