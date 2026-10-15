# Phase 8: product readiness and usability

**Bottom line.** The shot-review and history features are now written for a player, not an engineer, and everything that can be tested without a camera
has been. **Nothing here has been run on an iPhone.** The screens were checked in headless desktop Chrome at an iPhone-sized viewport with real tracked
paths from your existing recordings; that is a functional check, not an iPhone result. Counting, ball-6, V4, the hoop window and the frozen baseline are
untouched (the baseline reproduces with no change; section 9). Experimental features are still off by default.

**What to enable, in one line:** the deletion fix is already on and is safe. Shot review, shot paths and history are ready for **you to turn on, on your
own phone, as an opt-in beta** after the replay test passes there and the two live checks (speed and same-count) pass. Everything that *compares sessions
automatically*, the patterns, the camera reference and any shot-separation change **stays experimental**.

---

## 1. Feature-readiness inventory (Phases 4 to 7)

Status words: **In production** (always on, in use before these phases) · **Working, opt-in** (built, tested, flag-gated, default off; needs live-phone checks
before it is anything more) · **Experimental** (not validated for what it claims; stays off or advisory) · **Offline only** (a research tool on the computer, not in the app) ·
**Not integrated** (tried, failed its registered criteria).

| Feature | Phase | Status | What it still needs |
|---|---|---|---|
| Camera counting: ball-6, V4, hoop window, auto-sizer, speed check, replays | before 4 | In production, **unchanged** | n/a (frozen baseline, reproduced in this phase) |
| Delete a saved session also deletes its shot paths (hide at once, remove after 2 min, queue if the store is busy) | 7 | **In production**; does nothing unless shot paths were ever kept | nothing |
| Review your shots (watch a shot with its path over the video, step through it, compare) | 5 / 8 | **Working, opt-in** (flag `hl:session-review`, off) | live checks L1, L2, L4, L5 below |
| Shot paths saved on this phone (opt-in, numbers only) | 6 / 8 | **Working, opt-in** (needs the flag and its own switch) | L1, L2, L3, L6 |
| Shot history: browse sets, watch a saved path again, makes vs misses | 6 / 8 | **Working, opt-in** | replay test on the phone; then L4, L6 |
| Export / import of shot paths (a file you hold; checksum, no ids, no labels by default) | 7 / 8 | **Working, opt-in** | replay test on the phone (it exercises the same code) |
| Delete all / delete one set / clear unreadable | 6 / 7 | **Working, opt-in** | replay test (delete and undo in a copy) |
| Plain-language confidence and missing-data wording | 8 | **Working, opt-in** | read by someone who is not me |
| Makes-vs-misses overlay and sentence | 8 | **Working, opt-in**; the sentence carries its own caution (a miss is mostly a ball that was not over the rim) | none beyond the above |
| Cross-session comparison of picked shots | 6 | **Experimental**: only sets filmed the same way are compared, but "the same way" is the old rim-position and zoom key, which cannot see camera angle | a real controlled view-change test (not requested) |
| Patterns across sets (consistency statements, placebo-checked, abstain when thin) | 4 / 6 | **Experimental**: describes where the ball was seen at rim height, not technique | more real sessions; Matt's judgment of usefulness |
| Camera reference (lab page, advisory) | 7 | **Experimental, advisory**: failed its criteria to approve comparisons | decision: leave as is |
| Replay test on this phone (new) | 8 | **Working** (lab page) | run it on the phone |
| Phone speed check with made-up data; live timers behind the diagnostics switch | 7 | **Working** (lab page) | run it on the phone |
| Flight-path replay as an HTML page, shot fingerprints, insight engine as research tools | 4 | **Offline only** | n/a |
| Persistent ball tracker (Kalman), expanded flight window, accuracy candidate, shot-separation candidate | exp 1-2, 4, 5 | **Not integrated** (each failed its registered criteria) | n/a |
| Shot separation (merged shots on far-shooter clips) | 5 | **Open problem**, documented in `shot-separation/KNOWN-ISSUE.md`, cases guarded by a test | out of scope |

