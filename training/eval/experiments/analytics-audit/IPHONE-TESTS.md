# iPhone tests for Phase 14

Do these on your own iPhone, signed in, on the live site. Nothing here needs new footage. Stop and tell me at the first thing that looks wrong; write down what you saw. About 40 minutes in total; tests 1 and 2 take five minutes each.

Before you start: run `supabase/checks/p14_integrity.sql` in the Supabase SQL editor (read only). Send me the table. Any row marked LOOK first.

## Test 1: Progress with your real data (5 min, no camera)
1. Me, then Progress.
2. The first card should be "Your latest": your last tracked drill, its numbers, and the same drill last time. Do the numbers match what you remember?
3. Tap "This drill over time", then Back. You should land where you were, with the same dates.
4. Tap "Every shot". If you see "not found", note which drill (that is the deleted-set case).
5. Read "What your results say" out loud to a child. Can they say what it means? Which words did they stumble on? (Especially "Possible" and "Not clear yet".)
6. Switch to Light and Dark mode in iOS settings and check the text on orange chips is readable.

## Test 2: Navigation both ways (5 min, no camera)
Home, then Training plan, Film Room, a shooting drill, then Back at each step. Then Me, Progress, Shooting, a kind of shot, a drill, a result, and Back at each step. Note anything that sends you somewhere you did not expect, or loses your place.

## Test 3: Film Room lesson for a drill (3 min)
Open a drill that has a lesson (Catch-and-Shoot off the Pin-Down). Is the lesson link there, and does Watch open the video? Do the same for Free Throw Reset and Beat the Clock Finisher; the app should say a related lesson or none rather than showing nothing.

## Test 4: A full benchmark workout with the camera (20 min)
1. Train, the Benchmark Check workout, Free Throw Benchmark, Track with Camera. Shoot the 30 free throws.
2. Save. Check the makes and attempts are right. Use "Fix the numbers" to correct one, and check the result says it was corrected.
3. Back to your workout; finish the workout.
4. Progress: the new result is the "Your latest" card, and the Next card should now say to carry on with the plan (not to run it again).
5. Repeat step 1 and then close the app in the middle of the set, reopen it, and see what is left. Tell me what you see.
6. Turn on airplane mode before pressing Save, press Save, turn it off, reopen the app. The result should appear on the drill without you doing anything.

## Test 5: Saved shots on the phone (only if you turn the experiment on)
Settings, turn on "Keep shot paths". Shoot a free-shooting set with the camera, save it. Open the shot history. Watch a shot, play, pause, step. Compare two. Where they went: open "Where was the phone?" and answer it. Check the side wording changes (straight behind: a side is stated with a small note; off to one side: it says the side cannot be read as a lean). Close and reopen the app: the answer is still there. Note whether iOS ever empties the saved shots (look again two days later).

## Test 6: Screen reader and touch
Turn on VoiceOver. On Progress, swipe through: every control should say what it does (the range chips, the three section tabs, "See the sessions", "How sure is this?"). In Where they went, the dots and bars should read their position and "Watch one". With big text sizes on, nothing should be cut off. Note any control that is hard to hit with a thumb.

## What to send back
For each test: pass, or what happened and a screenshot. For test 1 step 5 and test 6, the words and controls that confused anyone.
