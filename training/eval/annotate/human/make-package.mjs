// Builds the blind HUMAN annotation package: about 20 frames that Matt (or anyone) labels by clicking the ball centre.
// The package shows NO model box and NO existing annotation, and no category. It is written to training/work/eval/human-package/ (git-ignored:
// footage of the kids is never committed). The selection and the blind-id mapping are saved in human-selection.json (ids only, no images).
//   node training/eval/annotate/human/make-package.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, readJSON } from "../../lib/registry.mjs";
import { sample, shuffled } from "../../lib/stats.mjs";

const SEED = 20261040;
const ann = readJSON("training/eval/annotate/annotations.json"), man = readJSON("training/eval/annotate/manifest.json");
const frames = ann.frames.filter((f) => f.id.startsWith("F"));
const tags = (f) => f.tags ?? [];
const ball = (f) => f.balls[0];
const rimish = (f) => (f.distractors ?? []).some((d) => d.kind === "rim") || /rim/.test(f.notes ?? "");
const pools = {
  ball_absent: frames.filter((f) => f.balls.length === 0 && (f.distractors ?? []).length > 0),
  clear_ball: frames.filter((f) => f.balls.length && ball(f).visibility === "clear" && ball(f).confidence === "high" && !tags(f).includes("blurred") && !rimish(f) && ball(f).diameter >= 23),
  small_ball: frames.filter((f) => f.balls.length && ball(f).diameter <= 24 && ball(f).confidence !== "low" && !rimish(f)),
  blurred: frames.filter((f) => tags(f).includes("blurred")),
  hidden_or_cut: frames.filter((f) => f.balls.length && (ball(f).visibility !== "clear" || tags(f).includes("occluded")) && !rimish(f)),
  rim_region_orange: frames.filter((f) => rimish(f)),
  held_ball: frames.filter((f) => tags(f).includes("in_hand")),
};
const want = { ball_absent: 3, clear_ball: 4, small_ball: 2, blurred: 2, hidden_or_cut: 3, rim_region_orange: 5, held_ball: 1 };
const chosen = []; const used = new Set();
for (const [cat, n] of Object.entries(want)) {
  const pool = pools[cat].filter((f) => !used.has(f.id));
  for (const f of sample(pool, n, SEED + cat.length)) { used.add(f.id); chosen.push({ internal: f.id, category: cat }); }
}
const order = shuffled(chosen, SEED);
const selection = order.map((c, i) => ({ blind_id: "H" + String(i + 1).padStart(2, "0"), ...c, clip: man.frames.find((m) => m.id === c.internal).clip }));
fs.writeFileSync(path.join(ROOT, "training/eval/annotate/human/human-selection.json"), JSON.stringify({ seed: SEED, note: "ids only. The package itself shows no category, model box, or existing annotation.", pools: Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, v.length])), frames: selection }, null, 1) + "\n");

