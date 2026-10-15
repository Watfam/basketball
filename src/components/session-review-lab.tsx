"use client";

import { useState, useSyncExternalStore } from "react";
import { SESSION_REVIEW_KEY } from "@/lib/review/flag";
import { DEBUG_KEY, loadPersisted, loadPersistedFor, type DiagSummary } from "@/lib/review/diagnostics";
import { judge, judgeBattery, judgeLoop, runPhoneTest, type BatterySet, type Check, type PhoneReport } from "@/lib/review/phonetest";
import { HISTORY_RETAIN_KEY } from "@/lib/review/history-settings";
import { idbHistory } from "@/lib/review/history-store";
import { runSelfTest, type SelfTestReport } from "@/lib/review/selftest";
import { TrackingHistoryControls } from "@/components/tracking-history-controls";
import { Button } from "@/components/ui/button";

const read = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const subscribe = (cb: () => void) => { window.addEventListener("storage", cb); window.addEventListener("hl:lab-flag", cb); return () => { window.removeEventListener("storage", cb); window.removeEventListener("hl:lab-flag", cb); }; };
const flag = (k: string) => () => read(k) === "1";
function setFlag(k: string, v: boolean) { try { if (v) window.localStorage.setItem(k, "1"); else window.localStorage.removeItem(k); } catch { /* storage unavailable */ } window.dispatchEvent(new Event("hl:lab-flag")); }

