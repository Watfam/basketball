# Phase 6: persistent shot history and on-device readiness

**Bottom line.** Saved sessions can now keep a compact, local-only record of each shot's observed ball path, behind the existing `hl:session-review` flag (still **off by default**) **and** a per-phone opt-in. A history screen compares observed paths and measurements across saved sessions, explains when two shots cannot be compared, and reports basic consistency statistics with sample sizes, uncertainty and abstentions. Retention, deletion, damaged-record and newer-version handling were tested against a real browser IndexedDB (25/25 checks). The live camera loop pays about 5 microseconds per frame on a desktop. **Phone performance is NOT validated**: a reproducible on-iPhone procedure and an in-app storage test are provided instead.
Production detection, V4, the hoop window, the auto-sizer and counting are unchanged; the frozen baseline reproduced exactly (no change in any area; `thresholds.json`, baseline-v0 and `datasets.lock.json` untouched). All recordings used here were seen in earlier phases; nothing is independent generalisation.

## 1. Updated storage architecture

Two local stores, both IndexedDB on the phone, neither synced, neither holding pixels:
- **`hl-review`** (Phase 5, transient): one `ReviewRecord` v1 per decided shot (boxes the camera loop already had, with a rim-hardware flag), cut around the shot; pruned after a day. Written only while the flag is on.
- **`hl-history`** (new, saved sessions): stores `meta` (schema marker), `sessions`, `shots` (indexed by session). Written **once, when a set is saved**, only if the flag **and** the player's opt-in are on (`src/lib/review/retain-session.ts`).

A saved shot row (`HistoryShot`, schema 1, `history-types.ts`) holds: session key and shot number, written outcome and the camera's call, time in the set, whether tracking existed, the rim position and window size, ball width, the **observed** points only as `[ms, px right of the rim, px above the rim, box width, score]` (rim-relative; estimated points are never stored), gaps and break events, rim-hardware counts, quality grade with reasons, and the versioned fingerprint (`shot-fingerprint/1`: values, reasons for missing values, rim-level path, usable flag). A session row holds its identifiers, start time, shot counts and the **framing** (where the hoop sat in the picture, window size, ball width). Typical size **1.47 KB per shot** (measured; 59 KB for 40 shots, 368 KB for 250).
Design points: the logic (`history-core.ts`) is separate from the storage (`history-store.ts`) so it is tested without a browser; a session and its shots are written in **one transaction** (all or nothing); every row read is validated and **nothing is trusted**; opening only ever adds missing stores; a store marked with a newer schema is **read-only** for this build (never written or cleaned); damaged rows are skipped and counted; a cap of 5,000 shots / 25 MB stops new retention with a message instead of growing or silently deleting. Sessions saved before this, sets counted by tapping, and sets with the flag off simply have no rows: nothing about them changes. No legacy format exists to migrate (this is the first release of `hl-history`); the migration point is `parseShot`, which upgrades a known older version and quarantines an unknown one, both tested.
Not stored, by construction and by test: video, images, thumbnails, data URLs, blobs or typed arrays (a row carrying any is rejected on read), and the history code contains no network call.

## 2. User-facing retention controls

Everything is invisible unless the flag is on (`localStorage.setItem("hl:session-review","1")`, or the switch on **Camera lab > Session review (beta)**).
- **Opt-in checkbox** "Keep each saved shot's ball path on this phone" (off by default): says what is kept (coordinates and measurements, no video, no pictures), that it stays on the phone and can be deleted any time. Shown on the Shot history screen and on the lab page.
- **Storage report:** sessions, shots, kept bytes, and this app's total storage and quota (`navigator.storage.estimate`); last save result.
- **Delete controls:** per session ("Delete" on each saved session) and **Delete all tracking history** (confirmation; also removes rows this version cannot read); **Remove them** for unreadable rows. Turning retention off stops new saving and leaves what is kept until deleted. Deleting a saved session elsewhere in the app does **not** delete its local history (a gap; see limitations).
- Entry points: "Shot history (beta)" under the setup screen of the shooting hub (`TrackingHistoryEntry`), flag-gated; the Phase-5 "Session review (beta)" link is unchanged.

