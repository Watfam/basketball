"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteAllHistory, loadHistory, removeDamaged, usage } from "@/lib/review/history-core";
import { idbHistory } from "@/lib/review/history-store";
import { HISTORY_RETAIN_KEY, historyRetentionEnabled } from "@/lib/review/history-settings";
import { LAST_RESULT_KEY } from "@/lib/review/retain-session";
import { buildExport, planImport, runImport, type ImportPlan } from "@/lib/review/history-transfer";
import { markHistoryUsed } from "@/lib/review/history-ops";
import { Button } from "@/components/ui/button";

/**
 * The player's control over saved tracking history (EXPERIMENTAL, behind the hl:session-review flag): the opt-in, what is kept and what is not,
 * how much space it uses, and deletion. Off by default; local to this phone; never uploaded; never any video.
 */
const kb = (b: number) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

type Stats = { sessions: number; shots: number; bytes: number; damaged: number; newer: number; writable: boolean; browser: { usage: number | null; quota: number | null } };

export function TrackingHistoryControls({ playerId, onChanged }: { playerId: string; onChanged?: () => void }) {
  const [on, setOn] = useState(() => historyRetentionEnabled());
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [labels, setLabels] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [replace, setReplace] = useState(false);
  const [file, setFile] = useState<{ text: string; name: string } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [last, setLast] = useState<{ at: number; status: string; shots: number; tracked: number; bytes: number; ms: number; message: string | null } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [u, h] = await Promise.all([usage(idbHistory), loadHistory(idbHistory)]);
      let browser: Stats["browser"] = { usage: null, quota: null };
      try { const e = await navigator.storage?.estimate?.(); if (e) browser = { usage: e.usage ?? null, quota: e.quota ?? null }; } catch { /* not available */ }
      setStats({ ...u, writable: h.writable, browser });
    } catch {
      setStats(null);
      setNote("Saved tracking history could not be read on this phone.");
    }
    try { setLast(JSON.parse(window.localStorage.getItem(LAST_RESULT_KEY) ?? "null")); } catch { setLast(null); }
  }, []);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => { if (live) void refresh(); });
    return () => { live = false; };
  }, [refresh]);

  const toggle = (v: boolean) => {
    try { if (v) window.localStorage.setItem(HISTORY_RETAIN_KEY, "1"); else window.localStorage.removeItem(HISTORY_RETAIN_KEY); } catch { /* storage unavailable */ }
    setOn(historyRetentionEnabled());
    setNote(v ? "Turned on. Sets you save from now on keep their tracking history on this phone." : "Turned off. New sets keep nothing. What is already kept stays until you delete it.");
  };
  const wipe = async () => {
    if (!window.confirm("Delete ALL saved tracking history on this phone? Your saved sessions and shot counts are not affected. This cannot be undone.")) return;
    setBusy(true);
    try { await deleteAllHistory(idbHistory); setNote("All tracking history deleted from this phone."); } catch { setNote("Could not delete. Try again."); }
    setBusy(false); await refresh(); onChanged?.();
  };
  const fix = async () => {
    setBusy(true);
    try { const n = await removeDamaged(idbHistory); setNote(`Removed ${n} unreadable record${n === 1 ? "" : "s"}.`); } catch { setNote("Could not clean up."); }
    setBusy(false); await refresh(); onChanged?.();
  };

  const exportNow = async () => {
    setBusy(true); setNote(null);
    try {
      const ex = await buildExport(idbHistory, { playerId, includeLabels: labels });
      if (ex.sessions === 0) { setNote("There is nothing to export yet for this player."); setBusy(false); return; }
      const url = URL.createObjectURL(new Blob([ex.text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = `hardwood-lab-tracking-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNote(`Exported ${ex.sessions} session${ex.sessions === 1 ? "" : "s"}, ${ex.shots} shots (${kb(ex.bytes)}) to a file you now hold. It was not uploaded anywhere.`);
    } catch { setNote("Could not export. Try again."); }
    setBusy(false);
  };
  const choose = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setNote(null); setPlan(null);
    try {
      if (f.size > 30_000_000) { setNote("That file is too large to be a tracking-history export."); setBusy(false); return; }
      const text = await f.text();
      setFile({ text, name: f.name });
      setPlan(await planImport(text, idbHistory, playerId, { onDuplicate: replace ? "replace" : "skip" }));
    } catch { setNote("That file could not be read."); }
    setBusy(false);
    if (picker.current) picker.current.value = "";
  };
  const replan = async (r: boolean) => {
    setReplace(r);
    if (file) setPlan(await planImport(file.text, idbHistory, playerId, { onDuplicate: r ? "replace" : "skip" }));
  };
  const doImport = async () => {
    if (!plan || !plan.ok) return;
    setBusy(true);
    try {
      const res = await runImport(plan, idbHistory);
      if (res.added + res.replaced > 0) markHistoryUsed();
      setNote(`Imported ${res.added} new session${res.added === 1 ? "" : "s"}${res.replaced ? `, replaced ${res.replaced}` : ""} (${res.shots} shots)${res.failed ? `; ${res.failed} could not be written` : ""}. Nothing else on this phone changed.`);
    } catch { setNote("Could not import. Nothing was changed."); }
    setPlan(null); setFile(null); setBusy(false); await refresh(); onChanged?.();
  };
  const importable = plan && plan.ok ? plan.summary.new + plan.summary.replace : 0;

  return (
    <section aria-label="Tracking history settings" className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Tracking history · beta · {playerId ? "this player" : ""}</p>
      <label className="mt-2 flex items-start gap-2">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="mt-0.5" />
        <span>
          <b className="text-foreground">Keep each saved shot&apos;s ball path on this phone.</b> Coordinates and measurements only: no video, no pictures. It stays on this phone and is never uploaded. You can delete it any time.
        </span>
      </label>
      <p className="mt-2">
        {stats ? <>Kept now: <b className="text-foreground">{stats.sessions}</b> session{stats.sessions === 1 ? "" : "s"}, <b className="text-foreground">{stats.shots}</b> shot{stats.shots === 1 ? "" : "s"}, about <b className="text-foreground">{kb(stats.bytes)}</b>{stats.browser.usage !== null && stats.browser.quota ? ` (this app's total storage on the phone: ${kb(stats.browser.usage)} of ${kb(stats.browser.quota)})` : ""}.</> : "Reading what is kept…"}
      </p>
      {last && <p className="mt-1 text-foreground-mute">Last save: {last.status === "saved" ? `kept ${last.shots} shots (${last.tracked} with a path, ${kb(last.bytes)}) in ${last.ms} ms` : `nothing kept (${last.message ?? last.status})`}.</p>}
      {stats && !stats.writable && <p className="mt-1 font-semibold text-foreground">This history was written by a newer version of the app, so this version only reads it and will not change or delete it, except by &ldquo;Delete all&rdquo;.</p>}
      {stats && stats.damaged > 0 && <p className="mt-1 text-foreground">{stats.damaged} record{stats.damaged === 1 ? " is" : "s are"} unreadable and ignored. <button type="button" onClick={() => void fix()} disabled={busy} className="font-bold text-accent underline">Remove them</button></p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="danger" size="sm" onClick={() => void wipe()} disabled={busy || !stats || (stats.sessions === 0 && stats.shots === 0 && stats.damaged === 0 && stats.newer === 0)}>Delete all tracking history</Button>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Move or back up</p>
        <p className="mt-1">A file of coordinates and measurements only (no video, no pictures, no account details) that you keep or move to another phone yourself. This app never uploads it. Deleting a saved session later does not remove it from a file you already exported.</p>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Include session labels (text you typed)</label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void exportNow()} disabled={busy || !stats || stats.sessions === 0}>Export this player&apos;s history</Button>
          <Button variant="secondary" size="sm" onClick={() => picker.current?.click()} disabled={busy || (stats ? !stats.writable : false)}>Import a file…</Button>
          <input ref={picker} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} aria-label="Choose a tracking-history file to import" />
        </div>
        {plan && !plan.ok && <p role="alert" className="mt-2 font-semibold text-foreground">{plan.message}</p>}
        {plan && plan.ok && (
          <div className="mt-2 rounded-xl border border-line p-2">
            <p className="text-foreground"><b>{file?.name}</b>: {plan.sessions.length} session{plan.sessions.length === 1 ? "" : "s"} in the file{plan.exportedAt ? `, exported ${plan.exportedAt.slice(0, 10)}` : ""}.</p>
            <ul className="mt-1 list-disc pl-5">
              <li>{plan.summary.new} new</li>
              {plan.summary.duplicate > 0 && <li>{plan.summary.duplicate} already on this phone (skipped)</li>}
              {plan.summary.replace > 0 && <li>{plan.summary.replace} already here and will be replaced</li>}
              {plan.summary.damaged > 0 && <li>{plan.summary.damaged} unreadable (skipped)</li>}
              {plan.summary.too_big > 0 && <li>{plan.summary.too_big} would not fit in the space tracking history is allowed (skipped)</li>}
              {plan.summary.duplicate_in_file > 0 && <li>{plan.summary.duplicate_in_file} repeated in the file (skipped)</li>}
            </ul>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={replace} onChange={(e) => void replan(e.target.checked)} /> Replace sessions that are already here</label>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => void doImport()} disabled={busy || importable === 0}>Import {importable} session{importable === 1 ? "" : "s"}</Button>
              <Button variant="secondary" size="sm" onClick={() => { setPlan(null); setFile(null); }} disabled={busy}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
      {note && <p aria-live="polite" className="mt-2 text-foreground">{note}</p>}
    </section>
  );
}
