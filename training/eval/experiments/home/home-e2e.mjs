setTimeout(() => { console.log("WATCHDOG"); process.exit(2); }, 480000);
import fs from "node:fs";
import puppeteer from "puppeteer-core"; // run from a folder with puppeteer-core and axe-core installed. Route: demo-pages/home-demo.tsx.txt as /lab/p16-home (temporary).
// Today (the player home) at iPhone size: the ten-second questions, the numbers, the drill-downs, empty and thin histories, large histories, touch targets, accessibility.
const B = "http://localhost:3101/lab/p16-home";
const P = "11111111-1111-4111-8111-111111111111";
const AXE = fs.readFileSync(new URL("./node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const JARGON = /plausible|confidence|p-value|wilson|newcombe|statistic|significan|strict|98%|95%|variance|schema|sample size/i;
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(q, { scheme = "light", throttle = 0 } = {}) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  p.on("pageerror", (e) => { console.log("PAGEERROR", e.message.slice(0, 160)); fails++; });
  if (throttle) await (await p.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const t0 = Date.now(); await p.goto(`${B}?${q}`, { waitUntil: "networkidle0", timeout: 180000 }); p.loadMs = Date.now() - t0;
  return p;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const hrefs = (p) => p.evaluate(() => [...document.querySelectorAll("main a[href]")].map((a) => ({ href: a.getAttribute("href"), label: (a.getAttribute("aria-label") || a.innerText).replace(/\s+/g, " ").trim().slice(0, 70) })));
const small = (p) => p.evaluate(() => [...document.querySelectorAll("a[href],button,summary,input,select,[role=button]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.checkVisibility() && r.height < 40 && !(e.tagName === "A" && e.closest("p") && r.height >= 16); }).map((e) => `${(e.innerText || e.getAttribute("aria-label") || e.tagName).replace(/\s+/g, " ").slice(0, 30)} ${Math.round(e.getBoundingClientRect().height)}px`));
const top = (p, re) => p.evaluate((r) => { const e = [...document.querySelectorAll("main h1,main h2,main p,main a,main button,main span,main summary")].find((x) => new RegExp(r, "i").test(x.innerText || x.getAttribute("aria-label") || "")); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top + scrollY), bottom: Math.round(b.bottom + scrollY) }; }, re.source ?? re);
async function axe(p, label) {
  await p.evaluate(AXE);
  const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, s: v.nodes[0].target.join(" ").slice(0, 70) + " :: " + (v.nodes[0].any[0]?.message ?? "").slice(0, 90) })));
  console.log(`   axe ${label}: ${r.length ? r.map((v) => `${v.id}(${v.impact},${v.n})`).join(", ") : "no violations"}`); for (const v of r.filter((x) => x.impact === "serious" || x.impact === "critical")) console.log("      ", v.s);
  return r;
}

