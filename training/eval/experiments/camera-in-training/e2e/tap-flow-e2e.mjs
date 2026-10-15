import puppeteer from "puppeteer-core"; // run from a folder with puppeteer-core installed; see demo-page.tsx.txt
const B = "http://localhost:3101/lab/p10-demo";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const text = (p) => p.evaluate(() => document.body.innerText);
async function page(view, pre) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on("pageerror", (e) => { console.log("PAGEERROR", e.message); fails++; });
  await p.evaluateOnNewDocument((pre) => { if (pre) for (const [k, v] of Object.entries(pre)) if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, pre ?? null);
  await p.goto(`${B}?view=${view}`, { waitUntil: "networkidle0" });
  return p;
}
const click = async (p, re) => { const h = await p.evaluateHandle((s) => [...document.querySelectorAll("button,a")].find((e) => new RegExp(s, "i").test(e.innerText || e.getAttribute("aria-label") || "")), re); const el = h.asElement(); if (!el) throw new Error("no button " + re); await el.click(); };

// 1 workout carousel
let p = await page("workout");
let t = await text(p);
ok(/Track with Camera/i.test(t), "workout: Track with Camera shown");
ok((t.match(/Track with Camera/gi) || []).length === 1, "workout: only on the one eligible drill (not form, not ball handling)");
ok(/Lesson for this drill/i.test(t) && /Building a Repeatable Release/.test(t), "workout: lesson shown");
await p.screenshot({ path: "p10-workout.png" });
const href = await p.evaluate(() => null);
await p.close();

// 2 drill start screen
p = await page("start", { "hl:camera:switch": "off" });
t = await text(p);
ok(/Free Throw Reset/i.test(t) && /Right wing/.test(t), "start: drill + variant");
ok(/Stationary shooting/i.test(t) && /3 shots|shots/i.test(t), "start: category and goal");
ok(/Watch the lesson/i.test(t), "start: lesson link");
ok(/not measured/i.test(t), "start: says what is not measured");
ok(/Back to your workout/i.test(t) && /Shoot without a drill/i.test(t), "start: back and skip links");
const back = await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => /Back to your workout/i.test(a.innerText))?.getAttribute("href"));
ok(back === "/players/11111111-1111-4111-8111-111111111111/sessions/22222222-2222-4222-8222-222222222222?tracked=33333333-3333-4333-8333-333333333331", "start: back link built from ids: " + back);
await p.screenshot({ path: "p10-start.png" });
await p.close();


// 3 tap path end to end with the server actions answered by the test
const SID = "44444444-4444-4444-8444-444444444444";
async function withServer(view, mode) {
  const p = await page(view, { "hl:camera:switch": "off" });
  const calls = [];
  await p.setRequestInterception(true);
  p.on("request", (r) => {
    const h = r.headers();
    if (r.method() === "POST" && h["next-action"]) {
      const body = r.postData() || "";
      if (body.includes("workoutDrillId")) {
        calls.push("attach");
        if (mode.attach === "offline") return r.abort("failed");
        const payload = mode.attach === "closed" ? { error: "That workout is already finished.", code: "closed" } : { error: null, metrics: { type: "shooting", variant: "Right wing", category: "stationary", category_basis: "drill_definition", makes: 4, attempts: 5, target: { kind: "shots", value: 5 }, tracking: { v: 1, source: "taps", shot_session_id: SID, camera_attempts: 0, camera_makes: 0, flipped: 0, added_by_hand: 5, rule_version: null, model_version: null, adjusted: null } }, action: "insert" };
        return r.respond({ status: 200, contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(payload)}\n` });
      }
      calls.push("sync");
      return r.respond({ status: 200, contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify({ error: null, sessionId: SID })}\n` });
    }
    r.continue();
  });
  return { p, calls };
}
const btn = (p, re) => click(p, re);
let { p: q, calls } = await withServer("start", { attach: "ok" });
await new Promise((r) => setTimeout(r, 500));
await btn(q, "Start counting");
await new Promise((r) => setTimeout(r, 500));
t = await text(q);
ok(/Free Throw Reset/i.test(t) && /Make/i.test(t), "tap path: counter open, named for the drill");
const draft = await q.evaluate(() => JSON.parse(localStorage.getItem("hl:shots:11111111-1111-4111-8111-111111111111:draft")));
ok(draft?.context?.workoutDrillId === "33333333-3333-4333-8333-333333333331" && draft.label === "Free Throw Reset · Right wing", "tap path: draft carries drill context + label: " + draft?.label);
ok(draft?.goal?.kind === "shots" && draft.goal.target === 5, "tap path: the drill goal (5 shots) is the set goal");
const recent = await q.evaluate(() => localStorage.getItem("hl:shots:11111111-1111-4111-8111-111111111111:recent"));
ok(!recent, "tap path: drill setup not added to one-tap starts");
await q.screenshot({ path: "p10-counter.png" });
for (const b of ["^Make","^Make","^Make","^Miss","^Make"]) await click(q, b);
await new Promise((r) => setTimeout(r, 2500));
t = await text(q);
ok(/Session saved/i.test(t), "tap path: goal reached, set saved");
ok(/Added to your workout/i.test(t) && /4 of 5 made/.test(t), "tap path: result added to workout: 4 of 5");
ok(/Counted by your taps/i.test(t), "tap path: says counted by taps");
ok(/Back to your workout/i.test(t) && /Track this drill again/i.test(t), "tap path: back + again buttons");
ok(calls.filter((c) => c === "attach").length === 1, "tap path: attached exactly once (" + calls.join(",") + ")");
const pend = await q.evaluate(() => localStorage.getItem("hl:drill-pending:11111111-1111-4111-8111-111111111111"));
ok(!pend, "tap path: pending marker cleared after success");
await q.screenshot({ path: "p10-saved.png" });
const seen = [];
q.on("request", (r) => { if (r.url().includes("/sessions/")) seen.push(r.url()); });
await click(q, "Back to your workout");
await new Promise((r) => setTimeout(r, 4000));
const url = seen[0] || q.url();
ok(/\/players\/1111.*\/sessions\/2222.*\?tracked=33333333-3333-4333-8333-333333333331/.test(url), "tap path: navigated to the workout step: " + url);
await q.close();

