import puppeteer from "puppeteer-core";
import fs from "node:fs";
const SH = "/private/tmp/claude-501/-Users-WatfordFamily-Desktop-basketball-app/d6fe762f-a87f-466b-a84e-5fe55a87eca6/scratchpad";
const out = { checks: [] };
const ok = (n, p, d = "") => { out.checks.push({ name: n, pass: !!p, detail: d }); console.log(p ? "PASS" : "FAIL", n, d); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const JARGON = /framing|image-horizontal|fingerprint|image-space|detector|detection|reconstruct|ambiguous|hardware|\bscore\b|\bbw\b|p-value|holm|framing group|schema|\brecord\b|\btrail\b|pixel|\bpx\b|uncertain/i;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 } });
const p = await b.newPage(); const errs = [], reqs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 200))); p.on("request", (r) => reqs.push(r.url()));
await p.goto("http://localhost:3101/lab/p8-demo", { waitUntil: "networkidle2", timeout: 120000 });
await p.waitForFunction(() => window.__p8);
await p.evaluate(() => { localStorage.setItem("hl:session-review", "1"); localStorage.setItem("hl:history:retain", "1"); });
const seeded = await p.evaluate(() => window.__p8.seed());
ok("real-derived file imports through the real import code", seeded && seeded.added === 8 && seeded.shots === 168, JSON.stringify(seeded));
const click = (label, scope = "body") => p.evaluate((label, scope) => { const x = [...document.querySelectorAll(`${scope} button`)].find((y) => y.innerText.toLowerCase().trim().startsWith(label.toLowerCase())); if (!x || x.disabled) return false; x.click(); return true; }, label, scope);
const text = () => p.evaluate(() => document.body.innerText);
const lint = (name, t) => { const m = t.match(JARGON); ok(`no engineering terms on ${name}`, !m, m ? `found "${m[0]}"` : ""); };
const shot = (n) => p.screenshot({ path: `${SH}/p8-${n}.png`, fullPage: false });

// ---- history
await p.evaluate(() => window.__p8.show("history")); await wait(1500);
let t = await text();
ok("history lists the sets with plain coverage wording", /shots: \d+ with a path/.test(t) && /Your sets/i.test(t), t.match(/\d+ shots: [^\n]*/)?.[0]);
ok("settings are hidden until asked for, with data present", !/Keep shot paths/.test(t));
lint("the history screen", t);
await click("Settings"); await wait(400); t = await text();
ok("settings: one switch, status, export/import/delete in plain words", /Keep shot paths/.test(t) && /Export to a file/i.test(t) && /Import a file/i.test(t) && /Delete everything/i.test(t) && /never uploaded/.test(t));
lint("the settings card", t);
await shot("history-settings");
await click("Settings"); await wait(200);
// open the first set and watch a shot
await p.evaluate(() => { const b = document.querySelector("[aria-label='Saved sets'] li button[aria-expanded]"); b.click(); }); await wait(400);
await p.evaluate(() => { const b = [...document.querySelectorAll("[aria-label='Saved sets'] li ul button")].find((x) => !/no path|^$/.test(x.title) && x.title === "Clear path"); (b || document.querySelector("[aria-label='Saved sets'] li ul button")).click(); }); await wait(600);
t = await text();
ok("watching a saved shot shows its path, a plain summary and how much to trust it", /Watch this shot|shot \d+ · (Make|Miss)/.test(t) && /(Clear path|Mostly clear|Not reliable|No path)/.test(t) && /ball/.test(t));
lint("the shot viewer", t);
const canvasInk = await p.evaluate(() => { const c = document.querySelector("[aria-label='Watch this shot'] canvas"); if (!c) return -1; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 2] > 150 && d[i + 1] > 150 || (d[i] > 200 && d[i + 2] < 120)) n++; return n; });
ok("the path is actually drawn", canvasInk > 30, `${canvasInk} bright pixels`);
await click("Play", "[aria-label='Watch this shot']"); await wait(1500);
ok("play steps through the sightings", /sighting \d+ of \d+/.test(await text()));
await shot("history-watch");
// makes vs misses
await p.evaluate(() => document.querySelector("[aria-label='Compare shots']").scrollIntoView()); await wait(300);
t = await text();
ok("makes-vs-misses compare shows counts and an honest sentence", /make path/.test(t) && /(Not enough to compare yet|not why)/.test(t), t.match(/(Not enough to compare yet|Makes crossed)[^\n]*/)?.[0]?.slice(0, 160));
ok("different camera setups are kept apart and said so", /Camera setup/.test(t) && /kept apart/.test(t));
lint("the compare section", t);
await shot("history-compare");
// pick mode
await click("Picked shots"); await wait(300);
ok("pick mode explains how to add shots", /Add this shot to a comparison/.test(t) || /Open a set above/.test(await text()));
// patterns
t = await text();
ok("patterns are in plain words and abstain when thin", /Patterns across sets/i.test(t) && /(Nothing stands out yet|where the ball was observed)/.test(t));
await p.evaluate(() => document.querySelector("[aria-label='Patterns']")?.scrollIntoView()); await wait(300); await shot("history-patterns"); lint("the patterns section", t);
// delete a set via the UI and check it is gone
p.once("dialog", (d) => d.accept());
const before = await p.evaluate(() => window.__p8.load());
await p.evaluate(() => { [...document.querySelectorAll("[aria-label='Saved sets'] li > div button")].filter((x) => x.innerText.toLowerCase() === "delete")[0].click(); }); await wait(1200);
const after = await p.evaluate(() => window.__p8.load());
ok("deleting a set from the list removes it and only it", after.sessions === before.sessions - 1 && after.shots < before.shots, JSON.stringify([before, after]));