// ---------- an active plan, a month of shooting ----------
let p = await open("s=plan");
let t = await text(p);
ok(/good (morning|afternoon|evening), jake|^hey, jake/i.test(t), "welcome: greets the player by first name");
ok(/days done this week|first workout|streak|ready when you are|weekly target|nice work today/i.test(t.split("YOUR SHOOTING")[0] ?? t), "welcome: says where the week stands in a plain sentence");
const cta = await top(p, /Start Today's Workout/); ok(cta && cta.bottom < 844, `what should I do today: the big button 'Start Today's Workout' is on the first screen (bottom at ${cta?.bottom}px of 844)`);
const kLabels = await Promise.all([top(p, /^Shots taken$/), top(p, /^Shots made$/), top(p, /^Shooting %$/)]);
ok(kLabels.every((x) => x && x.bottom < 844), `how many taken, made, what percent: all three numbers are on the first screen (${kLabels.map((x) => x?.bottom).join(", ")}px)`);
ok(/320/.test(t) && /193/.test(t) && /60\.3%/.test(t), "numbers: 320 taken, 193 made, 60.3% (193 of 320, worked out by hand from the test sets)");
ok(/You made 193 out of 320 shots in the last 4 weeks\./.test(t), "the plain sentence: 'You made 193 out of 320 shots in the last 4 weeks.'");
const ans = await top(p, /Am I getting better/); const foc = await top(p, /Next benchmark|Worth another look|Film Room$/);
console.log(`   'Am I getting better?' at ${ans?.top}px, the focus card at ${foc?.top}px (first screen is 844px)`);
ok(ans && ans.top < 844, "am I improving: the answer starts on the first screen");
ok(/starting point/i.test(t) && /again in about two weeks/i.test(t), "am I improving: one run so far is called a starting point, not a trend");
const line = t.split("\n").find((l) => /points higher|points lower|about the same/.test(l)) ?? "";
ok(/11 points higher/.test(line) && /different drills/.test(line) && !/improv|better|prove/i.test(line.replace(/not proof/i, "")), "comparing: 'That is 11 points higher (you may have shot different drills)': a fact, never called improvement");
ok(!JARGON.test(t), "no statistics words on the screen" + (JARGON.test(t) ? ": " + t.match(JARGON)[0] : ""));
ok((await p.$$eval("main details", (d) => d.every((x) => !x.open))) && /How are these counted/.test(t), "details are there and closed (the first screen stays simple)");
await p.evaluate(() => [...document.querySelectorAll("summary")].find((s) => /How are these counted/.test(s.innerText)).click()); await wait(200);
const open1 = await text(p); ok(/the camera counted/.test(open1) && /counted by tapping|you counted 20 by tapping/.test(open1) && /More shots means more work/.test(open1), "counted by camera or by tapping is said, and more shots is called more work");
const hs = await hrefs(p);
const need = (re, m) => ok(hs.some((h) => re.test(h.href)), m);
need(new RegExp(`^/players/${P}/shooting\\?range=4w$`), "Shots taken and made lead to the shooting activity, with the range");
need(new RegExp(`^/players/${P}/progress\\?view=shooting&range=4w$`), "Shooting % leads to performance by skill, with the range");
ok(hs.filter((h) => new RegExp(`^/players/${P}/shooting\\?from=\\d{4}-\\d{2}-\\d{2}&to=\\d{4}-\\d{2}-\\d{2}$`).test(h.href)).length === 8, "each of the eight weekly bars opens that week's sets");
need(new RegExp(`/progress\\?view=benchmarks`), "'See the tests' leads to the benchmark history");
need(new RegExp(`/film\\?lesson=`), "the focus card leads to the Film Room lesson");
need(new RegExp(`/progress\\?range=4w$`), "Progress and analytics keeps the range");
need(new RegExp(`/sessions/wk1$`), "a recent workout opens that workout");
need(new RegExp(`/shooting/set\\d+\\?from=%2Fplayers%2F${P}%3Frange%3D4w$`), "a recent set opens its shots and brings you back to Today with the same range");
ok(hs.every((h) => h.href && h.href !== "#" && !h.href.startsWith("undefined")), `no dead links (${hs.length} links)`);
ok((await overflow(p)) <= 0, "no sideways scrolling");
const sm = await small(p); ok(sm.length === 0, "every tappable thing is at least 40 px tall" + (sm.length ? " :: " + sm.join(" | ") : ""));
await p.screenshot({ path: "h-plan.png", fullPage: true });
let v = await axe(p, "plan, light"); ok(!v.some((x) => ["serious", "critical"].includes(x.impact)), "no serious accessibility violations (light)");
// the range chips
await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.innerText.trim() === "7 days").click()); await p.waitForFunction(() => /last 7 days/.test(document.body.innerText), { timeout: 30000 });
t = await text(p); ok(/You made 91 out of 140 shots in the last 7 days\./.test(t) && /65%/.test(t), "7 days: 140 taken, 91 made, 65% (worked out by hand)");
ok((await hrefs(p)).some((h) => h.href === `/players/${P}/shooting?range=7d`) && (await hrefs(p)).some((h) => h.href === `/players/${P}/progress?view=shooting&range=7d`), "the range is carried into every drill-down");
await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.innerText.trim() === "Season").click()); await p.waitForFunction(() => /this season/.test(document.body.innerText), { timeout: 30000 });
t = await text(p); ok(/You made 235 out of 405 shots this season\./.test(t), "Season: 405 taken, 235 made (worked out by hand)");
await p.close();
p = await open("s=plan", { scheme: "dark" }); v = await axe(p, "plan, dark"); ok(!v.some((x) => ["serious", "critical"].includes(x.impact)), "no serious accessibility violations (dark)"); await p.screenshot({ path: "h-plan-dark.png", fullPage: true }); await p.close();

// ---------- a new player ----------
p = await open("s=new"); t = await text(p);
ok(/Welcome\. Let's get your first workout in\./.test(t), "new player: a welcome, not a wall of zeros");
ok(/No shots counted in the last 4 weeks yet\./.test(t) && /Start shooting/i.test(t) && !/Am I getting better/i.test(t), "new player: says what to do ('Start shooting') and does not ask 'am I getting better'");
ok(!/NaN|undefined|Infinity/.test(t) && /—/.test(t), "new player: no NaN; the percentage shows a dash");
ok(/Nothing yet\. Your finished workouts/.test(t), "new player: recent has an empty state");
ok(/Next benchmark/i.test(t) && /Free Throw Routine/.test(t), "new player: the next step is the first benchmark, with its Film Room lesson");
ok(!(await p.$("svg, [aria-label*='8 weeks']")), "new player: no empty chart");
ok((await overflow(p)) <= 0, "new player: no sideways scrolling"); v = await axe(p, "new"); ok(!v.some((x) => ["serious", "critical"].includes(x.impact)), "new player: no serious accessibility violations");
await p.screenshot({ path: "h-new.png", fullPage: true }); await p.close();

// ---------- a thin history ----------
p = await open("s=sparse"); t = await text(p);
ok(/You made 4 out of 6 shots in the last 4 weeks\./.test(t) && /66\.7%/.test(t), "thin history: 4 of 6 is 66.7%");
ok(/Only 6 shots so far, so the percentage is early/.test(t), "thin history: says the percentage is early");
ok(!/points higher|points lower/.test(t), "thin history: no look-back from too few shots");
await p.screenshot({ path: "h-sparse.png", fullPage: true }); await p.close();
p = await open("s=sparse&range=7d"); t = await text(p); ok(/4 out of 6 shots in the last 7 days/.test(t), "thin history, 7 days"); await p.close();

// ---------- the answer to "am I improving?" ----------
p = await open("s=rich"); t = await text(p);
ok(/Yes, on your free throw benchmark/.test(t) && /30% to 87%/.test(t) && /practice, not a game/.test(t), "a benchmark that clearly moved: 'Yes', with the numbers, and 'practice, not a game'");
ok(!/Worth another look/i.test(t), "no 'worth another look' when nothing dipped"); await p.screenshot({ path: "h-rich.png", fullPage: true }); await p.close();
p = await open("s=dip"); t = await text(p);
ok(/Your free throw benchmark went down/.test(t) && /Worth another look/i.test(t) && /Free Throw Routine/.test(t), "a benchmark that clearly dipped: said plainly, with its lesson, as the one focus");
ok(!/Yes, on your/.test(t), "a dip is never described as improving"); await p.close();

// ---------- a large history ----------
p = await open("s=large", { throttle: 4 }); t = await text(p);
const nav = await p.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), nodes: document.getElementsByTagName("*").length }; });
console.log(`   large history (900 sets, 300 benchmark results), 4x slower CPU, iPhone size: load ${p.loadMs} ms, server response ${nav.ttfb} ms, DOM ready ${nav.dcl} ms, ${nav.nodes} elements`);
ok(nav.nodes < 1500, `large: the page stays small (${nav.nodes} elements)`);
ok(/Shots taken/i.test(t) && !/NaN|undefined/.test(t), "large: numbers render");
const t0 = Date.now(); await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.innerText.trim() === "Season").click()); await p.waitForFunction(() => /this season/.test(document.body.innerText), { timeout: 30000 }); const chip = Date.now() - t0;
console.log(`   tapping 'Season': ${chip} ms to the new numbers (development server)`);
ok(chip < 4000, "large: changing the range answers in under 4 s on a 4x slower CPU");
ok((await overflow(p)) <= 0, "large: no sideways scrolling"); await p.close();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
