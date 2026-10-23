// Round eight: merges the rim-hardware hard negatives (53-round8-hard-negatives.mjs) and the orange hard positives
// (54-round8-hard-positives.mjs) into round seven's dataset (dataset15) -> dataset16 / dataset_v8.zip.
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const ROOT = `${REPO}/Training Video`, WORK = `${REPO}/training/work/round8`;
const BASE = `${ROOT}/dataset15`, MERGED = `${ROOT}/dataset16`;
const oldJ = ["train", "val", "test"].map((s) => JSON.parse(fs.readFileSync(`${BASE}/${s}.json`, "utf8")));
let nextImg = Math.max(...oldJ.flatMap((j) => j.images.map((i) => i.id))) + 1;
let nextAnn = Math.max(0, ...oldJ.flatMap((j) => j.annotations.map((a) => a.id))) + 1;
for (const d of ["train", "val", "test"]) fs.mkdirSync(`${MERGED}/${d}`, { recursive: true });

const sets = { train: { images: [], annotations: [] }, val: { images: [], annotations: [] }, test: { images: [], annotations: [] } };
const setOf = (i, n) => { const u = i / n; return u < 0.7 ? "train" : u < 0.85 ? "val" : "test"; };

// Negatives: no annotation, a picture only.
const negManifest = JSON.parse(fs.readFileSync(`${WORK}/negatives/IMG_4873-manifest.json`, "utf8"));
negManifest.forEach((m, i) => {
  const set = setOf(i, negManifest.length), dst = `${MERGED}/${set}/${m.file}`;
  fs.copyFileSync(`${WORK}/negatives/IMG_4873/${m.file}`, dst);
  sets[set].images.push({ id: nextImg, file_name: m.file, width: 416, height: 416, source: "4873-phantom-negative" });
  nextImg++;
});
console.log("negatives added:", negManifest.length);

// Positives: one annotation each.
const posManifest = JSON.parse(fs.readFileSync(`${WORK}/positives/IMG_4873-manifest.json`, "utf8"));
posManifest.forEach((m, i) => {
  const set = setOf(i, posManifest.length), dst = `${MERGED}/${set}/${m.file}`;
  fs.copyFileSync(`${WORK}/positives/IMG_4873/${m.file}`, dst);
  sets[set].images.push({ id: nextImg, file_name: m.file, width: 416, height: 416, source: "4873-hard-positive" });
  sets[set].annotations.push({ id: nextAnn++, image_id: nextImg, category_id: 1, bbox: m.bbox, area: +(m.bbox[2] * m.bbox[3]).toFixed(1), iscrowd: 0 });
  nextImg++;
});
console.log("positives added:", posManifest.length);

const merged = {};
["train", "val", "test"].forEach((s, si) => {
  for (const im of oldJ[si].images) { const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${BASE}/${s}/${im.file_name}`, dst); }
  merged[s] = { images: [...oldJ[si].images, ...sets[s].images], annotations: [...oldJ[si].annotations, ...sets[s].annotations], categories: [{ id: 1, name: "ball" }] };
  fs.writeFileSync(`${MERGED}/${s}.json`, JSON.stringify(merged[s]));
});
for (const s of ["train", "val", "test"]) console.log(`MERGED ${s}: ${merged[s].images.length} pictures, ${merged[s].annotations.length} with a ball`);
console.log("DONE");
