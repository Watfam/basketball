# Proposals (NOT integrated)

Phase 8 rule: if something small and clearly testable would improve the app without risking regression, propose it separately; do not integrate it
silently. Nothing here is in the app. Each needs Matt's yes, and criteria registered before its numbers exist.

## P-1. Warn when a set looks like the rim is being read as a ball (no change to counting)

**Problem.** In the far-shooter / 1x-lens regime (IMG_4873) the camera repeatedly "sees" a ball on the rim hardware, and the shipped grouping then
merges real shots (KNOWN-ISSUE case 2: 17 shots counted as 4). The player gets no hint that the count for that set may be off.

**Proposal.** Using data the review recorder already writes when shot review is on (each box carries `occ`, "this rim spot has been occupied by
ball-like boxes for most of the last 40 s"), count the share of processed frames in a set that carried an `occ` box. If that share is above a
threshold, show a one-line note on the end-of-set screen: "The camera may be reading part of the rim as a ball in this set, so the shot count
could be low. Watch the replays before saving." Display only. It does not change counting, the call, what is saved, or any threshold.

**Why it is small and testable.** One pure function over data that already exists; no new model run; no change to the counting loop. It can be tested
offline on the existing recordings: it should fire on IMG_4873 and stay quiet on the other seven clips.

**What would have to be true (to register first).** On the eight existing clips, the share separates IMG_4873 from the rest with a threshold fixed
*before* looking (for example: a threshold chosen from the development clips only, then checked on IMG_4872 and IMG_4873); false alarms on clips
where counting is right at most 1 of 7; it must fire on the clip where shots are merged. Limits: eight clips, one hoop, one phone; it can only warn.

**Risks.** A warning on a correct set trains people to ignore it. Wording must not suggest a specific cause the app has not verified. It needs shot
review on, so it would exist only while that beta is on.

**Not proposed.** Any change to grouping, thresholds, the detector, V4, the hoop window or the tracker.

## P-2. (considered, rejected) Mark reviewed shots as "worth a second look" from path quality

A shot whose path is "not reliable" is often one where counting was also shaky, but path quality was never validated against counting errors, and
adding it to the existing "camera was unsure" mark would change what that mark means. Rejected for now; revisit only with a registered test of how
often "not reliable" coincides with a wrong call on the existing clips.
