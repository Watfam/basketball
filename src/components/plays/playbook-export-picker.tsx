"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useLocalDraft } from "@/lib/use-local-draft";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/card";
import { PlayThumbnail } from "@/components/plays/play-thumbnail";
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

function ChevronIcon({ dir, className }: { dir: "up" | "down"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "up" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
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
  const [includePhilosophy, setIncludePhilosophy] = useState(true);

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

  /** Always builds a fresh row, even if one already exists — the explicit "Build a new link" action for after the selection's changed. */
  async function buildLink(): Promise<string | null> {
    setStatus("building");
    setErrorMsg("");
    setLinkUrl(null);
    try {
      const result = await withTimeout(createPlaybookExportLinkAction(teamId, order, [...hiddenDefenseIds]), 20_000);
      if ("error" in result) {
        setStatus("error");
        setErrorMsg(result.error);
        return null;
      }
      setLinkUrl(result.url);
      setStatus("idle");
      haptic("success");
      return result.url;
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong building the playbook.");
      return null;
    }
  }

  /** Reuses the current link if there is one; only builds when there isn't yet — View/Share tap this, not buildLink() directly, so they never throw away a perfectly good link just to make another. A play/order/defense change already nulls it out via resetLink(), so this alone is enough to pick up a fresh one next time without needing a separate, user-visible "rebuild" step. */
  async function ensureLinkUrl(): Promise<string | null> {
    return linkUrl ?? buildLink();
  }

  async function handleViewLink() {
    haptic("tap");
    // Opened synchronously, before the await below — Safari can silently drop a window.open that
    // happens after an async gap, since the "this came from a real tap" grace period it grants
    // doesn't reliably survive a server round trip. Opening a blank tab right now, then navigating
    // it once the link is ready, keeps the open itself tied to the actual gesture.
    const newTab = window.open("", "_blank");
    const url = await ensureLinkUrl();
    if (url) {
      if (newTab) newTab.location.href = url;
      else window.open(url, "_blank");
    } else {
      newTab?.close();
    }
  }

  /** A URL shares natively everywhere Web Share exists, standalone app included — sharing a link, unlike a file, never needs to leave the app's own container at all, so there's no window.open escape trick needed here in the first place. */
  async function handleShareLink() {
    haptic("tap");
    const url = await ensureLinkUrl();
    if (!url) return;
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    if (nav.share) {
      try {
        await nav.share({ url, title: "Playbook" });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    // No Web Share support at all (most desktop browsers) — copy it instead, with "Copied!" shown
    // right on the Share button itself since there's no separate URL field to glance at anymore.
    copyToClipboard(url);
  }

  function pdfUrl() {
    const philosophyParam = includePhilosophy ? "" : "&philosophy=0";
    return `/api/playbook-pdf?teamId=${encodeURIComponent(teamId)}&ids=${encodeURIComponent(order.join(","))}&hideDefense=${encodeURIComponent([...hiddenDefenseIds].join(","))}${philosophyParam}`;
  }

  /**
   * Fetches the PDF itself and navigates an already-open tab to the resulting blob, rather than
   * just window.open-ing the API route directly — a raw window.open shows a stark blank white tab
   * for however long the server takes to render the PDF, with no feedback at all on THIS screen.
   * Fetching it here means the "Preparing…" state (shared with Share PDF below) covers that same
   * wait on the button itself, and the new tab only appears once there's something to show it.
   */
  async function handleViewPdf() {
    haptic("tap");
    setPdfStatus("preparing");
    setPdfErrorMsg("");
    const newTab = window.open("", "_blank");
    try {
      const res = await withTimeout(fetch(pdfUrl()), 30_000);
      if (!res.ok) throw new Error("Couldn't build the PDF — try again.");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (newTab) newTab.location.href = blobUrl;
      else window.open(blobUrl, "_blank");
      setPdfStatus("idle");
    } catch (e) {
      newTab?.close();
      setPdfStatus("error");
      setPdfErrorMsg(e instanceof Error ? e.message : "Something went wrong preparing the PDF.");
    }
  }

  /**
   * A real Safari tab's Quick Look viewer has a native Share button built in — but an installed
   * standalone app has none of Safari's chrome, and (unlike a plain link) window.open() for this
   * app's own origin just opens another in-app tab inside the SAME standalone container, not
   * actual Safari — so that escape doesn't work for a file the way it does for a URL. The Web
   * Share API's `files` support sidesteps the whole problem: it hands the PDF straight to iOS's
   * native share sheet (Save to Files, AirDrop, Messages, Print, ...) from right inside the app,
   * standalone or not, so it's used whenever the browser supports it.
   */
  async function handleSharePdf() {
    haptic("tap");
    setPdfStatus("preparing");
    setPdfErrorMsg("");
    const url = pdfUrl();
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
      // No file-sharing support at all (older browser, desktop Safari/Chrome) — fall back to the
      // same plain view-in-a-new-tab behavior as the View button.
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

  function copyToClipboard(text: string) {
    const fallback = () => window.prompt("Copy this link:", text);
    if (!navigator.clipboard?.writeText) return fallback();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      haptic("success");
      setTimeout(() => setCopied(false), 2000);
    }, fallback);
  }

  return (
    <>
    <div className="space-y-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
      <p className="text-sm text-foreground-dim">Pick the plays, in whatever order you want to present them. Starred plays are checked to start.</p>

      {isStandalone && (
        <p className="text-xs text-foreground-mute">Using the installed app — sharing still works fine from the buttons below.</p>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 hover:bg-raised">
        <span className="text-sm font-bold text-foreground">
          Include Team Philosophy <span className="font-normal text-foreground-mute">— PDF only</span>
        </span>
        <input
          type="checkbox"
          checked={includePhilosophy}
          onChange={(e) => { haptic("tap"); setIncludePhilosophy(e.target.checked); }}
          className="h-5 w-5 shrink-0 rounded border-line-strong accent-accent"
        />
      </label>

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
            <Eyebrow>Selected, in this order ({order.length})</Eyebrow>
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
                <div key={id} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5">
                  <span className="w-5 shrink-0 text-center text-xs font-extrabold text-foreground-mute">{i + 1}</span>
                  <div className="relative h-9 w-14 shrink-0 overflow-hidden rounded-md">
                    <PlayThumbnail frames={p.frames} />
                  </div>
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
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line-strong text-foreground-dim disabled:opacity-30"
                  >
                    <ChevronIcon dir="up" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${p.name} down`}
                    disabled={i === order.length - 1}
                    onClick={() => move(id, 1)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line-strong text-foreground-dim disabled:opacity-30"
                  >
                    <ChevronIcon dir="down" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => toggle(id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-foreground-mute"
                  >
                    <XIcon className="h-4 w-4" />
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
            <Eyebrow>{group.label}</Eyebrow>
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
                          <div className="relative h-9 w-14 shrink-0 overflow-hidden rounded-md">
                            <PlayThumbnail frames={p.frames} />
                          </div>
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

    {/*
      A sibling of the padded content above, not nested inside it — the content's own bottom
      padding exists so the last catalog row isn't hidden under this bar (and the real bottom
      nav beneath it), not to leave dead space under the bar itself. Nesting this inside that
      padded div put the padding AFTER the bar instead of reserving room FOR it.

      `bottom` reads --team-bottom-nav-height, published by TeamBottomNav from its own actual
      rendered height (TeamBottomNav.tsx) — a fixed rem guess drifts out of sync with that bar's
      real height/safe-area and leaves a gap; the fallback only covers the instant before that
      effect runs.
    */}
      <div
        className="sticky z-40 -mx-4 space-y-2 rounded-t-2xl border-t border-line bg-background px-5 py-3 shadow-[0_-6px_16px_rgba(0,0,0,0.06)]"
        style={{ bottom: "var(--team-bottom-nav-height, calc(4.75rem + env(safe-area-inset-bottom)))" }}
      >
        {selected.size === 0 && <p className="text-xs font-bold text-accent">Check a play below to include it</p>}
        {status === "error" && <p className="text-xs font-bold text-danger">{errorMsg}</p>}
        {pdfStatus === "error" && <p className="text-xs font-bold text-danger">{pdfErrorMsg}</p>}

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">Interactive</span>
            <button
              type="button"
              onClick={handleViewLink}
              disabled={status === "building" || selected.size === 0}
              className="rounded-full bg-raised px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-foreground-dim hover:text-foreground disabled:opacity-40"
            >
              {status === "building" ? "…" : "View"}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">PDF</span>
            <button
              type="button"
              onClick={handleViewPdf}
              disabled={pdfStatus === "preparing" || selected.size === 0}
              className="rounded-full bg-raised px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-foreground-dim hover:text-foreground disabled:opacity-40"
            >
              {pdfStatus === "preparing" ? "…" : "View"}
            </button>
          </div>

          <Button onClick={handleShareLink} disabled={status === "building" || selected.size === 0} className="whitespace-nowrap">
            {status === "building" ? "Building…" : copied ? "Copied!" : "Share"}
          </Button>
          <Button onClick={handleSharePdf} disabled={pdfStatus === "preparing" || selected.size === 0} className="whitespace-nowrap">
            {pdfStatus === "preparing" ? "Preparing…" : "Share"}
          </Button>
        </div>
      </div>
    </>
  );
}
