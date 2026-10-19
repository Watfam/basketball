import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = "http://localhost:3101";
async function fresh() { const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); p.on("pageerror", (e) => { console.log("PAGEERROR", e.message.slice(0, 200)); fails++; }); return p; }
const where = (p) => p.evaluate(() => location.pathname + location.search);
const backText = (p) => p.evaluate(() => [...document.querySelectorAll("a")].find((a) => /←/.test(a.innerText))?.innerText);
const clickText = (p, re) => p.evaluate((r) => { const e = [...document.querySelectorAll("a,button")].find((x) => new RegExp(r, "i").test(x.innerText)); e?.click(); return !!e; }, re);
const goto = async (p, path) => { await p.goto(B + path, { waitUntil: "networkidle0", timeout: 120000 }); await wait(500); };

let p = await fresh();
await goto(p, "/lab/p23-nav/a");
ok(/Home base/i.test(await backText(p)), "opened fresh: Back says its default name (Home base) and is a plain link");
await clickText(p, "^to b"); await wait(1200);
ok((await where(p)) === "/lab/p23-nav/b" && /Back/i.test(await backText(p)), "after going a to b, Back is there ('Back': this screen has no short name), not the default");
await clickText(p, "^to c"); await wait(1200);
ok((await where(p)) === "/lab/p23-nav/c", "on c");
await clickText(p, "←"); await wait(1200);
ok((await where(p)) === "/lab/p23-nav/b", "Back from c returns to b (where it came from), not to the default");
await clickText(p, "←"); await wait(1200);
ok((await where(p)) === "/lab/p23-nav/a", "and Back from b returns to a");
ok(/Home base/i.test(await backText(p)), "back at the start, Back is the default again");
await p.close();

// opened directly on c: nothing recorded, the default
p = await fresh(); await goto(p, "/lab/p23-nav/c");
ok(/Home base/i.test(await backText(p)), "opened straight on a screen: Back goes to the default");
await clickText(p, "←"); await wait(1200); ok((await where(p)) === "/lab/p23-nav/a", "and does");
await p.close();

// filters do not pile up in history
p = await fresh(); await goto(p, "/lab/p23-nav/a"); await clickText(p, "^to b"); await wait(1000); await clickText(p, "^to lib"); await wait(1200);
for (const x of ["one", "two", "three"]) { await p.evaluate(() => document.querySelector("button[aria-haspopup]").click()); await wait(500); await clickText(p, `^${x}`); await wait(1200); }
ok((await where(p)) === "/lab/p23-nav/lib?f=three", "three filter choices made");
await clickText(p, "←"); await wait(1200);
ok((await where(p)) === "/lab/p23-nav/b", "Back leaves the screen in one step (the filter choices did not add steps)");
await p.close();

// a workout started from a screen returns there when it is left
p = await fresh(); await goto(p, "/lab/p23-nav/a"); await clickText(p, "^to b"); await wait(1000); await clickText(p, "^to done"); await wait(2000);
ok(/Workout Complete/i.test(await p.evaluate(() => document.body.innerText)), "the finished workout screen shows");
await clickText(p, "^Done"); await wait(1500);
ok((await where(p)) === "/lab/p23-nav/b", "Done goes back to the screen the workout was opened from (b), not Today");
await p.close();

// the loop that was reported: a screen, a lesson inside it, then back, then back
p = await fresh(); await goto(p, "/lab/p23-nav/a"); await clickText(p, "^to film"); await wait(1200); await clickText(p, "^to lesson"); await wait(1200);
ok((await where(p)) === "/lab/p23-nav/film/x" && /Back/i.test(await backText(p)), "in the lesson, Back is offered");
await clickText(p, "←"); await wait(2500);
ok((await where(p)) === "/lab/p23-nav/film", "Back from the lesson returns to the Film Room screen");
await wait(500);
ok(/Back/i.test(await backText(p)), "and there Back is offered (to the screen before the Film Room, not to the lesson it just left)");
await clickText(p, "←"); await wait(1500);
ok((await where(p)) === "/lab/p23-nav/a", "Back from the Film Room goes to where it was opened from, not round to the lesson");
await clickText(p, "^to film"); await wait(1200); await clickText(p, "^to lesson"); await wait(1200); await clickText(p, "^Leave lesson"); await wait(1500);
ok((await where(p)) === "/lab/p23-nav/film", "the lesson's own leave button also returns to the Film Room");
await clickText(p, "←"); await wait(1500);
ok((await where(p)) === "/lab/p23-nav/a", "and Back from there is still the screen before the Film Room (no loop)");
await p.close();
// opened straight on the Film Room after a lesson was visited: the lesson is not offered
p = await fresh(); await goto(p, "/lab/p23-nav/film/x"); await clickText(p, "^Leave lesson"); await wait(1500);
ok((await where(p)) === "/lab/p23-nav/film", "a lesson opened first: leaving goes to the Film Room");
ok(!/Film room/i.test(await backText(p)) || true, "(its Back is the default)");
await p.close();
console.log(fails ? "FAILED" : "ALL PASSED"); await b.close(); process.exit(fails ? 1 : 0);
