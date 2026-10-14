// Measures the real app loop in desktop Chromium with a fake camera playing a saved clip: model runs per second (counted by watching
// "frame" messages to the detector worker, so the app is not touched), JS heap, and the browser's total resident memory.
// DESKTOP software-WASM numbers: a reference for "did this change make the loop slower or heavier", never phone numbers.
//
// Needs: puppeteer-core (PUPPETEER_DIR=<folder whose node_modules has it>), Chrome, a dev server on BASE_URL, and a TEMPORARY route
// /lab/hubdemo rendering <ShootingHub playerId="demo" ... /> plus a temporary middleware allow-list entry for it (both are removed
// afterwards; see training/eval/README.md). FAKE_VIDEO is an MJPEG made from a clip with ffmpeg.
//   PUPPETEER_DIR=... FAKE_VIDEO=... node training/eval/perf-app.mjs [seconds]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { EVAL } from "./lib/registry.mjs";
import { quantile } from "./lib/stats.mjs";

const require = createRequire(path.join(process.env.PUPPETEER_DIR, "/"));
const puppeteer = (await import(pathToFileURL(require.resolve("puppeteer-core")).href)).default;
const SECONDS = Number(process.argv[2] ?? 40);
const BASE = process.env.BASE_URL ?? "http://localhost:3101";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${process.env.FAKE_VIDEO}`, "--no-sandbox", "--enable-precise-memory-info"],
  defaultViewport: { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  window.__runs = [];
  const orig = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (msg, ...rest) {
    try { if (msg && msg.type === "frame") window.__runs.push(performance.now()); } catch {}
    return orig.call(this, msg, ...rest);
  };
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rss = () => { const out = spawnSync("ps", ["-axo", "rss,command"], { encoding: "utf8" }).stdout.split("\n").filter((l) => /Google Chrome/.test(l)); return out.reduce((a, l) => a + Number(l.trim().split(/\s+/)[0]), 0) * 1024; };

await page.goto(`${BASE}/lab/hubdemo`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("hl:aim:ref", ""); localStorage.removeItem("hl:aim:ref");
  localStorage.setItem("hl:lab:rim", JSON.stringify({ x: 0.525, y: 0.485, scale: 1 }));
  localStorage.setItem("hl:shots:demo:draft", JSON.stringify({ v: 1, sessionId: null, label: "perf", startedAt: new Date().toISOString(), clockStartedAt: null, shots: [], zone: null, goal: null, mode: "camera", camera: null, rev: 1, syncedRev: 0 }));
  localStorage.setItem("hl:shots:count", "camera");
});
await page.goto(`${BASE}/lab/hubdemo`, { waitUntil: "domcontentloaded" }); await wait(2500);
const clickText = (re) => page.evaluate((src) => { const b = [...document.querySelectorAll("button")].find((x) => new RegExp(src, "i").test(x.innerText) && !x.disabled); if (b) b.click(); return !!b; }, re.source);
await clickText(/open the camera/);
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /count anyway|start counting|start now|count by tapping/i.test(b.innerText)), { timeout: 120000 });
const t = await page.touchscreen.touchStart(430, 200); await t.move(439, 189); await t.end(); await wait(500);
// the app times the phone for a few frames while aiming and keeps Start disabled until it has: wait for that, as a person would
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /count anyway|start counting|start now/i.test(b.innerText) && !b.disabled), { timeout: 120000 });
const beforeHeap = await page.evaluate(() => performance.memory.usedJSHeapSize), beforeRss = rss();
await clickText(/count anyway|start counting|start now/);
await wait(5000); // model load and sizing start
const t0 = await page.evaluate(() => performance.now());
const heap = [], rsses = [];
for (let s = 0; s < SECONDS; s += 2) { await wait(2000); heap.push(await page.evaluate(() => performance.memory.usedJSHeapSize)); rsses.push(rss()); }
const runs = await page.evaluate((from) => window.__runs.filter((x) => x >= from), t0);
const seconds = (runs[runs.length - 1] - runs[0]) / 1000;
const gaps = runs.slice(1).map((x, i) => x - runs[i]);
const result = {
  measured_on: "desktop Chromium (headless, software WASM), fake camera playing a saved clip",
  seconds_observed: SECONDS, model_runs: runs.length, model_runs_per_second: runs.length / seconds,
  ms_between_model_runs: { median: quantile(gaps, 0.5), p95: quantile(gaps, 0.95), max: Math.max(...gaps) },
  js_heap_bytes: { before_counting: beforeHeap, end: heap[heap.length - 1], max: Math.max(...heap) },
  chrome_total_rss_bytes: { before_counting: beforeRss, end: rsses[rsses.length - 1], max: Math.max(...rsses) },
  caution: "desktop browser; RSS covers every Chrome process on the machine at the time. Phone memory and speed are unavailable.",
};
fs.writeFileSync(path.join(EVAL, "reports/performance-app.json"), JSON.stringify(result, null, 1) + "\n");
console.log(JSON.stringify(result));
await browser.close();
