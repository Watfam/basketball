// Needs puppeteer-core and the temporary /lab/history-demo route (see persistent-history/REPORT.md "Reproduce").
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const ROOT = "/Users/WatfordFamily/Desktop/basketball-app", URL = "http://localhost:3101/lab/history-demo", out = { checks: [] };
const ok = (name, pass, detail = "") => { out.checks.push({ name, pass: !!pass, detail }); console.log(pass ? "PASS" : "FAIL", name, detail); };
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--enable-precise-memory-info"], defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2 } });
const page = await browser.newPage(); const errs = [], reqs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200))); page.on("request", (r) => reqs.push(r.url()));
const h = (op, ...a) => page.evaluate((op, a) => window.__h[op](...a), op, a);
const go = async () => { await page.goto(URL, { waitUntil: "networkidle2", timeout: 120000 }); await page.waitForFunction(() => window.__h, { timeout: 30000 }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await go();
// 0. fresh: empty store, flag off
ok("empty history loads (no sessions, writable)", JSON.stringify(await h("load")) === JSON.stringify({ sessions: 0, shots: 0, damaged: 0, newer: 0, writable: true }));
ok("flag off: no history entry rendered", (await page.$$eval("#entry button", (b) => b.length)) === 0);
// 1. opt-in gating through the production path
await page.evaluate(() => { localStorage.setItem("hl:session-review", "1"); });
let g = await h("glue", "optout");
ok("flag on but retention not opted in: nothing is kept", g === null);
ok("still empty after the gated call", (await h("load")).shots === 0);
await page.evaluate(() => { localStorage.setItem("hl:history:retain", "1"); });
g = await h("glue", "optin");
ok("flag + opt-in: the production glue keeps the session", g && g.status === "saved" && g.shots > 0 && g.tracked > 0, JSON.stringify({ shots: g?.shots, tracked: g?.tracked, bytes: g?.bytes, ms: Math.round(g?.ms) }));
// 2. persistence across reload
const before = await h("load"); await go();
const after = await h("load");
ok("history persists across a page reload", before.shots > 0 && JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));
// 3. seed the real-derived sessions and compare across sessions
const seeded = await h("seed"); ok("eight real-derived sessions retained", seeded.length === 8 && seeded.every((s) => s.status === "saved"), seeded.map((s) => `${s.shots}/${s.tracked}`).join(" "));
await go();
await page.waitForSelector("#entry button"); ok("flag on: entry shows", true);
await page.click("#entry button"); await page.waitForSelector("[role=dialog] section[aria-label='Saved sessions']", { timeout: 20000 });
const sessText = await page.$eval("[role=dialog]", (d) => d.innerText);
ok("history lists saved sessions with counts and framing", /IMG_4839/.test(sessText) && /with a path/.test(sessText) && /framing \d/.test(sessText));
const openSession = async (label) => page.evaluate((label) => { const b = [...document.querySelectorAll("[role=dialog] section[aria-label='Saved sessions'] li button[aria-expanded]")].find((x) => x.innerText.includes(label)); if (b) b.click(); return !!b; }, label);
const pickShot = async (label, seq) => page.evaluate((label, seq) => { const li = [...document.querySelectorAll("[role=dialog] section[aria-label='Saved sessions'] > ul > li")].find((x) => x.innerText.includes(label)); const b = [...li.querySelectorAll("ul li button")].find((x) => x.innerText.trim().startsWith(seq + " ")); b.click(); return true; }, label, seq);
await openSession("IMG_4839"); await pickShot("IMG_4839", 1); await openSession("IMG_4840"); await pickShot("IMG_4840", 2); await wait(400);
let cmp = await page.$eval("[role=dialog] section[aria-label='Compare shots']", (d) => d.innerText);
ok("two shots from different sessions, same framing: compared, with measurement values", /can be compared/.test(cmp) && /Position at rim height/.test(cmp), cmp.match(/These shots[^\n]*/)?.[0]);
await openSession("IMG_4866"); await pickShot("IMG_4866", 1); await wait(400);
cmp = await page.$eval("[role=dialog] section[aria-label='Compare shots']", (d) => d.innerText);
ok("adding a shot from a different framing: explained as not comparable, no differences shown", /cannot all be meaningfully compared/.test(cmp) && /different (place|distance|size)|different place|distance or zoom/.test(cmp), cmp.match(/(The hoop[^\n]*|The camera was[^\n]*)/g)?.join(" | "));
await page.screenshot({ path: `${ROOT}/training/work/history-compare.png`, fullPage: false });
// 4. filters
await page.evaluate(() => [...document.querySelectorAll("[role=dialog] [role=group][aria-label=Filter] button")].find((b) => b.innerText.trim().toLowerCase() === "misses").click()); await wait(300);
const missOnly = await page.evaluate(() => { const bs = [...document.querySelectorAll("[role=dialog] section[aria-label='Saved sessions'] ul ul li button")]; return bs.length > 0 && bs.every((b) => /miss/i.test(b.innerText)); });
ok("make/miss filter shows only misses", missOnly);
// 5. analytics present with sample sizes and abstentions
const an = await page.$eval("[role=dialog] section[aria-label=Consistency]", (d) => d.innerText);
ok("analytics: coverage table, sample sizes, baseline and caution shown", /Measurable/.test(an) && /Sample:/.test(an) && /Compared with:/.test(an) && /Caution:/.test(an));
ok("analytics: no mechanics/improvement language", !/\b(form|mechanic|improv|better|worse|elbow|wrist|release)\w*/i.test(an.replace(/Consistency|informa/g, "")), "");
// 6. delete one session
await page.evaluate(() => { window.confirm = () => true; });
const countBefore = (await h("load")).sessions;
await page.evaluate(() => { const li = [...document.querySelectorAll("[role=dialog] section[aria-label='Saved sessions'] > ul > li")].find((x) => x.innerText.includes("IMG_4866")); [...li.querySelectorAll("button")].find((b) => b.innerText.trim().toLowerCase() === "delete").click(); });
await wait(800);
const afterDel = await h("load"); ok("deleting one session removes it and its shots only", afterDel.sessions === countBefore - 1 && !(await page.$eval("[role=dialog]", (d) => d.innerText)).includes("IMG_4866"), JSON.stringify(afterDel));
// 7. damaged rows and newer schema rows
await h("raw", "junk"); await wait(300);
const dmg = await h("load"); ok("damaged and newer rows are counted and skipped, history still loads", dmg.damaged >= 1 && dmg.newer >= 1 && dmg.shots > 0, JSON.stringify(dmg));
await page.evaluate(() => { [...document.querySelectorAll("[role=dialog] button")].find((b) => b.innerText.trim().toLowerCase() === "close").click(); }); await wait(300);
await page.click("#entry button"); await wait(1500);
const banner = await page.$eval("[role=dialog]", (d) => d.innerText); ok("the screen reports unreadable and newer-version records", /unreadable/.test(banner) && /newer version/.test(banner));
await page.evaluate(() => { [...document.querySelectorAll("[role=dialog] button")].find((b) => b.innerText.trim().toLowerCase() === "remove them").click(); }); await wait(800);
const cleaned = await h("load"); ok("'Remove them' deletes the damaged row only; the newer-version row is kept", cleaned.damaged === 0 && cleaned.newer >= 1 && cleaned.shots === dmg.shots, JSON.stringify(cleaned));
// 8. newer schema store is read-only for this build
await h("raw", "meta", 99); await wait(200);
const ro = await h("glue", "readonly"); ok("a store marked with a newer schema refuses new writes", ro && ro.status === "read_only", ro?.status);
ok("and is still readable", (await h("load")).writable === false);
// 9. delete all removes everything, newer rows included
await page.evaluate(() => { [...document.querySelectorAll("[role=dialog] button")].find((b) => b.innerText.trim().toLowerCase() === "delete all tracking history").click(); }); await wait(1200);
const gone = await h("load"); ok("Delete all tracking history leaves nothing (unreadable and newer rows too)", gone.sessions === 0 && gone.shots === 0 && gone.damaged === 0 && gone.newer === 0, JSON.stringify(gone));
await page.evaluate(() => { [...document.querySelectorAll("[role=dialog] button")].find((b) => b.innerText.trim().toLowerCase() === "close").click(); });
// 10. turning retention off stops saving; flag off removes the entry
await page.evaluate(() => { localStorage.removeItem("hl:history:retain"); }); const off = await h("glue", "off2"); ok("retention off again: a saved set keeps nothing", off === null && (await h("load")).shots === 0);
await page.evaluate(() => { localStorage.removeItem("hl:session-review"); }); await go(); ok("flag off: entry gone again", (await page.$$eval("#entry button", (b) => b.length)) === 0);
// 11. network: nothing left the page for the app's own data
const external = reqs.filter((u) => !u.startsWith("http://localhost:3101")); const posts = reqs.filter((u) => /supabase|api\//.test(u));
ok("no network requests to anything but the local dev server", external.length === 0, external.slice(0, 3).join(" "));
ok("no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
out.errors = errs; out.request_count = reqs.length;
fs.writeFileSync(`${ROOT}/training/eval/experiments/persistent-history/results/browser-checks.json`, JSON.stringify(out, null, 1));
console.log(`\n${out.checks.filter((c) => c.pass).length}/${out.checks.length} passed`);
await browser.close();
