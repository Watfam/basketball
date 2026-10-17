setTimeout(() => { console.log("WATCHDOG"); process.exit(2); }, 560000);
import puppeteer from "puppeteer-core"; // run from a folder with puppeteer-core installed. Routes: demo-pages/ (temporary) + the replay sample at training/work/phone-replay/
// Phase 13: the redesigned shot review (watch one, compare two, where they went), the insights and the Progress drill-down, in a real browser at iPhone size.
const B = "http://localhost:3101/lab";
const SAMPLE = "/Users/WatfordFamily/Desktop/basketball-app/training/work/phone-replay/hardwood-lab-replay-sample.json";
const JARGON = /framing|image-horizontal|fingerprint|image-space|detector|detection|reconstruct|ambiguous|hardware|\bscore\b|\bbw\b|p-value|holm|schema|\brecord\b|\btrail\b|pixel|\bpx\b|uncertain/i;
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(url, { throttle } = {}) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const logs = { errors: [], keyWarnings: 0 };
  p.on("pageerror", (e) => { logs.errors.push(e.message); console.log("PAGEERROR", e.message); fails++; });
  p.on("console", (m) => { if (m.type() === "error" && /unique "key"/.test(m.text())) logs.keyWarnings++; });
  if (throttle) await (await p.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await p.goto(url, { waitUntil: "networkidle0" });
  return { p, logs };
}
const text = (p) => p.evaluate(() => document.body.innerText);
const clickText = (p, re, sel = "button,[role=tab],a,summary") => p.evaluate((s, r) => { const e = [...document.querySelectorAll(s)].find((x) => new RegExp(r, "i").test(x.innerText || "") || new RegExp(r, "i").test(x.getAttribute("aria-label") || "")); if (!e) return false; e.click(); return true; }, sel, re);
const timeLabel = (p) => p.evaluate(() => (document.querySelector("p[aria-live=polite]")?.innerText ?? "").match(/[+-]?\d+\.\d+ s/)?.[0] ?? null);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const small = (p) => p.evaluate(() => [...document.querySelectorAll("a[href],button,summary,input,select,[role=button],[role=tab]")].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && r.height < 40 && !(e.closest("svg")) && !e.closest("nextjs-portal"); }).map((e) => `${e.tagName}:${(e.innerText || e.getAttribute("aria-label") || "").slice(0, 28)}:${Math.round(e.getBoundingClientRect().height)}`));
const stages = (p) => p.evaluate(() => [...document.querySelectorAll("svg[role=img]")].filter((s) => !s.closest("details")).length);
const primary = (p) => p.evaluate(() => { const d = document.querySelector("details"); const c = document.body.cloneNode(true); c.querySelectorAll("details").forEach((x) => x.remove()); c.querySelectorAll("nextjs-portal,script,style").forEach((x) => x.remove()); return c.innerText; });