## 3. Historical shot comparison

`src/components/shot-history.tsx`: choose up to six shots from any saved sessions (expand a session, tap shots; filter All / Makes / Misses; a dot shows path quality); a rim-relative overlay in ball widths (observed points only); a measurement table (position at rim height, direction, speed, closest approach, flight seen, smoothness, bounce) with **n/a and the reason** for any measurement not taken, path quality, seen points and mean detector score for each shot.
**Comparability is explicit** (`compareShots`, `compareFraming`): shots from different sessions must share a **framing** (hoop within about one ball width of the same place in the picture, window size within 10%, ball width within 15%); a shot with no path, an unreliable path, or no observed crossing of the rim's height is not comparable. Every reason is listed in words; differences between shots appear only when all chosen shots are comparable; otherwise the overlay is still drawn (so shapes can be looked at) with a note that differences are not shown as measurements. Unknown framing is never assumed the same.
**Limit of the framing key (stated in the screen):** it sees distance, zoom and where the hoop sits in the picture; **it cannot see the camera's angle to the hoop**, which changes image-horizontal positions. On the existing recordings it groups IMG_4839, IMG_4840 and IMG_4872 (two different days) into one framing. I tightened the hoop-position tolerance from 0.04 to 0.02 of the picture (about one ball width) after seeing that 0.04 grouped four sessions; the reason is geometric, not outcome-based, and is recorded in the code comment.

## 4. Basic evidence-based consistency analytics

