// Two people shot at once in IMG_4825, so many ball pictures show a second ball that has no box.
// That teaches the model that a ball can be background. This drops every IMG_4825 ball picture in
// which the motion scan tracked ANOTHER ball-like blob more than MINDIST native pixels away from the
// boxed one in the same frame. Balls that are only held or resting are not found this way.
//
//   node 16-drop-second-ball.mjs <dataset dir> <out dir> [min distance px=45]
import fs from "node:fs";

const [, , SRC_DIR, OUT_DIR, DISTARG = "45"] = process.argv, MINDIST = Number(DISTARG);
const REPO = new URL("../..", import.meta.url).pathname;
const boxes = JSON.parse(fs.readFileSync(`${REPO}training/labels/IMG_4825-ball-boxes.json`, "utf8"));
const [offX, offY] = [boxes.rim[0] - 300, boxes.rim[1] - 300];
const centre = new Map(boxes.frames.map(f => [f.f, [offX + (f.box[0] + f.box[2]) / 2, offY + (f.box[1] + f.box[3]) / 2]]));

// every ball-like blob tracked anywhere in the clip, by frame, in native pixels
const others = new Map();
for (const file of ["mtracks-4825.json", "tracks-4825.json"]) {
  const T = JSON.parse(fs.readFileSync(`${REPO}training/work/${file}`, "utf8"));
  for (const t of T.tracks) for (const p of t.pts) {
    if (!others.has(p[0])) others.set(p[0], []);
    others.get(p[0]).push([T.cropX + 2 * p[2], T.cropY + 2 * p[3]]);
  }
}
const hasSecond = frame => {
  const c = centre.get(frame); if (!c) return false;
  // a blob close to the boxed ball is the same ball seen by another scan; far away is a second ball
  return (others.get(frame) || []).some(([x, y]) => Math.hypot(x - c[0], y - c[1]) > MINDIST);
};

for (const split of ["train", "val", "test"]) fs.mkdirSync(`${OUT_DIR}/${split}`, { recursive: true });
const dropped = {}, kept = {};
for (const split of ["train", "val", "test"]) {
  const j = JSON.parse(fs.readFileSync(`${SRC_DIR}/${split}.json`, "utf8"));
  const withBall = new Set(j.annotations.map(a => a.image_id));
  const images = [];
  for (const im of j.images) {
    if (im.source === "4825" && withBall.has(im.id) && hasSecond(im.frame)) { dropped[split] = (dropped[split] || 0) + 1; continue; }
    kept[split] = kept[split] || { pictures: 0, ball: 0 };
    kept[split].pictures++; if (withBall.has(im.id)) kept[split].ball++;
    const dst = `${OUT_DIR}/${split}/${im.file_name}`;
    if (!fs.existsSync(dst)) fs.linkSync(`${SRC_DIR}/${split}/${im.file_name}`, dst);
    images.push(im);
  }
  const ids = new Set(images.map(i => i.id));
  fs.writeFileSync(`${OUT_DIR}/${split}.json`, JSON.stringify({ images, annotations: j.annotations.filter(a => ids.has(a.image_id)), categories: j.categories }));
}
console.log("dropped (a second ball tracked in the same frame):", JSON.stringify(dropped));
console.log("kept:", JSON.stringify(kept));