// ---------- A. the three ways to look, on real saved paths ----------
let { p } = await open(`${B}/p13-demo?s=real`);
let t = await text(p);
ok((await p.$$("[role=tab]")).length === 3 && /Watch a shot/.test(t) && /Compare two/.test(t) && /Where they went/.test(t), "three plain ways to look: watch a shot, compare two, where they went");
ok((await stages(p)) === 1, "watch: one clear picture, not a pile of lines");
ok((await p.$$("ul[aria-label='Shots in this set'] button")).length >= 6, "watch: every shot is a chip with a check or a cross");
ok(/[✓✕]/.test(t) && /(Make|Miss)/.test(t), "watch: make and miss are told apart by shape and word, not only by colour");
ok(/There is no video of a saved shot/i.test(t) && /not detected/i.test(t), "watch: honest that the rim and backboard are drawn for reference and there is no video after saving");
const prim = await primary(p);
ok(!JARGON.test(prim), "watch: no engineering words in the first view" + (JARGON.test(prim) ? ": " + prim.match(JARGON)[0] : ""));
ok(/Advanced: every path/i.test(t) && (await p.$$eval("details", (d) => d.every((x) => !x.open))), "advanced detail is there and closed");
await p.screenshot({ path: "r13-watch.png" });
const t0 = await timeLabel(p);
ok(await clickText(p, "^Play$|Play"), "watch: Play"); await wait(900); const t1 = await timeLabel(p);
ok(t1 !== null && t1 !== t0, `watch: playing moves time (${t0} → ${t1})`);
await clickText(p, "^Pause$|Pause"); await wait(150); const a = await timeLabel(p); await wait(500); const b2 = await timeLabel(p);
ok(a === b2, "watch: Pause holds the moment");
await p.evaluate(() => { const r = document.querySelector("input[type=range]"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(r, r.min); r.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(200);
const s0 = await timeLabel(p); await p.evaluate(() => document.querySelector("button[aria-label='Forward one sighting']").click()); await wait(150); const s1 = await timeLabel(p);
ok(s0 !== s1, `watch: scrubbing to the start and stepping forward one sighting moves it (${s0} → ${s1})`);
const before = await p.$$eval("ul[aria-label='Shots in this set'] button", (b) => b.findIndex((x) => x.getAttribute("aria-pressed") === "true"));
await p.evaluate(() => document.querySelector("button[aria-label='Next shot']")?.click()); await wait(300);
const after = await p.$$eval("ul[aria-label='Shots in this set'] button", (b) => b.findIndex((x) => x.getAttribute("aria-pressed") === "true"));
ok(before !== after, `watch: next shot moves the selection (chip ${before} → ${after})`);
ok((await p.$$("select")).length === 1 && (await p.$$eval("select option", (o) => o.length)) >= 2, "watch: different camera setups are kept apart and can be chosen");
const countBefore = (await text(p)).match(/All (\d+) shots/)?.[1];
await p.select("select", "1"); await wait(300); const countAfter = (await text(p)).match(/All (\d+) shots/)?.[1];
ok(countBefore !== countAfter, `watch: choosing another camera setup changes the shots shown (${countBefore} → ${countAfter})`);
await p.select("select", "0"); await wait(200);
ok((await overflow(p)) <= 0, "watch: no sideways scrolling on a phone");
const sm = await small(p); console.log("   targets under 40px tall:", sm.length ? sm.join(" | ") : "none"); ok(sm.length === 0, "watch: every tappable thing is at least 40 px tall");

// compare
await clickText(p, "Compare two"); await wait(500); t = await text(p);
ok(/Shot A/i.test(t) && /Shot B/i.test(t) && /✓ Make/.test(t) && /✕ Miss/.test(t), "compare: a make and a miss are picked to start");
ok((await stages(p)) === 1, "compare: both shots on one picture, lined up");
ok(/Lined up at the moment each ball was seen coming down past the rim/i.test(t), "compare: says what they are lined up on");
ok(/What the camera saw/i.test(t) && /Where it came down past the rim/i.test(t) && /Highest point in the picture/i.test(t), "compare: observed differences, in the picture's own terms");
ok(/does not say which/i.test(t), "compare: says a difference is not a reason");
ok(!/your (form|mechanics|footwork) |should (shoot|change)|fix your|caused by/i.test(await primary(p)), "compare: never explains a difference as a shooting fault");
await p.screenshot({ path: "r13-compare.png", fullPage: true });
await clickText(p, "Side by side"); await wait(300); ok((await stages(p)) === 2, "compare: side by side shows two pictures");
await clickText(p, "^Swap$"); await wait(200); ok(/A ✕ Miss/.test(await text(p)), "compare: swap exchanges A and B");

// patterns
await clickText(p, "Where they went"); await wait(500); t = await text(p);
const bars = await p.$$("svg[role=group] g[role=button]");
ok(bars.length > 3 && /Tap a bar to watch/i.test(t), `patterns: a summary of ${bars.length} bars, not dozens of overlapping lines`);
ok(!/farther from the rim|closer to the rim/i.test(t), "patterns: no 'makes were closer to the rim' restatement");
ok(/make/.test(t) && /miss/.test(t) && /(no clear side|were seen coming down to the (left|right))/i.test(t), "patterns: which side the misses went, only as the picture shows it, or no clear side");
await p.screenshot({ path: "r13-patterns.png", fullPage: true });
await bars[Math.floor(bars.length / 2)].evaluate((e) => e.dispatchEvent(new MouseEvent("click", { bubbles: true }))); await wait(400);
ok(await p.$eval("[role=tab][aria-selected=true]", (e) => /Watch a shot/.test(e.innerText)), "patterns: tapping a bar opens that shot to watch");
await clickText(p, "Where they went"); await wait(300);
ok(await clickText(p, "Watch a typical miss"), "patterns: a typical miss to watch") ; await wait(300);
ok(await p.$eval("[role=tab][aria-selected=true]", (e) => /Watch a shot/.test(e.innerText)), "patterns: ...opens in Watch");
await clickText(p, "Where they went"); await wait(300); await clickText(p, "Compare a typical make with a typical miss"); await wait(400);
ok(await p.$eval("[role=tab][aria-selected=true]", (e) => /Compare two/.test(e.innerText)), "patterns: a typical make against a typical miss opens in Compare");
await p.close();

// ---------- B. the awkward cases ----------
({ p } = await open(`${B}/p13-demo?s=clear`)); t = await text(p);
ok(/✓ Make|✕ Miss/.test(t) && (await stages(p)) === 1, "clear make and clear miss: both watchable"); await p.close();
({ p } = await open(`${B}/p13-demo?s=incomplete`)); await clickText(p, "Shot 1, "); await wait(300); t = await text(p);
ok(/(Mostly clear|Clear path)/i.test(t) && (await stages(p)) === 1, "incomplete path: a short path is shown as seen, with its confidence, nothing filled in"); await p.close();
({ p } = await open(`${B}/p13-demo?s=uncertain`)); await wait(200); t = await text(p);
ok(/sighting.* not sure \(hollow dots\)/i.test(t) && /stretch(es)? not seen \(dashed\)/i.test(t), "uncertain tracking: hollow dots and dashed stretches are named");
ok(await p.evaluate(() => [...document.querySelectorAll("svg[role=img] circle")].some((c) => c.getAttribute("stroke") === "#9aa4b2")), "uncertain tracking: unsure sightings are drawn hollow");
await p.screenshot({ path: "r13-uncertain.png" });
await clickText(p, "Back one sighting|◂"); await p.evaluate(() => { const r = document.querySelector("input[type=range]"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(r, r.min); r.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(200);
await p.close();
({ p } = await open(`${B}/p13-demo?s=nopath`)); await clickText(p, "Shot 1, "); await wait(300); t = await text(p);
ok(/No path was saved for this shot, only whether it went in|saw the ball too few times/i.test(t) && (await stages(p)) === 0, "a session without a path: said plainly, nothing invented, no picture"); await p.close();
({ p } = await open(`${B}/p13-demo?s=corrected`)); await clickText(p, "Shot 2, "); await wait(300); t = await text(p);
ok(/You changed the camera.s call on this one/.test(t), "a manually corrected shot says the player changed the call"); await p.close();
({ p } = await open(`${B}/p13-demo?s=sparse`)); await clickText(p, "Where they went"); await wait(300); t = await text(p);
ok(/not enough to say which side|It takes at least 8/i.test(t) || !/Most of your misses/.test(t), "sparse history: no side is claimed from a few shots"); await p.close();

// ---------- C. a large history on a throttled phone ----------
{
  const t0 = Date.now(); const big = await open(`${B}/p13-demo?s=large`, { throttle: 4 }); const load = Date.now() - t0;
  const n = (await text(big.p)).match(/All (\d+) shots/)?.[1];
  const sw = await big.p.evaluate(async () => { const out = {}; for (const name of ["Where they went", "Compare two", "Watch a shot"]) { const tab = [...document.querySelectorAll("[role=tab]")].find((x) => x.innerText.includes(name)); const t = performance.now(); tab.click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); out[name] = Math.round(performance.now() - t); } return out; });
  const nodes = await big.p.evaluate(() => document.getElementsByTagName("*").length);
  console.log(`   large history (${n} shots in 3 camera setups x10 sets), 4x slower CPU, iPhone-size: load ${load} ms, ${nodes} elements, tab switches ms ${JSON.stringify(sw)}`);
  ok(Math.max(...Object.values(sw)) < 400, "large: switching between watch, compare and patterns takes under 400 ms on a 4x slower CPU");
  const nxt = await big.p.evaluate(async () => { const t = performance.now(); document.querySelector("button[aria-label='Next shot']")?.click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round(performance.now() - t); });
  ok(nxt < 400, `large: moving to the next shot takes ${nxt} ms`);
  await big.p.close();
}

// ---------- D. progress: insights and the way down ----------
({ p } = await open(`${B}/p12-demo?s=rich`)); t = await text(p);
ok(/What your results say/i.test(t), "progress: the first thing shown is what the results say");
const cards = await p.$$("section[aria-label='What your results say'] > ul > li"); ok(cards.length === 3, "progress: three insights first, the rest one tap away (" + cards.length + ")");
ok(/Clear/.test(t) && /Not clear yet/.test(t), "progress: each says whether the evidence is clear");
ok(/next/i.test(t) && /(Run the|Another full run)/i.test(t), "progress: a next step");
await p.close(); ({ p } = await open(`${B}/p12-demo?s=next`)); ok(/Run the Catch-and-Shoot Benchmark/.test(await text(p)) && /Playing Without the Ball/.test(await text(p)), "progress: the next step is the benchmark with fewest runs, with the Film Room lesson for its drill"); await p.close(); ({ p } = await open(`${B}/p12-demo?s=rich`)); ok(!/improv/i.test(await p.evaluate(() => [...document.querySelectorAll("li")].filter((x) => /shots tracked in/i.test(x.innerText)).map((x) => x.innerText).join(" "))), "progress: the volume line never says improvement");
ok(/How sure is this/i.test(t), "progress: the detail is behind 'How sure is this?'");
await p.screenshot({ path: "r13-progress.png", fullPage: true });
const link = await p.$$eval("section[aria-label='What your results say'] a", (a) => a.map((x) => x.getAttribute("href")).find((h) => /view=benchmarks/.test(h)));
ok(!!link, "progress: an insight about a benchmark leads to its sessions: " + link);
await p.evaluate((h) => document.querySelector(`a[href='${h}']`).click(), link); await p.waitForSelector("svg [role=button]", { timeout: 20000 });
ok(/Benchmark v1/i.test(await text(p)), "progress: ...and opens that benchmark's results"); await p.close();

({ p } = await open(`${B}/p12-demo?s=rich&view=shooting&range=all`)); t = await text(p);
ok(/Stationary|Catch-and-shoot|Off-the-dribble/i.test(t) && /side by side|never ranked|different shots/i.test(t), "shooting: kinds of shot side by side, not ranked");
ok(await clickText(p, "Off-the-dribble", "a"), "shooting: tap a kind of shot"); await p.waitForFunction(() => /Elbow Pull-Up/.test(document.body.innerText), { timeout: 20000 });
t = await text(p); ok(/Elbow Pull-Up/.test(t) && /Wing Step-Back/.test(t), "shooting: its drills");
ok(/range=all/.test(await p.$eval("a[href*='drill=']", (a) => a.getAttribute("href"))), "shooting: the link keeps the dates");
ok(await clickText(p, "Elbow Pull-Up . Right side", "a"), "shooting: tap a drill"); await p.waitForSelector("svg [role=button]", { timeout: 20000 }); t = await text(p);
ok(/First against latest/i.test(t) && /Practice this/i.test(t) && /Footwork Into the Pull-Up/.test(t), "shooting: drill results over time, its Film Room lesson and a way to practise it");
const href = await p.$$eval("a", (a) => a.map((x) => x.getAttribute("href")).find((h) => /\/shooting\/.*\?from=/.test(h ?? "")));
const from = href ? decodeURIComponent(href.split("from=")[1]) : "";
ok(/^\/lab\/p12-demo\?/.test(from) && /view=shooting/.test(from) && /drill=/.test(from), "shooting: each result leads to its shots and replay and carries the way back: " + from.slice(0, 90));
const back = await p.$$eval("a", (a) => a.filter((x) => /‹/.test(x.innerText)).map((x) => x.getAttribute("href")));
ok(back.some((h) => /view=shooting/.test(h) && /category=off_the_dribble/.test(h) && /range=all/.test(h)), "shooting: Back goes up one step, to the same kind of shot and the same dates");
ok((await overflow(p)) <= 0, "shooting: no sideways scrolling");
await p.screenshot({ path: "r13-drill.png", fullPage: true }); await p.close();

// ---------- E. the real shot history, with the real sample, in the real app component ----------
{
  const r = await open(`${B}/p13-sample`); p = r.p;
  const input = await p.$("section[aria-label='Replay sample'] input[type=file]"); await input.uploadFile(SAMPLE); await wait(1200);
  await clickText(p, "Import 8 sets"); await wait(1500);
  ok(await clickText(p, "Browse the sample"), "real history: open the sample in the app's own shot history"); await wait(1800); t = await text(p);
  ok(/Watch a shot/.test(t) && /Compare two/.test(t) && /Where they went/.test(t), "real history: the new three-way view is what opens");
  ok(!/Makes vs misses|Patterns across sets/i.test(await primary(p)), "real history: the old cluttered overlay and 'Patterns across sets' are no longer in the first view");
  ok(await clickText(p, "Advanced: every path", "summary"), "real history: advanced is one tap away"); await wait(500); t = await text(p);
  ok(/Statistics across sets/i.test(t) && /Show up to 120 paths|Show fewer/.test(t) && /Makes vs misses/.test(t), "real history: the old paths, measurements and statistics are all still there, in Advanced");
  ok(/so they are kept here and not shown first/.test(t), "real history: the statements that restate what a miss is are labelled and kept out of the first view");
  ok(r.logs.keyWarnings === 0, `real history: no React key warnings from the real components (${r.logs.keyWarnings})`);
  await p.screenshot({ path: "r13-history-advanced.png", fullPage: true });
  await p.close();
}
await browser.close(); console.log(fails ? "FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
