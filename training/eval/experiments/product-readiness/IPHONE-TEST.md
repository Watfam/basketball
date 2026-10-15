# iPhone test: exact steps (camera-free, about 10 minutes)

No camera, no shooting, no new footage. You will put the replay sample on your iPhone, run one button, and send me one block of text.
Nothing here needs developer tools. Nothing leaves your phone except the text you choose to paste to me.

**Version to test:** the 7-character version I give you in the chat message (the page shows it; it must match).
**App address:** https://basketball-weld.vercel.app (your production site; Vercel rebuilds it automatically when I push).

## Part 1. Get the file onto the iPhone (do this first, on the Mac)

The sample is a file called **`hardwood-lab-replay-sample.json`** (254 KB). It holds real shot paths made from your existing recordings: numbers only, no video,
no pictures, no names. It is already copied to your **Mac Desktop**. (The original is in
`/Users/WatfordFamily/Desktop/basketball-app/training/work/phone-replay/`; it lives only on the Mac and is not on GitHub or Vercel, which is why it has to be moved by hand.)

**Option A: AirDrop (easiest)**
1. On the iPhone: unlock it, and turn on Wi-Fi and Bluetooth.
2. On the Mac: click the desktop, find `hardwood-lab-replay-sample.json`, **right-click it, choose Share, then AirDrop**, and pick your iPhone.
   (If your iPhone is not listed: on the iPhone open Control Center, press and hold the Wi-Fi tile, tap AirDrop, choose **Everyone for 10 Minutes**.)
3. On the iPhone, tap **Accept**. When it asks where to save, choose **Save to Files**, then **On My iPhone** (or **iCloud Drive**), and tap **Save**.

**Option B: iCloud Drive (if AirDrop will not cooperate)**
1. On the Mac: Finder, click **iCloud Drive** in the sidebar, drag `hardwood-lab-replay-sample.json` into it.
2. On the iPhone: open the **Files** app, tap **iCloud Drive**; the file appears within a minute.

**Option C: email it to yourself**, open the email on the iPhone, press and hold the attachment, choose **Save to Files**.
(Use A or B first: some mail apps can alter files, and the app will refuse an altered file with a clear message.)

## Part 2. Open the correct version of the app on the iPhone

