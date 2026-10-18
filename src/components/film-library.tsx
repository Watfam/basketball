"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/field";
import { Options, PickOpt, SheetPicker } from "@/components/ui/sheet";
import { FILM_KINDS, SKILL_LABELS } from "@/lib/basketball/film";
import { NO_FILM_FILTERS, filmOptionCounts, filterFilm, hasFilmFilters, whoOptions, type FilmFilters, type FilmLite } from "@/lib/basketball/film-filter";
import { haptic } from "@/lib/haptics";

export type LibrarySection = { key: string; title: string; caption?: string; note?: ReactNode; blocks: { heading?: string; badge?: string; ids: string[] }[] };

/**
 * The Film Room library: search, then filter by skill, kind of lesson, or one pro or trainer. With nothing chosen it is the browse view
 * the library always was (pros, then kinds of lesson). With a search or a filter it is one list of what matches, best fit for the player first,
 * with a count and a way back. The lesson cards themselves are drawn on the server and picked here by id.
 */
export function FilmLibrary({ films, cards, sections, rankedIds, top, browseTop }: { films: FilmLite[]; cards: Record<string, ReactNode>; sections: LibrarySection[]; rankedIds: string[]; top?: ReactNode; browseTop?: ReactNode }) {
  const [f, setF] = useState<FilmFilters>(NO_FILM_FILTERS);
  const set = (change: Partial<FilmFilters>) => setF((x) => ({ ...x, ...change }));
  const skills = useMemo(() => Object.keys(SKILL_LABELS).filter((s) => films.some((x) => x.skill_tags.includes(s))), [films]);
  const kinds = useMemo(() => FILM_KINDS.filter((k) => films.some((x) => x.kind === k.value)), [films]);
  const people = useMemo(() => whoOptions(films), [films]);
  const skillCounts = filmOptionCounts(films, f, "skill", skills);
  const kindCounts = filmOptionCounts(films, f, "kind", kinds.map((k) => k.value));
  const whoCounts = filmOptionCounts(films, f, "who", people.map((p) => p.value));
  const active = hasFilmFilters(f);
  const matching = useMemo(() => {
    const ok = new Set(filterFilm(films, f).map((x) => x.id));
    return rankedIds.filter((id) => ok.has(id));
  }, [films, f, rankedIds]);
  const whoLabel = people.find((p) => p.value === f.who)?.label;

  return (
    <div className="space-y-4">
      {top}
      <div>
        <Input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search a lesson, pro or trainer" aria-label="Search lessons" enterKeyHint="search" />
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Filter lessons">
        <SheetPicker chip label="Skill" title="Skill" active={Boolean(f.skill)} value={f.skill ? SKILL_LABELS[f.skill] : "Any skill"}>
          <Options label="Skill">
            <PickOpt selected={!f.skill} title="Any skill" onPick={() => set({ skill: null })} />
            {skills.map((s) => <PickOpt key={s} selected={f.skill === s} title={SKILL_LABELS[s]} right={String(skillCounts[s])} onPick={() => set({ skill: s })} />)}
          </Options>
        </SheetPicker>
        <SheetPicker chip label="Kind" title="Kind of lesson" active={Boolean(f.kind)} value={f.kind ? kinds.find((k) => k.value === f.kind)?.label ?? "Kind" : "Any kind"}>
          <Options label="Kind of lesson">
            <PickOpt selected={!f.kind} title="Any kind" onPick={() => set({ kind: null })} />
            {kinds.map((k) => <PickOpt key={k.value} selected={f.kind === k.value} title={k.label} sub={k.blurb} right={String(kindCounts[k.value])} onPick={() => set({ kind: k.value })} />)}
          </Options>
        </SheetPicker>
        <SheetPicker chip label="Who" title="A pro or a trainer" active={Boolean(f.who)} value={whoLabel ?? "Anyone"}>
          <Options label="A pro or a trainer">
            <PickOpt selected={!f.who} title="Anyone" onPick={() => set({ who: null })} />
            {people.map((p) => <PickOpt key={p.value} selected={f.who === p.value} title={p.label} sub={p.kind === "Pro" ? "Pro player" : "Trainer"} right={String(whoCounts[p.value])} onPick={() => set({ who: p.value })} />)}
          </Options>
        </SheetPicker>
      </div>

      {active && (
        <p className="flex items-center justify-between gap-3 px-0.5 text-xs text-foreground-dim" aria-live="polite">
          <span>Showing <b className="text-foreground">{matching.length} of {films.length}</b> lessons</span>
          <button type="button" onClick={() => { haptic("tap"); setF(NO_FILM_FILTERS); }} className="-my-3 inline-flex min-h-11 shrink-0 items-center font-extrabold text-accent">Clear</button>
        </p>
      )}

      {active ? (
        matching.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-6 text-center">
            <h3 className="text-base font-bold text-foreground">No lessons like that</h3>
            <p className="mt-1 text-sm text-foreground-dim">Try fewer filters or a different word.</p>
            <button type="button" onClick={() => setF(NO_FILM_FILTERS)} className="mt-3 inline-flex min-h-11 items-center text-sm font-extrabold text-accent">Show every lesson</button>
          </div>
        ) : (
          <div className="space-y-2.5">{matching.map((id) => <div key={id}>{cards[id]}</div>)}</div>
        )
      ) : (
        <div className="space-y-5">
          {browseTop}
          {sections.map((s) => (
            <section key={s.key}>
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">{s.title}</h2>
                {s.caption && <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-foreground-mute">{s.caption}</span>}
              </div>
              {s.note}
              <div className="space-y-4">
                {s.blocks.map((b, i) => (
                  <div key={b.heading ?? i}>
                    {b.heading && (
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <p className="font-display text-lg uppercase leading-none tracking-wide text-foreground">{b.heading}</p>
                        {b.badge && <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent-hover">{b.badge}</span>}
                      </div>
                    )}
                    <div className="space-y-2.5">{b.ids.map((id) => <div key={id}>{cards[id]}</div>)}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
