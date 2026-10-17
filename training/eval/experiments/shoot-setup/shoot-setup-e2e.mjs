setTimeout(() => { console.log("WATCHDOG"); process.exit(2); }, 400000);
import fs from "node:fs";
import puppeteer from "puppeteer-core"; // run from a folder with puppeteer-core and axe-core installed. Route: demo-pages/shoot-demo.tsx.txt as /lab/p17-shoot (temporary).
// The Shoot setup (start first): a new player, go again, each picker, Start, and the checks that matter on a phone.
const URL_ = "http://localhost:3101/lab/p17-shoot";
const P = "11111111-1111-4111-8111-111111111111";
const AXE = fs.readFileSync(new URL("./node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
await browser.defaultBrowserContext().overridePermissions("http://localhost:3101", ["camera"]);
// innerText follows CSS (some headings are uppercase), so the text checks ignore case.
const nativeTest = RegExp.prototype.test;
RegExp.prototype.test = function (str) { return nativeTest.call(new RegExp(this.source, this.flags.includes("i") ? this.flags : this.flags + "i"), str); };
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(seed = {}, { scheme = "light" } = {}) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  p.on("pageerror", (e) => { console.log("PAGEERROR", e.message.slice(0, 160)); fails++; });
  await p.evaluateOnNewDocument((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed);
  await p.goto(URL_, { waitUntil: "networkidle0", timeout: 180000 });
  await p.waitForSelector("section[aria-label='New session']", { timeout: 60000 }); await wait(300);
  return p;
}
const text = (p) => p.evaluate(() => document.querySelector("section[aria-label='New session']").innerText.replace(/\s+/g, " "));
const click = (p, re, scope = "body") => p.evaluate((s, r) => { const e = [...document.querySelector(s).querySelectorAll("button,a")].find((x) => new RegExp(r, "i").test((x.innerText || "") + " " + (x.getAttribute("aria-label") || ""))); if (!e) return false; e.click(); return true; }, scope, re.source ?? re);
const dialog = (p) => p.evaluate(() => { const d = document.querySelector("[role=dialog]"); return d ? d.innerText.replace(/\s+/g, " ") : null; });
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const small = (p) => p.evaluate(() => [...document.querySelectorAll("a[href],button,summary,input,select,[role=radio]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.checkVisibility() && r.height < 40 && !e.closest("nav"); }).map((e) => `${(e.innerText || e.getAttribute("aria-label") || e.tagName).replace(/\s+/g, " ").slice(0, 30)} ${Math.round(e.getBoundingClientRect().height)}px`));
async function axe(p, label) {
  await p.evaluate(AXE);
  const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, s: v.nodes[0].target.join(" ").slice(0, 80) + " :: " + (v.nodes[0].any[0]?.message ?? "").slice(0, 90) })));
  console.log(`   axe ${label}: ${r.length ? r.map((v) => `${v.id}(${v.impact},${v.n})`).join(", ") : "no violations"}`); for (const v of r.filter((x) => x.impact === "serious" || x.impact === "critical")) console.log("      ", v.s);
  return !r.some((x) => ["serious", "critical"].includes(x.impact));
}
const gone = async (p, ms = 700) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (!(await p.$("[role=dialog]"))) return true; await wait(40); } return false; };
const cardText = (p) => p.evaluate(() => document.querySelector("[aria-label='What Start will do']")?.innerText.replace(/\s+/g, " ") ?? "");
const dlgTop = (p) => p.evaluate(() => Math.round(document.querySelector("[role=dialog]").getBoundingClientRect().top));
// A finger: down at (x, y), drag down by dy in steps over ms, and optionally hold it there (hold) or let go.
async function swipe(p, y, dy, { steps = 12, ms = 360, hold = false, x = 195 } = {}) {
  await p.touchscreen.touchStart(x, y);
  for (let i = 1; i <= steps; i++) { await p.touchscreen.touchMove(x, y + (dy * i) / steps); await wait(ms / steps); }
  if (!hold) await p.touchscreen.touchEnd();
}
const swipeCloses = async (p) => { const t = await dlgTop(p); await swipe(p, t + 20, 220); return gone(p); };
const startRect = (p) => p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /start shooting/i.test(x.innerText)); const r = b.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; });
const draft = (p) => p.evaluate((P) => JSON.parse(localStorage.getItem(`hl:shots:${P}:draft`) ?? "null"), P);
const RECENT = JSON.stringify([{ label: "Random", goal: null }, { label: "Free throws", goal: { kind: "shots", target: 25 } }, { label: "Mid-range", goal: { kind: "makes", target: 10 } }]);

