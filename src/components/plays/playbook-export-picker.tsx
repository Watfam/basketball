"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useLocalDraft } from "@/lib/use-local-draft";
import { haptic } from "@/lib/haptics";
import { Button, buttonClass } from "@/components/ui/button";
import { PLAY_CATEGORY_LABEL, type LibraryPlay } from "@/lib/plays/library";
import { createPlaybookExportLinkAction } from "@/app/actions/export-playbook";
import { EXPORT_GROUPS } from "@/lib/plays/export/groups";

/** A hung request (flaky connection, a stuck server call) should never leave the button reading "Building…" forever with no way out. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("That's taking too long — check your connection and try again.")), ms)),
  ]);
}

function subscribeToDisplayMode(onChange: () => void) {
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getIsStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
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

/** Whether any frame of this play actually draws defenders — most BLOB plays don't, so there's nothing to toggle for them. */
function hasDefense(p: LibraryPlay): boolean {
  return p.frames.some((f) => f.defense.length > 0);
}

export function PlaybookExportPicker({ teamId, plays }: { teamId: string; plays: LibraryPlay[] }) {
  const playsById = useMemo(() => new Map(plays.map((p) => [p.id, p])), [plays]);

  const [rawStarred] = useLocalDraft(starKey(teamId));
  const starred = useMemo(() => parseStarred(rawStarred), [rawStarred]);
  // null until the real (post-hydration) starred set has been read once — see the effect-free init below.
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
  // `plays` already reflects the team's saved play order (applyPlayOrder, run server-side before
  // this component ever sees it) — defaulting from it rather than the starred Set's own insertion
  // order means the starting selection matches the same order shown in the catalog below.
  const order = useMemo(() => customOrder ?? plays.filter((p) => starred.has(p.id)).map((p) => p.id), [customOrder, starred, plays]);
  const selected = useMemo(() => new Set(order), [order]);

  const [status, setStatus] = useState<"idle" | "building" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [pdfStatus, setPdfStatus] = useState<"idle" | "preparing" | "error">("idle");
  const [pdfErrorMsg, setPdfErrorMsg] = useState("");

  // Plays actually selected that have defense to show/hide at all — the toggle only matters for these.
  const selectedWithDefense = useMemo(() => order.filter((id) => hasDefense(playsById.get(id)!)), [order, playsById]);
  // Off by default for a play means "show defense" (preserves the existing behavior) — this tracks which selected plays have it explicitly turned OFF.
  const [hiddenDefenseIds, setHiddenDefenseIds] = useState<Set<string>>(new Set());

  function toggleDefense(id: string) {
    haptic("tap");
    resetLink();
    setHiddenDefenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAllDefense(shown: boolean) {
    haptic("tap");
    resetLink();
    setHiddenDefenseIds(shown ? new Set() : new Set(selectedWithDefense));
  }

  // An installed "Add to Home Screen" app runs with Safari's own chrome stripped out entirely —
  // no Share sheet, no address bar — by design (that's what display:"standalone" in manifest.ts
  // asks for). The link still opens fine there (it's a real URL, not a file), so this is now just
  // informational rather than a dead end — kept because the address bar being gone is still worth
  // knowing about. useSyncExternalStore (same pattern as use-local-draft.ts) rather than an effect
  // + setState — the server snapshot is always false (no window), nothing to reconcile on hydration.
  const isStandalone = useSyncExternalStore(subscribeToDisplayMode, getIsStandalone, () => false);

  function resetLink() {
    setLinkUrl(null);
    setStatus("idle");
    setErrorMsg("");
  }

  function toggle(id: string) {
    haptic("tap");
    resetLink();
    setCustomOrder((prev) => {
      const base = prev ?? plays.filter((p) => starred.has(p.id)).map((p) => p.id);
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  }

  function move(id: string, dir: -1 | 1) {
    haptic("tap");
    resetLink();
    setCustomOrder((prev) => {
      const base = prev ? [...prev] : plays.filter((p) => starred.has(p.id)).map((p) => p.id);
      const i = base.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= base.length) return base;
      [base[i], base[j]] = [base[j], base[i]];
      return base;
    });
  }

  function selectAllStarred() {
    haptic("tap");
    resetLink();
    setCustomOrder(plays.filter((p) => starred.has(p.id)).map((p) => p.id));
  }

  function selectNone() {
    haptic("tap");
    resetLink();
    setCustomOrder([]);
  }

  async function handleGetLink() {
    setStatus("building");
    setErrorMsg("");
    setLinkUrl(null);
    // Opened synchronously, inside the real tap, before any await — Safari (especially iOS) can
    // silently drop a window.open/target=_blank that happens after an async gap, since the
    // "this came from a real tap" grace period it grants doesn't reliably survive a server round
    // trip. Opening a blank tab right now, then navigating it once the link is ready, keeps the
    // open itself tied to the actual gesture.
    const newTab = window.open("", "_blank");
    try {
      const result = await withTimeout(createPlaybookExportLinkAction(teamId, order, [...hiddenDefenseIds]), 20_000);
      if ("error" in result) {
        newTab?.close();
        setStatus("error");
        setErrorMsg(result.error);
        return;
      }
      if (newTab) newTab.location.href = result.url;
      setLinkUrl(result.url);
      setStatus("idle");
      haptic("success");
    } catch (e) {
      newTab?.close();
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong building the playbook.");
    }
  }

  /**
   * A real Safari tab's Quick Look viewer has a native Share button built in — but an installed
   * standalone app has none of Safari's chrome, and (unlike the "Get link" button's blank-tab
   * trick) window.open() for this app's own origin just opens another in-app tab inside the SAME
   * standalone container, not actual Safari — so that escape never worked for this button, which
   * is why the PWA still showed the PDF with no way to save or share it. The Web Share API's
   * `files` support sidesteps the whole problem: it hands the PDF straight to iOS's native share
   * sheet (Save to Files, AirDrop, Messages, Print, ...) from right inside the app, standalone or
   * not, so it's used whenever the browser supports it rather than only as a standalone fallback.
   */
  async function handleDownloadPdf() {
    haptic("tap");
    setPdfStatus("preparing");
    setPdfErrorMsg("");
    const url = `/api/playbook-pdf?teamId=${encodeURIComponent(teamId)}&ids=${encodeURIComponent(order.join(","))}&hideDefense=${encodeURIComponent([...hiddenDefenseIds].join(","))}`;
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    try {
      if (nav.share && nav.canShare) {
        const res = await withTimeout(fetch(url), 30_000);
        if (!res.ok) throw new Error("Couldn't build the PDF — try again.");
        const blob = await res.blob();
        const file = new File([blob], "playbook.pdf", { type: "application/pdf" });
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file] });
          setPdfStatus("idle");
          return;
        }
      }
      // No file-sharing support at all (older browser, desktop Safari/Chrome) — a real tab's own
      // Quick Look viewer and Share button cover it instead, same as before.
      window.open(url, "_blank");
      setPdfStatus("idle");
    } catch (e) {
      // The user backing out of the native share sheet throws AbortError — not a real failure.
      if (e instanceof Error && e.name === "AbortError") {
        setPdfStatus("idle");
        return;
      }
      setPdfStatus("error");
      setPdfErrorMsg(e instanceof Error ? e.message : "Something went wrong preparing the PDF.");
    }
  }

  function copyLink() {
    if (!linkUrl) return;
    const fallback = () => window.prompt("Copy this link:", linkUrl);
    if (!navigator.clipboard?.writeText) return fallback();
    navigator.clipboard.writeText(linkUrl).then(() => {
      setCopied(true);
      haptic("success");
      setTimeout(() => setCopied(false), 2000);
    }, fallback);
  }

  return (
    <>
    <div className="space-y-5 pb-[calc(9.5rem+env(safe-area-inset-bottom))]">
      <p className="text-sm text-foreground-dim">
        Pick which plays go in the playbook, in whatever order you want to present them. A playbook link opens live in a browser — anyone can watch each play develop, no app or account needed. A PDF is the one to print or hand out — it opens and saves reliably on any device, iPhone included. Starred plays are checked to start.
      </p>

      {isStandalone && (
        <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-bold text-accent">
          You&rsquo;re using the installed app, which hides Safari&rsquo;s address bar. The link below still works fine — copy it with the button provided rather than looking for an address bar.
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={selectAllStarred}>
          Starred only
        </Button>
        <Button variant="ghost" size="sm" onClick={selectNone}>
          Clear all
        </Button>
      </div>

      {order.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-foreground-dim">
              Selected, in this order ({order.length})
            </h2>
            {selectedWithDefense.length > 0 && (
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setAllDefense(true)} className="rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-foreground-dim">
                  Defense on
                </button>
                <button type="button" onClick={() => setAllDefense(false)} className="rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-foreground-dim">
                  Defense off
                </button>
              </div>
            )}
          </div>
          <div className="space-y-1.5 rounded-xl border border-line bg-surface p-2">
            {order.map((id, i) => {
              const p = playsById.get(id);
              if (!p) return null;
              const defenseAvailable = hasDefense(p);
              const defenseShown = defenseAvailable && !hiddenDefenseIds.has(id);
              return (
                <div key={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span className="w-5 shrink-0 text-center text-xs font-extrabold text-foreground-mute">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-foreground">{p.name}</span>
                    <span className="block truncate text-xs text-foreground-mute">
                      {PLAY_CATEGORY_LABEL[p.category]} · {p.vs}
                    </span>
                  </span>
                  {defenseAvailable && (
                    <button
                      type="button"
                      aria-pressed={defenseShown}
                      aria-label={`${defenseShown ? "Hide" : "Show"} defense for ${p.name}`}
                      onClick={() => toggleDefense(id)}
                      className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                        defenseShown ? "border-foreground bg-foreground text-background" : "border-line-strong bg-surface text-foreground-mute"
                      }`}
                    >
                      Defense
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Move ${p.name} up`}
                    disabled={i === 0}
                    onClick={() => move(id, -1)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line-strong text-foreground-dim disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${p.name} down`}
                    disabled={i === order.length - 1}
                    onClick={() => move(id, 1)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line-strong text-foreground-dim disabled:opacity-30"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => toggle(id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground-mute"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {EXPORT_GROUPS.map((group) => {
        const groupPlays = plays.filter((p) => group.categories.includes(p.category));
        if (!groupPlays.length) return null;
        return (
          <section key={group.label} className="space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-foreground-dim">{group.label}</h2>
            {/* Sub-grouped by exact category (all BLOB together, all SLOB together, etc.), same as the main Playbook screen — not one flat list across every category this broad section spans. */}
            {group.categories.map((cat) => {
              const catPlays = groupPlays.filter((p) => p.category === cat);
              if (!catPlays.length) return null;
              return (
                <div key={cat} className="space-y-1.5">
                  {group.categories.length > 1 && (
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">{PLAY_CATEGORY_LABEL[cat]}</h3>
                  )}
                  <div className="space-y-1.5 rounded-xl border border-line bg-surface p-2">
                    {catPlays.map((p) => {
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
                            <span className="block truncate text-xs text-foreground-mute">{p.vs}</span>
                          </span>
                          {starred.has(p.id) && (
                            <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-accent">Starred</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>

    {/* A sibling of the padded content above, not nested inside it — the content's own
        bottom padding exists so the last catalog row isn't hidden under this bar (and the
        real bottom nav beneath it), not to leave dead space under the bar itself. Nesting
        this inside that padded div put the padding AFTER the bar instead of reserving room
        FOR it: once scrolled to the end, the bar would un-stick and sit well above the real
        nav with a large blank gap trailing it — exactly the "floating" look this fixes. */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 -mx-4 space-y-2 border-t border-line bg-background px-5 py-3">
        {linkUrl ? (
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <input readOnly value={linkUrl} className="min-w-0 flex-1 truncate rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs text-foreground-dim" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" onClick={copyLink}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        ) : (
          <div className="mx-auto max-w-lg text-xs text-foreground-dim">
            {selected.size === 0 ? (
              <span className="font-bold text-accent">Check a play below to include it</span>
            ) : (
              <>
                {selected.size} play{selected.size === 1 ? "" : "s"} selected
              </>
            )}
            {status === "error" && <span className="mt-0.5 block font-bold text-danger">{errorMsg}</span>}
          </div>
        )}
        {pdfStatus === "error" && (
          <p className="mx-auto max-w-lg text-xs font-bold text-danger">{pdfErrorMsg}</p>
        )}
        <div className="mx-auto flex max-w-lg gap-2">
          <Button onClick={handleGetLink} disabled={status === "building" || selected.size === 0} className="flex-1 whitespace-nowrap">
            {status === "building" ? "Building…" : linkUrl ? "New link" : "Get link"}
          </Button>
          <button
            type="button"
            disabled={pdfStatus === "preparing" || selected.size === 0}
            onClick={handleDownloadPdf}
            className={buttonClass({ variant: "secondary", className: "flex-1 whitespace-nowrap" })}
          >
            {pdfStatus === "preparing" ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </div>
    </>
  );
}