1. Open **Safari** and go to **https://basketball-weld.vercel.app**. (Safari is simplest for this test. If you normally use the Home Screen app you can use it instead; the steps are the same, but it has no address bar.)
2. Sign in with your own account if asked. (I never see or need your password.)
3. Tap the **Coach** row on the home screen.
4. On the Coach page, find the three small buttons **Calibrate · Detector · History** and tap **History**. It opens the page titled **Camera lab**.
5. On Camera lab, tap **Session review (beta)**.
   *(Shortcut in Safari: go straight to **https://basketball-weld.vercel.app/lab/session-review**.)*
6. At the top you should see a box **"Which version is this?"** with **Version xxxxxxx**.
   - If it shows a different version: wait two minutes (the site is still rebuilding), then close the page and reopen it. In the Home Screen app, swipe the app away in the app switcher and open it again. Do not continue until it matches.

You do **not** need to turn on any switches for this test. (The switches are in the box under the version box, called "Shot review and history"; leave them off.)

## Part 3. Import the sample (page section **"Step 1 · the replay sample"**)

1. Scroll to **Step 1 · the replay sample**. It says "No sample on this phone yet."
2. Tap **Import the sample file…**. A menu appears from the bottom: tap **Choose Files** (not Photo Library, not Take Photo).
3. In the file picker, go to where you saved it (**On My iPhone** or **iCloud Drive**, or **Recents**) and tap `hardwood-lab-replay-sample.json`.
4. The page says: **"hardwood-lab-replay-sample.json has 8 sets: 8 new."** Nothing has been saved yet. Tap **Import 8 sets**.
5. It says: **"Added 8 sample sets (168 shots) in the separate sample area. Nothing else on this phone was changed."** and the line above shows "Sample on this phone: 8 sets, 168 shots."

What this does: the sample goes into its own **sample** area, separate from any player's history. It cannot appear in a player's lists or patterns, and deleting one of your sessions cannot touch it. If you have shot paths of your own already, they stay exactly as they were (this is tested; section "Confirmation" below).

Optional, two minutes, and useful: tap **Browse the sample** to look at the real paths in the new Shot history screen (tap a set, tap a shot, tap Play), then **Done**. Tap **Preview "Review your shots" (made-up shots)** to try the screen you will see after a camera set; **Done** to leave. Tell me anything that looks wrong, feels slow, or is hard to tap.

## Part 4. Run the tests (section **"Step 2 · run the camera-free tests"**)

1. Scroll down to **Step 2**. Keep the screen on and stay on the page.
2. Tap **Run all camera-free tests**. Messages scroll by under the button ("Reading everything saved", "Drawing every saved path", …). It takes under a minute on most phones.
3. It is finished when a table appears under **"Quick speed check (made-up data)"** and the text **"Whole check: … s"** appears.

## Part 5. Look at the results

Scroll to the two tables. Each row says **pass**, **fail** or **not measured**.

**Replay table** (rows start "Replayed data:"): all rows should say **pass** except one: **"saved video clips decode and draw" = not measured** (expected; clips are kept only until a set is saved, so none exist).
The top line should read **"Real saved data: 8 sets, 168 shots, …"** (more if you have your own saved paths). If it says **"Made-up data"**, the sample was not imported; go back to Part 3.

**Quick speed check table** (made-up data): rows should pass except possibly **"Browser storage marked persistent"**, which may say **fail** in a Safari tab. That is not a bug: Safari may refuse to promise to keep a website's storage. Adding the app to your Home Screen helps; I will tell you what to do about it from the results. Any **other** fail is exactly what I need to see.

Neither table says anything about the live camera. Both say so.

## Part 6. Send me the report

1. Under **"Step 3 · send me the results"**, tap **Copy full report**. The button changes to **Copied**.
2. Open **Messages** (or **Notes**), press and hold in the text field, tap **Paste**, and send it to yourself or paste it straight into our chat with me.
   (It is about 200 lines of text. That is normal.)
3. If **Copy** does nothing: press and hold inside the grey text box below the button, tap **Select All**, then **Copy**, and paste as above.

The report contains: the version, your phone's browser string, the results of each check, and the sizes and timings. It does **not** contain any shot path, name, player, picture or video.

## Part 7. Clean up (optional)

Scroll back to **Step 1** and tap **Remove the sample** (confirm). It says "Removed 8 sample sets. Nothing else was touched." Your own data is unaffected.

## If something goes wrong

| What you see | What to do |
|---|---|
| The page asks you to sign in again | Sign in; it will bring you back |
| The version does not match | Wait 2 minutes, close and reopen (Part 2, step 6) |
| The file is greyed out in the picker | Make sure it is saved as `…json` (not `.txt`); try Option B |
| "That file could not be read" or "This is not a Hardwood Lab shot-paths file" | The file was not copied correctly; AirDrop it again |
| "This file has been changed or cut short" | The file was altered in transit (often by email); use AirDrop or iCloud Drive |
| "The replay test stopped: …" | Copy that sentence and send it to me; try once more |
| Nothing happens when you tap Run | Scroll up: another test may still be running; wait for "Whole check" |
| The phone feels slow or hot | Stop, tell me roughly what you did |

## Confirmation: the sample does not alter existing history

Checked three ways, all in git:
1. `src/lib/review/sample-replay.test.ts`: a phone with a player's saved history, plus a sample whose sets start at the **same instants** as two of the player's sets. After import every pre-existing row is **byte-identical**; the sample sits under its own player name; importing again changes nothing; deleting a player's session by start time cannot match a sample set; removing the sample returns the store to exactly how it was. The same invariants are run on the **real sample file** (8 sets, 168 shots) when it is present.
2. `training/eval/experiments/product-readiness/sample-import-e2e.mjs` (27 checks, real browser storage, the real file): existing history byte-identical after import, after a second import, after the whole test run, and after removal.
3. These are desktop browser checks at an iPhone-sized viewport. **They are not an iPhone result.** Your iPhone run is the real check.
