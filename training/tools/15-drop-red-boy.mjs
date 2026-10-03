// Removes chalk-clip (IMG_4826) no-ball pictures that contain the boy in the red shirt, writing a
// cleaned copy of the dataset. By eye, most of those pictures hold a ball in his hands or against
// his shirt, and a ball held against a red shirt cannot be told from the shirt by colour, so the
// safe rule is to drop every picture he appears in. Pictures of the other person alone or of an
// empty hoop stay. Same red test as 14-review-red-boy.mjs.
//
//   node 15-drop-red-boy.mjs <dataset dir> <out dir> [min red px=300]
import fs from "node:fs";
import jpeg from "jpeg-js";

const [, , SRC_DIR, OUT_DIR, MINARG = "300"] = process.argv, MIN = Number(MINARG), n = 416;
const deepRed = (r, g, b) => r > 105 && g < 0.5 * r && b < 0.65 * r && r - g > 55;
const redCount = px => { let c = 0; for (let i = 0; i < n * n; i++) { const q = i * 4; if (deepRed(px.data[q], px.data[q + 1], px.data[q + 2])) c++; } return c; };

for (const split of ["train", "val", "test"]) fs.mkdirSync(`${OUT_DIR}/${split}`, { recursive: true });
const dropped = {}, kept = {};
for (const split of ["train", "val", "test"]) {
  const j = JSON.parse(fs.readFileSync(`${SRC_DIR}/${split}.json`, "utf8"));
  const withBall = new Set(j.annotations.map(a => a.image_id));
  const images = [];
  for (const im of j.images) {
    const risky = im.source === "4826" && !withBall.has(im.id) && redCount(jpeg.decode(fs.readFileSync(`${SRC_DIR}/${split}/${im.file_name}`), { useTArray: true })) >= MIN;
    if (risky) { dropped[split] = (dropped[split] || 0) + 1; continue; }
    kept[split] = kept[split] || { pictures: 0, noBall: 0 };
    kept[split].pictures++; if (!withBall.has(im.id)) kept[split].noBall++;
    const dst = `${OUT_DIR}/${split}/${im.file_name}`;
    if (!fs.existsSync(dst)) fs.linkSync(`${SRC_DIR}/${split}/${im.file_name}`, dst);
    images.push(im);
  }
  const ids = new Set(images.map(i => i.id));
  fs.writeFileSync(`${OUT_DIR}/${split}.json`, JSON.stringify({ images, annotations: j.annotations.filter(a => ids.has(a.image_id)), categories: j.categories }));
}
console.log("dropped (the red boy in view):", JSON.stringify(dropped));
console.log("kept:", JSON.stringify(kept));