**Blocked by missing real-device validation (nothing in this list can be called validated until a real set on a real iPhone meets the registered limits):**
speed of the live loop with review on (L1), same counted shots with review on and off (L2), battery and heat (L3), how many live shots get a clear path (L4),
video playing under the path right after a live set (L5), shot paths surviving days in Safari (L6), the Home Screen app (L7), the camera reference when
hand-held (L8). Full list and steps in section 5.

## 2. Review your shots (the screen after a camera set)

Opens from the end-of-set screen (flag on). Plain words throughout: **Watch a shot** and **Compare shots**.

- **Coverage line**: "14 shots: 13 with a path, 10 clear." Sets counted by tapping, or shot before shot review was on, say they have no paths.
- **Watch**: shot chips (number, make or miss), previous and next shot, the video with the observed path drawn on it (or a plain grid when the video is
  gone), Play, step, a slider, and one plain sentence for each moment: "The camera saw the ball here", "Not seen for a split second, so this spot is an
  estimate (dashed)", "The camera was resting here", "Something else that looked like a ball was right next to it".
- **Confidence in words**: *Clear path*, *Mostly clear*, *Not reliable*, *No path*, each with a one-line meaning and a short list of reasons in everyday
  words ("The camera mistook part of the rim for the ball and ignored it"). Unreliable paths stay hidden unless you ask. Missing measurements say why
  ("The camera did not see the ball come down past the rim"), never a blank.
- **What the shot looked like**: one sentence from what was measured, in the picture's own left and right: "Came down about 0.6 ball to the right of the
  rim's centre, as the picture shows it. Coming in at a slant toward the right of the picture." It never says why a shot went in or missed.
- **Compare**: *Makes vs misses* overlays every shot with a trustworthy path (makes blue, misses orange) and gives counts and a sentence; *Pick shots*
  overlays the ones you tick.
- Engineering detail (measurement table, evidence ids) is folded under "What the camera measured" and "More options".

The words are tested: `plain.test.ts` runs real analysed shots (clean, gaps, a second ball close, nothing found, rim hardware only) through the wording and
fails if any reason is left in engineering language or any plain sentence contains a term from a banned list (fingerprint, detection, reconstructed,
hardware, score, pixel, framing...). The browser check runs the same list over the visible text of every screen.

## 3. Shot history and historical comparison

Reachable from the shooting screen, and now also from a **completed session's page** ("Watch this set's shot paths (beta)"), which opens straight to that
set. Sets are listed with a plain coverage line ("17 shots: 17 with a path, 4 clear"), filterable to makes or misses. Tap a shot to **watch its saved path
again** (a plain grid with the rim, play and a slider; saved history keeps where the ball was seen, not video). A line is never drawn across a missing
stretch (more than about one missed camera frame breaks it).

- **Makes vs misses**, per camera setup: sets filmed from a different spot or zoom are kept apart (a setup picker appears when there is more than one) and
  the screen says why. Up to 120 recent trustworthy paths are drawn. With fewer than 5 makes or 5 misses it says "Not enough to compare yet" and gives no
  numbers. With enough, it reports the typical distance from the rim's centre for each and a **shuffle test** (does mixing makes and misses at random give a
  gap this big?) in three plain tiers: common by chance / could still be chance / bigger than shuffling normally gives. Every version ends: "Misses are
  mostly balls that were not over the rim, so some gap is expected; it says where the ball was seen, not why or how it was shot." (This is the same
  caution the pattern engine already carried; the earlier unconditional "may be chance" line was wrong for a large gap, which is why the test was added.
  On the real-derived sets: makes 0.2 ball widths, misses 2.5, from 29 and 36 shots: reported as a bigger gap than shuffling gives, with the caution.)
