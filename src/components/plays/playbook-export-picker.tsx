"use client";

import { useMemo, useState } from "react";
import { useLocalDraft } from "@/lib/use-local-draft";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { PLAY_CATEGORY_LABEL, type LibraryPlay, type PlayCategory } from "@/lib/plays/library";
import { buildPlaybookExportHtml } from "@/app/actions/export-playbook";

/** A hung request (flaky connection, a stuck server call) should never leave the button reading "Building…" forever with no way out. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("That's taking too long — check your connection and try again.")), ms)),
  ]);
}

function starKey(teamId: string) {
  return `plays-starred-${teamId}`;
}

function parseStarred(raw: string | null): Set<string> {
  try {
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

const GROUPS: { label: string; categories: PlayCategory[] }[] = [
  { label: "Offense", categories: ["man", "zone"] },
  { label: "Situations", categories: ["blob", "slob", "fullCourt", "late"] },
  { label: "Defense", categories: ["defense"] },
];

export function PlaybookExportPicker({ teamId, plays }: { teamId: string; plays: LibraryPlay[] }) {
  const [rawStarred] = useLocalDraft(starKey(teamId));
  const starred = useMemo(() => parseStarred(rawStarred), [rawStarred]);
  // null until the real (post-hydration) starred set has been read once — see the effect-free init below.
  const [customSelection, setCustomSelection] = useState<Set<string> | null>(null);
  const selected = customSelection ?? starred;

  const [status, setStatus] = useState<"idle" | "building" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function toggle(id: string) {
    haptic("tap");
    setCustomSelection(() => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllStarred() {
    haptic("tap");
    setCustomSelection(new Set(starred));
  }

  function selectNone() {
    haptic("tap");
    setCustomSelection(new Set());
  }

  async function handleOpen() {
    setStatus("building");
    setErrorMsg("");
    // Opened synchronously, inside the real tap, before any await — Safari (especially iOS) can
    // silently drop a window.open/target=_blank that happens after an async gap, since the
    // "this came from a real tap" grace period it grants doesn't reliably survive a server
    // round trip. Opening a blank tab right now, then filling it in once the HTML is ready,
    // keeps the open itself tied to the actual gesture.
    const newTab = window.open("", "_blank");
    try {
      const result = await withTimeout(buildPlaybookExportHtml(teamId, [...selected]), 20_000);
      if ("error" in result) {
        newTab?.close();
        setStatus("error");
        setErrorMsg(result.error);
        return;
      }
      if (!newTab) {
        setStatus("error");
        setErrorMsg("Your browser blocked the new tab — allow pop-ups for this site and try again.");
        return;
      }
      // No `download` attribute and no blob: URL at all — on iPhone, a downloaded .html file opens
      // in Quick Look (doesn't run JavaScript), and a blob: URL opened as a fresh top-level tab has
      // its own Safari quirks. Writing the HTML straight into an already-open tab sidesteps both:
      // it's just a normal document load, scripts and all.
      newTab.document.open();
      newTab.document.write(result.html);
      newTab.document.close();
      setStatus("idle");
      haptic("success");
    } catch (e) {
      newTab?.close();
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong building the playbook.");
    }
  }

  return (
    <div className="space-y-5 pb-[calc(9.5rem+env(safe-area-inset-bottom))]">
      <p className="text-sm text-foreground-dim">
        Pick which plays go in the playbook — opens in a new tab with the notes and the animated diagram for each one, ready to save or share from there. Starred plays are checked to start.
      </p>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={selectAllStarred}>
          Starred only
        </Button>
        <Button variant="ghost" size="sm" onClick={selectNone}>
          Clear all
        </Button>
      </div>

      {GROUPS.map((group) => {
        const groupPlays = plays.filter((p) => group.categories.includes(p.category));
        if (!groupPlays.length) return null;
        return (
          <section key={group.label} className="space-y-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-foreground-dim">{group.label}</h2>
            <div className="space-y-1.5 rounded-xl border border-line bg-surface p-2">
              {groupPlays.map((p) => {
                const checked = selected.has(p.id);
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-raised">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="h-5 w-5 shrink-0 rounded border-line-strong accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">{p.name}</span>
                      <span className="block truncate text-xs text-foreground-mute">
                        {PLAY_CATEGORY_LABEL[p.category]} · {p.vs}
                      </span>
                    </span>
                    {starred.has(p.id) && (
                      <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-accent">Starred</span>
                    )}
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 -mx-4 border-t border-line bg-background px-5 py-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="flex-1 text-xs text-foreground-dim">
            {selected.size === 0 ? (
              <span className="font-bold text-accent">Check a play below to include it</span>
            ) : (
              <>
                {selected.size} play{selected.size === 1 ? "" : "s"} selected
              </>
            )}
            {status === "error" && <span className="mt-0.5 block font-bold text-danger">{errorMsg}</span>}
          </div>
          <Button onClick={handleOpen} disabled={status === "building" || selected.size === 0}>
            {status === "building" ? "Building…" : "Open playbook"}
          </Button>
        </div>
      </div>
    </div>
  );
}
