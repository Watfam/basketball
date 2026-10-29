"use client";

import { haptic } from "@/lib/haptics";
import type { Tool } from "@/components/plays/play-court";

const TOOLS: { key: Tool; label: string }[] = [
  { key: "move", label: "Move" },
  { key: "pass", label: "Pass" },
  { key: "cut", label: "Cut" },
  { key: "dribble", label: "Dribble" },
  { key: "screen", label: "Screen" },
  { key: "erase", label: "Erase" },
];

function ToolIcon({ tool, className }: { tool: Tool; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (tool) {
    case "move":
      return (
        <svg {...common}>
          <path d="M12 3v18M3 12h18M6 8l-3 4 3 4M18 8l3 4-3 4M8 6l4-3 4 3M8 18l4 3 4-3" />
        </svg>
      );
    case "pass":
      return (
        <svg {...common}>
          <path d="M4 18 18 6" strokeDasharray="3 2.4" />
          <path d="M12 6h6v6" />
        </svg>
      );
    case "cut":
      return (
        <svg {...common}>
          <path d="M4 18 18 6" />
          <path d="M12 6h6v6" />
        </svg>
      );
    case "dribble":
      return (
        <svg {...common}>
          <path d="M4 19 9 9l5 8 3-6 3 4" />
        </svg>
      );
    case "screen":
      return (
        <svg {...common}>
          <path d="M5 19 19 5" />
          <path d="M15.5 4.5 19 8" />
        </svg>
      );
    case "erase":
      return (
        <svg {...common}>
          <path d="M4 17 14 7l5 5-10 10H6Z" />
          <path d="M9 20H4" />
        </svg>
      );
  }
}

export function Toolbar({ tool, onSelect }: { tool: Tool; onSelect: (t: Tool) => void }) {
  return (
    <nav
      aria-label="Drawing tool"
      className="shrink-0 border-t border-line bg-background/95 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur"
    >
      <div className="mx-auto grid w-full max-w-lg grid-cols-6 gap-1 px-1.5">
        {TOOLS.map((t) => {
          const active = tool === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                haptic("tap");
                onSelect(t.key);
              }}
              aria-pressed={active}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-extrabold uppercase tracking-[0.04em] transition-colors ${
                active
                  ? t.key === "erase"
                    ? "bg-danger/10 text-danger"
                    : "bg-accent/10 text-accent"
                  : "text-foreground-mute hover:text-foreground-dim"
              }`}
            >
              <ToolIcon tool={t.key} className="h-5 w-5" />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
