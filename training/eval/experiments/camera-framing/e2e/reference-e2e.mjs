import puppeteer from "puppeteer-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const ROOT = "/Users/WatfordFamily/Desktop/basketball-app/training/work/framing";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "hl-prof-"));
const out = { checks: [] };
const ok = (n, p, d = "") => { out.checks.push({ name: n, pass: !!p, detail: d }); console.log(p ? "PASS" : "FAIL", n, d); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function session(y4m, seedPx, action, shot) {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: profile, args: ["--no-sandbox"], defaultViewport: { width: 420, height: 1400 } });
  const p = await b.newPage(); const errs = [], reqs = [];
  const jpg = "data:image/jpeg;base64," + fs.readFileSync(`${ROOT}/${y4m}`).toString("base64");
  await p.evaluateOnNewDocument((jpg) => {
    // A stand-in camera: a canvas stream showing a still of the hoop (nothing leaves the machine).
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image(); img.src = jpg; await img.decode();
      const c = document.createElement("canvas"); c.width = 1920; c.height = 1080; const x = c.getContext("2d");
      const tick = () => { x.drawImage(img, 0, 0, 1920, 1080); setTimeout(tick, 100); }; tick();
      return c.captureStream(10);
    };
  }, jpg); p.on("pageerror", (e) => errs.push(String(e).slice(0, 200))); p.on("request", (r) => reqs.push(r.url()));
  await p.goto("http://localhost:3101/lab/ref-demo", { waitUntil: "networkidle2", timeout: 120000 });
  const click = (label) => p.evaluate((label) => { const x = [...document.querySelectorAll("button")].find((y) => y.innerText.toLowerCase().includes(label.toLowerCase())); if (!x || x.disabled) return false; x.click(); return true; }, label);
  ok("open camera", await click("Open camera")); await wait(2500);
  const box = await (await p.$("[data-testid=stage]")).boundingBox();
  await p.mouse.click(box.x + (seedPx[0] / 1920) * box.width, box.y + (seedPx[1] / 1080) * box.height); await wait(300);
  const label = action === "keep" ? "measure" : "check against reference";
  ok(`click ${label}`, await click(label));
  await p.waitForFunction(() => document.body.innerText.toLowerCase().includes("stills found the rim"), { timeout: 120000 });
  const text = await p.evaluate(() => document.body.innerText);
  const r = { found: text.match(/\d of 5 stills found the rim; \d also found the backboard\. took [\d.]+ s/i)?.[0], text, p, b, click, errs, reqs };
  await p.screenshot({ path: `/private/tmp/claude-501/-Users-WatfordFamily-Desktop-basketball-app/d6fe762f-a87f-466b-a84e-5fe55a87eca6/scratchpad/${shot}.png`, fullPage: true });
  return r;
}
// 1. set the reference
let s = await session("hoop.jpg", [1058, 450], "keep", "ref1");
ok("rim and backboard found in the live preview", /5 of 5 stills found the rim; [45] also found the backboard/i.test(s.text), s.found);
ok("keep the reference", await s.click("Keep as the reference")); await wait(400);
const stored = await s.p.evaluate(() => localStorage.getItem("hl:framing:ref"));
ok("reference is a few hundred bytes of numbers, no picture", stored && stored.length < 2500 && !/data:|blob:|image/.test(stored), `${stored?.length} bytes`);
const ctxText = await s.p.evaluate(() => document.body.innerText);
ok("UI says counting is not affected", /counting works the same with or without it/i.test(ctxText));
await s.b.close();
// 2. same view again
s = await session("hoop.jpg", [1058, 450], "check", "ref2");
ok("same view: looks the same", /looks the same/i.test(s.text) && /camera height/i.test(s.text), s.text.match(/against the reference[^\n]*/i)?.[0]);
await s.b.close();
// 3. camera moved (zoomed and shifted)
s = await session("hoopmoved.jpg", [1222, 428], "check", "ref3");
const v3 = s.text.match(/against the reference[^\n]*/i)?.[0];
ok("zoomed and shifted camera is flagged, not 'looks the same'", !/looks the same/i.test(v3 || "") && /(moved a little|cannot tell)/i.test(v3 || ""), v3);
// 4. wrong tap: far from the rim
await s.p.reload({ waitUntil: "networkidle2" }); await s.b.close();
s = await session("hoop.jpg", [300, 800], "check", "ref4").catch((e) => ({ text: String(e), b: null }));
ok("a tap far from any rim says the hoop was not found", /hoop not found|not found/i.test(s.text || ""), (s.text || "").match(/against the reference[^\n]*/i)?.[0]);
fs.writeFileSync("/Users/WatfordFamily/Desktop/basketball-app/training/eval/experiments/camera-framing/results/reference-e2e.json", JSON.stringify(out, null, 1));
console.log(out.checks.filter((c) => !c.pass).length ? "SOME FAILED" : "ALL PASSED");
await s.b?.close();
process.exit(0);
