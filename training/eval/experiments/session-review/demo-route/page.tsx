"use client";

// TEMPORARY validation page for the session-review screen. Copy to src/app/lab/review-demo/page.tsx (and allow /lab/review-demo and
// /_review-demo in src/lib/supabase/middleware.ts) while testing; never commit it there. It seeds the REAL IndexedDB stores (replay frames
// and review records) from public/_review-demo (built by make-demo.mjs from existing recordings) and then opens the real components.
import { useEffect, useState } from "react";
import { saveReplay, clearReplays } from "@/lib/vision/replay-store";
import { saveReviewRecord, clearReviewRecords, getReviewRecords } from "@/lib/review/review-store";
import { SessionReview } from "@/components/session-review";
import { SessionReviewEntry } from "@/components/session-review-entry";
import { SESSION_REVIEW_KEY } from "@/lib/review/flag";
import type { Shot } from "@/lib/basketball/shooting";
import type { ReviewShot } from "@/lib/review/types";

type DemoShot = ReviewShot & { frames: { t: number; file: string }[] | null };
type Manifest = { sessions: { name: string; shots: DemoShot[] }[] };

export default function Page() {
  const [m, setM] = useState<Manifest | null>(null);
  const [which, setWhich] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ReviewShot[] | null>(null);
  const [seeded, setSeeded] = useState("not seeded");
  const [flag, setFlag] = useState<string>("");
  useEffect(() => {
    setFlag(String(localStorage.getItem(SESSION_REVIEW_KEY)));
  }, []);

  async function seed() {
    const man = (await (await fetch("/_review-demo/manifest.json")).json()) as Manifest;
    await clearReplays();
    await clearReviewRecords();
    let frames = 0, recs = 0;
    for (const s of man.sessions)
      for (const sh of s.shots) {
        if (sh.record) { await saveReviewRecord(sh.record); recs += 1; }
        if (sh.frames && sh.replayId) {
          const fr = [];
          for (const f of sh.frames) fr.push({ t: f.t, blob: await (await fetch(`/_review-demo/${f.file}`)).blob() });
          await saveReplay({ id: sh.replayId, frames: fr });
          frames += fr.length;
        }
      }
    setM(man);
    setSeeded(`seeded ${recs} records and ${frames} replay frames into IndexedDB`);
  }
  async function openSession() {
    if (!m) return;
    const sh = m.sessions[which].shots, records = await getReviewRecords(sh.map((s) => s.replayId).filter((x): x is string => !!x));
    setItems(sh.map((s) => ({ seq: s.seq, made: s.made, detectedMade: s.detectedMade, flagged: s.flagged, tMs: s.tMs, replayId: s.replayId ?? undefined, record: s.replayId ? (records.get(s.replayId) ?? null) : null })));
    setOpen(true);
  }
  const asShots = (m?.sessions[which].shots ?? []).map((s): Shot => ({ seq: s.seq, made: s.made, zone: null, source: "camera", detectedMade: s.detectedMade, flagged: s.flagged, tMs: s.tMs, replayId: s.replayId ?? undefined }));
  return (
    <div style={{ padding: 16, fontFamily: "system-ui", color: "#e9ecf1", background: "#14161a", minHeight: "100vh" }}>
      <h1 id="title">Session review validation page (temporary)</h1>
      <p id="flag">flag hl:session-review = {flag}</p>
      <button id="seed" onClick={() => void seed()}>Seed stores from existing recordings</button> <span id="seeded">{seeded}</span>
      <div style={{ marginTop: 12 }}>
        <select id="session" value={which} onChange={(e) => setWhich(+e.target.value)}>{(m?.sessions ?? []).map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select>{" "}
        <button id="open" onClick={() => void openSession()} disabled={!m}>Open session review directly</button>{" "}
        <button id="flagon" onClick={() => { localStorage.setItem(SESSION_REVIEW_KEY, "1"); setFlag("1"); }}>Flag ON</button>{" "}
        <button id="flagoff" onClick={() => { localStorage.removeItem(SESSION_REVIEW_KEY); setFlag("null"); }}>Flag OFF</button>
      </div>
      <div id="entry-host" style={{ marginTop: 12, padding: 8, border: "1px dashed #555" }}>
        <span>entry point as it appears on the existing review screen: </span>
        <SessionReviewEntry key={flag} shots={asShots} />
      </div>
      {open && items && <SessionReview shots={items} title={m?.sessions[which].name} onClose={() => setOpen(false)} />}
    </div>
  );
}