// ---- review (end-of-set)
await p.evaluate(() => window.__p8.show("review")); await wait(800);
t = await text();
ok("review opens on Watch with plain coverage and a summary line", /Review your shots/i.test(t) && /Watch a shot/i.test(t) && /14 shots: \d+ with a path/.test(t), t.match(/14 shots[^\n]*/)?.[0]);
ok("review explains what the confidence label means", /(Clear path|Mostly clear|Not reliable|No path)/.test(t));
lint("review (Watch)", t);
await shot("review-watch");
await click("Play", "[role=dialog]"); await wait(900);
ok("review play shows a plain per-moment sentence", /(camera saw the ball here|not seen|estimate|resting|unsure|ignored|hidden|No path)/i.test(await text()));
await click("Next shot"); await wait(300);
ok("next shot works", /Shot 2 of 14/.test(await text()));
await click("Compare shots", "[role=tablist]"); await wait(500);
t = await text();
ok("compare tab: makes vs misses with counts and an honest sentence", /Makes vs misses/i.test(t) && /\d+ makes?\s*·\s*●?\s*\d+ miss/.test(t) && /(Not enough to compare yet|not why)/.test(t), t.match(/(Not enough to compare yet|Makes crossed)[^\n]*/)?.[0]?.slice(0, 140));
lint("review (Compare)", t);
await shot("review-compare");
await click("Pick shots"); await wait(300);
ok("pick shots lists checkboxes", (await p.$$eval("[aria-label='Compare shots'] input[type=checkbox]", (x) => x.length)) >= 10);
// ---- lab
await p.evaluate(() => window.__p8.show("lab")); await wait(1200);
t = await text();
ok("lab: replay test and live-camera-only sections are separate", /Test on this phone with saved data/i.test(t) && /Needs the live camera/i.test(t));
ok("lab says nothing has been checked on a real iPhone", /Checked on a real iPhone: nothing yet/i.test(t));
ok("lab lists all eight live-only checks, none validated", (t.match(/not validated by the app/g) ?? []).length === 8);
await click("Run the replay test"); await p.waitForFunction(() => document.body.innerText.includes("These are results on replayed data"), { timeout: 120000 });
t = await text();
const real = /Real saved data: 7 sets/.test(t);
ok("replay test ran on the real imported data (not made-up)", real, t.match(/(Real saved data|Made-up data)[^\n]*/)?.[0]);
const rows = await p.$$eval("[aria-label='Test with saved data'] tbody tr", (r) => r.map((x) => x.innerText.replace(/\s+/g, " ")));
for (const r of rows) console.log("   ", r);
ok("every replay row is labelled as replayed data", rows.length === 7 && rows.every((r) => /^Replayed data:/.test(r)));
ok("no replay row failed", rows.every((r) => !/\bfail\b/i.test(r)));
ok("clips row is not measured when no clips exist, never a pass", /not measured/.test(rows.find((r) => /video clips/.test(r)) || ""));
ok("replay says it shows nothing about the live camera", /say nothing about the live camera/.test(t));
await p.evaluate(() => document.querySelector("[aria-label='Test with saved data']").scrollIntoView()); await wait(300); await shot("lab-replay");
const mid = await p.evaluate(() => window.__p8.load()); ok("the replay test did not change the saved paths", mid.sessions === after.sessions && mid.shots === after.shots, JSON.stringify(mid));
ok("no page errors", errs.length === 0, errs.join(" | "));
ok("no request left this machine's dev server", reqs.every((u) => /localhost:3101/.test(u)));
fs.writeFileSync("/Users/WatfordFamily/Desktop/basketball-app/training/eval/experiments/product-readiness/ui-e2e-desktop-chrome.json", JSON.stringify({ note: "Headless desktop Chrome at an iPhone-sized viewport with real-derived paths. A functional check of the screens, NOT an iPhone result.", checks: out.checks }, null, 1));
console.log(out.checks.filter((c) => !c.pass).length ? "SOME FAILED" : "ALL PASSED");
await b.close();
