# Today (the player home) redesign

No new screen and no new navigation: the existing Today, Shoot, Train and Me tabs were audited and Today was rebuilt in place. Counting, workouts, plans, Film Room, benchmarks, saved shot data and the frozen baseline are untouched (55 strict files byte-identical).

## 1. Audit: what was there

| Screen | Problem found |
|---|---|
| Today | A week strip, one next-up card (good), then two quick tiles that repeated the Shoot and Train tabs. The only shooting number was a season percentage inside a tile. Nothing answered "how many shots", "am I getting better" or "what should I practise" |
| Me | A "Shots tracked" tile that counted only tracked drills while Today and Shoot counted all shots: **two different numbers under one name** |
| Shoot | Season only; no way to arrive from a date range or a week |
| Progress | A third "Shots tracked" meaning; a 7-day view did not exist; a benchmark's Film Room lesson was not on its history page |
| Wording | Big buttons said "Start Session" or "Start Today's Session" |

## 2. The information hierarchy (top to bottom, one idea each)

1. **Welcome**: "Good afternoon, Jake", one plain line about the week, seven day dots.
2. **The one thing to do**: the existing next-up card (resume a set, finish a workout, today's plan day, a combine retest, or "Start shooting"). Button words are now "Start Today's Workout" and "Continue Training".
3. **Your shooting** with a range (7 days, 4 weeks, Season): **Shots taken, Shots made, Shooting %**, then the plain sentence ("You made 193 out of 320 shots in the last 4 weeks."), then **Am I getting better?**, then eight weekly bars, then the look-back line. "How are these counted?" is one tap down.
4. **One focus**: only if there is one (see 4 below).
5. **Recent**: the newest five workouts and free sets.
6. **Progress and analytics**: one row to the deep screen.

## 3. What each number and interaction does

| Thing | What it means | Where a tap goes |
|---|---|---|
| Shots taken / made | every shot counted in a saved set, camera or taps, free shooting or drill (one source for Today, Shoot and Me) | Shoot tab, same range, then a set, then its shots and replay |
| Shooting % | made divided by taken, shown the same way as the Shoot tab (66.7%) | Progress, Shooting, by kind of shot, then a drill, results, shots |
| Range chips | 7 days, 4 weeks, Season | the same range is carried into every link below it |
| A weekly bar | shots that week; the number above is the percent made (only with 10 or more shots) | that week's sets on the Shoot tab (from and to) |
| Am I getting better? | answered **only from the benchmarks** (same test, same way, same strict rule as Progress): Yes / Maybe / went down / no clear change / a starting point / not enough yet | that benchmark's history, then comparable runs, then its Film Room lesson |
| Focus | a benchmark that clearly went down (with its lesson), else the next benchmark due, else the Film Room lesson the app already picks; nothing otherwise | Train, the lesson, or the benchmark history |
| Recent row | a workout or a set | that workout, or that set (Back returns to Today with the range) |

Chain checks: Shots taken to Shoot to a set to its shots; Shooting % to by skill to drill to results to shots; the benchmark answer to its history to the lesson. Every link was checked (25 links, none dead) and the range survives each hop.

## 4. Honesty rules (all tested)

- More shots is called more work, in the sentence under the numbers and in "How are these counted?".
- The percentage is never called improvement. The look-back line says "That is 11 points higher (you may have shot different drills)". Only a benchmark that clearly moved says "Yes", and it adds "It is practice, not a game". "Maybe" is used where Progress says Possible.
- Fewer than 10 shots: "Only 6 shots so far, so the percentage is early."
- How shots were counted (camera, taps, older sets) is stated; a call changed after saving is part of the saved total.
- A new player sees a welcome and "Start shooting", not a wall of zeros, a dash instead of a percentage, and no "am I getting better" question.
- Nothing is invented: no drill or lesson appears that is not in the app, and a skill is only named when a test of it clearly moved.

## 5. Other changes made so the four tabs agree

- **Shoot**: honours `range=` and `from=&to=` (from Today or Progress), shows range chips, keeps the range on every link and on each set's Back link, adds "You made X out of Y shots". With no range it shows the season exactly as before. The set-up card's season averages still use the season.
- **Me**: "Shots taken" now uses the same source as Today.
- **Progress**: adds a 7-day range, calls its tile "Drill shots" (tracked drills only, said so), and shows a benchmark's Film Room lesson on its page.
- Today's loading screen now matches its new shape.

## 6. Tests

| Check | Result |
|---|---|
| App tests | 330 pass (311 before; new: home 13, shoot-range 6). Harness 47 and experiments 101 pass. Lint, types and production build clean |
| Browser, iPhone size, 6 scenarios (new player, one thin set, active plan with a month of shooting, benchmark clearly up, benchmark clearly down, 900 sets with 300 benchmark results) | pass |
| The ten-second questions on the first screen (844 px) | the big button (bottom at 434 px), all three numbers (bottom at 615 px) and the start of "Am I getting better?" (769 px). **"What should I practise next?" is below the first screen** (focus card at about 1287 px): one short scroll |
| Numbers worked out by hand from the test sets | 320 / 193 / 60.3% (4 weeks); 140 / 91 / 65% (7 days); 405 / 235 (season); 4 of 6 = 66.7% |
| Accessibility (axe-core WCAG A and AA) | no violations on Today, new player. Fixed: weekly bar and tile names did not contain their visible text |
| Touch targets | all at least 40 px; no sideways scrolling |
| Large history, CPU slowed 4x | 245 elements; changing the range 0.8 to 1.1 s on a development server |
| Earlier suites rerun (shot review and Progress, phone question and accessibility) | pass |
| Live database | the new queries (shot sets with source, film lessons with drill link, benchmark drills by name) are accepted by the live API (read only) |

## 7. Not done, and not measured

- **Not seen on a real signed-in session or an iPhone.** Today, Shoot, Me and Progress were built, type-checked and exercised through a test page that renders the same components with test data; the signed-in server pages were not opened.
- **Home performance with the real database is not measured.** It now also reads the player's tracked drill results (up to 2,000 rows; Me already did) and three benchmark drills, before it can draw. If it feels slow on the phone, the fix is to show the welcome and the next-up card first and stream the rest.
- The Train tab was audited and left unchanged; its look was not brought into line beyond the shared button words.
- Charts are plain bars with numbers, not smoothed lines, on purpose.
- "Strongest skill" is still not ranked (different drills are different difficulty).
- Two earlier open items remain: the two "next" signals in Progress (tile and card) and a workout result whose shot set was deleted.

## 8. iPhone checks

See Test 8 in `../analytics-audit/IPHONE-TESTS.md`.
