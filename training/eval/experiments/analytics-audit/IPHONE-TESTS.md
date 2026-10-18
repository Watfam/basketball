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

## Test 7: Aiming and re-aiming (10 min, camera)
1. Open the camera in landscape. Without touching the picture, tap Start. It should say to touch the rim first (not just sit there).
2. Touch the front of the rim and lift. The ring should be where your finger was. If it is higher or lower, take a screenshot straight away and tell me which way and how far (about a finger width?).
3. Press Start. For three seconds a ring says "Counting here": is it on the rim?
4. Shoot a few. Three dots menu, "Pause and re-aim the camera". The score should say how many shots are kept. Move the phone to another spot, touch the rim, press Resume counting. Shoot a few more. Do both groups of shots count?
5. Turn the phone from upright to sideways while aiming, then tap the rim, then Start.
6. End the set. In Progress the set should appear as one set.

## Test 8: Today (10 min, signed in, no camera needed)
1. Open the app. Within about 10 seconds, can a player say: what to do today, how many shots, how many made, the percent, whether they are getting better, and what to practise next? Hand it to a child and time them. Write down which they could not find.
2. The big button should say "Start Today's Workout" (or "Continue Training" if one is unfinished). Press it only if you want to start the workout.
3. Compare the three numbers with the Shoot tab (Season) and Me (Progress tiles). Same shots, same percent?
4. Tap 7 days, 4 weeks, Season. Do the numbers change and does the sentence match?
5. Tap Shots taken, then a set, then Back, Back. You should land on Today with the same range. Tap Shooting %, then a kind of shot, a drill, a result, Back each time.
6. Tap a weekly bar: it should show that week's sets on the Shoot tab.
7. Open "How are these counted?". Does it make sense to a child?
8. How fast does Today appear after opening the app, and after switching tabs? Tell me if you wait more than two seconds.
9. Read "Am I getting better?" and the focus card out loud. Anything that sounds like proof you got better when it is only more shooting?

## Test 9: The new Shoot setup (5 min)
1. Open Shoot. You should see one card ("Go again" and your last drill), three rows, and Start right below them, without scrolling.
2. Tap each row: the drill, how to count, the goal. Choose something in each. The sheet should stay open and the card behind it should change. Then swipe the sheet down: does it follow your finger smoothly, slide away when you let go past about a third of the way (or flick it), and spring back if you let go early? Also try Done and tapping the dim area.
3. Tap Start. The camera (or the tap counter) should open for the drill and goal you chose.
4. Name your own drill: does the keyboard cover the field or the Use button?
5. Sign in as (or switch to) a profile that has never shot: you should see "What are you shooting?" with the drills as buttons.
6. Anything that makes you hesitate or tap the wrong thing?

## Test 10: Pickers that open like Shoot setup (5 min, signed in)
1. Progress: "How far back" is now one row. Tap it: the five ranges plus "Or pick dates". Choosing a range closes the sheet and the page changes. Swipe it down to close without choosing.
2. Shoot, Sessions: the same "How far back" row, and a "Drill" row (all your drills in one list, no sideways scrolling).
3. Tap-counting a set (camera off): the Spot row. Choosing a spot keeps the sheet open with a tick; Done or a swipe closes it, and the row shows your spot.

## Test 7 addendum: the touch check (if a tap still lands in the wrong place)
In the camera aiming screen, press and hold the grey "Aim at the rim" tag at the top left for about a second. A black box appears with numbers, and a red dot shows where the phone says your finger is. Touch the Start button and take a screenshot (the dot is part of the page, so it shows). Tell me whether the red dot is on your finger or somewhere else, and send the screenshot.

## Test 11: Resume, and aiming after turning the phone (5 min)
1. Start a set, shoot a few, leave the app (or go to another tab) without ending it. Open Shoot from the bottom bar: you should see the choices with a card "A set is still open" (its score, "Resume this set", "Throw it away"). Resume goes back into the counter. Pressing Start on a new set instead asks before throwing the open one away.
2. Today shows "Pick it up" for an open set with shots: that button goes straight back in, no card.
3. Open the camera upright, turn the phone sideways, touch the picture: the ring should be under your finger, and Start should start counting. (This was the bug: it was off by about 60 px when the phone was turned after the page opened.)

## Test 12: Aiming at the top of the picture after turning the phone
1. Open the camera upright, turn the phone sideways, and aim: touch the picture and slide. The ring should follow the finger. If the phone's touch position is off (as after turning), the ring moves by how far you slide instead of jumping to the touch, so you can always slide it to the very top. Try aiming at the top edge of the picture.
2. If anything is still off: hold the grey tag, then tap the top, middle and bottom of the picture and screenshot the box (it now lists each tap's numbers in a row).

## Test 13: Picking shots in Watch a shot / Compare
Open a set with many shots, scroll the row of shots sideways, pick one: the row should stay where you scrolled it, with the picked shot in view. "Shot ›" / "‹ Shot" should keep the new shot in view too.

## Test 12 (replaces the earlier version): aiming after turning the phone
1. Open the camera upright, turn the phone sideways, and aim near the top, the middle and low on the picture. The ring should be under your finger. Then press the grey "Aim at the rim" tag for a second (it should open the touch check) and press Start (it should start counting).
2. The phone can be left with the page scrolled up by 59 (the touch check shows "scroll -59"): the screen is then drawn 59 higher than it answers touches. The app now puts the page back to 0 whenever it moves, and works out where a touch is from the finger's position, not from where the page says the picture is.
3. If it is still off: hold TWO fingers on the picture for a second to open the touch check (the tag may not be reachable), tap a few places and screenshot it. The red dot is the browser's idea of your finger: tell me whether it is under your finger.

## Test 14: Train, the libraries and the builder (10 min)
Before this test: the builder can show its screens without the database update, but saving needs migration 0027 applied (see the report). Until then Save says so and loses nothing.
1. Train: "Next up" on top, then two doors with counts (Workouts, Film room), then "Build your own". Can you tell how much there is without scrolling a long page?
2. Workouts door: tap Skill, Any time, Any level. Choose something; the sheet closes and the line says "Showing N of M". Do the numbers in the sheets make sense (they count what each choice would show)? Clear returns to everything. Tap a workout row: it opens in place with Start.
3. Film room door: it opens on the Library tab. Type a pro's or trainer's name, then try Skill, Kind and Who. Clear returns to the sections. Study sessions is still its own tab.
4. Build your own: pick 15, 30, 45 and 60 minutes and different skills; the draft should fit the time ("28 of 30 min"). Tap a drill: change sets and reps, swap it, remove it. Move drills with the arrows. Add a drill from the list (search it). Rename the workout.
5. Save: you go back to Train with "Saved ..." and the workout under Your workouts. Start it from there, then Edit it and change something. Save and start goes straight into the workout.
6. Delete a built workout (Edit, then Delete this workout): sessions you already did with it stay in history.
7. Build another workout and press Start now (not Save). Do a drill or two and finish: the finished screen should say "Worth keeping?" with Save this workout. Press it, then look under Your workouts on Train. Build one more, Start now, leave without doing anything: it should not show up anywhere.

## Test 15: Take a drill name off the list
Shoot, tap the drill row, and find a name you made yourself (like Random): it has a ✕ on the right (the built-in names do not). Tap it: it says how many saved sets carry that name and that they will show as "No name", and that no shots are deleted. Remove it: the name leaves the list (and the recent setups), and the History and drill filters show those sets as No name. Keep it leaves everything as it was.
