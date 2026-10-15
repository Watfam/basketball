import puppeteer from "puppeteer-core"; // run from a folder with puppeteer-core installed; see demo-page.tsx.txt
// Phase 11: a drill result that could not be saved (no signal) is finished from the WORKOUT screen, and the workout is never finished or thrown away underneath it.
const B = "http://localhost:3101/lab/p10-demo";
const P = "11111111-1111-4111-8111-111111111111", W = "22222222-2222-4222-8222-222222222222", E1 = "33333333-3333-4333-8333-333333333331", SID = "44444444-4444-4444-8444-444444444444";
const marker = JSON.stringify({ playerId: P, shotSessionId: SID, context: { workoutSessionId: W, workoutDrillId: E1, drillName: "Free Throw Reset", variant: "Right wing", goal: { kind: "shots", target: 5 } } });
const MK = `hl:drill-pending:${P}`;
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const metrics = { type: "shooting", variant: "Right wing", category: "stationary", category_basis: "drill_definition", makes: 4, attempts: 5, target: { kind: "shots", value: 5 }, tracking: { v: 1, source: "taps", shot_session_id: SID, camera_attempts: 0, camera_makes: 0, flipped: 0, added_by_hand: 5, rule_version: null, model_version: null, adjusted: null } };
async function open(view, { attach = "offline" } = {}) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on("pageerror", (e) => { console.log("PAGEERROR", e.message); fails++; });
  await p.evaluateOnNewDocument((k, v) => { if (!localStorage.getItem(k) && !sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); sessionStorage.setItem("seeded", "1"); } }, MK, marker);
  const calls = { attach: 0, other: 0 }; const state = { attach };
  await p.setRequestInterception(true);
  p.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) {
      const body = r.postData() || "";
      if (body.includes("workoutDrillId")) { calls.attach++; if (state.attach === "offline") return r.abort("failed"); return r.respond({ status: 200, contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify({ error: null, metrics, action: "insert" })}\n` }); }
      calls.other++; return r.respond({ status: 200, contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify({ error: null, discarded: false })}\n` });
    }
    r.continue();
  });
  await p.goto(`${B}?view=${view}`, { waitUntil: "networkidle0" });
  return { p, calls, state };
}
const text = (p) => p.evaluate(() => document.body.innerText);
const click = async (p, re) => { const h = await p.evaluateHandle((s) => [...document.querySelectorAll("button,a")].find((e) => new RegExp(s, "i").test(e.innerText || "")), re); const el = h.asElement(); if (!el) throw new Error("no " + re); await el.click(); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A. the workout screen finishes the waiting result when the signal returns
let { p, calls, state } = await open("workout");
await wait(800);
let t = await text(p);
ok(/still saving to this workout/i.test(t), "workout screen says a tracked drill is still saving");
ok(await p.evaluate((k) => !!localStorage.getItem(k), MK), "marker kept while offline");
state.attach = "ok";
await p.evaluate(() => window.dispatchEvent(new Event("online")));
await wait(1200);
t = await text(p);
ok(/4 of 5/.test(t), "after reconnecting the drill shows its result (4 of 5) without leaving the workout");
ok(!(await p.evaluate((k) => localStorage.getItem(k), MK)), "marker cleared once saved");
ok(!/still saving to this workout/i.test(t), "the waiting note is gone");
const attachCalls = calls.attach; await p.evaluate(() => window.dispatchEvent(new Event("online"))); await wait(400);
ok(calls.attach === attachCalls, "nothing is sent again once it has landed");
await p.close();

// B. finishing is held while a result is still waiting
({ p, calls, state } = await open("waiting"));
await wait(800);
await click(p, "Finish workout now"); await wait(300); await click(p, "^Finish now"); await wait(1200);
t = await text(p);
ok(/still waiting to be saved because there is no connection/i.test(t), "finish is refused with a plain reason while the result is waiting");
ok(calls.other === 0, "the workout was not completed (no complete call was made)");
state.attach = "ok"; await p.evaluate(() => window.dispatchEvent(new Event("online"))); await wait(1000);
await click(p, "Finish workout now").catch(() => {}); await wait(300); await click(p, "^Finish now").catch(() => {}); await wait(1200);
ok(calls.other === 1, "once it has saved, finishing goes through (one complete call)");
await p.close();

// C. leaving an otherwise empty workout does not throw it away while a result is waiting
({ p, calls, state } = await open("workout"));
await wait(800);
await click(p, "Cancel"); await wait(1200);
ok(calls.other === 0, "Cancel with a waiting result does not discard the workout");
await p.close();

await browser.close(); console.log(fails ? "FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