const pkg = path.join(ROOT, "training/work/eval/human-package");
fs.rmSync(pkg, { recursive: true, force: true }); fs.mkdirSync(pkg, { recursive: true });
const images = {};
for (const s of selection) {
  const src = path.join(ROOT, "training/work/eval/frames", s.internal + ".png"), dst = path.join(pkg, s.blind_id + ".jpg");
  const r = spawnSync("magick", [src, "-strip", "-quality", "93", dst]); if (r.status !== 0) throw new Error(String(r.stderr));
  images[s.blind_id] = "data:image/jpeg;base64," + fs.readFileSync(dst).toString("base64");
}
const ids = selection.map((s) => s.blind_id);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Find the basketball</title>
<style>
:root{color-scheme:light dark;--bg:#f2efe9;--fg:#0d1526;--card:#fff;--line:#cbc5ba;--acc:#c2410c}
@media (prefers-color-scheme:dark){:root{--bg:#0e1626;--fg:#f4f6fb;--card:#16213a;--line:#31416a;--acc:#ff6a1a}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,system-ui,sans-serif}
main{max-width:1000px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:0 0 4px} .muted{opacity:.7;font-size:14px}
.row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
#stage{position:relative;width:624px;max-width:100%}
canvas{display:block;width:100%;border-radius:8px;cursor:crosshair;touch-action:none}
#loupe{width:160px;height:160px;border:2px solid var(--acc);border-radius:50%;position:absolute;pointer-events:none;display:none;background:#000}
button{font:inherit;font-weight:700;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--fg);padding:10px 14px;cursor:pointer}
button.primary{background:var(--acc);border-color:var(--acc);color:#fff}
button:disabled{opacity:.4;cursor:not-allowed}
.side{flex:1;min-width:260px}
label{display:block;margin:8px 0 2px;font-weight:600;font-size:14px}
select{font:inherit;padding:8px;border-radius:8px;width:100%}
#bar{height:8px;background:var(--line);border-radius:6px;overflow:hidden;margin:8px 0 12px}#bar>i{display:block;height:100%;background:var(--acc);width:0}
.state{font-weight:700} .ok{color:#16a34a}
</style></head><body><main>
<h1>Find the basketball</h1>
<p class="muted">Each picture is one moment from a video of a driveway hoop. Click the <b>centre of the ball</b> if you can see it. If there is no ball, press <b>No ball</b>. Please do not guess from the shirt or the rim: label only what you can see. Your answers stay in this browser until you press Download.</p>
<div class="card" style="margin:12px 0"><b id="count"></b><div id="bar"><i></i></div>
<div class="row"><div id="stage"><canvas id="c" width="832" height="832"></canvas><canvas id="loupe" width="160" height="160"></canvas></div>
<div class="side">
<p class="state" id="state"></p>
<p class="muted" id="hint"></p>
<label for="vis">How much of the ball can you see?</label>
<select id="vis"><option value="clear">All of it, or nearly</option><option value="partial">Part of it is hidden or cut off</option><option value="occluded_guess">Hidden: I am working out where it must be</option></select>
<label for="conf">How sure are you?</label>
<select id="conf"><option value="high">Sure</option><option value="medium">Fairly sure</option><option value="low">Not sure</option></select>
<div class="row" style="margin-top:12px"><button id="none">No ball</button><button id="undo">Clear my mark</button></div>
<div class="row" style="margin-top:8px"><button id="back">Back</button><button id="next" class="primary">Next</button></div>
<p class="muted">Step 1: click the centre of the ball. Step 2 (optional): click on the ball's edge so the size is recorded; or just press Next. Move the mouse over the picture for a magnifier.</p>
</div></div></div>
<div class="card"><button id="dl" class="primary">Download my labels</button> <button id="reset">Start again</button> <span class="muted" id="saved"></span></div>
<script>
const IDS=${JSON.stringify(ids)}, IMG=${JSON.stringify(images)}, KEY="hl:human-annotation-v1", S=832/416;
let i=0, st=JSON.parse(localStorage.getItem(KEY)||"{}"); const cvs=document.getElementById("c"), ctx=cvs.getContext("2d"), lo=document.getElementById("loupe"), lctx=lo.getContext("2d");
const imgs={}; let loaded=0; for(const id of IDS){const im=new Image(); im.onload=()=>{loaded++; if(loaded===IDS.length) draw();}; im.src=IMG[id]; imgs[id]=im;}
const rec=()=> (st[IDS[i]] ??= {balls:[],none:false,seen:false});
function save(){localStorage.setItem(KEY,JSON.stringify(st)); document.getElementById("saved").textContent=Object.values(st).filter(r=>r.seen).length+" of "+IDS.length+" pictures answered";}
function draw(){const id=IDS[i], r=rec(); ctx.drawImage(imgs[id],0,0,832,832);
  for(const b of r.balls){ctx.strokeStyle="#00e5ff";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(b.cx*S-14,b.cy*S);ctx.lineTo(b.cx*S+14,b.cy*S);ctx.moveTo(b.cx*S,b.cy*S-14);ctx.lineTo(b.cx*S,b.cy*S+14);ctx.stroke(); if(b.diameter){ctx.beginPath();ctx.arc(b.cx*S,b.cy*S,b.diameter*S/2,0,7);ctx.stroke();}}
  document.getElementById("count").textContent="Picture "+(i+1)+" of "+IDS.length; document.querySelector("#bar>i").style.width=(100*(i+1)/IDS.length)+"%";
  const s=document.getElementById("state"); s.className="state"+(r.seen?" ok":""); s.textContent=r.none?"You said: no ball in this picture":r.balls.length?"Ball marked at ("+r.balls[0].cx.toFixed(0)+", "+r.balls[0].cy.toFixed(0)+")":"Not answered yet";
  document.getElementById("hint").textContent=r.pending?"Now click a point on the ball's EDGE (or press Next to skip the size).":"";
  if(r.balls[0]){document.getElementById("vis").value=r.balls[0].visibility;document.getElementById("conf").value=r.balls[0].confidence;}
  document.getElementById("back").disabled=i===0; document.getElementById("next").textContent=i===IDS.length-1?"Finish":"Next"; save();}
function pos(e){const b=cvs.getBoundingClientRect(),t=e.touches?e.touches[0]:e;return [(t.clientX-b.left)/b.width*416,(t.clientY-b.top)/b.height*416,t.clientX-b.left,t.clientY-b.top];}
cvs.addEventListener("click",e=>{const [x,y]=pos(e), r=rec(); if(r.pending&&r.balls[0]){r.balls[0].diameter=Math.max(8,2*Math.hypot(x-r.balls[0].cx,y-r.balls[0].cy)); r.pending=false;} else {r.none=false; r.balls=[{cx:+x.toFixed(1),cy:+y.toFixed(1),diameter:null,visibility:document.getElementById("vis").value,confidence:document.getElementById("conf").value}]; r.pending=true;} r.seen=true; draw();});
cvs.addEventListener("mousemove",e=>{const [x,y,px,py]=pos(e); lo.style.display="block"; lo.style.left=Math.min(px+20,cvs.getBoundingClientRect().width-160)+"px"; lo.style.top=Math.max(py-170,0)+"px"; lctx.clearRect(0,0,160,160); lctx.imageSmoothingEnabled=false; lctx.drawImage(imgs[IDS[i]],x-20,y-20,40,40,0,0,160,160); lctx.strokeStyle="#ff2d55";lctx.lineWidth=1;lctx.beginPath();lctx.moveTo(80,70);lctx.lineTo(80,90);lctx.moveTo(70,80);lctx.lineTo(90,80);lctx.stroke();});
cvs.addEventListener("mouseleave",()=>lo.style.display="none");
document.getElementById("none").onclick=()=>{const r=rec(); r.balls=[]; r.none=true; r.pending=false; r.seen=true; draw();};
document.getElementById("undo").onclick=()=>{const r=rec(); r.balls=[]; r.none=false; r.pending=false; r.seen=false; draw();};
document.getElementById("vis").onchange=document.getElementById("conf").onchange=()=>{const r=rec(); if(r.balls[0]){r.balls[0].visibility=document.getElementById("vis").value; r.balls[0].confidence=document.getElementById("conf").value; save();}};
document.getElementById("next").onclick=()=>{rec().pending=false; if(i<IDS.length-1){i++;} else {alert("That was the last picture. Press Download my labels and send me the file.");} draw();};
document.getElementById("back").onclick=()=>{if(i>0){rec().pending=false; i--; draw();}};
document.getElementById("dl").onclick=()=>{const out={schema:"human-annotation-v1",annotator:{id:prompt("Your name or initials (this goes in the file):","")||"human",kind:"human"},saved:new Date().toISOString(),coordinate_system:"416 px picture, x right, y down; diameter is the ball's width in the same pixels, null if you skipped it",frames:IDS.map(id=>{const r=st[id]||{}; return {id, answered:!!r.seen, no_ball:!!r.none, balls:(r.balls||[]).map(b=>({...b,diameter:b.diameter??null}))};})}; const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:"application/json"})); a.download="human-annotations.json"; a.click();};
document.getElementById("reset").onclick=()=>{if(confirm("Delete all your answers and start again?")){st={}; localStorage.removeItem(KEY); i=0; draw();}};
</script></main></body></html>`;
fs.writeFileSync(path.join(pkg, "index.html"), html);
fs.writeFileSync(path.join(pkg, "READ-ME-FIRST.txt"), `FIND THE BASKETBALL: independent labelling (about 10 minutes)

1. Double-click index.html. It opens in your browser. Nothing is uploaded anywhere; it works offline.
2. For each of the ${ids.length} pictures: if you can see the ball, click its CENTRE. Then (optional) click a point on the ball's EDGE so the size is recorded. If there is no ball, press "No ball".
3. Use the two menus only if the ball is partly hidden or you are unsure. Move the mouse over the picture for a magnifier.
4. Label only what you can see in the picture. Please do not look at the app, the model's boxes or my earlier labels while you do this: the point is an independent second opinion.
5. Press "Download my labels". A file called human-annotations.json lands in your Downloads folder. Move it to:
   training/eval/annotate/human/human-annotations.json
   and tell me. I will compare it with my labels and the model, as a SEPARATE report (it is not part of the automated tests).

The pictures are footage of your family. They stay on this Mac: this folder is git-ignored and nothing here is uploaded.
`);
spawnSync("zip", ["-qr", path.join(ROOT, "training/work/eval/human-annotation-package.zip"), "."], { cwd: pkg });
console.log(`package: ${pkg} (${ids.length} frames)`, JSON.stringify(Object.fromEntries(Object.keys(want).map((k) => [k, selection.filter((s) => s.category === k).length]))), "pool sizes", JSON.stringify(Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, v.length]))));