// 4 offline: attach fails -> waiting + marker kept; retried when "online" fires
({ p: q, calls } = await withServer("start", { attach: "offline" }));
await btn(q, "Start counting"); for (const b of ["^Make","^Make","^Make","^Make","^Make"]) await click(q, b);
await new Promise((r) => setTimeout(r, 2500));
t = await text(q);
ok(/Shots saved/i.test(t) && /online/i.test(t), "offline: shows shots saved, result waits for signal");
const pend2 = await q.evaluate(() => localStorage.getItem("hl:drill-pending:11111111-1111-4111-8111-111111111111"));
ok(!!pend2 && JSON.parse(pend2).shotSessionId === SID, "offline: pending marker kept on the phone");
await q.close();

// 5 definitive failure
({ p: q, calls } = await withServer("start", { attach: "closed" }));
await btn(q, "Start counting"); for (const b of ["^Make","^Make","^Make","^Make","^Make"]) await click(q, b);
await new Promise((r) => setTimeout(r, 2500));
t = await text(q);
ok(/drill not updated/i.test(t) && /already finished/i.test(t), "closed workout: plain message");
ok(!(await q.evaluate(() => localStorage.getItem("hl:drill-pending:11111111-1111-4111-8111-111111111111"))), "closed workout: marker dropped (no endless retry)");
await q.close();

// 6 mismatch chooser
const other = JSON.stringify({ v: 1, sessionId: null, label: "Three-pointers", startedAt: new Date().toISOString(), clockStartedAt: null, shots: [{ seq: 1, made: true, zone: null, source: "manual", detectedMade: null, flagged: false, addedByHand: false }], zone: null, goal: null, rev: 2, syncedRev: 0 });
q = await page("start", { "hl:camera:switch": "off", "hl:shots:11111111-1111-4111-8111-111111111111:draft": other });
t = await text(q);
ok(/A set is already open/i.test(t) && /Three-pointers/i.test(t), "mismatch: chooser shown, open set named");
ok(/Resume the set in progress/i.test(t) && /Discard it and track Free Throw Reset/i.test(t), "mismatch: both choices");
const stillThere = await q.evaluate(() => JSON.parse(localStorage.getItem("hl:shots:11111111-1111-4111-8111-111111111111:draft"))?.shots.length);
ok(stillThere === 1, "mismatch: open set untouched until chosen");
await q.screenshot({ path: "p10-mismatch.png" });
q.on("dialog", (d) => d.accept());
await click(q, "Discard it");
await new Promise((r) => setTimeout(r, 800));
const d2 = await q.evaluate(() => JSON.parse(localStorage.getItem("hl:shots:11111111-1111-4111-8111-111111111111:draft")));
ok(d2?.context?.drillName === "Free Throw Reset" && d2.shots.length === 0, "mismatch: replaced by the drill set");
await q.close();

// 7 resume same drill draft
q = await page("start", { "hl:camera:switch": "off" });
await click(q, "Start counting"); await click(q, "^Make");
await q.reload({ waitUntil: "networkidle0" });
t = await text(q);
ok(/1\/1/.test(t) && !/A set is already open/i.test(t), "same drill: reload resumes the counter with its shot");
await q.close();

// 8 problem
q = await page("problem");
t = await text(q);
ok(/can.t be tracked/i.test(t) && /form/i.test(t) && /Shoot without a drill/i.test(t), "problem: plain message shown with the normal start below");
ok(/What are you shooting/i.test(t), "problem: ordinary shooting still available");
await q.screenshot({ path: "p10-problem.png" });
await q.close();

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
