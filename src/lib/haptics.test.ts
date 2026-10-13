import { test } from "node:test";
import assert from "node:assert/strict";

let clicks = 0;
const made: string[] = [];
const label = { isConnected: true, style: { cssText: "" }, htmlFor: "", append() {}, setAttribute() {}, click: () => (clicks += 1) };
const input = { type: "", id: "", tabIndex: 0, setAttribute() {} };
Object.assign(globalThis, {
  document: { createElement: (t: string) => (made.push(t), t === "label" ? label : input), body: { append() {} } },
});
let vibrated: unknown = null;
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)" }, configurable: true, writable: true });
const { haptic } = await import("./haptics.ts");

test("on an iPhone (no vibrate) a tap toggles the hidden system switch once", () => {
  clicks = 0;
  haptic("tap");
  assert.equal(clicks, 1);
  assert.deepEqual(made, ["input", "label"]);
});

test("a pattern of three buzzes is three taps, spaced as the pattern is", async () => {
  clicks = 0;
  haptic("warning"); // 70 on, 130 off, 70, 130, 70: three buzzes at 0, 200 and 400 ms
  assert.equal(clicks, 1);
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(clicks, 3);
});

test("where vibrate exists it is used and the switch is left alone", () => {
  clicks = 0;
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Android", vibrate: (p: unknown) => (vibrated = p) }, configurable: true, writable: true });
  haptic("success");
  assert.deepEqual(vibrated, [10, 40, 10, 40, 20]);
  assert.equal(clicks, 0);
});

test("elsewhere (a desktop without vibrate) nothing happens and nothing breaks", () => {
  clicks = 0;
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Mozilla/5.0 (Macintosh)" }, configurable: true, writable: true });
  haptic("tap");
  assert.equal(clicks, 0);
});
