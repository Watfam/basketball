"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { SESSION_REVIEW_KEY } from "@/lib/review/flag";
import { DEBUG_KEY, loadPersisted, loadPersistedFor, type DiagSummary } from "@/lib/review/diagnostics";
import { LIVE_ONLY, judge, judgeBattery, judgeLoop, runPhoneTest, type BatterySet, type Check, type PhoneReport } from "@/lib/review/phonetest";
import { judgeReplay, runReplayTest, type ReplayReport } from "@/lib/review/replaytest";
import { HISTORY_RETAIN_KEY } from "@/lib/review/history-settings";
import { RIM_WARNING_KEY } from "@/lib/review/rim-warning";
import { idbHistory } from "@/lib/review/history-store";
import { getReplay, listReplayIds } from "@/lib/vision/replay-store";
import { TrackingHistoryControls } from "@/components/tracking-history-controls";
import { ReplaySamplePanel } from "@/components/replay-sample-panel";
import { Button } from "@/components/ui/button";

const read = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const subscribe = (cb: () => void) => { window.addEventListener("storage", cb); window.addEventListener("hl:lab-flag", cb); return () => { window.removeEventListener("storage", cb); window.removeEventListener("hl:lab-flag", cb); }; };
const flag = (k: string) => () => read(k) === "1";
function setFlag(k: string, v: boolean) { try { if (v) window.localStorage.setItem(k, "1"); else window.localStorage.removeItem(k); } catch { /* storage unavailable */ } window.dispatchEvent(new Event("hl:lab-flag")); }

