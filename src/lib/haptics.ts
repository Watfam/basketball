/**
 * Taps and buzzes. Android and Chrome have the Web Vibration API. iPhone
 * Safari doesn't, so there a light tap is borrowed from the system switch
 * control (Safari 17.4 and later taps the finger when an
 * `<input type="checkbox" switch>` is toggled). That only works during a
 * touch, so a buzz from a timer running on its own can't be felt on an
 * iPhone; the sounds in alerts.ts carry those. Where neither exists this
 * does nothing.
 */
type HapticPattern = "tap" | "step" | "success" | "warning" | "alarm";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  step: 12,
  success: [10, 40, 10, 40, 20],
  // Ten seconds left on a drill: three distinct buzzes, long enough to
  // feel through a pocket rather than read as an incidental tap.
  warning: [70, 130, 70, 130, 70],
  // Time's up: one solid buzz, paired with the beeps in alerts.ts.
  alarm: [320],
};

let tickLabel: HTMLLabelElement | null = null;

/** One light tap on an iPhone: toggle a hidden system switch. */
function iosTick() {
  try {
    if (!tickLabel || !tickLabel.isConnected) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.id = "hl-haptic-switch";
      input.tabIndex = -1;
      const label = document.createElement("label");
      label.htmlFor = input.id;
      label.setAttribute("aria-hidden", "true");
      label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
      label.append(input);
      document.body.append(label);
      tickLabel = label;
    }
    tickLabel.click();
  } catch {
    // No haptics here.
  }
}

/** The start of each buzz in a vibration pattern: a number is one, an array alternates buzz and pause. */
function buzzStarts(pattern: number | number[]): number[] {
  if (typeof pattern === "number") return [0];
  const starts: number[] = [];
  let t = 0;
  pattern.forEach((ms, i) => {
    if (i % 2 === 0) starts.push(t);
    t += ms;
  });
  return starts;
}

export function haptic(pattern: HapticPattern) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(PATTERNS[pattern]);
    return;
  }
  if (typeof document === "undefined" || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
  const starts = buzzStarts(PATTERNS[pattern]);
  iosTick();
  for (const at of starts.slice(1)) setTimeout(iosTick, at);
}
