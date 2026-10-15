// Needs puppeteer-core (not a repo dependency) and the temporary /lab/review-demo route; see ../REPORT.md "Reproduce".
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--enable-precise-memory-info"], defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2 } });
const page = await browser.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200))); page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text().slice(0, 160)); });
await page.goto("http://localhost:3101/lab/review-demo", { waitUntil: "networkidle2", timeout: 120000 });
const flagBefore = await page.evaluate(() => ({ flag: localStorage.getItem("hl:session-review"), entry: document.getElementById("entry-host").querySelectorAll("button").length, dbs: null }));
await page.evaluate(() => document.getElementById("seed").click());
await page.waitForFunction(() => document.getElementById("seeded").innerText.startsWith("seeded"), { timeout: 120000 });
const mem0 = await page.evaluate(() => performance.memory.usedJSHeapSize);
await page.evaluate(() => { document.getElementById("flagon").click(); });
await new Promise((r) => setTimeout(r, 500));
const t0 = Date.now(); await page.evaluate(() => { const s = document.getElementById("session"); s.value = "0"; s.dispatchEvent(new Event("change", { bubbles: true })); }); await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => document.getElementById("open").click());
await page.waitForSelector("[role=dialog] canvas", { timeout: 30000 });
const openMs = Date.now() - t0 - 300;
await new Promise((r) => setTimeout(r, 1500));
// frame stepping, time to next paint
const stepTimes = await page.evaluate(async () => { const dlg = document.querySelector("[role=dialog]"), sl = dlg.querySelector("input[type=range]"), set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set, out = []; for (let i = 0; i < 60; i += 1) { const t = performance.now(); set.call(sl, String(i % 44)); sl.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); out.push(performance.now() - t); } return out; });
stepTimes.sort((a, b) => a - b);
// switch shots 30 times
const switchTimes = await page.evaluate(async () => { const dlg = document.querySelector("[role=dialog]"), btns = [...dlg.querySelectorAll("ul[aria-label=Shots] button")], out = []; for (let i = 0; i < 30; i += 1) { const t = performance.now(); btns[i % btns.length].click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); out.push(performance.now() - t); } return out; });
switchTimes.sort((a, b) => a - b);
await new Promise((r) => setTimeout(r, 1500));
const mem1 = await page.evaluate(() => performance.memory.usedJSHeapSize);
// close, flag off: entry vanishes and review store not touched by flag-off path
await page.evaluate(() => { [...document.querySelectorAll("[role=dialog] button")].find((b) => b.innerText.trim().toLowerCase() === "close").click(); });
await page.evaluate(() => document.getElementById("flagoff").click()); await new Promise((r) => setTimeout(r, 500));
const after = await page.evaluate(() => ({ flag: localStorage.getItem("hl:session-review"), entry: document.getElementById("entry-host").querySelectorAll("button").length }));
const mem2 = await page.evaluate(() => { return performance.memory.usedJSHeapSize; });
const q = (a, p) => +a[Math.min(a.length - 1, Math.floor(p * a.length))].toFixed(1);
console.log(JSON.stringify({ flagBefore, openMs, step_ms: { median: q(stepTimes, 0.5), p95: q(stepTimes, 0.95), max: q(stepTimes, 1) }, switch_ms: { median: q(switchTimes, 0.5), p95: q(switchTimes, 0.95), max: q(switchTimes, 1) }, heap_MB: { after_seed: +(mem0 / 1e6).toFixed(1), during_review: +(mem1 / 1e6).toFixed(1), after_close: +(mem2 / 1e6).toFixed(1) }, flagOff: after, errors: errs.slice(0, 5) }, null, 1));
await browser.close();
