setTimeout(() => { console.log("WATCHDOG"); process.exit(2); }, 500000);
import fs from "node:fs";
import puppeteer from "puppeteer-core"; // run from a folder with puppeteer-core and axe-core installed. Routes: demo-pages/ (temporary) + p10/p12/p13 demo pages of earlier phases.
// Phase 14: the phone-placement question on the real saved-history path (IndexedDB), empty and missing-data states, touch targets and an
// accessibility audit (axe-core, WCAG 2 A/AA) of every screen the journey passes through, at iPhone size.
const B = "http://localhost:3101/lab";
const AXE = fs.readFileSync(new URL("./node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(url, { scheme = "light" } = {}) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  p.on("pageerror", (e) => { console.log("PAGEERROR", e.message); fails++; });
  await p.goto(url, { waitUntil: "networkidle0" });
  return p;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const click = (p, re, sel = "button,[role=tab],a,summary,label") => p.evaluate((s, r) => { const e = [...document.querySelectorAll(s)].find((x) => new RegExp(r, "i").test(x.innerText || "") || new RegExp(r, "i").test(x.getAttribute("aria-label") || "")); if (!e) return false; e.click(); return true; }, sel, re.source ?? re);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const small = (p) => p.evaluate(() => [...document.querySelectorAll("a[href],button,summary,input,select,[role=button],[role=tab]")].filter((e) => { const lab = e.tagName === "INPUT" ? e.closest("label") : null; const r = (lab ?? e).getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && e.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true }) && !e.closest("[aria-hidden=true],svg") && r.height < 40 && !(e.tagName === "A" && e.closest("p") && r.height >= 16); }).map((e) => `${(e.innerText || e.getAttribute("aria-label") || e.tagName).slice(0, 30)} ${Math.round(e.getBoundingClientRect().height)}px`));
async function axe(p, label) {
  await p.evaluate(AXE);
  const r = await p.evaluate(async () => { const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }); return res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 2).map((x) => x.target.join(" ").slice(0, 90) + " :: " + (x.any[0]?.message ?? x.all[0]?.message ?? "").slice(0, 110)) })); });
  const serious = r.filter((v) => v.impact === "serious" || v.impact === "critical");
  console.log(`   axe ${label}: ${r.length ? r.map((v) => `${v.id}(${v.impact},${v.n})`).join(", ") : "no violations"}`);
  for (const v of serious) console.log("      ", v.id, v.sample.join(" | "));
  return r;
}

// ---------- A. the phone-placement question, on the real saved-history path ----------
let p = await open(`${B}/p14-idb`);
await wait(1500);
ok(/Where they went/.test(await text(p)), "history: the real saved history opens (seeded into this browser's IndexedDB)");
await click(p, /Where they went/); await wait(400);
let t = await text(p);
const lean = t.match(/Most of your misses[^.]*\./)?.[0] ?? null;
console.log("   lean sentence:", lean ?? "(none: not enough misses or no clear side)");
ok(/Where was the phone\? \(optional\)/.test(t), "phone: an optional question is offered");
ok(!/answered/.test(t), "phone: nothing is claimed as answered before the player answers");
if (lean) ok(/not straight behind you/.test(t) && /short or long/.test(t), "phone: with no answer, a side is worded as what the picture shows and carries the reason it may be the phone");
await click(p, /Where was the phone/, "summary"); await wait(200);
ok(await click(p, /^Off to one side$/, "button"), "phone: choose 'Off to one side'"); await wait(900);
t = await text(p);
ok(/answered/.test(t), "phone: the answer is remembered and shown as answered");
ok(!/Most of your misses/.test(t), "phone: off to one side, the side of the misses is no longer stated as a lean");
if (lean) ok(/cannot be read as a lean in your shooting/.test(t), "phone: it says why instead");
ok(/Straight behind me/.test(t), "phone: the choices are plain words");
await p.goto(`${B}/p14-idb?keep=1`, { waitUntil: "networkidle0" }); await wait(1500);
await click(p, /Where they went/); await wait(400); await click(p, /Where was the phone/, "summary"); await wait(200);
t = await text(p);
ok(/answered/.test(t) && (await p.$$eval("fieldset button[aria-pressed=true]", (b) => b.map((x) => x.innerText))).includes("Off to one side"), "phone: the answer is still there after closing and reopening (saved on this phone)");
ok(await click(p, /^Straight behind me$/, "button"), "phone: change to 'Straight behind me'"); await wait(900);
t = await text(p);
if (lean) ok(/Most of your misses/.test(t) && /little off-centre/.test(t), "phone: straight behind: the side is stated again, with only the small-lean note");
ok(await click(p, /^Yes$/, "button"), "phone: 'the phone moved' answered yes"); await wait(900);
t = await text(p);
ok((await p.$$eval("fieldset button[aria-pressed=true]", (b) => b.map((x) => x.innerText))).includes("Yes"), "phone: moved = yes is kept");
console.log("   page after answers: camera-setup choices:", await p.$$eval("select option", (o) => o.map((x) => x.innerText.slice(0, 40))));
await p.screenshot({ path: "p14-phone.png", fullPage: true });
ok((await overflow(p)) <= 0, "phone: no sideways scrolling");
const sm1 = await small(p); console.log("   targets under 40px:", sm1.length ? sm1.join(" | ") : "none"); ok(sm1.length === 0, "phone: every tappable thing is at least 40 px tall");
await click(p, /Advanced: every path/, "summary"); await wait(400);
const sm2 = await small(p); console.log("   with Advanced open, targets under 40px:", sm2.length ? [...new Set(sm2)].slice(0, 12).join(" | ") : "none"); ok(sm2.length === 0, "phone: Advanced open: every tappable thing is at least 40 px tall");
ok((await overflow(p)) <= 0, "phone: Advanced open: no sideways scrolling");
await click(p, /Advanced: every path/, "summary"); await wait(200);
await axe(p, "saved history, patterns, question open");
await p.close();
// one set answered differently from the rest is kept apart from them (two sets filmed the same way)
p = await open(`${B}/p14-idb?dup=1`); await wait(1800);
await click(p, /Where they went/); await wait(300);
t = await text(p);
const opts0 = await p.$eval("select", (sel) => sel.options.length);
const firstSet = await p.$$eval("div[aria-label='Which set'] button", (b) => b.map((x) => x.innerText));
console.log("   camera setups:", opts0, "| in the first group, sets:", firstSet.length - 1, firstSet.slice(0, 3).join(" / "));
ok(firstSet.length - 1 >= 2, "phone: sets filmed the same way share one group");
await click(p, /^(?!All )/, "div[aria-label='Which set'] button"); await wait(400);
await click(p, /Where they went/); await wait(300);
await click(p, /Where was the phone/, "summary"); await wait(200);
await click(p, /^Yes$/, "button"); await wait(900);
const optsAfter = await p.$eval("select", (sel) => sel.options.length);
ok(optsAfter > opts0, `phone: one set whose phone moved is kept apart from the others (camera setups ${opts0} → ${optsAfter})`);
t = await text(p); ok(!/No shots in this set/.test(t), "phone: after a set moves to its own group the screen still shows shots, not an empty list");
await p.close();

