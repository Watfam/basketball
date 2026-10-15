import puppeteer from "puppeteer-core";
import fs from "node:fs";
const ROOT = "/Users/WatfordFamily/Desktop/basketball-app", URL = "http://localhost:3101/lab/history-demo";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--enable-precise-memory-info"], defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2 } });
const page = await browser.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
const h = (op, ...a) => page.evaluate((op, a) => window.__h[op](...a), op, a);
const go = async () => { await page.goto(URL, { waitUntil: "networkidle2", timeout: 120000 }); await page.waitForFunction(() => window.__h, { timeout: 30000 }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await go(); await page.evaluate(() => { localStorage.setItem("hl:session-review", "1"); localStorage.setItem("hl:history:retain", "1"); });
await h("clearAll");
const out = { measured: "headless Chrome on the desktop Mac (i5, 8 GB), dev server, real IndexedDB; NOT a phone", selftest: await h("selftest") };
console.log(JSON.stringify(out.selftest.rows), JSON.stringify(out.selftest.recorder), JSON.stringify(out.selftest.storage));
// large histories: time to open the screen and list, with growing history
out.history_screen = [];
let total = 0;
for (const [sessions, per] of [[1, 40], [3, 100], [6, 250]]) {
  await h("clearAll"); const saves = await h("bigSeed", sessions, per); total = sessions * per;
  await go();
  const t0 = Date.now(); await page.click("#entry button"); await page.waitForSelector("[role=dialog] section[aria-label='Saved sessions']", { timeout: 60000 });
  const listed = Date.now() - t0;
  await page.waitForSelector("[role=dialog] section[aria-label=Consistency]", { timeout: 120000 }); const analysed = Date.now() - t0;
  const heap = await page.evaluate(() => performance.memory.usedJSHeapSize / 1e6);
  // select six shots and render the overlay + table
  await page.evaluate(() => { const li = document.querySelector("[role=dialog] section[aria-label='Saved sessions'] > ul > li"); li.querySelector("button[aria-expanded]").click(); });
  await wait(300);
  const tSel = await page.evaluate(async () => { const t = performance.now(); const bs = [...document.querySelectorAll("[role=dialog] section[aria-label='Saved sessions'] ul ul li button")].slice(0, 6); bs.forEach((b) => b.click()); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t; });
  const est = await page.evaluate(async () => { const e = await navigator.storage.estimate(); return e.usage; });
  const ctrl = await page.$eval("[role=dialog] section[aria-label='Tracking history settings']", (d) => d.innerText.match(/Kept now:[^\n]*/)?.[0]);
  out.history_screen.push({ sessions, shots_per_session: per, total_shots: total, save_ms_each: saves.map((s) => s.ms), kept_bytes_total: saves.reduce((a, s) => a + s.bytes, 0), open_to_sessions_listed_ms: listed, open_to_analytics_ms: analysed, select_six_shots_render_ms: Math.round(tSel), heap_MB_after_open: +heap.toFixed(1), origin_storage_usage_bytes: est, controls_line: ctrl });
  console.log(JSON.stringify(out.history_screen.at(-1)));
  await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.innerText.trim().toLowerCase() === "close").click());
}
await h("clearAll"); out.errors = errs;
fs.writeFileSync(`${ROOT}/training/eval/experiments/persistent-history/results/performance-desktop.json`, JSON.stringify(out, null, 1));
console.log("errors", errs.length);
await browser.close();