// ---------- a player who has shot before: go again ----------
let p = await open({ [`hl:shots:${P}:recent`]: RECENT, "hl:shots:count": "camera", "hl:shots:goal": "none" });
let t = await text(p);
ok(/Go again Random Camera · no goal · last 2 sets 53%/.test(t), "go again: the card says what Start will do: 'Random · Camera · no goal · last 2 sets 53%'");
ok(/Change something What you are shooting Random › How to count Camera › Goal No goal ›/.test(t), "three rows: what you are shooting, how to count, goal");
ok(!/Or name your own|Last 2 sets:/.test(t) && !/How to count How to count/.test(t), "the old stack of chips, text box, counting cards and goal bar is gone");
const sr = await startRect(p); ok(sr.bottom < 844 - 70 && sr.h >= 44, `Start is on the first screen, above the tab bar (bottom at ${sr.bottom}px of 844) and big (${sr.h}px)`);
ok((await overflow(p)) <= 0, "no sideways scrolling");
await p.screenshot({ path: "s-main.png" });
// drill sheet
ok(await click(p, /What you are shooting/), "tap 'What you are shooting'"); await wait(400);
let d = await dialog(p);
ok(d && /What are you shooting\?/.test(d) && /Recent/.test(d) && /Free throws 25 shots/.test(d) && /Mid-range Make 10/.test(d), "the drill sheet opens, with the other recent setups (drill and goal) on top");
ok(!/Random 25 shots/.test(d), "the setup already on the card is not offered again");
ok(/Free throws 66\.7%/.test(d) && /Random 53%/.test(d), "each drill shows how the last sets of it went");
ok(await p.evaluate(() => [...document.querySelectorAll("[role=radio]")].filter((x) => x.getAttribute("aria-checked") === "true").map((x) => x.innerText.replace(/\s+/g, " ")).join("|").startsWith("Random")), "the chosen drill is marked (orange tint and a check) and exposed as selected");
const sm1 = await small(p); ok(sm1.length === 0, "every row in the sheet is at least 40 px tall" + (sm1.length ? " :: " + sm1.join(" | ") : ""));
ok(await axe(p, "drill sheet open"), "no serious accessibility violations with the sheet open");
await p.screenshot({ path: "s-drill.png" });
ok(await click(p, /^Free throws/, "[role=dialog] [role=radiogroup]"), "tap 'Free throws'"); await wait(400);
ok((await dialog(p)) !== null, "choosing does NOT close the sheet: pick, look, change your mind");
ok(await p.evaluate(() => [...document.querySelectorAll("[role=radio]")].filter((x) => x.getAttribute("aria-checked") === "true").map((x) => x.innerText.replace(/\s+/g, " ")).join("|").startsWith("Free throws")), "the tick moves to Free throws");
ok(/Your setup Free throws Camera · no goal · last 3 sets 66\.7%/.test(await cardText(p)), "and the card behind the sheet already reads 'Your setup · Free throws', with the last sets of free throws");
ok(await swipeCloses(p), "pulling the sheet down closes it"); 
t = await text(p); ok(/What you are shooting Free throws ›/.test(t), "the row shows the new drill");
// recent setup applies drill and goal together
await click(p, /What you are shooting/); await wait(300); await click(p, /^Mid-range\s+Make 10/, "[role=dialog]"); await wait(400);
ok(/Mid-range/.test(await cardText(p)) && /Make 10/.test(await cardText(p)), "a recent setup applies the drill and its goal together (sheet still open)");
ok(await click(p, /^Done/, "[role=dialog]") && await gone(p), "Done closes it");
// counting sheet
await click(p, /How to count/); await wait(300); d = await dialog(p);
ok(/How do you want to count\?/.test(d) && /Camera Phone on a stand counts/.test(d) && /Tap counter Tap make or miss yourself/.test(d), "the counting sheet: two rows, each with a plain sentence");
ok(await click(p, /^Tap counter/, "[role=dialog]"), "tap 'Tap counter'"); await wait(400);
ok((await dialog(p)) !== null && /Tap counter · Make 10/.test(await cardText(p)), "counting changes on the card and the sheet stays open");
ok(await swipeCloses(p), "swipe it away");
t = await text(p); ok(/How to count Tap counter ›/.test(t), "the row shows Tap counter");
ok(await p.evaluate(() => localStorage.getItem("hl:shots:count")) === "tap", "and it is remembered for next time");
// goal sheet
await click(p, /^Goal/); await wait(300); d = await dialog(p);
ok(/Set a goal\?/.test(d) && /No goal I will end the set myself/.test(d) && /Shots Ends after this many shots/.test(d) && /In a row/.test(d), "the goal sheet lists the four goals and 'no goal', each with a plain sentence");
ok(await click(p, /^Shots/, "[role=dialog]"), "tap 'Shots'"); await wait(300);
d = await dialog(p); ok(/25 50 100/.test(d) && /50 shots/.test(d) && /Done/.test(d), "an amount appears (25, 50, 100, and the stepper), with Done");
await click(p, /More/, "[role=dialog]"); await wait(150); d = await dialog(p); ok(/55 shots/.test(d), "the + button adds five");
await wait(300);
ok(await p.evaluate(() => { const r = document.querySelector("[role=dialog]").getBoundingClientRect(); const at = document.elementFromPoint(100, innerHeight - 6); return Math.round(r.bottom) === innerHeight && !!at.closest("[role=dialog]"); }), "the sheet reaches the bottom of the screen and covers the tab bar (it once stopped 24 px short and showed the tab bar through)");
ok(await axe(p, "goal sheet open"), "no serious accessibility violations (goal sheet)");
await p.screenshot({ path: "s-goal.png" });
await p.keyboard.press("Escape");
ok(await gone(p), "Escape closes the sheet");
ok(await p.evaluate(() => document.activeElement?.innerText?.includes("Goal")), "focus goes back to the row that opened it");
t = await text(p); ok(/Tap counter · 55 shots/.test(t), "the goal is on the card (55 shots), and it is remembered");
await p.screenshot({ path: "s-changed.png" });
// a streak note
await click(p, /^Goal/); await wait(300); await click(p, /^In a row/, "[role=dialog]"); await wait(200); ok(/Stops at 100 shots/.test(await dialog(p)), "'in a row' says it stops at 100 shots"); await click(p, /No goal/, "[role=dialog]"); await wait(300);
ok((await dialog(p)) !== null && /no goal/.test(await cardText(p)), "'No goal' updates the card and leaves the sheet open");
await click(p, /^Done/, "[role=dialog]"); ok(await gone(p), "Done closes the goal sheet");
// a name of your own
await click(p, /What you are shooting/); await wait(300);
await p.type("input[aria-label='Name your own drill']", "Corner threes"); await p.keyboard.press("Enter"); await wait(400);
ok(/Your setup Corner threes/.test(await cardText(p)) && (await dialog(p)) !== null, "naming your own drill uses it (sheet open, the name is now in the list)");
await p.keyboard.press("Escape"); await gone(p);
// ---- the swipe, in detail ----
await click(p, /What you are shooting/); await wait(500);
let top0 = await dlgTop(p);
await swipe(p, top0 + 20, 160, { hold: true }); await wait(60);
let top1 = await dlgTop(p);
ok(Math.abs(top1 - top0 - 152) <= 6, `the sheet follows the finger while it is held down (moved ${top1 - top0}px for a ${160}px pull)`);
ok(await p.evaluate(() => { const b = document.querySelector("[role=dialog]").previousElementSibling; return +getComputedStyle(b).opacity < 0.9; }), "the dim behind it lightens as it is pulled down");
await p.touchscreen.touchMove(195, top0 + 20 + 30); await wait(60); await p.touchscreen.touchEnd(); await wait(500);
ok((await dialog(p)) !== null && Math.abs((await dlgTop(p)) - top0) <= 2, "a short pull that is let go springs back to where it was");
// A real flick is fast; the browser driver's touch calls are too slow to make one, so this one is made in the page (three moves, 5 ms apart).
await p.evaluate((y) => new Promise((done) => {
  const el = document.querySelector("[role=dialog]"); const mk = (type, yy) => { const t = new Touch({ identifier: 7, target: el, clientX: 195, clientY: yy }); return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [t], targetTouches: type === "touchend" ? [] : [t], changedTouches: [t] }); };
  el.dispatchEvent(mk("touchstart", y)); [y + 25, y + 50, y + 75].forEach((yy, i) => setTimeout(() => el.dispatchEvent(mk("touchmove", yy)), 5 * (i + 1))); setTimeout(() => { el.dispatchEvent(mk("touchend", y + 75)); done(); }, 25);
}), top0 + 20);
ok(await gone(p), "a quick flick closes it even over a short distance");
await click(p, /What you are shooting/); await wait(500);
await swipe(p, 560, 220); ok(await gone(p), "pulling from the middle of the list (scrolled to the top) closes it too");
await click(p, /What you are shooting/); await wait(500);
await p.evaluate(() => { document.querySelector("[role=dialog]").scrollTop = 120; }); await wait(100);
await swipe(p, 500, 200, { hold: true }); await wait(60);
ok((await dlgTop(p)) === top0 || Math.abs((await dlgTop(p)) - top0) <= 2, "with the list scrolled down, pulling down scrolls the list instead of closing the sheet"); await p.touchscreen.touchEnd(); await wait(300);
ok((await dialog(p)) !== null, "and the sheet is still open");
await swipe(p, 500, -200); await wait(300); ok((await dialog(p)) !== null, "pulling up never closes it");
await p.evaluate(() => { document.querySelector("[role=dialog]").scrollTop = 0; });
await p.mouse.click(195, 60); ok(await gone(p), "a tap on the dimmed area outside closes it");
ok(await p.evaluate(() => document.activeElement?.innerText?.includes("What you are shooting")), "focus goes back to the row that opened it");
// reduced motion
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await click(p, /How to count/); await wait(150); const t0r = Date.now(); await click(p, /^Done/, "[role=dialog]"); ok(await gone(p, 200) && Date.now() - t0r < 250, "with 'reduce motion' on, it closes without the slide");
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
// start
await click(p, /^Start shooting/, "section[aria-label='New session']"); await wait(1200);
const dr = await draft(p);
ok(dr && dr.label === "Corner threes" && dr.goal === null && dr.mode !== "camera", `Start keeps the choices: drill '${dr?.label}', goal none, counting by taps`);
ok(JSON.parse(await p.evaluate((P) => localStorage.getItem(`hl:shots:${P}:recent`), P))[0].label === "Corner threes", "and the setup becomes the newest 'go again'");
await p.close();

