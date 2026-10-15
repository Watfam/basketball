import puppeteer from "puppeteer-core";
import fs from "node:fs";
const SH = "/private/tmp/claude-501/-Users-WatfordFamily-Desktop-basketball-app/d6fe762f-a87f-466b-a84e-5fe55a87eca6/scratchpad";
const out = { checks: [] };
const ok = (n, p, d = "") => { out.checks.push({ name: n, pass: !!p, detail: d }); console.log(p ? "PASS" : "FAIL", n, d); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const JARGON = /framing|image-horizontal|fingerprint|image-space|detector|detection|reconstruct|ambiguous|hardware|\bscore\b|\bbw\b|p-value|holm|schema|\brecord\b|\btrail\b|pixel|\bpx\b|uncertain|phantom/i;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 } });
const p = await b.newPage(); const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await p.evaluateOnNewDocument(() => { window.__opens = []; const o = indexedDB.open.bind(indexedDB); indexedDB.open = (name, v) => { window.__opens.push(name); return o(name, v); }; });
const go = async () => { await p.goto("http://localhost:3101/lab/p9-demo", { waitUntil: "networkidle2", timeout: 120000 }); await p.waitForFunction(() => window.__p9); };
const click = (label, scope = "body") => p.evaluate((label, scope) => { const x = [...document.querySelectorAll(`${scope} button`)].find((y) => y.innerText.toLowerCase().trim().startsWith(label.toLowerCase())); if (!x || x.disabled) return false; x.click(); return true; }, label, scope);
const text = (sel = "#end") => p.$eval(sel, (d) => d.innerText).catch(() => "");
const setFlags = (review, rim) => p.evaluate((review, rim) => { localStorage.removeItem("hl:session-review"); localStorage.removeItem("hl:rim-warning"); if (review) localStorage.setItem("hl:session-review", "1"); if (rim) localStorage.setItem("hl:rim-warning", "1"); }, review, rim);
await go(); await p.evaluate(() => localStorage.clear());
// seed records for both sets once
await setFlags(false, false); await go(); await p.evaluate(() => window.__p9.save(true)); await p.evaluate(() => window.__p9.save(false));
const recsBefore = await p.evaluate(() => window.__p9.records());

// 1. shot review off, rim on: nothing at all
await setFlags(false, true); await go(); await p.evaluate(() => window.__p9.show(true)); await wait(800);
ok("shot review OFF (rim warning ON): the end-of-set area renders nothing", (await text()).trim() === "");
// 2. review on, rim off, phantom set
await setFlags(true, false); await go(); await p.evaluate(() => { window.__opens.length = 0; }); await p.evaluate(() => window.__p9.show(true)); await wait(1200);
const t2 = await text();
ok("rim warning OFF: only the review link shows, no banner", /Review your shots/i.test(t2) && !/Heads up/i.test(t2));
const opens2 = await p.evaluate(() => window.__opens.filter((n) => n === "hl-review").length);
ok("rim warning OFF: the review records were not even read before the player taps review", opens2 === 0, `hl-review opened ${opens2}x`);
// 3. rim on, clean set
await setFlags(true, true); await go(); await p.evaluate(() => window.__p9.show(false)); await wait(1500);
ok("clean set: no warning", !/Heads up/i.test(await text()) && /Review your shots/i.test(await text()));
// 4. rim on, phantom set
await go(); await p.evaluate(() => window.__p9.show(true)); await wait(1500);
const recsBefore2 = await p.evaluate(() => window.__p9.records());
let t = await text();
ok("phantom-like set: the warning appears in plain words with the marked shots", /Heads up/i.test(t) && /may be reading part of the rim as a ball/.test(t) && /4 shots are marked: 3, 4, 7, 9/.test(t), t.match(/\d shots? (is|are) marked[^\n]*/)?.[0]);
ok("warning says nothing was changed and how to fix a missed shot", /Nothing has been changed/.test(t) && /add any missed shot by hand/.test(t));
ok("no engineering terms in the warning", !JARGON.test(t), t.match(JARGON)?.[0] ?? "");
await p.screenshot({ path: `${SH}/p9-rim-banner.png` });
ok("the path to review: tap Review the marked shots", await click("Review the marked shots"));
await wait(1200); t = await text("[role=dialog]");
ok("review opens with the marked shots called out and filtered", /Marked shots: 3, 4, 7, 9/.test(t) && /Show only the marked shots/.test(t));
const chips = await p.$$eval("[role=dialog] ul[aria-label=Shots] button", (b) => b.map((x) => x.innerText.replace(/\s+/g, " ").trim()));
ok("only marked shots are listed, each with a flag", chips.length === 4 && chips.every((c) => c.startsWith("⚠")), chips.join(" | "));
await p.screenshot({ path: `${SH}/p9-rim-review.png` });
await p.evaluate(() => { const c = [...document.querySelectorAll("[role=dialog] input[type=checkbox]")].find((x) => /only the marked/i.test(x.parentElement.innerText)); c.click(); }); await wait(300);
const all = await p.$$eval("[role=dialog] ul[aria-label=Shots] button", (b) => b.length);
ok("the filter can be turned off to see all 12 shots", all === 12, String(all));
await click("Done", "[role=dialog]");
const recsAfter = await p.evaluate(() => window.__p9.records());
ok("review records are byte-identical after the warning and the review (nothing modified)", recsAfter === recsBefore2 && recsBefore2 === recsBefore);
// 5. lab: switch + preview
await go();
await p.evaluate(() => { [...document.querySelectorAll("summary")].find((x) => /Separate switches/.test(x.innerText)).click(); });
const lab = await p.evaluate(() => document.body.innerText);
ok("the lab has a clearly labelled, experimental switch (off unless turned on)", /Rim warning \(experimental\)/.test(lab) && (await p.evaluate(() => { const l = [...document.querySelectorAll("label")].find((x) => /Rim warning/.test(x.innerText)); return l.querySelector("input").checked; })));
await setFlags(false, false); await go();
await p.evaluate(() => { [...document.querySelectorAll("summary")].find((x) => /Separate switches/.test(x.innerText)).click(); });
ok("with defaults (nothing set) the rim warning switch is off", !(await p.evaluate(() => { const l = [...document.querySelectorAll("label")].find((x) => /Rim warning/.test(x.innerText)); return l.querySelector("input").checked; })));
ok("preview the rim warning (made-up set)", await click("Preview the rim warning")); await wait(800);
t = await text("[role=dialog]");
ok("the preview shows the warning on a made-up set and says it is invented", /Heads up/i.test(t) && /made-up/i.test(t) && /invented data/.test(t) && /\d shots are marked/.test(t));
await p.screenshot({ path: `${SH}/p9-rim-preview.png` });
ok("no page errors", errs.length === 0, errs.join("|"));
fs.writeFileSync("/Users/WatfordFamily/Desktop/basketball-app/training/eval/experiments/rim-warning/ui-e2e-desktop-chrome.json", JSON.stringify({ note: "Headless desktop Chrome at an iPhone-sized viewport. Made-up records written to the browser's review store. A functional check of the UI and of the flag gating, NOT an iPhone result and NOT a camera result.", checks: out.checks }, null, 1));
console.log(out.checks.filter((c) => !c.pass).length ? "SOME FAILED" : "ALL PASSED");
await b.close();