const DONE_KEY = "hl:live-checks";
const readDone = (): Record<string, string> => { try { const v = JSON.parse(read(DONE_KEY) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };

const tone = (v: Check["verdict"]) => (v === "pass" ? "text-green-700" : v === "fail" ? "text-red-700" : "text-foreground-mute");
const word = (v: Check["verdict"]) => (v === "not_measured" ? "not measured" : v === "pass_synthetic" ? "pass (made-up data only)" : v);

function ResultTable({ checks }: { checks: Check[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-[11px]">
        <thead><tr className="text-foreground-mute"><th>Check</th><th>Result</th><th>On this phone</th><th>Limit</th></tr></thead>
        <tbody>{checks.map((c) => <tr key={c.id} className="border-t border-line align-top"><td className="pr-2">{c.label}</td><td className={`pr-2 font-bold ${tone(c.verdict)}`}>{word(c.verdict)}</td><td className="pr-2">{c.value}</td><td>{c.limit}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function copy(text: string, set: (v: boolean) => void) { void navigator.clipboard?.writeText(text).then(() => { set(true); setTimeout(() => set(false), 1500); }); }

/** The on-phone switchboard and tests for shot review and shot-path history (all local; nothing is uploaded). */
export function SessionReviewLab() {
  const review = useSyncExternalStore(subscribe, flag(SESSION_REVIEW_KEY), () => false);
  const debug = useSyncExternalStore(subscribe, flag(DEBUG_KEY), () => false);
  const retain = useSyncExternalStore(subscribe, flag(HISTORY_RETAIN_KEY), () => false);
  const rimWarn = useSyncExternalStore(subscribe, flag(RIM_WARNING_KEY), () => false);
  const both = review && retain;
  const [live, setLive] = useState<{ at: string; summary: DiagSummary[] } | null>(() => (typeof window === "undefined" ? null : loadPersisted()));
  const [loopSets, setLoopSets] = useState(() => (typeof window === "undefined" ? { off: null, on: null } : { off: loadPersistedFor("off"), on: loadPersistedFor("on") }));
  const [done, setDone] = useState<Record<string, string>>(() => (typeof window === "undefined" ? {} : readDone()));
  const [bat, setBat] = useState<{ off: Partial<BatterySet>; on: Partial<BatterySet> }>({ off: {}, on: {} });
  const [replay, setReplay] = useState<ReplayReport | null>(null);
  const [replayMsg, setReplayMsg] = useState<string | null>(null);
  const [phone, setPhone] = useState<PhoneReport | null>(null);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  const runReplay = async () => {
    setReplay(null);
    try {
      const cv = (canvas.current ??= document.createElement("canvas")); cv.width = 360; cv.height = 300;
      setReplay(await runReplayTest(idbHistory, setReplayMsg, {
        canvas: () => cv.getContext("2d"),
        clips: { ids: listReplayIds, frames: async (id) => (await getReplay(id))?.frames ?? null, decode: async (b) => { const bm = await createImageBitmap(b); cv.getContext("2d")?.drawImage(bm, 0, 0, 360, 300); bm.close(); } },
      }));
      setReplayMsg(null);
    } catch (e) { setReplayMsg(`The replay test stopped: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const runPhone = async () => {
    setPhone(null);
    try { setPhone(await runPhoneTest(idbHistory, setPhoneMsg, { askPersist: true })); setPhoneMsg(null); } catch (e) { setPhoneMsg(`The speed check stopped: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const runAll = async () => { await runReplay(); await runPhone(); };
  const busyAll = (!!replayMsg && !replayMsg.startsWith("The replay test stopped")) || (!!phoneMsg && !phoneMsg.startsWith("The speed check stopped"));
  const mark = (id: string, v: boolean) => setDone((d) => { const n = { ...d }; if (v) n[id] = new Date().toISOString().slice(0, 10); else delete n[id]; try { window.localStorage.setItem(DONE_KEY, JSON.stringify(n)); } catch { /* storage unavailable */ } return n; });

  const loop = judgeLoop(loopSets.off?.summary, loopSets.on?.summary);
  const full = (b: Partial<BatterySet>): BatterySet | null => (b.start !== undefined && b.end !== undefined && b.minutes !== undefined ? (b as BatterySet) : null);
  const batteryCheck = judgeBattery(full(bat.off), full(bat.on));
  const replayChecks = replay ? judgeReplay(replay) : [];
  const replayText = replay ? JSON.stringify({ kind: "replayed data, no camera, not live-device validation", replay, checks: replayChecks }, null, 1) : "";
  const phoneChecks = phone ? judge(phone) : [];
  const build = process.env.NEXT_PUBLIC_BUILD ?? "local";
  const fullText = JSON.stringify({ kind: "Hardwood Lab camera-free iPhone test: replayed data and made-up data only, NOT live-camera validation", build, at: new Date().toISOString(), userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent, homeScreenApp: typeof navigator !== "undefined" && ((navigator as unknown as { standalone?: boolean }).standalone === true || (typeof matchMedia !== "undefined" && matchMedia("(display-mode: standalone)").matches)), switches: { shotReview: review, keepShotPaths: retain, timingDiagnostics: debug, rimWarning: rimWarn }, replay: replay ? { report: replay, checks: replayChecks } : "not run", speedCheckMadeUpData: phone ? { report: phone, checks: phoneChecks } : "not run", liveCameraChecks: "not done in this report" }, null, 1);
  const liveText = JSON.stringify({ kind: "live-camera checks", loop: { off: loop.off, on: loop.on }, checks: [...loop.checks, batteryCheck], you_marked_done: done, note: "Nothing is validated until a real set on a real phone meets the registered limits. Desktop and made-up numbers are never substituted." }, null, 1);
  const num = (k: "off" | "on", f: keyof BatterySet) => (
    <input inputMode="numeric" aria-label={`Battery ${f} with review ${k}`} className="w-14 rounded-md border border-line bg-surface px-1 py-0.5 text-base" value={bat[k][f] ?? ""} onChange={(e) => setBat({ ...bat, [k]: { ...bat[k], [f]: e.target.value === "" ? undefined : Number(e.target.value) } })} />
  );
  const row = (label: string, on: boolean, key: string, hint: string) => (
    <label className="flex items-start gap-2 py-1.5 text-[13px]"><input type="checkbox" className="mt-1" checked={on} onChange={(e) => setFlag(key, e.target.checked)} /><span><b>{label}</b><span className="block text-[11px] text-foreground-mute">{hint}</span></span></label>
  );
  const sec = "rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim";
  const h = "text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute";

  return (
    <div className="space-y-4 text-foreground">
      <section aria-label="Version" className={sec}>
        <p className={h}>Which version is this?</p>
        <p className="mt-1 text-[13px] text-foreground">Version <b>{build}</b></p>
        <p className="mt-1">Check this matches the version Claude gave you. If it does not, close the app completely (swipe it away) and open it again, or open it in Safari.</p>
      </section>

      <section className={sec}>
        <p className={h}>Shot review and history · beta · off by default</p>
        <button type="button" role="switch" aria-checked={both} onClick={() => { setFlag(SESSION_REVIEW_KEY, !both); setFlag(HISTORY_RETAIN_KEY, !both); }} className="mt-2 flex w-full items-start gap-3 text-left">
          <span aria-hidden className={`mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${both ? "bg-accent" : "bg-line-strong"}`}><span className={`h-5 w-5 rounded-full bg-surface shadow transition-transform ${both ? "translate-x-5" : ""}`} /></span>
          <span><b className="block text-[13px] text-foreground">Shot review and shot paths: {both ? "on" : "off"}</b>Adds &ldquo;Review your shots&rdquo; after a camera set and &ldquo;Shot history&rdquo; on the shooting screen, and keeps each saved shot&apos;s path on this phone. Counting and saved sessions are exactly the same either way.</span>
        </button>
        <p className="mt-2 rounded-lg bg-raised px-2 py-1.5"><b className="text-foreground">Checked on a real iPhone: nothing yet.</b> Everything below was built and tested on a computer. The tests here can check the screens and storage on your phone with saved data. They cannot check the live camera.</p>
        <details className="mt-2">
          <summary className="cursor-pointer font-bold text-foreground-mute">Separate switches</summary>
          {row("Shot review", review, SESSION_REVIEW_KEY, "Review link after a camera set; the camera notes the ball boxes it already finds (no extra model run).")}
          {row("Keep shot paths", retain, HISTORY_RETAIN_KEY, "After you save a set, keep each shot's path on this phone. Needs shot review on.")}
          {row("Rim warning (experimental)", rimWarn, RIM_WARNING_KEY, "After a camera set, shows a note if it looks like the camera read part of the rim as a ball (the count could be low), with a way to review the marked shots. Display only: changes no count or call. Needs shot review on. Off by default.")}
          {row("Timing diagnostics", debug, DEBUG_KEY, "Times the live loop and the saves, for the live-camera checks below.")}
        </details>
      </section>

      <TrackingHistoryControls key={String(retain)} playerId="" dataControls={false} />

      <ReplaySamplePanel />

      <section aria-label="Test with saved data" className={sec}>
        <p className={h}>Step 2 · run the camera-free tests</p>
        <p className="mt-1">One button runs the replay test on whatever paths are on this phone (the sample from step 1) and then the quick speed check with made-up data. Keep the screen on; it takes under a minute.</p>
        <Button size="sm" className="mt-2" onClick={() => void runAll()} disabled={busyAll}>Run all camera-free tests</Button>
        {(replay || phone) && (
          <div className="mt-2 rounded-xl border border-line p-2">
            <p className={h}>Step 3 · send me the results</p>
            <Button size="sm" className="mt-1" onClick={() => copy(fullText, (v) => setCopied(v ? "full" : null))}>{copied === "full" ? "Copied" : "Copy full report"}</Button>
            <p className="mt-1 text-foreground-mute">Then paste it into a message to Claude. If Copy does nothing, press and hold in the box below, choose Select All, then Copy.</p>
            <textarea readOnly rows={4} value={fullText} onFocus={(e) => e.currentTarget.select()} aria-label="Full report" className="mt-1 w-full rounded-lg border border-line bg-surface p-2 text-base text-foreground" />
          </div>
        )}
        <p className="mt-3 font-bold text-foreground">The replay test on its own</p>
        <p className="mt-1">Replays shot paths already on this phone through the review and history screens and storage code: reading, drawing every path, spotting patterns, exporting then importing into a copy, delete and undo in a copy, and any saved video clips. It never changes your real saved paths.</p>
        <p className="mt-1"><b className="text-foreground">To test with real paths without filming:</b> the file <code className="break-all">hardwood-lab-replay-sample.json</code> is built on the computer from existing recordings (coordinates only; see the report). Send it to the phone, then use <b>Import a file…</b> above. With fewer than 20 saved paths, this test uses made-up ones and says so on every row.</p>
        <Button size="sm" className="mt-2" onClick={() => void runReplay()} disabled={!!replayMsg && !replayMsg.startsWith("The replay test stopped")}>Run the replay test</Button>
        {replayMsg && <p aria-live="polite" className="mt-2 text-foreground">{replayMsg}</p>}
        {replay && (
          <div>
            <p className="mt-2 font-semibold text-foreground">{replay.source === "real" ? `Real saved data: ${replay.data.sessions} sets, ${replay.data.shots} shots, ${replay.data.withPath} with a path.` : "Made-up data (fewer than 20 real saved paths on this phone). These results say nothing about your real data."}</p>
            <ResultTable checks={replayChecks} />
            <p className="mt-2 text-foreground-mute">These are results on replayed data. They show the screens and storage work on this phone. They say nothing about the live camera.</p>
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => copy(replayText, (v) => setCopied(v ? "replay" : null))}>{copied === "replay" ? "Copied" : "Copy results"}</Button>
          </div>
        )}
      </section>

      <section aria-label="Needs the live camera" className={sec}>
        <p className={h}>Needs the live camera (not covered by the replay test)</p>
        <p className="mt-1">These can only be answered by shooting real sets on this phone. None is marked validated by the app. Ticking &ldquo;I checked this&rdquo; only records that you did; it does not make it validated.</p>
        <ul className="mt-2 space-y-2">
          {LIVE_ONLY.map((l) => (
            <li key={l.id} className="rounded-xl border border-line p-2">
              <p className="font-bold text-foreground">{l.title}</p>
              <p className="text-foreground-mute">Why: {l.why}</p>
              <p>How: {l.how}</p>
              {l.result === "loop" && <p className="mt-1 font-semibold text-foreground">So far: {loop.off.frames} frames counted with review off, {loop.on.frames} with it on.{loop.checks[0].verdict === "not_measured" ? " Not measured yet." : ` ${loop.checks.map((c) => `${c.label.split(":")[0]} ${word(c.verdict)} (${c.value})`).join("; ")}`}</p>}
              {l.result === "battery" && (
                <div className="mt-1">
                  <div className="flex flex-wrap items-center gap-1">Review off: start % {num("off", "start")} end % {num("off", "end")} minutes {num("off", "minutes")}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">Review on: start % {num("on", "start")} end % {num("on", "end")} minutes {num("on", "minutes")}</div>
                  <p className="mt-1 font-semibold text-foreground">{word(batteryCheck.verdict)}: {batteryCheck.value}</p>
                </div>
              )}
              <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={!!done[l.id]} onChange={(e) => mark(l.id, e.target.checked)} /> I checked this{done[l.id] ? ` (${done[l.id]})` : ""} <span className="text-foreground-mute">· not validated by the app</span></label>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setLoopSets({ off: loadPersistedFor("off"), on: loadPersistedFor("on") }); setLive(loadPersisted()); }}>Refresh live timings</Button>
          <Button variant="secondary" size="sm" onClick={() => copy(liveText, (v) => setCopied(v ? "live" : null))}>{copied === "live" ? "Copied" : "Copy live-camera results"}</Button>
        </div>
        {live && live.summary.length > 0 && <ul className="mt-2 text-foreground-mute">{live.summary.map((s) => <li key={s.name}>{s.name}: {s.n} samples, median {s.medianMs.toFixed(3)} ms, 95th percentile {s.p95Ms.toFixed(3)} ms</li>)}</ul>}
      </section>

      <section aria-label="Speed check" className={sec}>
        <p className={h}>Quick speed check (made-up data)</p>
        <p className="mt-1">Times saving, reading and drawing 40, 100 and 250 made-up shots in a throwaway area, and asks Safari to keep this site&apos;s storage. Useful for the phone&apos;s speed; it is not about your real data or the live camera.</p>
        <Button size="sm" className="mt-2" onClick={() => void runPhone()} disabled={!!phoneMsg && !phoneMsg.startsWith("The speed check stopped")}>Run the speed check</Button>
        {phoneMsg && <p aria-live="polite" className="mt-2 text-foreground">{phoneMsg}</p>}
        {phone && (
          <div>
            <ResultTable checks={phoneChecks} />
            <p className="mt-2">{phone.capabilities.standalone ? "Running from the Home Screen." : "Running in a browser tab (Safari can clear a site's storage if it is not opened for about a week; adding the app to the Home Screen avoids that)."} Whole check: {(phone.totalMs / 1000).toFixed(1)} s.</p>
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => copy(JSON.stringify({ phone, checks: phoneChecks }, null, 1), (v) => setCopied(v ? "phone" : null))}>{copied === "phone" ? "Copied" : "Copy results"}</Button>
          </div>
        )}
      </section>
    </div>
  );
}
