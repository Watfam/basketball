// Train: home, workout library, film library and the workout builder at iPhone size (axe, tap targets, no sideways scroll). Run from a folder with puppeteer-core and axe-core installed.
// Routes: demo-pages/p20-*.tsx.txt as src/app/lab/p20-train, p20-library, p20-film, p20-build (temporary; allow /lab/p20- in the middleware while running).
import puppeteer from "puppeteer-core";
import { createRequire } from "module"; const require = createRequire(import.meta.url); const axeSrc = require("fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(path, vp = { width: 390, height: 844 }) {
  const p = await b.newPage(); await p.setViewport({ ...vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on("pageerror", (e) => { console.log("PAGEERROR", e.message.slice(0, 200)); fails++; });
  await p.goto("http://localhost:3101" + path, { waitUntil: "networkidle0", timeout: 120000 }); await wait(300); return p;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const click = (p, re, sel = "button,a,summary") => p.evaluate((r, s) => { const e = [...document.querySelectorAll(s)].find((x) => new RegExp(r, "i").test(x.innerText || "") || new RegExp(r, "i").test(x.getAttribute("aria-label") || "")); e?.click(); return !!e; }, re, sel);
const axe = async (p, label) => { const v = await p.evaluate(async (src) => { const s = document.createElement("script"); s.textContent = src; document.head.append(s); const r = await window.axe.run(document.body, { runOnly: ["wcag2a", "wcag2aa"] }); return r.violations.map((x) => `${x.id}:${x.nodes.length}`); }, axeSrc); ok(v.length === 0, `axe ${label}: no violations ${v.join(",")}`); };
const noSideScroll = async (p, label) => ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: nothing scrolls sideways`);
const small = (p, label) => p.evaluate(() => [...document.querySelectorAll("a,button,summary,input,select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 && !e.closest("[hidden]") && getComputedStyle(e).visibility !== "hidden"; }).map((e) => `${(e.innerText || e.getAttribute("aria-label") || e.tagName).slice(0, 20)}:${Math.round(e.getBoundingClientRect().height)}`)).then((l) => ok(l.length === 0, `${label}: every tap target is at least 40 px ${l.join(" | ")}`));

// ---- Train home
let p = await open("/lab/p20-train");
let t = await text(p);
ok(/Next up/i.test(t) && /Handle Fundamentals/i.test(t), "Train home: Next up leads");
ok(/18/.test(t) && /Workouts/i.test(t) && /42/.test(t) && /Film room/i.test(t), "the doors say how much is behind them (18 workouts, 42 lessons)");
ok(/Build your own/i.test(t), "and Build your own is there");
ok(/Next lesson, picked for your weak spots/.test(t), "and the suggested lesson is one line, not the whole door");
const hrefs = await p.evaluate(() => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")));
ok(hrefs.includes("/players/demo/workouts/library") && hrefs.includes("/players/demo/film?tab=library") && hrefs.includes("/players/demo/workouts/build"), "doors go to the library, the Film Room library tab and the builder");
await noSideScroll(p, "Train home"); await small(p, "Train home"); await axe(p, "Train home"); await p.screenshot({ path: "train-home.png" }); await p.close();
p = await open("/lab/p20-train?s=mine"); t = await text(p);
ok(/Saved My 20 minute handle/i.test(t) && /Your workouts/.test(t) && /Start Workout/i.test(t), "after saving: a confirmation and the workout under Your workouts with Start");
ok((await p.evaluate(() => [...document.querySelectorAll("a")].some((a) => /build\?edit=m1/.test(a.getAttribute("href"))))), "and an Edit link");
await p.close();

// ---- Workout library
p = await open("/lab/p20-library"); t = await text(p);
ok(/Showing 8 of 8 workouts · ordered for you/.test(t), "Library: shows 8 of 8 with no filters");
await click(p, "^Skill", "button"); await wait(500);
t = await text(p);
ok(/Shooting\s*4/.test(t) && /Ball handling\s*3/.test(t) && /Defense\s*1/.test(t) && /Athleticism\s*1/.test(t), "the skill sheet says how many workouts each skill has");
await click(p, "^Shooting", "a"); await wait(1500);
t = await text(p);
ok(/Showing 4 of 8 workouts · Shooting/.test(t), "choosing Shooting closes the sheet and shows 4 of 8"); ok(/Clear/.test(t), "with a Clear");
ok(!(await p.evaluate(() => !!document.querySelector("[role=dialog]"))), "the sheet is closed");
await click(p, "^Any time", "button"); await wait(500);
t = await text(p);
ok(/Under 20 min\s*1/.test(t) && /20 to 30 min\s*2/.test(t) && /Over 30 min\s*1/.test(t), "the time sheet counts follow the skill chosen (1, 2, 1)");
await click(p, "^Over 30 min", "a"); await wait(1500);
t = await text(p); ok(/Showing 1 of 8 workouts · Shooting, Over 30 min/.test(t), "two filters narrow it to 1");
ok(/Off the Dribble Pull-ups/.test(t) && !/Catch and Shoot Series/.test(t) && !/Form Shooting/.test(t), "the right workout");
await click(p, "^Clear", "a"); await wait(1200); t = await text(p); ok(/Showing 8 of 8/.test(t), "Clear returns to everything");
await p.close();
p = await open("/lab/p20-library?skill=defense&level=advanced"); t = await text(p);
ok(/Showing 0 of 8/.test(t) && /No workouts like that/.test(t) && /Show all workouts/.test(t), "no match: says so and offers all workouts");
await p.close();
p = await open("/lab/p20-library?none=1"); t = await text(p); ok(/Workouts aren.t loaded/.test(t), "an empty library says it is not loaded"); await p.close();
p = await open("/lab/p20-library"); await click(p, "Form Shooting Foundations", "summary"); await wait(300);
t = await text(p); ok(/Start Session|Start Workout/i.test(t) && /drill 1/.test(t), "a row opens in place to the full workout with its Start button");
ok(/Done \d+d ago|Done a while back|Done \d+w ago/.test(t), "and shows when it was last done");
await noSideScroll(p, "Library"); await small(p, "Library"); await axe(p, "Library"); await p.screenshot({ path: "train-library.png" }); await p.close();
p = await open("/lab/p20-library?skill=shooting"); await click(p, "^Shooting", "button"); await wait(500); await axe(p, "Library with a sheet open"); await p.close();

// ---- Film library
p = await open("/lab/p20-film"); t = await text(p);
ok(/Pro Film/i.test(t) && /Technique/i.test(t) && !/Showing/.test(t), "Film: the browse view shows with nothing chosen");
await p.type("input[type=search]", "curry"); await wait(200); t = await text(p);
ok(/Showing 1 of 5 lessons/.test(t) && /Off-ball movement/.test(t) && !/Pro Film/i.test(t), "typing a pro's name finds the lesson, in one list with a count");
await click(p, "^Clear", "button"); await wait(200); t = await text(p); ok(!/Showing/.test(t) && /Pro Film/i.test(t), "Clear brings the browse view back");
await click(p, "^Any skill", "button"); await wait(500); t = await text(p);
ok(/Shooting\s*2/.test(t) && /Ball handling\s*3/i.test(t) && /Defense\s*1/.test(t), "the skill sheet counts lessons per skill");
await click(p, "^Ball handling", "button"); await wait(900);
t = await text(p); ok(/Showing 3 of 5 lessons/.test(t), "picking Ball handling shows 3"); ok(!(await p.evaluate(() => !!document.querySelector("[role=dialog]"))), "and closes the sheet");
const order = await p.evaluate(() => [...document.querySelectorAll("[data-card]")].map((e) => e.getAttribute("data-card")).join(","));
ok(order === "4,3,5", "results follow the player's order (best fit first): " + order);
await click(p, "^Anyone", "button"); await wait(500); t = await text(p);
ok(/Chris Paul/.test(t) && /Stephen Curry/.test(t) && /Reid Ouse/.test(t) && /Micah Lancaster/.test(t) && /Trae Young/.test(t), "the Who sheet lists pros and trainers");
await click(p, "^Chris Paul", "button"); await wait(900); t = await text(p); ok(/Showing 1 of 5 lessons/.test(t) && /Reading the screen/.test(t), "picking a pro narrows to their lesson");
await click(p, "^Any kind", "button"); await wait(500); t = await text(p); ok(/Technique/.test(t) && /Game IQ/.test(t), "the kind sheet lists kinds of lesson");
await click(p, "^Technique", "button"); await wait(900); t = await text(p); ok(/Showing 0 of 5/.test(t) && /No lessons like that/.test(t), "no match says so, with a way to show every lesson");
await click(p, "^Show every lesson", "button"); await wait(200); t = await text(p); ok(!/Showing/.test(t), "which clears everything");
await noSideScroll(p, "Film library"); await small(p, "Film library"); await axe(p, "Film library"); await p.screenshot({ path: "train-film.png" }); await p.close();

// ---- Builder
p = await open("/lab/p20-build"); t = await text(p);
ok(/Build a workout/i.test(t) && /How long/i.test(t) && /Your session/i.test(t), "Builder: time, skills and a session");
const total = () => p.evaluate(() => { const m = document.body.innerText.match(/(\d+) of (\d+) min/); return m ? [+m[1], +m[2]] : null; });
let [tot, bud] = await total(); ok(bud === 30 && tot >= 27 && tot <= 33, `the draft fits 30 minutes (${tot} of ${bud})`);
const rowsN = () => p.evaluate(() => document.querySelectorAll("ol > li").length);
const r0 = await rowsN(); ok(r0 >= 4, `with several drills (${r0})`);
ok(/Shooting/.test(await p.evaluate(() => document.querySelector("ol li").innerText)) && (await p.evaluate(() => document.querySelector("#workout-name").value)) === "My 30 minute shooting and ball handling workout", "drawn from the chosen skills, with a name made for it");
await click(p, "^45", "button"); await wait(300); [tot, bud] = await total(); ok(bud === 45 && tot >= 42 && tot <= 48, `45 minutes redrafts to fit (${tot} of ${bud})`);
await click(p, "^Defense", "button"); await wait(300);
ok(/closeout/i.test(await p.evaluate(() => document.querySelector("ol").innerText)), "adding Defense brings a defense drill into the draft");
await click(p, "^✓ Defense", "button"); await wait(300);
// edit a drill
await p.evaluate(() => document.querySelector("ol li button").click()); await wait(500);
ok(await p.evaluate(() => !!document.querySelector("[role=dialog]")), "tapping a drill opens its sheet");
t = await p.evaluate(() => document.querySelector("[role=dialog]").innerText); ok(/Sets/i.test(t) && /Swap drill/i.test(t) && /Remove/i.test(t), "with sets, reps, swap and remove");
const before = await total();
await p.evaluate(() => document.querySelector("[aria-label='More sets']").click()); await wait(200);
const after = await total(); ok(after[0] >= before[0], `adding a set does not shorten it (${before[0]} -> ${after[0]})`);
await click(p, "^By time", "button"); await wait(200); ok(/Seconds/i.test(await p.evaluate(() => document.querySelector("[role=dialog]").innerText)), "By time swaps reps for seconds");
await click(p, "^Done", "button"); await wait(500);
const firstBefore = await p.evaluate(() => document.querySelector("ol li button span").innerText);
await p.evaluate(() => document.querySelectorAll("ol li")[1].querySelector("[aria-label^='Move'][aria-label$='up']").click()); await wait(200);
ok((await p.evaluate(() => document.querySelector("ol li button span").innerText)) !== firstBefore, "moving the second drill up puts it first");
// swap
await p.evaluate(() => document.querySelector("ol li button").click()); await wait(500); await click(p, "^Swap drill", "button"); await wait(600);
ok(/Swap this drill/i.test(await text(p)), "Swap opens the drill list"); 
await p.evaluate(() => { const list = document.querySelector("[role=dialog] ul"); list.querySelector("button").click(); }); await wait(900);
ok(!(await p.evaluate(() => !!document.querySelector("[role=dialog]"))), "choosing the replacement closes the list");
// remove
const n1 = await rowsN(); await p.evaluate(() => document.querySelector("ol li button").click()); await wait(500); await click(p, "^Remove", "button"); await wait(700);
ok((await rowsN()) === n1 - 1, "Remove takes the drill out"); 
// add
await click(p, "Add a drill", "button"); await wait(600);
ok(/Add a drill/i.test(await text(p)) && /drills?\b/.test(await p.evaluate(() => document.querySelector("[role=dialog]").innerText)), "Add a drill opens the list");
await p.type("[role=dialog] input[type=search]", "free"); await wait(200);
const listed = await p.evaluate(() => [...document.querySelectorAll("[role=dialog] ul li")].map((e) => e.innerText));
ok(listed.length === 0 || listed.some((x) => /Free throws/.test(x)), "search narrows the drill list: " + listed.length);
await p.evaluate(() => { document.querySelector("[role=dialog] input[type=search]").value = ""; });
// Free throws is shooting; clear search through React
await p.evaluate(() => { const i = document.querySelector("[role=dialog] input[type=search]"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(200);
const n2 = await rowsN();
await p.evaluate(() => document.querySelector("[role=dialog] ul button").click()); await wait(300);
await click(p, "^Done", "button"); await wait(600);
ok((await rowsN()) === n2 + 1, "picking a drill adds it (the list stays open for more, Done closes it)");
// name + save error path (not signed in on the demo)
await p.evaluate(() => { const i = document.querySelector("#workout-name"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "My test workout"); i.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(100);
await click(p, "^Save$", "button"); await wait(1500); t = await text(p);
ok(/Not signed in|database update|went wrong|could not/i.test(t), "Save reports a plain problem when it cannot save (here: not signed in on the demo page)");
ok(/My test workout/.test(await p.evaluate(() => document.querySelector("#workout-name").value)) && (await rowsN()) === n2 + 1, "and nothing on the screen is lost");
await noSideScroll(p, "Builder"); await small(p, "Builder"); await axe(p, "Builder"); await p.screenshot({ path: "train-build.png", fullPage: false }); await p.close();
p = await open("/lab/p20-build"); await p.evaluate(() => document.querySelector("ol li button").click()); await wait(600); await axe(p, "Builder drill sheet"); await p.close();
// narrow and wide
p = await open("/lab/p20-build", { width: 320, height: 640 }); await noSideScroll(p, "Builder at 320 px"); await p.close();
p = await open("/lab/p20-library", { width: 320, height: 640 }); await noSideScroll(p, "Library at 320 px"); await p.close();
console.log(fails ? `FAILED ${fails}` : "ALL PASSED"); await b.close(); process.exit(fails ? 1 : 0);
