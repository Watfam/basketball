// DESKTOP-ONLY check of the throughput diagnostic and the pacing flag, in the real app loop with a fake camera playing a saved clip.
// Desktop software-WASM numbers: they show the diagnostic works and what the stages look like, never phone numbers.
//   PUPPETEER_DIR=<dir> FAKE_VIDEO=<mjpeg> node perf-throughput.mjs <off|fresh> [seconds]
// The app's Count anyway button ignores a synthetic click on desktop, so the handler is called through React's props.
// Needs a dev server on BASE_URL (default 3101) and the TEMPORARY /lab/hubdemo route + middleware allowance (removed afterwards).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(path.join(process.env.PUPPETEER_DIR, "/"));
const puppeteer = (await import(pathToFileURL(require.resolve("puppeteer-core")).href)).default;
const MODE = process.argv[2] ?? "off", SECONDS = Number(process.argv[3] ?? 60), BASE = process.env.BASE_URL ?? "http://localhost:3101";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${process.env.FAKE_VIDEO}`, "--no-sandbox"],
  defaultViewport: { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 200)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`${BASE}/lab/hubdemo`, { waitUntil: "domcontentloaded" });
await page.evaluate((mode) => {
  localStorage.removeItem("hl:aim:ref");
  localStorage.setItem("hl:lab:rim", JSON.stringify({ x: 0.417, y: 0.382, scale: 1.899 }));
  localStorage.removeItem("hl:shots:demo:draft");
  localStorage.setItem("hl:shots:count", "camera");
  localStorage.setItem("hl:session-review-debug", "1");
  localStorage.removeItem("hl:pipeline:report");
  if (mode === "fresh") localStorage.setItem("hl:loop-pace", "fresh"); else localStorage.removeItem("hl:loop-pace");
}, MODE);
await page.goto(`${BASE}/lab/hubdemo`, { waitUntil: "domcontentloaded" }); await wait(2500);
const clickText = (re) => page.evaluate((src) => { const b = [...document.querySelectorAll("button")].find((x) => new RegExp(src, "i").test(x.innerText) && !x.disabled); if (b) b.click(); return !!b; }, re.source);
await clickText(/^free throws/); await wait(500); await clickText(/start shooting/);
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /count anyway|start counting|start now|count by tapping/i.test(b.innerText)), { timeout: 120000 });
await wait(3000);
await page.mouse.move(363, 150); await page.mouse.down(); await page.mouse.move(364, 151); await page.mouse.up(); await wait(500);
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /count anyway|start counting|start now/i.test(b.innerText) && b.getAttribute("aria-disabled") !== "true"), { timeout: 120000 });
await wait(2000);
console.log("fiber", await page.evaluate(async () => { const b = [...document.querySelectorAll("button")].find((x) => /count anyway/i.test(x.innerText)); if (!b) return "no button: " + [...document.querySelectorAll("button")].map((x) => x.innerText.trim()).join("|"); const k = Object.keys(b).find((x) => x.startsWith("__reactProps")); try { const r = b[k].onClick({}); if (r && r.then) await r; return "called " + typeof b[k].onClick; } catch (e) { return "threw " + e.message + " " + (e.stack||"").slice(0,300); } }));
for (let i = 0; i < 6; i += 1) { await wait(3000); console.log("t+", (i + 1) * 3, await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200))); }
console.log("after click buttons", await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.innerText.trim()+":"+b.getAttribute("aria-disabled"))));
await wait(SECONDS * 1000);
console.log(await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => k.startsWith("hl:")), diag: localStorage.getItem("hl:review:diag"), buttons: [...document.querySelectorAll("button")].map((b) => b.innerText.trim()).slice(0, 8) })));
const report = await page.evaluate(() => JSON.parse(localStorage.getItem("hl:pipeline:report") ?? "null"));
const out = { mode: MODE, measured_on: "desktop Chromium (headless, software WASM), fake camera; NOT a phone", seconds_waited: SECONDS, report };
fs.mkdirSync(new URL("./results/", import.meta.url).pathname, { recursive: true });
fs.writeFileSync(new URL(`./results/desktop-throughput-${MODE}.json`, import.meta.url).pathname, JSON.stringify(out, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close();
