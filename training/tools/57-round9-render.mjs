// Round nine: merges the below-net black-ball positives (56-round9-below-net.mjs) into round eight's dataset
// (dataset16) -> dataset17 / dataset_v9.zip.
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const ROOT = `${REPO}/Training Video`, WORK = `${REPO}/training/work/round9`;
const BASE = `${ROOT}/dataset16`, MERGED = `${ROOT}/dataset17`;
const oldJ = ["train", "val", "test"].map((s) => JSON.parse(fs.readFileSync(`${BASE}/${s}.json`, "utf8")));
let nextImg = Math.max(...oldJ.flatMap((j) => j.images.map((i) => i.id))) + 1;
let nextAnn = Math.max(0, ...oldJ.flatMap((j) => j.annotations.map((a) => a.id))) + 1;
for (const d of ["train", "val", "test"]) fs.mkdirSync(`${MERGED}/${d}`, { recursive: true });

const sets = { train: { images: [], annotations: [] }, val: { images: [], annotations: [] }, test: { images: [], annotations: [] } };
const setOf = (i, n) => { const u = i / n; return u < 0.7 ? "train" : u < 0.85 ? "val" : "test"; };

const manifest = JSON.parse(fs.readFileSync(`${WORK}/positives-manifest.json`, "utf8"));
manifest.forEach((m, i) => {
  const set = setOf(i, manifest.length), dst = `${MERGED}/${set}/${m.file}`;
  fs.copyFileSync(`${WORK}/positives/${m.file}`, dst);
  sets[set].images.push({ id: nextImg, file_name: m.file, width: 416, height: 416, source: "4915-below-net" });
  sets[set].annotations.push({ id: nextAnn++, image_id: nextImg, category_id: 1, bbox: m.bbox, area: +(m.bbox[2] * m.bbox[3]).toFixed(1), iscrowd: 0 });
  nextImg++;
});
console.log("below-net positives added:", manifest.length);

const merged = {};
["train", "val", "test"].forEach((s, si) => {
  for (const im of oldJ[si].images) { const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${BASE}/${s}/${im.file_name}`, dst); }
  merged[s] = { images: [...oldJ[si].images, ...sets[s].images], annotations: [...oldJ[si].annotations, ...sets[s].annotations], categories: [{ id: 1, name: "ball" }] };
  fs.writeFileSync(`${MERGED}/${s}.json`, JSON.stringify(merged[s]));
});
for (const s of ["train", "val", "test"]) console.log(`MERGED ${s}: ${merged[s].images.length} pictures, ${merged[s].annotations.length} with a ball`);
console.log("DONE");
