import puppeteer from "puppeteer-core"; // run from a folder with puppeteer-core installed; routes: see demo-page.tsx.txt and the p12-demo page
// Phase 12: the benchmark screens in a real browser at iPhone size: the start screen and its fixed protocol, the clock in seconds, the workout card,
// and the Progress view (overview, benchmark detail, ranges, data-quality, sparse/empty/large histories).
const B = "http://localhost:3101/lab";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const text = (p) => p.evaluate(() => document.body.innerText);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const P_ = "11111111-1111-4111-8111-111111111111";
async function open(url, { pre, intercept } = {}) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on("pageerror", (e) => { console.log("PAGEERROR", e.message); fails++; });
  if (pre) await p.evaluateOnNewDocument((pre) => { for (const [k, v] of Object.entries(pre)) if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, pre);
  const bodies = [];
  if (intercept) { await p.setRequestInterception(true); p.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) { const b = r.postData() || ""; bodies.push(b);
      const payload = b.includes("workoutDrillId") ? { error: null, metrics: { type: "shooting", variant: "x", category: "stationary", category_basis: "drill_definition", makes: 4, attempts: 5, target: { kind: "shots", value: 5 }, tracking: { v: 1, source: "taps", shot_session_id: "44444444-4444-4444-8444-444444444444", camera_attempts: 0, camera_makes: 0, flipped: 0, added_by_hand: 5, rule_version: null, model_version: null, adjusted: null } }, action: "insert" } : { error: null, sessionId: "44444444-4444-4444-8444-444444444444" };
      return r.respond({ status: 200, contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(payload)}\n` }); }
    r.continue(); }); }
  await p.goto(url, { waitUntil: "networkidle0" });
  return { p, bodies };
}
const click = async (p, re) => { const h = await p.evaluateHandle((s) => [...document.querySelectorAll("button,a,summary")].find((e) => new RegExp(s, "i").test(e.innerText || e.getAttribute("aria-label") || "")), re); const el = h.asElement(); if (!el) throw new Error("no " + re); await el.click(); };
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const smallTargets = (p) => p.evaluate(() => [...document.querySelectorAll("a[href],button,summary,input,[role=button]")].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && r.height < 40 && e.tagName !== "circle"; }).map((e) => `${e.tagName}:${(e.innerText || e.getAttribute("aria-label") || "").slice(0, 30)}:${Math.round(e.getBoundingClientRect().height)}`));

// ---- A. the benchmark start screen ----
let { p, bodies } = await open(`${B}/p10-demo?view=bm-cs`, { pre: { "hl:camera:switch": "off" }, intercept: true });
let t = await text(p);
ok(/Benchmark v1 · the same test every time/i.test(t) && /Catch-and-Shoot Benchmark/i.test(t), "start: the benchmark protocol is shown");
ok(/Mark both wing spots|Mark your two wing spots/i.test(t) && /Sprint off the chair|sprint off the chair/i.test(t) && /First set: 15 reps to the right wing/i.test(t), "start: the fixed steps, spot and movement are shown");
ok(/Who is passing to you/i.test(t), "start: the one condition that changes the meaning is asked");
ok(/does not see|not see them|The camera does not see/i.test(t) && /do not show how the same shots go in a game/i.test(t), "start: says what the camera does not see, and that this is not game data");
let disabled = await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Start the benchmark/i.test(b.innerText))?.disabled);
ok(disabled === true, "start: cannot begin before answering who is passing");
await click(p, "A partner"); await wait(200);
disabled = await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Start the benchmark/i.test(b.innerText))?.disabled);
ok(disabled === false, "start: can begin once answered");
await p.screenshot({ path: "p12-start.png" });
await click(p, "Start the benchmark"); await wait(500);
const draft = await p.evaluate((P) => JSON.parse(localStorage.getItem(`hl:shots:${P}:draft`)), P_);
ok(draft?.context?.conditions?.pass_from === "partner" && draft.goal?.kind === "shots" && draft.goal.target === 5, "start: the draft carries the stated conditions");
for (let i = 0; i < 5; i++) await click(p, "^Make");
await wait(2500);
t = await text(p);
ok(/Added to your workout/i.test(t), "start: the set saved and attached");
ok(bodies.some((b) => b.includes("workoutDrillId") && b.includes("partner")), "start: the attach call carried who was passing");
await p.close();

// ---- B. the clock is seconds, and complete means the clock ran out ----
({ p, bodies } = await open(`${B}/p10-demo?view=bm-clock`, { pre: { "hl:camera:switch": "off" }, intercept: true }));
t = await text(p); ok(/90 seconds/i.test(t) && /Beat the Clock Benchmark/i.test(t), "clock: the protocol says 90 seconds");
await click(p, "Start the benchmark"); await wait(400);
const d2 = await p.evaluate((P) => JSON.parse(localStorage.getItem(`hl:shots:${P}:draft`)), P_);
ok(d2.clockSeconds === 10 && d2.goal === null, "clock: seconds are kept apart from the minutes goal (clockSeconds 10, no goal)");
await click(p, "^Make"); await wait(600);
t = await text(p); ok(/0:\d\d left/.test(t) && !/\d{2,}:\d\d left/.test(t.replace(/0:\d\d/g, "")), "clock: the counter counts down in seconds: " + (t.match(/\d:\d\d left/) || ["none"])[0]);
await wait(11000);
t = await text(p); ok(/Session saved/i.test(t), "clock: the set ends by itself when the clock runs out");
ok(bodies.some((b) => b.includes("workoutDrillId") && /clockComplete/.test(b) && /true/.test(b)), "clock: the full clock is reported as complete");
await p.close();
({ p, bodies } = await open(`${B}/p10-demo?view=bm-clock`, { pre: { "hl:camera:switch": "off" }, intercept: true }));
await click(p, "Start the benchmark"); await wait(300); await click(p, "^Make"); await wait(700); await click(p, "End session"); await wait(2500);
ok(bodies.some((b) => b.includes("workoutDrillId") && /false/.test(b)), "clock: ending early is reported as not complete");
await p.close();

// ---- C. the workout card ----
({ p } = await open(`${B}/p10-demo?view=bm-workout`));
t = await text(p);
ok(/Benchmark v1/i.test(t) && /Track benchmark with Camera/i.test(t), "card: the benchmark is labelled and offered");
console.log("   card text:", t.replace(/\n+/g, " | ").slice(0, 400));
ok(/10 reps per set/i.test(t) && /0\/3/.test(t) && !/12 reps per set/i.test(t), "card: still 3 sets of 10 in a week with a volume step of 2 (not stepped up to 12)");
ok(/Also: Curry: Feet Ready Before the Ball Arrives/i.test(t) && /Study session: Get Open Without the Ball \(3 lessons\)/i.test(t), "card: the second linked lesson and the study session are shown");
const href = await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => /Study session/i.test(a.innerText))?.getAttribute("href"));
ok(href === `/players/${P_}/film/sessions/s1`, "card: the study session link goes to the existing Film Room session page: " + href);
await p.screenshot({ path: "p12-card.png" });
await p.close();

// ---- D. Progress view ----
({ p } = await open(`${B}/p12-demo?s=rich`));
t = await text(p);
ok(/progress/i.test(t) && /workouts/i.test(t) && /shots tracked/i.test(t) && /benchmarks/i.test(t) && /next up/i.test(t), "progress: the four tiles");
ok(/3 of 3/.test(t), "progress: all three benchmarks have been run");
ok(/what this shows/i.test(t) && /more practice/i.test(t) && /better benchmark results/i.test(t) && /consistency/i.test(t) && /game transfer/i.test(t) && /not measured/i.test(t), "progress: the four different things are kept apart, and game transfer is 'not measured'");
ok(/effort, not skill/i.test(t), "progress: volume tiles say effort, not skill");
ok(!/improv/i.test((await p.evaluate(() => [...document.querySelectorAll("section[aria-label='At a glance'] a")].filter((a) => /Workouts|Shots tracked/.test(a.innerText)).map((a) => a.innerText).join(" ")))), "progress: the volume tiles never use the word improvement");
ok((await overflow(p)) <= 0, "progress: no sideways scrolling on a phone");
const small = (await smallTargets(p)).filter((x) => !/^A:SWITCH/.test(x)); // the existing top-bar Switch link is not part of this change console.log("   targets under 40px tall:", small.length ? small.join(" | ") : "none");
ok(small.length === 0, "progress: every tappable thing is at least 40 px tall");
await p.screenshot({ path: "p12-overview.png", fullPage: true });
await click(p, "Free Throw Benchmark"); await p.waitForSelector("svg [role=button]", { timeout: 20000 });
t = await text(p);
ok(/Benchmark v1 · the same test every time/i.test(t) && /results/i.test(t) && /First against latest/i.test(t), "detail: the benchmark detail opens from its card");
ok(/not a clear change|more than shot-to-shot/i.test(t), "detail: the comparison states its verdict");
ok(/plausible range/i.test(t), "detail: the range of normal variation is shown");
await p.screenshot({ path: "p12-detail.png", fullPage: true });
const pts = await p.$$("svg [role=button]"); ok(pts.length === 3, "detail: three tappable points for three results (" + pts.length + ")");
await pts[0].click(); await wait(300);
t = await text(p); ok(/Week 1 · planned benchmark week/i.test(t) && /17 of 30/i.test(t), "detail: tapping the first point shows week 1, 17 of 30");
const links = await p.evaluate(() => [...document.querySelectorAll("a")].filter((a) => /The workout|Every shot and replay/i.test(a.innerText)).map((a) => a.getAttribute("href")));
ok(links.length === 2 && /\/sessions\/33333333/.test(links[0]) && /\/shooting\/22222222/.test(links[1]), "detail: the result leads to its workout and to its shots and replay: " + links.join(", "));
ok((await overflow(p)) <= 0, "detail: no sideways scrolling");
await p.close();

// ranges
({ p } = await open(`${B}/p12-demo?s=rich&view=benchmarks&benchmark=free_throw&range=4w`));
t = await text(p); ok(/22 of 30/i.test(t) && !/17 of 30/i.test(t), "range: 4 weeks keeps only the recent results");
ok(/63% to 73%/.test(t), "range: the comparison now starts at week 3 (63% to 73%), not at the week-1 result outside the range");
await click(p, "Pick dates"); await wait(200);
await p.evaluate(() => { const [f, to] = document.querySelectorAll("input[type=date]"); f.value = "2000-01-01"; to.value = "2100-01-01"; });
await click(p, "^Show"); await wait(800);
ok(/from=2000-01-01/.test(p.url()) && /to=2100-01-01/.test(p.url()), "range: custom dates go into the address");
t = await text(p); ok(/17 of 30/i.test(t), "range: the custom range shows everything again");
await p.close();

// mixed / data quality / versions
({ p } = await open(`${B}/p12-demo?s=mixed&view=benchmarks&benchmark=free_throw`));
t = await text(p);
ok(/different version of this benchmark/i.test(t) && /free_throw@v2/i.test(t), "mixed: another version is shown apart, labelled, never compared");
ok(/Left out of comparisons/.test(t) || /not comparable/i.test(t), "mixed: the short run is marked as left out");
await p.evaluate(() => document.querySelectorAll("ol button")[1]?.click()); await wait(200);
t = await text(p); ok(/Run again 1 time/.test(t), "mixed: a redo is stated");
const cmpText = await p.evaluate(() => document.querySelector("[aria-label='First against latest']")?.innerText ?? "");
ok(/not a clear change|more than shot-to-shot|Too few/i.test(cmpText) && cmpText.length > 40, "mixed: the comparison is worded with its uncertainty");
await p.close();
({ p } = await open(`${B}/p12-demo?s=mixed&view=benchmarks&benchmark=catch_and_shoot`));
t = await text(p); ok(/A partner/i.test(t) && /conditions not recorded/i.test(t), "mixed: partner results and unrecorded-condition results are separate groups");
ok((t.match(/Plausible range for this result/g) || []).length >= 1, "mixed: every result shows its own range");
await p.close();

// sparse and empty
({ p } = await open(`${B}/p12-demo?s=sparse`)); t = await text(p);
ok(/1 of 3/.test(t) && !/clearly higher/i.test(t), "sparse: one result, nothing claimed"); await p.close();
({ p } = await open(`${B}/p12-demo?s=empty&view=benchmarks&benchmark=free_throw`)); t = await text(p);
ok(/not run yet/i.test(t) && /same way each time/i.test(t), "empty: a plain empty state that says what to do"); await p.close();
({ p } = await open(`${B}/p12-demo?s=empty`)); t = await text(p);
ok(/0 of 3/.test(t) && /No tracked drills in this range/.test(t), "empty: overview says there is nothing yet, without inventing anything"); await p.close();

// ---- E. a large history on a throttled phone ----
const ctx = await browser.createBrowserContext(); const big = await ctx.newPage();
await big.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const cdp = await big.createCDPSession(); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const t0 = Date.now(); await big.goto(`${B}/p12-demo?s=large&view=benchmarks&benchmark=free_throw&range=all`, { waitUntil: "load" }); const loadMs = Date.now() - t0;
await big.waitForSelector("svg [role=button]");
const showAllClicked = await big.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Show all 600/.test(x.innerText)); return !!b; });
const nodes = await big.evaluate(() => document.getElementsByTagName("*").length);
const taps = await big.evaluate(async () => { const pts = [...document.querySelectorAll("svg [role=button]")]; const times = []; for (const i of [0, 10, 20, pts.length - 1]) { const t = performance.now(); pts[i].dispatchEvent(new MouseEvent("click", { bubbles: true })); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); times.push(Math.round(performance.now() - t)); } return { times, points: pts.length }; });
console.log("   the Show all 600 button is offered:", showAllClicked);
console.log(`   large history (600 benchmark results, 1000 more tracked drills), 4x slower CPU, iPhone-size: load ${loadMs} ms, ${nodes} DOM nodes, ${taps.points} points, tap-to-detail ms ${taps.times.join("/")}`);
ok(taps.points === 40 && Math.max(...taps.times.slice(1)) < 250, "large: 600 results, the newest 40 drawn, a tap shows its detail in under 250 ms even with a 4x slower CPU (" + taps.times.join("/") + ")");
ok(loadMs < 8000, "large: the page loads in under 8 s on a 4x slower CPU (" + loadMs + " ms, development server)");
await big.close();

await browser.close(); console.log(fails ? "FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
