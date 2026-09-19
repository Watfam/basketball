# Hardwood Lab

A player & coach development app, originally inspired by the ideas in
*THE OFFSEASON — Road to Point Guard* (curated workouts, film study,
player cards, assessments, progress tracking) plus a coach-side
practice/scheme toolkit — now grown beyond just an offseason plan into
year-round player and team development. Next.js + Supabase + Vercel.

## Architecture

- **Framework:** Next.js 16 (App Router, TypeScript, Tailwind CSS 4).
- **Backend:** Supabase — Postgres, Auth, Storage — **the same Supabase
  project Cardlocity uses.** This app's tables all live in a dedicated
  `hoops` Postgres schema (see `supabase/schema.sql`), so nothing here
  can collide with Cardlocity's tables. Auth is shared at the project
  level (one login can be used across both apps) — that was a deliberate
  choice, not an accident of reuse.
- **Hosting:** Vercel.
- **Data model shape:** structured columns for things you'll query/filter
  on (position, team, dates), JSONB for things that should be free to grow
  without a migration every time (player-type signals, assessment
  answers, session metrics, practice-plan blocks). See the comments in
  `supabase/schema.sql` for the reasoning table-by-table.

### Core concepts

| Concept | Table(s) | Notes |
|---|---|---|
| Parent/guardian account | `auth.users` (shared) + `households` | One login owns a household; kids are **profiles**, not separate accounts (COPPA-friendly, Netflix-style). |
| Player profile | `players` | `player_type` is a JSONB bag of signals (ratings, style tags, physical traits) — deliberately not a single "position" field. |
| Onboarding | `assessments` | Quiz answers in, computed player-type snapshot out; also used for periodic re-assessment. |
| Curated workouts | `drills`, `workouts`, `workout_drills` | Tag-matched against `player_type` / position / focus areas rather than hardcoded branching logic. |
| Film study | `film_resources` | YouTube links only, tagged by trainer (Micah Lancaster, Reid Ouse, etc.), skill, and position — no rehosted video. |
| Progress tracking | `workout_sessions`, `session_logs` | `session_logs.metrics` is open-ended JSONB — reps, makes/attempts, effort, sensor data, notes. Built to never be the limiting factor. |
| Team & coach | `teams`, `team_members` | Coach role is separate from household ownership, so this can expand to teammates' families without merging accounts. |
| Scheme selection | `teams.offensive_scheme` / `defensive_scheme` | Fixed taxonomy (`src/lib/basketball/taxonomy.ts`, includes Run and Jump) + `custom` escape hatch stored in a `_custom` text column. |
| Practice plans | `practice_plans` | Ordered JSONB `blocks` array so a plan can mix drills and free text. |
| Game plans / scouting | `game_plans`, `scouting_notes` | **Phase 2 placeholder tables only** — schema exists so the concept isn't lost, no UI ships against them yet. `game_plans.is_placeholder` defaults true. |

## Phase 1 MVP scope

- Auth + household/parent onboarding.
- Add player profile(s) under a household.
- Player onboarding assessment → Player Card reveal.
- Curated workout feed per player (tag-matched).
- Session logging (start/complete a workout, log per-drill metrics).
- Film study library (curated links, filterable by trainer/skill/position).
- Team creation, scheme selection (fixed list + custom), focus areas.
- Basic practice plan builder for a team.

## Explicitly deferred (Phase 2+)

- Game plan building/modification (placeholder table only).
- Scouting notes beyond the user's own team.
- Freeform/custom coach scheme builder beyond the simple custom-text escape hatch.
- Device sensor integration beyond simple tap-to-log + haptic confirmation
  (true AI pose-estimation/form analysis is a much larger lift).
- Native app / full PWA packaging (needed eventually for haptics on iOS —
  the Web Vibration API doesn't work in iOS Safari at all).

## Getting started (reusing the Cardlocity Supabase project)

1. **Create the schema.** In the Supabase dashboard for the Cardlocity
   project, open the SQL Editor and run `supabase/schema.sql` from this
   repo. This creates the `hoops` schema and all tables — it does not
   touch any existing Cardlocity tables.
2. **Expose the schema to the API.** Project Settings → API → "Exposed
   schemas" → add `hoops` alongside `public`. Without this step the app's
   Supabase client calls will 404.
3. **Get your API keys.** Project Settings → API → copy the Project URL
   and the `anon` public key.
4. **Configure the app.** `cp .env.local.example .env.local` and paste in
   the URL/key from step 3.
5. **Install and run locally.**
   ```bash
   npm install
   npm run dev
   ```
   Visit http://localhost:3000.
6. **Deploy to Vercel.** Import this repo in Vercel, add the same two
   environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in the Vercel project settings, deploy.
7. **(Optional) Generate real TypeScript types** once the schema is
   applied, replacing the placeholder in `src/lib/supabase/types.ts`:
   ```bash
   npx supabase gen types typescript --project-id <your-project-ref> \
     --schema hoops > src/lib/supabase/types.ts
   ```

## Project structure

```
src/
  app/                    Next.js App Router pages
  lib/
    supabase/
      client.ts           Browser Supabase client
      server.ts           Server Component / Route Handler Supabase client
      middleware.ts        Session refresh + route protection
      types.ts             Generated (or placeholder) DB types
    basketball/
      taxonomy.ts          Fixed scheme/focus-area/position option lists
supabase/
  schema.sql               Full hoops schema + RLS policies
middleware.ts               Wires up Supabase session refresh
```

---

*Below is the original `create-next-app` boilerplate reference, kept for
Next.js command reference.*

## Next.js reference

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. Edit `src/app/page.tsx` to change the home page.

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
- [Deploy on Vercel](https://nextjs.org/docs/app/building-your-application/deploying)
