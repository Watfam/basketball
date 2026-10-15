"use client";

import { useEffect, useRef } from "react";
import { drawPathChart, type ChartLine } from "@/lib/review/path-draw";

/**
 * Observed ball paths side by side with the rim at the centre. Each line is a list of [x, up] positions in ball widths from the rim's centre
 * (right and up are as the camera picture shows them). Only seen points are ever passed in. One square is two ball widths.
 */
export type { ChartLine };

export function PathChart({ lines, label, height = 300, marker }: { lines: ChartLine[]; label: string; height?: number; marker?: [number, number] | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    drawPathChart(ctx, cv.width, cv.height, lines, marker);
  }, [lines, marker]);
  return <canvas ref={ref} width={360} height={height} aria-label={label} className="w-full rounded-lg" />;
}
