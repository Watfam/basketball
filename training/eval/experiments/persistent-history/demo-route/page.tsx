"use client";

// TEMPORARY validation page for tracking history. Copy to src/app/lab/history-demo/page.tsx (allow /lab/history-demo and /_history-demo in
// src/lib/supabase/middleware.ts) while testing; never commit it there. Seeds the REAL history store through the REAL retention code from
// public/_history-demo/manifest.json (built by build-real-history.mjs --demo from existing recordings) and exposes the steps to a test driver.
import { useEffect, useState } from "react";
import { retainSession, loadHistory, type RetainInput } from "@/lib/review/history-core";
import { idbHistory } from "@/lib/review/history-store";
import { saveReviewRecord } from "@/lib/review/review-store";
import { retainHistory } from "@/lib/review/retain-session";
import { runSelfTest, syntheticSession, syntheticRecord } from "@/lib/review/selftest";
import { createReviewRecorder } from "@/lib/review/recorder";
import { TrackingHistoryEntry } from "@/components/tracking-history-entry";
import { SessionReviewLab } from "@/components/session-review-lab";
import type { ReviewRecord } from "@/lib/review/types";

type Manifest = { sessions: { input: Omit<RetainInput, "records"> & { records: Record<string, ReviewRecord> }; now: number }[] };

declare global { interface Window { __h: Record<string, (...a: unknown[]) => Promise<unknown>> } }

export default function Page() {
  const [log, setLog] = useState("ready");
  useEffect(() => {
    window.__h = {
      async seed() { const m = (await (await fetch("/_history-demo/manifest.json")).json()) as Manifest; const out = []; for (const s of m.sessions) out.push(await retainSession(idbHistory, { ...s.input, records: new Map(Object.entries(s.input.records)) }, s.now)); return out; },
      async load() { const h = await loadHistory(idbHistory); return { sessions: h.sessions.length, shots: h.shots.length, damaged: h.damaged, newer: h.newer, writable: h.writable }; },
      async glue(keyArg) { // the production path: review records in hl-review, then retainHistory (flag + opt-in gated)
        const m = (await (await fetch("/_history-demo/manifest.json")).json()) as Manifest; const s = m.sessions[0].input; const key = String(keyArg ?? "glue");
        for (const r of Object.values(s.records)) await saveReviewRecord(r);
        const res = await retainHistory({ playerId: key, snapshot: { startedAt: `2030-01-01T00:00:00Z-${key}`, label: "glue", sessionId: null, shots: s.shots.map((x) => ({ ...x, zone: null, source: "camera" as const })), camera: { rimX: 0.5, rimY: 0.4 }, cameraStats: { scale: 1, ballWidth: 24 } } });
        return res;
      },
      async selftest() { return runSelfTest(idbHistory, [40, 100, 250]); },
      async bigSeed(sessions, perSession) { const out = []; for (let i = 0; i < Number(sessions); i += 1) { const inp = syntheticSession(Number(perSession), `kid1:big-${i}`, 100 + i); out.push(await retainSession(idbHistory, { ...inp, playerId: "kid1", sessionKey: `kid1:big-${i}`, startedAt: new Date(1_760_000_000_000 + i * 86_400_000).toISOString() }, 1_760_000_000_000 + i)); } return out.map((r) => ({ status: r.status, ms: Math.round(r.ms), bytes: r.bytes })); },
      async liveCost() { // the camera loop's added work: push per frame, cut + save per shot, size of a record
        const rec = createReviewRecorder(), push: number[] = [], cut: number[] = [], save: number[] = [], sizes: number[] = [];
        const src = syntheticRecord("x", (() => { let t = 7; return () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; }; })());
        for (let shot = 0; shot < 40; shot += 1) {
          for (let i = 0; i < 135; i += 1) { const fr = src.frames[i % src.frames.length]; const t0 = performance.now(); rec.push((shot * 135 + i) * 66.7, true, fr.boxes); push.push((performance.now() - t0) * 1000); }
          const c0 = performance.now(); const r = rec.cut((shot * 135 + 70) * 66.7, `live-${shot}`, { x: 192, y: 190 }, 1); cut.push(performance.now() - c0); sizes.push(JSON.stringify(r).length);
          const s0 = performance.now(); await saveReviewRecord(r); save.push(performance.now() - s0);
        }
        const q = (a: number[], p: number) => { const x = [...a].sort((u, v) => u - v); return +x[Math.min(x.length - 1, Math.floor(p * x.length))].toFixed(3); };
        return { push_us: { median: q(push, 0.5), p99: q(push, 0.99), max: q(push, 1) }, cut_ms: { median: q(cut, 0.5), max: q(cut, 1) }, save_review_record_ms: { median: q(save, 0.5), p95: q(save, 0.95), max: q(save, 1) }, record_bytes: { median: q(sizes, 0.5), max: q(sizes, 1) } };
      },
      async clearAll() { const { deleteAllHistory } = await import("@/lib/review/history-core"); await deleteAllHistory(idbHistory); return true; },
      async raw(op, arg) { // direct IndexedDB access for the damage / newer-schema tests
        const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("hl-history", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        return new Promise((resolve, reject) => {
          const tx = db.transaction(["meta", "shots"], "readwrite");
          if (op === "meta") tx.objectStore("meta").put({ key: "schema", schema: arg, createdAt: 1, app: "future" });
          if (op === "junk") { tx.objectStore("shots").put({ id: "junk1", v: 1, sessionKey: "x", points: "bad" }); tx.objectStore("shots").put({ id: "future1", v: 99, sessionKey: "x" }); }
          tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = () => reject(tx.error);
        });
      },
    };
    setLog("hooks installed");
  }, []);
  return (
    <div style={{ padding: 16, color: "#e9ecf1", background: "#14161a", minHeight: "100vh", fontFamily: "system-ui" }}>
      <h1 id="title">History validation page (temporary)</h1>
      <p id="log">{log}</p>
      <div id="entry"><TrackingHistoryEntry playerId="kid1" /></div>
      <div id="lab" style={{ maxWidth: 440, marginTop: 24 }}><SessionReviewLab /></div>
    </div>
  );
}