// ---------- camera: Start opens the camera counter ----------
p = await open({ [`hl:shots:${P}:recent`]: RECENT, "hl:shots:count": "camera", "hl:shots:goal": JSON.stringify({ kind: "shots", target: 50 }) });
t = await text(p); ok(/Camera · 50 shots/.test(t), "the remembered goal shows on the card");
await click(p, /^Start shooting/, "section[aria-label='New session']");
await p.waitForFunction(() => /aim at the rim|opening|camera/i.test(document.body.innerText) && !!document.querySelector("video"), { timeout: 60000 }).catch(() => {});
const dr2 = await draft(p); ok(dr2 && dr2.mode === "camera" && dr2.label === "Random" && dr2.goal?.kind === "shots" && dr2.goal.target === 50, "Start with the camera: a camera set for 'Random', 50 shots, and the camera stage opens");
ok(!!(await p.$("video")), "the camera stage is on screen");
await p.close();

// ---------- a new player ----------
p = await open({});
t = await text(p); ok(/What are you shooting\?/.test(t) && /Free throws/.test(t) && /Name your own/.test(t), "new player: asked 'What are you shooting?' with the drills as wrapped buttons");
ok(!/Go again/.test(t) && !/What you are shooting ›/.test(t), "new player: no 'go again' card and no drill row yet");
ok(/How to count Tap counter ›/.test(t) && /Goal No goal ›/.test(t), "new player: counting is by taps (as before until the player chooses the camera) and there is no goal, so Start works at once");
const rects = await p.evaluate(() => [...document.querySelectorAll("[role=group][aria-label=Drills] button")].map((b) => Math.round(b.getBoundingClientRect().top)));
ok(new Set(rects).size >= 2, "the drills wrap onto more than one line (nothing scrolls sideways)"); ok((await overflow(p)) <= 0, "no sideways scrolling");
const sm0 = await small(p); ok(sm0.length === 0, "new player: every tap target is at least 40 px" + (sm0.length ? " :: " + sm0.join(" | ") : ""));
ok(await axe(p, "new player"), "no serious accessibility violations (new player)");
await p.screenshot({ path: "s-new.png" });
await click(p, /^Mid-range\s*$/, "[role=group][aria-label=Drills]"); await wait(300);
t = await text(p); ok(/Your setup Mid-range Tap counter · no goal/.test(t), "tapping a drill puts it on the card");
await p.close();

// ---------- camera switched off on this phone ----------
p = await open({ [`hl:shots:${P}:recent`]: RECENT, "hl:camera:switch": "off" });
t = await text(p); ok(!/How to count/.test(t) && /Random no goal · last 2 sets 53%/.test(t), "camera off: the counting row is hidden and the card does not mention it"); await p.close();

// ---------- dark ----------
p = await open({ [`hl:shots:${P}:recent`]: RECENT }, { scheme: "dark" }); ok(await axe(p, "dark"), "no serious accessibility violations (dark)"); await p.screenshot({ path: "s-dark.png" }); await p.close();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
