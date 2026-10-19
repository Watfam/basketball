import puppeteer from "puppeteer-core";
import { createRequire } from "module"; const require = createRequire(import.meta.url); const axeSrc = require("fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on("pageerror", (e) => { console.log("PAGEERROR", e.message.slice(0, 200)); fails++; });
await p.goto("http://localhost:3101/lab/p22-sound", { waitUntil: "networkidle0", timeout: 120000 }); await wait(500);
const stats = await p.evaluate(async () => {
  const out = {};
  for (const kind of ["make", "miss", "warning", "done"]) for (const level of ["normal", "loud", "max"]) {
    const a = await window.__render(level, kind);
    let peak = 0, sum = 0, n = 0; for (const v of a) { peak = Math.max(peak, Math.abs(v)); if (Math.abs(v) > 1e-4) { sum += v * v; n++; } }
    out[`${kind}:${level}`] = { peak, rms: Math.sqrt(sum / Math.max(1, n)) };
  }
  // the old sound: a sine at 0.2 (the shot blip) for comparison
  const c = new OfflineAudioContext(1, 44100, 44100); const o = c.createOscillator(); const g = c.createGain(); o.type = "sine"; o.frequency.value = 1040; g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.2, 0.012); g.gain.setValueAtTime(0.2, 0.05); g.gain.linearRampToValueAtTime(0, 0.08); o.connect(g); g.connect(c.destination); o.start(0); o.stop(0.1);
  const a = (await c.startRendering()).getChannelData(0); let sum = 0, n = 0, peak = 0; for (const v of a) { peak = Math.max(peak, Math.abs(v)); if (Math.abs(v) > 1e-4) { sum += v * v; n++; } }
  out.old = { peak, rms: Math.sqrt(sum / n) };
  return out;
});
const db = (x, y) => 20 * Math.log10(x / y);
for (const kind of ["make", "miss", "warning", "done"]) {
  const n = stats[`${kind}:normal`], l = stats[`${kind}:loud`], m = stats[`${kind}:max`];
  ok(m.rms > l.rms && l.rms > n.rms, `${kind}: Max > Loud > Normal (rms ${n.rms.toFixed(2)} / ${l.rms.toFixed(2)} / ${m.rms.toFixed(2)})`);
  ok(m.peak <= 1.0001, `${kind}: never clips (peak ${m.peak.toFixed(3)})`);
}
const gain = db(stats["make:max"].rms, stats.old.rms), gainLoud = db(stats["make:loud"].rms, stats.old.rms);
console.log(`make blip: old ${stats.old.rms.toFixed(3)} rms; Loud ${gainLoud.toFixed(1)} dB louder; Max ${gain.toFixed(1)} dB louder`);
ok(gain >= 12, "Max is at least 12 dB louder than the old shot blip (about four times the pressure)");
ok(gainLoud >= 8, "and the Loud default is at least 8 dB louder");
// the picker
const text = () => p.evaluate(() => document.body.innerText);
ok(/Sound level/i.test(await text()) && /Normal/.test(await text()) && /Loud/.test(await text()) && /Max/.test(await text()), "the sound check has a Sound level picker: Normal, Loud, Max");
const checked = () => p.evaluate(() => [...document.querySelectorAll("[role=radio]")].find((x) => x.getAttribute("aria-checked") === "true")?.innerText);
ok((await checked()) === "Loud", "Loud is chosen by default");
await p.evaluate(() => [...document.querySelectorAll("[role=radio]")].find((x) => /Max/.test(x.innerText)).click()); await wait(300);
ok((await checked()) === "Max" && (await p.evaluate(() => localStorage.getItem("hl:sound:level"))) === "max", "choosing Max is remembered on the phone");
await p.reload({ waitUntil: "networkidle0" }); await wait(300); ok((await checked()) === "Max", "and is still Max after reopening");
const small = await p.evaluate(() => [...document.querySelectorAll("button")].filter((e) => e.getBoundingClientRect().height < 40).map((e) => e.innerText));
ok(small.length === 0, "tap targets are at least 40 px " + small.join("|"));
const v = await p.evaluate(async (src) => { const s = document.createElement("script"); s.textContent = src; document.head.append(s); const r = await window.axe.run(document.body, { runOnly: ["wcag2a", "wcag2aa"] }); return r.violations.map((x) => x.id + ":" + x.nodes.length); }, axeSrc);
ok(v.length === 0, "axe: no violations " + v.join(","));
await p.screenshot({ path: "sound.png" }); console.log(fails ? "FAILED" : "ALL PASSED"); await b.close();
