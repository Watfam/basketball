// Round ten: merges hard-positive recall gaps mined from the six previously-untouched frozen clips (IMG_4839, IMG_4840,
// IMG_4851, IMG_4866, IMG_4867, IMG_4874 — found with the same 54-round8-hard-positives.mjs miner used on IMG_4873 in
// round eight, re-run against each clip's own dets9-*.json so "already found" means "found by ball-9") into round nine's
// dataset (dataset17) -> dataset18 / dataset_v10.zip.
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const ROOT = `${REPO}/Training Video`, WORK = `${REPO}/training/work/round8`;
const BASE = `${ROOT}/dataset17`, MERGED = `${ROOT}/dataset18`;
const CLIPS = ["IMG_4839", "IMG_4840", "IMG_4851", "IMG_4866", "IMG_4867", "IMG_4874"];
const oldJ = ["train", "val", "test"].map((s) => JSON.parse(fs.readFileSync(`${BASE}/${s}.json`, "utf8")));
let nextImg = Math.max(...oldJ.flatMap((j) => j.images.map((i) => i.id))) + 1;
let nextAnn = Math.max(0, ...oldJ.flatMap((j) => j.annotations.map((a) => a.id))) + 1;
for (const d of ["train", "val", "test"]) fs.mkdirSync(`${MERGED}/${d}`, { recursive: true });

const sets = { train: { images: [], annotations: [] }, val: { images: [], annotations: [] }, test: { images: [], annotations: [] } };
const setOf = (i, n) => { const u = i / n; return u < 0.7 ? "train" : u < 0.85 ? "val" : "test"; };

let totalAdded = 0;
for (const id of CLIPS) {
  const manifest = JSON.parse(fs.readFileSync(`${WORK}/positives/${id}-manifest.json`, "utf8"));
  manifest.forEach((m, i) => {
    const set = setOf(i, manifest.length), dst = `${MERGED}/${set}/${m.file}`;
    fs.copyFileSync(`${WORK}/positives/${id}/${m.file}`, dst);
    sets[set].images.push({ id: nextImg, file_name: m.file, width: 416, height: 416, source: `${id}-hard-positive` });
    sets[set].annotations.push({ id: nextAnn++, image_id: nextImg, category_id: 1, bbox: m.bbox, area: +(m.bbox[2] * m.bbox[3]).toFixed(1), iscrowd: 0 });
    nextImg++;
  });
  console.log(id, "hard positives added:", manifest.length);
  totalAdded += manifest.length;
}
console.log("TOTAL hard positives added:", totalAdded);

const merged = {};
["train", "val", "test"].forEach((s, si) => {
  for (const im of oldJ[si].images) { const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${BASE}/${s}/${im.file_name}`, dst); }
  merged[s] = { images: [...oldJ[si].images, ...sets[s].images], annotations: [...oldJ[si].annotations, ...sets[s].annotations], categories: [{ id: 1, name: "ball" }] };
  fs.writeFileSync(`${MERGED}/${s}.json`, JSON.stringify(merged[s]));
});
for (const s of ["train", "val", "test"]) console.log(`MERGED ${s}: ${merged[s].images.length} pictures, ${merged[s].annotations.length} with a ball`);
console.log("DONE");
