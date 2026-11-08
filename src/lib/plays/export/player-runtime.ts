/**
 * Entry point bundled (via scripts/build-playbook-export-bundle.mjs, esbuild) into a single IIFE and
 * inlined into the exported playbook HTML. No React, no framework — runs standalone in a plain
 * double-clicked HTML file. Reuses the real app's pure playback/geometry math (imported straight from
 * ../playback, ../resolve, ../bounds) so the exported animation is byte-for-byte the same motion as
 * the live PlayViewer, not a hand-rolled approximation.
 */
import { advanceClock, interpolateFrame, type PlaybackClock } from "../playback";
import { resolveDefense } from "../resolve";
import { courtBackgroundSvg, computeExportRegion, dynamicLayerSvg } from "./court-svg";
import { groupPlaysBySection } from "./groups";
import type { Frame } from "../types";
import type { ExportData, ExportPlay, SetType, DefenseType } from "./types";

const SPEEDS = [0.5, 1, 2] as const;

function readData(): ExportData {
  const el = document.getElementById("playbook-data");
  if (!el?.textContent) throw new Error("Playbook data missing from the page.");
  return JSON.parse(el.textContent) as ExportData;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** One play's animation clock + the DOM it drives. Mirrors use-play-clock.ts's behavior (play/pause, speed, jumpToStep) without React. */
function mountPlayCourt(frames: Frame[], courtHost: HTMLElement, noteHost: HTMLElement, stepButtons: HTMLButtonElement[]) {
  const region = computeExportRegion(frames);
  courtHost.innerHTML = courtBackgroundSvg(region);
  const svg = courtHost.querySelector("svg.hl-court") as SVGSVGElement;
  const dynamicLayer = svg.querySelector("g.hl-dynamic") as SVGGElement;

  let clock: PlaybackClock = { frameIndex: 0, phase: "hold", t: 0 };
  let playing = false;
  let speed: number = 1;
  let lastTime: number | null = null;
  let stopAt: { frameIndex: number; phase: "hold" } | null = null;
  let rafId: number | null = null;

  function activeNoteIndex(): number {
    return clock.phase === "hold" ? clock.frameIndex : Math.min(clock.frameIndex + 1, frames.length - 1);
  }

  function paintStepChips() {
    stepButtons.forEach((btn, i) => btn.classList.toggle("hl-step-active", i === activeNoteIndex()));
  }

  function paintFrame() {
    const from = frames[clock.frameIndex];
    const to = frames[Math.min(clock.frameIndex + 1, frames.length - 1)];
    let shown: Frame;
    let ballOverride: { x: number; y: number } | undefined;
    if (clock.phase === "hold" || clock.frameIndex >= frames.length - 1) {
      shown = from;
      ballOverride = undefined;
    } else {
      const interp = interpolateFrame(from, to, clock.t);
      shown = interp.frame;
      ballOverride = interp.ballOverride;
    }
    const holderPos = shown.offense.find((o) => o.id === shown.ballHolder)?.pos ?? { x: 25, y: 25 };
    const ballPos = ballOverride ?? { x: holderPos.x + 1.7, y: holderPos.y + 1.7 };
    const resolvedDefense = resolveDefense(shown, ballOverride);
    dynamicLayer.innerHTML = dynamicLayerSvg(shown, resolvedDefense, ballPos);
    noteHost.textContent = frames[activeNoteIndex()].note;
    paintStepChips();
  }

  function tick(now: number) {
    if (!playing) return;
    if (lastTime === null) lastTime = now;
    const dt = now - lastTime;
    lastTime = now;
    const adv = advanceClock(clock, dt, speed, frames.length);
    clock = { frameIndex: adv.frameIndex, phase: adv.phase, t: adv.t };
    if (stopAt && clock.frameIndex === stopAt.frameIndex && clock.phase === stopAt.phase) {
      clock = { ...clock, t: 0 };
      playing = false;
      stopAt = null;
    } else if (adv.done) {
      playing = false;
    }
    paintFrame();
    syncPlayButton();
    if (playing) rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (playing) return;
    playing = true;
    lastTime = null;
    rafId = requestAnimationFrame(tick);
  }

  function togglePlay() {
    if (playing) {
      playing = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
    } else {
      if (clock.frameIndex === frames.length - 1 && clock.phase === "hold" && clock.t >= 1) {
        clock = { frameIndex: 0, phase: "hold", t: 0 };
      }
      start();
    }
    syncPlayButton();
  }

  function jumpToStep(i: number) {
    playing = false;
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (i <= 0) {
      clock = { frameIndex: 0, phase: "hold", t: 0 };
      stopAt = null;
      paintFrame();
      syncPlayButton();
      return;
    }
    clock = { frameIndex: i - 1, phase: "transition", t: 0 };
    stopAt = { frameIndex: i, phase: "hold" };
    start();
  }

  let playButton: HTMLButtonElement | null = null;
  function syncPlayButton() {
    if (playButton) playButton.textContent = playing ? "Pause" : "Play";
  }

  stepButtons.forEach((btn, i) => btn.addEventListener("click", () => jumpToStep(i)));
  paintFrame();

  return { togglePlay, setSpeed: (s: number) => (speed = s), bindPlayButton: (btn: HTMLButtonElement) => (playButton = btn) };
}

function categoryBadgeLabel(play: ExportPlay): string {
  return play.vs ? `${play.categoryLabel} · ${play.vs}` : play.categoryLabel;
}

function buildPlayCard(play: ExportPlay): HTMLElement {
  const card = el("section", "hl-card");
  card.id = `play-${play.id}`;
  card.dataset.setType = play.setType;
  card.dataset.defenseType = play.defenseType ?? "";

  const header = el("div", "hl-card-head");
  header.append(el("h2", "hl-card-title", play.name), el("span", "hl-card-badge", categoryBadgeLabel(play)));
  card.append(header);
  card.append(el("p", "hl-about", play.about));

  const body = el("div", "hl-card-body");
  const courtWrap = el("div", "hl-court-wrap");
  body.append(courtWrap);

  const side = el("div", "hl-side");
  const controls = el("div", "hl-controls");
  const playBtn = el("button", "hl-btn hl-btn-primary", "Play");
  controls.append(playBtn);
  const speedRow = el("div", "hl-speed-row");
  const speedBtns = SPEEDS.map((s) => {
    const b = el("button", "hl-btn hl-speed-btn", `${s}x`);
    if (s === 1) b.classList.add("hl-speed-active");
    speedRow.append(b);
    return b;
  });
  controls.append(speedRow);
  side.append(controls);

  const stepsRow = el("div", "hl-steps");
  const stepButtons: HTMLButtonElement[] = play.frames.map((_, i) => el("button", "hl-step-chip", i === 0 ? "—" : String(i)));
  stepButtons.forEach((b) => stepsRow.append(b));
  side.append(stepsRow);

  const note = el("p", "hl-note");
  side.append(note);
  body.append(side);
  card.append(body);

  if (play.keys.length) {
    const keysWrap = el("div", "hl-keys");
    keysWrap.append(el("h3", "hl-keys-title", "Coaching points"));
    const list = el("ul", "hl-keys-list");
    play.keys.forEach((k) => list.append(el("li", undefined, k)));
    keysWrap.append(list);
    card.append(keysWrap);
  }

  const player = mountPlayCourt(play.frames, courtWrap, note, stepButtons);
  player.bindPlayButton(playBtn);
  playBtn.addEventListener("click", () => player.togglePlay());
  speedBtns.forEach((b, i) => {
    b.addEventListener("click", () => {
      speedBtns.forEach((x) => x.classList.remove("hl-speed-active"));
      b.classList.add("hl-speed-active");
      player.setSpeed(SPEEDS[i]);
    });
  });

  return card;
}

function buildHeader(data: ExportData): HTMLElement {
  const header = el("header", "hl-header");
  const logo = document.createElement("img");
  logo.className = "hl-logo";
  logo.src = data.team.logoDataUri;
  logo.alt = `${data.team.name} logo`;
  const titleWrap = el("div", "hl-title-wrap");
  titleWrap.append(el("div", "hl-eyebrow", "TEAM PLAYBOOK"), el("h1", "hl-team-name", data.team.name), el("p", "hl-team-sub", data.team.subtitle));
  header.append(logo, titleWrap);
  const generated = el("div", "hl-generated", `Generated ${new Date(data.generatedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`);
  header.append(generated);
  return header;
}

function buildFilterBar(onChange: (setType: SetType | "all", defenseType: DefenseType | "all") => void): HTMLElement {
  const bar = el("div", "hl-filterbar");

  function chipGroup(label: string, options: { value: string; text: string }[], initial: string): { wrap: HTMLElement; get: () => string } {
    const wrap = el("div", "hl-chip-group");
    wrap.append(el("span", "hl-chip-label", label));
    let current = initial;
    const buttons = options.map((opt) => {
      const b = el("button", "hl-chip", opt.text);
      if (opt.value === initial) b.classList.add("hl-chip-active");
      b.addEventListener("click", () => {
        current = opt.value;
        buttons.forEach((x) => x.classList.remove("hl-chip-active"));
        b.classList.add("hl-chip-active");
        apply();
      });
      wrap.append(b);
      return b;
    });
    return { wrap, get: () => current };
  }

  const setGroup = chipGroup(
    "Set type",
    [
      { value: "all", text: "All" },
      { value: "blobSlob", text: "BLOB / SLOB" },
      { value: "other", text: "Regular" },
    ],
    "all"
  );
  const defGroup = chipGroup(
    "Defense",
    [
      { value: "all", text: "All" },
      { value: "man", text: "Man" },
      { value: "zone", text: "Zone" },
    ],
    "all"
  );
  bar.append(setGroup.wrap, defGroup.wrap);

  function apply() {
    onChange(setGroup.get() as SetType | "all", defGroup.get() as DefenseType | "all");
  }

  return bar;
}

/** The TOC and the card list are both hard-grouped into the same fixed Offense/Situations/Defense sections — a coach's own play order only controls order WITHIN a section, never which section a play lands in. Returns the links/cards keyed by play id (not by array index) so the filter bar below can toggle visibility without caring where a header sits in the DOM. */
function buildToc(groups: { label: string; plays: ExportPlay[] }[]): { nav: HTMLElement; linksByPlayId: Map<string, HTMLAnchorElement> } {
  const toc = el("nav", "hl-toc");
  toc.append(el("span", "hl-toc-label", "Jump to a play"));
  const linksByPlayId = new Map<string, HTMLAnchorElement>();
  groups.forEach((g) => {
    const section = el("div", "hl-toc-section");
    section.append(el("span", "hl-toc-section-label", g.label));
    const list = el("div", "hl-toc-list");
    g.plays.forEach((p) => {
      const a = document.createElement("a");
      a.href = `#play-${p.id}`;
      a.className = "hl-toc-link";
      a.textContent = p.name;
      list.append(a);
      linksByPlayId.set(p.id, a);
    });
    section.append(list);
    toc.append(section);
  });
  return { nav: toc, linksByPlayId };
}

/** Only shown when this tab/window was actually opened by another page's script (the in-app "Open" flow always does this) — window.close() is permitted on a script-opened window but silently does nothing otherwise, so there's no point showing a dead button to someone who opened this file directly (a shared/saved copy, no opener at all). */
function buildCloseBar(): HTMLElement | null {
  if (!window.opener) return null;
  const bar = el("div", "hl-closebar");
  const btn = el("button", "hl-close-btn", "← Back");
  btn.type = "button";
  btn.addEventListener("click", () => window.close());
  bar.append(btn);
  return bar;
}

function render(data: ExportData) {
  const root = document.getElementById("playbook-root");
  if (!root) return;
  const closeBar = buildCloseBar();
  if (closeBar) root.append(closeBar);
  root.append(buildHeader(data));

  const groups = groupPlaysBySection(data.plays);
  const { nav: tocNav, linksByPlayId } = buildToc(groups);
  root.append(tocNav);

  const cardsWrap = el("div", "hl-cards");
  const cardsByPlayId = new Map<string, HTMLElement>();
  const sectionEls: HTMLElement[] = [];
  groups.forEach((g) => {
    const section = el("div", "hl-section");
    section.append(el("h2", "hl-section-title", g.label));
    g.plays.forEach((p) => {
      const card = buildPlayCard(p);
      section.append(card);
      cardsByPlayId.set(p.id, card);
    });
    cardsWrap.append(section);
    sectionEls.push(section);
  });

  const tocSectionEls = Array.from(tocNav.querySelectorAll<HTMLElement>(".hl-toc-section"));

  const filterBar = buildFilterBar((setType, defenseType) => {
    data.plays.forEach((p) => {
      const setOk = setType === "all" || p.setType === setType;
      const defOk = defenseType === "all" || p.defenseType === null || p.defenseType === defenseType;
      const visible = setOk && defOk;
      const card = cardsByPlayId.get(p.id);
      if (card) card.hidden = !visible;
      const link = linksByPlayId.get(p.id);
      if (link) link.hidden = !visible;
    });
    // A section with every one of its plays filtered out shouldn't show a lone, empty header.
    sectionEls.forEach((section) => {
      const anyVisible = Array.from(section.querySelectorAll<HTMLElement>(".hl-card")).some((c) => !c.hidden);
      section.hidden = !anyVisible;
    });
    tocSectionEls.forEach((section) => {
      const anyVisible = Array.from(section.querySelectorAll<HTMLElement>(".hl-toc-link")).some((a) => !a.hidden);
      section.hidden = !anyVisible;
    });
  });
  root.append(filterBar, cardsWrap);
}

render(readData());
