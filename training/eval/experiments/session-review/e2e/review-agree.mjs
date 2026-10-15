// Needs puppeteer-core (not a repo dependency) and the temporary /lab/review-demo route; see ../REPORT.md "Reproduce".
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const ROOT = "/Users/WatfordFamily/Desktop/basketball-app";
const manifest = JSON.parse(fs.readFileSync(`${ROOT}/public/_review-demo/manifest.json`));
const { loadReview } = await import(`${ROOT}/training/eval/experiments/session-review/lib.mjs`);
const R = await loadReview();
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 430, height: 932 } });
const page = await browser.newPage();
await page.goto("http://localhost:3101/lab/review-demo", { waitUntil: "networkidle2", timeout: 120000 });
await page.evaluate(() => document.getElementById("seed").click());
await page.waitForFunction(() => document.getElementById("seeded").innerText.startsWith("seeded"), { timeout: 120000 });
const rows = []; let mismatches = [];
for (let si = 0; si < manifest.sessions.length; si += 1) {
  await page.evaluate((si) => { const s = document.getElementById("session"); s.value = String(si); s.dispatchEvent(new Event("change", { bubbles: true })); }, si);
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => document.getElementById("open").click());
  await page.waitForSelector("[role=dialog] ul[aria-label=Shots]", { timeout: 20000 });
  const shots = manifest.sessions[si].shots;
  for (let i = 0; i < shots.length; i += 1) {
    await page.evaluate((i) => [...document.querySelectorAll("[role=dialog] ul[aria-label=Shots] button")][i].click(), i);
    await new Promise((r) => setTimeout(r, 250));
    const ui = await page.evaluate(() => { const d = document.querySelector("[role=dialog]"), t = d.innerText; const m = (re) => (t.match(re) || [null, null]); return { label: [...d.querySelectorAll("ul[aria-label=Shots] button")].find((b) => b.getAttribute("aria-pressed") === "true").innerText, header: m(/Shot (\d+)\n(Make|Miss)/), evidence: (t.match(/Evidence: shot (\d+) · record (\S+) · replay (\S+) · (\d+) frames · (\d+) sightings/) || null), rimX: (t.match(/Position at rim height[^\n]*\n(-?[\d.]+) ball widths/) || [null, null])[1], quality: (t.match(/(Path found|Partial path|Path unreliable|No path)/) || [null])[0] }; });
    const sh = shots[i], expectOutcome = sh.made ? "Make" : "Miss", row = { session: si, seq: sh.seq, expected: expectOutcome, ui_outcome: ui.header[2], ui_seq: ui.header[1] && +ui.header[1] };
    if (ui.header[2] !== expectOutcome || +ui.header[1] !== sh.seq) mismatches.push({ ...row, why: "seq or outcome" });
    if (sh.record) {
      const trail = R.trail.buildTrail(sh.record), fp = trail.hasTrail ? R.fingerprint.fingerprint(trail) : null, q = R.quality.assessTrail(trail, fp);
      const expectX = fp && fp.measurements.rim_level_x_bw.value !== null ? fp.measurements.rim_level_x_bw.value.toFixed(2) : null;
      if (ui.quality !== { tracked: "Path found", partial: "Partial path", unreliable: "Path unreliable", none: "No path" }[q.level]) mismatches.push({ ...row, why: `quality ${ui.quality} vs ${q.level}` });
      if (fp) { if (!ui.evidence || ui.evidence[2] !== sh.record.shotId || ui.evidence[3] !== sh.replayId || +ui.evidence[4] !== sh.record.frames.length) mismatches.push({ ...row, why: `evidence link ${ui.evidence && ui.evidence.slice(1, 5)}` }); if ((ui.rimX ?? null) !== expectX) mismatches.push({ ...row, why: `rim x ${ui.rimX} vs ${expectX}` }); }
      row.record = sh.record.shotId; row.quality = ui.quality; row.rimX = ui.rimX;
    } else row.record = null;
    rows.push(row);
  }
  await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.innerText.trim().toLowerCase() === "close").click());
  await new Promise((r) => setTimeout(r, 300));
}
fs.writeFileSync(`${ROOT}/training/eval/experiments/session-review/results/ui-agreement.json`, JSON.stringify({ checked: rows.length, mismatches, rows }, null, 1));
console.log(JSON.stringify({ shots_checked: rows.length, with_record: rows.filter((r) => r.record).length, mismatches }, null, 1));
await browser.close();