// ---------- B. empty and missing-data states ----------
p = await open(`${B}/p14-idb?empty=1`); await wait(1200); t = await text(p);
ok(/No shot paths are kept yet/.test(t) && /Keep shot paths/.test(t), "empty history: plain words about what to do, no blank screen");
await axe(p, "empty saved history"); await p.close();
p = await open(`${B}/p12-demo?s=empty`); t = await text(p);
ok(/nothing to say yet/i.test(t) && /run a benchmark or track a drill/i.test(t), "empty progress: says what to do, not an empty chart");
const next0 = /Run the .* Benchmark/.test(t);
ok(next0, "empty progress: the next step is the first benchmark"); await axe(p, "progress overview, empty");
ok((await overflow(p)) <= 0, "empty progress: no sideways scrolling"); await p.close();
p = await open(`${B}/p12-demo?s=empty&view=shooting&range=all`); t = await text(p);
ok(!/NaN|undefined|Infinity/.test(t), "empty shooting: no NaN or undefined shown"); await p.close();
p = await open(`${B}/p12-demo?s=empty&view=benchmarks&range=all`); t = await text(p);
ok(!/NaN|undefined|Infinity/.test(t), "empty benchmarks: no NaN or undefined shown"); await p.close();
p = await open(`${B}/p12-demo?s=sparse`); t = await text(p);
ok(!/NaN|undefined|Infinity/.test(t) && /starting point/.test(t), "one result only: a starting point, never a trend"); await p.close();
p = await open(`${B}/p13-demo?s=nopath`); await click(p, /Shot 3, /); await wait(300); t = await text(p);
ok(/Missing tracking history|no saved path|No path was saved|not saved|no path/i.test(t), "no tracking history: said plainly"); await p.close();

// ---------- C. accessibility and touch targets of the journey screens ----------
const pages = [
  ["progress overview (rich)", `${B}/p12-demo?s=rich`, "light"],
  ["progress overview (rich, dark)", `${B}/p12-demo?s=rich`, "dark"],
  ["progress shooting", `${B}/p12-demo?s=rich&view=shooting&range=all`, "light"],
  ["progress kind of shot", `${B}/p12-demo?s=rich&view=shooting&category=off_the_dribble&range=all`, "light"],
  ["progress drill results", `${B}/p12-demo?s=rich&view=shooting&category=off_the_dribble&drill=Elbow%20Pull-Up%7CRight%20side&range=all`, "light"],
  ["progress benchmarks", `${B}/p12-demo?s=rich&view=benchmarks&range=all`, "light"],
  ["progress one benchmark", `${B}/p12-demo?s=rich&view=benchmarks&benchmark=free_throw&range=all`, "light"],
  ["progress mixed data-quality notes", `${B}/p12-demo?s=mixed&view=benchmarks&range=all`, "light"],
  ["shot explorer watch", `${B}/p13-demo?s=real`, "dark"],
  ["shot explorer uncertain tracking", `${B}/p13-demo?s=uncertain`, "dark"],
];
for (const [label, url, scheme] of pages) {
  p = await open(url, { scheme });
  const o = await overflow(p), s = await small(p);
  ok(o <= 0, `${label}: no sideways scrolling`);
  ok(s.length === 0, `${label}: every tappable thing is at least 40 px tall` + (s.length ? " :: " + s.slice(0, 5).join(" | ") : ""));
  const v = await axe(p, label);
  ok(!v.some((x) => x.impact === "serious" || x.impact === "critical"), `${label}: no serious or critical accessibility violations`);
  await p.close();
}
// compare and patterns modes of the explorer
p = await open(`${B}/p13-demo?s=real`, { scheme: "dark" });
for (const tab of ["Compare two", "Where they went"]) {
  await click(p, new RegExp(tab)); await wait(500);
  const v = await axe(p, "shot explorer " + tab);
  ok(!v.some((x) => x.impact === "serious" || x.impact === "critical"), `shot explorer ${tab}: no serious or critical accessibility violations`);
}
await p.close();
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
