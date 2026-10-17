setTimeout(() => { console.log("WATCHDOG"); process.exit(2); }, 400000);
import puppeteer from "puppeteer-core"; // run from a folder with puppeteer-core installed. Routes: demo-pages/ (temporary) as /lab/p15-aim and /lab/p15-live.
// Aiming the camera at the rim: where a touch lands, what Start does, and pause and re-aim, in landscape and portrait.
// p15-aim is the real stage with a drawn picture; p15-live is the real camera hook and stage on Chrome's fake camera with the real ball model.
const B = "http://localhost:3101/lab";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
await browser.defaultBrowserContext().overridePermissions("http://localhost:3101", ["camera"]);
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(url, vp) {
  const p = await browser.newPage(); await p.setViewport({ ...vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on("pageerror", (e) => { console.log("PAGEERROR", e.message.slice(0, 160)); fails++; });
  await p.goto(url, { waitUntil: "networkidle0", timeout: 120000 }); return p;
}
const LAND = { width: 844, height: 390 }, PORT = { width: 390, height: 844 };
const geometry = (p) => p.evaluate(() => { const c = document.querySelector("canvas").getBoundingClientRect(), v = document.querySelector("video"), vr = v.getBoundingClientRect(); const btn = [...document.querySelectorAll("button")].find((x) => /start|resume/i.test(x.innerText)).getBoundingClientRect(); return { c, vr: { x: vr.x, y: vr.y, w: vr.width, h: vr.height }, vw: v.videoWidth, vh: v.videoHeight, btn: { x: btn.x, y: btn.y, w: btn.width, h: btn.height } }; });
const at = (g, fx, fy) => { const k = Math.min(g.vr.w / g.vw, g.vr.h / g.vh), pw = g.vw * k, ph = g.vh * k; return [g.vr.x + (g.vr.w - pw) / 2 + fx * pw, g.vr.y + (g.vr.h - ph) / 2 + fy * ph]; };
const tap = async (p, x, y) => { await p.touchscreen.touchStart(x, y); await p.touchscreen.touchEnd(); await wait(200); };
const calls = (p) => p.evaluate(() => window.__calls.splice(0));
const click = (p, re) => p.evaluate((r) => { const e = [...document.querySelectorAll("button")].find((x) => new RegExp(r, "i").test(x.innerText)); if (!e) return false; e.click(); return true; }, re);

for (const [name, vp] of [["landscape", LAND], ["portrait", PORT]]) {
  const p = await open(`${B}/p15-aim`, vp);
  await p.waitForSelector("canvas"); await p.waitForFunction(() => document.querySelector("video")?.videoWidth > 0);
  const g = await geometry(p);
  let worst = 0;
  for (const [fx, fy] of [[0.5, 0.3], [0.2, 0.25], [0.8, 0.45], [0.5, 0.5], [0.35, 0.15], [0.7, 0.55]]) {
    const [x, y] = at(g, fx, fy);
    await tap(p, x, y); const c = await calls(p); const m = c.at(-1)?.match(/aim ([\d.]+),([\d.]+)/);
    worst = Math.max(worst, m ? Math.max(Math.abs(+m[1] - fx), Math.abs(+m[2] - fy)) : 1);
  }
  ok(worst < 0.003, `${name}: a touch lands exactly where it is (worst error ${worst.toFixed(4)} of the picture)`);
  await p.close();
  const q = await open(`${B}/p15-aim`, vp); await q.waitForFunction(() => document.querySelector("video")?.videoWidth > 0);
  const g2 = await geometry(q);
  await tap(q, g2.btn.x + g2.btn.w / 2, g2.btn.y + g2.btn.h / 2);
  const c0 = await calls(q); const t = await q.evaluate(() => document.body.innerText);
  ok(!c0.some((x) => /aim/.test(x)) && !c0.includes("START"), `${name}: tapping Start before aiming does not move the rim and does not start`);
  ok(/Touch the picture on the front of the rim first/i.test(t), `${name}: ...and it says why instead of doing nothing`);
  const [x, y] = at(g2, 0.5, 0.3); await tap(q, x, y); await calls(q);
  const g3 = await geometry(q);
  await tap(q, g3.btn.x + g3.btn.w / 2, g3.btn.y + g3.btn.h / 2);
  const c1 = await calls(q); ok(c1.includes("START") && !c1.some((z) => /aim/.test(z)), `${name}: once aimed, Start starts and the tap does not move the rim (${c1.join(" | ")})`);
  await q.close();
}

// turning the phone after aiming: the ring stays on the same spot of the picture and a new touch still lands exactly
{
  const r = await open(`${B}/p15-aim`, PORT); await r.waitForFunction(() => document.querySelector("video")?.videoWidth > 0);
  let gr = await geometry(r); await tap(r, ...at(gr, 0.4, 0.35)); await calls(r);
  await r.setViewport({ ...LAND, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await wait(600);
  const kept = await r.evaluate(() => window.__aim); ok(Math.abs(kept.x - 0.4) < 0.003 && Math.abs(kept.y - 0.35) < 0.003, "turn: the aim stays on the same spot of the picture after the phone is turned");
  gr = await geometry(r); await tap(r, ...at(gr, 0.62, 0.28)); const c = (await calls(r)).at(-1)?.match(/aim ([\d.]+),([\d.]+)/);
  ok(c && Math.abs(+c[1] - 0.62) < 0.003 && Math.abs(+c[2] - 0.28) < 0.003, "turn: after turning to landscape a touch still lands exactly where it is");
  gr = await geometry(r); await tap(r, gr.btn.x + gr.btn.w / 2, gr.btn.y + gr.btn.h / 2); const cc = await calls(r);
  ok(cc.includes("START") && !cc.some((z) => /aim/.test(z)), "turn: Start in landscape starts counting and is not taken as a rim touch");
  await r.close();
}

// the live hook: pause, re-aim, resume
const p = await open(`${B}/p15-live`, LAND);
await click(p, "^open$"); await p.waitForFunction(() => window.__cam?.phase === "aiming", { timeout: 60000 });
ok(!(await p.evaluate(() => /Pause and re-aim/i.test(document.body.innerText))), "live: no re-aim control while still aiming for the first time");
let g = await geometry(p); await tap(p, ...at(g, 0.5, 0.3));
await p.waitForFunction(() => window.__cam.speed.kind !== "checking", { timeout: 90000 }).catch(() => {});
await click(p, "start counting|start now|count anyway"); await p.waitForFunction(() => window.__cam.phase === "counting", { timeout: 60000 });
await wait(500);
ok(await p.evaluate(() => /Counting here/i.test(document.body.innerText)), "live: a ring shows where counting is aimed for a few seconds after it starts");
await click(p, "^\\+ Make$"); await click(p, "^\\+ Miss$"); await click(p, "^\\+ Make$"); await wait(200);
await p.evaluate(() => document.querySelector("button[aria-label^='More']").click()); await wait(250);
ok(await p.evaluate(() => /Pause and re-aim the camera/i.test(document.body.innerText) && /Your shots so far are kept/i.test(document.body.innerText)), "live: the menu offers 'Pause and re-aim the camera' and says shots are kept");
await click(p, "Pause and re-aim"); await wait(500);
const paused = await p.evaluate(() => ({ phase: window.__cam.phase, reaiming: window.__cam.reaiming, text: document.body.innerText, playing: !document.querySelector("video").paused }));
ok(paused.phase === "aiming" && paused.reaiming, "live: counting is paused and the aim screen is back");
ok(/Paused: 2 of 3 so far/.test(paused.text), "live: it says how many shots are kept (2 of 3)");
ok(paused.playing, "live: the picture stays live so the phone can be moved and aimed");
ok(/Resume counting/i.test(paused.text) && /End set/i.test(paused.text) && !/Cancel set/i.test(paused.text), "live: 'Resume counting' and 'End set' (not 'Cancel set', which would throw the set away)");
ok(await p.evaluate(() => !!localStorage.getItem("hl:lab:reaim")), "live: the re-aim is noted so the saved set is not pooled with sets from one place");
g = await geometry(p); await tap(p, ...at(g, 0.3, 0.55));
const aim = await p.evaluate(() => window.__cam.getAim()); ok(Math.abs(aim.x - 0.3) < 0.003 && Math.abs(aim.y - 0.55) < 0.003, `live: the new rim is where it was touched (${aim.x.toFixed(3)}, ${aim.y.toFixed(3)})`);
await click(p, "Resume counting"); await p.waitForFunction(() => window.__cam.phase === "counting", { timeout: 60000 });
ok(await p.evaluate(() => !window.__cam.reaiming && /2\/3|2<span[^>]*>\/3/.test(document.body.innerHTML.replace(/\s+/g, "")) || /Makes/i.test(document.body.innerText)), "live: counting resumes and the set's score is still there");
await p.close();
const pt = await open(`${B}/p15-live?goal=time`, LAND);
await click(pt, "^open$"); await pt.waitForFunction(() => window.__cam?.phase === "aiming", { timeout: 60000 });
g = await geometry(pt); await tap(pt, ...at(g, 0.5, 0.3));
await pt.waitForFunction(() => window.__cam.speed.kind !== "checking", { timeout: 90000 }).catch(() => {});
await click(pt, "start counting|start now|count anyway"); await pt.waitForFunction(() => window.__cam.phase === "counting", { timeout: 60000 });
await pt.evaluate(() => document.querySelector("button[aria-label^='More']").click()); await wait(250);
ok(await pt.evaluate(() => /Not during a timed set/i.test(document.body.innerText) && [...document.querySelectorAll("button")].find((b) => /Pause and re-aim/i.test(b.innerText))?.disabled === true), "live: not offered during a timed set (the clock would keep running)");
await pt.close();
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
