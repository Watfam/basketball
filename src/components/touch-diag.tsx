"use client";

import { useEffect, useState } from "react";

type Reading = {
  type: string; target: string; hit: string;
  client: [number, number]; page: [number, number]; screen: [number, number]; offset: [number, number];
};

const r0 = (n: number) => Math.round(n);

/** A touch check for a screen where touches seem to land away from the finger: the numbers the browser reports, and a dot where it says the touch is. */
export function TouchDiag({ onClose }: { onClose: () => void }) {
  const [last, setLast] = useState<Reading | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      setLast({
        type: e.type, target: `${t.tagName}${t.getAttribute("aria-label") ? "·" + t.getAttribute("aria-label")!.slice(0, 12) : ""}`,
        hit: hit ? hit.tagName : "none",
        client: [e.clientX, e.clientY], page: [e.pageX, e.pageY], screen: [e.screenX, e.screenY], offset: [e.offsetX, e.offsetY],
      });
    };
    const rs = () => tick((n) => n + 1);
    window.addEventListener("pointerdown", on, true);
    window.addEventListener("pointermove", on, true);
    window.addEventListener("resize", rs);
    window.visualViewport?.addEventListener("resize", rs);
    window.visualViewport?.addEventListener("scroll", rs);
    return () => {
      window.removeEventListener("pointerdown", on, true);
      window.removeEventListener("pointermove", on, true);
      window.removeEventListener("resize", rs);
      window.visualViewport?.removeEventListener("resize", rs);
      window.visualViewport?.removeEventListener("scroll", rs);
    };
  }, []);
  const vv = window.visualViewport;
  const canvas = document.querySelector("canvas")?.getBoundingClientRect();
  const panel = document.querySelector("[data-aim-panel]")?.getBoundingClientRect();
  const rect = (r?: DOMRect) => (r ? `${r0(r.left)},${r0(r.top)} ${r0(r.width)}x${r0(r.height)}` : "none");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return (
    <>
      {last && <span aria-hidden="true" className="pointer-events-none fixed z-[70] h-4 w-4 rounded-full border-2 border-white bg-red-500" style={{ left: last.client[0] - 8, top: last.client[1] - 8 }} />}
      <div className="absolute left-1/2 top-12 z-[70] w-[min(34rem,92%)] -translate-x-1/2 rounded-xl bg-black/85 p-3 font-mono text-[11px] leading-snug text-white">
        <p className="mb-1 flex items-center justify-between font-sans text-xs font-extrabold">
          Touch check: the red dot is where the browser says your finger is
          <button type="button" onClick={onClose} className="ml-2 min-h-11 rounded-lg bg-white/20 px-3">Close</button>
        </p>
        <p>window {window.innerWidth}x{window.innerHeight} · screen {screen.width}x{screen.height} · {standalone ? "app" : "browser tab"}</p>
        <p>visual {vv ? `${r0(vv.width)}x${r0(vv.height)} at ${r0(vv.offsetLeft)},${r0(vv.offsetTop)} page ${r0(vv.pageLeft)},${r0(vv.pageTop)} zoom ${vv.scale.toFixed(2)}` : "n/a"} · scroll {r0(window.scrollX)},{r0(window.scrollY)}</p>
        <p>picture {rect(canvas)} · bar {rect(panel)}</p>
        <p>{last ? `${last.type} on ${last.target}, there is ${last.hit}` : "Touch the screen"}</p>
        {last && <p>client {r0(last.client[0])},{r0(last.client[1])} · page {r0(last.page[0])},{r0(last.page[1])} · screen {r0(last.screen[0])},{r0(last.screen[1])} · in target {r0(last.offset[0])},{r0(last.offset[1])}</p>}
      </div>
    </>
  );
}
