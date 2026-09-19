# Hardwood Lab — Project Brief

Context for continuing this build in a fresh session. This captures the
*why* behind decisions already in the code — the repo itself only shows
the *what*.

## Origin

Started as "THE OFFSEASON — Road to Point Guard," a basketball training
manual built for the user's son Cameron. That manual's ideas (curated
workouts, film study, player cards, journaling/assessments, training
philosophy) are the inspiration for this app, not something being ported
1:1. The app is now broader than an "offseason plan" — hence the rename
to **Hardwood Lab** — and is meant for year-round player and team
development, not just the offseason.

## Who this is for

- Multi-user from day one: the user's other kids besides Cameron, with
  real potential to expand to teammates and their families later.
- Timeline pressure: kids should be using this soon. Not a multi-month
  build, but more than a weekend — a real, phased build.
- The user is also a coach of a real team (currently running the **Run
  and Jump** defensive scheme), so this serves both a parent role and a
  coach role for the same person.

## Account model (already decided, already built)

- **One login = one household.** A parent/guardian signs up once and
  every kid gets a **player profile** nested under that single household
  — Netflix-profile style. Kids never get separate logins. This was
  chosen deliberately to avoid separate data collection from minors
  (COPPA-conscious) and to fit the real "one parent, several kids" use
  case.
- **Teammates' families are separate households** that join a shared
  **team** — households never merge or share logins across families.
  Teams are the connector across households, not households themselves.
- **Coaches are always also household owners** — there is no
  coach-only account type without a household. A household owner can
  optionally also create/own a team (making them that team's coach).
  This was an explicit simplification decision, not an oversight.
- Auth is intentionally **shared with the Cardlocity project** (same
  Supabase project, reused on purpose) — this app's data lives in an
  isolated `hoops` Postgres schema so it can never collide with
  Cardlocity's tables, but the underlying `auth.users` identity system
  is shared across both apps. This was a knowing trade-off the user
  accepted for simplicity, not something to "fix."

## Player module — the core requirements

- **Player type is a mixture of signals, not one field.** Deliberately
  modeled as a flexible JSONB bag (`players.player_type`) rather than a
  single position column, because a real player profile is built from
  many inputs (ratings, style tags, physical traits) that will keep
  growing. **Post players and point guards need meaningfully different
  content** — this differentiation matters a lot and should show up
  everywhere content is curated (workouts, film, focus areas).
- **Onboarding assessment is both a data-capture tool AND an engagement
  hook.** The user specifically loved this idea — a quiz that culminates
  in a personalized **Player Card reveal** (Whoop-style onboarding →
  dashboard reveal). This is meant to be the moment that hooks a kid in
  the first five minutes, not a boring form. It should get real design
  effort, more than any other screen.
- **Progress tracking: "never limit the design."** The user was explicit
  — always open to more robust tracking ideas, don't constrain the data
  model. `session_logs.metrics` is deliberately wide-open JSONB for this
  reason (reps, makes/attempts, effort, sensor data, notes — anything).
- **Film study** references named trainers **Micah Lancaster** and
  **Reid Ouse** by name, plus professional player film for learning how
  pros play. **YouTube links only — no rehosting or downloading video,
  ever.** No plan for original video content.
- **Device sensors**: the user is genuinely excited to explore this
  ("would be really cool"). Two tiers discussed:
  - Near-term/feasible: motion-sensor tap-to-log rep counting with
    haptic confirmation; camera-based self-recording for side-by-side
    comparison against trainer film.
  - Long-term/deferred: true AI pose-estimation/computer-vision form
    analysis (HomeCourt/Ball19-style) — a much bigger lift, explicitly
    not appropriate for the fast-moving MVP phase.
  - Known platform limit: the Web Vibration API **does not work in iOS
    Safari at all** (Android/Chrome only, or a native/Capacitor-wrapped
    app) — relevant to any haptics work and a future PWA/native decision.

## Coach module

- Offensive/defensive **scheme selection**: fixed taxonomy is fine (the
  user's real team runs **Run and Jump** on defense — this must be one
  of the options), but the user also wondered whether a **freeform/
  custom option** would add value. Decision made: fixed list + a
  `custom` text escape hatch (not a full freeform builder) — see
  `src/lib/basketball/taxonomy.ts`.
- **Team focus-area selection** and **curated practice plans** are
  in-scope for the current phase.
- **Game plan building/modification is explicitly deferred to Phase 2.**
  The user asked to table it but keep at least a placeholder / preserve
  the concept in the design rather than build it now — see the
  `game_plans` table (`is_placeholder` defaults true).
- **Scouting notes**: currently exist only for the user's own team. The
  user is undecided whether to expand this beyond their own team or keep
  it limited — treat as open, don't assume expansion.

## Design direction (decided just before this handoff)

- Visual identity: **bold navy/orange, "Nike-poster" energy** — matches
  the flashier poster design made during the original manual project.
  Exact tokens already chosen:
  - Background `#0a1120`, surface `#10192e`, elevated surface `#16223d`
  - Foreground text `#f4f6fb`, dimmed text `#8fa0bd`
  - Accent orange `#ff6a1a`, orange hover `#ff8140`
  - This is a **fixed dark brand theme**, not a light/dark toggle (like
    Whoop or Nike Training Club always being dark).
- **Explicit non-negotiable from the very first conversation**: this
  should NOT look like "a cheap AI looking design that loses players'
  attention after 1 week." Screen transitions and interactions should
  include haptic responses, meshed views, and immaculate overlays/
  transitions. This is a design bar the whole app is held to, not just
  a nice-to-have for one screen.
- Design inspiration named explicitly by the user: Nike Training Club,
  Whoop, Duolingo, HomeCourt/Ball19, and **Ladder** (a workout app the
  user specifically called out as taking off in fitness).
- Platform: **mobile-first**, but desktop should be comfortable/easier
  for coach-side practice planning and (eventually) game planning, while
  remaining usable on mobile too.

## Immediate next build steps (agreed, not yet built as of this handoff)

1. **Combine household + first player creation into one screen** — "Set
   up your family": one form (household name + first player's
   name/birth year/position), submitted together, household created
   silently. Every player added after that first one uses a simple
   "+ Add a player" button with no household step shown again. (Current
   code has these as two separate components/steps — `
   create-household-form.tsx` and `add-player-form.tsx` — that need
   merging into one flow, at least for first-run.)
