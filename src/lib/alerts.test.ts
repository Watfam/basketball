import { test } from "node:test";
import assert from "node:assert/strict";

// A stand-in for the browser's audio: records what is played and lets a test put the audio clock in the state iOS puts it in after a call.
const played: { type: string; at: number; frequency: number; peak: number }[] = [];
let lastPeak = 0;
let resumes = 0;
const instances: FakeContext[] = [];
class FakeContext {
  constructor() {
    instances.push(this);
  }
  state = "suspended";
  currentTime = 10;
  destination = {};
  createBuffer() { return {}; }
  createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime(v: number) { if (v > 0) lastPeak = v; } }, connect() {} }; }
  createDynamicsCompressor() { return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect() {} }; }
  createOscillator() {
    const o = { type: "", frequency: { value: 0 }, connect() {}, start: (at: number) => played.push({ type: o.type, at, frequency: o.frequency.value, peak: lastPeak }), stop() {} };
    return o;
  }
  resume() { resumes += 1; this.state = "running"; return Promise.resolve(); }
}
const session = { type: "auto" };
const listeners: Record<string, () => void> = {};
Object.assign(globalThis, {
  window: { AudioContext: FakeContext, dispatchEvent() { return true; } },
  document: { visibilityState: "visible", addEventListener: (n: string, f: () => void) => (listeners[n] = f) },
});
Object.defineProperty(globalThis, "navigator", { value: { audioSession: session }, configurable: true });

const alerts = await import("./alerts.ts");

test("priming from a tap puts iOS in playback mode, so the silent switch doesn't mute it", () => {
  alerts.primeAlerts();
  assert.equal(session.type, "playback");
});

test("a sound check plays a high blip, a low blip and three beeps, spaced apart, and says how the audio is doing", () => {
  played.length = 0;
  const status = alerts.soundCheck();
  assert.equal(played.length, 5);
  assert.deepEqual(played.map((p) => p.frequency), [1400, 620, 1500, 1500, 1500]);
  assert.ok(played.every((p) => p.frequency >= 500), "every pitch is where a phone speaker is strong, not the 330 Hz that was lost outdoors");
  assert.ok(played[1].at - played[0].at >= 0.45 && played[2].at - played[1].at >= 0.45, "blips are apart from each other");
  assert.deepEqual(status, { state: "running", session: "playback" });
});

test("audio the phone interrupted (a call, the lock screen) is started again before the next beep", () => {
  const ctx = instances[0];
  ctx.state = "interrupted"; // what Safari reports after a call or the lock screen
  const before = resumes;
  played.length = 0;
  alerts.beepWarning();
  assert.equal(resumes, before + 1, "the audio was started again");
  assert.equal(played.length, 3, "and the beeps were scheduled");
  // coming back to the app also starts it again
  ctx.state = "interrupted";
  listeners["visibilitychange"]();
  assert.equal(ctx.state, "running");
});

test("the sound level sets how loud: Loud by default, Normal as it used to be; an old 'max' setting is Loud", async () => {
  const { writeDraft } = await import("./use-local-draft.ts");
  const peakAt = (level: string | null) => {
    writeDraft("hl:sound:level", level);
    played.length = 0;
    alerts.blipShot(true);
    return { peak: played[0].peak, type: played[0].type };
  };
  assert.deepEqual(peakAt(null), { peak: 1, type: "square" }, "Loud when nothing was chosen");
  assert.deepEqual(peakAt("normal"), { peak: 0.3, type: "sine" });
  assert.deepEqual(peakAt("loud"), { peak: 1, type: "square" });
  assert.deepEqual(peakAt("max"), { peak: 1, type: "square" }, "a phone that chose the short-lived Max keeps the same loudness as Loud");
  assert.deepEqual(peakAt("nonsense"), { peak: 1, type: "square" }, "an unknown value is Loud");
  writeDraft("hl:sound:level", null);
});
