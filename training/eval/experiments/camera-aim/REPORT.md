# Rim aiming and pause-and-re-aim

Reported by Matt: turning the phone to landscape and tapping Start seemed to be taken as a rim touch, and the aim landed higher than the touch. Plus a request: pause, move, aim again, carry on.

## What I could and could not reproduce

Tested in headless Chrome at landscape and portrait iPhone sizes with the real aiming components and a drawn picture (`demo-pages/aim-stub.tsx.txt`), and with the real camera hook, the real ball model and Chrome's fake camera (`demo-pages/live-hook.tsx.txt`). 22 checks in `aim-e2e.mjs`, all pass.

| Finding | Evidence |
|---|---|
| A touch maps to the picture exactly (worst error 0.1% to 0.2% of the picture, landscape and portrait, and after turning the phone from portrait to landscape) | the mapping was already right in Chrome. **I did not reproduce a ring that lands higher than the touch.** It may be specific to iOS Safari (toolbars, the stream's shape when the phone turns); I cannot test that here |
| In landscape the Start bar sits over the lower third of the picture; a touch on the bar does not reach the picture layer | confirmed |
| **Start was `disabled` until a rim was chosen. A tap on a disabled button does nothing, and the screen kept saying "touch the picture and slide to the rim".** That is what "it thought I was still clicking for the rim" looks like from the player's chair | confirmed: before my change the tap was swallowed and said nothing |
| The magnifier floats 110 px above the finger. With the rim in the top half of a landscape screen it can sit below the finger, and it is easy to read the magnifier's cross as "where it aimed" | by reading the code; not measured |
| A touch the browser never reports lifting could leave the magnifier open | by reading the code; guarded now |

## Changes (the counting algorithm is untouched)

1. **Start never does nothing.** Before a rim is chosen (or while the phone's speed is being checked) it dims, and a tap says why: "Touch the picture on the front of the rim first, then press Start."
2. **A touch that begins on the control bar is never a rim touch** (explicit guard, not just stacking order).
3. **One box for ring, magnifier and touch**, read from the video element itself, so what is drawn and where a touch lands cannot disagree with what is on screen after a layout change.
4. **No stuck magnifier**: released when the page loses focus, the screen locks, aiming ends, or the browser reports the touch lost.
5. **"Counting here"**: for three seconds after counting starts a ring shows exactly where the camera is counting around, so a rim aimed in the wrong place is seen at once instead of after a bad set.
6. **Pause and re-aim** (menu, three dots, "Pause and re-aim the camera"):
   - counting stops; shots still being decided are decided now and kept (as when a set ends); your score and shots stay; the camera picture stays live;
   - the screen says "Paused: 12 of 20 so far", you move the phone, touch the front of the rim, press **Resume counting**; counting restarts with a fresh window and a fresh size check on the new rim;
   - **End set** replaces Cancel set while paused (Cancel would throw the whole set away);
   - the hoop finder is deliberately off during a pause (the phone has not moved yet, so it would find the old spot and restart counting before you could move it);
   - not offered in a timed set (the clock would keep running);
   - the set is noted as re-aimed so saved shot paths from before and after the move are not pooled with sets from one place (it uses the Phase 14 "phone moved" mechanism; no database change).
   It is in the menu, not a one-tap button, so a stray tap cannot pause counting in the middle of shooting.

Alternatives considered: automatic re-find after a move (rejected: unreliable at a new location and would restart counting unprompted); a visible Re-aim button on the counting screen (rejected: one accidental tap stops counting); keeping one camera per spot (more than asked for).

## What stays unverified

On a real iPhone: whether the aim ever lands off the touch; Safari's behavior when the phone turns; pausing and resuming with the real camera and a real ball.
