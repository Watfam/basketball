import puppeteer from "puppeteer-core";
import { createRequire } from "module"; const require = createRequire(import.meta.url); const axeSrc = require("fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3101/lab/p14-idb", { waitUntil: "networkidle0", timeout: 120000 }); await wait(2500);
const axe = async (label) => { const v = await p.evaluate(async (src) => { if (!window.axe) { const s = document.createElement("script"); s.textContent = src; document.head.append(s); } const r = await window.axe.run(document.body, { runOnly: ["wcag2a", "wcag2aa"] }); return r.violations.map((x) => `${x.id}:${x.nodes.length}:${x.nodes[0].html.slice(0, 90)}`); }, axeSrc); console.log(label, v.length ? v : "no violations"); };
await axe("watch");
for (const [name, label] of [["compare", "Compare two"], ["patterns", "Where they went"]]) {
  await p.evaluate((l) => [...document.querySelectorAll("[role=tab]")].find((x) => x.innerText.includes(l)).click(), label); await wait(800);
  await p.screenshot({ path: `hist-${name}.png`, fullPage: false }); await axe(name);
}
await b.close();