- **Picked shots**: up to 6, with a plain table and the verdict "filmed the same way, so they can be compared" or the reasons they cannot.
- **Patterns across sets**: the same tested statements as before, in everyday words ("In this camera setup, where the ball was observed at rim height
  varied by about 0.80 ball widths..."), the numbers folded under "How sure is this?", and "Nothing stands out yet" when thin.

## 4. Privacy and retention controls (one card)

"**Shot paths on this phone**": one switch (*Keep shot paths (on/off)*) with a sentence a parent can read ("numbers only: no video, no photos; stays on this phone;
never uploaded"), what is kept now, the last save, and one row of **Export to a file · Import a file… · Delete everything**. Turning it on also turns shot
review on, because paths come from it, and says so. Turning it off keeps what exists and says so. Deleting one set is the Delete beside that set. The card
states plainly that deleting a set in the app deletes its paths here but not a file already exported, and that nothing on the card touches saved sessions or
shot counts. Export options (include the names I gave my sets) are folded away; the file never contains player or account ids. Import shows what it will
do (new, already here, unreadable, repeated, would not fit) before anything is written. On the lab page, one master switch turns shot review and paths on
together, with the separate switches folded below. **Defaults are unchanged: everything is off.**

Checked in the browser (`controls-e2e.mjs`, 23 checks): off by default; one tap on; one tap off with the right message; plain status; export downloads a file with
no ids or labels; delete everything; import preview and confirm restores 8 sets and 168 shots; the same file again is "already here"; changed, non-JSON and
foreign files are refused in plain words; nothing is sent anywhere; no page errors.

## 5. iPhone validation without new footage

`/lab/session-review` now has two clearly separate parts.

**A. Test with saved data (no camera, no new footage)** `training/eval/experiments/iphone-readiness/criteria-replay.json`, registered before the code. It replays
shot paths already stored on the phone (or imported) through the real review, history, export, import and delete code in the phone's own browser: read
everything (< 3 s), draw every saved path (95th percentile < 50 ms), analyse (< 3 s), **export then import into a throwaway copy and compare every path
point**, **delete and undo in the copy** (hidden at once, restored whole, others untouched), decode any saved video clips (< 50 ms a frame), and confirm the
real saved paths are byte-identical afterwards. It never writes to the real store. With fewer than 20 real saved paths it falls back to made-up ones and
labels **every row** "made-up data"; a made-up pass is a separate verdict ("pass (made-up data only)") and never a plain pass. Every row says "Replayed data".

**To get real paths onto the phone without filming:** `node training/eval/experiments/persistent-history/build-real-history.mjs --phone-file` builds
`training/work/phone-replay/hardwood-lab-replay-sample.json` (8 sets, 168 shots, 249 KB) from your existing recordings with the app's own recorder and
retention code: coordinates only, no player ids, no labels, no frames; it is git-ignored and never uploaded by anything. AirDrop it to the phone and use **Import a file…**,
then run the replay test.

**Desktop dry run of the replay test on that file** (Node; `replay-real-desktop.json`; **not a phone result**): real data, 8 sets, 168 shots, 159 paths; read 11 ms;
draw p95 0.07 ms; analyse 500 ms; round trip identical; delete and undo correct; real store unchanged; clips not measured (none exist).

**B. Needs the live camera (not covered by the replay test).** Each shows why, the steps, and an "I checked this" box that only records that you did. The app
never marks any of them validated.

| # | Check | Why only the live camera can answer it |
|---|---|---|
| L1 | Counting speed with shot review on vs off | the recorder runs inside the live loop; timers (diagnostics switch) compare two real sets (limits: at most 2 ms more work, 1 fps slower) |
| L2 | Same shots counted with review on and off | counting must not change; this is the real-phone check |
| L3 | Battery over a 15-minute set (and heat) | iPhone Safari offers no battery or thermal API; enter before/after by hand (limit: 2 points more per 15 min) |
| L4 | Paths captured for new live shots | depends on the real camera and light |
| L5 | Video for new shots plays under its path | clips are kept only until a set is saved |
| L6 | Saved paths survive days | Safari can clear a site's storage after about a week unused; only time shows it |
| L7 | Camera and review from the Home Screen app | Home Screen and tab behave differently on iPhone |
| L8 | Camera reference when hand-held | drift and light cannot be replayed |

The earlier "Storage test" section was folded into the speed check (made-up data; unchanged limits). The page also states at the top: "Checked on a real
iPhone: nothing yet."

## 6. What was verified, and how

| Check | Where | Result |
|---|---|---|
| Wording: every analysis reason plain, no banned term, pattern statements rewritten, confidence labels | `plain.test.ts` (6 tests) | pass |
| Stored-path view: ball widths from the rim, breaks at missing stretches, make/miss lines, groups | `history-view.test.ts` (5) | pass |
| Replay test: criteria equal registered, made-up data never a plain pass, real data replayed and real store untouched, failures reported | `replaytest.test.ts` (4) | pass |
| Screens on real-derived paths in headless desktop Chrome, iPhone-sized (`ui-e2e.mjs`) | history list, settings, watch and play, makes vs misses, setups, patterns, delete a set, review (watch, next, compare, pick), lab (replay test on real imported data, all eight live checks listed and unvalidated, replay rows labelled, saved paths unchanged), banned-term lint on every screen | **all pass** |
| Settings card and data controls in the browser (`controls-e2e.mjs`) | see section 4 | **all pass** |
| Regression suites | app tests, harness, experiments | section 9 |

**Not verified:** iOS Safari rendering and touch behaviour; any live-camera behaviour; reading comprehension by people other than me; the screens with real replay video
frames (none were available offline, so the video-under-path overlay on this screen is unchanged from Phase 5's checked version).

## 7. Recommendation: what is ready, what stays experimental

**Ready to enable (for you, on your phone, opt-in; defaults stay off):**
1. Shot review and shot paths, plus Shot history, Watch a saved shot, Makes vs misses, export, import and delete. Order: run the replay test with the sample file on the iPhone;
   if it passes, run L1 and L2 with two real sets of the same drill; if those pass, use it for real sets and check L4 to L6 over a week.
2. Deletion integrity (already on).

**Stay experimental / advisory:**
- Anything that compares sessions without you choosing the shots (the camera-setup key cannot see viewing angle), and the Patterns section's claims.
- The camera reference (advisory only) and the framing descriptor.
- Every tracker, detector, window or shot-separation change (not integrated; failed criteria; the merge cases are guarded by a test).
- Turning any of it on by default for other players.

**Proposed separately, not integrated:** a display-only warning when a set looks like the rim is being read as a ball (`PROPOSALS.md`), with how it would be tested first.

**Next:** run the on-phone checks above; then decide on P-1 and on whether to add an automatic expiry for old shot paths (the card has no "keep for N days" option; not built).

## 8. Limits of this phase

- Wording and layout were judged by me and by a banned-term test, not by users. "Plain" is a claim about vocabulary, not about comprehension.
- The makes-vs-misses description treats every shot as independent; shots in one set are not, which flatters the shuffle test. The sentence says so.
- The real-derived sample is eight sets from one hoop; it exercises the code on real paths but says nothing about other courts or phones.
- Shot paths exist only for sets shot with the camera while shot review was on; earlier sets have none.

## 9. Regression

- **App tests 181 / 181** (166 before this phase; +6 wording, +5 stored-path view, +4 replay test), **harness 47 / 47**, **experiments 101 / 101** (+4 preserved shot-separation cases). ESLint clean on `src/`; `next build` succeeds.
- **Frozen baseline reproduced and compared with `compare.mjs` against `baseline-v0`: no change in any area** (shots at 30 and 15 fps: 0 gained, 0 lost; detection recall 66.7% and precision 100.0%; localisation median 0.81 px; desktop inference median 119.3 ms, all unchanged). Temporary report files deleted. `thresholds.json`, `baseline-v0` and `datasets.lock.json` unchanged.
- Production counting files (`counting`, `shotRules`, `roi`, `yolox`, the detector and the hoop window) are not modified; `use-camera-counter.ts` is not modified in this phase. The only
  `src/lib/vision` change is a read-only `listReplayIds()` in `replay-store.ts`.

## Reproduce

```bash
node training/tools/43-run-tests.mjs                                   # app tests
node --test training/eval/lib/*.test.mjs && node --test training/eval/experiments/*/*.test.mjs
node training/eval/experiments/persistent-history/build-real-history.mjs --phone-file   # the sample file for the phone (git-ignored)
node training/eval/experiments/product-readiness/replay-real.mjs                         # desktop dry run of the replay test on it
# browser checks (temporary route /lab/p8-demo, never committed; see ui-e2e.mjs and controls-e2e.mjs): need puppeteer-core and the dev server
```
