import puppeteer from "puppeteer-core"; // run from a folder with puppeteer-core installed; see demo-page.tsx.txt
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const p = await browser.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on("pageerror", (e) => { console.log("PAGEERROR", e.message); fails++; });
const adj = [];
await p.setRequestInterception(true);
p.on("request", (r) => {
  if (r.method() === "POST" && r.headers()["next-action"]) {
    adj.push(r.postData());
    const payload = { error: null, metrics: { type: "shooting", variant: "Right wing", category: "stationary", category_basis: "drill_definition", makes: 15, attempts: 20, target: { kind: "shots", value: 20 }, tracking: { v: 1, source: "camera", shot_session_id: "44444444-4444-4444-8444-444444444444", camera_attempts: 19, camera_makes: 13, flipped: 1, added_by_hand: 1, rule_version: "v4", model_version: "ball6", adjusted: { original: { makes: 14, attempts: 20 } } } }, action: "update" };
    return r.respond({ status: 200, contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(payload)}\n` });
  }
  r.continue();
});
await p.goto("http://localhost:3101/lab/p10-demo?view=result", { waitUntil: "networkidle0" });
const text = () => p.evaluate(() => document.body.innerText);
let t = await text();
ok(/14 of 20/.test(t), "result shown: 14 of 20");
ok(/Counted by the camera/i.test(t), "says counted by the camera");
ok(/1 call you changed/i.test(t) && /1 shot you added/i.test(t), "says what the player changed");
ok(/Fix the numbers/i.test(t) && /Track again/i.test(t), "fix + track again offered");
ok(!/Track with Camera/i.test(t) || /Track again/i.test(t), "no duplicate start button once tracked");
await p.screenshot({ path: "p10-result.png" });
const click = async (re) => { const h = await p.evaluateHandle((s) => [...document.querySelectorAll("button,a")].find((e) => new RegExp(s, "i").test(e.innerText || e.getAttribute("aria-label") || "")), re); const el = h.asElement(); if (!el) throw new Error("no " + re); await el.click(); };
await click("Fix the numbers");
await new Promise((r) => setTimeout(r, 500));
await p.screenshot({ path: "p10-fix.png" });
t = await text();
ok(/Makes/i.test(t) && /Attempts|Shots/i.test(t), "fix UI shows makes + attempts steppers");
const labels = await p.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.innerText).filter(Boolean));
console.log(labels.join(" | "));
await browser.close();
console.log(fails ? "FAILED" : "ALL PASSED");