2. **Apply the navy/orange design system** using the tokens above across
   the existing login and dashboard screens (currently plain
   Tailwind gray, explicitly acknowledged as a placeholder, not a
   preview of the intended visual quality).
3. **Build the onboarding assessment flow**: multi-step quiz → computed
   `player_type` → **Player Card reveal**. Should launch immediately
   after creating a player (both the first player during signup, and any
   player added later) — this is the engagement hook and deserves the
   most design polish of anything built so far. Consider
   `framer-motion` for step transitions/card reveal, and a small haptics
   helper (Web Vibration API, graceful no-op on iOS) for tap/step/success
   feedback.

## What's already live

- Repo: `Watfam/basketball` on GitHub.
- Deployed on Vercel (reusing existing Vercel account).
- Database: `hoops` Postgres schema inside the existing **Cardlocity**
  Supabase project (see `supabase/schema.sql` for full schema + RLS
  policies) — reused deliberately, not a placeholder to migrate off of.
- Working: email/password sign-up + sign-in, email confirmation via
  Supabase Auth, household creation, adding players, basic dashboard
  listing players. All functional but visually unstyled — a "prove the
  plumbing works" pass, not the final UI.
- App renamed from "THE OFFSEASON" to **Hardwood Lab** throughout (login
  screen, dashboard header, page metadata, README, schema comment,
  package name).

## Explicitly deferred (Phase 2+, don't build yet)

- Game plan building/modification (placeholder table only).
- Scouting notes beyond the user's own team (status undecided).
- A full freeform/custom coach scheme builder (fixed list + custom text
  escape hatch is sufficient for now).
- True AI pose-estimation/computer-vision form analysis via device
  sensors.
- Native app / full PWA packaging (would resolve the iOS haptics gap,
  but not a current priority).