/** The on-phone switchboard and test for session review and tracking history (all local; nothing is uploaded). */
export function SessionReviewLab() {
  const review = useSyncExternalStore(subscribe, flag(SESSION_REVIEW_KEY), () => false);
  const debug = useSyncExternalStore(subscribe, flag(DEBUG_KEY), () => false);
  const retain = useSyncExternalStore(subscribe, flag(HISTORY_RETAIN_KEY), () => false);
  const [progress, setProgress] = useState<string | null>(null);
  const [report, setReport] = useState<SelfTestReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState<{ at: string; summary: DiagSummary[] } | null>(() => (typeof window === "undefined" ? null : loadPersisted()));

  const run = async () => {
    setReport(null);
    try { setReport(await runSelfTest(idbHistory, [40, 100, 250], setProgress)); setProgress(null); } catch (e) { setProgress(`Self-test stopped: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const text = report ? JSON.stringify({ ...report, live_loop: live }, null, 1) : "";
  const [phone, setPhone] = useState<PhoneReport | null>(null);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const [bat, setBat] = useState<{ off: Partial<BatterySet>; on: Partial<BatterySet> }>({ off: {}, on: {} });
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [loopSets, setLoopSets] = useState(() => (typeof window === "undefined" ? { off: null, on: null } : { off: loadPersistedFor("off"), on: loadPersistedFor("on") }));
  const runPhone = async (askPersist: boolean) => {
    setPhone(null);
    try { setPhone(await runPhoneTest(idbHistory, setPhoneMsg, { askPersist })); setPhoneMsg(null); } catch (e) { setPhoneMsg(`Phone test stopped: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const loop = judgeLoop(loopSets.off?.summary, loopSets.on?.summary);
  const full = (b: Partial<BatterySet>): BatterySet | null => (b.start !== undefined && b.end !== undefined && b.minutes !== undefined ? (b as BatterySet) : null);
  const batteryCheck = judgeBattery(full(bat.off), full(bat.on));
  const checks: Check[] = [...(phone ? judge(phone) : []), ...loop.checks, batteryCheck];
  const phoneText = phone ? JSON.stringify({ phone, checks, loop: { off: loop.off, on: loop.on }, battery_by_hand: bat, note: "Browser measurements only. Desktop numbers are never substituted." }, null, 1) : "";
  const badge = (v: Check["verdict"]) => (v === "pass" ? "text-green-700" : v === "fail" ? "text-red-700" : "text-foreground-mute");
  const num = (k: "off" | "on", f: keyof BatterySet) => (
    <input inputMode="numeric" aria-label={`Battery ${f} with review ${k}`} className="w-14 rounded-md border border-line bg-surface px-1 py-0.5 text-base" value={bat[k][f] ?? ""} onChange={(e) => setBat({ ...bat, [k]: { ...bat[k], [f]: e.target.value === "" ? undefined : Number(e.target.value) } })} />
  );
  const row = (label: string, on: boolean, key: string, hint: string) => (
    <label className="flex items-start gap-2 py-1.5 text-[13px]"><input type="checkbox" className="mt-1" checked={on} onChange={(e) => setFlag(key, e.target.checked)} /><span><b>{label}</b><span className="block text-[11px] text-foreground-mute">{hint}</span></span></label>
  );
  return (
    <div className="space-y-4 text-foreground">
      <section className="rounded-2xl border border-line bg-surface p-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Switches (this phone only, off by default)</p>
        {row("Session review", review, SESSION_REVIEW_KEY, "Adds a Session review link to the end-of-set screen, and makes the camera note the ball boxes it already finds (no extra model run).")}
        {row("Timing diagnostics", debug, DEBUG_KEY, "Times the recorder in the live loop and the history save and load. Read below after a set.")}
        {row("Keep tracking history", retain, HISTORY_RETAIN_KEY, "After you save a set, keep each shot's ball path on this phone. Needs Session review on.")}
        <p className="mt-1 text-[11px] text-foreground-mute">Counting, the make/miss call and the saved session are the same with every switch on or off.</p>
      </section>

      <TrackingHistoryControls playerId="" />

      <section className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Storage test on this phone</p>
        <p className="mt-1">Saves, reads back, analyses and deletes synthetic sessions of 40, 100 and 250 shots in a throwaway area (never your real history), and times each step.</p>
        <Button size="sm" className="mt-2" onClick={() => void run()} disabled={!!progress && !progress.startsWith("Self-test stopped")}>Run storage test</Button>
        {progress && <p aria-live="polite" className="mt-2 text-foreground">{progress}</p>}
        {report && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[11px]">
              <thead><tr className="text-foreground-mute"><th>Shots</th><th>Save ms</th><th>KB kept</th><th>B/shot</th><th>Load ms</th><th>Analyse ms</th><th>Delete ms</th><th>Heap MB</th></tr></thead>
              <tbody>{report.rows.map((r) => <tr key={r.shots} className="border-t border-line"><td>{r.shots}</td><td>{r.save_ms}</td><td>{(r.bytes_ours / 1024).toFixed(0)}</td><td>{r.bytes_per_shot}</td><td>{r.load_ms}</td><td>{r.analyse_ms}</td><td>{r.delete_ms}</td><td>{r.heap_MB ?? "n/a"}</td></tr>)}</tbody>
            </table>
            {report.recorder && <p className="mt-2">Recorder cost per processed frame: median {report.recorder.median_us} µs, 99th percentile {report.recorder.p99_us} µs ({report.recorder.frames} frames).</p>}
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? "Copied" : "Copy report"}</Button>
            <textarea readOnly rows={5} value={text} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded-lg border border-line bg-surface p-2 text-base text-foreground" />
          </div>
        )}
      </section>

      <section aria-label="Phone readiness test" className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Phone readiness test</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Open this page on the iPhone, on the same Wi-Fi, with the app added to the Home Screen if you use it that way.</li>
          <li>Tap <b>Run the phone test</b> and leave the screen on for about a minute.</li>
          <li>Turn on <b>Timing diagnostics</b>. Count one normal set with <b>Session review off</b>, then one of the same drill with it <b>on</b> (100+ shots of frames each, about a minute of counting is enough).</li>
          <li>Come back here and tap <b>Refresh</b>. For battery, note the percentage and minutes of two 15-minute sets and type them in.</li>
          <li>Tap <b>Copy results</b> and paste them to me. Anything the phone cannot report shows as &ldquo;not measured&rdquo;, never as a pass.</li>
        </ol>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void runPhone(true)} disabled={!!phoneMsg && !phoneMsg.startsWith("Phone test stopped")}>Run the phone test</Button>
          <Button variant="secondary" size="sm" onClick={() => setLoopSets({ off: loadPersistedFor("off"), on: loadPersistedFor("on") })}>Refresh</Button>
        </div>
        {phoneMsg && <p aria-live="polite" className="mt-2 text-foreground">{phoneMsg}</p>}
        <p className="mt-2 font-semibold text-foreground">Live sets: review off {loop.off.frames} frames, on {loop.on.frames} frames.</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">Battery by hand, review off: start % {num("off", "start")} end % {num("off", "end")} minutes {num("off", "minutes")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1">Review on: start % {num("on", "start")} end % {num("on", "end")} minutes {num("on", "minutes")}</div>
        {(phone || loop.off.frames > 0 || loop.on.frames > 0) && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[11px]">
              <thead><tr className="text-foreground-mute"><th>Check</th><th>Result</th><th>This phone</th><th>Limit</th></tr></thead>
              <tbody>{checks.map((c) => <tr key={c.id} className="border-t border-line align-top"><td className="pr-2">{c.label}</td><td className={`pr-2 font-bold ${badge(c.verdict)}`}>{c.verdict === "not_measured" ? "not measured" : c.verdict}</td><td className="pr-2">{c.value}</td><td>{c.limit}</td></tr>)}</tbody>
            </table>
            {phone && <p className="mt-2">{phone.capabilities.standalone ? "Running from the Home Screen." : "Running in a browser tab (Safari can clear a site's storage if it is not opened for about a week; adding the app to the Home Screen avoids that)."} Storage marker age: {phone.persistence.marker ? `${phone.persistence.marker.ageHours} hours` : "unknown"}. Whole test: {(phone.totalMs / 1000).toFixed(1)} s.</p>}
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => { void navigator.clipboard?.writeText(phoneText).then(() => { setCopiedPhone(true); setTimeout(() => setCopiedPhone(false), 1500); }); }}>{copiedPhone ? "Copied" : "Copy results"}</Button>
            <textarea readOnly rows={5} value={phoneText} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded-lg border border-line bg-surface p-2 text-base text-foreground" />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Live loop timings (from the last set with diagnostics on)</p>
        {live && live.summary.length ? <ul className="mt-1">{live.summary.map((s) => <li key={s.name}>{s.name}: n {s.n}, median {s.medianMs.toFixed(3)} ms, p95 {s.p95Ms.toFixed(3)} ms, max {s.maxMs.toFixed(2)} ms</li>)}<li className="text-foreground-mute">recorded {live.at}</li></ul> : <p className="mt-1">None yet. Turn on Timing diagnostics, shoot a set with the camera, save it, then reopen this page.</p>}
        <Button variant="ghost" size="sm" onClick={() => setLive(loadPersisted())}>Refresh</Button>
      </section>
    </div>
  );
}
