# Shoot setup: start first (layout A)

The setup card on the Shoot tab was five questions at equal weight with Start below the fold. It is now one card that says what Start will do, three rows to change something, and Start right under them. Counting, the camera, goals and what is saved when a set starts are unchanged: the hub's own `start()` is called exactly as before.

## What it does

- **The card**: "Go again" (the drill used last) or "Your setup" (once something was changed), the drill name, then "Camera · 50 shots · last 6 sets 53%".
- **Three rows**: What you are shooting, How to count (hidden if the camera is switched off on the phone), Goal. Each opens a bottom sheet with a plain list. **Choosing does not close the sheet**: the tick moves and the card behind it updates at once, so a player can pick, look and change their mind. The sheet closes by **swiping it down**, or with Done, a tap on the dimmed area, or Escape. The goal sheet also has an amount (chips, minus and plus).
- **One selection style in every list**: orange tint, orange text, a check. Options with an explanation show it as a second line.
- **The drill sheet** also lists the other recent setups (drill and goal together, so the old "go again" shortcuts are kept), each drill's last-sets percentage, "No name", and "Or name your own".
- **A new player** has no last drill, so the card is replaced by "What are you shooting?" with the drills as wrapped buttons. Tapping one puts it on the card. No sideways scrolling anywhere.
- **Sheets** are drawn on the page itself (not inside the setup's layout), close on Escape or a tap outside, give focus back to the row that opened them, and have 44 px rows.

## Tested (iPhone size, real hub on Chrome's fake camera)

65 browser checks pass: go again; each picker (choosing leaves it open); the swipe (follows the finger, springs back, a flick, from the list, not when the list is scrolled, pulling up, tap outside, Escape, Done, reduce motion); a recent setup applying drill and goal together; the + button; Escape and focus; "No goal"; naming your own; Start saving the chosen drill, goal and counting method, and opening the camera; a new player; camera switched off; light and dark; accessibility (no violations, sheets open and closed); tap targets at least 40 px; no sideways scrolling.

Found and fixed while testing: the sheet stopped 24 px short of the screen bottom and showed the tab bar through it (its parent spaced its children and shifted a full-screen layer); fixed by drawing sheets on the page. The Sound check button was 36 px tall (now 44).

## Smoothness (headless Chrome at iPhone size, development server)

| | opening | while pulling |
|---|---|---|
| normal CPU | 27 frames, average 17 ms, worst 50 ms | 31 frames, average 16 ms, worst 17 ms |
| CPU slowed 4x | 19 frames, average 24 ms, worst 183 ms | 31 frames, average 16 ms, worst 17 ms |

Pulling stays at about 60 frames per second even on a slowed CPU. The first frame of opening has one hitch (the sheet is built on the tap); it is larger on a development server than it will be in the shipped build, but I have not measured it on a phone.

## Unchanged on purpose

- A new player's counting method is still "Tap counter" until they choose the camera (as before). The mockups showed Camera preselected; the app never did that for a player who had not chosen it. Making Camera the default for new players is a separate decision.
- Start is not pinned to the bottom of the screen: the card is short, so Start sits directly under the rows. It pins above the tab bar if the setup is ever taller than the screen.

## Not seen on a real iPhone

Sheet feel, the keyboard for "name your own", and safe-area spacing on a phone with a home indicator.
