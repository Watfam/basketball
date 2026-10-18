"use client";

import { useEffect, useState } from "react";

type Reading = {
  type: string; target: string; hit: string;
  client: [number, number]; page: [number, number]; screen: [number, number]; offset: [number, number];
  /** The aim's own readings of this touch (y only): by rect, by offset, the one used, and the canvas's top and height. */
  aim?: { byRect: number; offset: number; used: number; rectTop: number; h: number };
};

const r0 = (n: number) => Math.round(n);

/** A touch check for a screen where touches seem to land away from the finger: the numbers the browser reports, and a dot where it says the touch is. */
export function TouchDiag() {
  const [last, setLast] = useState<Reading | null>(null);
  const [rows, setRows] = useState<Reading[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const reading: Reading = {
        type: e.type, target: `${t.tagName}${t.getAttribute("aria-label") ? "·" + t.getAttribute("aria-label")!.slice(0, 12) : ""}`,
        hit: hit ? hit.tagName : "none",
        client: [e.clientX, e.clientY], page: [e.pageX, e.pageY], screen: [e.screenX, e.screenY], offset: [e.offsetX, e.offsetY],
      };
      setLast(reading);
      if (e.type === "pointerdown") {
        // The picture's own handler runs just after this one, so its reading is collected a moment later.
        setTimeout(() => {
          reading.aim = (window as unknown as { __aimRead?: Reading["aim"] }).__aimRead;
          setRows((r) => [reading, ...r].slice(0, 5));
        }, 0);
      }
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
      <div className="pointer-events-none absolute left-2 top-12 z-[70] w-[min(30rem,70%)] rounded-xl bg-black/80 p-2 font-mono text-[10px] leading-snug text-white">
        <p className="font-sans text-xs font-extrabold">Touch check: tap the top, middle and bottom of the picture. To close, hold two fingers on the picture.</p>
        <p>build {process.env.NEXT_PUBLIC_BUILD} · window {window.innerWidth}x{window.innerHeight} · {standalone ? "app" : "tab"} · scroll {r0(window.scrollY)} · visual top {vv ? r0(vv.offsetTop) : "n/a"}</p>
        <p>picture top {rect(canvas)} · bar {rect(panel)}</p>
        <p>y: finger (screen) | client | offset | page | by rect | used | rect top</p>
        {rows.map((x, i) => (
          <p key={i}>{r0(x.screen[1])} | {r0(x.client[1])} | {r0(x.offset[1])} | {r0(x.page[1])} | {x.aim ? `${r0(x.aim.byRect)} | ${r0(x.aim.used)} | ${r0(x.aim.rectTop)}` : "(not the picture)"} · {x.target.slice(0, 8)}</p>
        ))}
      </div>
    </>
  );
}
