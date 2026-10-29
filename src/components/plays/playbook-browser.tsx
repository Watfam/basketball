"use client";

import { useMemo, useState } from "react";
import { Card, Eyebrow } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";
import { readDraft, useLocalDraft, writeDraft } from "@/lib/use-local-draft";
import { PlayThumbnail } from "@/components/plays/play-thumbnail";
import { PLAY_CATEGORY_LABEL, type LibraryPlay, type PlayCategory } from "@/lib/plays/library";

type TabKey = "offense" | "situations" | "defense" | "starred";
const TABS: { key: TabKey; label: string; categories: PlayCategory[] | null }[] = [
  { key: "offense", label: "Offense", categories: ["man", "zone"] },
  { key: "situations", label: "Situations", categories: ["blob", "slob", "fullCourt", "late"] },
  { key: "defense", label: "Defense", categories: ["defense"] },
  { key: "starred", label: "Starred", categories: null },
];

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

function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  );
}

function matches(p: LibraryPlay, q: string): boolean {
  const hay = `${p.name} ${p.vs} ${p.about} ${p.source ?? ""} ${PLAY_CATEGORY_LABEL[p.category]}`.toLowerCase();
  return hay.includes(q);
}

export function PlaybookBrowser({ teamId, plays: allPlays }: { teamId: string; plays: LibraryPlay[] }) {
  const [tab, setTab] = useState<TabKey>("offense");
  const [chip, setChip] = useState<"all" | PlayCategory>("all");
  const [query, setQuery] = useState("");
  const [rawStarred] = useLocalDraft(starKey(teamId));
  const starred = useMemo(() => parseStarred(rawStarred), [rawStarred]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleStar(id: string) {
    haptic("tap");
    const key = starKey(teamId);
    const next = parseStarred(readDraft(key));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeDraft(key, JSON.stringify([...next]));
  }

  function toggleExpanded(id: string) {
    haptic("tap");
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    if (q) {
      const results = allPlays.filter((p) => matches(p, q));
      return results.length ? [{ label: `Search results`, plays: results }] : [];
    }
    if (tab === "starred") {
      const results = allPlays.filter((p) => starred.has(p.id));
      return results.length ? [{ label: "Starred", plays: results }] : [];
    }
    const cats = activeTab.categories ?? [];
    const visibleCats = chip === "all" ? cats : [chip as PlayCategory];
    return visibleCats
      .map((cat) => ({ label: PLAY_CATEGORY_LABEL[cat], plays: allPlays.filter((p) => p.category === cat) }))
      .filter((g) => g.plays.length > 0);
  }, [q, tab, chip, starred, activeTab, allPlays]);

  return (
    <div className="space-y-4">
      <ButtonLink href={`/teams/${teamId}/plays`} size="md" block onClick={() => haptic("tap")}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        New play
      </ButtonLink>

      <div className="relative">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-mute" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all plays"
          aria-label="Search plays"
          className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />
      </div>

      {!q && (
        <>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-raised p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  haptic("tap");
                  setTab(t.key);
                  setChip("all");
                }}
                aria-current={tab === t.key}
                className={`rounded-lg py-2 text-xs font-extrabold uppercase tracking-wide ${
                  tab === t.key ? "bg-surface text-foreground shadow-sm" : "text-foreground-dim"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab.categories && activeTab.categories.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {(["all", ...activeTab.categories] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    setChip(c);
                  }}
                  aria-pressed={chip === c}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap ${
                    chip === c ? "border-foreground bg-foreground text-background" : "border-line-strong bg-surface text-foreground-dim"
                  }`}
                >
                  {c === "all" ? "All" : PLAY_CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {groups.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground-mute">
          {q
            ? "No plays match that search."
            : tab === "starred"
              ? "No starred plays yet. Star a play to pull it up fast on game night."
              : "Nothing here yet."}
        </p>
      )}

      {groups.map((g) => (
        <section key={g.label}>
          <Eyebrow>
            {g.label} · {g.plays.length}
          </Eyebrow>
          <div className="mt-2 space-y-3">
            {g.plays.map((p) => {
              const isStarred = starred.has(p.id);
              const isOpen = expanded.has(p.id);
              return (
                <Card key={p.id} className="overflow-hidden p-0">
                  <div className="relative h-28 w-full">
                    <PlayThumbnail frames={p.frames} />
                    <button
                      type="button"
                      onClick={() => toggleStar(p.id)}
                      aria-pressed={isStarred}
                      aria-label={isStarred ? "Unstar this play" : "Star this play"}
                      className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/70"
                    >
                      <StarIcon filled={isStarred} className={`h-4 w-4 ${isStarred ? "text-accent" : ""}`} />
                    </button>
                    {p.videoUrl && (
                      <a
                        href={p.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white backdrop-blur hover:bg-black/70"
                      >
                        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden><path d="M6 4 20 12 6 20Z" /></svg>
                        Film
                      </a>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[15px] font-bold text-foreground">{p.name}</h3>
                      <span className="shrink-0 rounded-full border border-line-strong px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
                        {PLAY_CATEGORY_LABEL[p.category]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-foreground-dim">{p.vs}</p>

                    <button
                      type="button"
                      onClick={() => toggleExpanded(p.id)}
                      aria-expanded={isOpen}
                      className="mt-3 flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide text-accent"
                    >
                      <svg viewBox="0 0 24 24" className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                      Steps &amp; coaching points
                    </button>

                    {isOpen && (
                      <div className="mt-3 space-y-3 border-t border-line pt-3">
                        <p className="text-xs leading-relaxed text-foreground-dim">{p.about}</p>
                        <ol className="space-y-1.5">
                          {p.frames.map((f, i) => (
                            <li key={i} className="flex gap-2 text-xs leading-relaxed text-foreground-dim">
                              <span className="shrink-0 font-mono font-bold text-foreground-mute">{i === 0 ? "SET" : i}</span>
                              <span>{f.note}</span>
                            </li>
                          ))}
                        </ol>
                        {p.keys.length > 0 && (
                          <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Coaching points</p>
                            <ul className="mt-1 list-disc space-y-1 pl-4">
                              {p.keys.map((k, i) => (
                                <li key={i} className="text-xs leading-relaxed text-foreground-dim">
                                  {k}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {p.source && <p className="text-[11px] leading-relaxed text-foreground-mute">{p.source}</p>}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <ButtonLink href={`/teams/${teamId}/plays/playbook/${p.id}`} size="sm" variant="secondary">
                        View play
                      </ButtonLink>
                      <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
                        {p.frames.length} beats
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