`src/lib/review/consistency.ts`. **Only** the validated measurement is used: where the ball was observed at the height of the rim (image-horizontal, in ball widths; stable between 30 and 15 fps in Phase 4), on shots whose path is tracked or partial. Sessions are analysed **per framing group, never pooled across framings**. Statements: variability (descriptive), trend across sessions (rank correlation with permutation test; needs five sessions of at least eight measurable shots, because with four the smallest possible p-value is above 0.05), latest session against earlier ones (spread ratio, bootstrap interval, permutation test), and successful against unsuccessful shots (distance and spread). Holm correction across the tests tried; practical-size floors; abstention with reason codes; every statement carries n, the interval or test result, a baseline, supporting shot ids, the limit sentence and a caution; a language lint rejects form, release, "improved", "better", "worse" and bare left/right. The outcome is never an input to the measurement.
Real recordings (one session per recording, built with the app's own recorder and retention code; `results/real-derived-history.json`): 8 sessions, 168 shots (167 with a path, 269 KB), six framing groups. Framing 1 (IMG_4839, 4840, 4872; 65 measurable shots): variability about 0.80 ball widths (interval 0.44 to 2.47); misses were observed 2.30 ball widths farther from the rim centre than makes (29 makes, 36 misses, interval 1.57 to 3.37, adjusted p 0.0006) and varied 12 times as much; trend across sessions: **abstained** (3 sessions, needs 5); latest against earlier: **abstained** (interval includes no difference). Framings with one session: variability only, plus one make/miss statement where the sample allowed; everything else abstained.
**Read the make/miss statements for what they are** (Phase 4 finding, repeated on every one of them in the screen): a miss is a ball that was not near the rim line, so this mostly shows the measurement follows the result. **No trend statement can be supported from existing data**: there are not five comparable sessions, and none is claimed. Validity tests (unit): a clear separation is supported with all fields; null data abstains; placebo (outcomes shuffled 120 times) gives a false-claim rate at or under 10%; a seven-session rise in spread is reported as a change in the OBSERVED position with no claim about technique; different framings are never pooled.

## 5. Storage and performance measurements (desktop headless Chrome, NOT a phone)

Real code path, real IndexedDB, synthetic sessions (arcs with missing frames, second-ball and rim-hardware boxes). `results/performance-desktop.json`, `live-loop-cost.json`.

| Session size | Save (compact + write) | Kept | Load | Analyse | Delete |
|---|---|---|---|---|---|
| 40 shots | 36-66 ms | 59 KB (1.47 KB/shot) | 6-39 ms | 230 ms | 13-18 ms |
| 100 shots | 36-111 ms | 147 KB | 6-24 ms | 470-610 ms | 26-40 ms |
| 250 shots | 109-182 ms | 368 KB | 12-30 ms | 590-1,380 ms* | 65-126 ms |

*An earlier build took 1.4 s for 250 shots and **31 s to open a 1,500-shot history**, because the statistical tests scaled with the sample. Fixed before reporting: tests now use at most the most recent 400 measurable shots per framing (named in the statement's caution), iteration counts shrink as samples grow (never below 600 resamples and 1,500 permutations), and the analytics run after the first paint ("Working out consistency…"). Real-data conclusions were unchanged.
History screen with real IndexedDB: 40 shots, sessions listed in about 0.5 s; 300 shots 0.4 s (analytics 1.3 s); **1,500 shots (six 250-shot sessions, 2.1 MB) listed in 1.6 s, analytics at 1.7 s**; selecting six shots and drawing the overlay and table 40-80 ms; JS heap 13-35 MB. The browser's own storage estimate grew by about 1.2 to 1.7 times our byte count (IndexedDB overhead): 2.1 MB at 40 shots, 2.9 MB at 300, 4.9 MB at 1,500 for the whole origin.
**Live camera loop** (added work while shooting, flag on): recorder `push` per processed frame median 5 µs, 99th percentile 20 µs (one outlier of 1.5 ms in 5,400 frames, likely garbage collection); cutting a record per shot 0.01 ms; saving the transient record (asynchronous, off the loop) median 2.8 ms; a record is 4.5 KB; no model run is added. Against a 66 ms frame budget this is negligible on a desktop; a phone is several times slower, which is still negligible, but **that is a claim to test, not a result**. Session **save** of 250 shots 109-182 ms here; the retention call is fire-and-forget and does not delay the save or the summary.
**Not measurable here:** battery and thermal behaviour (needs a phone over a full set), Safari/iPhone IndexedDB limits and eviction, phone memory.

## 6. Privacy and deletion tests

Unit (`history.test.ts`, 12 tests): rows are plain numbers and short strings; a Blob, an image data URL, a blob URL or a typed array is rejected; the history source contains none of `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `supabase`, `createObjectURL`, `toBlob`, `toDataURL`, `getImageData`; retention requires the flag **and** the setting exactly "1"; a failed write leaves nothing half saved; the cap writes nothing; deleting a session removes only it; deleting all removes unreadable and newer rows too.
Browser (25 checks, real IndexedDB, `results/browser-checks.json`): nothing kept with the flag on but no opt-in; kept with both; persists across a reload; delete one session; delete all; **zero network requests other than the local dev server** while seeding, browsing, comparing and deleting; no page errors; flag off removes the entry.

## 7. Compatibility results

Existing app tests **126/126** (the 93 originals plus 33 for review and history), harness 47/47, experiments 97/97; `next build` compiles; eslint clean. Frozen baseline re-run: no change in any area. Sets without history, sets saved before this, tap-counted sets and the flag-off app behave as before: an empty store loads as empty and writable; outcome-only rows load; a flag-off save runs no history code and writes nothing (tested in the browser through the production save path); a store from a newer version is left untouched and read-only; damaged rows are skipped. Changes to existing files (17 added lines, 3 changed): `shooting-hub.tsx` (+5: import, one fire-and-forget call after a successful save, the entry), `use-camera-counter.ts` (diagnostic timing hook inside the already flag-gated recorder), `recorder.ts` (optional timing callback), `lab/page.tsx` (+3: a link). No counting, V4, window, sizer or model file is touched.

## 8. Enabling and testing on an iPhone

No iPhone measurement was possible here. Procedure (all local; nothing is uploaded):
1. Deploy this build (or run it on a phone-reachable dev server). Sign in. Open **Camera lab > Session review (beta)** (`/lab/session-review`).
2. Turn on **Session review**, **Timing diagnostics** and **Keep tracking history** (all off by default). Counting is the same either way.
3. Tap **Run storage test**: it saves, reads, analyses and deletes synthetic sessions of 40, 100 and 250 shots on the phone (throwaway area; your history is untouched) and prints save/load/analyse/delete times and bytes. **Copy report** and keep it.
4. Shoot a real camera set (at least 40 shots if you can; also try a set of 100+), tapping **End session** then **Save set**. Watch for any change in the count, the live fps (the camera report's average and slowest fps) and the phone's warmth compared with a set recorded with every switch off.
5. On the shooting screen open **Shot history (beta)**: check the saved session, its shot count, size and "last save" line; open shots, compare two from the same framing and one from a different place; filter makes and misses; delete one session and confirm it goes; reload and confirm the rest persists.
6. Return to the lab page: **Live loop timings** show the recorder's cost per frame from that set. Compare the average fps of the flag-on and flag-off sets (target: no difference beyond normal variation) and note battery drop and heat over a 15-minute set.
7. Delete: **Delete all tracking history**, then confirm the storage line reads zero.
Pass criteria to register before the trial: no change in counted shots against a flag-off set of the same session type; average fps within 1 of a flag-off set; save under 1 s for 250 shots; history screen listing under 3 s with 1,000+ shots.

## 9. Remaining limitations

- No real-device measurement; Safari may evict IndexedDB data under storage pressure (history can disappear without warning; the screen says it is kept "on this phone", not that it is permanent).
- Deleting a saved session in the app does not remove its local history (it would need a link from the saved-session delete button to `deleteSessionHistory`; its server id is stored when known).
- Framing cannot detect a different camera angle; grouping can merge sessions that are not truly comparable. Only the hoop's picture position, window size and ball width are used.
- Only one measurement is analysed; the make/miss statements are largely face validity; trend statements need five comparable sessions and none exist yet in the data.
- The recorder only runs while the flag is on, so sets shot before turning it on have no history; history is per phone and per player on that phone.
- A history written by a future build is read-only here; the app has no export, and "Delete all" is the only way to remove rows it cannot read.
- 5,000 shots / 25 MB cap; analytics use at most the most recent 400 measurable shots per framing.

## 10. Recommendation for the next milestone

Run the iPhone trial above for a few weeks of real sessions with the opt-in on (decision for Matt), against pre-registered pass criteria, then review: real fps and battery, how often a session has enough comparable shots, and whether the framing key groups sessions sensibly. In the same milestone, link saved-session deletion to history deletion, and add an on-device "framing check" (a reference hoop picture or fixed marker) so sessions can be compared with the camera angle controlled; that, not more statistics, is what would make cross-session comparison trustworthy. Keep the flag off by default until that trial passes.

## Files

New (`src/lib/review/`): `history-types.ts`, `history-core.ts`, `history-store.ts`, `history-settings.ts`, `retain-session.ts`, `consistency.ts`, `diagnostics.ts`, `selftest.ts`, `history.test.ts`, `consistency.test.ts`. New components: `shot-history.tsx`, `tracking-history-controls.tsx`, `tracking-history-entry.tsx`, `session-review-lab.tsx`; route `src/app/lab/session-review/page.tsx`. Experiment: `training/eval/experiments/persistent-history/` (builders, e2e scripts, results).

## Reproduce

```bash
node training/tools/43-run-tests.mjs history && node training/tools/43-run-tests.mjs consistency   # 20 tests
node training/eval/experiments/persistent-history/build-real-history.mjs                          # real-derived history and analytics
node training/eval/experiments/persistent-history/build-real-history.mjs --demo                   # also writes public/_history-demo (temporary, git-excluded)
# Browser checks: copy persistent-history/demo-route/page.tsx to src/app/lab/history-demo/page.tsx, allow /lab/history-demo and /_history-demo
# in src/lib/supabase/middleware.ts, npm run dev -- -p 3101, then (puppeteer-core): node persistent-history/e2e/history-e2e.mjs,
# history-perf.mjs, history-live.mjs. Remove the route, the middleware edit and public/_history-demo afterwards.
node training/tools/43-run-tests.mjs                                                              # all 126 app tests
node training/eval/run-baseline.mjs --id check && node training/eval/compare.mjs training/eval/reports/baseline-v0.json training/eval/reports/check.json   # then delete check.*
```
